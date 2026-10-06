import {
  AUTH_ROUTES,
  GAME_ROUTES,
  apiErrorSchema,
  gameDetailSchema,
  gamesPageSchema,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCatalog } from '../../src/backend/src/modules/catalog/catalog.seed.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createDeveloper, createGame, createGenre, createPlatform } from '../helpers/catalog.js';
import { disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const REGISTRATION = {
  username: 'catalogo_visitante',
  email: 'catalogo@example.com',
  password: 'senhaForte1',
};

/** Fixtures da suíte (equivalente ao seed, mas determinístico para as asserções). */
async function createFixtures(): Promise<void> {
  await createGenre(prisma, { name: 'Aventura', slug: 'aventura' });
  await createGenre(prisma, { name: 'RPG', slug: 'rpg' });
  await createGenre(prisma, { name: 'Ação', slug: 'acao' });
  await createGenre(prisma, { name: 'Puzzle', slug: 'puzzle' });
  await createPlatform(prisma, { name: 'PC', slug: 'pc' });
  await createPlatform(prisma, { name: 'Nintendo Switch', slug: 'nintendo-switch' });
  await createDeveloper(prisma, { name: 'Nebulosa Interativa', slug: 'nebulosa-interativa' });
  await createDeveloper(prisma, { name: 'Pixel Voador', slug: 'pixel-voador' });

  await createGame(prisma, {
    slug: 'the-legend-of-zelda',
    title: 'The Legend of Zelda',
    description: 'Aventura clássica de exploração.',
    genres: ['aventura'],
    platforms: ['nintendo-switch'],
    developers: ['nebulosa-interativa'],
    releaseDate: '1986-02-21',
    ratingAverage: 4.9,
    ratingCount: 10,
    createdAt: new Date('2024-04-01T00:00:00.000Z'),
  });

  await createGame(prisma, {
    slug: 'zeldaria-chronicles',
    title: 'Zeldaria Chronicles',
    genres: ['aventura', 'rpg'],
    platforms: ['pc'],
    developers: ['pixel-voador'],
    releaseDate: '2019-01-10',
    createdAt: new Date('2024-03-01T00:00:00.000Z'),
  });

  await createGame(prisma, {
    slug: 'legend-of-the-fallen',
    title: 'Legend of the Fallen',
    genres: ['acao'],
    platforms: ['pc'],
    releaseDate: '2020-05-05',
    ratingAverage: 4.2,
    ratingCount: 30,
    createdAt: new Date('2024-02-01T00:00:00.000Z'),
  });

  await createGame(prisma, {
    slug: 'mario-adventures',
    title: 'Mario Adventures',
    genres: ['aventura'],
    platforms: ['nintendo-switch'],
    releaseDate: '2021-03-01',
    ratingAverage: 4.5,
    ratingCount: 5,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
  });

  await createGame(prisma, {
    slug: 'sem-lancamento',
    title: 'Sem Lançamento',
    genres: ['puzzle'],
    platforms: ['pc'],
    releaseDate: null,
    createdAt: new Date('2023-12-01T00:00:00.000Z'),
  });

  await createGame(prisma, {
    slug: 'antigo-classico',
    title: 'Antigo Clássico',
    genres: ['rpg'],
    platforms: ['nintendo-switch'],
    releaseDate: '2010-06-15',
    ratingAverage: 3.5,
    ratingCount: 2,
    createdAt: new Date('2023-11-01T00:00:00.000Z'),
  });
}

function titlesOf(body: { data: { title: string }[] }): string[] {
  return body.data.map((game) => game.title);
}

describe('SPEC F3 — consulta e pesquisa de jogos (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F3-13 (o evento só
    // existe em NODE_ENV=test — ver lib/prisma.ts).
    (prisma as unknown as { $on: (event: string, listener: () => void) => void }).$on(
      'query',
      () => {
        queryCount += 1;
      },
    );
  });

  beforeEach(async () => {
    await resetDatabase();
    await createFixtures();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  function getList(query = '') {
    return request(app.server).get(`${testPath(GAME_ROUTES.list)}${query}`);
  }

  function getGame(identifier: string) {
    return request(app.server).get(testPath(`/games/${identifier}`));
  }

  describe('listagem e paginação', () => {
    it('CA-F3-01: GET /games sem token retorna 200 no formato { data, meta } com os campos da SPEC', async () => {
      const response = await getList();

      expect(response.status).toBe(200);
      expect(gamesPageSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.meta).toEqual({ page: 1, pageSize: 20, total: 6, totalPages: 1 });

      const item = response.body.data[0];

      expect(Object.keys(item).sort()).toEqual([
        'coverUrl',
        'genres',
        'id',
        'platforms',
        'ratingAverage',
        'ratingCount',
        'releaseDate',
        'slug',
        'title',
      ]);
      expect(item.genres[0]).toEqual(
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      );
      expect(JSON.stringify(response.body)).not.toContain('description');
      expect(JSON.stringify(response.body)).not.toContain('developers');
    });

    it('CA-F3-01: usuário autenticado também acessa a listagem (RN-F3-01)', async () => {
      const registration = await request(app.server)
        .post(testPath(AUTH_ROUTES.register))
        .send(REGISTRATION);

      expect(registration.status).toBe(201);

      const response = await getList().set(
        'Authorization',
        `Bearer ${registration.body.accessToken}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.meta.total).toBe(6);
    });

    it('CA-F3-02: page/pageSize respeitam limites e página além do fim retorna data vazia', async () => {
      const tooLarge = await getList('?pageSize=101');
      const zeroPage = await getList('?page=0');
      const nonNumeric = await getList('?page=abc');
      const nonNumericSize = await getList('?pageSize=abc');

      for (const response of [tooLarge, zeroPage, nonNumeric, nonNumericSize]) {
        expect(response.status).toBe(400);
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }

      const beyond = await getList('?page=9&pageSize=2');

      expect(beyond.status).toBe(200);
      expect(beyond.body.data).toEqual([]);
      expect(beyond.body.meta).toEqual({ page: 9, pageSize: 2, total: 6, totalPages: 3 });
    });

    it('CA-F3-03: sem q a ordenação padrão é popularity; com q é relevance', async () => {
      const withoutQuery = await getList();

      expect(withoutQuery.status).toBe(200);
      expect(titlesOf(withoutQuery.body)).toEqual([
        'Legend of the Fallen',
        'The Legend of Zelda',
        'Mario Adventures',
        'Antigo Clássico',
        'Sem Lançamento',
        'Zeldaria Chronicles',
      ]);

      const withQuery = await getList('?q=legend');

      expect(withQuery.status).toBe(200);
      expect(titlesOf(withQuery.body)).toEqual(['Legend of the Fallen', 'The Legend of Zelda']);
    });
  });

  describe('busca', () => {
    it('CA-F3-04: q ignora maiúsculas e acentos', async () => {
      const lower = await getList('?q=zelda');
      const upper = await getList('?q=ZELDA');
      const accented = await getList('?q=Z%C3%A9ld%C3%A0');

      for (const response of [lower, upper, accented]) {
        expect(response.status).toBe(200);
        expect(titlesOf(response.body)).toEqual(['Zeldaria Chronicles', 'The Legend of Zelda']);
      }
    });

    it('CA-F3-05: todos os termos precisam aparecer no título, em qualquer ordem', async () => {
      const bothTerms = await getList('?q=legend%20zelda');
      const withMissingTerm = await getList('?q=legend%20mario');

      expect(bothTerms.status).toBe(200);
      expect(titlesOf(bothTerms.body)).toEqual(['The Legend of Zelda']);

      expect(withMissingTerm.status).toBe(200);
      expect(withMissingTerm.body.data).toEqual([]);
      expect(withMissingTerm.body.meta.total).toBe(0);
    });

    it('CA-F3-06: relevância prioriza título idêntico, prefixo, início de palavra e demais', async () => {
      await createGame(prisma, { slug: 'zelda', title: 'Zelda' });
      await createGame(prisma, { slug: 'zelda-ii', title: 'Zelda II' });
      await createGame(prisma, { slug: 'a-zelda-story', title: 'A Zelda Story' });
      await createGame(prisma, { slug: 'mozelda', title: 'Mozelda' });

      const response = await getList('?q=zelda');

      expect(response.status).toBe(200);
      expect(titlesOf(response.body)).toEqual([
        'Zelda',
        'Zelda II',
        'Zeldaria Chronicles',
        'The Legend of Zelda',
        'A Zelda Story',
        'Mozelda',
      ]);
    });

    it('CA-F3-07: q acima de 100 caracteres retorna 400; q vazio ou só espaços é ignorado', async () => {
      const tooLong = await getList(`?q=${'a'.repeat(101)}`);
      const empty = await getList('?q=');
      const blank = await getList('?q=%20%20%20');

      expect(tooLong.status).toBe(400);
      expect(apiErrorSchema.safeParse(tooLong.body).success).toBe(true);

      for (const response of [empty, blank]) {
        expect(response.status).toBe(200);
        expect(response.body.meta.total).toBe(6);
      }
    });
  });

  describe('filtros e ordenação', () => {
    it('CA-F3-08: dentro do filtro vale "ou"; entre filtros diferentes vale "e"', async () => {
      const genres = await getList('?genre=rpg&genre=acao');

      expect(genres.status).toBe(200);
      expect(titlesOf(genres.body).sort()).toEqual([
        'Antigo Clássico',
        'Legend of the Fallen',
        'Zeldaria Chronicles',
      ]);

      const withPlatform = await getList('?genre=rpg&genre=acao&platform=pc');

      expect(withPlatform.status).toBe(200);
      expect(titlesOf(withPlatform.body).sort()).toEqual([
        'Legend of the Fallen',
        'Zeldaria Chronicles',
      ]);

      const byDeveloper = await getList('?developer=nebulosa-interativa');

      expect(byDeveloper.status).toBe(200);
      expect(titlesOf(byDeveloper.body)).toEqual(['The Legend of Zelda']);

      const combined = await getList('?genre=rpg&developer=nebulosa-interativa');

      expect(combined.status).toBe(200);
      expect(combined.body.data).toEqual([]);
    });

    it('CA-F3-09: filtros de ano e nota mínima excluem jogos sem data ou sem nota', async () => {
      const from2020 = await getList('?releaseYearFrom=2020');

      expect(titlesOf(from2020.body).sort()).toEqual(['Legend of the Fallen', 'Mario Adventures']);

      const decade = await getList('?releaseYearFrom=2010&releaseYearTo=2019');

      expect(titlesOf(decade.body).sort()).toEqual(['Antigo Clássico', 'Zeldaria Chronicles']);

      const minRating = await getList('?minRating=4');

      expect(titlesOf(minRating.body).sort()).toEqual([
        'Legend of the Fallen',
        'Mario Adventures',
        'The Legend of Zelda',
      ]);
    });

    it('CA-F3-10: slug inexistente retorna lista vazia; formato inválido retorna 400', async () => {
      const unknownSlug = await getList('?genre=inexistente');

      expect(unknownSlug.status).toBe(200);
      expect(unknownSlug.body.data).toEqual([]);
      expect(unknownSlug.body.meta.total).toBe(0);

      const invalidYear = await getList('?releaseYearFrom=abc');
      const invalidRating = await getList('?minRating=9');

      for (const response of [invalidYear, invalidRating]) {
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('CA-F3-11: sort=rating/title/release_date/recently_added ordenam em asc e desc', async () => {
      const ratingDesc = await getList('?sort=rating');
      const ratingAsc = await getList('?sort=rating&order=asc');

      expect(titlesOf(ratingDesc.body)).toEqual([
        'The Legend of Zelda',
        'Mario Adventures',
        'Legend of the Fallen',
        'Antigo Clássico',
        'Sem Lançamento',
        'Zeldaria Chronicles',
      ]);
      expect(titlesOf(ratingAsc.body)).toEqual([
        'Antigo Clássico',
        'Legend of the Fallen',
        'Mario Adventures',
        'The Legend of Zelda',
        'Sem Lançamento',
        'Zeldaria Chronicles',
      ]);

      const titleAsc = await getList('?sort=title&order=asc');
      const titleDesc = await getList('?sort=title&order=desc');

      expect(titlesOf(titleAsc.body)).toEqual([
        'Antigo Clássico',
        'Legend of the Fallen',
        'Mario Adventures',
        'Sem Lançamento',
        'The Legend of Zelda',
        'Zeldaria Chronicles',
      ]);
      expect(titlesOf(titleDesc.body)).toEqual([...titlesOf(titleAsc.body)].reverse());

      const dateAsc = await getList('?sort=release_date&order=asc');
      const dateDesc = await getList('?sort=release_date');

      expect(titlesOf(dateAsc.body)).toEqual([
        'The Legend of Zelda',
        'Antigo Clássico',
        'Zeldaria Chronicles',
        'Legend of the Fallen',
        'Mario Adventures',
        'Sem Lançamento',
      ]);
      expect(titlesOf(dateDesc.body)).toEqual([
        'Mario Adventures',
        'Legend of the Fallen',
        'Zeldaria Chronicles',
        'Antigo Clássico',
        'The Legend of Zelda',
        'Sem Lançamento',
      ]);

      const recent = await getList('?sort=recently_added');
      const old = await getList('?sort=recently_added&order=asc');

      expect(titlesOf(recent.body)[0]).toBe('The Legend of Zelda');
      expect(titlesOf(old.body)[0]).toBe('Antigo Clássico');
    });

    it('CA-F3-12: sort=relevance sem q retorna 400', async () => {
      const response = await getList('?sort=relevance');

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('CA-F3-13: o número de consultas ao banco não depende do pageSize', async () => {
      for (let index = 0; index < 30; index += 1) {
        await createGame(prisma, { slug: `extra-${index}`, title: `Extra ${index}` });
      }

      // Aquece o cliente (primeira consulta abre conexão/prepared statements).
      await getList('?pageSize=1');

      queryCount = 0;
      await getList('?pageSize=5');
      const smallPage = queryCount;

      queryCount = 0;
      await getList('?pageSize=50');
      const largePage = queryCount;

      expect(smallPage).toBeGreaterThan(0);
      expect(largePage).toBe(smallPage);
    });
  });

  describe('detalhe', () => {
    it('CA-F3-14: GET /games/:game funciona com slug e com id', async () => {
      const stored = await prisma.game.findUniqueOrThrow({
        where: { slug: 'the-legend-of-zelda' },
      });

      const bySlug = await getGame('the-legend-of-zelda');
      const byId = await getGame(stored.id);

      expect(bySlug.status).toBe(200);
      expect(byId.status).toBe(200);
      expect(gameDetailSchema.safeParse(bySlug.body).success).toBe(true);
      expect(byId.body).toEqual(bySlug.body);
      expect(bySlug.body).toMatchObject({
        slug: 'the-legend-of-zelda',
        title: 'The Legend of Zelda',
        description: 'Aventura clássica de exploração.',
        releaseDate: '1986-02-21',
        coverUrl: null,
        ratingAverage: 4.9,
        ratingCount: 10,
        genres: [{ name: 'Aventura', slug: 'aventura' }],
        platforms: [{ name: 'Nintendo Switch', slug: 'nintendo-switch' }],
        developers: [{ name: 'Nebulosa Interativa', slug: 'nebulosa-interativa' }],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    });

    it('CA-F3-15: jogo inexistente (slug ou UUID) retorna 404 NOT_FOUND', async () => {
      const missingSlug = await getGame('jogo-que-nao-existe');
      const missingId = await getGame('3f2504e0-4f89-41d3-9a0c-0305e82c3301');

      for (const response of [missingSlug, missingId]) {
        expect(response.status).toBe(404);
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('seed de desenvolvimento', () => {
    it('CA-F3-23: o seed é idempotente e não roda em produção', async () => {
      await resetDatabase();

      const first = await seedCatalog(prisma, 'test');

      expect(first.status).toBe('seeded');
      expect(first.games).toBeGreaterThanOrEqual(20);

      const gamesAfterFirst = await prisma.game.count();
      const genresAfterFirst = await prisma.genre.count();

      const second = await seedCatalog(prisma, 'test');

      expect(second).toMatchObject({ status: 'seeded', games: 0 });
      expect(await prisma.game.count()).toBe(gamesAfterFirst);
      expect(await prisma.genre.count()).toBe(genresAfterFirst);

      expect(await seedCatalog(prisma, 'production')).toEqual({ status: 'skipped' });
      expect(await prisma.game.count()).toBe(gamesAfterFirst);
    });
  });
});
