**Projeto:** GameLog · **Etapa:** 2 — Catálogo de jogos · **Documento:** SPEC F3 — Consulta e pesquisa de jogos · **Tarefa:** T2.01
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (convenções de erro e autenticação opcional) · **Habilita:** F4–F13

---

# O que e Por quê

O catálogo é o domínio central do GameLog: é por ele que o Visitante descobre jogos e que o Jogador chega a tudo o que faz (diário, notas, resenhas, listas). Esta SPEC define **como qualquer pessoa, sem conta, consulta e pesquisa jogos**: listagem, busca textual, filtros, ordenação, paginação e a página de detalhe do jogo. É uma SPEC de **leitura**; a escrita é de F4–F7.

## 1. Modelo de dados introduzido nesta etapa

A implementação de F3 cria a migration inicial do catálogo (`Game`, `Genre`, `Platform`, `Developer` e as relações N:N jogo↔gênero, jogo↔plataforma, jogo↔desenvolvedora). Os campos detalhados de cada entidade são definidos em F4–F7; F3 consome o necessário para leitura. Como F4–F7 ainda não existem quando F3 é implementada, **os testes de F3 usam fixtures** e o ambiente de desenvolvimento recebe um **seed de exemplo** (≥ 20 jogos fictícios, com gêneros, plataformas e desenvolvedoras), idempotente e usado apenas fora de produção.

## 2. Convenções definidas aqui (valem para as demais SPECs)

- **Paginação:** parâmetros `page` (≥ 1, padrão 1) e `pageSize` (1–100, padrão 20). Resposta: `{ "data": [...], "meta": { "page", "pageSize", "total", "totalPages" } }`. Página além do fim → `200` com `data: []`. Valores inválidos → `400 VALIDATION_ERROR`.
- **Identificação de jogo:** em toda rota `/games/:game/...` (desta e das demais SPECs), `:game` aceita o **`slug`** ou o **`id` (UUID)**, resolvido por um helper único. O slug nunca tem formato de UUID.
- **Resumo de jogo (`GameSummary`)**, reutilizado por outras SPECs: `{ id, slug, title, coverUrl }`.

## 3. Regras de negócio

- **RN-F3-01** Todos os jogos são públicos; a consulta **não exige** autenticação.
- **RN-F3-02** **Busca (`q`):** `trim`, máx. 100 caracteres; vazio equivale a ausente. A comparação ignora maiúsculas e acentos. A consulta é separada em termos por espaço e **todos** os termos devem aparecer no título (como substring). Só o título é pesquisado.
- **RN-F3-03** **Relevância** (apenas quando há `q`): 1º título idêntico à busca; 2º título que começa com a busca; 3º termo que inicia uma palavra do título; 4º demais. Desempate: `ratingCount` desc, depois `title` asc.
- **RN-F3-04** **Filtros:** `genre`, `platform`, `developer` (slugs; parâmetro repetível, ex.: `genre=rpg&genre=acao`), `releaseYearFrom`, `releaseYearTo` (inteiros; jogos sem data de lançamento ficam fora quando o filtro de ano está ativo) e `minRating` (0,5–5,0). **Dentro do mesmo filtro, "ou"; entre filtros diferentes, "e".** Slug inexistente não gera erro: apenas não casa com nada. Formato inválido → `400`.
- **RN-F3-05** **Ordenação** (`sort`, `order=asc|desc`): `relevance` (somente com `q`; padrão quando há `q`), `popularity` (por `ratingCount`; padrão sem `q`), `rating` (média; jogos sem nota por último), `title`, `release_date` (sem data por último), `recently_added`. Desempate final sempre por `title` asc e `id`.
- **RN-F3-06** **Campos na listagem:** `GameSummary` + `releaseDate`, `genres[{id,name,slug}]`, `platforms[{id,name,slug}]`, `ratingAverage` (número com até 2 casas ou `null`) e `ratingCount` (inteiro). Enquanto F9 não existir, `ratingAverage = null` e `ratingCount = 0`.
- **RN-F3-07** **Detalhe** (`GET /games/:game`): campos da listagem + `description`, `developers[{id,name,slug}]`, `createdAt`, `updatedAt`. Funcionalidades posteriores acrescentam campos de forma aditiva (ex.: `reviewCount` na F10).
- **RN-F3-08** Sem N+1: a listagem de uma página executa um **número constante** de consultas ao banco, independente do `pageSize`.
- **RN-F3-09** Os destaques da Home usam este mesmo endpoint (sem endpoint dedicado): "Adicionados recentemente" (`sort=recently_added`), "Mais bem avaliados" (`sort=rating&minRating=...` considerando só jogos com ≥ `MIN_RATINGS_FOR_RANKING`, constante configurável, padrão 3) e "Mais avaliados" (`sort=popularity`).

## 4. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/games` | Público | Lista paginada com `q`, filtros, `sort`, `order`, `page`, `pageSize` |
| GET | `/api/v1/games/:game` | Público | Detalhe do jogo; `404 NOT_FOUND` se não existir |

Para popular os filtros, o frontend usa as leituras públicas de gêneros e plataformas definidas em F5 e F6.

## 5. Interface (frontend)

- **Home `/`** — campo de busca em destaque e três carrosséis/grades (RN-F3-09).
- **Catálogo `/jogos`** — busca com *debounce* de 300 ms (mín. 2 caracteres para disparar), painel de filtros (gêneros, plataformas, ano, nota mínima), seletor de ordenação, grade de cartões (capa, título, ano, nota), paginação. **Todo o estado fica sincronizado na URL** (query string), permitindo compartilhar e recarregar. Estados de carregamento (esqueleto), vazio ("Nenhum jogo encontrado") e erro (com "Tentar novamente").
- **Detalhe `/jogos/:slug`** — capa, título, data de lançamento, gêneros, plataformas, desenvolvedoras (com link), descrição e média/quantidade de notas. Reserva áreas para as ações de F8–F11 e para "jogos semelhantes" (F13). Visitante vê essas ações como convite a entrar (levando a `/entrar?returnTo=...`).
- Cartão sem capa exibe um placeholder; `document.title` atualizado por página; 404 amigável para jogo inexistente.

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Listagem e paginação**
- [ ] **CA-F3-01** [API] `GET /games` sem token retorna `200`, no formato `{ data, meta }`, com os campos de RN-F3-06.
- [ ] **CA-F3-02** [API] `page`/`pageSize` respeitam limites; `pageSize=101`, `page=0` e valores não numéricos retornam `400`; página além do fim retorna `200` com `data: []` e `meta.total` correto.
- [ ] **CA-F3-03** [API] Sem `q`, a ordenação padrão é `popularity` com desempate por `title`; com `q`, é `relevance`.

**Busca**
- [ ] **CA-F3-04** [API] `q=zelda`, `q=ZELDA` e `q=Zéldà` retornam o mesmo jogo "The Legend of Zelda" (ignora caixa e acentos).
- [ ] **CA-F3-05** [API] `q=legend zelda` casa o jogo (todos os termos, em qualquer ordem); `q=legend mario` não casa jogo sem os dois termos.
- [ ] **CA-F3-06** [API] Com `q`, título idêntico vem antes de título que começa com o termo, que vem antes dos que apenas contêm.
- [ ] **CA-F3-07** [API] `q` com mais de 100 caracteres retorna `400`; `q` vazio ou só com espaços é ignorado.

**Filtros e ordenação**
- [ ] **CA-F3-08** [API] `genre=rpg&genre=acao` retorna jogos com RPG **ou** Ação; somar `platform=pc` restringe a jogos que também estão em PC.
- [ ] **CA-F3-09** [API] `releaseYearFrom/To` filtram por ano e excluem jogos sem data; `minRating=4` exclui jogos com média menor ou sem nota.
- [ ] **CA-F3-10** [API] Slug inexistente em filtro retorna `200` com lista vazia; `releaseYearFrom=abc` e `minRating=9` retornam `400`.
- [ ] **CA-F3-11** [API] `sort=rating`, `title`, `release_date` e `recently_added` ordenam corretamente em `asc` e `desc`, com jogos sem nota/sem data sempre ao final de `rating`/`release_date`.
- [ ] **CA-F3-12** [API] `sort=relevance` sem `q` retorna `400`.
- [ ] **CA-F3-13** [API] O número de consultas ao banco da listagem é o mesmo para `pageSize=5` e `pageSize=50`.

**Detalhe**
- [ ] **CA-F3-14** [API] `GET /games/:game` funciona com `slug` e com `id` e retorna os campos de RN-F3-07, incluindo `genres`, `platforms` e `developers`.
- [ ] **CA-F3-15** [API] Jogo inexistente (slug ou UUID) retorna `404 NOT_FOUND`.
- [ ] **CA-F3-16** [UNIT] O helper de resolução de `:game` distingue UUID de slug e nunca trata um slug como UUID.

**Interface**
- [ ] **CA-F3-17** [E2E] Visitante abre a Home sem login e vê as três seções de destaque com jogos do seed.
- [ ] **CA-F3-18** [E2E] Digitar na busca atualiza a lista após o *debounce* e a URL; recarregar a página restaura busca, filtros, ordenação e página.
- [ ] **CA-F3-19** [E2E] Aplicar filtros de gênero e plataforma atualiza a grade e a URL; "limpar filtros" restaura a lista completa.
- [ ] **CA-F3-20** [E2E] Busca sem resultado exibe o estado vazio; falha da API exibe erro com "Tentar novamente".
- [ ] **CA-F3-21** [E2E] Clicar em um cartão abre `/jogos/:slug` com os dados do jogo; jogo inexistente mostra a página 404.
- [ ] **CA-F3-22** [E2E] Visitante clicando em uma ação de jogador na página do jogo é levado a `/entrar?returnTo=/jogos/:slug`.
- [ ] **CA-F3-23** O seed de desenvolvimento é idempotente (rodar duas vezes não duplica jogos) e não é executado com `NODE_ENV=production`.

---

# Fora do Escopo

- Criação, edição e exclusão de jogos (F4) e das taxonomias (F5–F7).
- Notas, resenhas, diário e listas exibidos no detalhe (F8–F11); aqui só ficam os pontos de extensão e os agregados.
- "Jogos semelhantes" e recomendações personalizadas (F13).
- Busca em descrição ou por nome de desenvolvedora via `q` (use o filtro `developer`); tolerância a erros de digitação e busca por radicais.
- Autocomplete dedicado, histórico de buscas e buscas salvas.
- SEO/SSR das páginas públicas e *infinite scroll*.
- Importação de dados de APIs externas (IGDB, RAWG etc.).
