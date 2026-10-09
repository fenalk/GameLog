import { PrismaPg } from '@prisma/adapter-pg';
import { expect, request, test, type Page } from '@playwright/test';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { createFollow } from '../helpers/follows.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

// O arquivo roda em série: as fixtures de seguimento são preparadas uma vez e
// compartilhadas pelas verificações (a escrita pela API também é exercitada pelo CA-F12-20).
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

let prisma: PrismaClient;

function uniqueUser(prefix: string) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const username = `${prefix}_${suffix}`.slice(0, 30);

  return { username, email: `${username}@example.com`, password: PASSWORD };
}

/** Cria a conta por um contexto de API isolado (o cookie de refresh não vaza para o teste). */
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
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
}

async function createUserWithSession(page: Page, prefix: string) {
  const user = uniqueUser(prefix);
  await createUserThroughApi(user);
  await loginViaUi(page, user);
  return user;
}

async function userId(username: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { username },
    select: { id: true },
  });

  return user.id;
}

/** Contas de fixture (não fazem login): usadas para popular as listagens de seguidores. */
async function createFixtureUsers(usernames: string[]): Promise<void> {
  await prisma.user.createMany({
    data: usernames.map((username) => ({
      username,
      email: `${username}@example.com`,
      passwordHash: 'fixture-sem-login',
    })),
  });
}

test.beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('SPEC F12 — seguimento de jogadores (interface)', () => {
  test('CA-F12-20: o jogador segue e deixa de seguir pelo perfil, com os contadores atualizados', async ({
    page,
  }) => {
    await createUserWithSession(page, 'seg_ui_autor');

    const target = uniqueUser('seg_ui_alvo');
    await createUserThroughApi(target);

    await page.goto(`/jogadores/${target.username}`);
    await expect(page.getByTestId('perfil-seguidores')).toHaveText(/0 seguidores/);
    await expect(page.getByTestId('perfil-seguindo')).toHaveText(/0 seguindo/);

    await page.getByTestId(`seguir-${target.username}`).click();
    await expect(page.getByTestId(`seguir-${target.username}`)).toHaveText('Seguindo');
    await expect(page.getByTestId('perfil-seguidores')).toHaveText(/1 seguidor/);

    // Deixar de seguir exige confirmação e devolve o perfil ao estado inicial.
    await page.getByTestId(`seguir-${target.username}`).click();
    await page.getByTestId('confirmar-remocao').click();

    await expect(page.getByTestId(`seguir-${target.username}`)).toHaveText('Seguir');
    await expect(page.getByTestId('perfil-seguidores')).toHaveText(/0 seguidores/);

    // O vínculo foi realmente removido no banco.
    await expect
      .poll(async () =>
        prisma.follow.count({ where: { followingId: await userId(target.username) } }),
      )
      .toBe(0);
  });

  test('CA-F12-21: o visitante vê contadores e listas, é convidado a entrar e o dono não vê o botão', async ({
    page,
    browser,
  }) => {
    const owner = uniqueUser('seg_ui_dono');
    await createUserThroughApi(owner);

    const follower = uniqueUser('seg_ui_fa');
    await createUserThroughApi(follower);

    await createFollow(prisma, {
      followerId: await userId(follower.username),
      followingId: await userId(owner.username),
    });

    const context = await browser.newContext();
    const visitorPage = await context.newPage();

    try {
      await visitorPage.goto(`/jogadores/${owner.username}`);
      await expect(visitorPage.getByTestId('perfil-seguidores')).toHaveText(/1 seguidor/);

      await visitorPage.getByTestId('perfil-seguidores').click();
      await expect(visitorPage).toHaveURL(new RegExp(`/jogadores/${owner.username}/seguidores$`));
      await expect(visitorPage.getByTestId('seguidor-item')).toHaveCount(1);
      await expect(visitorPage.getByTestId('seguidor-item')).toContainText(`@${follower.username}`);

      // O convite de login preserva a rota de volta (padrão da F1).
      await visitorPage.goto(`/jogadores/${owner.username}`);
      await visitorPage.getByTestId(`seguir-${owner.username}`).click();
      await expect(visitorPage).toHaveURL(
        new RegExp(`/entrar\\?returnTo=%2Fjogadores%2F${owner.username}`),
      );
    } finally {
      await context.close();
    }

    // No próprio perfil não há botão de seguir, apenas o atalho de edição (F2).
    const self = await createUserWithSession(page, 'seg_ui_proprio');
    await page.goto(`/jogadores/${self.username}`);

    await expect(page.getByRole('link', { name: 'Editar perfil' })).toBeVisible();
    await expect(page.getByTestId(`seguir-${self.username}`)).toHaveCount(0);
  });

  test('CA-F12-22: as páginas de seguidores/seguindo listam, ordenam, paginam e tratam vazio e 404', async ({
    page,
  }) => {
    const owner = uniqueUser('seg_ui_lista');
    await createUserThroughApi(owner);
    const ownerId = await userId(owner.username);

    // Estado vazio antes de qualquer vínculo.
    await page.goto(`/jogadores/${owner.username}/seguidores`);
    await expect(page.getByTestId('seguidores-vazio')).toContainText('Ainda não tem seguidores');
    await expect(page.getByTestId('seguidores-titulo')).toHaveText(owner.username);

    await page.goto(`/jogadores/${owner.username}/seguindo`);
    await expect(page.getByTestId('seguidores-vazio')).toContainText('Ainda não segue ninguém');

    // 21 seguidores: exercita a paginação (pageSize 20) e a ordenação por username.
    const followers = Array.from({ length: 21 }, (_, index) =>
      `seguidor_${String(index).padStart(2, '0')}_${RUN}`.slice(0, 30),
    );
    await createFixtureUsers(followers);

    for (const username of followers) {
      await createFollow(prisma, { followerId: await userId(username), followingId: ownerId });
    }

    await page.goto(`/jogadores/${owner.username}/seguidores`);
    await expect(page.getByTestId('seguidor-item')).toHaveCount(20);
    await expect(page.getByTestId('seguidor-item').nth(0)).toContainText('@seguidor_');

    await page.getByLabel('Ordenar por').selectOption({ label: 'Nome de usuário (A–Z)' });
    await expect(page).toHaveURL(/sort=username/);
    await expect(page.getByTestId('seguidor-item').nth(0)).toContainText('@seguidor_00');

    await page.getByRole('button', { name: 'Próxima' }).click();
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByTestId('seguidor-item')).toHaveCount(1);
    await expect(page.getByTestId('seguidor-item')).toContainText('@seguidor_20');

    // Username inexistente exibe a página 404 (mesmo tratamento do perfil).
    await page.goto('/jogadores/perfil_inexistente_seg/seguidores');
    await expect(page.getByTestId('pagina-404')).toBeVisible();
  });
});
