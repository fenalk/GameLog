**Projeto:** GameLog · **Etapa:** 3 — Atividade do jogador · **Documento:** SPEC F8 — Registro de jogos jogados · **Tarefa:** T3.01
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, RBAC e formato de erro) · F2 (perfil público e aba Diário) · F3 (identificação `:game`, `GameSummary`, paginação e detalhe do jogo) · F4/F6 (ciclos de vida de jogos e plataformas referenciados nas cascatas)
**Habilita:** F9 e F10 (contexto do jogo no perfil) · F13 (recomendações a partir da atividade) · a aba Diário do perfil (F2)

---

# O que e Por quê

O diário é o histórico pessoal do Jogador: a lista dos jogos que ele está jogando, zerou, pausou, abandonou ou pretende jogar. É o que dá sentido ao "GameLog" como diário, alimenta o perfil público e serve de base para atividades sociais e recomendações das etapas seguintes. Sem ele, o perfil é apenas uma identidade — não há o que mostrar na aba reservada pela F2, e não existe onde ancorar a experiência do jogador sobre o catálogo.

Esta SPEC define o **registro e o gerenciamento de jogos jogados**: um registro por par jogador↔jogo (com status, datas, tempo de jogo e plataforma), as rotas de escrita sobre o próprio diário, as leituras do diário próprio e público e a substituição dos placeholders deixados pela F2 (aba Diário) e pela F3 (ação "Registrar no diário" na página do jogo). Avaliação de jogos (F9) e resenhas (F10) são funcionalidades independentes: não exigem um registro no diário e não alteram o contrato definido aqui.

## 1. Modelo de dados

Esta funcionalidade introduz a migration do diário:

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `user_id` | FK `users` | Dono do registro; `onDelete: Cascade` — excluir a conta (F2) remove o diário. |
| `game_id` | FK `games` | Jogo registrado; `onDelete: Cascade` — excluir o jogo (F4) remove os registros vinculados. |
| `status` | enum `GameLogStatus` | `PLAYING`, `COMPLETED`, `ON_HOLD`, `DROPPED` ou `BACKLOG` (rótulos pt-BR na interface: Jogando, Zerado, Em pausa, Abandonado, Na fila). |
| `started_at` | `date`? | Início da jogada (`YYYY-MM-DD`). |
| `finished_at` | `date`? | Conclusão/última jogada (`YYYY-MM-DD`). |
| `playtime_minutes` | `int`? | Tempo jogado em minutos. |
| `platform_id` | FK `platforms`? | Plataforma em que jogou; `onDelete: SetNull` — excluir a plataforma (F6) não remove o registro. |
| `created_at` / `updated_at` | `timestamptz(3)` | Auditoria e ordenação padrão do diário. |

- **Unicidade:** `UNIQUE (user_id, game_id)` — um único registro por par jogador↔jogo (nada de entradas duplicadas; replays e múltiplas plataformas ficam fora do escopo).
- **Índices:** `(user_id, updated_at)` para a listagem do diário e `(game_id)` para as consultas por jogo.
- A F9 (nota) e a F10 (resenha) têm modelos próprios; nada aqui é alterado por elas.

## 2. Regras de negócio

- **RN-F8-01** O diário é **público para leitura** (perfis são públicos, RN-F2-01): qualquer pessoa consulta o diário de qualquer jogador sem autenticação, inclusive de contas `SUSPENDED`. A **escrita** é sempre autenticada e restrita ao próprio usuário (`PLAYER` ou `ADMIN`): sem token → `401 UNAUTHENTICATED`.
- **RN-F8-02** Um registro por par (jogador, jogo). `PUT /me/games/:game` cria ou **substitui** o registro (corpo completo; campos opcionais omitidos viram `null`): `201` na criação, `200` na substituição — sempre com o recurso resultante. `PATCH` edita parcialmente e exige registro existente (`404 NOT_FOUND`); `DELETE` também responde `404` quando não há registro. `PUT`/`DELETE` são idempotentes; `PATCH` sem alteração efetiva não grava.
- **RN-F8-03** `status` é obrigatório na criação e restrito ao enum (`400 VALIDATION_ERROR` para ausente ou inválido). O status é apenas uma classificação: **não há transições obrigatórias** nem regras que exijam datas para `COMPLETED` ou `PLAYING`.
- **RN-F8-04** `startedAt`/`finishedAt` são opcionais, no formato `YYYY-MM-DD` (F1), aceitando de `1950-01-01` até o dia atual (UTC) — fora da faixa → `400`; com ambas presentes, `finishedAt` não pode ser anterior a `startedAt` → `400`. Nenhuma data é preenchida automaticamente e as datas não são acopladas ao status.
- **RN-F8-05** `playtimeMinutes` é inteiro entre 0 e 1.000.000, nulável; nos `PATCH`, `null` limpa o campo.
- **RN-F8-06** `platformId` é nulável e, quando informado, deve ser **uma das plataformas do jogo** (`game_platforms`) → caso contrário `400 VALIDATION_ERROR` com `details` do campo `platformId`. Jogo sem plataformas aceita apenas `null`. Mudanças posteriores nos vínculos do jogo (F4) não invalidam registros já existentes.
- **RN-F8-07** `GET /me/games/:game` retorna o registro do usuário autenticado para o jogo (`slug` ou `id`, convenção da F3), com `200`, ou `404 NOT_FOUND` se não houver registro. É o que a página do jogo usa para exibir o estado atual.
- **RN-F8-08** `GET /me/games` lista o diário do usuário autenticado com as convenções de paginação da F3 (`page`/`pageSize`, resposta `{ data, meta }`), filtro `status` repetível (`status=playing&status=completed`) e ordenações `recently_updated` (padrão), `recently_added` e `title`; cada item é o registro com `game: GameSummary` (`{ id, slug, title, coverUrl }`), `platform: { id, name, slug } | null` e os demais campos.
- **RN-F8-09** `GET /users/:username/games` expõe o diário público com o mesmo formato, filtros e ordenações; o username ignora maiúsculas/minúsculas e inexistente → `404 NOT_FOUND`. A resposta **nunca** inclui e-mail, papel ou hash de senha do dono.
- **RN-F8-10** Ordenação: `recently_updated` = `updatedAt` desc (desempate por `id`); `recently_added` = `createdAt` desc; `title` = título do jogo asc (collation pt-BR, desempate por `id`). `order` explícito (`asc`/`desc`) sobrepõe o padrão da ordenação escolhida; valor inválido → `400`.
- **RN-F8-11** As listagens executam um número **constante** de consultas ao banco, independentemente do `pageSize` (sem N+1), mantendo o padrão da F3 (RN-F3-08).
- **RN-F8-12** Cascatas: excluir a conta (F2) remove os registros do usuário; excluir o jogo (F4) remove os registros daquele jogo; excluir a plataforma (F6, quando a exclusão é permitida) define `platformId = null` nos registros que a usavam, sem removê-los.
- **RN-F8-13** O diário é independente de F9/F10: avaliar e resenhar **não exigem** um registro no diário e não alteram este contrato; eventuais referências futuras (ex.: agregados) são aditivas.
- **RN-F8-14** Erros usam o formato e os códigos genéricos da F1 (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHENTICATED`); esta SPEC **não** introduz códigos de domínio novos.

## 3. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/me/games` | Autenticado | Diário próprio, paginado, com `status`, `sort`, `order`, `page`, `pageSize` |
| GET | `/api/v1/me/games/:game` | Autenticado | Registro do usuário para o jogo; `404` se não existir |
| PUT | `/api/v1/me/games/:game` | Autenticado | Cria (`201`) ou substitui (`200`) o registro; corpo completo |
| PATCH | `/api/v1/me/games/:game` | Autenticado | Edição parcial; `404` se não existir |
| DELETE | `/api/v1/me/games/:game` | Autenticado | `204`; `404` se não existir |
| GET | `/api/v1/users/:username/games` | Público | Diário público paginado; `404` se o usuário não existir |

Schemas Zod em `packages/shared`, usados pelo backend e pelo frontend:

- `GAME_LOG_STATUSES` e `gameLogStatusSchema` (RN-F8-03) e as constantes `GAME_LOG_MIN_DATE` (`1950-01-01`) e `PLAYTIME_MINUTES_MAX` (1.000.000);
- `gameLogEntryInputSchema` (`strict`, RN-F8-02/03/04/05/06): `{ status, startedAt?, finishedAt?, playtimeMinutes?, platformId? }` — usado pelo `PUT`;
- `gameLogEntryUpdateSchema` (`strict`, todos os campos opcionais com `null` para limpar, exigindo ao menos um campo) — usado pelo `PATCH`;
- `gameLogEntrySchema`: `{ id, status, startedAt, finishedAt, playtimeMinutes, platform, game: gameSummarySchema, createdAt, updatedAt }` (reutiliza `gameSummarySchema` e `gameTaxonomyRefSchema` da F3);
- `gameLogQuerySchema` (filtro `status` repetível, `sort`, `order`, paginação — convenções da F3), `gameLogPageSchema` (`{ data, meta }`), `gameLogUserParamsSchema` (`{ username }`) e `gameLogGameParamsSchema` (`{ game }`, sem validação de formato — inexistente responde `404`);
- `GAME_LOG_ROUTES` e os helpers `gameLogEntryPath(game)` e `gameLogPublicPath(username)`.

Exemplo de resposta de `GET /me/games/:game`:

```json
{
  "id": "6b1c…",
  "status": "COMPLETED",
  "startedAt": "2024-01-10",
  "finishedAt": "2024-02-03",
  "playtimeMinutes": 1350,
  "platform": { "id": "…", "name": "PC", "slug": "pc" },
  "game": { "id": "…", "slug": "cronicas-de-aetheria", "title": "Crônicas de Aetheria", "coverUrl": "https://…" },
  "createdAt": "2024-02-03T18:20:00.000Z",
  "updatedAt": "2024-02-03T18:20:00.000Z"
}
```

## 4. Interface (frontend)

- **Detalhe do jogo (`/jogos/:slug`)** — substitui a ação reservada "Registrar no diário" (F3, seção 5):
  - sem registro: botão **"Adicionar ao diário"** abre um diálogo com status (obrigatório), data de início, data de conclusão, tempo jogado e plataforma (apenas as plataformas do jogo);
  - com registro: cartão **"No seu diário"** exibindo status, datas, tempo e plataforma, com ações "Editar" e "Remover" (com confirmação);
  - visitante: as ações aparecem como convite a entrar (`/entrar?returnTo=/jogos/:slug`), padrão da F1/F3.
- **Perfil (`/jogadores/:username`)** — a aba **Diário** (reservada na F2) passa a listar o diário, ordenado por atualização recente por padrão, com:
  - itens com capa, título (link para o jogo), status, plataforma, datas e tempo jogado;
  - filtro por status e paginação sincronizada na URL;
  - estados de carregamento (esqueleto), vazio ("Este jogador ainda não registrou jogos" e, para o dono, convite para adicionar pelo catálogo) e erro com "Tentar novamente";
  - o **dono** vê as ações de editar e remover em cada item; os demais veem somente leitura.
- **Formulário (diálogo)** — validação no cliente com os schemas compartilhados e erros por campo vindos da API; seletor de datas; tempo jogado informado em horas (aceita decimais, ex.: `12,5` → 750 minutos) e exibido formatado (`12h 30min`, `45min`); datas exibidas em pt-BR no fuso UTC (ex.: `03/02/2024`); plataforma restrita às plataformas do jogo; botões desabilitados durante o envio e campos acessíveis (`label`, foco por teclado).

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Registro (escrita)**
- [ ] **CA-F8-01** [API] `PUT /me/games/:game` cria o registro (`201`) com status, datas, tempo e plataforma válidos; ele aparece em `GET /me/games` e em `GET /users/:username/games`.
- [ ] **CA-F8-02** [API] `PUT` repetido para o mesmo jogo retorna `200`, substitui os campos (opcionais omitidos viram `null`) e não duplica o registro (unique `user_id + game_id`).
- [ ] **CA-F8-03** [API] `PUT` retorna `400 VALIDATION_ERROR` com `details` por campo para: `status` ausente ou inválido; data fora de `1950-01-01`..hoje; `finishedAt` anterior a `startedAt`; `playtimeMinutes` fora de `0`..`1.000.000` ou não inteiro; campo desconhecido.
- [ ] **CA-F8-04** [API] `platformId` de plataforma **não vinculada ao jogo** retorna `400`; plataforma do jogo e `null` são aceitos; jogo sem plataformas aceita somente `null`.
- [ ] **CA-F8-05** [API] `PATCH` altera apenas os campos enviados; `null` limpa datas, tempo e plataforma; corpo vazio ou `status: null` retorna `400`; sem registro existente retorna `404 NOT_FOUND`.
- [ ] **CA-F8-06** [API] `DELETE` retorna `204` e o registro some das listas; sem registro, retorna `404 NOT_FOUND`; repetir o `PUT` após o `DELETE` recria (`201`).
- [ ] **CA-F8-07** [API] `GET /me/games/:game` aceita `slug` e `id` do jogo e retorna o registro (`200`) ou `404 NOT_FOUND`; jogo inexistente também retorna `404`.
- [ ] **CA-F8-08** [API] As rotas `/me/games*` sem token retornam `401 UNAUTHENTICATED`; dois jogadores mantêm registros independentes para o mesmo jogo e cada um só enxerga/edita o próprio (o diário público do outro é somente leitura).

**Leitura (diários)**
- [ ] **CA-F8-09** [API] `GET /me/games` retorna apenas os registros do usuário autenticado, no formato `{ data, meta }` da F3, com os campos do registro e o `game` (`id`, `slug`, `title`, `coverUrl`).
- [ ] **CA-F8-10** [API] O filtro `status` (repetível) e as ordenações `recently_updated` (padrão, desc), `recently_added` e `title` (com `order` explícito) funcionam; valores inválidos retornam `400`; página além do fim retorna `data: []` com `meta` correto.
- [ ] **CA-F8-11** [API] `GET /users/:username/games` é público (`200` sem token), ignora maiúsculas/minúsculas no username, retorna `404 NOT_FOUND` para inexistente, responde `200` para conta `SUSPENDED` e não expõe `email`, `role` nem hash de senha.
- [ ] **CA-F8-12** [API] As listagens executam um número constante de consultas ao banco para `pageSize` pequeno e grande (sem N+1).
- [ ] **CA-F8-13** [API] Conta `ADMIN` mantém o próprio diário normalmente (o papel não bloqueia as rotas `/me/games*`).

**Cascatas e integração**
- [ ] **CA-F8-14** [API] Excluir a conta (F2) remove todos os registros do diário do usuário (nenhum registro órfão referenciando o `userId`).
- [ ] **CA-F8-15** [API] Excluir o jogo (F4) remove os registros vinculados; excluir a plataforma (F6, quando não houver mais jogos vinculados) define `platformId = null` no registro, sem removê-lo.
- [ ] **CA-F8-16** [UNIT] Helpers de validação e formatação cobrem a faixa de datas e a ordem início↔fim, os limites de tempo, a conversão horas→minutos (`12,5` → 750) e a exibição formatada (`12h 30min`, `45min`).

**Interface**
- [ ] **CA-F8-17** [E2E] No detalhe do jogo, o jogador adiciona o jogo ao diário (status, datas, tempo e plataforma), vê o cartão "No seu diário" e edita e remove o registro pelo próprio cartão.
- [ ] **CA-F8-18** [E2E] A aba Diário do próprio perfil lista o registro com as ações de editar/remover; um visitante vê o mesmo diário sem ações e, ao tentar registrar um jogo, é levado a `/entrar?returnTo=...`.
- [ ] **CA-F8-19** [E2E] O formulário exibe erros por campo para data de conclusão anterior à de início e para plataforma fora das do jogo; o tempo em horas decimais é aceito e exibido formatado.
- [ ] **CA-F8-20** [E2E] A aba Diário filtra por status, pagina e mostra os estados vazio ("Este jogador ainda não registrou jogos") e erro com "Tentar novamente".

---

# Fora do Escopo

- Avaliação com nota (F9), resenhas (F10) e listas (F11) — funcionalidades independentes do diário (RN-F8-13).
- Múltiplos registros por jogo (replays, segunda zerada) ou por plataforma; aqui há exatamente um registro por par jogador↔jogo (a plataforma é única e opcional).
- Privacidade do diário: perfis são públicos (F2); ocultar itens ou o diário inteiro está fora do escopo.
- Histórico/auditoria de mudanças de status, feed de atividades e notificações ("começou a jogar", "zerou") — temas de F12/F13.
- Estatísticas agregadas, metas e gráficos do diário (F13).
- Comentários ou reações nos registros (F12).
- Importação/exportação de diários de serviços externos (Backloggd, HowLongToBeat etc.).
- Wishlist de lançamentos futuros, lembretes e listas de desejos — F11.
