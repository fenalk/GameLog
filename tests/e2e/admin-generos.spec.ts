import { expect, request, test, type Page } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { hashPassword } from '../../src/backend/src/lib/password.js';
import { createGame, createGenre } from '../helpers/catalog.js';
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

test.describe('SPEC F5 — gerenciamento de gênero (interface)', () => {
  test('CA-F5-09: visitante vai para o login; PLAYER vê "Acesso restrito"', async ({ page }) => {
    await page.goto('/admin/generos');

    await expect(page).toHaveURL(/\/entrar\?returnTo=%2Fadmin%2Fgeneros$/);

    const player = await createPlayerThroughApi();

    await loginViaUi(page, player);
    await page.goto('/admin/generos');

    await expect(page.getByTestId('acesso-restrito')).toBeVisible();
    await expect(page.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('menu-admin-generos')).toHaveCount(0);
  });

  test('CA-F5-22: ADMIN cria, renomeia e exclui um gênero; slug tem prévia e é imutável', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await expect(page.getByTestId('menu-admin-generos')).toBeVisible();
    await page.goto('/admin/generos');
    await expect(page.getByRole('heading', { name: 'Gêneros', exact: true })).toBeVisible();

    const name = `Ficção Científica ${RUN}`;
    const slug = `ficcao-cientifica-${RUN}`;

    await page.getByLabel('Nome').fill(name);
    await expect(page.getByTestId('slug-preview')).toContainText(slug);

    await page.getByRole('button', { name: 'Criar gênero' }).click();
    await expect(page.getByTestId('genero-sucesso')).toHaveText('Gênero criado com sucesso.');

    const row = page.getByTestId(`genero-${slug}`);

    await expect(row).toContainText(name);
    await expect(page.getByTestId(`genero-jogos-${slug}`)).toHaveText('0');

    // Renomeação: somente o nome muda; o slug fica visível como somente leitura.
    await row.getByRole('button', { name: 'Renomear' }).click();
    await expect(page.getByText(/Slug \(não pode ser alterado\)/)).toBeVisible();

    await page.getByLabel('Novo nome').fill(`Ficção Renomeada ${RUN}`);
    await page.getByRole('button', { name: 'Salvar' }).click();

    await expect(page.getByTestId(`genero-sucesso-${slug}`)).toBeVisible();
    await expect(row).toContainText(`Ficção Renomeada ${RUN}`);
    await expect(row).toContainText(slug);

    // Exclusão com confirmação informando a quantidade de jogos.
    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`genero-confirmacao-${slug}`)).toContainText(
      '0 jogos vinculados',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`genero-${slug}`)).toHaveCount(0);
  });

  test('CA-F5-23: excluir gênero em uso exibe o erro e mantém o registro', async ({ page }) => {
    const genre = { name: `Em uso ${RUN}`, slug: `em-uso-${RUN}` };

    await withPrisma(async (prisma) => {
      await createGenre(prisma, genre);
      await createGame(prisma, {
        slug: `jogo-em-uso-${RUN}`,
        title: 'Jogo em uso',
        genres: [genre.slug],
      });
    });

    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/generos');

    const row = page.getByTestId(`genero-${genre.slug}`);

    await expect(page.getByTestId(`genero-jogos-${genre.slug}`)).toHaveText('1');

    await row.getByRole('button', { name: 'Excluir' }).click();
    await expect(page.getByTestId(`genero-confirmacao-${genre.slug}`)).toContainText(
      '1 jogo vinculado',
    );
    await page.getByRole('button', { name: 'Confirmar exclusão' }).click();

    await expect(page.getByTestId(`genero-erro-${genre.slug}`)).toContainText(
      'não pode ser excluído',
    );
    await expect(row).toBeVisible();
  });

  test('CA-F5-24: gênero criado aparece no filtro do catálogo e filtra via slug', async ({
    page,
  }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);
    await page.goto('/admin/generos');

    const name = `Filtrado ${RUN}`;
    const slug = `filtrado-${RUN}`;

    await page.getByLabel('Nome').fill(name);
    await page.getByRole('button', { name: 'Criar gênero' }).click();
    await expect(page.getByTestId(`genero-${slug}`)).toBeVisible();

    await page.goto('/jogos');

    const option = page.getByLabel(name);

    await expect(option).toBeVisible();
    await option.check();

    await expect(page).toHaveURL(new RegExp(`genre=${slug}`));
    await expect(page.getByTestId('catalogo-vazio')).toContainText('Nenhum jogo encontrado');
  });

  test('CA-F5-22: a listagem exibe estados de carregamento, vazio e erro', async ({ page }) => {
    const admin = await createAdminUser();

    await loginViaUi(page, admin);

    // Carregamento: a resposta de GET /genres fica presa até a verificação do esqueleto.
    let releaseGenres = () => {};
    const genresGate = new Promise<void>((resolve) => {
      releaseGenres = resolve;
    });

    await page.route('**/api/v1/genres', async (route) => {
      await genresGate;
      await route.continue();
    });

    await page.goto('/admin/generos');
    await expect(page.getByTestId('generos-carregando')).toBeVisible();

    releaseGenres();
    await expect(page.getByRole('table')).toBeVisible();
    await page.unroute('**/api/v1/genres');

    // Lista vazia.
    await page.route('**/api/v1/genres', (route) => route.fulfill({ json: { data: [] } }));
    await page.goto('/admin/generos');
    await expect(page.getByTestId('generos-vazio')).toHaveText('Nenhum gênero cadastrado');
    await page.unroute('**/api/v1/genres');

    // Erro com "Tentar novamente".
    await page.route('**/api/v1/genres', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
        }),
      }),
    );
    await page.goto('/admin/generos');
    await expect(page.getByTestId('generos-erro')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tentar novamente' })).toBeVisible();
  });
});
