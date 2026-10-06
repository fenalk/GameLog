import { PrismaPg } from '@prisma/adapter-pg';
import { expect, request, test, type Page } from '@playwright/test';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { createGame, createPlatform } from '../helpers/catalog.js';
import { createGameLog } from '../helpers/game-logs.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

// O arquivo roda em série: as fixtures do catálogo são preparadas uma vez e
// compartilhadas pelas verificações (a F4, que criaria jogos pela API, ainda não existe).
test.describe.configure({ mode: 'serial' });

const PASSWORD = 'senhaForte1';
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const PAGE_SIZE = 20;
/** Quantidade de registros do cenário de paginação (uma página completa + 1). */
const PAGINATED_LOGS = PAGE_SIZE + 1;

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

const PLATFORM_PC = `pc-${RUN}`;
const PLATFORM_PS5 = `ps5-${RUN}`;
const GAME_A_SLUG = `zeloria-${RUN}`;
const GAME_A_TITLE = `Zeloria ${RUN}`;
const GAME_B_SLUG = `aetheria-${RUN}`;
const GAME_B_TITLE = `Aetheria ${RUN}`;
const GAME_NO_PLATFORM_SLUG = `semplataforma-${RUN}`;
const PAGINATED_SLUGS = Array.from(
  { length: PAGINATED_LOGS },
  (_, index) => `pagina-${String(index + 1).padStart(2, '0')}-${RUN}`,
);

let prisma: PrismaClient;

function uniqueUser(prefix: string) {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;
  const username = `${prefix}_${suffix}`.slice(0, 30);

  return { username, email: `${username}@example.com`, password: PASSWORD };
}

/**
 * Cria a conta por um contexto de API isolado: o cookie de refresh não deve vazar para o
 * navegador do teste, que representa um visitante.
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

async function gameId(slug: string): Promise<string> {
  const game = await prisma.game.findUniqueOrThrow({ where: { slug }, select: { id: true } });

  return game.id;
}

async function platformId(slug: string): Promise<string> {
  const platform = await prisma.platform.findUniqueOrThrow({
    where: { slug },
    select: { id: true },
  });

  return platform.id;
}

/** Preenche o formulário do diário a partir dos rótulos visíveis (seção 4 da SPEC F8). */
async function fillDiaryForm(
  page: Page,
  values: {
    status?: string;
    startedAt?: string;
    finishedAt?: string;
    playtimeHours?: string;
    platform?: string;
  },
) {
  if (values.status !== undefined) {
    await page.getByLabel('Status').selectOption({ label: values.status });
  }

  if (values.startedAt !== undefined) {
    await page.getByLabel('Data de início').fill(values.startedAt);
  }

  if (values.finishedAt !== undefined) {
    await page.getByLabel('Data de conclusão').fill(values.finishedAt);
  }

  if (values.playtimeHours !== undefined) {
    await page.getByLabel('Tempo jogado (em horas)').fill(values.playtimeHours);
  }

  if (values.platform !== undefined) {
    await page.getByLabel('Plataforma').selectOption({ label: values.platform });
  }
}

test.beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  await createPlatform(prisma, { name: `PC ${RUN}`, slug: PLATFORM_PC });
  await createPlatform(prisma, { name: `PlayStation 5 ${RUN}`, slug: PLATFORM_PS5 });

  await createGame(prisma, {
    slug: GAME_A_SLUG,
    title: GAME_A_TITLE,
    coverUrl: null,
    platforms: [PLATFORM_PC, PLATFORM_PS5],
  });
  await createGame(prisma, {
    slug: GAME_B_SLUG,
    title: GAME_B_TITLE,
    platforms: [PLATFORM_PC],
  });
  await createGame(prisma, { slug: GAME_NO_PLATFORM_SLUG, title: `Sem Plataforma ${RUN}` });

  await Promise.all(
    PAGINATED_SLUGS.map((slug, index) =>
      createGame(prisma, { slug, title: `Página ${String(index + 1).padStart(2, '0')} ${RUN}` }),
    ),
  );
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('SPEC F8 — diário de jogos jogados (interface)', () => {
  test('CA-F8-17: o jogador adiciona, edita e remove o registro pelo cartão do diário', async ({
    page,
  }) => {
    await createUserWithSession(page, 'diario_crud');

    await page.goto(`/jogos/${GAME_A_SLUG}`);
    await expect(page.getByTestId('diario-adicionar')).toBeVisible();

    await page.getByTestId('diario-adicionar').click();
    await expect(page.getByRole('dialog', { name: 'Adicionar ao diário' })).toBeVisible();

    // Somente as plataformas do jogo aparecem no seletor (RN-F8-06).
    const platformOptions = await page.getByLabel('Plataforma').locator('option').allTextContents();
    expect(platformOptions).toEqual(['Sem plataforma', `PC ${RUN}`, `PlayStation 5 ${RUN}`]);

    await fillDiaryForm(page, {
      status: 'Zerado',
      startedAt: '2024-01-10',
      finishedAt: '2024-02-03',
      playtimeHours: '12,5',
      platform: `PC ${RUN}`,
    });
    await page.getByTestId('salvar-diario').click();

    const card = page.getByTestId('cartao-diario');
    await expect(card).toBeVisible();
    await expect(card).toContainText('No seu diário');
    await expect(card.getByTestId('diario-status')).toHaveText('Zerado');
    await expect(card.getByTestId('diario-inicio')).toHaveText('10/01/2024');
    await expect(card.getByTestId('diario-fim')).toHaveText('03/02/2024');
    await expect(card.getByTestId('diario-tempo')).toHaveText('12h 30min');
    await expect(card.getByTestId('diario-plataforma')).toHaveText(`PC ${RUN}`);

    // Editar: altera o status e o tempo pelo cartão.
    await page.getByTestId('cartao-editar').click();
    await expect(page.getByRole('dialog', { name: 'Editar registro' })).toBeVisible();
    await fillDiaryForm(page, { status: 'Em pausa', playtimeHours: '2,5' });
    await page.getByTestId('salvar-diario').click();

    await expect(page.getByTestId('diario-status')).toHaveText('Em pausa');
    await expect(page.getByTestId('diario-tempo')).toHaveText('2h 30min');
    await expect(page.getByTestId('erro-formulario-diario')).toHaveCount(0);

    // Remover exige confirmação.
    await page.getByTestId('cartao-remover').click();
    await expect(page.getByRole('dialog', { name: 'Remover do diário' })).toBeVisible();
    await page.getByTestId('confirmar-remocao').click();

    await expect(page.getByTestId('cartao-diario')).toHaveCount(0);
    await expect(page.getByTestId('diario-adicionar')).toBeVisible();
  });

  test('CA-F8-18: o dono vê o diário no perfil com as ações de editar e remover', async ({
    page,
  }) => {
    const user = await createUserWithSession(page, 'diario_dono');
    await createGameLog(prisma, {
      userId: await userId(user.username),
      gameId: await gameId(GAME_A_SLUG),
      status: 'COMPLETED',
      startedAt: '2024-01-10',
      finishedAt: '2024-02-03',
      playtimeMinutes: 750,
      platformId: await platformId(PLATFORM_PC),
    });

    await page.goto(`/jogadores/${user.username}`);

    const item = page.getByTestId('diario-item');
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId('diario-status')).toHaveText('Zerado');
    await expect(item.getByTestId('diario-tempo')).toHaveText('12h 30min');
    await expect(item.getByTestId('diario-titulo')).toHaveAttribute(
      'href',
      `/jogos/${GAME_A_SLUG}`,
    );
    await expect(item.getByTestId('diario-editar')).toBeVisible();
    await expect(item.getByTestId('diario-remover')).toBeVisible();

    // O título leva ao jogo.
    await item.getByTestId('diario-titulo').click();
    await expect(page).toHaveURL(`/jogos/${GAME_A_SLUG}`);
  });

  test('CA-F8-18: o visitante vê o mesmo diário sem ações e é levado ao login com returnTo', async ({
    page,
  }) => {
    const user = uniqueUser('diario_visitante');
    await createUserThroughApi(user);
    await createGameLog(prisma, {
      userId: await userId(user.username),
      gameId: await gameId(GAME_B_SLUG),
      status: 'PLAYING',
    });

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('diario-item')).toHaveCount(1);
    await expect(page.getByTestId('diario-editar')).toHaveCount(0);
    await expect(page.getByTestId('diario-remover')).toHaveCount(0);

    // Ao tentar registrar um jogo, o visitante é convidado a entrar e volta ao jogo.
    await page.goto(`/jogos/${GAME_A_SLUG}`);
    await page.getByTestId('diario-entrar').click();

    await expect(page).toHaveURL(`/entrar?returnTo=%2Fjogos%2F${GAME_A_SLUG}`);

    await page.getByLabel('E-mail ou nome de usuário').fill(user.username);
    await page.getByLabel('Senha', { exact: true }).fill(user.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();

    await expect(page).toHaveURL(`/jogos/${GAME_A_SLUG}`);
    await expect(page.getByTestId('diario-adicionar')).toBeVisible();
  });

  test('CA-F8-19: o formulário mostra erros por campo e aceita horas decimais', async ({
    page,
  }) => {
    await createUserWithSession(page, 'diario_erros');

    await page.goto(`/jogos/${GAME_A_SLUG}`);
    await page.getByTestId('diario-adicionar').click();

    // Data de conclusão anterior à de início: erro no campo (validação compartilhada).
    await fillDiaryForm(page, {
      status: 'Zerado',
      startedAt: '2024-02-03',
      finishedAt: '2024-01-10',
    });
    await page.getByTestId('salvar-diario').click();

    await expect(page.getByTestId('erro-finishedAt')).toHaveText(
      'Data de conclusão não pode ser anterior à data de início',
    );
    await expect(page.getByTestId('cartao-diario')).toHaveCount(0);

    // Plataforma que deixa de pertencer ao jogo com o formulário aberto: erro da API no campo.
    await fillDiaryForm(page, {
      finishedAt: '2024-02-03',
      playtimeHours: '12,5',
      platform: `PlayStation 5 ${RUN}`,
    });
    await prisma.gamePlatform.deleteMany({
      where: { gameId: await gameId(GAME_A_SLUG), platformId: await platformId(PLATFORM_PS5) },
    });
    await page.getByTestId('salvar-diario').click();

    await expect(page.getByTestId('erro-platformId')).toBeVisible();

    // Corrigindo a plataforma, o tempo decimal é aceito e exibido formatado.
    await fillDiaryForm(page, { platform: `PC ${RUN}` });
    await page.getByTestId('salvar-diario').click();

    await expect(page.getByTestId('cartao-diario')).toBeVisible();
    await expect(page.getByTestId('diario-tempo')).toHaveText('12h 30min');
  });

  test('CA-F8-20: o diário mostra o estado vazio para quem não registrou jogos', async ({
    page,
  }) => {
    const user = uniqueUser('diario_vazio');
    await createUserThroughApi(user);

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('diario-vazio')).toContainText(
      'Este jogador ainda não registrou jogos',
    );
    await expect(page.getByTestId('diario-lista')).toHaveCount(0);
  });

  test('CA-F8-20: o filtro por status atualiza a lista e a URL', async ({ page }) => {
    const user = uniqueUser('diario_filtro');
    await createUserThroughApi(user);
    const id = await userId(user.username);

    await createGameLog(prisma, {
      userId: id,
      gameId: await gameId(GAME_A_SLUG),
      status: 'COMPLETED',
      updatedAt: new Date('2024-03-01T00:00:00.000Z'),
    });
    await createGameLog(prisma, {
      userId: id,
      gameId: await gameId(GAME_B_SLUG),
      status: 'PLAYING',
      updatedAt: new Date('2024-02-01T00:00:00.000Z'),
    });

    await page.goto(`/jogadores/${user.username}`);
    await expect(page.getByTestId('diario-item')).toHaveCount(2);

    await page.getByLabel('Status').selectOption({ label: 'Jogando' });

    await expect(page).toHaveURL(`/jogadores/${user.username}?status=PLAYING`);
    await expect(page.getByTestId('diario-item')).toHaveCount(1);
    await expect(page.getByTestId('diario-titulo')).toHaveText(GAME_B_TITLE);

    await page.getByLabel('Status').selectOption({ label: 'Abandonado' });

    await expect(page.getByTestId('diario-item')).toHaveCount(0);
    await expect(page.getByTestId('diario-vazio-filtro')).toBeVisible();
  });

  test('CA-F8-20: o diário pagina mantendo a página na URL', async ({ page }) => {
    const user = uniqueUser('diario_pagina');
    await createUserThroughApi(user);
    const id = await userId(user.username);

    for (const [index, slug] of PAGINATED_SLUGS.entries()) {
      await createGameLog(prisma, {
        userId: id,
        gameId: await gameId(slug),
        status: 'BACKLOG',
        updatedAt: new Date(Date.UTC(2024, 0, 1) + index * 60_000),
      });
    }

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('diario-item')).toHaveCount(PAGE_SIZE);
    await expect(page.getByTestId('paginacao-status')).toHaveText(`Página 1 de 2`);

    await page.getByRole('button', { name: 'Próxima' }).click();

    await expect(page).toHaveURL(`/jogadores/${user.username}?page=2`);
    await expect(page.getByTestId('diario-item')).toHaveCount(PAGINATED_LOGS - PAGE_SIZE);
    await expect(page.getByTestId('paginacao-status')).toHaveText('Página 2 de 2');
  });

  test('CA-F8-20: falha na listagem mostra o erro com "Tentar novamente"', async ({ page }) => {
    const user = uniqueUser('diario_erro');
    await createUserThroughApi(user);
    await createGameLog(prisma, {
      userId: await userId(user.username),
      gameId: await gameId(GAME_B_SLUG),
      status: 'ON_HOLD',
    });

    await page.route('**/api/v1/users/**/games*', (route) => route.abort());

    await page.goto(`/jogadores/${user.username}`);

    await expect(page.getByTestId('diario-erro')).toBeVisible();
    await expect(page.getByTestId('diario-vazio')).toHaveCount(0);

    await page.unroute('**/api/v1/users/**/games*');
    await page.getByTestId('tentar-novamente').click();

    await expect(page.getByTestId('diario-item')).toHaveCount(1);
    await expect(page.getByTestId('diario-status')).toHaveText('Em pausa');
  });

  test('CA-F8-17: o jogo sem plataformas aceita somente "Sem plataforma"', async ({ page }) => {
    await createUserWithSession(page, 'diario_sem_plataforma');

    await page.goto(`/jogos/${GAME_NO_PLATFORM_SLUG}`);
    await page.getByTestId('diario-adicionar').click();

    const platformOptions = await page.getByLabel('Plataforma').locator('option').allTextContents();
    expect(platformOptions).toEqual(['Sem plataforma']);

    await fillDiaryForm(page, { status: 'Na fila' });
    await page.getByTestId('salvar-diario').click();

    await expect(page.getByTestId('cartao-diario')).toBeVisible();
    await expect(page.getByTestId('diario-plataforma')).toHaveText('não informada');
  });
});
