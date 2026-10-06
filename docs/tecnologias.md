# Tecnologias e Ferramentas — GameLog

> Proposta de stack para o desenvolvimento do GameLog, derivada de
> [visao_geral.md](./visao_geral.md). A visão geral já fixa Node.js, TypeScript,
> banco de dados relacional, Git/GitHub e API REST; as demais escolhas abaixo
> preenchem as lacunas que o próprio documento remete às especificações de
> arquitetura e implementação.

---

## 1. Critérios de escolha

As escolhas foram guiadas pelos seguintes critérios:

- **Aderência à visão geral:** respeitar as tecnologias já definidas (Node.js, TypeScript,
  banco relacional, Git/GitHub, API REST).
- **Domínio do problema:** catálogo + histórico pessoal + avaliações/resenhas + interação
  social — dados fortemente relacionais e consultas de descoberta/pesquisa.
- **Time enxuto:** projeto desenvolvido por uma dupla, o que favorece ferramentas com baixo
  custo de setup e boa integração com TypeScript.
- **Fluxo SDD:** o desenvolvimento é guiado por especificações, então a stack deve facilitar
  validação de contratos, testes automatizados e rastreabilidade requisito → código → teste.
- **TypeScript ponta a ponta:** compartilhar tipos/validações entre backend e frontend reduz
  divergências entre SPEC, API e interface.

---

## 2. Panorama da stack proposta

| Camada | Escolha proposta |
| --- | --- |
| Ambiente de execução | Node.js (versão LTS) |
| Linguagem | TypeScript (modo `strict`) |
| Backend / API REST | Fastify |
| Validação e contratos | Zod + OpenAPI (Swagger) |
| Banco de dados | PostgreSQL |
| Acesso a dados (ORM) | Prisma |
| Autenticação | argon2id (hash) + JWT (access/refresh) + RBAC |
| Frontend | React + Vite + TypeScript |
| Estado de servidor / rotas | TanStack Query + React Router |
| Estilo / UI | Tailwind CSS + shadcn/ui |
| Testes | Vitest + Supertest + Playwright |
| Lint / formatação | ESLint (flat config) + Prettier |
| Ambiente local | Docker Compose |
| CI/CD | GitHub Actions |
| Versionamento | Git/GitHub + Conventional Commits |
| Organização do código | Monorepo com npm workspaces |

---

## 3. Ambiente de execução e linguagem

### Node.js (LTS)
- **Já definido na visão geral.**
- Proposta: usar sempre a versão **LTS** mais recente, para previsibilidade e suporte de
  longo prazo, fixando a versão via `.nvmrc`/`engines` no `package.json`.

### TypeScript (strict)
- **Já definido na visão geral.**
- Habilitar `strict` no [`tsconfig.json`](../tsconfig.json) para que os tipos funcionem como
  primeira linha de verificação dos requisitos descritos nas SPECs.
- Tipos compartilhados entre backend e frontend aumentam a coerência entre contrato de API e
  consumo no cliente.

---

## 4. Backend e API REST

### Fastify — framework do backend
- **Justificativa:** framework TS-first, com validação de entrada/saída baseada em schema, alto
  desempenho e arquitetura de plugins que favorece a modularização por funcionalidade (útil
  para o fluxo SDD, no qual cada SPEC vira um módulo). Já traz logger integrado (pino) e
  geração de documentação OpenAPI por plugin.
- **Alternativas consideradas:**
  - *Express*: ecossistema enorme e simplicidade, porém validação/documentação exigem mais
    montagem manual.
  - *NestJS*: estrutura opinativa e modular excelente para times maiores, mas adiciona
    complexidade (DI, decorators) além do necessário para uma dupla.

### Zod + OpenAPI (Swagger) — contratos e validação
- **Zod** valida payloads e parâmetros e gera tipos TypeScript a partir de um único schema,
  evitando duplicação entre SPEC, código e documentação. Integra-se ao Fastify via
  `fastify-type-provider-zod`.
- **OpenAPI/Swagger** documenta a API REST automaticamente e serve como referência viva para
  frontend e testes — alinhado à necessidade de descoberta/consulta do catálogo.

---

## 5. Banco de dados e acesso a dados

### PostgreSQL — banco de dados relacional
- **Justificativa:** o GameLog é intrinsecamente relacional (usuários, jogos, gêneros,
  plataformas, desenvolvedoras, avaliações, resenhas, listas, seguidores, denúncias). Um SGBD
  relacional robusto atende integridade referencial, consultas de busca/filtro do catálogo e
  agregações para avaliações e recomendações.
- **Alternativas consideradas:** MySQL/MariaDB (válidos, porém PostgreSQL oferece recursos mais
  ricos de consulta e tipos); bancos NoSQL (descartados pela forte modelagem relacional).

### Prisma — ORM e migrations
- **Justificativa:** schema declarativo, migrations versionadas e cliente tipado, o que reforça
  o contrato de dados entre SPEC e implementação. Boa integração com TypeScript e Node.js.
- **Alternativa considerada:** Drizzle ORM (mais leve e próximo de SQL, boa opção se a dupla
  preferir controle explícito das queries).

---

## 6. Autenticação, autorização e segurança

- **Hash de senha:** `argon2id` (recomendado para novos sistemas) — alternativa: `bcrypt`.
  Bibliotecas escolhidas: [`argon2`](https://www.npmjs.com/package/argon2) para o hash e
  [`jsonwebtoken`](https://www.npmjs.com/package/jsonwebtoken) + [`@fastify/cookie`](https://www.npmjs.com/package/@fastify/cookie)
  para os tokens e o cookie de refresh.
- **Autenticação:** JWT com *access token* de curta duração + *refresh token*, adequado a uma
  API REST consumida por frontend separado.
- **Autorização:** controle de acesso baseado em papéis (**RBAC**) cobrindo as três personas —
  Visitante (acesso público), Jogador (conta) e Administrador (gestão/moderação). Isso mapeia
  diretamente os tipos de usuário descritos na visão geral.
- **Boas práticas:** CORS restrito, *rate limiting*, validação de entrada com Zod e segredos
  fora do código (variáveis de ambiente).

---

## 7. Frontend

### React + Vite + TypeScript
- **Justificativa:** React é maduro, com vasto ecossistema e forte suporte a TypeScript; Vite
  oferece build/dev server rápidos e configuração enxuta. Combina com a separação
  frontend ↔ backend via API REST definida na visão geral.

### Bibliotecas complementares
- **React Router:** navegação entre catálogo, página de jogo, perfil e listas.
- **TanStack Query:** cache e sincronização de estado do servidor (avaliações, busca, listas).
- **Tailwind CSS + shadcn/ui:** estilização produtiva com componentes acessíveis, adequada a um
  time pequeno que precisa entregar interface consistente.

### Alternativa considerada: Next.js
- Se a **descoberta de jogos por busca orgânica (SEO)** passar a ser prioridade para as páginas
  públicas do catálogo, Next.js (SSR/SSG) é a alternativa natural, mantendo o consumo da API
  REST. Para o MVP, React + Vite prioriza simplicidade e clara separação de camadas.

---

## 8. Qualidade de código e testes

- **Vitest:** testes unitários rápidos e integrados ao ecossistema Vite/TS.
- **Supertest:** testes de integração dos endpoints da API REST.
- **Playwright:** testes end-to-end dos fluxos do usuário (busca, avaliação, listas, moderação).
- **ESLint (flat config) + Prettier:** padronização e detecção precoce de problemas.
- **Alternativa considerada:** Biome (lint + formatação em uma ferramenta só, mais rápido);
  ESLint + Prettier foi preferido por maturidade e amplitude de regras/plugins.
- **Cobertura:** os testes de cada funcionalidade são exigidos pelos critérios de conclusão de
  etapa definidos no [plano geral](../.sdd/plan.md).

---

## 9. Infraestrutura e ambiente de desenvolvimento

- **Docker + Docker Compose:** padroniza o ambiente local (PostgreSQL, e opcionalmente um
  cliente de banco), reduzindo diferenças entre as máquinas da dupla.
- **Variáveis de ambiente:** uso de `.env` (com `.env.example` versionado e `.env` ignorado) —
  nunca commitar segredos.
- **CI/CD:** **GitHub Actions** para rodar lint, type-check, testes e build a cada PR, apoiando
  o fluxo SDD com verificação automática.

---

## 10. Versionamento e colaboração

- **Git + GitHub** — já definidos na visão geral.
- **Convenções propostas:** *Conventional Commits*, desenvolvimento por *branches* e *Pull
  Requests* com revisão, e proteção da branch principal.
- **GitHub Issues/Projects:** rastreiam as etapas do [plano](../.sdd/plan.md) e as
  funcionalidades de cada SPEC.

---

## 11. Apoio ao desenvolvimento com SDD

- **SPECs** em [`SPEC/`](../SPEC): cada funcionalidade tem sua especificação antes da
  implementação, conforme o [plano geral](../.sdd/plan.md).
- **Testes como verificação da SPEC:** cada critério de aceite deve ter teste correspondente
  (Vitest/Supertest/Playwright).

---

## 12. Estrutura de repositório sugerida

Monorepo com **npm workspaces**, aproveitando o `package.json` já existente na raiz:

- `src/backend/` — aplicação Fastify (API REST).
- `src/frontend/` — aplicação React + Vite.
- `packages/shared/` — schemas Zod e tipos compartilhados entre backend e frontend.
- `tests/` — testes de integração/e2e.
- `SPEC/` — especificações por funcionalidade.
- `.sdd/` — plano e artefatos do fluxo SDD.

Essa divisão mantém o alinhamento com a estrutura atual (`src/`, `tests/`) e com a organização
em etapas descrita no plano.

---

## 13. Resumo e observações

- As escolhas **respeitam integralmente** as tecnologias já fixadas na visão geral; as demais
  são proposições para as especificações de arquitetura e implementação.
- Todas privilegiam **TypeScript ponta a ponta**, **validação por schema** e **testes
  automatizados**, pilares de um desenvolvimento guiado por especificações.
- A **Etapa 0** do [plano geral](../.sdd/plan.md) deve consolidar estas decisões em uma SPEC de
  arquitetura, permitindo ajustes conforme as necessidades surgirem.
