# Plano Geral de Desenvolvimento — GameLog

> Roadmap macro do projeto. Este documento deriva exclusivamente de
> [docs/visao_geral.md](../docs/visao_geral.md) e **não** detalha requisitos funcionais
> individuais — esses serão especificados posteriormente, um por funcionalidade, nas SPECs.

---

## 1. Objetivo e escopo

O GameLog é uma **plataforma web de catálogo e avaliação de jogos**, descrita como uma
mistura de *catálogo de jogos + diário de jogos + avaliações sociais*.

Este plano tem por objetivo:

- organizar o desenvolvimento em etapas;
- identificar as principais funcionalidades do sistema;
- estabelecer uma ordem lógica de implementação;
- servir de referência para o desenvolvimento guiado por SDD.

O plano **não** define requisitos funcionais, regras de negócio detalhadas, contratos de
API, modelo de dados ou decisões finas de tecnologia — cada um desses itens pertence às
SPECs de cada funcionalidade.

---

## 2. Papel do plano dentro do SDD

O plano e as SPECs têm responsabilidades distintas e complementares:

| Artefato | Responsabilidade |
| --- | --- |
| `.sdd/plan.md` (este documento) | Roadmap geral: etapas, funcionalidades e ordem de implementação. |
| SPECs (em [`SPEC/`](../SPEC)) | Detalhamento dos requisitos de **cada** funcionalidade. |
| `src/` | Implementação, somente após a SPEC correspondente estar definida. |
| `tests/` | Verificação da implementação de cada funcionalidade. |
| `prompts/sessoes/` | Registro das sessões com agentes de IA (ver seção 8). |

Fluxo de trabalho proposto:

1. Selecionar a próxima funcionalidade conforme a ordem deste plano;
2. escrever a SPEC da funcionalidade;
3. implementar a funcionalidade a partir da SPEC;
4. testar;
5. registrar a sessão de conversa com a IA.

Nenhuma funcionalidade deve ser implementada sem a SPEC correspondente.

---

## 3. Contexto de partida

- **Problema:** jogadores perdem o histórico dos jogos que já jogaram e não têm um lugar
  simples para organizá-lo nem para descobrir novos jogos a partir de opiniões de outras pessoas.
- **Solução:** plataforma centralizada para descoberta, organização e avaliação de jogos.
- **Personas:** Visitante (sem conta), Jogador (cadastrado) e Administrador (gestão e moderação).
- **Tecnologias iniciais:** Node.js, TypeScript, banco de dados relacional, Git/GitHub e API REST.
  As tecnologias específicas de frontend, banco de dados e demais componentes serão definidas
  nas especificações de arquitetura e implementação.

---

## 4. Funcionalidades do sistema

Funcionalidades previstas na visão geral, agrupadas por domínio para orientar o
sequenciamento (a numeração segue a lista original do documento de visão geral):

**Usuários e acesso**
1. Cadastro e login de usuário
2. Gerenciamento de perfil

**Catálogo de jogos**
3. Consulta e pesquisa de jogos
4. Gerenciamento do catálogo de jogos
5. Gerenciamento de gênero
6. Gerenciamento de plataforma
7. Gerenciamento de desenvolvedoras

**Atividade do jogador**
8. Registro de jogos jogados
9. Avaliação de jogos
10. Escrita e gerenciamento de resenhas
11. Criação e gerenciamento de listas

**Social**
12. Seguimento de outros jogadores
13. Sistema de recomendações

**Moderação e administração**
14. Sistema de denúncias e moderação
15. Administração da plataforma

> O detalhamento de cada item acima é responsabilidade de sua SPEC, não deste plano.

---

## 5. Etapas do desenvolvimento

O desenvolvimento é organizado em etapas incrementais. Cada etapa agrupa funcionalidades
relacionadas e só deve ser iniciada quando a anterior estiver concluída (ver seção 7).

### Etapa 0 — Fundação do projeto
- Estrutura inicial do repositório, configuração de TypeScript, versionamento com Git/GitHub.
- Definição das bases arquiteturais (a serem tratadas em SPEC de arquitetura): organização do
  backend, camada de acesso a dados relacional e padrão da API REST.

### Etapa 1 — Identidade e acesso
- Funcionalidades: **1** (cadastro e login) e **2** (gerenciamento de perfil).
- Estabelece as personas **Visitante**, **Jogador** e **Administrador** e os papéis de acesso
  que sustentam todas as demais etapas.

### Etapa 2 — Catálogo de jogos
- Funcionalidades: **3** (consulta e pesquisa), **4** (gerenciamento do catálogo),
  **5** (gênero), **6** (plataforma) e **7** (desenvolvedoras).
- Entrega a base de dados de jogos consumida pelas etapas seguintes, além das capacidades
  públicas de consulta/leitura para visitantes e das capacidades de administração para o
  Administrador.

### Etapa 3 — Atividade do jogador
- Funcionalidades: **8** (registro de jogos jogados), **9** (avaliação) e **10** (resenhas).
- Registra a experiência do Jogador sobre os jogos do catálogo, formando o histórico pessoal
  e as opiniões que sustentam as avaliações sociais.

### Etapa 4 — Listas
- Funcionalidade: **11** (criação e gerenciamento de listas).
- Reutiliza usuários (Etapa 1) e catálogo (Etapa 2) para organização de jogos em listas.

### Etapa 5 — Social
- Funcionalidades: **12** (seguir jogadores) e **13** (recomendações).
- Depende da existência de jogadores ativos e de suas atividades/opiniões para a interação
  social e a geração de recomendações.

### Etapa 6 — Moderação e administração
- Funcionalidades: **14** (denúncias e moderação) e **15** (administração da plataforma).
- Depende de conteúdo gerado pelos usuários nas etapas anteriores para que seja moderado e
  gerenciado.

### Etapa 7 — Consolidação
- Refinamento geral da plataforma, tratamento de aspectos não funcionais e ajustes de
  integração entre as funcionalidades já entregues.
- Definição e consolidação das tecnologias específicas de frontend, banco de dados e demais
  componentes, conforme previsto na visão geral.

---

## 6. Dependências e ordem lógica de implementação

| Etapa | Depende de | Justificativa |
| --- | --- | --- |
| 0 | — | Base técnica para todas as demais etapas. |
| 1 | 0 | Toda funcionalidade pressupõe a existência de usuários e papéis. |
| 2 | 1 | O catálogo é mantido pelo Administrador e consultado por visitantes/jogadores. |
| 3 | 1, 2 | A atividade do jogador refere-se a jogos existentes no catálogo. |
| 4 | 1, 2 | Listas combinam usuários e jogos. |
| 5 | 1, 3 | Interação social e recomendações dependem de jogadores e de suas atividades. |
| 6 | 1, 2, 3 | A moderação recai sobre catálogo e conteúdo produzido por usuários. |
| 7 | 0–6 | Consolidação depende das funcionalidades já entregues. |

Ordem resumida: **0 → 1 → 2 → 3 → 4 → 5 → 6 → 7**.

Racional da ordem: primeiro a fundação técnica, depois identidade (base de tudo), em seguida
o catálogo (domínio central do produto), depois as atividades do jogador sobre esse catálogo,
as listas, as interações sociais e, por fim, a moderação/administração e a consolidação.

---

## 7. Critérios para avançar de etapa

Uma etapa é considerada concluída quando, para cada funcionalidade que a compõe:

- a SPEC correspondente estiver escrita e definida;
- a implementação estiver concluída em `src/`;
- os testes estiverem implementados e passando em `tests/`;
- a sessão de conversa com o agente de IA estiver registrada (ver seção 8).

---

## 8. Práticas transversais

- **Registro de sessões:** ao final de cada sessão de conversa com agentes de IA, deve ser
  criada uma documentação com o diálogo completo, no formato
  `AAAA-MM-DD-HHMM-<ferramenta>.md`, armazenada em `prompts/sessoes/`.
- **Controle de versão:** uso de Git/GitHub durante todo o desenvolvimento.
- **Comunicação:** API REST entre frontend e backend.

---

## 9. Fora de escopo deste plano

- Detalhamento de requisitos funcionais individuais (responsabilidade das SPECs).
- Contratos de API, modelo de dados e regras de negócio por funcionalidade.
- Escolha e detalhamento das tecnologias específicas de frontend e banco de dados.
- Qualquer implementação de código.
