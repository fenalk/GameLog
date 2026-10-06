**Projeto:** GameLog · **Etapa:** 0 — Fundação do projeto · **Documento:** SPEC de Arquitetura
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · [tecnologias.md](../docs/tecnologias.md)

---

# O que e Por quê

O GameLog é uma **plataforma web de catálogo e avaliação de jogos**, descrita na visão geral
como uma mistura de *catálogo de jogos + diário de jogos + avaliações sociais*. O sistema
atende três personas — **Visitante**, **Jogador** e **Administrador** — e cobre descoberta de
jogos, histórico pessoal, avaliações/resenhas, listas, interação social e moderação.

Esta SPEC é o primeiro artefato da **Etapa 0 (Fundação)**. Ela existe para que todas as
funcionalidades seguintes (F1–F15) sejam construídas sobre uma base técnica única e acordada,
evitando que decisões de arquitetura sejam tomadas de forma dispersa em cada SPEC funcional.

Os objetivos desta SPEC são:

- **consolidar** as tecnologias e ferramentas escolhidas para o projeto;
- **registrar as justificativas** das principais decisões;
- **registrar as alternativas consideradas** e descartadas;
- **definir a arquitetura geral** do sistema (camadas, responsabilidades e integrações);
- **alinhar-se à visão geral** (problema, solução, personas e funcionalidades);
- **servir de referência** para as próximas SPECs e para a implementação.

## 1. Alinhamento com a visão geral

A visão geral fixa: Node.js, TypeScript, banco de dados relacional, Git/GitHub e API REST como
comunicação entre frontend e backend, deixando as especificidades de frontend e banco para as
especificações de arquitetura e implementação. Esta SPEC preenche essas lacunas sem contrariar
o documento de origem.

| Definição da visão geral | Como esta SPEC atende |
| --- | --- |
| Node.js + TypeScript | Runtime Node.js LTS e TypeScript em modo `strict`. |
| Banco de dados relacional | PostgreSQL com acesso via Prisma. |
| API REST entre frontend e backend | API REST em Fastify, com contratos validados por Zod e documentados via OpenAPI. |
| Git/GitHub | Versionamento e colaboração com Conventional Commits, PRs e CI no GitHub Actions. |
| Personas (Visitante, Jogador, Administrador) | Modelo de autorização por papéis (RBAC) definido na arquitetura. |
| Funcionalidades F1–F15 | Módulos por funcionalidade e monorepo com tipos compartilhados. |

## 2. Decisões consolidadas (tecnologias e ferramentas)

| Camada | Decisão | Justificativa | Alternativas consideradas |
| --- | --- | --- | --- |
| Ambiente de execução | **Node.js (LTS)** | Definido na visão geral; LTS garante previsibilidade e suporte longo. Versão fixada via `engines`/`.nvmrc`. | — |
| Linguagem | **TypeScript (`strict`)** | Definido na visão geral; os tipos funcionam como primeira verificação dos requisitos das SPECs. | — |
| Backend / API REST | **Fastify** | Framework TS-first, validação por schema, desempenho e arquitetura de plugins que favorece um módulo por funcionalidade; logger e OpenAPI integrados. | Express (mais montagem manual de validação/doc); NestJS (estrutura opinativa, porém mais complexo que o necessário para uma dupla). |
| Contratos e validação | **Zod + OpenAPI/Swagger** | Um único schema gera validação, tipos e documentação, evitando divergência entre SPEC, código e doc; operação REST documentada automaticamente. | — |
| Banco de dados | **PostgreSQL** | o domínio é fortemente relacional (jogos, gêneros, plataformas, desenvolvedoras, avaliações, resenhas, listas, seguidores, denúncias); atende integridade referencial, busca/filtro e agregações. | MySQL/MariaDB (válidos, porém com menos recursos de consulta/tipos); NoSQL (descartado pela modelagem relacional). |
| Acesso a dados | **Prisma** | Schema declarativo, migrations versionadas e cliente tipado, reforçando o contrato de dados entre SPEC e implementação. | Drizzle (mais leve e próximo de SQL, se a dupla preferir controle explícito). |
| Autenticação | **argon2id + JWT (access/refresh)** | Hash forte para senhas e tokens adequados a uma API REST consumida por frontend separado. | bcrypt (hash); sessão em servidor (menos aderente a API REST stateless). |
| Autorização | **RBAC (Visitante, Jogador, Administrador)** | Mapeia diretamente as personas da visão geral. | — |
| Frontend | **React + Vite + TypeScript** | Ecossistema maduro, forte suporte a TS e setup enxuto; combina com a separação frontend ↔ backend via API REST. | Next.js (cogitado caso SEO/SSR das páginas públicas do catálogo vire prioridade). |
| Rotas e estado de servidor | **React Router + TanStack Query** | Navegação entre catálogo, jogo, perfil e listas; cache/sincronização do estado vindo da API. | — |
| Estilo e UI | **Tailwind CSS + shadcn/ui** | Produtividade visual e componentes acessíveis, adequados a um time pequeno. | — |
| Testes | **Vitest + Supertest + Playwright** | Cobrem unidade, integração da API REST e fluxos end-to-end, verificando os critérios de aceite das SPECs. | — |
| Lint / formatação | **ESLint + Prettier** | Maturidade e amplitude de regras/plugins. | Biome (lint + formatação em uma ferramenta, mais rápido, mas com ecossistema menor). |
| Ambiente local | **Docker Compose** | Padroniza o ambiente (PostgreSQL) entre as máquinas da dupla. | — |
| CI/CD | **GitHub Actions** | Verificação automática (lint, type-check, testes e build) a cada PR, apoiando o fluxo SDD. | — |
| Versionamento | **Git/GitHub + Conventional Commits** | Definido na visão geral; convenções de commit, branches, PRs e proteção da branch principal. | — |
| Organização do código | **Monorepo com npm workspaces** | Compartilha schemas/tipos entre backend e frontend e mantém um único repositório. | — |

> Justificativas e alternativas detalhadas constam em [tecnologias.md](../docs/tecnologias.md);
> esta SPEC as consolida como decisão arquitetural.

## 3. Arquitetura geral do sistema

O GameLog adota uma arquitetura **cliente-servidor em camadas**, com frontend e backend
separados comunicando-se por **API REST** e persistência em **banco relacional**.

```
┌───────────────────────────────────────────────────────────────┐
│                          Cliente                               │
│  Frontend SPA (React + Vite + TypeScript)                      │
│  React Router · TanStack Query · Tailwind + shadcn/ui          │
└───────────────┬───────────────────────────────────────────────┘
                │  HTTPS · JSON · API REST
┌───────────────▼───────────────────────────────────────────────┐
│                         Servidor                              │
│  Backend (Node.js + Fastify + TypeScript)                     │
│  ┌────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │  Rotas /   │→ │   Serviços    │→ │  Acesso a dados      │  │
│  │ Controllers│  │ (regras de    │  │  (Prisma)            │  │
│  │  + Zod     │  │  negócio)     │  │                      │  │
│  └────────────┘  └───────────────┘  └──────────┬───────────┘  │
│  Transversais: autenticação/RBAC · validação ·  │              │
│  logging (pino) · tratamento de erros · config  │              │
└─────────────────────────────────────────────────┼──────────────┘
                                                  │ SQL
                                      ┌───────────▼───────────┐
                                      │ PostgreSQL (relacional)│
                                      └───────────────────────┘

  packages/shared: schemas Zod e tipos compartilhados (backend ↔ frontend)
```

### 3.1 Camadas e responsabilidades

- **Frontend (apresentação):** interface web consumindo a API REST; não acessa o banco
  diretamente. Cobre tanto as páginas públicas (Visitante) quanto as áreas autenticadas.
- **Backend / API REST (aplicação):** expõe os endpoints REST; organizado em módulos por
  funcionalidade. Dentro de cada módulo: rotas/controllers (entrada e validação), serviços
  (regras de negócio) e acesso a dados.
- **Acesso a dados:** toda persistência passa pelo Prisma, com migrations versionadas; nenhuma
  regra de negócio reside no banco.
- **Banco de dados:** PostgreSQL, responsável pela integridade e pelas consultas relacionais.
- **Shared:** pacote com schemas Zod e tipos usados por backend e frontend, garantindo que o
  contrato da API seja único.

### 3.2 Aspectos transversais

- **Autenticação e autorização:** JWT (access/refresh) e RBAC com os papéis Visitante, Jogador
  e Administrador. O acesso público (Visitante) não exige token.
- **Validação:** Zod na fronteira da API; entradas inválidas resultam em erro padronizado.
- **Tratamento de erros:** respostas de erro consistentes em JSON.
- **Observabilidade:** logging estruturado com pino (integrado ao Fastify).
- **Configuração:** variáveis de ambiente via `.env` (com `.env.example` versionado e `.env`
  fora do versionamento).

### 3.3 Convenções de API REST

- Versionamento de rota (ex.: `/api/v1/...`).
- Verbos e recursos REST com payloads JSON.
- Documentação OpenAPI acessível em ambiente de desenvolvimento.
- Contratos definidos por schema Zod e compartilhados via `packages/shared`.

### 3.4 Estrutura de repositório

- `src/backend/` — aplicação Fastify (API REST), com módulos por funcionalidade.
- `src/frontend/` — aplicação React + Vite.
- `packages/shared/` — schemas Zod e tipos compartilhados.
- `tests/` — testes de integração e end-to-end.
- `SPEC/` — especificações (arquitetura e, futuramente, funcionais).
- `.sdd/` — `plan.md` e `task.md` do fluxo SDD.
- `docs/` — visão geral e documentação de tecnologias.
- `prompts/sessoes/` — registros das sessões com agentes de IA.

### 3.5 Ambientes

- **Desenvolvimento:** execução local com PostgreSQL via Docker Compose e aplicações rodando
  em modo de desenvolvimento.
- **Integração contínua:** GitHub Actions executando lint, type-check, testes e build a cada PR.

---

# Critério de aceite

A Etapa 0 é considerada concluída quando todos os itens abaixo forem verificáveis:

- [ ] A estrutura de pastas do repositório está criada conforme a seção 3.4.
- [ ] O projeto compila em TypeScript no modo `strict`, sem erros de tipo.
- [ ] O PostgreSQL sobe via Docker Compose e as migrations do Prisma são aplicadas com sucesso.
- [ ] O backend Fastify inicia e responde a um endpoint de saúde da API REST.
- [ ] O contrato da API é validado por Zod e a documentação OpenAPI está acessível em desenvolvimento.
- [ ] O frontend React + Vite inicia e consome com sucesso o endpoint de saúde do backend.
- [ ] Lint (ESLint) e formatação (Prettier) estão configurados e passam no código existente.
- [ ] O ambiente de testes (Vitest, Supertest, Playwright) está configurado e executa ao menos um teste com sucesso.
- [ ] A integração contínua (GitHub Actions) executa lint, type-check, testes e build e fica verde em um PR.
- [ ] As convenções de Git/GitHub estão documentadas (Conventional Commits, branches, PRs, proteção da branch principal).
- [ ] As variáveis de ambiente estão gerenciadas via `.env`/`.env.example`, sem segredos versionados.
- [ ] As decisões desta SPEC permanecem alinhadas à [visao_geral.md](../docs/visao_geral.md).

---

# Fora do Escopo

Esta SPEC **não** contempla:

- **SPECs funcionais** das funcionalidades F1–F15 (por exemplo, cadastro, login, catálogo,
  avaliações, listas, recomendações e moderação) — cada uma terá sua própria SPEC.
- **Requisitos funcionais detalhados** e regras de negócio de qualquer funcionalidade.
- **Modelo de dados detalhado por funcionalidade** (tabelas, campos e relacionamentos
  específicos) — aqui consta apenas a arquitetura geral de persistência.
- **Implementação de código** das funcionalidades.
- **Design visual detalhado** e prototipação de interface.
- **Detalhamento do algoritmo do sistema de recomendações** (F13).
- **Escolha de provedores de hospedagem/deploy em produção** e detalhes de infraestrutura
  além do ambiente local e da integração contínua.
