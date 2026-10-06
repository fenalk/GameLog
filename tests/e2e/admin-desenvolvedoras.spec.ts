import { expect, request, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { hashPassword } from '../../src/backend/src/lib/password.js';
import { createDeveloper, createGame } from '../helpers/catalog.js';
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

  const username = `admin_${RUN}_${userCounter}`.slice(0, 30);
  const user = { username, email: `${username}@example.com`, password: PASSWORD };
  const passwordHash = await hashPassword(PASSWORD);

  await withPrisma((prisma) =>
    prisma.user.create({
      data: {
        username,
        email: user.email,
        passwordHash,
        role: 'ADMIN',
      },
    }),
  );

  return user;
}

async function createPlayerThroughApi(): Promise<TestUser> {
  userCounter += 1;

  const username = `player_${RUN}_${userCounter}`.slice(0, 30);
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

test.describe('SPEC F7 — gerenciamento de desenvolvedora (interface)', () => {
  test('CA-F7-09: visitante vai para o login; PLAYER vê "Acesso restrito"', async ({ page }) => {
    await page.goto('/admin/desenvolvedoras');

    await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fadmin%2Fdesenvolvedoras$/);

    const player = await createPlayerThroughApi();

    await loginViaUi(page, player);
    await page.goto('/admin/desenvolvedoras');

    await expect(page.getByTestId('acesso-restrito')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('menu-admin-desenvolvedoras')).toHaveCount(0);
  });

  test('CA-F7-22: ADMIN cria, renomeia e exclui uma desenvolvedora; slug tem prévia e é imutável', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await expect(page.getByTestId('menu-admin-desenvolvedoras')).toBeVisible();
    await page.goto('/admin/desenvolvedoras');
    await expect(page.getByRole('heading', { name: 'Desenvolvedoras', exact: true })).toBeVisible();

    const name = `Estúdio Vitral ${RUN}`;
    const slug = `estudio-vitral-${RUN}`;

    // Prévia do slug derivado (acentos e caixa são normalizados).
    await page.getByLabel('Nome').fill(name);
    await expect(page.getByTestId('slug-preview')).toContainText(slug);

    await page.getByRole('button', { name: 'Criar desenvolvedora' }).click();
    await expect(page.getByTestId('desenvolvedora-sucesso')).toHaveText(
      'Desenvolvedora criada com sucesso.',
    );

    const row = page.getByTestId(`desenvolvedora-${slug}`);

    await expect(row).toContainText(name);
    await expect(page.getByTestId(`desenvolvedora-jogos-${slug}`)).toHaveText('0');

    // Renomeação: somente o nome muda; o slug fica visível como somente leitura.
    await row.getByRole('button', { name: 'Renomear' }).click();
    await expect(page.getByText(/Slug \(não pode ser alterado\)/)).toBeVisible();

    await page.getByLabel('Novo nome').fill(`Estúdio Renomeado ${RUN}`);
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByTestId(`desenvolvedora-sucesso-${slug}`)).toBeVisible();
    await expect(row).toContainText(`Estúdio Renomeado ${RUN}`);
    await expect(row).toContainText(slug);

    // Exclusão com confirmação informando a quantidade de jogos.
    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`desenvolvedora-confirmacao-${slug}`)).toContainText(
      '0 jogos vinculados',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`desenvolvedora-${slug}`)).toHaveCount(0);
  });

  test('CA-F7-23: excluir desenvolvedora em uso exibe o erro e mantém o registro', async ({
    page,
  }) => {
    const developer = { name: `Em uso ${RUN}`, slug: `em-uso-${RUN}` };

    await withPrisma(async (prisma) => {
      await createDeveloper(prisma, developer);
      await createGame(prisma, {
        slug: `jogo-em-uso-${RUN}`,
        title: 'Jogo em uso',
        developers: [developer.slug],
      });
    });

    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/desenvolvedoras');

    const row = page.getByTestId(`desenvolvedora-${developer.slug}`);

    await expect(page.getByTestId(`desenvolvedora-jogos-${developer.slug}`)).toHaveText('1');

    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`desenvolvedora-confirmacao-${developer.slug}`)).toContainText(
      '1 jogo vinculado',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`desenvolvedora-erro-${developer.slug}`)).toContainText(
      'não pode ser excluída',
    );
    await expect(row).toBeVisible();
  });

  test('CA-F7-24: desenvolvedora criada aparece no filtro do catálogo e filtra via slug', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/desenvolvedoras');

    const name = `Filtrado ${RUN}`;
    const slug = `filtrado-${RUN}`;

    await page.getByLabel('Nome').fill(name);
    await page.getByRole('button', { name: 'Criar desenvolvedora' }).click();
    await expect(page.getByTestId(`desenvolvedora-${slug}`)).toBeVisible();

    // Sem vínculos: a opção aparece no painel e o filtro por slug resulta em estado vazio.
    await page.goto('/jogos');

    const option = page.getByLabel(name);

    await expect(option).toBeVisible();
    await option.check();

    await expect(page).toHaveURL(new RegExp(`developer=${slug}`));
    await expect(page.getByTestId('catalogo-vazio')).toContainText('Nenhum jogo encontrado');

    // Vínculo jogo↔desenvolvedora é da F4: criado direto no banco para exercitar o filtro.
    const gameTitle = `Jogo Filtrado ${RUN}`;

    await withPrisma(async (prisma) => {
      await createGame(prisma, {
        slug: `jogo-filtrado-${RUN}`,
        title: gameTitle,
        developers: [slug],
      });
    });

    await page.goto(`/jogos?developer=${slug}`);

    await expect(page.getByTestId('jogo-cartao').filter({ hasText: gameTitle })).toBeVisible();
  });

  test('CA-F7-22: a listagem exibe estados de carregamento, vazio e erro', async ({ page }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);

    // Carregamento: a resposta de GET /developers fica presa até a verificação do estado.
    let releaseDevelopers = () => {};
    const developersGate = new Promise<void>((resolve) => {
      releaseDevelopers = resolve;
    });

    await page.route('**/api/v1/developers', async (route) => {
      await developersGate;
      await route.continue();
    });

    await page.goto('/admin/desenvolvedoras');
    await expect(page.getByTestId('desenvolvedoras-carregando')).toBeVisible();

    releaseDevelopers();
    await expect(page.getByRole('table')).toBeVisible();
    await page.unroute('**/api/v1/developers');

    // Lista vazia.
    await page.route('**/api/v1/developers', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/admin/desenvolvedoras');
    await expect(page.getByTestId('desenvolvedoras-vazio')).toHaveText(
      'Nenhuma desenvolvedora cadastrada',
    );
    await page.unroute('**/api/v1/developers');

    // Erro com "Tentar novamente".
    await page.route('**/api/v1/developers', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
        }),
      }),
    );
    await page.goto('/admin/desenvolvedoras');
    await expect(page.getByTestId('desenvolvedoras-erro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
