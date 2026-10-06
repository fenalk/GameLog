import { expect, test } from '@playwright/test';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../../src/backend/src/generated/prisma/client.js';
import { seedCatalog } from '../../src/backend/src/modules/catalog/catalog.seed.js';
import { createDeveloper, createGame, createGenre, createPlatform } from '../helpers/catalog.js';
import { resolveTestDatabaseUrl } from '../setup/test-database.js';

// O arquivo roda em série: as fixtures são preparadas uma vez e o estado do catálogo é
// compartilhado pelas verificações (a F4, que criaria jogos pela API, ainda não existe).
test.describe.configure({ mode: 'serial' });

/** Sufixo único por execução para não colidir com dados de execuções anteriores. */
const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1_000_000).toString(36)}`;

const SEARCH_TOKEN = `${RUN}token`;
const GENRE_SLUG = `genero-${RUN}`;
const PLATFORM_SLUG = `plataforma-${RUN}`;
const DEV_SLUG = `estudio-${RUN}`;

const SEARCH_SLUG = `zeloria-${RUN}`;
const FILTER_A_SLUG = `filtro-a-${RUN}`;
const FILTER_B_SLUG = `filtro-b-${RUN}`;
const RATED_SLUGS = [`nota-alta-${RUN}`, `nota-media-${RUN}`, `nota-baixa-${RUN}`];

let prisma: PrismaClient;

test.beforeAll(async () => {
  prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: resolveTestDatabaseUrl() }),
  });

  // Seed de desenvolvimento (SPEC F3, seção 1) + fixtures de teste.
  await seedCatalog(prisma, 'test');

  await createGenre(prisma, { name: `Gênero ${RUN}`, slug: GENRE_SLUG });
  await createGenre(prisma, { name: 'Aventura', slug: 'aventura' });
  await createPlatform(prisma, { name: `Plataforma ${RUN}`, slug: PLATFORM_SLUG });
  await createPlatform(prisma, { name: 'PC', slug: 'pc' });
  await createDeveloper(prisma, { name: `Estúdio ${RUN}`, slug: DEV_SLUG });

  // Busca (CA-F3-18): título com um termo exclusivo da execução.
  await createGame(prisma, {
    slug: SEARCH_SLUG,
    title: `Zeloria ${RUN} ${SEARCH_TOKEN}`,
    description: 'Jogo criado para os testes de busca do catálogo.',
    genres: ['aventura'],
    platforms: ['pc'],
    developers: [DEV_SLUG],
    releaseDate: '2020-05-05',
    coverUrl: null,
  });

  // Filtros (CA-F3-19): A casa com gênero + plataforma; B só com o gênero.
  await createGame(prisma, {
    slug: FILTER_A_SLUG,
    title: `Filtro A ${RUN}`,
    genres: [GENRE_SLUG],
    platforms: [PLATFORM_SLUG],
    releaseDate: '2019-01-01',
  });
  await createGame(prisma, {
    slug: FILTER_B_SLUG,
    title: `Filtro B ${RUN}`,
    genres: [GENRE_SLUG],
    platforms: ['pc'],
    releaseDate: '2018-01-01',
  });

  // Destaques (CA-F3-17): jogos com nota para a seção "Mais bem avaliados".
  await createGame(prisma, {
    slug: RATED_SLUGS[0] as string,
    title: `Nota Alta ${RUN}`,
    genres: ['aventura'],
    platforms: ['pc'],
    ratingAverage: 4.9,
    ratingCount: 25,
    releaseDate: '2021-01-01',
  });
  await createGame(prisma, {
    slug: RATED_SLUGS[1] as string,
    title: `Nota Média ${RUN}`,
    genres: ['aventura'],
    platforms: ['pc'],
    ratingAverage: 3.5,
    ratingCount: 8,
    releaseDate: '2020-01-01',
  });
  await createGame(prisma, {
    slug: RATED_SLUGS[2] as string,
    title: `Nota Baixa ${RUN}`,
    genres: ['aventura'],
    platforms: ['pc'],
    ratingAverage: 2.0,
    ratingCount: 1,
    releaseDate: '2022-01-01',
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('SPEC F3 — consulta e pesquisa de jogos (interface)', () => {
  test('CA-F3-17: visitante vê a Home com as três seções de destaque', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'GameLog' })).toBeVisible();

    for (const section of ['destaque-recentes', 'destaque-melhores', 'destaque-populares']) {
      await expect(page.getByTestId(section).getByTestId('jogo-cartao').first()).toBeVisible();
    }

    await expect(page.getByTestId('destaque-melhores')).toContainText(`Nota Alta ${RUN}`);
  });

  test('CA-F3-18: a busca atualiza a lista e a URL após o debounce; recarregar restaura o estado', async ({
    page,
  }) => {
    await page.goto('/jogos');

    await page.getByLabel('Buscar jogos').fill(SEARCH_TOKEN);

    await expect(page).toHaveURL(new RegExp(`q=${SEARCH_TOKEN}`));
    await expect(page.getByTestId('jogo-cartao')).toHaveCount(1);
    await expect(page.getByTestId('jogo-cartao')).toContainText(`Zeloria ${RUN}`);

    // Busca, ordenação e filtros sincronizados na URL: recarregar restaura o estado.
    await page.goto(`/jogos?q=${SEARCH_TOKEN}&sort=title&order=asc&genre=aventura`);

    await expect(page.getByLabel('Buscar jogos')).toHaveValue(SEARCH_TOKEN);
    await expect(page.getByLabel('Ordenar por')).toHaveValue('title');
    await expect(page.getByLabel('Aventura')).toBeChecked();

    await page.reload();

    await expect(page.getByLabel('Buscar jogos')).toHaveValue(SEARCH_TOKEN);
    await expect(page.getByLabel('Ordenar por')).toHaveValue('title');
    await expect(page.getByLabel('Aventura')).toBeChecked();
    await expect(page.getByTestId('jogo-cartao')).toHaveCount(1);
  });

  test('CA-F3-19: filtros de gênero e plataforma atualizam a grade e a URL; limpar restaura', async ({
    page,
  }) => {
    await page.goto('/jogos');

    await page.getByLabel(`Gênero ${RUN}`).check();

    await expect(page).toHaveURL(new RegExp(`genre=${GENRE_SLUG}`));
    await expect(
      page.getByTestId('jogo-cartao').filter({ hasText: `Filtro A ${RUN}` }),
    ).toBeVisible();
    await expect(
      page.getByTestId('jogo-cartao').filter({ hasText: `Filtro B ${RUN}` }),
    ).toBeVisible();

    // Entre filtros diferentes vale "e": só o jogo A está na plataforma exclusiva.
    await page.getByLabel(`Plataforma ${RUN}`).check();

    await expect(page).toHaveURL(new RegExp(`platform=${PLATFORM_SLUG}`));
    await expect(page.getByTestId('jogo-cartao')).toHaveCount(1);
    await expect(page.getByTestId('jogo-cartao')).toContainText(`Filtro A ${RUN}`);

    await page.getByTestId('limpar-filtros').click();

    await expect(page).not.toHaveURL(/genre=|platform=/);
    await expect(page.getByTestId('jogo-cartao').first()).toBeVisible();
    await expect(page.getByTestId('catalogo-total')).not.toHaveText('0 jogos encontrados');
  });

  test('CA-F3-20: busca sem resultado exibe o estado vazio; falha da API exibe erro com "Tentar novamente"', async ({
    page,
  }) => {
    await page.goto(`/jogos?q=zzz-sem-resultado-${RUN}`);

    await expect(page.getByTestId('catalogo-vazio')).toBeVisible();

    let failing = true;

    await page.route('**/api/v1/games*', async (route) => {
      if (failing) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor' },
          }),
        });
        return;
      }

      await route.continue();
    });

    await page.goto('/jogos');

    await expect(page.getByTestId('catalogo-erro')).toBeVisible();

    failing = false;
    await page.getByTestId('tentar-novamente').click();

    await expect(page.getByTestId('jogo-cartao').first()).toBeVisible();
  });

  test('CA-F3-21: clicar em um cartão abre /jogos/:slug com os dados; jogo inexistente mostra 404', async ({
    page,
  }) => {
    await page.goto(`/jogos?q=${SEARCH_TOKEN}`);

    await page.getByTestId('jogo-cartao').click();

    await expect(page).toHaveURL(new RegExp(`/jogos/${SEARCH_SLUG}$`));
    await expect(page.getByTestId('jogo-titulo')).toHaveText(`Zeloria ${RUN} ${SEARCH_TOKEN}`);
    await expect(page.getByTestId('jogo-descricao')).toContainText('testes de busca');
    await expect(page.getByTestId('jogo-lancamento')).toContainText('2020');
    await expect(page).toHaveTitle(new RegExp(`Zeloria ${RUN}`));

    await page.goto(`/jogos/jogo-inexistente-${RUN}`);

    await expect(page.getByTestId('pagina-404')).toBeVisible();
  });

  test('CA-F3-22: visitante clicando em uma ação de jogador vai para /entrar?returnTo=/jogos/:slug', async ({
    page,
  }) => {
    await page.goto(`/jogos/${SEARCH_SLUG}`);

    await page.getByRole('link', { name: 'Avaliar' }).click();

    const returnTo = encodeURIComponent(`/jogos/${SEARCH_SLUG}`);

    await expect(page).toHaveURL(`/entrar?returnTo=${returnTo}`);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  });
});
