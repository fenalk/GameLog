import { expect, request, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { hashPassword } from '../../src/backend/src/lib/password.js';
import { createGame, createPlatform } from '../helpers/catalog.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

/** Contador para que cada teste crie seu próprio usuário (sem colisão de username). */
let userCounter = 0;

type TestUser = { username: string; email: string; password: string };

async function withPrisma<T>(callback: (prisma: PrismaClient) => Promise<T>): Promise<T> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  try {
    return await callback(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

/** Conta ADMIN criada direto no banco: não há cadastro público de administrador (RN-F1-01). */
async function createAdminUser(): Promise<TestUser> {
  userCounter += 1;

  const username = `admin_plat_${RUN}_${userCounter}`.slice(0, 30);
  const user = { username, email: `${username}@example.com`, password: PASSWORD };
  const passwordHash = await hashPassword(PASSWORD);

  await withPrisma((prisma) =>
    prisma.user.create({
      data: { username, email: user.email, passwordHash, role: 'ADMIN' },
    }),
  );

  return user;
}

async function createPlayerThroughApi(): Promise<TestUser> {
  userCounter += 1;

  const username = `player_plat_${RUN}_${userCounter}`.slice(0, 30);
  const user = { username, email: `${username}@example.com`, password: PASSWORD };
  const api = await request.newContext({ baseURL: BASE_URL });

  try {
    const response = await api.post('/api/v1/auth/register', { data: user });

    expect(response.status()).toBe(201);
  } finally {
    await api.dispose();
  }

  return user;
}

async function loginViaUi(page: Page, user: { username: string; password: string }): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail ou nome de usuário').fill(user.username);
  await page.getByLabel('Senha', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('usuario-atual')).toHaveText(user.username);
}

test.describe('SPEC F6 — gerenciamento de plataforma (interface)', () => {
  test('CA-F6-09: visitante vai para o login; PLAYER vê "Acesso restrito"', async ({ page }) => {
    await page.goto('/admin/plataformas');

    await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fadmin%2Fplataformas$/);

    const player = await createPlayerThroughApi();

    await loginViaUi(page, player);
    await page.goto('/admin/plataformas');

    await expect(page.getByTestId('acesso-restrito')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('menu-admin-plataformas')).toHaveCount(0);
  });

  test('CA-F6-22: ADMIN cria, renomeia e exclui uma plataforma; slug tem prévia e é imutável', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await expect(page.getByTestId('menu-admin-plataformas')).toBeVisible();
    await page.goto('/admin/plataformas');
    await expect(page.getByRole('heading', { name: 'Plataformas', exact: true })).toBeVisible();

    const name = `PlayStation 6 ${RUN}`;
    const slug = `playstation-6-${RUN}`;

    await page.getByLabel('Nome').fill(name);
    await expect(page.getByTestId('slug-preview')).toContainText(slug);

    await page.getByRole('button', { name: 'Criar plataforma' }).click();
    await expect(page.getByTestId('plataforma-sucesso')).toHaveText(
      'Plataforma criada com sucesso.',
    );

    const row = page.getByTestId(`plataforma-${slug}`);

    await expect(row).toContainText(name);
    await expect(page.getByTestId(`plataforma-jogos-${slug}`)).toHaveText('0');

    // Renomeação: somente o nome muda; o slug fica visível como somente leitura.
    await row.getByRole('button', { name: 'Renomear' }).click();
    await expect(page.getByText(/Slug \(não pode ser alterado\)/)).toBeVisible();

    await page.getByLabel('Novo nome').fill(`PlayStation 6 Pro ${RUN}`);
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByTestId(`plataforma-sucesso-${slug}`)).toBeVisible();
    await expect(row).toContainText(`PlayStation 6 Pro ${RUN}`);
    await expect(row).toContainText(slug);

    // Exclusão com confirmação informando a quantidade de jogos.
    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`plataforma-confirmacao-${slug}`)).toContainText(
      '0 jogos vinculados',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`plataforma-${slug}`)).toHaveCount(0);
  });

  test('CA-F6-23: excluir plataforma em uso exibe o erro e mantém o registro', async ({ page }) => {
    const platform = { name: `Em uso ${RUN}`, slug: `em-uso-${RUN}` };

    await withPrisma(async (prisma) => {
      await createPlatform(prisma, platform);
      await createGame(prisma, {
        slug: `jogo-em-uso-${RUN}`,
        title: 'Jogo em uso',
        platforms: [platform.slug],
      });
    });

    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/plataformas');

    const row = page.getByTestId(`plataforma-${platform.slug}`);

    await expect(page.getByTestId(`plataforma-jogos-${platform.slug}`)).toHaveText('1');

    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`plataforma-confirmacao-${platform.slug}`)).toContainText(
      '1 jogo vinculado',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`plataforma-erro-${platform.slug}`)).toContainText(
      'não pode ser excluída',
    );
    await expect(row).toBeVisible();
  });

  test('CA-F6-24: plataforma criada aparece no filtro do catálogo e filtra via slug', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/plataformas');

    const name = `Plataforma Filtro ${RUN}`;
    const slug = `plataforma-filtro-${RUN}`;

    await page.getByLabel('Nome').fill(name);
    await page.getByRole('button', { name: 'Criar plataforma' }).click();
    await expect(page.getByTestId(`plataforma-${slug}`)).toBeVisible();

    await page.goto('/jogos');

    const option = page.getByLabel(name);

    await expect(option).toBeVisible();
    await option.check();

    await expect(page).toHaveURL(new RegExp(`platform=${slug}`));
    await expect(page.getByTestId('catalogo-vazio')).toContainText('Nenhum jogo encontrado');
  });

  test('CA-F6-22: a listagem exibe estados de carregamento, vazio e erro', async ({ page }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);

    // Carregamento: a resposta de GET /platforms fica presa até a verificação do estado.
    let releasePlatforms = () => {};
    const platformsGate = new Promise<void>((resolve) => {
      releasePlatforms = resolve;
    });

    await page.route('**/api/v1/platforms', async (route) => {
      await platformsGate;
      await route.continue();
    });

    await page.goto('/admin/plataformas');
    await expect(page.getByTestId('plataformas-carregando')).toBeVisible();

    releasePlatforms();
    await expect(page.getByRole('table')).toBeVisible();
    await page.unroute('**/api/v1/platforms');

    // Lista vazia.
    await page.route('**/api/v1/platforms', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/admin/plataformas');
    await expect(page.getByTestId('plataformas-vazio')).toHaveText('Nenhuma plataforma cadastrada');
    await page.unroute('**/api/v1/platforms');

    // Erro com "Tentar novamente".
    await page.route('**/api/v1/platforms', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
        }),
      }),
    );
    await page.goto('/admin/plataformas');
    await expect(page.getByTestId('plataformas-erro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
