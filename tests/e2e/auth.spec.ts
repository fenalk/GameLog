import { expect, request, test, type Page } from '@playwright/test';

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

function uniqueUser(prefix: string) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const username = `${prefix}_${suffix}`.slice(0, 30);

  return { username, email: `${username}@example.com`, password: PASSWORD };
}

/**
 * Cria a conta por um contexto de API isolado: o cookie de refresh não deve vazar para
 * o navegador do teste, que representa um visitante.
 */
async function createUserThroughApi(user: { username: string; email: string; password: string }) {
  const api = await request.newContext({ baseURL: BASE_URL });

  try {
    const response = await api.post('/api/v1/auth/register', { data: user });
    expect(response.status()).toBe(201);
  } finally {
    await api.dispose();
  }
}

async function fillRegistrationForm(
  page: Page,
  user: { username: string; email: string; password: string },
) {
  await page.getByLabel('Nome de usuário').fill(user.username);
  await page.getByLabel('E-mail').fill(user.email);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
}

async function fillLoginForm(page: Page, identifier: string, password: string) {
  await page.getByLabel('E-mail ou nome de usuário').fill(identifier);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

function sessionNav(page: Page) {
  return page.getByRole('navigation', { name: 'Sessão' });
}

test.describe('SPEC F1 — interface de cadastro e login', () => {
  test('CA-F1-24: cadastro autentica, redireciona para / e exibe o username no cabeçalho', async ({
    page,
  }) => {
    const user = uniqueUser('cadastro');

    await page.goto('/cadastro');
    await fillRegistrationForm(page, user);
    await page.getByRole('button', { name: 'Cadastrar' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
  });

  test('CA-F1-25: login inválido exibe mensagem genérica sem indicar o campo errado', async ({
    page,
  }) => {
    const user = uniqueUser('login_invalido');
    await createUserThroughApi(user);

    await page.goto('/entrar');

    await fillLoginForm(page, user.username, 'senhaErrada1');
    await expect(page.getByTestId('erro-formulario')).toHaveText(
      'E-mail/usuário ou senha inválidos.',
    );

    await fillLoginForm(page, 'conta_inexistente_xyz', 'senhaErrada1');
    await expect(page.getByTestId('erro-formulario')).toHaveText(
      'E-mail/usuário ou senha inválidos.',
    );

    await expect(page.getByTestId('erro-password')).toHaveCount(0);
    await expect(page.getByTestId('erro-identifier')).toHaveCount(0);
    await expect(page).toHaveURL(/\/entrar$/);
  });

  test('CA-F1-26: recarregar a página mantém a sessão e "Sair" volta ao estado de visitante', async ({
    page,
  }) => {
    const user = uniqueUser('sessao');

    await page.goto('/cadastro');
    await fillRegistrationForm(page, user);
    await page.getByRole('button', { name: 'Cadastrar' }).click();
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);

    await page.reload();
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);

    await page.goto('/conta');
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();

    await page.getByRole('button', { name: 'Sair' }).click();

    await expect(page).toHaveURL('/');
    await expect(sessionNav(page).getByRole('link', { name: 'Entrar' })).toBeVisible();
    await expect(sessionNav(page).getByRole('link', { name: 'Cadastrar' })).toBeVisible();
    await expect(page.getByTestId('usuario-atual')).toHaveCount(0);

    await page.reload();
    await expect(sessionNav(page).getByRole('link', { name: 'Entrar' })).toBeVisible();
  });

  test('CA-F1-27: visitante é enviado para /entrar?returnTo=... e volta à rota original', async ({
    page,
  }) => {
    const user = uniqueUser('retorno');
    await createUserThroughApi(user);

    await page.goto('/conta');

    await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fconta$/);

    await fillLoginForm(page, user.username, user.password);

    await expect(page).toHaveURL('/conta');
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
    await expect(page.getByTestId('dados-da-conta')).toContainText(user.username);
    await expect(page.getByTestId('dados-da-conta')).toContainText('Jogador');
  });

  test('CA-F1-28a: access token expirado é renovado de forma transparente', async ({ page }) => {
    const user = uniqueUser('renovacao');
    await createUserThroughApi(user);

    await page.goto('/entrar');
    await fillLoginForm(page, user.username, user.password);
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);

    let refreshCalls = 0;
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/auth/refresh')) {
        refreshCalls += 1;
      }
    });

    let firstProfileRequest = true;
    await page.route('**/api/v1/me/profile', async (route) => {
      if (firstProfileRequest) {
        firstProfileRequest = false;
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Token expirado' } }),
        });
        return;
      }

      await route.continue();
    });

    await page.getByTestId('usuario-atual').click();

    await expect(page.getByTestId('dados-da-conta')).toContainText(user.username);
    expect(refreshCalls).toBeGreaterThan(0);
    await expect(page).toHaveURL('/conta');
  });

  test('CA-F1-28b: se a renovação falhar, a sessão local é encerrada', async ({ page }) => {
    const user = uniqueUser('sessao_encerrada');
    await createUserThroughApi(user);

    await page.goto('/entrar');
    await fillLoginForm(page, user.username, user.password);
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);

    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Sessão expirada' } }),
      });
    });
    await page.route('**/api/v1/me/profile', async (route) => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: 'Token expirado' } }),
      });
    });

    await page.getByTestId('usuario-atual').click();

    await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fconta$/);
    await expect(page.getByTestId('usuario-atual')).toHaveCount(0);
    await expect(sessionNav(page).getByRole('link', { name: 'Cadastrar' })).toBeVisible();
  });

  test('CA-F1-29: formulários acessíveis, com erros por campo e botão desabilitado no envio', async ({
    page,
  }) => {
    await page.goto('/cadastro');

    const usernameField = page.getByLabel('Nome de usuário');
    const emailField = page.getByLabel('E-mail');
    const passwordField = page.getByLabel('Senha', { exact: true });

    await expect(usernameField).toBeVisible();
    await expect(emailField).toBeVisible();
    await expect(passwordField).toBeVisible();

    // Foco por teclado: Tab leva do username para o e-mail.
    await usernameField.focus();
    await page.keyboard.press('Tab');
    await expect(emailField).toBeFocused();

    // Visibilidade da senha.
    await expect(passwordField).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Mostrar senha' }).click();
    await expect(passwordField).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Ocultar senha' }).click();
    await expect(passwordField).toHaveAttribute('type', 'password');

    // Erros por campo, com label associado e foco no primeiro campo inválido.
    await usernameField.fill('ab');
    await emailField.fill('nao-e-email');
    await passwordField.fill('12345678');
    await page.getByRole('button', { name: 'Cadastrar' }).click();

    await expect(page.getByTestId('erro-username')).toHaveText(/entre 3 e 30 caracteres/);
    await expect(page.getByTestId('erro-email')).toHaveText('E-mail inválido');
    await expect(page.getByTestId('erro-password')).toHaveText(/ao menos uma letra/);
    await expect(usernameField).toBeFocused();

    // Botão desabilitado durante o envio.
    const user = uniqueUser('acessivel');
    await fillRegistrationForm(page, user);

    await page.route('**/api/v1/auth/register', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 750));
      await route.continue();
    });

    const submitButton = page.getByRole('button', { name: 'Cadastrar' });
    await submitButton.click();

    await expect(page.getByRole('button', { name: 'Cadastrando…' })).toBeDisabled();

    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
  });

  test('AUD-01: returnTo com barra invertida não redireciona para fora do site', async ({
    page,
  }) => {
    const user = uniqueUser('retorno_seguro');
    await createUserThroughApi(user);

    // `/\evil.com` é resolvido pelo navegador como `http://evil.com/`; o login deve
    // ignorar o valor e permanecer no site.
    await page.goto('/entrar?returnTo=/%5Cevil.com');
    await fillLoginForm(page, user.username, user.password);

    await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
    await expect(page).toHaveURL(
      (url) => url.origin === new URL(BASE_URL).origin && url.pathname === '/',
    );
  });
});
