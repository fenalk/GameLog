**Projeto:** GameLog · **Etapa:** 1 — Identidade e acesso · **Documento:** SPEC F2 — Gerenciamento de perfil · **Tarefa:** T1.04
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** F1 (autenticação, papéis, formato de erro)

---

# O que e Por quê

O perfil é a "identidade pública" do Jogador no GameLog: é nele que os demais usuários veem o diário, as avaliações, as resenhas e as listas de alguém. Esta SPEC define a **página de perfil público**, a **edição do próprio perfil** e a **gestão da conta** (e-mail, senha e exclusão). Sem ela, não há onde ancorar as funcionalidades de atividade e de interação social.

## 1. Regras de negócio

- **RN-F2-01** Todo usuário (`PLAYER` ou `ADMIN`) possui um perfil público acessível por `username`. Contas `SUSPENDED` continuam com perfil visível. O e-mail **nunca** é público.
- **RN-F2-02** Campos editáveis do perfil: `displayName` (1–50 caracteres após `trim`, sem caracteres de controle; padrão = `username`), `bio` (até 300 caracteres, nulável) e `avatarUrl` (URL `https`, até 500 caracteres, nulável).
- **RN-F2-03** O `username` é **imutável** (estabilidade de URLs e menções).
- **RN-F2-04** A edição é parcial (`PATCH`): campo omitido não muda; `null` limpa `bio` e `avatarUrl`; `displayName: null` volta a ser o `username`.
- **RN-F2-05** Troca de e-mail exige `currentPassword`. O novo e-mail segue as regras de F1 (RN-F1-03), é único (`409 EMAIL_TAKEN`) e não pode ser igual ao atual (`400`).
- **RN-F2-06** Troca de senha exige `currentPassword` e `newPassword` (regras de F1, RN-F1-04), diferente da atual. Senha atual errada → `400 INVALID_CURRENT_PASSWORD`. Ao trocar, **todos** os refresh tokens do usuário são revogados e um novo par é emitido para a sessão atual.
- **RN-F2-07** Exclusão de conta exige `password`. É **irreversível**: remove em cascata todos os dados do usuário (registros de jogos, notas, resenhas, listas, vínculos de seguidor/seguindo) e revoga seus tokens. Um `ADMIN` que seja o **último administrador ativo** não pode se excluir (`409 LAST_ADMIN`). Denúncias feitas pelo usuário permanecem, sem vínculo com o autor (detalhado na F14).
- **RN-F2-08** Senha incorreta nas operações sensíveis (e-mail, senha, exclusão) conta no mesmo limitador de tentativas da F1 (RN-F1-08), por usuário.
- **RN-F2-09** O contrato do perfil é **extensível**: SPECs posteriores acrescentam campos de forma aditiva (ex.: F12 adiciona `followersCount`, `followingCount`, `isFollowedByMe`), sem quebrar o que já existe. As seções do perfil (diário, avaliações, resenhas, listas) são entregues pelas respectivas SPECs.
- **RN-F2-10** `avatarUrl` aponta para imagem externa; **não há upload** nesta fase. O frontend usa `referrerpolicy="no-referrer"` e exibe as iniciais do `displayName` se a imagem faltar ou falhar.

## 2. Contrato da API

| Método | Rota | Acesso | Descrição |
| --- | --- | --- | --- |
| GET | `/api/v1/users/:username` | Público (`optionalAuthenticate`) | Perfil público: `{ username, displayName, bio, avatarUrl, createdAt }`. `404 NOT_FOUND` se não existir (busca sem diferenciar maiúsculas) |
| GET | `/api/v1/me/profile` | Autenticado | Perfil próprio, com `email` e `role` |
| PATCH | `/api/v1/me/profile` | Autenticado | Atualiza `displayName`, `bio`, `avatarUrl` |
| PATCH | `/api/v1/me/email` | Autenticado | Corpo `{ email, currentPassword }` |
| PATCH | `/api/v1/me/password` | Autenticado | Corpo `{ currentPassword, newPassword }`; retorna `{ accessToken }` + novo cookie |
| DELETE | `/api/v1/me` | Autenticado | Corpo `{ password }`; `204` e cookie limpo |

Códigos de domínio: `EMAIL_TAKEN` (409), `INVALID_CURRENT_PASSWORD` (400), `LAST_ADMIN` (409).

## 3. Interface (frontend)

- **`/jogadores/:username`** — cabeçalho com avatar, `displayName`, `@username`, bio e "membro desde"; abas reservadas para Diário (F8), Avaliações (F9), Resenhas (F10) e Listas (F11), que ficam ocultas ou "em breve" até a SPEC correspondente ser entregue. Se o perfil é o do usuário logado, exibe "Editar perfil". Usuário inexistente → página 404.
- **`/conta`** (autenticado) — abas **Perfil** (displayName, bio, avatarUrl com pré-visualização e contadores de caracteres), **Segurança** (trocar e-mail e senha) e **Excluir conta** (confirmação digitando o próprio username + senha).
- Mensagens de sucesso/erro por campo; formulários acessíveis (`label`, foco por teclado).

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Perfil público**
- [ ] **CA-F2-01** [API] `GET /users/:username` retorna `200` sem autenticação, com `username`, `displayName`, `bio`, `avatarUrl`, `createdAt`, e **não** contém `email`, `role` nem hash de senha.
- [ ] **CA-F2-02** [API] A busca por username ignora maiúsculas/minúsculas; username inexistente retorna `404 NOT_FOUND`.
- [ ] **CA-F2-03** [API] O perfil de uma conta `SUSPENDED` continua retornando `200`.
- [ ] **CA-F2-04** [API] Recém-cadastrado tem `displayName` igual ao `username`, `bio` e `avatarUrl` nulos.

**Edição de perfil**
- [ ] **CA-F2-05** [API] `PATCH /me/profile` atualiza apenas os campos enviados; os omitidos permanecem iguais.
- [ ] **CA-F2-06** [API] `bio: null` e `avatarUrl: null` limpam os campos; `displayName: null` restaura o `username`.
- [ ] **CA-F2-07** [API] Rejeita com `400 VALIDATION_ERROR`: `displayName` vazio ou com mais de 50 caracteres, `bio` com mais de 300, `avatarUrl` que não seja `https`, e tentativa de enviar `username`.
- [ ] **CA-F2-08** [API] Todas as rotas `/me/*` retornam `401` sem token.

**E-mail e senha**
- [ ] **CA-F2-09** [API] Troca de e-mail com senha atual correta funciona e o login passa a aceitar o novo e-mail (e deixa de aceitar o antigo).
- [ ] **CA-F2-10** [API] Troca de e-mail com senha atual errada retorna `400 INVALID_CURRENT_PASSWORD`; e-mail já usado retorna `409 EMAIL_TAKEN`; e-mail igual ao atual retorna `400`.
- [ ] **CA-F2-11** [API] Troca de senha válida: o login com a senha antiga falha e com a nova funciona; os refresh tokens anteriores ficam revogados e a resposta traz novo par para a sessão atual.
- [ ] **CA-F2-12** [API] Nova senha fora da política da F1, ou igual à atual, retorna `400 VALIDATION_ERROR`.
- [ ] **CA-F2-13** [API] Cinco senhas atuais incorretas seguidas nas rotas sensíveis resultam em `429 RATE_LIMITED`.

**Exclusão de conta**
- [ ] **CA-F2-14** [API] `DELETE /me` com senha correta retorna `204`, revoga os tokens, e o login seguinte falha; o perfil passa a retornar `404`.
- [ ] **CA-F2-15** [API] `DELETE /me` com senha errada retorna `400 INVALID_CURRENT_PASSWORD` e a conta permanece.
- [ ] **CA-F2-16** [API] O último `ADMIN` ativo recebe `409 LAST_ADMIN` ao tentar excluir a própria conta; havendo outro `ADMIN` ativo, a exclusão é permitida.
- [ ] **CA-F2-17** [API] A exclusão remove em cascata os dados do usuário existentes no momento (nenhum registro órfão referenciando o `userId`); cada SPEC posterior (F8–F14) acrescenta a verificação dos seus dados.

**Interface**
- [ ] **CA-F2-18** [E2E] Visitante abre `/jogadores/:username` e vê o perfil sem botão de edição; o dono vê "Editar perfil".
- [ ] **CA-F2-19** [E2E] Em `/conta`, o usuário altera `displayName`, `bio` e `avatarUrl` e vê o resultado refletido no perfil público.
- [ ] **CA-F2-20** [E2E] Avatar com URL quebrada exibe as iniciais do `displayName`.
- [ ] **CA-F2-21** [E2E] Excluir conta só é habilitado após digitar o username e a senha; ao concluir, o usuário volta ao estado de visitante.
- [ ] **CA-F2-22** [E2E] Username inexistente em `/jogadores/:username` exibe a página 404.

---

# Fora do Escopo

- Alteração de `username`.
- Upload e armazenamento de imagens de avatar/capa (somente URL externa).
- Privacidade do perfil (perfis privados, ocultar diário/listas) — todo perfil é público.
- Verificação de e-mail ao trocá-lo.
- Exportação de dados pessoais (portabilidade) e período de carência para exclusão.
- Conteúdo das abas do perfil (F8–F11) e contadores sociais (F12).
- Papéis e suspensão de contas (F15).