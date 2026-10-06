**Projeto:** GameLog · **Etapa:** 2 — Catálogo de jogos · **Documento:** SPEC F6 — Gerenciamento de plataforma · **Tarefa:** T2.10
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, RBAC e formato de erro) · F3 (modelo `Platform`, identificação por slug/id e leituras do catálogo)
**Habilita:** F7 (mesmo padrão de taxonomia) e o filtro de plataforma do catálogo (F3)

---

# O que e Por quê

Plataforma é uma das taxonomias do catálogo: é o que permite ao Visitante filtrar jogos por console/ambiente ("PC", "PlayStation 5") e o que qualifica cada jogo no detalhe. A F3 introduziu o modelo `Platform` e as relações N:N, mas as plataformas só existem via seed — não há como o Administrador, única persona com essa permissão (seção 1 da SPEC F1), cadastrar, corrigir ou remover uma plataforma pela aplicação.

Esta SPEC define o **gerenciamento de plataformas**: as leituras públicas que alimentam os filtros do catálogo, o CRUD administrativo (criação, renomeação e exclusão) e as convenções de gestão de taxonomia que as funcionalidades vizinhas (F5 — gênero e F7 — desenvolvedoras) reutilizam. O vínculo de jogos a plataformas é responsabilidade da F4, sobre as relações N:N criadas na F3.

## 1. Modelo de dados e convenções de taxonomia

A F3 criou `Platform` com `id`, `name` e `slug`. Esta funcionalidade acrescenta, por migration:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID | Chave primária; aceito como alternativa ao `slug` nas rotas. |
| `name` | `varchar(60)` | Nome de exibição: `trim` + espaços internos colapsados; 1–60 caracteres; sem caracteres de controle. Único quando normalizado. |
| `name_normalized` | `varchar(60)` único | Forma de comparação de unicidade: minúsculas, sem acentos, `trim` e colapso de espaços. Não é exposto na API. |
| `slug` | `varchar(70)` único | Identificador estável usado em URLs e filtros (`?platform=<slug>`): `^[a-z0-9]+(-[a-z0-9]+)*$`; imutável após a criação. |
| `created_at` / `updated_at` | `timestamptz(3)` | Auditoria básica exibida na administração. |

- A migration faz **backfill** de `name_normalized` para as plataformas existentes (usando a extensão `unaccent`, já criada na migration da F3) antes de tornar a coluna `NOT NULL`.
- O seed de desenvolvimento (`catalog.seed.ts`) passa a gravar `name_normalized`; permanece idempotente e continua encontrando taxonomias pelo `slug`.
- **Convenções reutilizadas por F5 e F7:** nome de exibição único ignorando caixa/acentos, `slug` definido na criação (explícito ou derivado do nome) e imutável depois, leitura pública da taxonomia, escrita exclusiva do `ADMIN` e exclusão bloqueada quando houver vínculos.
- A normalização de nome (`normalizeTaxonomyName`) e a derivação de slug (`deriveSlug`) ficam em **helpers únicos** em `packages/shared`, reutilizados por F5–F7 (backend, frontend e testes) e testados por unidade.

## 2. Regras de negócio

- **RN-F6-01** Leitura pública: qualquer pessoa, sem autenticação, lista e consulta plataformas. Criação, renomeação e exclusão exigem papel `ADMIN` (`requireRole('ADMIN')` da F1): sem token → `401 UNAUTHENTICATED`; `PLAYER` → `403 FORBIDDEN`.
- **RN-F6-02** `name` é normalizado na entrada (`trim` + colapso de espaços internos), validado (1–60 caracteres, sem caracteres de controle) e persistido já normalizado. A comparação de duplicidade ignora caixa e acentos (`name_normalized`).
- **RN-F6-03** `slug` é normalizado (`trim` + minúsculas) e validado contra `^[a-z0-9]+(-[a-z0-9]+)*$` (1–70 caracteres). Na criação pode ser informado ou derivado do nome: remover acentos, minúsculas, converter toda sequência fora de `[a-z0-9]` em hífen, colapsar hífens, remover hífens das pontas e truncar em 70 (sem hífen final). Nome cuja derivação não produz slug (ex.: `"!!!"`) → `400 VALIDATION_ERROR`.
- **RN-F6-04** `slug` é imutável após a criação: o `PATCH` aceita somente `name`; enviar `slug` (ou qualquer campo desconhecido) → `400 VALIDATION_ERROR`. Justificativa: o slug aparece em URLs e filtros compartilháveis — mesma lógica da imutabilidade do `username` (RN-F2-03).
- **RN-F6-05** Duplicidade: `name` normalizado já usado → `409 PLATFORM_NAME_TAKEN`; `slug` já usado → `409 PLATFORM_SLUG_TAKEN`. O próprio registro não conta como conflito na renomeação. A unicidade também é garantida por constraints no banco.
- **RN-F6-06** Criação (`POST`) retorna `201` com o recurso criado e cabeçalho `Location` apontando para o detalhe. Renomeação (`PATCH`) retorna `200` com o recurso atualizado, **preservando** `slug` e `createdAt`; `updatedAt` muda apenas quando o nome realmente muda (envio do mesmo nome é aceito, sem gravação).
- **RN-F6-07** A exclusão (`DELETE`) só é permitida se a plataforma **não estiver vinculada a nenhum jogo**; caso contrário → `409 PLATFORM_IN_USE` (a mensagem informa a quantidade de jogos) e nada é alterado. Vínculos são geridos pela F4; a exclusão não remove vínculos automaticamente.
- **RN-F6-08** `GET /platforms` retorna **todas** as plataformas em `{ "data": [...] }`, ordenadas por nome (collation pt-BR, ignorando caixa), com desempate por `slug`. Não há paginação: o conjunto é pequeno e os filtros do catálogo (F3) precisam da lista completa. Cada item é um `PlatformRef`: `{ id, name, slug, gameCount }`, em que `gameCount` é a quantidade de jogos vinculados (inclui plataformas sem jogos, com `gameCount` 0).
- **RN-F6-09** `GET /platforms/:platform` aceita `slug` ou `id` (mesma convenção de identificação da F3) e retorna `PlatformDetail` = `PlatformRef` + `createdAt` e `updatedAt`; identificador inexistente → `404 NOT_FOUND`.
- **RN-F6-10** A listagem e o detalhe resolvem `gameCount` e as plataformas com um número **constante** de consultas ao banco (sem N+1), mantendo o padrão da F3 (RN-F3-08).
- **RN-F6-11** Dados existentes: o seed continua idempotente (não duplica nem sobrescreve plataformas existentes: busca pelo `slug`) e passa a preencher `name_normalized`; a migration preenche as linhas já existentes antes de aplicar a constraint.
- **RN-F6-12** Erros usam o formato e os códigos genéricos da F1. Novos códigos de domínio, adicionados a `ERROR_CODES` em `packages/shared`: `PLATFORM_NAME_TAKEN`, `PLATFORM_SLUG_TAKEN` e `PLATFORM_IN_USE` — todos `409`.
- **RN-F6-13** Os filtros de plataforma do catálogo passam a ser populados por `GET /platforms` (F3, seção 4). Os gêneros continuam derivados da listagem de jogos até a F5.

## 3. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/platforms` | Público | Lista completa ordenada por nome (sem paginação) |
| GET | `/api/v1/platforms/:platform` | Público | Detalhe por `slug` ou `id`; `404 NOT_FOUND` se não existir |
| POST | `/api/v1/platforms` | `ADMIN` | Corpo `{ name, slug? }` → `201` + `Location` |
| PATCH | `/api/v1/platforms/:platform` | `ADMIN` | Corpo `{ name }` → `200` |
| DELETE | `/api/v1/platforms/:platform` | `ADMIN` | `204`; `409 PLATFORM_IN_USE` se houver jogos vinculados |

Schemas Zod em `packages/shared`, usados pelo backend e pelo frontend:

- `platformNameSchema` e `platformSlugSchema` (normalização e formato das RN-F6-02/03);
- `platformCreateSchema` (`strict`: `{ name, slug? }`) e `platformUpdateSchema` (`strict`: `{ name }` obrigatório);
- `platformRefSchema` (`{ id, name, slug, gameCount }`), `platformDetailSchema` (ref + `createdAt`/`updatedAt`), `platformListSchema` (`{ data: [...] }`) e `platformParamsSchema` (`{ platform }`, sem validação de formato — identificador inexistente responde `404`);
- `PLATFORM_ROUTES` e `platformPath(slug)`.

## 4. Interface (frontend)

- **`/admin/plataformas`** (exclusiva de `ADMIN`) — tela de gestão com:
  - lista/tabela com Nome, Slug e Jogos (`gameCount`), estados de carregamento (esqueleto), vazio ("Nenhuma plataforma cadastrada") e erro com "Tentar novamente";
  - **Nova plataforma**: formulário com Nome (obrigatório) e Slug (opcional), com pré-visualização do slug derivado enquanto se digita; erros por campo vindos da API;
  - **Renomear**: edição apenas do nome; o slug é exibido como somente leitura, com a indicação de que não pode ser alterado;
  - **Excluir**: confirmação informando a quantidade de jogos; se a API responder `409 PLATFORM_IN_USE`, exibe a mensagem e mantém a plataforma na lista;
  - feedback de sucesso nas operações e botões desabilitados durante o envio.
- **Acesso administrativo:** rotas sob `/admin/**` exigem `ADMIN`. Visitante é redirecionado para `/entrar?returnTo=/admin/plataformas`; `PLAYER` autenticado vê a página "Acesso restrito" (403) com caminho de volta à Home. Implementação por um guard reutilizável (ex.: `RequireAdmin`), usado também por F4, F5 e F7.
- **Menu:** item de administração apontando para `/admin/plataformas`, visível apenas para `ADMIN`; a área administrativa completa será consolidada na F15.
- **Catálogo (`/jogos`):** o painel de filtros passa a obter as plataformas de `GET /platforms` (com cache do TanStack Query). O filtro continua usando o `slug` na query string; "limpar filtros", sincronização com a URL e demais comportamentos atuais não mudam.
- **Testes E2E:** como não há cadastro público de administrador (RN-F1-01), a suíte prepara a conta `ADMIN` diretamente no banco de testes e faz login pela interface.

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Leitura pública**
- [ ] **CA-F6-01** [API] `GET /platforms` sem token retorna `200` com `{ data }` de todas as plataformas (incluindo as sem jogos), cada uma com `id`, `name`, `slug` e `gameCount`.
- [ ] **CA-F6-02** [API] A ordem é por nome (collation pt-BR, sem diferenciar caixa) e o desempate é por `slug`; `gameCount` reflete os vínculos (0, 1 e vários jogos).
- [ ] **CA-F6-03** [API] `GET /platforms/:platform` funciona com `slug` e com `id` e retorna `name`, `slug`, `gameCount`, `createdAt` e `updatedAt`; identificador inexistente retorna `404 NOT_FOUND`.
- [ ] **CA-F6-04** [UNIT] O helper de identificação distingue UUID de slug, aceita ambos e nunca trata um slug como UUID.
- [ ] **CA-F6-05** [API] `GET /platforms` e o detalhe executam um número constante de consultas ao banco, independentemente da quantidade de plataformas e de jogos (sem N+1).
- [ ] **CA-F6-06** [UNIT] A normalização de nome e a derivação de slug cobrem acentos, maiúsculas, símbolos (`"Xbox Series X/S"` → `xbox-series-x-s`, `"Série X"` → `serie-x`), colapso de espaços/hífens e truncamento em 70 sem hífen final.

**Autorização**
- [ ] **CA-F6-07** [API] `POST`, `PATCH` e `DELETE` sem token retornam `401 UNAUTHENTICATED`.
- [ ] **CA-F6-08** [API] As mesmas rotas com conta `PLAYER` retornam `403 FORBIDDEN` e não alteram dados; com `ADMIN` funcionam.
- [ ] **CA-F6-09** [E2E] Visitante em `/admin/plataformas` é levado a `/entrar?returnTo=...`; `PLAYER` vê "Acesso restrito" e não a tela de gestão.

**Criação**
- [ ] **CA-F6-10** [API] `POST` apenas com `name` deriva o `slug`, retorna `201` com o recurso criado e `Location`, e a plataforma passa a aparecer na listagem.
- [ ] **CA-F6-11** [API] `POST` com `slug` informado (ex.: `"Retro-Console"` → `retro-console`) respeita o valor em vez de derivá-lo do nome.
- [ ] **CA-F6-12** [API] `name` já usado (mesmo com caixa/acentos diferentes) retorna `409 PLATFORM_NAME_TAKEN`; `slug` já usado retorna `409 PLATFORM_SLUG_TAKEN`.
- [ ] **CA-F6-13** [API] Retornam `400 VALIDATION_ERROR`: `name` vazio/apenas espaços, com mais de 60 caracteres ou com caracteres de controle; `slug` fora do formato ou com mais de 70 caracteres; campo desconhecido; e `name` que não gera slug (ex.: `"!!!"`).
- [ ] **CA-F6-14** [API] O `name` é persistido com `trim` e espaços internos colapsados (`"  Mega   Drive  "` → `"Mega Drive"`).

**Renomeação**
- [ ] **CA-F6-15** [API] `PATCH` com novo `name` retorna `200`, atualiza o nome e `updatedAt` e preserva `slug` e `createdAt`.
- [ ] **CA-F6-16** [API] `PATCH` com o mesmo nome retorna `200` sem alteração efetiva (`updatedAt` inalterado).
- [ ] **CA-F6-17** [API] `PATCH` com nome em conflito retorna `409 PLATFORM_NAME_TAKEN`; com corpo vazio, `slug` ou campo desconhecido retorna `400 VALIDATION_ERROR`; em plataforma inexistente retorna `404 NOT_FOUND`.

**Exclusão**
- [ ] **CA-F6-18** [API] `DELETE` de plataforma sem vínculos retorna `204`; ela some da listagem e o detalhe passa a responder `404`.
- [ ] **CA-F6-19** [API] `DELETE` de plataforma vinculada a jogos retorna `409 PLATFORM_IN_USE`, e nem a plataforma nem os vínculos são alterados.
- [ ] **CA-F6-20** [API] Após os vínculos serem removidos (fixture), a mesma exclusão passa a retornar `204`.

**Dados, migração e seed**
- [ ] **CA-F6-21** [API] A unicidade normalizada vale para as plataformas do seed (criar ou renomear para um nome equivalente, ignorando caixa e acentos, retorna `409 PLATFORM_NAME_TAKEN`) e o seed roda duas vezes sem duplicar nem sobrescrever dados (CA-F3-23 preservado).

**Interface e integração com o catálogo**
- [ ] **CA-F6-22** [E2E] `ADMIN` cria, renomeia e exclui uma plataforma sem vínculos pela interface, com confirmação, feedbacks e estados de carregamento/vazio/erro; o slug derivado é previsualizado e fica somente leitura na renomeação.
- [ ] **CA-F6-23** [E2E] A tentativa de excluir pela interface uma plataforma em uso (ex.: `PC`, do seed) exibe o erro e mantém a plataforma.
- [ ] **CA-F6-24** [E2E] Plataforma criada pela administração aparece nas opções do filtro do catálogo e o filtro continua funcionando via `slug` na URL (jogo sem vínculo → estado vazio).
- [ ] **CA-F6-25** [UNIT] `fetchFilterOptions` passa a usar `GET /platforms` para as plataformas (mockado); os gêneros usam a leitura pública da F5 (`GET /genres`) quando ela já estiver entregue.

---

# Fora do Escopo

- Vínculos jogo↔plataforma e edição das plataformas de um jogo (F4); exibição no detalhe do jogo (F3).
- Gêneros (F5) e desenvolvedoras (F7) — seguem estas convenções em suas próprias SPECs.
- Página pública dedicada a uma plataforma (listar jogos por plataforma).
- Alteração do `slug` após a criação, mesclagem de plataformas duplicadas e apelidos/abreviações.
- Fabricante, geração, data de lançamento do console, logo/imagem e descrição da plataforma.
- Exclusão em massa, importação de fontes externas e reatribuição automática de vínculos ao excluir.
- Auditoria/histórico de alterações, limites de uso administrativo e demais capacidades de administração (F15).
