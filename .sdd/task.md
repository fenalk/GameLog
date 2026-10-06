# Backlog de Tarefas — GameLog

> Documento complementar ao [plano geral](./plan.md). Organiza, em tarefas executáveis, o
> desenvolvimento descrito nas etapas do plano. **Não** define requisitos funcionais — cada
> funcionalidade tem seus requisitos detalhados em sua própria SPEC, em [`SPEC/`](../SPEC).
>
> Fontes: [visao_geral.md](../docs/visao_geral.md) e [plan.md](./plan.md).

---

## 1. Como usar este documento

- **Identificadores de tarefa:** `T<etapa>.<sequência>` (ex.: `T0.01`, `T2.03`).
- **Identificadores de funcionalidade:** `F<n>`, conforme a numeração da visão geral
  (ex.: `F1` = cadastro e login).
- **Status:**
  - `[ ]` pendente
  - `[~]` em andamento
  - `[x]` concluída
  - `[!]` bloqueada
- **Regra de ouro (SDD):** nenhuma implementação começa antes da SPEC correspondente estar
  definida.

### Ciclo padrão de cada funcionalidade

Toda funcionalidade percorre sempre as mesmas três tarefas:

1. **Escrever a SPEC** — detalhamento dos requisitos da funcionalidade.
2. **Implementar** — código em `src/` a partir da SPEC (inclui API REST e interface quando
   houver).
3. **Testar** — testes em `tests/` cobrindo os critérios de aceite da SPEC.

### Ordem das etapas

As etapas seguem a ordem do plano: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**, respeitando as
dependências da seção 6 do [plano](./plan.md).

---

## 2. Etapa 0 — Fundação do projeto

Base técnica e arquitetural que sustenta todas as demais etapas.

- [x] `T0.01` Escrever a SPEC de arquitetura (organização do backend, camada de acesso a dados relacional e padrão da API REST)
- [x] `T0.02` Configurar o projeto TypeScript em modo `strict` e os scripts do `package.json`
- [x] `T0.03` Definir e configurar a estrutura de pastas do código (`src/`, módulos do backend e do frontend)
- [x] `T0.04` Configurar banco de dados relacional e o mecanismo de migrations
- [x] `T0.05` Configurar lint e formatação (ESLint + Prettier)
- [x] `T0.06` Configurar o ambiente de testes e a pasta `tests/`
- [x] `T0.07` Configurar variáveis de ambiente e o ambiente local (Docker Compose)
- [x] `T0.08` Configurar o padrão da API REST (esqueleto do servidor e endpoint de saúde)
- [x] `T0.09` Configurar o esqueleto do frontend e o roteamento base
- [x] `T0.10` Configurar Git/GitHub (convenções de commit, branches, PRs e proteção da branch principal) — convenções em `docs/git-e-github.md` e proteção da `main` aplicada (repositório tornado público; exigir PR, CI verde, histórico linear e conversas resolvidas)
- [x] `T0.11` Configurar a integração contínua (lint, type-check, testes e build por PR) — workflow em `.github/workflows/ci.yml`, verde no PR #1 (lint, formatação, tipos, build, migrations, testes de integração e e2e)

---

## 3. Etapa 1 — Identidade e acesso

Funcionalidades: **F1** (cadastro e login) e **F2** (gerenciamento de perfil).
Estabelece as personas Visitante, Jogador e Administrador e os papéis de acesso.

### F1 — Cadastro e login de usuário
- [x] `T1.01` Escrever a SPEC de F1
- [x] `T1.02` Implementar F1
- [x] `T1.03` Testar F1

### F2 — Gerenciamento de perfil
- [x] `T1.04` Escrever a SPEC de F2
- [x] `T1.05` Implementar F2
- [x] `T1.06` Testar F2

### Fundação de acesso (transversal à etapa)
- [x] `T1.07` Definir papéis e permissões para Visitante, Jogador e Administrador
- [x] `T1.08` Configurar o mecanismo de autenticação e autorização reutilizável pelas demais etapas

---

## 4. Etapa 2 — Catálogo de jogos

Funcionalidades: **F3** (consulta e pesquisa), **F4** (gerenciamento do catálogo),
**F5** (gênero), **F6** (plataforma) e **F7** (desenvolvedoras).
Entrega a base de jogos consumida pelas etapas seguintes.

### F3 — Consulta e pesquisa de jogos
- [x] `T2.01` Escrever a SPEC de F3
- [x] `T2.02` Implementar F3
- [x] `T2.03` Testar F3

### F4 — Gerenciamento do catálogo de jogos
- [ ] `T2.04` Escrever a SPEC de F4
- [ ] `T2.05` Implementar F4
- [ ] `T2.06` Testar F4

### F5 — Gerenciamento de gênero
- [x] `T2.07` Escrever a SPEC de F5
- [x] `T2.08` Implementar F5
- [x] `T2.09` Testar F5

### F6 — Gerenciamento de plataforma
- [x] `T2.10` Escrever a SPEC de F6
- [x] `T2.11` Implementar F6
- [x] `T2.12` Testar F6

### F7 — Gerenciamento de desenvolvedoras
- [x] `T2.13` Escrever a SPEC de F7
- [x] `T2.14` Implementar F7
- [x] `T2.15` Testar F7

---

## 5. Etapa 3 — Atividade do jogador

Funcionalidades: **F8** (registro de jogos jogados), **F9** (avaliação) e **F10** (resenhas).
Forma o histórico pessoal e as opiniões que sustentam as avaliações sociais.

### F8 — Registro de jogos jogados
- [x] `T3.01` Escrever a SPEC de F8
- [x] `T3.02` Implementar F8
- [x] `T3.03` Testar F8

### F9 — Avaliação de jogos
- [ ] `T3.04` Escrever a SPEC de F9
- [ ] `T3.05` Implementar F9
- [ ] `T3.06` Testar F9

### F10 — Escrita e gerenciamento de resenhas
- [x] `T3.07` Escrever a SPEC de F10
- [x] `T3.08` Implementar F10
- [x] `T3.09` Testar F10

---

## 6. Etapa 4 — Listas

Funcionalidade: **F11** (criação e gerenciamento de listas).

### F11 — Criação e gerenciamento de listas
- [ ] `T4.01` Escrever a SPEC de F11
- [ ] `T4.02` Implementar F11
- [ ] `T4.03` Testar F11

---

## 7. Etapa 5 — Social

Funcionalidades: **F12** (seguir jogadores) e **F13** (recomendações).

### F12 — Seguimento de outros jogadores
- [ ] `T5.01` Escrever a SPEC de F12
- [ ] `T5.02` Implementar F12
- [ ] `T5.03` Testar F12

### F13 — Sistema de recomendações
- [ ] `T5.04` Escrever a SPEC de F13
- [ ] `T5.05` Implementar F13
- [ ] `T5.06` Testar F13

---

## 8. Etapa 6 — Moderação e administração

Funcionalidades: **F14** (denúncias e moderação) e **F15** (administração da plataforma).

### F14 — Sistema de denúncias e moderação
- [ ] `T6.01` Escrever a SPEC de F14
- [ ] `T6.02` Implementar F14
- [ ] `T6.03` Testar F14

### F15 — Administração da plataforma
- [ ] `T6.04` Escrever a SPEC de F15
- [ ] `T6.05` Implementar F15
- [ ] `T6.06` Testar F15

---

## 9. Etapa 7 — Consolidação

Refinamento geral, aspectos não funcionais e integração entre funcionalidades.

- [ ] `T7.01` Revisar e ajustar a integração entre as funcionalidades entregues
- [ ] `T7.02` Tratar requisitos não funcionais (desempenho, segurança, usabilidade)
- [ ] `T7.03` Consolidar a SPEC de arquitetura com as definições de tecnologia finais
- [ ] `T7.04` Revisar a documentação do projeto (`docs/`, `README.md`)
- [ ] `T7.05` Validar a cobertura de testes e os critérios de conclusão de cada etapa

---

## 10. Tarefas transversais (contínuas)

Valem durante todo o projeto, em paralelo às etapas.

- [ ] `TC.01` Manter o [plano geral](./plan.md) atualizado conforme o projeto evolui
- [ ] `TC.02` Manter a documentação de tecnologias ([tecnologias.md](../docs/tecnologias.md)) e a SPEC de arquitetura atualizadas
- [ ] `TC.04` Manter a integração contínua verde (lint, type-check, testes e build)
- [ ] `TC.05` Manter `README.md` atualizado (URL, dupla, stack, como rodar, ferramentas e modelo)

---

## 11. Critérios de conclusão de etapa

Uma etapa só é considerada concluída quando, para todas as suas funcionalidades:

- a SPEC estiver escrita e definida;
- a implementação estiver concluída em `src/`;
- os testes estiverem implementados e passando em `tests/`.
