**Projeto:** GameLog · **Etapa:** 2 — Catálogo de jogos · **Documento:** SPEC F5 — Gerenciamento de gênero · **Tarefa:** T2.07
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, RBAC e formato de erro) · F3 (modelo `Genre`, identificação por slug/id e filtros do catálogo) · convenções de taxonomia da seção 1 da SPEC F6
**Habilita:** F6/F7 (helpers compartilhados de taxonomia) e o filtro de gênero do catálogo (F3)

---

# O que e Por quê

Gênero é a taxonomia que classifica o tipo de jogo ("RPG", "Ação", "Puzzle") e um dos filtros centrais do catálogo. A F3 criou o modelo `Genre` e as relações N:N, mas os gêneros só existem via seed — o Administrador, única persona com essa permissão (seção 1 da SPEC F1), não consegue cadastrar um gênero novo nem corrigir um nome pela aplicação.

Esta SPEC define o **gerenciamento de gêneros**: as leituras públicas que alimentam os filtros do catálogo, o CRUD administrativo (criação, renomeação e exclusão) e a adoção das convenções de taxonomia estabelecidas na SPEC F6. O vínculo de jogos a gêneros é responsabilidade da F4, sobre as relações N:N criadas na F3.

## 1. Modelo de dados e convenções

A F3 criou `Genre` com `id`, `name` e `slug`. Esta funcionalidade acrescenta, por migration:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID | Chave primária; aceito como alternativa ao `slug` nas rotas. |
| `name` | `varchar(50)` | Nome de exibição: `trim` + espaços internos colapsados; 1–50 caracteres; sem caracteres de controle. Único quando normalizado. |
| `name_normalized` | `varchar(50)` único | Forma de comparação de unicidade: minúsculas, sem acentos, `trim` e colapso de espaços. Não é exposto na API. |
| `slug` | `varchar(60)` único | Identificador estável usado em URLs e filtros (`?genre=<slug>`): `^[a-z0-9]+(-[a-z0-9]+)*$`; imutável após a criação. |
| `created_at` / `updated_at` | `timestamptz(3)` | Auditoria básica exibida na administração. |

- A migration faz **backfill** de `name_normalized` para os gêneros existentes (usando a extensão `unaccent`, já criada na migration da F3) antes de tornar a coluna `NOT NULL`.
- O seed de desenvolvimento (`catalog.seed.ts`) passa a gravar `name_normalized`; permanece idempotente e continua encontrando taxonomias pelo `slug`.
- Esta SPEC **adota as convenções de taxonomia da SPEC F6 (seção 1)**: nome de exibição único ignorando caixa/acentos, `slug` definido na criação (explícito ou derivado do nome) e imutável depois, leitura pública, escrita exclusiva do `ADMIN` e exclusão bloqueada quando houver vínculos.
- Os helpers `normalizeTaxonomyName` e `deriveSlug` são **únicos** e ficam em `packages/shared` (pacote de schemas e tipos compartilhados da arquitetura), de modo que backend, frontend (prévia do slug na administração) e testes usem exatamente a mesma regra. A F5 os introduz (ordem das tarefas) e F6/F7 os reutilizam; aplicam-se as mesmas regras descritas nas RN-F5-02/03.

## 2. Regras de negócio

- **RN-F5-01** Leitura pública: qualquer pessoa, sem autenticação, lista e consulta gêneros. Criação, renomeação e exclusão exigem papel `ADMIN` (`requireRole('ADMIN')` da F1): sem token → `401 UNAUTHENTICATED`; `PLAYER` → `403 FORBIDDEN`.
- **RN-F5-02** `name` é normalizado na entrada (`trim` + colapso de espaços internos), validado (1–50 caracteres, sem caracteres de controle) e persistido já normalizado. A comparação de duplicidade ignora caixa e acentos (`name_normalized`): `"Ação"`, `"AÇÃO"` e `"Acao"` são o mesmo gênero.
- **RN-F5-03** `slug` é normalizado (`trim` + minúsculas) e validado contra `^[a-z0-9]+(-[a-z0-9]+)*$` (1–60 caracteres). Na criação pode ser informado ou derivado do nome: remover acentos, minúsculas, converter toda sequência fora de `[a-z0-9]` em hífen, colapsar hífens, remover hífens das pontas e truncar em 60 (sem hífen final). Nome cuja derivação não produz slug (ex.: `"!!!"`) → `400 VALIDATION_ERROR`.
- **RN-F5-04** `slug` é imutável após a criação: o `PATCH` aceita somente `name`; enviar `slug` (ou qualquer campo desconhecido) → `400 VALIDATION_ERROR`. Justificativa: o slug aparece em URLs e filtros compartilháveis — mesma lógica da imutabilidade do `username` (RN-F2-03).
- **RN-F5-05** Duplicidade: `name` normalizado já usado → `409 GENRE_NAME_TAKEN`; `slug` já usado → `409 GENRE_SLUG_TAKEN`. O próprio registro não conta como conflito na renomeação. A unicidade também é garantida por constraints no banco.
- **RN-F5-06** Criação (`POST`) retorna `201` com o recurso criado e cabeçalho `Location` apontando para o detalhe. Renomeação (`PATCH`) retorna `200` com o recurso atualizado, **preservando** `slug` e `createdAt`; `updatedAt` muda apenas quando o nome realmente muda (envio do mesmo nome é aceito, sem gravação).
- **RN-F5-07** A exclusão (`DELETE`) só é permitida se o gênero **não estiver vinculado a nenhum jogo**; caso contrário → `409 GENRE_IN_USE` (a mensagem informa a quantidade de jogos) e nada é alterado. Vínculos são geridos pela F4; a exclusão não remove vínculos automaticamente.
- **RN-F5-08** `GET /genres` retorna **todos** os gêneros em `{ "data": [...] }`, ordenados por nome (collation pt-BR, ignorando caixa), com desempate por `slug`. Não há paginação: o conjunto é pequeno e os filtros do catálogo (F3) precisam da lista completa. Cada item é um `GenreRef`: `{ id, name, slug, gameCount }`, em que `gameCount` é a quantidade de jogos vinculados (inclui gêneros sem jogos, com `gameCount` 0).
- **RN-F5-09** `GET /genres/:genre` aceita `slug` ou `id` (mesma convenção de identificação da F3) e retorna `GenreDetail` = `GenreRef` + `createdAt` e `updatedAt`; identificador inexistente → `404 NOT_FOUND`.
- **RN-F5-10** A listagem e o detalhe resolvem `gameCount` e os gêneros com um número **constante** de consultas ao banco (sem N+1), mantendo o padrão da F3 (RN-F3-08).
- **RN-F5-11** Dados existentes: o seed continua idempotente (não duplica nem sobrescreve gêneros existentes: busca pelo `slug`) e passa a preencher `name_normalized`; a migration preenche as linhas já existentes antes de aplicar a constraint.
- **RN-F5-12** Erros usam o formato e os códigos genéricos da F1. Novos códigos de domínio, adicionados a `ERROR_CODES` em `packages/shared`: `GENRE_NAME_TAKEN`, `GENRE_SLUG_TAKEN` e `GENRE_IN_USE` — todos `409`.
- **RN-F5-13** O filtro de gênero do catálogo passa a ser populado por `GET /genres` (F3, seção 4), substituindo a derivação atual a partir da listagem de jogos. Os filtros de plataforma seguem a definição da SPEC F6.

## 3. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/genres` | Público | Lista completa ordenada por nome (sem paginação) |
| GET | `/api/v1/genres/:genre` | Público | Detalhe por `slug` ou `id`; `404 NOT_FOUND` se não existir |
| POST | `/api/v1/genres` | `ADMIN` | Corpo `{ name, slug? }` → `201` + `Location` |
| PATCH | `/api/v1/genres/:genre` | `ADMIN` | Corpo `{ name }` → `200` |
| DELETE | `/api/v1/genres/:genre` | `ADMIN` | `204`; `409 GENRE_IN_USE` se houver jogos vinculados |

Schemas Zod em `packages/shared`, usados pelo backend e pelo frontend:

- `genreNameSchema` e `genreSlugSchema` (normalização e formato das RN-F5-02/03);
- `genreCreateSchema` (`strict`: `{ name, slug? }`) e `genreUpdateSchema` (`strict`: `{ name }` obrigatório);
- `genreRefSchema` (`{ id, name, slug, gameCount }`), `genreDetailSchema` (ref + `createdAt`/`updatedAt`), `genreListSchema` (`{ data: [...] }`) e `genreParamsSchema` (`{ genre }`, sem validação de formato — identificador inexistente responde `404`);
- `GENRE_ROUTES` e `genrePath(slug)`.

## 4. Interface (frontend)

- **`/admin/generos`** (exclusiva de `ADMIN`) — tela de gestão com:
  - lista/tabela com Nome, Slug e Jogos (`gameCount`), estados de carregamento (esqueleto), vazio ("Nenhum gênero cadastrado") e erro com "Tentar novamente";
  - **Novo gênero**: formulário com Nome (obrigatório) e Slug (opcional), com pré-visualização do slug derivado enquanto se digita; erros por campo vindos da API;
  - **Renomear**: edição apenas do nome; o slug é exibido como somente leitura, com a indicação de que não pode ser alterado;
  - **Excluir**: confirmação informando a quantidade de jogos; se a API responder `409 GENRE_IN_USE`, exibe a mensagem e mantém o gênero na lista;
  - feedback de sucesso nas operações e botões desabilitados durante o envio.
- **Acesso administrativo:** rotas sob `/admin/**` exigem `ADMIN` (guard `RequireAdmin`, reutilizável pelas telas de administração das Etapas 2 e 3). Visitante é redirecionado para `/entrar?returnTo=/admin/generos`; `PLAYER` autenticado vê a página "Acesso restrito" (403) com caminho de volta à Home.
- **Menu:** item de administração apontando para `/admin/generos`, visível apenas para `ADMIN`.
- **Catálogo (`/jogos`):** o painel de filtros passa a obter os gêneros de `GET /genres` (com cache do TanStack Query); o filtro continua usando o `slug` na query string e os links de gênero do detalhe do jogo (F3) passam a ter as opções disponíveis no painel.

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Leitura pública**
- [ ] **CA-F5-01** [API] `GET /genres` sem token retorna `200` com `{ data }` de todos os gêneros (incluindo os sem jogos), cada um com `id`, `name`, `slug` e `gameCount`.
- [ ] **CA-F5-02** [API] A ordem é por nome (collation pt-BR, sem diferenciar caixa) e o desempate é por `slug`; `gameCount` reflete os vínculos (0, 1 e vários jogos).
- [ ] **CA-F5-03** [API] `GET /genres/:genre` funciona com `slug` e com `id` e retorna `name`, `slug`, `gameCount`, `createdAt` e `updatedAt`; identificador inexistente retorna `404 NOT_FOUND`.
- [ ] **CA-F5-04** [UNIT] O helper de identificação distingue UUID de slug, aceita ambos e nunca trata um slug como UUID.
- [ ] **CA-F5-05** [API] `GET /genres` e o detalhe executam um número constante de consultas ao banco, independentemente da quantidade de gêneros e de jogos (sem N+1).
- [ ] **CA-F5-06** [UNIT] A normalização de nome e a derivação de slug cobrem acentos, maiúsculas, símbolos (`"Ação"` → `acao`, `"Mundo Aberto"` → `mundo-aberto`, `"Ficção Científica"` → `ficcao-cientifica`), colapso de espaços/hífens e truncamento em 60 sem hífen final.

**Autorização**
- [ ] **CA-F5-07** [API] `POST`, `PATCH` e `DELETE` sem token retornam `401 UNAUTHENTICATED`.
- [ ] **CA-F5-08** [API] As mesmas rotas com conta `PLAYER` retornam `403 FORBIDDEN` e não alteram dados; com `ADMIN` funcionam.
- [ ] **CA-F5-09** [E2E] Visitante em `/admin/generos` é levado a `/entrar?returnTo=...`; `PLAYER` vê "Acesso restrito" e não a tela de gestão.

**Criação**
- [ ] **CA-F5-10** [API] `POST` apenas com `name` deriva o `slug`, retorna `201` com o recurso criado e `Location`, e o gênero passa a aparecer na listagem.
- [ ] **CA-F5-11** [API] `POST` com `slug` informado (ex.: `"Ficcao-Cientifica"` → `ficcao-cientifica`) respeita o valor em vez de derivá-lo do nome.
- [ ] **CA-F5-12** [API] `name` equivalente a um gênero existente, ignorando caixa e acentos (`"Ação"`/`"AÇÃO"`/`"Acao"` ou `"acao"` para o gênero `Ação` do seed), retorna `409 GENRE_NAME_TAKEN`; `slug` já usado retorna `409 GENRE_SLUG_TAKEN`.
- [ ] **CA-F5-13** [API] Retornam `400 VALIDATION_ERROR`: `name` vazio/apenas espaços, com mais de 50 caracteres ou com caracteres de controle; `slug` fora do formato ou com mais de 60 caracteres; campo desconhecido; e `name` cuja derivação não produz slug (ex.: `"!!!"`).
- [ ] **CA-F5-14** [API] O `name` é persistido com `trim` e espaços internos colapsados (`"  Mundo   Aberto  "` → `"Mundo Aberto"`).

**Renomeação**
- [ ] **CA-F5-15** [API] `PATCH` com novo `name` retorna `200`, atualiza o nome e `updatedAt` e preserva `slug` e `createdAt`.
- [ ] **CA-F5-16** [API] `PATCH` com o mesmo nome retorna `200` sem alteração efetiva (`updatedAt` inalterado).
- [ ] **CA-F5-17** [API] `PATCH` com nome em conflito retorna `409 GENRE_NAME_TAKEN`; com corpo vazio, `slug` ou campo desconhecido retorna `400 VALIDATION_ERROR`; em gênero inexistente retorna `404 NOT_FOUND`.

**Exclusão**
- [ ] **CA-F5-18** [API] `DELETE` de gênero sem vínculos retorna `204`; ele some da listagem e o detalhe passa a responder `404`.
- [ ] **CA-F5-19** [API] `DELETE` de gênero vinculado a jogos retorna `409 GENRE_IN_USE`, e nem o gênero nem os vínculos são alterados.
- [ ] **CA-F5-20** [API] Após os vínculos serem removidos (fixture), a mesma exclusão passa a retornar `204`.

**Dados, migração e seed**
- [ ] **CA-F5-21** [API] A unicidade normalizada vale para os gêneros do seed (criar ou renomear para um nome equivalente, ignorando caixa e acentos, retorna `409 GENRE_NAME_TAKEN`) e o seed roda duas vezes sem duplicar nem sobrescrever dados (CA-F3-23 preservado).

**Interface e integração com o catálogo**
- [ ] **CA-F5-22** [E2E] `ADMIN` cria, renomeia e exclui um gênero sem vínculos pela interface, com confirmação, feedbacks e estados de carregamento/vazio/erro; o slug derivado é previsualizado e fica somente leitura na renomeação.
- [ ] **CA-F5-23** [E2E] A tentativa de excluir pela interface um gênero em uso (ex.: `RPG`, do seed) exibe o erro e mantém o gênero.
- [ ] **CA-F5-24** [E2E] Gênero criado pela administração aparece nas opções do filtro do catálogo e o filtro continua funcionando via `slug` na URL (jogo sem vínculo → estado vazio).
- [ ] **CA-F5-25** [UNIT] `fetchFilterOptions` passa a usar `GET /genres` para os gêneros (mockado); as plataformas permanecem derivadas da listagem até a F6.

---

# Fora do Escopo

- Vínculos jogo↔gênero e edição dos gêneros de um jogo (F4); exibição no detalhe do jogo (F3).
- Plataformas (F6) e desenvolvedoras (F7) — seguem as mesmas convenções em suas próprias SPECs.
- Página pública dedicada a um gênero (listar jogos por gênero).
- Alteração do `slug` após a criação, mesclagem de gêneros duplicados e sinônimos/subgêneros.
- Descrição, imagem/ícone e hierarquia de gêneros.
- Exclusão em massa, importação de fontes externas e reatribuição automática de vínculos ao excluir.
- Auditoria/histórico de alterações, limites de uso administrativo e demais capacidades de administração (F15).
