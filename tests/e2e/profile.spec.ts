import { expect, request, test, type Page } from '@playwright/test';

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

// PNG 1x1 válido usado para simular um avatar externo acessível.
const AVATAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

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

async function loginViaUi(page: Page, user: { username: string; password: string }) {
  await page.goto('/entrar');
  await page.getByLabel('E-mail ou nome de usuário').fill(user.username);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
}

test.describe('SPEC F2 — interface de perfil e conta', () => {
  test('CA-F2-18: visitante vê o perfil sem edição; o dono vê "Editar perfil"', async ({
    page,
  }) => {
    const user = uniqueUser('perfil_publico');
    await createUserThroughApi(user);

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('perfil-display-name')).toHaveText(user.username);
    await expect(page.getByTestId('perfil-username')).toHaveText(`@${user.username}`);
    await expect(page.getByRole('link', { name: 'Editar perfil' })).toHaveCount(0);

    await loginViaUi(page, user);
    await page.goto(`/jogadores/${user.username}`);

    const editProfileLink = page.getByRole('link', { name: 'Editar perfil' });
    await expect(editProfileLink).toBeVisible();

    await editProfileLink.click();
    await expect(page).toHaveURL('/conta');
    await expect(page.getByRole('heading', { name: 'Minha conta' })).toBeVisible();
  });

  test('CA-F2-19: /conta altera displayName, bio e avatarUrl e o perfil público reflete', async ({
    page,
  }) => {
    const user = uniqueUser('editar_perfil');
    await createUserThroughApi(user);
    await loginViaUi(page, user);

    await page.route('**/avatar-f2.png', (route) =>
      route.fulfill({ status: 200, contentType: 'image/png', body: AVATAR_PNG }),
    );

    await page.goto('/conta');
    await page.getByLabel('Nome de exibição').fill('Maria Silva');
    await page.getByLabel('Bio').fill('Jogadora de RPGs e roguelikes.');
    await page.getByLabel('URL do avatar').fill('https://exemplo.com/avatar-f2.png');
    await page.getByRole('button', { name: 'Salvar perfil' }).click();

    await expect(page.getByTestId('sucesso-perfil')).toHaveText('Perfil atualizado.');

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('perfil-display-name')).toHaveText('Maria Silva');
    await expect(page.getByTestId('perfil-bio')).toHaveText('Jogadora de RPGs e roguelikes.');
    await expect(page.getByTestId('avatar-imagem')).toBeVisible();
    await expect(page.getByTestId('avatar-iniciais')).toHaveCount(0);
  });

  test('CA-F2-20: avatar com URL quebrada exibe as iniciais do displayName', async ({ page }) => {
    const user = uniqueUser('avatar_quebrado');
    await createUserThroughApi(user);
    await loginViaUi(page, user);

    await page.route('**/avatar-quebrado.png', (route) => route.abort());

    await page.goto('/conta');
    await page.getByLabel('Nome de exibição').fill('Maria Silva');
    await page.getByLabel('URL do avatar').fill('https://exemplo.com/avatar-quebrado.png');
    await page.getByRole('button', { name: 'Salvar perfil' }).click();

    await expect(page.getByTestId('sucesso-perfil')).toHaveText('Perfil atualizado.');

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('perfil-display-name')).toHaveText('Maria Silva');
    await expect(page.getByTestId('avatar-iniciais')).toHaveText('MS');
    await expect(page.getByTestId('avatar-imagem')).toHaveCount(0);
  });

  test('CA-F2-21: exclusão só habilita com username e senha e devolve ao estado de visitante', async ({
    page,
  }) => {
    const user = uniqueUser('excluir_conta');
    await createUserThroughApi(user);
    await loginViaUi(page, user);

    await page.goto('/conta');
    await page.getByRole('tab', { name: 'Excluir conta' }).click();

    const deleteButton = page.getByRole('button', { name: 'Excluir minha conta' });
    await expect(deleteButton).toBeDisabled();

    await page.getByLabel('Digite seu nome de usuário para confirmar').fill(user.username);
    await expect(deleteButton).toBeDisabled();

    await page.getByLabel('Senha', { exact: true }).fill(user.password);
    await expect(deleteButton).toBeEnabled();

    await deleteButton.click();

    await expect(page).toHaveURL('/');

    const sessionNav = page.getByRole('navigation', { name: 'Sessão' });
    await expect(sessionNav.getByRole('link', { name: 'Cadastrar' })).toBeVisible();
    await expect(sessionNav.getByRole('link', { name: 'Entrar' })).toBeVisible();
    await expect(page.getByTestId('usuario-atual')).toHaveCount(0);

    await page.goto(`/jogadores/${user.username}`);
    await expect(page.getByTestId('pagina-404')).toBeVisible();
  });

  test('CA-F2-22: username inexistente exibe a página 404', async ({ page }) => {
    await page.goto('/jogadores/jogador_inexistente_f2');

    await expect(page.getByTestId('pagina-404')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Perfil não encontrado' })).toBeVisible();
  });
});
