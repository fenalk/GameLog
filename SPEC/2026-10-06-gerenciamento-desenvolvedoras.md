**Projeto:** GameLog · **Etapa:** 2 — Catálogo de jogos · **Documento:** SPEC F7 — Gerenciamento de desenvolvedoras · **Tarefa:** T2.13
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, RBAC e formato de erro) · F3 (modelo `Developer`, identificação por slug/id e filtro `developer`) · convenções de taxonomia e helpers compartilhados das SPECs F5/F6
**Habilita:** o filtro de desenvolvedora no painel do catálogo (F3)

---

# O que e Por quê

Desenvolvedora é a taxonomia que identifica quem produziu o jogo e é uma das formas de explorar o catálogo (o filtro `developer` já existe na API da F3 e os links do detalhe do jogo apontam para ele). A F3 criou o modelo `Developer` e as relações N:N, mas as desenvolvedoras só existem via seed — o Administrador, única persona com essa permissão (seção 1 da SPEC F1), não consegue cadastrar um estúdio novo nem corrigir um nome pela aplicação.

Esta SPEC define o **gerenciamento de desenvolvedoras**: as leituras públicas que alimentam o filtro do catálogo, o CRUD administrativo (criação, renomeação e exclusão) e a adoção das convenções de taxonomia e dos helpers compartilhados estabelecidos pelas SPECs F5/F6. O vínculo de jogos a desenvolvedoras é responsabilidade da F4, sobre as relações N:N criadas na F3.

## 1. Modelo de dados e convenções

A F3 criou `Developer` com `id`, `name` e `slug`. Esta funcionalidade acrescenta, por migration:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID | Chave primária; aceito como alternativa ao `slug` nas rotas. |
| `name` | `varchar(100)` | Nome de exibição: `trim` + espaços internos colapsados; 1–100 caracteres; sem caracteres de controle. Único quando normalizado. |
| `name_normalized` | `varchar(100)` único | Forma de comparação de unicidade: minúsculas, sem acentos, `trim` e colapso de espaços. Não é exposto na API. |
| `slug` | `varchar(110)` único | Identificador estável usado em URLs e filtros (`?developer=<slug>`): `^[a-z0-9]+(-[a-z0-9]+)*$`; imutável após a criação. |
| `created_at` / `updated_at` | `timestamptz(3)` | Auditoria básica exibida na administração. |

- A migration faz **backfill** de `name_normalized` para as desenvolvedoras existentes (usando a extensão `unaccent`, já criada na migration da F3) antes de tornar a coluna `NOT NULL`.
- O seed de desenvolvimento (`catalog.seed.ts`) passa a gravar `name_normalized`; permanece idempotente e continua encontrando taxonomias pelo `slug`.
- Esta SPEC **adota as convenções de taxonomia das SPECs F5/F6 (seção 1 de cada uma)**: nome de exibição único ignorando caixa/acentos, `slug` definido na criação (explícito ou derivado do nome) e imutável depois, leitura pública, escrita exclusiva do `ADMIN`, exclusão bloqueada quando houver vínculos e reutilização dos helpers `normalizeTaxonomyName`/`deriveSlug` (introduzidos pela F5, conforme a ordem das tarefas).

## 2. Regras de negócio

- **RN-F7-01** Leitura pública: qualquer pessoa, sem autenticação, lista e consulta desenvolvedoras. Criação, renomeação e exclusão exigem papel `ADMIN` (`requireRole('ADMIN')` da F1): sem token → `401 UNAUTHENTICATED`; `PLAYER` → `403 FORBIDDEN`.
- **RN-F7-02** `name` é normalizado na entrada (`trim` + colapso de espaços internos), validado (1–100 caracteres, sem caracteres de controle) e persistido já normalizado. A comparação de duplicidade ignora caixa e acentos (`name_normalized`): `"Órbita Norte"`, `"ÓRBITA NORTE"` e `"Orbita Norte"` são a mesma desenvolvedora.
- **RN-F7-03** `slug` é normalizado (`trim` + minúsculas) e validado contra `^[a-z0-9]+(-[a-z0-9]+)*$` (1–110 caracteres). Na criação pode ser informado ou derivado do nome: remover acentos, minúsculas, converter toda sequência fora de `[a-z0-9]` em hífen, colapsar hífens, remover hífens das pontas e truncar em 110 (sem hífen final). Nome cuja derivação não produz slug (ex.: `"!!!"`) → `400 VALIDATION_ERROR`.
- **RN-F7-04** `slug` é imutável após a criação: o `PATCH` aceita somente `name`; enviar `slug` (ou qualquer campo desconhecido) → `400 VALIDATION_ERROR`. Justificativa: o slug aparece em URLs e filtros compartilháveis — mesma lógica da imutabilidade do `username` (RN-F2-03).
- **RN-F7-05** Duplicidade: `name` normalizado já usado → `409 DEVELOPER_NAME_TAKEN`; `slug` já usado → `409 DEVELOPER_SLUG_TAKEN`. O próprio registro não conta como conflito na renomeação. A unicidade também é garantida por constraints no banco.
- **RN-F7-06** Criação (`POST`) retorna `201` com o recurso criado e cabeçalho `Location` apontando para o detalhe. Renomeação (`PATCH`) retorna `200` com o recurso atualizado, **preservando** `slug` e `createdAt`; `updatedAt` muda apenas quando o nome realmente muda (envio do mesmo nome é aceito, sem gravação).
- **RN-F7-07** A exclusão (`DELETE`) só é permitida se a desenvolvedora **não estiver vinculada a nenhum jogo**; caso contrário → `409 DEVELOPER_IN_USE` (a mensagem informa a quantidade de jogos) e nada é alterado. Vínculos são geridos pela F4; a exclusão não remove vínculos automaticamente.
- **RN-F7-08** `GET /developers` retorna **todas** as desenvolvedoras em `{ "data": [...] }`, ordenadas por nome (collation pt-BR, ignorando caixa), com desempate por `slug`. Não há paginação: o conjunto é gerenciável e o filtro do catálogo precisa da lista completa. Cada item é um `DeveloperRef`: `{ id, name, slug, gameCount }`, em que `gameCount` é a quantidade de jogos vinculados (inclui desenvolvedoras sem jogos, com `gameCount` 0).
- **RN-F7-09** `GET /developers/:developer` aceita `slug` ou `id` (mesma convenção de identificação da F3) e retorna `DeveloperDetail` = `DeveloperRef` + `createdAt` e `updatedAt`; identificador inexistente → `404 NOT_FOUND`.
- **RN-F7-10** A listagem e o detalhe resolvem `gameCount` e as desenvolvedoras com um número **constante** de consultas ao banco (sem N+1), mantendo o padrão da F3 (RN-F3-08).
- **RN-F7-11** Dados existentes: o seed continua idempotente (não duplica nem sobrescreve desenvolvedoras existentes: busca pelo `slug`) e passa a preencher `name_normalized`; a migration preenche as linhas já existentes antes de aplicar a constraint.
- **RN-F7-12** Erros usam o formato e os códigos genéricos da F1. Novos códigos de domínio, adicionados a `ERROR_CODES` em `packages/shared`: `DEVELOPER_NAME_TAKEN`, `DEVELOPER_SLUG_TAKEN` e `DEVELOPER_IN_USE` — todos `409`.
- **RN-F7-13** O painel de filtros do catálogo (F3) ganha a opção **Desenvolvedora**, populada por `GET /developers` (com cache do TanStack Query); o filtro continua usando o `slug` na query string, e os links de desenvolvedora do detalhe do jogo (F3) passam a ter a opção correspondente no painel.

## 3. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/developers` | Público | Lista completa ordenada por nome (sem paginação) |
| GET | `/api/v1/developers/:developer` | Público | Detalhe por `slug` ou `id`; `404 NOT_FOUND` se não existir |
| POST | `/api/v1/developers` | `ADMIN` | Corpo `{ name, slug? }` → `201` + `Location` |
| PATCH | `/api/v1/developers/:developer` | `ADMIN` | Corpo `{ name }` → `200` |
| DELETE | `/api/v1/developers/:developer` | `ADMIN` | `204`; `409 DEVELOPER_IN_USE` se houver jogos vinculados |

Schemas Zod em `packages/shared`, usados pelo backend e pelo frontend:

- `developerNameSchema` e `developerSlugSchema` (normalização e formato das RN-F7-02/03);
- `developerCreateSchema` (`strict`: `{ name, slug? }`) e `developerUpdateSchema` (`strict`: `{ name }` obrigatório);
- `developerRefSchema` (`{ id, name, slug, gameCount }`), `developerDetailSchema` (ref + `createdAt`/`updatedAt`), `developerListSchema` (`{ data: [...] }`) e `developerParamsSchema` (`{ developer }`, sem validação de formato — identificador inexistente responde `404`);
- `DEVELOPER_ROUTES` e `developerPath(slug)`.

## 4. Interface (frontend)

- **`/admin/desenvolvedoras`** (exclusiva de `ADMIN`) — tela de gestão com:
  - lista/tabela com Nome, Slug e Jogos (`gameCount`), estados de carregamento (esqueleto), vazio ("Nenhuma desenvolvedora cadastrada") e erro com "Tentar novamente";
  - **Nova desenvolvedora**: formulário com Nome (obrigatório) e Slug (opcional), com pré-visualização do slug derivado enquanto se digita; erros por campo vindos da API;
  - **Renomear**: edição apenas do nome; o slug é exibido como somente leitura, com a indicação de que não pode ser alterado;
  - **Excluir**: confirmação informando a quantidade de jogos; se a API responder `409 DEVELOPER_IN_USE`, exibe a mensagem e mantém a desenvolvedora na lista;
  - feedback de sucesso nas operações e botões desabilitados durante o envio.
- **Acesso administrativo:** rotas sob `/admin/**` exigem `ADMIN` (guard `RequireAdmin`, reutilizável pelas telas de administração das Etapas 2 e 3). Visitante é redirecionado para `/entrar?returnTo=/admin/desenvolvedoras`; `PLAYER` autenticado vê a página "Acesso restrito" (403) com caminho de volta à Home.
- **Menu:** item de administração apontando para `/admin/desenvolvedoras`, visível apenas para `ADMIN`.
- **Catálogo (`/jogos`):** o painel de filtros ganha o grupo **Desenvolvedora**, populado por `GET /developers`; o filtro usa o `slug` na query string, com o mesmo comportamento de "limpar filtros" e sincronização com a URL.

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Leitura pública**
- [ ] **CA-F7-01** [API] `GET /developers` sem token retorna `200` com `{ data }` de todas as desenvolvedoras (incluindo as sem jogos), cada uma com `id`, `name`, `slug` e `gameCount`.
- [ ] **CA-F7-02** [API] A ordem é por nome (collation pt-BR, sem diferenciar caixa) e o desempate é por `slug`; `gameCount` reflete os vínculos (0, 1 e vários jogos).
- [ ] **CA-F7-03** [API] `GET /developers/:developer` funciona com `slug` e com `id` e retorna `name`, `slug`, `gameCount`, `createdAt` e `updatedAt`; identificador inexistente retorna `404 NOT_FOUND`.
- [ ] **CA-F7-04** [UNIT] O helper de identificação distingue UUID de slug, aceita ambos e nunca trata um slug como UUID.
- [ ] **CA-F7-05** [API] `GET /developers` e o detalhe executam um número constante de consultas ao banco, independentemente da quantidade de desenvolvedoras e de jogos (sem N+1).
- [ ] **CA-F7-06** [UNIT] A normalização de nome e a derivação de slug cobrem acentos, maiúsculas, símbolos (`"Órbita Norte"` → `orbita-norte`, `"Estúdio Vitral"` → `estudio-vitral`, `"Pixel & Cia"` → `pixel-cia`), colapso de espaços/hífens e truncamento em 110 sem hífen final.

**Autorização**
- [ ] **CA-F7-07** [API] `POST`, `PATCH` e `DELETE` sem token retornam `401 UNAUTHENTICATED`.
- [ ] **CA-F7-08** [API] As mesmas rotas com conta `PLAYER` retornam `403 FORBIDDEN` e não alteram dados; com `ADMIN` funcionam.
- [ ] **CA-F7-09** [E2E] Visitante em `/admin/desenvolvedoras` é levado a `/entrar?returnTo=...`; `PLAYER` vê "Acesso restrito" e não a tela de gestão.

**Criação**
- [ ] **CA-F7-10** [API] `POST` apenas com `name` deriva o `slug`, retorna `201` com o recurso criado e `Location`, e a desenvolvedora passa a aparecer na listagem.
- [ ] **CA-F7-11** [API] `POST` com `slug` informado (ex.: `"Studio-Pixel"` → `studio-pixel`) respeita o valor em vez de derivá-lo do nome.
- [ ] **CA-F7-12** [API] `name` equivalente a uma desenvolvedora existente, ignorando caixa e acentos (`"Órbita Norte"`/`"ORBITA NORTE"`/`"Orbita Norte"`), retorna `409 DEVELOPER_NAME_TAKEN`; `slug` já usado retorna `409 DEVELOPER_SLUG_TAKEN`.
- [ ] **CA-F7-13** [API] Retornam `400 VALIDATION_ERROR`: `name` vazio/apenas espaços, com mais de 100 caracteres ou com caracteres de controle; `slug` fora do formato ou com mais de 110 caracteres; campo desconhecido; e `name` cuja derivação não produz slug (ex.: `"!!!"`).
- [ ] **CA-F7-14** [API] O `name` é persistido com `trim` e espaços internos colapsados (`"  Estúdio   Vitral  "` → `"Estúdio Vitral"`).

**Renomeação**
- [ ] **CA-F7-15** [API] `PATCH` com novo `name` retorna `200`, atualiza o nome e `updatedAt` e preserva `slug` e `createdAt`.
- [ ] **CA-F7-16** [API] `PATCH` com o mesmo nome retorna `200` sem alteração efetiva (`updatedAt` inalterado).
- [ ] **CA-F7-17** [API] `PATCH` com nome em conflito retorna `409 DEVELOPER_NAME_TAKEN`; com corpo vazio, `slug` ou campo desconhecido retorna `400 VALIDATION_ERROR`; em desenvolvedora inexistente retorna `404 NOT_FOUND`.

**Exclusão**
- [ ] **CA-F7-18** [API] `DELETE` de desenvolvedora sem vínculos retorna `204`; ela some da listagem e o detalhe passa a responder `404`.
- [ ] **CA-F7-19** [API] `DELETE` de desenvolvedora vinculada a jogos retorna `409 DEVELOPER_IN_USE`, e nem a desenvolvedora nem os vínculos são alterados.
- [ ] **CA-F7-20** [API] Após os vínculos serem removidos (fixture), a mesma exclusão passa a retornar `204`.

**Dados, migração e seed**
- [ ] **CA-F7-21** [API] A unicidade normalizada vale para as desenvolvedoras do seed (criar ou renomear para um nome equivalente, ignorando caixa e acentos, retorna `409 DEVELOPER_NAME_TAKEN`) e o seed roda duas vezes sem duplicar nem sobrescrever dados (CA-F3-23 preservado).

**Interface e integração com o catálogo**
- [ ] **CA-F7-22** [E2E] `ADMIN` cria, renomeia e exclui uma desenvolvedora sem vínculos pela interface, com confirmação, feedbacks e estados de carregamento/vazio/erro; o slug derivado é previsualizado e fica somente leitura na renomeação.
- [ ] **CA-F7-23** [E2E] A tentativa de excluir pela interface uma desenvolvedora em uso (ex.: `Nebulosa Interativa`, do seed) exibe o erro e mantém o registro.
- [ ] **CA-F7-24** [E2E] Desenvolvedora criada pela administração aparece nas opções do filtro do catálogo; o filtro via `slug` na URL funciona (com jogos vinculados via F4 → resultados; sem vínculo → estado vazio).
- [ ] **CA-F7-25** [UNIT] `fetchFilterOptions` passa a usar `GET /developers` para as desenvolvedoras (mockado), sem alterar a origem de gêneros (F5) e plataformas (F6).

---

# Fora do Escopo

- Vínculos jogo↔desenvolvedora e edição das desenvolvedoras de um jogo (F4); exibição no detalhe do jogo (F3).
- Gêneros (F5) e plataformas (F6) — seguem as mesmas convenções em suas próprias SPECs.
- Página pública dedicada a uma desenvolvedora (listar jogos do estúdio).
- Alteração do `slug` após a criação, mesclagem de desenvolvedoras duplicadas e apelidos/nomes anteriores.
- Dados adicionais do estúdio (país, fundação, site, logo/imagem, descrição) e relação matriz/filial.
- Exclusão em massa, importação de fontes externas e reatribuição automática de vínculos ao excluir.
- Auditoria/histórico de alterações, limites de uso administrativo e demais capacidades de administração (F15).
