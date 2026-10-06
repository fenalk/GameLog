**Projeto:** GameLog · **Etapa:** 1 — Identidade e acesso · **Documento:** SPEC F1 — Cadastro e login de usuário · **Tarefas:** T1.01 (cobre também T1.07 e T1.08)
**Fontes:** [visao_geral.md](../docs/visao_geral.md) · [plan.md](../.sdd/plan.md) · [task.md](../.sdd/task.md) · SPEC de Arquitetura (Etapa 0)
**Depende de:** Etapa 0 (fundação)

---

# O que e Por quê

Toda funcionalidade do GameLog além da consulta pública pressupõe saber **quem** é o usuário e **qual papel** ele possui. Esta SPEC define o cadastro, o login, a renovação e o encerramento de sessão, a matriz de papéis/permissões e o mecanismo de autenticação/autorização reutilizável pelas demais etapas. Também fixa as **convenções de erro da API** que todas as outras SPECs herdam.

## 1. Papéis e permissões (T1.07)

O papel é um enum `PLAYER | ADMIN`. O **Visitante** não é um papel: é a ausência de token. O **Administrador herda todas as permissões do Jogador**.

| Capacidade | Visitante | Jogador (`PLAYER`) | Administrador (`ADMIN`) |
| --- | :-: | :-: | :-: |
| Consultar catálogo, jogos, avaliações, resenhas, perfis e listas públicas | ✔ | ✔ | ✔ |
| Cadastrar-se e entrar | ✔ | — | — |
| Gerenciar o próprio perfil e conta | — | ✔ | ✔ |
| Registrar jogos, avaliar, resenhar, criar listas, seguir, receber recomendações | — | ✔ | ✔ |
| Denunciar conteúdo | — | ✔ | ✔ |
| Gerenciar catálogo, gêneros, plataformas e desenvolvedoras | — | — | ✔ |
| Moderar conteúdo e analisar denúncias | — | — | ✔ |
| Administrar usuários e a plataforma | — | — | ✔ |

## 2. Convenções transversais (valem para todas as SPECs)

- **Idioma:** identificadores técnicos (rotas, campos JSON, enums, códigos de erro) em **inglês**; textos de interface e mensagens ao usuário em **português (pt-BR)**.
- **Formatos:** IDs em UUID; datas/horas em ISO-8601 UTC; datas sem hora como `YYYY-MM-DD`.
- **Autenticação nas requisições:** cabeçalho `Authorization: Bearer <accessToken>`.
- **Formato de erro** (todas as respostas de erro):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Texto legível em pt-BR", "details": [ { "field": "email", "message": "E-mail inválido" } ] } }
```

`details` é opcional. `code` é estável (UPPER_SNAKE) e é o que os testes verificam.

| HTTP | `code` genérico | Quando |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Corpo/parâmetros inválidos ou regra de validação violada |
| 401 | `UNAUTHENTICATED` / `INVALID_CREDENTIALS` | Token ausente, inválido ou expirado / credenciais erradas |
| 403 | `FORBIDDEN` / `ACCOUNT_SUSPENDED` | Sem permissão para o recurso / conta suspensa |
| 404 | `NOT_FOUND` | Recurso inexistente (ou invisível ao solicitante) |
| 409 | `CONFLICT` e códigos de domínio | Unicidade ou estado incompatível |
| 429 | `RATE_LIMITED` | Limite de tentativas excedido |
| 500 | `INTERNAL_ERROR` | Falha inesperada, **sem** stack trace no corpo |

Cada SPEC pode definir códigos de domínio adicionais (ex.: `EMAIL_TAKEN`) usando o mesmo formato.

## 3. Regras de negócio

- **RN-F1-01** O cadastro público cria sempre uma conta com papel `PLAYER` e status `ACTIVE`. Nenhum endpoint público cria `ADMIN`.
- **RN-F1-02** `username`: 3–30 caracteres, apenas `a-z`, `0-9` e `_`. A entrada passa por `trim` + minúsculas **antes** da validação. Único (comparação já normalizada). Reservados: `admin`, `administrator`, `administrador`, `gamelog`, `root`, `suporte`, `support`, `me`, `api`.
- **RN-F1-03** `email`: formato válido, até 254 caracteres, normalizado (`trim` + minúsculas), único.
- **RN-F1-04** `password`: 8–128 caracteres, com ao menos 1 letra e 1 dígito. Armazenada **somente** como hash **argon2id** (parâmetros no mínimo os recomendados pela OWASP: 19 MiB de memória, 2 iterações, paralelismo 1). Nunca retornada nem registrada em log.
- **RN-F1-05** O corpo de cadastro/login rejeita campos desconhecidos (`VALIDATION_ERROR`), inclusive `role`.
- **RN-F1-06** Login com `identifier` (e-mail **ou** username) + `password`. Credenciais erradas e usuário inexistente retornam a **mesma** resposta (`401 INVALID_CREDENTIALS`) e o tempo de resposta é equalizado (hash fictício quando o usuário não existe), para não revelar quais contas existem.
- **RN-F1-07** Conta com status `SUSPENDED` com credenciais corretas → `403 ACCOUNT_SUSPENDED`, sem emitir tokens. (A suspensão em si é feita na F15.)
- **RN-F1-08** Limite de tentativas: 5 falhas em 15 min por (`identifier` normalizado + IP) → `429 RATE_LIMITED` com cabeçalho `Retry-After`. Login bem-sucedido zera o contador. Armazenamento em memória é aceitável nesta fase.
- **RN-F1-09** **Access token:** JWT com validade de 15 min, claim `sub` = id do usuário. **Refresh token:** JWT com `jti`, segredo distinto, validade de 7 dias, entregue **apenas** em cookie `refresh_token` (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` em produção) e **nunca** no corpo da resposta. O banco guarda o `jti` (hash), `userId`, `expiresAt`, `revokedAt`. Frontend e API devem ser servidos sob o mesmo site (em desenvolvimento, via proxy do Vite).
- **RN-F1-10** Rotação: cada `/auth/refresh` revoga o refresh usado e emite um novo par. O **reuso** de um refresh já revogado → `401 UNAUTHENTICATED` e revogação de **todos** os refresh tokens do usuário.
- **RN-F1-11** Logout revoga o refresh atual e limpa o cookie; é idempotente (sempre `204`).
- **RN-F1-12** `authenticate` consulta, **a cada requisição**, o status e o papel atuais do usuário no banco (o papel não é confiado ao token). Assim, suspensão e mudança de papel têm efeito imediato.
- **RN-F1-13** Segredos via ambiente: `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET` (mín. 32 caracteres). A aplicação **não inicia** sem eles. `.env.example` traz apenas placeholders.
- **RN-F1-14** Administrador inicial: script de seed idempotente cria **um** `ADMIN` a partir de `ADMIN_EMAIL`, `ADMIN_USERNAME` e `ADMIN_PASSWORD`. Se o usuário já existe, não altera nada.

## 4. Mecanismo reutilizável de autenticação/autorização (T1.08)

Plugin Fastify exportando, para uso das demais etapas:

- `authenticate` — exige token válido; popula `request.user = { id, username, role, status }`.
- `optionalAuthenticate` — sem token → anônimo; token válido → popula `request.user`; token presente porém inválido/expirado → `401`.
- `requireRole(...roles)` — `403 FORBIDDEN` se o papel não atende. A hierarquia vale: `ADMIN` satisfaz `requireRole('PLAYER')`.
- Schemas Zod de cadastro/login em `packages/shared`, usados no backend e no frontend.

## 5. Contrato da API

| Método | Rota | Acesso | Resposta |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Público | `201 { accessToken, user }` + cookie de refresh |
| POST | `/api/v1/auth/login` | Público | `200 { accessToken, user }` + cookie de refresh |
| POST | `/api/v1/auth/refresh` | Cookie de refresh | `200 { accessToken, user }` + novo cookie |
| POST | `/api/v1/auth/logout` | Público | `204` |
| GET | `/api/v1/auth/me` | Autenticado | `200 { id, username, email, role, status }` |

`user` = `{ id, username, email, role }`. Códigos de domínio: `USERNAME_TAKEN` (409), `EMAIL_TAKEN` (409).

## 6. Interface (frontend)

- Páginas `/cadastro` e `/entrar`, usando os schemas compartilhados para validação no cliente e exibindo erros por campo.
- Cabeçalho: visitante vê "Entrar" e "Cadastrar"; autenticado vê menu com seu username e "Sair".
- O access token fica **em memória**. Ao carregar a página, o frontend tenta `/auth/refresh` para restaurar a sessão. Em um `401` por expiração, tenta **uma** renovação e repete a requisição; se falhar, encerra a sessão local.
- Rotas protegidas redirecionam o visitante para `/entrar?returnTo=<rota>` e retornam após o login.
- Formulários acessíveis: `label` associado, foco por teclado, botão desabilitado durante o envio, alternância de visibilidade da senha.

---

# Critérios de Aceitação

Legenda: **[API]** Vitest + Supertest · **[UNIT]** Vitest · **[E2E]** Playwright.

**Cadastro**
- [ ] **CA-F1-01** [API] Cadastro válido retorna `201`, `accessToken`, `user.role = PLAYER` e cookie de refresh; a senha não aparece em nenhuma resposta e o banco guarda hash iniciando em `$argon2id$`.
- [ ] **CA-F1-02** [API] `username` ou `email` já usados (comparação sem diferenciar maiúsculas) retornam `409` com `USERNAME_TAKEN` / `EMAIL_TAKEN`.
- [ ] **CA-F1-03** [API] Username curto, com caractere inválido ou reservado; e-mail inválido; senha curta ou sem dígito/letra retornam `400 VALIDATION_ERROR` com `details` por campo.
- [ ] **CA-F1-04** [API] Entradas `"  Maria_01 "` e `"MARIA@EX.COM"` são normalizadas e persistidas em minúsculas e sem espaços.
- [ ] **CA-F1-05** [API] Corpo com `role: "ADMIN"` (ou qualquer campo desconhecido) retorna `400`; nenhuma conta `ADMIN` é criada.

**Login**
- [ ] **CA-F1-06** [API] Login por e-mail e por username com senha correta retornam `200` com tokens.
- [ ] **CA-F1-07** [API] Senha errada e usuário inexistente retornam `401 INVALID_CREDENTIALS` com corpo idêntico.
- [ ] **CA-F1-08** [API] Conta `SUSPENDED` com credenciais corretas retorna `403 ACCOUNT_SUSPENDED` e nenhum token/cookie.
- [ ] **CA-F1-09** [API] A 6ª tentativa após 5 falhas em 15 min retorna `429 RATE_LIMITED` com `Retry-After`; um login bem-sucedido zera o contador.

**Sessão e tokens**
- [ ] **CA-F1-10** [API] O cookie de refresh tem `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` (e `Secure` quando `NODE_ENV=production`); o refresh token não aparece no corpo.
- [ ] **CA-F1-11** [API] `/auth/refresh` válido retorna novo access token e novo cookie; o refresh anterior fica revogado.
- [ ] **CA-F1-12** [API] Reuso de refresh revogado retorna `401` e revoga todos os refresh tokens do usuário.
- [ ] **CA-F1-13** [API] Refresh ausente, expirado ou adulterado retorna `401 UNAUTHENTICATED`.
- [ ] **CA-F1-14** [API] Logout retorna `204`, revoga o refresh e limpa o cookie; refresh posterior retorna `401`; logout repetido retorna `204`.
- [ ] **CA-F1-15** [API] Access token expirado (relógio simulado) retorna `401 UNAUTHENTICATED` em rota protegida.

**Autorização**
- [ ] **CA-F1-16** [API] Rota protegida sem token ou com token adulterado retorna `401`.
- [ ] **CA-F1-17** [API] `PLAYER` em rota de `ADMIN` retorna `403 FORBIDDEN`; `ADMIN` acessa rotas de `ADMIN` e de `PLAYER`.
- [ ] **CA-F1-18** [API] Mudar o status para `SUSPENDED` no banco faz a próxima requisição com access token ainda válido retornar `403 ACCOUNT_SUSPENDED`; mudar o papel tem efeito na requisição seguinte.
- [ ] **CA-F1-19** [API] `optionalAuthenticate`: sem token → anônimo; token válido → `request.user` preenchido; token inválido → `401`.
- [ ] **CA-F1-20** [API] `GET /auth/me` retorna os dados da conta autenticada e `401` sem token.

**Convenções e configuração**
- [ ] **CA-F1-21** [API] Todas as respostas de erro seguem o formato padrão; um erro `500` provocado não expõe stack trace.
- [ ] **CA-F1-22** [UNIT] A aplicação recusa iniciar sem `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` ou com segredo menor que 32 caracteres.
- [ ] **CA-F1-23** O seed cria o `ADMIN` inicial; uma segunda execução não duplica nem altera a conta. `.env.example` não contém segredos reais.

**Interface**
- [ ] **CA-F1-24** [E2E] Cadastro pelo formulário autentica o usuário, redireciona para `/` e o cabeçalho exibe o username.
- [ ] **CA-F1-25** [E2E] Login inválido exibe mensagem genérica ("E-mail/usuário ou senha inválidos.") sem indicar qual campo errou.
- [ ] **CA-F1-26** [E2E] Recarregar a página mantém a sessão; "Sair" volta ao estado de visitante.
- [ ] **CA-F1-27** [E2E] Visitante em rota protegida vai para `/entrar?returnTo=...` e, após o login, retorna à rota original.
- [ ] **CA-F1-28** [E2E] Access token expirado durante o uso é renovado de forma transparente; se o refresh falhar, a sessão local é encerrada.
- [ ] **CA-F1-29** [E2E] Formulários têm `label` associado, mostram erro por campo e desabilitam o botão durante o envio.

---

# Fora do Escopo

- Verificação de e-mail e recuperação/redefinição de senha.
- Login social (OAuth), autenticação em dois fatores e CAPTCHA.
- Gestão de sessões/dispositivos e opção "lembrar-me" configurável.
- Alteração de e-mail, senha e exclusão de conta (F2).
- Suspensão/reativação de contas e mudança de papéis (F15).
- Rate limiting distribuído (Redis) e política de expiração/rotação periódica de senhas.
- Internacionalização além de pt-BR.