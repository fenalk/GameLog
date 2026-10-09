**Projeto:** GameLog · **Etapa:** 5 — Social · **Documento:** SPEC F12 — Seguimento de outros jogadores · **Tarefa:** T5.01
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, RBAC, status `SUSPENDED` e formato de erro) · F2 (perfil público por `username` com busca sem diferenciar maiúsculas e contrato extensível — RN-F2-09) · F3 (paginação `{ data, meta }`, limites de `page`/`pageSize` e `sort`/`order`)
**Independente de:** F8 (diário), F9 (avaliação), F10 (resenhas) e F11 (listas) — seguir um jogador não exige nem altera qualquer dessas atividades (RN-F12-12)
**Habilita:** os contadores sociais do perfil (F2) · F13 (recomendações a partir de quem o jogador segue) · F14 (moderação, se aplicável)

---

# O que e Por quê

O seguimento é a primeira relação **entre jogadores** do GameLog: é o que transforma perfis
isolados em uma rede e o que a visão geral descreve como "seguir outros jogadores". Sem ele, o
perfil mostra apenas o que uma pessoa publicou — não há como acompanhar quem produz esse
conteúdo, nem nenhum sinal de quem acompanha quem para as recomendações da etapa seguinte.

Esta SPEC define o **seguimento de outros jogadores**: a relação direcionada seguidor→seguido,
as rotas de seguir e deixar de seguir, as leituras públicas de seguidores e seguindo (paginadas
e ordenáveis) e a integração **aditiva** com o perfil público da F2 — os contadores
`followersCount`/`followingCount` e o campo `isFollowedByMe`, já previstos na RN-F2-09. O objeto
seguido é sempre um **usuário**: seguir jogos, listas, gêneros ou desenvolvedoras está fora do
escopo.

Um **feed de atividades**, notificações ("novo seguidor"), reações/curtidas e comentários **não**
fazem parte desta funcionalidade (ver "Fora do Escopo").

## 1. Modelo de dados

Esta funcionalidade introduz a migration do seguimento (`add_follows`), com uma única tabela:

**`Follow`**

| Campo | Tipo | Regra |
| --- | --- | --- |
| `id` | UUID | Chave primária. |
| `follower_id` | FK `users` | Quem segue; `onDelete: Cascade` — excluir a conta (F2) remove os vínculos que ela criou. |
| `following_id` | FK `users` | Quem é seguido; `onDelete: Cascade` — excluir a conta (F2) remove os vínculos que apontam para ela. |
| `created_at` | `timestamptz(3)` | Quando o seguimento começou (`followedAt` nas respostas); ordenação padrão das listagens. |

- **Unicidade:** `UNIQUE (follower_id, following_id)` — cada jogador segue outro **no máximo uma
  vez**; seguir de novo é idempotente e não duplica (RN-F12-04).
- **Autosseguimento barrado no banco:** `CHECK (follower_id <> following_id)`, como rede de
  segurança da RN-F12-02 (a resposta de erro é do serviço, não do banco).
- **Índices:** `(following_id, created_at)` para a lista de **seguidores** e
  `(follower_id, created_at)` para a lista de **seguindo** — ambas ordenadas por `created_at`
  por padrão (RN-F12-08).
- **Contadores derivados:** `followersCount`/`followingCount` são **contagens na leitura** (como
  o `itemsCount` das listas, F11); não há coluna desnormalizada para manter em sincronia.
- A F8 (diário), a F9 (nota), a F10 (resenha) e a F11 (lista) têm modelos próprios; nada aqui é
  criado ou alterado por elas.

## 2. Regras de negócio

- **RN-F12-01** O seguimento é uma relação **direcionada** (A→B não implica B→A) e **pública
  para leitura**: qualquer pessoa consulta seguidores e seguindo de qualquer jogador sem
  autenticação, inclusive de contas `SUSPENDED` (perfis são públicos, RN-F2-01). A **escrita** é
  sempre autenticada, em nome do próprio usuário e somente pela rota `/me/following/:username`:
  sem token → `401 UNAUTHENTICATED`; token de conta `SUSPENDED` → `403 ACCOUNT_SUSPENDED`
  (RN-F1-07). Não existe rota para seguir ou deixar de seguir em nome de outro. Um `ADMIN` segue
  e deixa de seguir normalmente (o papel não bloqueia as rotas `/me/following*`).
- **RN-F12-02** Não é possível seguir a si mesmo: `PUT /me/following/:username` cujo alvo é o
  próprio usuário autenticado retorna `409 CANNOT_FOLLOW_SELF`, inclusive quando o `username` é
  enviado com caixa diferente (`Ana` → `ana`).
- **RN-F12-03** O alvo é identificado pelo `username`, com a busca sem diferenciar
  maiúsculas/minúsculas da F2 (RN-F2-01/CA-F2-02); inexistente → `404 NOT_FOUND`, tanto no `PUT`
  quanto no `DELETE`.
- **RN-F12-04** `PUT /me/following/:username` é **idempotente**: cria o vínculo (`201`, com o
  estado resultante) ou, se o vínculo já existia, retorna `200` **sem** gravar de novo e
  **preservando** o `createdAt` original. `DELETE /me/following/:username` retorna `204` e remove
  o vínculo; quando não havia vínculo → `404 NOT_FOUND`. Repetir o `PUT` depois do `DELETE` recria
  (`201`).
- **RN-F12-05** Cada usuário pode seguir no máximo `FOLLOWING_MAX` contas (constante
  configurável, padrão **5.000**, no mesmo espírito de `LIST_MAX_PER_USER` da F11). Um `PUT` que
  **criaria** o vínculo acima do limite → `409 FOLLOW_LIMIT_REACHED`; repetir o `PUT` de um
  vínculo já existente nunca falha por limite (RN-F12-04).
- **RN-F12-06** Os contadores são derivados e o vínculo do solicitante é calculado na leitura,
  de forma **aditiva** ao contrato da F2 (RN-F2-09):
  - `GET /users/:username` (F2, `optionalAuthenticate`) passa a devolver `followersCount`
    (quantos seguem o perfil), `followingCount` (quantos o perfil segue) e `isFollowedByMe` (se o
    **solicitante** autenticado segue o perfil);
  - `isFollowedByMe` é `false` para visitante (sem token), para o **próprio** perfil e quando não
    existe vínculo; nunca é `null`;
  - `GET /me/profile` (F2) também devolve `followersCount` e `followingCount`, com
    `isFollowedByMe` sempre `false`;
  - contas `SUSPENDED` continuam contando e sendo contadas (RN-F2-01); `email`, `role`, `bio`,
    `avatarUrl` e `createdAt` permanecem exatamente como na F2.
- **RN-F12-07** `GET /users/:username/followers` e `GET /users/:username/following` são públicos
  e seguem as convenções de paginação da F3 (seção 2): `page` ≥ 1 (padrão 1), `pageSize`
  1–100 (padrão 20), resposta `{ data, meta }` com `page`, `pageSize`, `total` e `totalPages`;
  página além do fim → `200` com `data: []`; formato inválido → `400 VALIDATION_ERROR`.
- **RN-F12-08** Ordenação das duas listagens (`sort`, `order=asc|desc`): `recently_followed`
  (padrão; `createdAt` desc, desempate por `username` asc e `id`) e `username` (`username` asc
  com collation pt-BR, desempate por `id`). `order` explícito sobrepõe o sentido padrão da
  ordenação escolhida; valor inválido → `400 VALIDATION_ERROR`.
- **RN-F12-09** Cada item das listagens traz apenas o necessário para exibir e seguir jogadores:
  `{ username, displayName, avatarUrl, followedAt, isFollowedByMe }`. Em `/followers`,
  `followedAt` é quando aquela pessoa **passou a seguir** o perfil; em `/following`, é quando o
  perfil **passou a seguir** aquela pessoa. `isFollowedByMe` indica se o **solicitante** já segue
  o item (para o botão Seguir/Seguindo da lista) e é sempre `false` para visitante e ao listar o
  próprio perfil. E-mail, papel, status e hash de senha **nunca** aparecem.
- **RN-F12-10** As listagens executam um número **constante** de consultas ao banco,
  independentemente do `pageSize` (sem N+1), mantendo o padrão da F3 (RN-F3-08).
- **RN-F12-11** Cascatas: excluir a conta (F2, RN-F2-07) remove todos os vínculos que ela criou
  **e** todos os que apontam para ela, nos dois sentidos, sem afetar os demais usuários. Como os
  contadores e as listagens são derivados, elas passam a refletir a remoção automaticamente.
- **RN-F12-12** Seguir ou deixar de seguir é **independente** de F8–F11: não exige nem altera
  registro no diário, nota, resenha ou lista, e nenhuma dessas funcionalidades cria ou remove
  vínculos de seguimento.
- **RN-F12-13** Erros usam o formato e os códigos genéricos da F1 (`VALIDATION_ERROR`,
  `NOT_FOUND`, `UNAUTHENTICATED`, `ACCOUNT_SUSPENDED`). Esta SPEC introduz dois códigos de
  domínio: `CANNOT_FOLLOW_SELF` (409) e `FOLLOW_LIMIT_REACHED` (409).

## 3. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| PUT | `/api/v1/me/following/:username` | Autenticado | Segue o jogador: `201` ao criar, `200` se já seguia (idempotente) |
| DELETE | `/api/v1/me/following/:username` | Autenticado | Deixa de seguir: `204`; `404 NOT_FOUND` se não havia vínculo |
| GET | `/api/v1/users/:username/followers` | Público | Quem segue o jogador, paginado |
| GET | `/api/v1/users/:username/following` | Público | Quem o jogador segue, paginado |

Sem rota nova, o contrato da F2 é estendido de forma aditiva (RN-F2-09/RN-F12-06):
`GET /api/v1/users/:username` e `GET /api/v1/me/profile` passam a devolver `followersCount`,
`followingCount` e `isFollowedByMe`.

Schemas Zod em `packages/shared`, usados pelo backend e pelo frontend:

- `FOLLOW_SORTS` e `followSortSchema` (`recently_followed` | `username`), reutilizando a
  convenção de `order` e os limites de paginação da F3, além de `FOLLOWING_MAX` (5.000) e dos
  rótulos pt-BR das ordenações;
- `followQuerySchema` (paginação da F3 + `sort`/`order`, RN-F12-08) e `followPageSchema`
  (`{ data, meta }`);
- `followItemSchema` (`{ username, displayName, avatarUrl, followedAt, isFollowedByMe }`,
  RN-F12-09) e `followStateSchema` (`{ username, followersCount, followingCount,
  isFollowedByMe }`, resposta do `PUT` — RN-F12-04/06);
- `publicProfileSchema` (F2) estendido com `followersCount: z.number().int()`,
  `followingCount: z.number().int()` e `isFollowedByMe: z.boolean()` — mudança **aditiva** que
  vale também para `ownProfileSchema`;
- `profileUsernameParamsSchema` (F2) reutilizado como parâmetro `:username`, sem validação de
  formato — username inexistente (mesmo fora do padrão de cadastro) responde `404`;
- `FOLLOW_ROUTES` e os helpers `followersPath(username)` e `followingPath(username)` (frontend e
  testes), com `encodeURIComponent`.

Exemplo de resposta de `GET /users/ana/followers` (visitante anônimo):

```json
{
  "data": [
    {
      "username": "bia",
      "displayName": "Bia Nunes",
      "avatarUrl": null,
      "followedAt": "2026-10-07T18:20:00.000Z",
      "isFollowedByMe": false
    }
  ],
  "meta": { "page": 1, "pageSize": 20, "total": 1, "totalPages": 1 }
}
```

Trecho aditivo de `GET /users/ana` para o mesmo visitante:

```json
{
  "username": "ana",
  "displayName": "Ana",
  "bio": null,
  "avatarUrl": null,
  "createdAt": "2026-01-28T12:00:00.000Z",
  "followersCount": 1,
  "followingCount": 2,
  "isFollowedByMe": false
}
```

## 4. Interface (frontend)

- **Perfil (`/jogadores/:username`)** — o cabeçalho da F2 ganha:
  - **"Seguidores"** e **"Seguindo"** com os contadores, cada um com link para a página
    correspondente;
  - para jogador autenticado em perfil de **terceiro**, o botão **"Seguir"**, que alterna para
    **"Seguindo"** usando `PUT`/`DELETE /me/following/:username`; deixar de seguir pede
    confirmação; o botão fica desabilitado durante a requisição e os contadores são atualizados
    com o estado devolvido pelo `PUT`;
  - **visitante:** o botão aparece como convite a entrar (`/entrar?returnTo=/jogadores/:username`),
    padrão da F1/F2/F3 — contadores e listas continuam legíveis sem login;
  - **o dono do perfil** não vê botão de seguir (o cabeçalho mostra "Editar perfil", da F2).
- **`/jogadores/:username/seguidores`** e **`/jogadores/:username/seguindo`** — novas páginas
  públicas com o cabeçalho reduzido do perfil e a lista de jogadores (avatar, com iniciais quando
  não houver imagem — F2 —, `displayName`, `@username` e link para o perfil), cada item com o
  botão Seguir/Seguindo para autenticados (convite a entrar para visitantes; oculto no próprio
  perfil);
  - paginação e ordenação sincronizadas na URL, com estados de carregamento (esqueleto), vazio
    ("Ainda não tem seguidores" / "Ainda não segue ninguém") e erro com "Tentar novamente";
  - username inexistente → página 404 amigável, mesmo tratamento do perfil (F2).
- Textos de interface em pt-BR, `document.title` atualizado por página e nomes exibidos sempre
  escapados (texto puro); botões acessíveis (texto/`label` e foco por teclado).

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Seguir e deixar de seguir**
- [ ] **CA-F12-01** [API] `PUT /me/following/:username` cria o vínculo (`201`) e ele aparece em `GET /users/:username/following` do solicitante e em `GET /users/:username/followers` do alvo.
- [ ] **CA-F12-02** [API] `PUT` repetido para o mesmo alvo retorna `200`, não duplica o vínculo (unique `follower_id + following_id`) e preserva o `followedAt` original.
- [ ] **CA-F12-03** [API] `PUT` em si mesmo — inclusive com o próprio `username` em caixa diferente — retorna `409 CANNOT_FOLLOW_SELF` e não cria vínculo.
- [ ] **CA-F12-04** [API] `PUT`/`DELETE` com username inexistente retornam `404 NOT_FOUND`; o alvo é resolvido sem diferenciar maiúsculas/minúsculas (seguir `BIA` grava o vínculo com `bia`).
- [ ] **CA-F12-05** [API] `DELETE` retorna `204` e o vínculo some das duas listagens; repetir o `DELETE` retorna `404 NOT_FOUND`; `PUT` depois do `DELETE` recria (`201`).
- [ ] **CA-F12-06** [API] A resposta do `PUT` traz `{ username, followersCount, followingCount, isFollowedByMe: true }` com os contadores atualizados do alvo.
- [ ] **CA-F12-07** [API] As rotas `/me/following*` sem token retornam `401 UNAUTHENTICATED`; conta `SUSPENDED` com token válido retorna `403 ACCOUNT_SUSPENDED`; conta `ADMIN` segue e deixa de seguir normalmente.
- [ ] **CA-F12-08** [API] Seguir acima de `FOLLOWING_MAX` (5.000) retorna `409 FOLLOW_LIMIT_REACHED`; com o limite atingido, repetir o `PUT` de um vínculo já existente continua retornando `200`.

**Leituras públicas (seguidores e seguindo)**
- [ ] **CA-F12-09** [API] `GET /users/:username/followers` e `GET /users/:username/following` retornam `200` sem token, no formato `{ data, meta }` da F3, com os campos de RN-F12-09.
- [ ] **CA-F12-10** [API] As duas listagens ignoram maiúsculas/minúsculas no username, retornam `404 NOT_FOUND` para inexistente, respondem `200` para conta `SUSPENDED` (mantendo seus vínculos visíveis) e não expõem `email`, `role` nem hash de senha.
- [ ] **CA-F12-11** [API] As ordenações `recently_followed` (padrão, desc) e `username` (asc, collation pt-BR) funcionam com `order` explícito; valor inválido retorna `400`; página além do fim retorna `data: []` com `meta` correto.
- [ ] **CA-F12-12** [API] As listagens executam um número constante de consultas ao banco para `pageSize=5` e `pageSize=50` (sem N+1).
- [ ] **CA-F12-13** [API] As listas são independentes e não contêm o próprio perfil: `followers` de A inclui B quando B segue A, `following` de A inclui B quando A segue B, e A nunca aparece nas próprias listas.

**Contadores e perfil (integração com F2)**
- [ ] **CA-F12-14** [API] `GET /users/:username` devolve `followersCount` e `followingCount` corretos e `isFollowedByMe` conforme o solicitante: `false` para visitante e para quem não segue, `true` para quem segue e sempre `false` no próprio perfil.
- [ ] **CA-F12-15** [API] `GET /me/profile` devolve `followersCount`, `followingCount` e `isFollowedByMe: false`; os demais campos da F2 (`username`, `displayName`, `bio`, `avatarUrl`, `createdAt`, `id`, `email`, `role`) permanecem inalterados.
- [ ] **CA-F12-16** [API] Seguir e deixar de seguir refletem nos contadores das leituras seguintes (`followersCount` do alvo e `followingCount` do solicitante), sem contador armazenado.

**Cascatas e independência**
- [ ] **CA-F12-17** [API] Excluir a conta (F2) remove os vínculos nos dois sentidos (nenhum registro órfão referenciando o `userId`) e os contadores e listagens dos demais usuários passam a refletir a remoção.
- [ ] **CA-F12-18** [API] Seguir e deixar de seguir não criam nem alteram diário (F8), nota (F9), resenhas (F10) e listas (F11), e não exigem qualquer desses recursos.
- [ ] **CA-F12-19** [UNIT] Constantes, rótulos pt-BR e helpers: `FOLLOW_SORTS`, `FOLLOWING_MAX`, validação de `sort`/`order`, texto do botão (Seguir/Seguindo) e os caminhos de `/jogadores/:username/seguidores` e `/jogadores/:username/seguindo` com `encodeURIComponent`.

**Interface**
- [ ] **CA-F12-20** [E2E] O jogador segue e deixa de seguir pelo perfil de outro jogador: o botão alterna entre Seguir/Seguindo, os contadores são atualizados e deixar de seguir pede confirmação.
- [ ] **CA-F12-21** [E2E] Um visitante vê os contadores, as listas e os botões; ao clicar em Seguir é levado a `/entrar?returnTo=/jogadores/:username`; no próprio perfil, o botão de seguir não aparece (aparece "Editar perfil").
- [ ] **CA-F12-22** [E2E] As páginas de seguidores e seguindo listam os jogadores com avatar, nome, `@username` e link para o perfil, exibem paginação e ordenação sincronizadas na URL, estado vazio e erro com "Tentar novamente"; username inexistente exibe a página 404.

---

# Fora do Escopo

- **Feed de atividades, comentários e reações/curtidas.** As SPECs de F8, F10 e F11 registraram em seus
  "Fora do Escopo" que comentários, curtidas/reações e feed de atividades pertenceriam à F12.
  Esta SPEC **não** os inclui: o [plano](../.sdd/plan.md) e o [backlog](../.sdd/task.md) definem a
  F12 como *seguimento de outros jogadores*, e esses recursos não constam de nenhuma
  funcionalidade do plano. Cobri-los exige SPEC própria (e, se for o caso, ajuste do plano e do
  backlog).
- **Notificações de "novo seguidor"** e qualquer aviso de atividade dos seguidos — não constam
  do plano; dependeriam de funcionalidade e SPEC próprias.
- **Recomendações e personalização** a partir de quem o jogador segue (sugestões, ordenação e
  destaques) — F13.
- **Perfis privados, solicitações de seguimento, aprovação/recusa, bloqueio e silenciamento
  (mute)** — os perfis são públicos (F2, RN-F2-01); seguir nunca depende de aceite.
- **Seguir outros objetos** (jogos, listas, gêneros, plataformas, desenvolvedoras) — apenas
  usuários.
- **Relações mútuas e sociais derivadas:** "amigos", "segue de volta", `followsMe` no perfil,
  sugestões de "quem seguir", "pessoas que talvez você conheça" e contadores de seguidores em
  outros lugares que não o perfil.
- **Contadores armazenados/desnormalizados, ranking de popularidade e "jogador destaque"** — os
  contadores são sempre derivados na leitura (RN-F12-06).
- **Histórico e auditoria do vínculo** além do `createdAt` (quem seguiu quem e quando já está em
  `Follow`; não há log de eventos nem rastreio de unfollow).
- **Moderação e denúncias relacionadas a seguidores** (bloquear por decisão de administrador,
  remover em massa, motivos e auditoria) — F14.
- **Limite de seguidores por conta**, contas verificadas, selos e qualquer política de
  curadoria de quem pode ser seguido.
- **Exportação/importação da rede de seguimento** e integração com redes sociais externas.
