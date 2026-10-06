# GameLog

Plataforma web de catálogo e avaliação de jogos — uma mistura de *catálogo de jogos + diário de
jogos + avaliações sociais*. O desenvolvimento é apoiado por IA com **Spec-Driven Development
(SDD)**: [visão geral](docs/visao_geral.md) → [plano](.sdd/plan.md) → [tarefas](.sdd/task.md) →
[SPECs](SPEC/) → implementação → testes.

# URL

https://github.com/fenalk/GameLog

# Dupla

- Fernanda Borges ([@fenalk](https://github.com/fenalk)) — `dev.fernandaborges@gmail.com`
- `<segundo integrante — preencher>`

# Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime e linguagem | Node.js 24 LTS + TypeScript (`strict`) |
| Backend / API REST | Fastify + Zod + OpenAPI (Swagger) |
| Banco de dados | PostgreSQL + Prisma (migrations versionadas) |
| Frontend | React + Vite + React Router + TanStack Query |
| Estilo / UI | Tailwind CSS + shadcn/ui |
| Testes | Vitest + Supertest (integração) e Playwright (e2e) |
| Lint / formatação | ESLint (flat config) + Prettier |
| Ambiente local | Docker Compose (PostgreSQL) |
| CI/CD | GitHub Actions |
| Organização | Monorepo com npm workspaces |

# Como rodar

Pré-requisitos: **Node.js 24 LTS** (ver [.nvmrc](.nvmrc)) e **Docker** com Docker Compose.

```bash
npm install                          # dependências, build de @gamelog/shared e client do Prisma
cp src/backend/.env.example src/backend/.env
# edite src/backend/.env: defina JWT_ACCESS_SECRET e JWT_REFRESH_SECRET (32+ caracteres,
# diferentes entre si) e as credenciais ADMIN_* do administrador inicial
docker compose up -d db              # PostgreSQL em localhost:5432
npm run db:deploy                    # aplica as migrations do Prisma
npm run db:seed                      # cria o administrador inicial (idempotente)
npm run dev                          # API em :3000 e frontend em :5173
```

- API REST: `http://localhost:3000/api/v1`
- Saúde da API: `http://localhost:3000/api/v1/health` · prontidão: `/api/v1/health/ready`
- Documentação OpenAPI: `http://localhost:3000/docs`
- Frontend: `http://localhost:5173` (proxy `/api` → backend)
- Cadastro, login e conta: `http://localhost:5173/cadastro`, `http://localhost:5173/entrar` e `http://localhost:5173/conta`
- Perfil público: `http://localhost:5173/jogadores/<username>`

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Sobe `@gamelog/shared` (watch), a API REST e o frontend em modo de desenvolvimento |
| `npm run build` | Compila os três workspaces (shared → backend → frontend) |
| `npm run typecheck` | Verificação de tipos em modo `strict` |
| `npm run lint` / `npm run lint:fix` | ESLint |
| `npm run format` / `npm run format:check` | Prettier |
| `npm test` / `npm run test:watch` | Testes unitários e de integração (Vitest + Supertest) |
| `npm run test:e2e` | Testes end-to-end (Playwright) |
| `npm run db:migrate` / `db:deploy` | Cria/desenvolve migrations / aplica migrations |
| `npm run db:seed` | Cria o administrador inicial a partir de `ADMIN_EMAIL`, `ADMIN_USERNAME` e `ADMIN_PASSWORD` (idempotente) |
| `npm run db:reset` / `db:studio` | Recria o banco / abre o Prisma Studio |

## Testes

Os testes usam um **banco dedicado** — a `DATABASE_URL` com o nome do banco acrescido de
`_test` (ex.: `gamelog` → `gamelog_test`) — criado e migrado automaticamente antes de cada
execução; o banco de desenvolvimento não é alterado. Para apontar para outro banco de testes,
defina `TEST_DATABASE_URL` (o nome do banco precisa terminar em `_test`, por segurança).

Quando o Playwright reutiliza servidores já em execução (`reuseExistingServer`), os testes
e2e rodam contra o banco que aquele servidor estiver usando.

# Ferramentas

- **cloc** — contagem de linhas apenas de **arquivos versionados**: dependências, locks, build e
  dados não contam, e a documentação fica de fora; a saída está em
  [Estatísticas](#estatísticas), com as linhas de teste separadas das demais.
- **Git/GitHub** — convenções de branches, commits e pull requests em
  [docs/git-e-github.md](docs/git-e-github.md).

# Estatísticas

Contagem com [cloc](https://github.com/AlDanial/cloc) (v2.11), considerando apenas **arquivos
versionados** e a coluna `code` da ferramenta. **Dependências, locks, build e dados não contam**;
documentação (`*.md` e `LICENSE`) fica de fora. As linhas de teste aparecem separadas das demais.

| Escopo | Arquivos | Linhas de código |
| --- | --- | --- |
| API (`src/backend/`) | 33 | 2389 |
| Frontend (`src/frontend/`) | 33 | 2824 |
| Compartilhado (`packages/shared/`) | 8 | 407 |
| Configuração e infraestrutura | 8 | 230 |
| Testes (`tests/`) | 24 | 2021 |
| **Total** | **106** | **7871** |

Sem os testes, são **5850 linhas**. Para reproduzir:

```bash
# arquivos versionados, sem documentação, dependências, locks e dados
git ls-files | grep -vE '\.md$|(^|/)package(-lock)?\.json$|(^|/)migration_lock\.toml$|^LICENSE$' > /tmp/arquivos.txt

# total e recortes por escopo (ex.: testes)
cloc --list-file=/tmp/arquivos.txt
grep '^tests/' /tmp/arquivos.txt > /tmp/testes.txt && cloc --list-file=/tmp/testes.txt
```

# Modelo

O projeto segue **Spec-Driven Development**: nenhuma funcionalidade é implementada antes de sua
SPEC estar definida. O fluxo é: escolher a funcionalidade no [plano](.sdd/plan.md) → escrever a
SPEC → implementar em `src/` → testar em `tests/`. As decisões de arquitetura e de tecnologia
estão na [SPEC de arquitetura](SPEC/2026-10-05-arquitetura.md) e em
[docs/tecnologias.md](docs/tecnologias.md).
