import {
  AUTH_ROUTES,
  GAME_LOG_ROUTES,
  PLATFORM_ROUTES,
  apiErrorSchema,
  gameLogEntrySchema,
  gameLogEntryPath,
  gameLogPageSchema,
  gameLogPublicPath,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame, createPlatform } from '../helpers/catalog.js';
import { createGameLog } from '../helpers/game-logs.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';

const PLATFORM_PC = 'pc';
const PLATFORM_PS5 = 'playstation-5';
const PLATFORM_XBOX = 'xbox-series';
const PLATFORM_SWITCH = 'nintendo-switch';

const GAME_WITH_PLATFORMS = 'cronicas';
const GAME_WITHOUT_PLATFORMS = 'sem-plataforma';
const GAME_OTHER = 'acao-total';

/** Corpo completo válido do `PUT` (seção 3 da SPEC F8). */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    status: 'COMPLETED',
    startedAt: '2024-01-10',
    finishedAt: '2024-02-03',
    playtimeMinutes: 1350,
    ...overrides,
  };
}

/** Amanhã (UTC) — fora da faixa permitida, que termina no dia atual (RN-F8-04). */
function tomorrowIsoDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

describe('SPEC F8 — registro de jogos jogados (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F8-12 (o evento só
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
    await createPlatform(prisma, { name: 'PC', slug: PLATFORM_PC });
    await createPlatform(prisma, { name: 'PlayStation 5', slug: PLATFORM_PS5 });
    await createPlatform(prisma, { name: 'Xbox Series X', slug: PLATFORM_XBOX });
    await createPlatform(prisma, { name: 'Nintendo Switch', slug: PLATFORM_SWITCH });

    await createGame(prisma, {
      slug: GAME_WITH_PLATFORMS,
      title: 'Crônicas de Aetheria',
      coverUrl: 'https://exemplo.com/cronicas.jpg',
      platforms: [PLATFORM_PC, PLATFORM_PS5],
    });
    await createGame(prisma, {
      slug: GAME_WITHOUT_PLATFORMS,
      title: 'Jogo Sem Plataforma',
    });
    await createGame(prisma, {
      slug: GAME_OTHER,
      title: 'Ação Total',
      platforms: [PLATFORM_PC],
    });
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  function get(path: string, token?: string, query: Record<string, unknown> = {}) {
    const call = request(app.server).get(testPath(path)).query(query);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function put(path: string, body: unknown, token?: string) {
    const call = request(app.server).put(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function patch(path: string, body: unknown, token?: string) {
    const call = request(app.server).patch(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function remove(path: string, token?: string, body?: unknown) {
    const call = request(app.server).delete(testPath(path));

    if (body !== undefined) {
      call.send(body);
    }

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
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

  describe('escrita do diário', () => {
    it('CA-F8-01: PUT cria o registro (201) e ele aparece no diário próprio e no público', async () => {
      const token = await login('jogador_01');
      const platform = await platformId(PLATFORM_PC);

      const created = await put(
        gameLogEntryPath(GAME_WITH_PLATFORMS),
        validBody({ platformId: platform }),
        token,
      );

      expect(created.status).toBe(201);
      const entry = gameLogEntrySchema.parse(created.body);
      expect(entry.status).toBe('COMPLETED');
      expect(entry.startedAt).toBe('2024-01-10');
      expect(entry.finishedAt).toBe('2024-02-03');
      expect(entry.playtimeMinutes).toBe(1350);
      expect(entry.platform).toEqual({ id: platform, name: 'PC', slug: PLATFORM_PC });
      expect(entry.game).toEqual({
        id: await gameId(GAME_WITH_PLATFORMS),
        slug: GAME_WITH_PLATFORMS,
        title: 'Crônicas de Aetheria',
        coverUrl: 'https://exemplo.com/cronicas.jpg',
      });

      const own = gameLogPageSchema.parse((await get(GAME_LOG_ROUTES.myDiary, token)).body);
      expect(own.data.map((item) => item.id)).toEqual([entry.id]);

      const publicDiary = gameLogPageSchema.parse(
        (await get(gameLogPublicPath('jogador_01'))).body,
      );
      expect(publicDiary.data.map((item) => item.id)).toEqual([entry.id]);
    });

    it('CA-F8-02: PUT repetido retorna 200, substitui os campos (omitidos viram null) e não duplica', async () => {
      const token = await login('jogador_01');
      const platform = await platformId(PLATFORM_PC);
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const first = await put(path, validBody({ platformId: platform }), token);
      expect(first.status).toBe(201);

      const second = await put(path, { status: 'PLAYING' }, token);
      expect(second.status).toBe(200);

      const entry = gameLogEntrySchema.parse(second.body);
      expect(entry.id).toBe(gameLogEntrySchema.parse(first.body).id);
      expect(entry.status).toBe('PLAYING');
      expect(entry.startedAt).toBeNull();
      expect(entry.finishedAt).toBeNull();
      expect(entry.playtimeMinutes).toBeNull();
      expect(entry.platform).toBeNull();

      expect(await prisma.gameLog.count()).toBe(1);
    });

    it('CA-F8-03: PUT valida status, faixa de datas, ordem das datas, tempo e campos desconhecidos', async () => {
      const token = await login('jogador_01');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      // Corpo sem `status` e com status fora do enum (RN-F8-03).
      const withoutStatus = { startedAt: '2024-01-10', playtimeMinutes: 60 };
      expectValidationError(await put(path, withoutStatus, token), 'status');
      expectValidationError(await put(path, validBody({ status: 'ZERADO' }), token), 'status');

      // Limite inferior aceito e dia anterior recusado (RN-F8-04). O primeiro `PUT` cria
      // (201) e os seguintes substituem (200) — o valor aceito é o que importa aqui.
      expect([200, 201]).toContain(
        (await put(path, validBody({ startedAt: '1950-01-01' }), token)).status,
      );
      expectValidationError(
        await put(path, validBody({ startedAt: '1949-12-31' }), token),
        'startedAt',
      );

      const tomorrow = tomorrowIsoDate();
      expectValidationError(
        await put(path, validBody({ finishedAt: tomorrow }), token),
        'finishedAt',
      );

      expectValidationError(
        await put(path, validBody({ startedAt: '2024-02-03', finishedAt: '2024-01-10' }), token),
        'finishedAt',
      );

      expect([200, 201]).toContain(
        (await put(path, validBody({ playtimeMinutes: 0 }), token)).status,
      );
      expect([200, 201]).toContain(
        (await put(path, validBody({ playtimeMinutes: 1_000_000 }), token)).status,
      );
      expectValidationError(
        await put(path, validBody({ playtimeMinutes: -1 }), token),
        'playtimeMinutes',
      );
      expectValidationError(
        await put(path, validBody({ playtimeMinutes: 1_000_001 }), token),
        'playtimeMinutes',
      );
      expectValidationError(
        await put(path, validBody({ playtimeMinutes: 90.5 }), token),
        'playtimeMinutes',
      );

      expectValidationError(await put(path, validBody({ extra: 'x' }), token));
    });

    it('CA-F8-04: platformId precisa pertencer ao jogo; jogo sem plataformas aceita apenas null', async () => {
      const token = await login('jogador_01');
      const pc = await platformId(PLATFORM_PC);
      const xbox = await platformId(PLATFORM_XBOX);

      const accepted = await put(
        gameLogEntryPath(GAME_WITH_PLATFORMS),
        validBody({ platformId: pc }),
        token,
      );
      expect(accepted.status).toBe(201);

      const cleared = await put(
        gameLogEntryPath(GAME_WITH_PLATFORMS),
        validBody({ platformId: null }),
        token,
      );
      expect(cleared.status).toBe(200);
      expect(gameLogEntrySchema.parse(cleared.body).platform).toBeNull();

      const incompatible = await put(
        gameLogEntryPath(GAME_WITH_PLATFORMS),
        validBody({ platformId: xbox }),
        token,
      );
      expectValidationError(incompatible, 'platformId');

      const noPlatforms = await put(
        gameLogEntryPath(GAME_WITHOUT_PLATFORMS),
        validBody({ platformId: null }),
        token,
      );
      expect(noPlatforms.status).toBe(201);

      const noPlatformsWithPlatform = await put(
        gameLogEntryPath(GAME_WITHOUT_PLATFORMS),
        validBody({ platformId: pc }),
        token,
      );
      expectValidationError(noPlatformsWithPlatform, 'platformId');
    });

    it('CA-F8-05: PATCH altera apenas os campos enviados, null limpa e corpo vazio é inválido', async () => {
      const token = await login('jogador_01');
      const pc = await platformId(PLATFORM_PC);
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const created = gameLogEntrySchema.parse(
        (await put(path, validBody({ platformId: pc }), token)).body,
      );

      const partial = await patch(path, { status: 'PLAYING' }, token);
      expect(partial.status).toBe(200);
      const afterStatus = gameLogEntrySchema.parse(partial.body);
      expect(afterStatus.status).toBe('PLAYING');
      expect(afterStatus.startedAt).toBe('2024-01-10');
      expect(afterStatus.finishedAt).toBe('2024-02-03');
      expect(afterStatus.playtimeMinutes).toBe(1350);
      expect(afterStatus.platform?.id).toBe(pc);

      const cleared = gameLogEntrySchema.parse(
        (
          await patch(
            path,
            { startedAt: null, finishedAt: null, playtimeMinutes: null, platformId: null },
            token,
          )
        ).body,
      );
      expect(cleared.status).toBe('PLAYING');
      expect(cleared.startedAt).toBeNull();
      expect(cleared.finishedAt).toBeNull();
      expect(cleared.playtimeMinutes).toBeNull();
      expect(cleared.platform).toBeNull();

      expectValidationError(await patch(path, {}, token));
      expectValidationError(await patch(path, { status: null }, token), 'status');
      expectValidationError(await patch(path, { playtimeMinutes: 5.5 }, token), 'playtimeMinutes');
      expectValidationError(await patch(path, { finishedAt: '03/02/2024' }, token), 'finishedAt');

      expect(created.id).toBe(cleared.id);
    });

    it('CA-F8-05: PATCH sem registro retorna 404 e uma data de conclusão anterior à de início é recusada', async () => {
      const token = await login('jogador_01');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const missing = await patch(path, { status: 'PLAYING' }, token);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');

      await put(path, validBody({ startedAt: '2024-01-05' }), token);

      expectValidationError(await patch(path, { finishedAt: '2024-01-01' }, token), 'finishedAt');
      expectValidationError(await patch(path, { startedAt: '2024-03-01' }, token), 'finishedAt');
      expect((await patch(path, { finishedAt: '2024-02-20' }, token)).status).toBe(200);
    });

    it('CA-F8-05: PATCH sem alteração efetiva não atualiza o registro', async () => {
      const token = await login('jogador_01');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const created = gameLogEntrySchema.parse((await put(path, validBody(), token)).body);

      const same = await patch(path, { status: created.status }, token);
      expect(same.status).toBe(200);
      expect(gameLogEntrySchema.parse(same.body).updatedAt).toBe(created.updatedAt);
    });

    it('CA-F8-06: DELETE retorna 204, o registro some das listas, repetir dá 404 e um novo PUT recria', async () => {
      const token = await login('jogador_01');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      await put(path, validBody(), token);

      expect((await remove(path, token)).status).toBe(204);
      expect(
        gameLogPageSchema.parse((await get(GAME_LOG_ROUTES.myDiary, token)).body).data,
      ).toEqual([]);

      const again = await remove(path, token);
      expect(again.status).toBe(404);
      expect(again.body.error.code).toBe('NOT_FOUND');

      const recreated = await put(path, validBody(), token);
      expect(recreated.status).toBe(201);
      expect(await prisma.gameLog.count()).toBe(1);
    });
  });

  describe('leitura do registro', () => {
    it('CA-F8-07: GET /me/games/:game aceita slug e id; sem registro ou jogo inexistente responde 404', async () => {
      const token = await login('jogador_01');
      const id = await gameId(GAME_WITH_PLATFORMS);

      const missing = await get(gameLogEntryPath(GAME_WITH_PLATFORMS), token);
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');

      const created = gameLogEntrySchema.parse(
        (await put(gameLogEntryPath(GAME_WITH_PLATFORMS), validBody(), token)).body,
      );

      const bySlug = await get(gameLogEntryPath(GAME_WITH_PLATFORMS), token);
      expect(bySlug.status).toBe(200);
      expect(gameLogEntrySchema.parse(bySlug.body).id).toBe(created.id);

      const byId = await get(gameLogEntryPath(id), token);
      expect(byId.status).toBe(200);
      expect(gameLogEntrySchema.parse(byId.body).id).toBe(created.id);

      const unknownGame = await get(gameLogEntryPath('jogo-inexistente'), token);
      expect(unknownGame.status).toBe(404);

      const unknownId = await get(gameLogEntryPath('00000000-0000-4000-8000-000000000000'), token);
      expect(unknownId.status).toBe(404);
    });
  });

  describe('autenticação e isolamento', () => {
    it('CA-F8-08: as rotas /me/games* exigem token (401 UNAUTHENTICATED)', async () => {
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      for (const response of [
        await get(GAME_LOG_ROUTES.myDiary),
        await get(path),
        await put(path, validBody()),
        await patch(path, { status: 'PLAYING' }),
        await remove(path),
      ]) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      }

      expect(await prisma.gameLog.count()).toBe(0);
    });

    it('CA-F8-08: dois jogadores mantêm registros independentes para o mesmo jogo', async () => {
      const tokenA = await login('jogador_a');
      const tokenB = await login('jogador_b');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const entryA = gameLogEntrySchema.parse(
        (await put(path, validBody({ status: 'PLAYING' }), tokenA)).body,
      );
      const entryB = gameLogEntrySchema.parse(
        (await put(path, validBody({ status: 'BACKLOG', playtimeMinutes: 10 }), tokenB)).body,
      );

      expect(entryA.id).not.toBe(entryB.id);

      const diaryA = gameLogPageSchema.parse((await get(GAME_LOG_ROUTES.myDiary, tokenA)).body);
      expect(diaryA.data.map((item) => item.id)).toEqual([entryA.id]);

      const diaryB = gameLogPageSchema.parse((await get(GAME_LOG_ROUTES.myDiary, tokenB)).body);
      expect(diaryB.data.map((item) => item.id)).toEqual([entryB.id]);

      // O outro jogador pode remover apenas o próprio registro; o do primeiro fica intacto.
      expect((await remove(path, tokenB)).status).toBe(204);
      expect((await get(gameLogEntryPath(GAME_WITH_PLATFORMS), tokenA)).body.id).toBe(entryA.id);

      const publicB = gameLogPageSchema.parse((await get(gameLogPublicPath('jogador_b'))).body);
      expect(publicB.data).toEqual([]);
    });

    it('CA-F8-13: a conta ADMIN mantém o próprio diário normalmente', async () => {
      const token = await login('admin_diario', 'ADMIN');
      const path = gameLogEntryPath(GAME_WITH_PLATFORMS);

      const created = await put(path, validBody(), token);
      expect(created.status).toBe(201);

      expect((await get(GAME_LOG_ROUTES.myDiary, token)).status).toBe(200);
      expect((await patch(path, { status: 'ON_HOLD' }, token)).status).toBe(200);
      expect((await remove(path, token)).status).toBe(204);
    });
  });

  describe('listagem do diário', () => {
    it('CA-F8-09: GET /me/games retorna apenas os registros do usuário no formato { data, meta }', async () => {
      const tokenA = await login('jogador_a');
      const tokenB = await login('jogador_b');

      await put(gameLogEntryPath(GAME_WITH_PLATFORMS), validBody(), tokenA);
      await put(gameLogEntryPath(GAME_OTHER), validBody({ status: 'PLAYING' }), tokenB);

      const response = await get(GAME_LOG_ROUTES.myDiary, tokenA);
      expect(response.status).toBe(200);

      const page = gameLogPageSchema.parse(response.body);
      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.game.slug).toBe(GAME_WITH_PLATFORMS);
      expect(page.data[0]?.game).toEqual({
        id: await gameId(GAME_WITH_PLATFORMS),
        slug: GAME_WITH_PLATFORMS,
        title: 'Crônicas de Aetheria',
        coverUrl: 'https://exemplo.com/cronicas.jpg',
      });
      expect(page.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('CA-F8-10: filtro status repetível e ordenações (padrão recently_updated desc) funcionam', async () => {
      const token = await login('jogador_01');
      const user = await prisma.user.findUniqueOrThrow({
        where: { username: 'jogador_01' },
        select: { id: true },
      });

      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_WITH_PLATFORMS),
        status: 'COMPLETED',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-03-01T00:00:00.000Z'),
      });
      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_OTHER),
        status: 'PLAYING',
        createdAt: new Date('2024-02-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-15T00:00:00.000Z'),
      });
      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_WITHOUT_PLATFORMS),
        status: 'DROPPED',
        createdAt: new Date('2024-03-01T00:00:00.000Z'),
        updatedAt: new Date('2024-02-15T00:00:00.000Z'),
      });

      const byUpdate = gameLogPageSchema.parse((await get(GAME_LOG_ROUTES.myDiary, token)).body);
      expect(byUpdate.data.map((item) => item.game.slug)).toEqual([
        GAME_WITH_PLATFORMS,
        GAME_WITHOUT_PLATFORMS,
        GAME_OTHER,
      ]);

      const byAdded = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { sort: 'recently_added' })).body,
      );
      expect(byAdded.data.map((item) => item.game.slug)).toEqual([
        GAME_WITHOUT_PLATFORMS,
        GAME_OTHER,
        GAME_WITH_PLATFORMS,
      ]);

      // `title` é ascendente por padrão (collation pt-BR) e `order` sobrepõe a direção.
      const byTitle = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { sort: 'title' })).body,
      );
      expect(byTitle.data.map((item) => item.game.title)).toEqual([
        'Ação Total',
        'Crônicas de Aetheria',
        'Jogo Sem Plataforma',
      ]);

      const byTitleDesc = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { sort: 'title', order: 'desc' })).body,
      );
      expect(byTitleDesc.data.map((item) => item.game.title)).toEqual([
        'Jogo Sem Plataforma',
        'Crônicas de Aetheria',
        'Ação Total',
      ]);

      const ascending = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { order: 'asc' })).body,
      );
      expect(ascending.data.map((item) => item.game.slug)).toEqual([
        GAME_OTHER,
        GAME_WITHOUT_PLATFORMS,
        GAME_WITH_PLATFORMS,
      ]);

      // Filtro repetível (maiúsculas ou minúsculas) e valores inválidos.
      const filtered = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { status: ['playing', 'dropped'] })).body,
      );
      expect(filtered.data.map((item) => item.status).sort()).toEqual(['DROPPED', 'PLAYING']);

      const single = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { status: 'COMPLETED' })).body,
      );
      expect(single.data).toHaveLength(1);
      expect(single.meta.total).toBe(1);

      expectValidationError(
        await get(GAME_LOG_ROUTES.myDiary, token, { status: 'zerado' }),
        'status',
      );
      expectValidationError(await get(GAME_LOG_ROUTES.myDiary, token, { sort: 'recent' }));
      expectValidationError(await get(GAME_LOG_ROUTES.myDiary, token, { order: 'sideways' }));
      expectValidationError(await get(GAME_LOG_ROUTES.myDiary, token, { pageSize: 1_000 }));
      expectValidationError(await get(GAME_LOG_ROUTES.myDiary, token, { page: 0 }));

      // Página além do fim: dado vazio e meta correto.
      const beyond = gameLogPageSchema.parse(
        (await get(GAME_LOG_ROUTES.myDiary, token, { page: 5, pageSize: 2 })).body,
      );
      expect(beyond.data).toEqual([]);
      expect(beyond.meta).toEqual({ page: 5, pageSize: 2, total: 3, totalPages: 2 });
    });

    it('CA-F8-12: as listagens usam um número constante de consultas (sem N+1)', async () => {
      const token = await login('jogador_01');
      const user = await prisma.user.findUniqueOrThrow({
        where: { username: 'jogador_01' },
        select: { id: true },
      });
      const games = [GAME_WITH_PLATFORMS, GAME_OTHER, GAME_WITHOUT_PLATFORMS];
      const ids = await Promise.all(games.map((slug) => gameId(slug)));

      for (const [index, id] of ids.entries()) {
        await createGameLog(prisma, {
          userId: user.id,
          gameId: id,
          status: 'PLAYING',
          playtimeMinutes: index,
        });
      }

      queryCount = 0;
      await get(GAME_LOG_ROUTES.myDiary, token, { pageSize: 1 });
      const smallPage = queryCount;

      queryCount = 0;
      await get(GAME_LOG_ROUTES.myDiary, token, { pageSize: 20 });
      const largePage = queryCount;

      expect(smallPage).toBeGreaterThan(0);
      expect(largePage).toBe(smallPage);
    });
  });

  describe('diário público', () => {
    it('CA-F8-11: GET /users/:username/games é público, ignora caixa e não expõe dados privados', async () => {
      const token = await login('jogador_01');
      await put(gameLogEntryPath(GAME_WITH_PLATFORMS), validBody(), token);

      const anonymous = await get(gameLogPublicPath('jogador_01'));
      expect(anonymous.status).toBe(200);

      const mixedCase = await get(gameLogPublicPath('JoGaDoR_01'));
      expect(mixedCase.status).toBe(200);
      expect(gameLogPageSchema.parse(mixedCase.body).data).toHaveLength(1);

      const serialized = JSON.stringify(mixedCase.body);
      expect(serialized).not.toContain('jogador_01@example.com');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('"role"');

      const missing = await get(gameLogPublicPath('jogador_inexistente'));
      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
    });

    it('CA-F8-11: o diário de uma conta SUSPENDED continua acessível', async () => {
      const user = await createTestUser({
        username: 'suspenso_01',
        status: 'SUSPENDED',
      });
      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_WITH_PLATFORMS),
        status: 'COMPLETED',
        playtimeMinutes: 60,
      });

      const response = await get(gameLogPublicPath('suspenso_01'));
      expect(response.status).toBe(200);
      expect(gameLogPageSchema.parse(response.body).data).toHaveLength(1);
    });

    it('CA-F8-11: filtros e ordenações são os mesmos do diário próprio', async () => {
      const user = await createTestUser({ username: 'jogador_filtros' });
      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_WITH_PLATFORMS),
        status: 'COMPLETED',
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      });
      await createGameLog(prisma, {
        userId: user.id,
        gameId: await gameId(GAME_WITHOUT_PLATFORMS),
        status: 'PLAYING',
        updatedAt: new Date('2024-02-01T00:00:00.000Z'),
      });

      const page = gameLogPageSchema.parse(
        (await get(gameLogPublicPath('jogador_filtros'), undefined, { status: 'PLAYING' })).body,
      );
      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.game.slug).toBe(GAME_WITHOUT_PLATFORMS);
      expect(page.data[0]?.game.title).toBe('Jogo Sem Plataforma');
    });
  });

  describe('cascatas', () => {
    it('CA-F8-14: excluir a conta remove os registros do diário', async () => {
      const token = await login('jogador_01');
      const user = await prisma.user.findUniqueOrThrow({
        where: { username: 'jogador_01' },
        select: { id: true },
      });

      await put(gameLogEntryPath(GAME_WITH_PLATFORMS), validBody(), token);
      await put(gameLogEntryPath(GAME_OTHER), validBody(), token);
      expect(await prisma.gameLog.count({ where: { userId: user.id } })).toBe(2);

      const deleted = await remove('/me', token, { password: VALID_PASSWORD });
      expect(deleted.status).toBe(204);

      expect(await prisma.gameLog.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.gameLog.count()).toBe(0);
    });

    it('CA-F8-15: excluir o jogo remove os registros vinculados', async () => {
      const token = await login('jogador_01');
      await put(gameLogEntryPath(GAME_WITH_PLATFORMS), validBody(), token);
      await put(gameLogEntryPath(GAME_OTHER), validBody(), token);

      await prisma.game.delete({ where: { id: await gameId(GAME_WITH_PLATFORMS) } });

      expect(await prisma.gameLog.count()).toBe(1);
      expect(
        gameLogPageSchema
          .parse((await get(GAME_LOG_ROUTES.myDiary, token)).body)
          .data.map((item) => item.game.slug),
      ).toEqual([GAME_OTHER]);
    });

    it('CA-F8-15: excluir a plataforma desvincula o registro sem removê-lo', async () => {
      const adminToken = await login('admin_plataformas', 'ADMIN');
      const token = await login('jogador_01');
      const switchId = await platformId(PLATFORM_SWITCH);
      const gameWithSwitch = await createGame(prisma, {
        slug: 'com-switch',
        title: 'Jogo do Switch',
        platforms: [PLATFORM_SWITCH],
      });

      const created = gameLogEntrySchema.parse(
        (await put(gameLogEntryPath('com-switch'), validBody({ platformId: switchId }), token))
          .body,
      );
      expect(created.platform?.slug).toBe(PLATFORM_SWITCH);

      // Enquanto o jogo estiver vinculado, a F6 impede a exclusão da plataforma.
      const blocked = await remove(`${PLATFORM_ROUTES.list}/${PLATFORM_SWITCH}`, adminToken);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.code).toBe('PLATFORM_IN_USE');

      // Depois de desvincular o jogo (RN-F8-06: o registro anterior continua válido),
      // a exclusão da plataforma apenas desvincula o diário (RN-F8-12).
      await prisma.gamePlatform.deleteMany({ where: { gameId: gameWithSwitch.id } });

      const deleted = await remove(`${PLATFORM_ROUTES.list}/${PLATFORM_SWITCH}`, adminToken);
      expect(deleted.status).toBe(204);

      const log = await prisma.gameLog.findFirstOrThrow({
        where: { id: created.id },
        select: { platformId: true },
      });
      expect(log.platformId).toBeNull();

      const entry = gameLogEntrySchema.parse(
        (await get(gameLogEntryPath('com-switch'), token)).body,
      );
      expect(entry.id).toBe(created.id);
      expect(entry.platform).toBeNull();
    });
  });
});
