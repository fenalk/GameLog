import {
  AUTH_ROUTES,
  REVIEW_ROUTES,
  apiErrorSchema,
  gameDetailSchema,
  reviewDetailSchema,
  reviewGamePath,
  reviewMePath,
  reviewPageSchema,
  reviewPath,
  reviewPublicPath,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame, createPlatform } from '../helpers/catalog.js';
import { createGameLog } from '../helpers/game-logs.js';
import { createReview } from '../helpers/reviews.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';

/** Esquema do cabeçalho de autenticação usado pelos testes (montado por partes). */
const AUTH_SCHEME = 'Bearer';

const GAME_A = 'cronicas'; // Crônicas de Aetheria
const GAME_B = 'acao-total'; // Ação Total
const GAME_C = 'zeloria'; // Zeloria

/** Corpo válido do `PUT` (seção 3 da SPEC F10). */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Uma aula de level design',
    body: 'O jogo acerta ao ensinar sem tutorial.\n\nO terceiro ato perde ritmo.',
    ...overrides,
  };
}

describe('SPEC F10 — escrita e gerenciamento de resenhas (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F10-16 (o evento só
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
    await createPlatform(prisma, { name: 'PC', slug: 'pc' });

    await createGame(prisma, {
      slug: GAME_A,
      title: 'Crônicas de Aetheria',
      coverUrl: 'https://exemplo.com/cronicas.jpg',
    });
    await createGame(prisma, { slug: GAME_B, title: 'Ação Total' });
    await createGame(prisma, { slug: GAME_C, title: 'Zeloria' });
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  function get(path: string, token?: string, query: Record<string, unknown> = {}) {
    const call = request(app.server).get(testPath(path)).query(query);

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function put(path: string, body: unknown, token?: string) {
    const call = request(app.server).put(testPath(path)).send(body);

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function patch(path: string, body: unknown, token?: string) {
    const call = request(app.server).patch(testPath(path)).send(body);

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function remove(path: string, token?: string, body?: unknown) {
    const call = request(app.server).delete(testPath(path));

    if (body !== undefined) {
      call.send(body);
    }

    return token ? call.set('Authorization', `${AUTH_SCHEME} ${token}`) : call;
  }

  function post(path: string, body: unknown) {
    return request(app.server).post(testPath(path)).send(body);
  }

  /** Cria a conta e devolve o access token (a senha é a mesma de todos os cenários). */
  async function login(username: string, role?: 'ADMIN'): Promise<string> {
    await createTestUser({
      username,
      email: `${username}@example.com`,
      password: VALID_PASSWORD,
      ...(role ? { role } : {}),
    });

    const response = await post(AUTH_ROUTES.login, {
      identifier: username,
      password: VALID_PASSWORD,
    });

    expect(response.status).toBe(200);

    return response.body.accessToken as string;
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

  function expectValidationError(
    response: { status: number; body: unknown },
    field?: string,
  ): void {
    expect(response.status).toBe(400);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const body = response.body as {
      error: { code: string; details?: { field: string; message: string }[] };
    };

    expect(body.error.code).toBe('VALIDATION_ERROR');

    if (field) {
      expect(body.error.details?.some((detail) => detail.field === field)).toBe(true);
    }
  }

  describe('escrita (autoria)', () => {
    it('CA-F10-01: PUT cria (201) e a resenha aparece nas listagens e no perfil público', async () => {
      const token = await login('jogador_01');

      const created = await put(reviewMePath(GAME_A), validBody(), token);

      expect(created.status).toBe(201);
      const review = reviewDetailSchema.parse(created.body);
      expect(review.title).toBe('Uma aula de level design');
      expect(review.body).toContain('O terceiro ato perde ritmo.');
      expect(review.status).toBe('PUBLISHED');
      expect(review.author).toMatchObject({ username: 'jogador_01' });
      expect(review.game).toEqual({
        id: await gameId(GAME_A),
        slug: GAME_A,
        title: 'Crônicas de Aetheria',
        coverUrl: 'https://exemplo.com/cronicas.jpg',
      });

      const own = reviewPageSchema.parse((await get(REVIEW_ROUTES.myReviews, token)).body);
      expect(own.data.map((item) => item.id)).toEqual([review.id]);
      expect(own.data[0]?.excerpt).toContain('O jogo acerta');

      const byGame = reviewPageSchema.parse((await get(reviewGamePath(GAME_A))).body);
      expect(byGame.data.map((item) => item.id)).toEqual([review.id]);

      const byUser = reviewPageSchema.parse((await get(reviewPublicPath('jogador_01'))).body);
      expect(byUser.data.map((item) => item.id)).toEqual([review.id]);
    });

    it('CA-F10-02: PUT repetido retorna 200, substitui o conteúdo e não duplica', async () => {
      const token = await login('jogador_01');
      const path = reviewMePath(GAME_A);

      const first = await put(path, validBody(), token);
      expect(first.status).toBe(201);

      const second = await put(path, { title: 'Revisitando', body: 'Texto novo.' }, token);
      expect(second.status).toBe(200);

      const review = reviewDetailSchema.parse(second.body);
      expect(review.id).toBe(reviewDetailSchema.parse(first.body).id);
      expect(review.title).toBe('Revisitando');
      expect(review.body).toBe('Texto novo.');
      expect(await prisma.review.count()).toBe(1);
    });

    it('CA-F10-03: PUT valida título, corpo e campos desconhecidos', async () => {
      const token = await login('jogador_01');
      const path = reviewMePath(GAME_A);

      expectValidationError(await put(path, { body: 'Sem título' }, token), 'title');
      expectValidationError(await put(path, { title: '   ', body: 'Corpo' }, token), 'title');
      expectValidationError(
        await put(path, { title: 'x'.repeat(121), body: 'Corpo' }, token),
        'title',
      );
      expectValidationError(await put(path, { title: 'Título' }, token), 'body');
      expectValidationError(await put(path, { title: 'Título', body: '  ' }, token), 'body');
      expectValidationError(
        await put(path, { title: 'Título', body: 'y'.repeat(10_001) }, token),
        'body',
      );
      expectValidationError(
        await put(path, { title: 'Título', body: 'Corpo', status: 'PUBLISHED' }, token),
      );
      expect(await prisma.review.count()).toBe(0);
    });

    it('CA-F10-04: normaliza o título e o corpo (trim, espaços e quebras de linha)', async () => {
      const token = await login('jogador_01');

      const created = await put(
        reviewMePath(GAME_A),
        { title: '  Uma   aula  ', body: '  linha 1\r\nlinha 2\rlinha 3  ' },
        token,
      );

      expect(created.status).toBe(201);
      const review = reviewDetailSchema.parse(created.body);
      expect(review.title).toBe('Uma aula');
      expect(review.body).toBe('linha 1\nlinha 2\nlinha 3');
    });

    it('CA-F10-05: PATCH altera apenas os campos enviados e rejeita corpo vazio/valores nulos', async () => {
      const token = await login('jogador_01');
      const path = reviewMePath(GAME_A);

      const created = reviewDetailSchema.parse((await put(path, validBody(), token)).body);

      const updated = reviewDetailSchema.parse(
        (await patch(path, { title: 'Novo título' }, token)).body,
      );
      expect(updated.title).toBe('Novo título');
      expect(updated.body).toBe(created.body);

      const same = reviewDetailSchema.parse(
        (await patch(path, { title: 'Novo título', body: created.body }, token)).body,
      );
      expect(same.updatedAt).toBe(updated.updatedAt);

      expectValidationError(await patch(path, {}, token));
      expectValidationError(await patch(path, { title: null }, token));
      expectValidationError(await patch(path, { body: '   ' }, token));
      expectValidationError(await patch(path, { title: 'ok', extra: true }, token));

      const missing = await patch(reviewMePath(GAME_B), { title: 'Sem resenha' }, token);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
    });

    it('CA-F10-06: DELETE retorna 204, some das listas, repetir dá 404 e um novo PUT recria', async () => {
      const token = await login('jogador_01');
      const path = reviewMePath(GAME_A);

      const created = reviewDetailSchema.parse((await put(path, validBody(), token)).body);

      const deleted = await remove(path, token);
      expect(deleted.status).toBe(204);
      expect(await prisma.review.count({ where: { id: created.id } })).toBe(0);
      expect(
        reviewPageSchema.parse((await get(REVIEW_ROUTES.myReviews, token)).body).data,
      ).toHaveLength(0);

      const again = await remove(path, token);
      expect(again.status).toBe(404);
      expect(again.body.error.code).toBe('NOT_FOUND');

      const recreated = await put(path, validBody({ title: 'De novo' }), token);
      expect(recreated.status).toBe(201);
      expect(reviewDetailSchema.parse(recreated.body).title).toBe('De novo');
    });

    it('CA-F10-07: GET /me/reviews/:game aceita slug e id; sem resenha ou jogo inexistente dá 404', async () => {
      const token = await login('jogador_01');
      await put(reviewMePath(GAME_A), validBody(), token);

      const bySlug = await get(reviewMePath(GAME_A), token);
      expect(bySlug.status).toBe(200);
      expect(reviewDetailSchema.parse(bySlug.body).game.slug).toBe(GAME_A);

      const byId = await get(reviewMePath(await gameId(GAME_A)), token);
      expect(byId.status).toBe(200);
      expect(byId.body).toEqual(bySlug.body);

      expect((await get(reviewMePath(GAME_B), token)).status).toBe(404);
      expect((await get(reviewMePath('jogo-inexistente'), token)).status).toBe(404);
    });

    it('CA-F10-08: as rotas /me/reviews* exigem token e cada jogador só acessa a própria resenha', async () => {
      const tokenA = await login('jogador_a');
      const tokenB = await login('jogador_b');
      const path = reviewMePath(GAME_A);

      expect((await get(REVIEW_ROUTES.myReviews)).status).toBe(401);
      expect((await get(path)).status).toBe(401);
      expect((await put(path, validBody())).status).toBe(401);
      expect((await patch(path, { title: 'x' })).status).toBe(401);
      expect((await remove(path)).status).toBe(401);
      expect((await put(path, validBody())).body.error.code).toBe('UNAUTHENTICATED');

      const reviewA = reviewDetailSchema.parse(
        (await put(path, validBody({ title: 'A' }), tokenA)).body,
      );
      const reviewB = reviewDetailSchema.parse(
        (await put(path, validBody({ title: 'B' }), tokenB)).body,
      );

      expect(reviewA.id).not.toBe(reviewB.id);
      expect(await prisma.review.count()).toBe(2);

      expect(reviewDetailSchema.parse((await get(path, tokenA)).body).title).toBe('A');
      expect(reviewDetailSchema.parse((await get(path, tokenB)).body).title).toBe('B');

      await patch(path, { title: 'A alterado' }, tokenA);
      expect(reviewDetailSchema.parse((await get(path, tokenB)).body).title).toBe('B');
    });

    it('CA-F10-09: a conta ADMIN escreve e gerencia a própria resenha', async () => {
      const token = await login('admin_resenha', 'ADMIN');
      const path = reviewMePath(GAME_A);

      const created = await put(path, validBody({ title: 'Do admin' }), token);
      expect(created.status).toBe(201);
      expect((await patch(path, { body: 'Corpo atualizado.' }, token)).status).toBe(200);
      expect((await remove(path, token)).status).toBe(204);
    });
  });

  describe('leitura pública', () => {
    it('CA-F10-10: GET /games/:game/reviews é público e retorna os campos do resumo', async () => {
      const token = await login('jogador_01');
      const review = reviewDetailSchema.parse(
        (await put(reviewMePath(GAME_A), validBody(), token)).body,
      );

      const response = await get(reviewGamePath(GAME_A));
      expect(response.status).toBe(200);

      const page = reviewPageSchema.parse(response.body);
      expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(page.data[0]).toEqual({
        id: review.id,
        title: 'Uma aula de level design',
        excerpt: review.body,
        status: 'PUBLISHED',
        author: { username: 'jogador_01', displayName: 'jogador_01', avatarUrl: null },
        game: {
          id: await gameId(GAME_A),
          slug: GAME_A,
          title: 'Crônicas de Aetheria',
          coverUrl: 'https://exemplo.com/cronicas.jpg',
        },
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
      });

      expect((await get(reviewGamePath('jogo-inexistente'))).status).toBe(404);
    });

    it('CA-F10-11: as listagens públicas e o permalink só mostram PUBLISHED', async () => {
      await login('autor_qualquer');
      const author = await userId('autor_qualquer');

      const published = await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_A),
        title: 'Publicada',
      });
      await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_B),
        title: 'Oculta',
        status: 'HIDDEN',
      });
      await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_C),
        title: 'Removida',
        status: 'REMOVED',
      });

      const byGame = reviewPageSchema.parse((await get(reviewGamePath(GAME_A))).body);
      expect(byGame.data.map((item) => item.title)).toEqual(['Publicada']);

      expect(reviewPageSchema.parse((await get(reviewGamePath(GAME_B))).body).data).toHaveLength(0);
      expect(
        reviewPageSchema.parse((await get(reviewPublicPath('autor_qualquer'))).body).data,
      ).toHaveLength(1);

      expect((await get(reviewPath(published.id))).status).toBe(200);
    });

    it('CA-F10-12: GET /users/:username/reviews é público, ignora caixa e não expõe dados privados', async () => {
      const user = await createTestUser({ username: 'jogador_publico' });
      await createReview(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_A),
        title: 'Resenha pública',
      });

      const anonymous = await get(reviewPublicPath('jogador_publico'));
      expect(anonymous.status).toBe(200);

      const mixedCase = await get(reviewPublicPath('JoGaDoR_PuBlIcO'));
      expect(mixedCase.status).toBe(200);
      expect(reviewPageSchema.parse(mixedCase.body).data).toHaveLength(1);

      const serialized = JSON.stringify(mixedCase.body);
      expect(serialized).not.toContain('jogador_publico@example.com');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('"role"');

      expect((await get(reviewPublicPath('ninguem'))).status).toBe(404);
    });

    it('CA-F10-12: as resenhas de uma conta SUSPENDED continuam públicas', async () => {
      const user = await createTestUser({ username: 'suspenso_res', status: 'SUSPENDED' });
      await createReview(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_A),
        title: 'De conta suspensa',
      });

      const response = await get(reviewPublicPath('suspenso_res'));
      expect(response.status).toBe(200);
      expect(reviewPageSchema.parse(response.body).data).toHaveLength(1);
    });

    it('CA-F10-13: o permalink mostra o corpo completo; não publicada só para o autor', async () => {
      const token = await login('autor_permalink');
      const review = reviewDetailSchema.parse(
        (await put(reviewMePath(GAME_A), validBody({ title: 'Permalink' }), token)).body,
      );

      const anonymous = await get(reviewPath(review.id));
      expect(anonymous.status).toBe(200);
      const detail = reviewDetailSchema.parse(anonymous.body);
      expect(detail.body).toBe(review.body);
      expect(detail.excerpt).toBeUndefined();

      await prisma.review.update({ where: { id: review.id }, data: { status: 'HIDDEN' } });

      expect((await get(reviewPath(review.id))).status).toBe(404);

      const asAuthor = await get(reviewPath(review.id), token);
      expect(asAuthor.status).toBe(200);
      expect(reviewDetailSchema.parse(asAuthor.body).status).toBe('HIDDEN');

      const otherToken = await login('outro_permalink');
      expect((await get(reviewPath(review.id), otherToken)).status).toBe(404);

      expect((await get(reviewPath('3f2504e0-4f89-41d3-9a0c-0305e82c3301'))).status).toBe(404);
    });

    it('CA-F10-14: ordenações, paginação e parâmetros inválidos funcionam', async () => {
      const token = await login('autor_ordem');

      const created = reviewDetailSchema.parse(
        (await put(reviewMePath(GAME_A), validBody({ title: 'Zeta' }), token)).body,
      );
      await put(reviewMePath(GAME_B), validBody({ title: 'Alfa' }), token);
      await put(reviewMePath(GAME_C), validBody({ title: 'Meio' }), token);

      // Datas fixadas para garantir a ordenação.
      await prisma.$executeRaw`
        UPDATE reviews SET created_at = '2024-01-01T00:00:00Z', updated_at = '2024-01-01T00:00:00Z'
        WHERE title = 'Zeta'
      `;
      await prisma.$executeRaw`
        UPDATE reviews SET created_at = '2024-03-01T00:00:00Z', updated_at = '2024-03-01T00:00:00Z'
        WHERE title = 'Alfa'
      `;
      await prisma.$executeRaw`
        UPDATE reviews SET created_at = '2024-02-01T00:00:00Z', updated_at = '2024-02-01T00:00:00Z'
        WHERE title = 'Meio'
      `;

      const me = REVIEW_ROUTES.myReviews;

      const defaultOrder = reviewPageSchema.parse((await get(me, token)).body);
      expect(defaultOrder.data.map((item) => item.title)).toEqual(['Alfa', 'Meio', 'Zeta']);

      const asc = reviewPageSchema.parse(
        (await get(me, token, { sort: 'recently_created', order: 'asc' })).body,
      );
      expect(asc.data.map((item) => item.title)).toEqual(['Zeta', 'Meio', 'Alfa']);

      const byGameTitle = reviewPageSchema.parse(
        (await get(me, token, { sort: 'game_title' })).body,
      );
      expect(byGameTitle.data.map((item) => item.game.title)).toEqual([
        'Ação Total',
        'Crônicas de Aetheria',
        'Zeloria',
      ]);

      const byGameTitleDesc = reviewPageSchema.parse(
        (await get(me, token, { sort: 'game_title', order: 'desc' })).body,
      );
      expect(byGameTitleDesc.data.map((item) => item.game.title)).toEqual([
        'Zeloria',
        'Crônicas de Aetheria',
        'Ação Total',
      ]);

      const paged = reviewPageSchema.parse((await get(me, token, { pageSize: 2, page: 2 })).body);
      expect(paged.data).toHaveLength(1);
      expect(paged.meta).toEqual({ page: 2, pageSize: 2, total: 3, totalPages: 2 });

      const beyond = reviewPageSchema.parse((await get(me, token, { pageSize: 2, page: 9 })).body);
      expect(beyond.data).toEqual([]);
      expect(beyond.meta.total).toBe(3);

      expectValidationError(await get(me, token, { sort: 'rating' }));
      expectValidationError(await get(me, token, { order: 'up' }));
      expectValidationError(await get(me, token, { pageSize: 101 }));
      expectValidationError(await get(me, token, { page: 0 }));

      expect(created.id).toBeTruthy();
    });

    it('CA-F10-15: GET /me/reviews inclui HIDDEN/REMOVED com o status e exige token', async () => {
      const token = await login('autor_proprias');
      const author = await userId('autor_proprias');

      await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_A),
        title: 'Publicada',
      });
      await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_B),
        title: 'Oculta',
        status: 'HIDDEN',
      });
      await createReview(prisma, {
        userId: author,
        gameId: await gameId(GAME_C),
        title: 'Removida',
        status: 'REMOVED',
      });

      const page = reviewPageSchema.parse((await get(REVIEW_ROUTES.myReviews, token)).body);
      expect(page.data).toHaveLength(3);
      expect(page.data.map((item) => item.status).sort()).toEqual([
        'HIDDEN',
        'PUBLISHED',
        'REMOVED',
      ]);

      expect((await get(REVIEW_ROUTES.myReviews)).status).toBe(401);
    });

    it('CA-F10-16: as listagens usam um número constante de consultas (sem N+1)', async () => {
      const token = await login('autor_nmais1');
      const author = await userId('autor_nmais1');
      const games = [GAME_A, GAME_B, GAME_C];

      for (const [index, slug] of games.entries()) {
        await createReview(prisma, {
          userId: author,
          gameId: await gameId(slug),
          title: `Resenha ${index}`,
        });
      }

      // Mais resenhas publicadas no mesmo jogo, de autores diferentes, para que o
      // `pageSize` realmente varie a quantidade de itens retornados.
      for (const [index, username] of ['autor_nmais1_b', 'autor_nmais1_c'].entries()) {
        const extra = await createTestUser({ username });
        await createReview(prisma, {
          userId: extra.id,
          gameId: await gameId(GAME_A),
          title: `Resenha extra ${index}`,
        });
      }

      queryCount = 0;
      const small = reviewPageSchema.parse(
        (await get(reviewGamePath(GAME_A), undefined, { pageSize: 1 })).body,
      );
      const smallPage = queryCount;

      queryCount = 0;
      const large = reviewPageSchema.parse(
        (await get(reviewGamePath(GAME_A), undefined, { pageSize: 20 })).body,
      );
      const largePage = queryCount;

      // A listagem própria varia a quantidade de itens retornados.
      queryCount = 0;
      const ownSmallPage = reviewPageSchema.parse(
        (await get(REVIEW_ROUTES.myReviews, token, { pageSize: 1 })).body,
      );
      const ownSmall = queryCount;

      queryCount = 0;
      const ownLargePage = reviewPageSchema.parse(
        (await get(REVIEW_ROUTES.myReviews, token, { pageSize: 20 })).body,
      );
      const ownLarge = queryCount;

      expect(small.data).toHaveLength(1);
      expect(large.data).toHaveLength(3);
      expect(smallPage).toBeGreaterThan(0);
      expect(largePage).toBe(smallPage);

      expect(ownSmallPage.data).toHaveLength(1);
      expect(ownLargePage.data).toHaveLength(3);
      expect(ownSmall).toBeGreaterThan(0);
      expect(ownLarge).toBe(ownSmall);
    });
  });

  describe('integração e cascatas', () => {
    it('CA-F10-17: o detalhe do jogo expõe reviewCount apenas das publicadas', async () => {
      const token = await login('autor_count');
      const firstAuthor = await userId('autor_count');
      const secondAuthor = await createTestUser({ username: 'autor_count_2' });
      const thirdAuthor = await createTestUser({ username: 'autor_count_3' });

      const before = gameDetailSchema.parse((await get(`/games/${GAME_A}`)).body);
      expect(before.reviewCount).toBe(0);

      await createReview(prisma, {
        userId: firstAuthor,
        gameId: await gameId(GAME_A),
        title: 'Publicada 1',
      });
      await createReview(prisma, {
        userId: secondAuthor.id,
        gameId: await gameId(GAME_A),
        title: 'Publicada 2',
      });
      await createReview(prisma, {
        userId: thirdAuthor.id,
        gameId: await gameId(GAME_A),
        title: 'Oculta',
        status: 'HIDDEN',
      });

      const detail = gameDetailSchema.parse((await get(`/games/${GAME_A}`)).body);
      expect(detail.reviewCount).toBe(2);
      expect(detail.ratingAverage).toBeNull();
      expect(detail.ratingCount).toBe(0);

      // A resenha existe e é independente do diário (que permanece vazio).
      expect((await get(reviewMePath(GAME_A), token)).status).toBe(200);
    });

    it('CA-F10-18: resenhar não exige diário nem nota e não altera o diário/agregados', async () => {
      const token = await login('autor_indep');
      const author = await userId('autor_indep');
      const gameAId = await gameId(GAME_A);

      await createGameLog(prisma, {
        userId: author,
        gameId: gameAId,
        status: 'PLAYING',
        playtimeMinutes: 120,
      });
      const diaryBefore = await prisma.gameLog.findMany({ where: { userId: author } });

      const created = await put(reviewMePath(GAME_A), validBody(), token);
      expect(created.status).toBe(201);

      const diaryAfter = await prisma.gameLog.findMany({ where: { userId: author } });
      expect(diaryAfter).toEqual(diaryBefore);

      const game = await prisma.game.findUniqueOrThrow({
        where: { id: gameAId },
        select: { ratingAverage: true, ratingCount: true },
      });
      expect(game).toEqual({ ratingAverage: null, ratingCount: 0 });

      // Resenhar sem diário também funciona.
      expect((await put(reviewMePath(GAME_B), validBody(), token)).status).toBe(201);
      expect(
        await prisma.gameLog.count({ where: { userId: author, gameId: await gameId(GAME_B) } }),
      ).toBe(0);
    });

    it('CA-F10-19: excluir a conta e excluir o jogo removem as resenhas (cascatas)', async () => {
      const token = await login('autor_cascata');
      const author = await userId('autor_cascata');

      await put(reviewMePath(GAME_A), validBody(), token);
      await put(reviewMePath(GAME_B), validBody(), token);
      expect(await prisma.review.count({ where: { userId: author } })).toBe(2);

      const deleted = await remove('/me', token, { password: VALID_PASSWORD });
      expect(deleted.status).toBe(204);
      expect(await prisma.review.count({ where: { userId: author } })).toBe(0);

      const other = await createTestUser({ username: 'autor_jogo' });
      await createReview(prisma, {
        userId: other.id,
        gameId: await gameId(GAME_A),
        title: 'Some com o jogo',
      });
      await createReview(prisma, {
        userId: other.id,
        gameId: await gameId(GAME_B),
        title: 'Fica',
      });

      await prisma.game.delete({ where: { id: await gameId(GAME_A) } });

      expect(await prisma.review.count()).toBe(1);
      expect((await prisma.review.findFirstOrThrow()).title).toBe('Fica');
    });
  });
});
