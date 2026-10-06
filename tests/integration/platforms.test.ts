import {
  AUTH_ROUTES,
  PLATFORM_ROUTES,
  apiErrorSchema,
  platformDetailSchema,
  platformListSchema,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCatalog } from '../../src/backend/src/modules/catalog/catalog.seed.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame, createPlatform } from '../helpers/catalog.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const ADMIN = { username: 'admin_plataformas', email: 'admin_plataformas@example.com' };
const PLAYER = { username: 'jogador_plataformas', email: 'jogador_plataformas@example.com' };

/** Fixtures determinísticas (5 plataformas; três com jogos, duas sem). */
async function createFixtures(): Promise<void> {
  await createPlatform(prisma, { name: 'PC', slug: 'pc' });
  await createPlatform(prisma, { name: 'PlayStation 5', slug: 'playstation-5' });
  await createPlatform(prisma, { name: 'Nintendo Switch', slug: 'nintendo-switch' });
  await createPlatform(prisma, { name: 'Xbox Series X/S', slug: 'xbox-series-x-s' });
  await createPlatform(prisma, { name: 'Série X', slug: 'serie-x' });

  await createGame(prisma, {
    slug: 'zelda',
    title: 'Zelda',
    platforms: ['nintendo-switch', 'pc'],
  });
  await createGame(prisma, {
    slug: 'acao-total',
    title: 'Ação Total',
    platforms: ['pc', 'playstation-5'],
  });
}

describe('SPEC F6 — gerenciamento de plataforma (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F6-05 (o evento só
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

  function get(path: string) {
    return request(app.server).get(testPath(path));
  }

  function post(path: string, body: unknown, token?: string) {
    const call = request(app.server).post(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function patch(path: string, body: unknown, token?: string) {
    const call = request(app.server).patch(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function remove(path: string, token?: string) {
    const call = request(app.server).delete(testPath(path));

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function login(user: typeof ADMIN, role?: 'ADMIN'): Promise<string> {
    await createTestUser({ ...user, password: VALID_PASSWORD, ...(role ? { role } : {}) });

    const response = await post(AUTH_ROUTES.login, {
      identifier: user.username,
      password: VALID_PASSWORD,
    });

    expect(response.status).toBe(200);

    return response.body.accessToken as string;
  }

  function adminToken() {
    return login(ADMIN, 'ADMIN');
  }

  function playerToken() {
    return login(PLAYER);
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

  describe('leitura pública', () => {
    it('CA-F6-01: GET /platforms sem token retorna 200 com todas as plataformas, gameCount e sem nome normalizado', async () => {
      const response = await get(PLATFORM_ROUTES.list);

      expect(response.status).toBe(200);
      expect(platformListSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.data).toHaveLength(5);
      expect(response.body.meta).toBeUndefined();

      const item = response.body.data[0];

      expect(Object.keys(item).sort()).toEqual(['gameCount', 'id', 'name', 'slug']);
      expect(JSON.stringify(response.body)).not.toContain('nameNormalized');
      expect(JSON.stringify(response.body)).not.toContain('name_normalized');
    });

    it('CA-F6-02: a ordem é por nome (pt-BR, sem diferenciar caixa) e gameCount reflete os vínculos', async () => {
      const response = await get(PLATFORM_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data.map((platform: { name: string }) => platform.name)).toEqual([
        'Nintendo Switch',
        'PC',
        'PlayStation 5',
        'Série X',
        'Xbox Series X/S',
      ]);
      expect(
        Object.fromEntries(
          response.body.data.map((platform: { slug: string; gameCount: number }) => [
            platform.slug,
            platform.gameCount,
          ]),
        ),
      ).toEqual({
        'nintendo-switch': 1,
        pc: 2,
        'playstation-5': 1,
        'serie-x': 0,
        'xbox-series-x-s': 0,
      });
    });

    it('CA-F6-02: nomes equivalentes na collation são desempatados pelo slug', async () => {
      // Premissa: "Ａtari" (A fullwidth) e "Atari" empatam na collation pt-BR com
      // `sensitivity: 'base'`, usada pelo serviço, mas têm formas normalizadas diferentes
      // ("ａtari" e "atari") — por isso os dois são aceitos pela unicidade do nome e o
      // par persistido exercita o desempate por `slug` da RN-F6-08.
      const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

      expect(collator.compare('Ａtari', 'Atari')).toBe(0);

      await prisma.platform.deleteMany();
      await createPlatform(prisma, { name: 'Ａtari', slug: 'zeta-empate' });
      await createPlatform(prisma, { name: 'Atari', slug: 'alfa-empate' });

      const normalized = await prisma.platform.findMany({
        orderBy: { slug: 'asc' },
        select: { nameNormalized: true },
      });

      expect(normalized.map((platform) => platform.nameNormalized)).toEqual(['atari', 'ａtari']);

      const response = await get(PLATFORM_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ name: 'Atari', slug: 'alfa-empate' }),
        expect.objectContaining({ name: 'Ａtari', slug: 'zeta-empate' }),
      ]);
    });

    it('CA-F6-03: GET /platforms/:platform funciona com slug e com id; inexistente retorna 404', async () => {
      const bySlug = await get(`${PLATFORM_ROUTES.list}/playstation-5`);

      expect(bySlug.status).toBe(200);
      expect(platformDetailSchema.safeParse(bySlug.body).success).toBe(true);
      expect(bySlug.body).toMatchObject({
        name: 'PlayStation 5',
        slug: 'playstation-5',
        gameCount: 1,
      });
      expect(bySlug.body.createdAt).toEqual(expect.any(String));
      expect(bySlug.body.updatedAt).toEqual(expect.any(String));

      const platform = await prisma.platform.findUnique({ where: { slug: 'playstation-5' } });
      const byId = await get(`${PLATFORM_ROUTES.list}/${platform?.id}`);

      expect(byId.status).toBe(200);
      expect(byId.body.slug).toBe('playstation-5');

      const unknownSlug = await get(`${PLATFORM_ROUTES.list}/nao-existe`);
      const unknownId = await get(`${PLATFORM_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`);

      for (const response of [unknownSlug, unknownId]) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });

    it('CA-F6-05: a listagem e o detalhe usam um número constante de consultas (sem N+1)', async () => {
      queryCount = 0;
      await get(PLATFORM_ROUTES.list);
      const listWithFew = queryCount;

      await get(`${PLATFORM_ROUTES.list}/pc`);
      const detailWithFew = queryCount - listWithFew;

      for (let index = 0; index < 10; index += 1) {
        await createPlatform(prisma, { name: `Extra ${index}`, slug: `extra-${index}` });
      }

      queryCount = 0;
      await get(PLATFORM_ROUTES.list);
      const listWithMany = queryCount;

      await get(`${PLATFORM_ROUTES.list}/pc`);
      const detailWithMany = queryCount - listWithMany;

      expect(listWithFew).toBe(listWithMany);
      expect(detailWithFew).toBe(detailWithMany);
      expect(listWithFew).toBeLessThanOrEqual(2);
    });
  });

  describe('autorização', () => {
    it('CA-F6-07: POST, PATCH e DELETE sem token retornam 401 UNAUTHENTICATED', async () => {
      const responses = [
        await post(PLATFORM_ROUTES.list, { name: 'Dreamcast' }),
        await patch(`${PLATFORM_ROUTES.list}/pc`, { name: 'PC Master Race' }),
        await remove(`${PLATFORM_ROUTES.list}/xbox-series-x-s`),
      ];

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('CA-F6-08: PLAYER recebe 403 e não altera dados; ADMIN é permitido', async () => {
      const token = await playerToken();

      const create = await post(PLATFORM_ROUTES.list, { name: 'Dreamcast' }, token);
      const rename = await patch(`${PLATFORM_ROUTES.list}/pc`, { name: 'PC Master Race' }, token);
      const removeAttempt = await remove(`${PLATFORM_ROUTES.list}/xbox-series-x-s`, token);

      for (const response of [create, rename, removeAttempt]) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }

      expect(await prisma.platform.count({ where: { slug: 'dreamcast' } })).toBe(0);
      expect((await prisma.platform.findUnique({ where: { slug: 'pc' } }))?.name).toBe('PC');

      const admin = await adminToken();
      const allowed = await post(PLATFORM_ROUTES.list, { name: 'Dreamcast' }, admin);

      expect(allowed.status).toBe(201);
    });
  });

  describe('criação', () => {
    it('CA-F6-10: POST apenas com nome deriva o slug, retorna 201 com Location e aparece na listagem', async () => {
      const token = await adminToken();
      const response = await post(PLATFORM_ROUTES.list, { name: 'PlayStation 6' }, token);

      expect(response.status).toBe(201);
      expect(platformDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        name: 'PlayStation 6',
        slug: 'playstation-6',
        gameCount: 0,
      });
      expect(response.headers.location).toBe('/api/v1/platforms/playstation-6');

      const list = await get(PLATFORM_ROUTES.list);
      const created = list.body.data.find(
        (platform: { slug: string }) => platform.slug === 'playstation-6',
      );

      expect(created).toMatchObject({ name: 'PlayStation 6', gameCount: 0 });
    });

    it('CA-F6-11: POST com slug informado normaliza e respeita o valor', async () => {
      const token = await adminToken();
      const response = await post(
        PLATFORM_ROUTES.list,
        { name: 'Sega Saturn', slug: 'Sega-Saturn' },
        token,
      );

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('sega-saturn');

      const unrelated = await post(
        PLATFORM_ROUTES.list,
        { name: 'Dreamcast', slug: 'dc-1998' },
        token,
      );

      expect(unrelated.status).toBe(201);
      expect(unrelated.body.slug).toBe('dc-1998');
    });

    it('CA-F6-12: nome duplicado (ignorando caixa/acentos) e slug duplicado retornam 409', async () => {
      const token = await adminToken();

      const sameName = await post(PLATFORM_ROUTES.list, { name: 'PC' }, token);
      const caseVariant = await post(PLATFORM_ROUTES.list, { name: 'Pc' }, token);
      const accentVariant = await post(PLATFORM_ROUTES.list, { name: 'Serie X' }, token);
      const sameSlug = await post(PLATFORM_ROUTES.list, { name: 'Dreamcast', slug: 'pc' }, token);

      expect(sameName.status).toBe(409);
      expect(sameName.body.error.code).toBe('PLATFORM_NAME_TAKEN');
      expect(caseVariant.status).toBe(409);
      expect(caseVariant.body.error.code).toBe('PLATFORM_NAME_TAKEN');
      expect(accentVariant.status).toBe(409);
      expect(accentVariant.body.error.code).toBe('PLATFORM_NAME_TAKEN');
      expect(sameSlug.status).toBe(409);
      expect(sameSlug.body.error.code).toBe('PLATFORM_SLUG_TAKEN');
    });

    it('CA-F6-13: entradas inválidas retornam 400 VALIDATION_ERROR', async () => {
      const token = await adminToken();

      const cases: { body: unknown; field?: string }[] = [
        { body: { name: '' }, field: 'name' },
        { body: { name: '   ' }, field: 'name' },
        { body: { name: 'a'.repeat(61) }, field: 'name' },
        { body: { name: 'Nome\u0007Inválido' }, field: 'name' },
        { body: { name: 'Dreamcast', slug: '-dc' }, field: 'slug' },
        { body: { name: 'Dreamcast', slug: 'dc--1998' }, field: 'slug' },
        { body: { name: 'Dreamcast', slug: 'dc 1998' }, field: 'slug' },
        { body: { name: 'Dreamcast', slug: 'a'.repeat(71) }, field: 'slug' },
        { body: { name: 'Dreamcast', cor: 'branco' } },
        { body: { name: '!!!' }, field: 'name' },
      ];

      for (const testCase of cases) {
        expectValidationError(
          await post(PLATFORM_ROUTES.list, testCase.body, token),
          testCase.field,
        );
      }
    });

    it('CA-F6-14: o nome é persistido com trim e espaços internos colapsados', async () => {
      const token = await adminToken();
      const response = await post(PLATFORM_ROUTES.list, { name: '  Mega   Drive  ' }, token);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Mega Drive');
      expect(response.body.slug).toBe('mega-drive');

      const stored = await prisma.platform.findUnique({ where: { slug: 'mega-drive' } });

      expect(stored?.name).toBe('Mega Drive');
      expect(stored?.nameNormalized).toBe('mega drive');
    });
  });

  describe('renomeação', () => {
    it('CA-F6-15: PATCH atualiza o nome e updatedAt, preservando slug e createdAt', async () => {
      const token = await adminToken();
      const before = await prisma.platform.findUnique({ where: { slug: 'playstation-5' } });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const response = await patch(
        `${PLATFORM_ROUTES.list}/playstation-5`,
        { name: 'PlayStation 5 Pro' },
        token,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'PlayStation 5 Pro',
        slug: 'playstation-5',
      });
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        before?.updatedAt.getTime() ?? 0,
      );
    });

    it('CA-F6-16: PATCH com nome equivalente é aceito sem alteração efetiva', async () => {
      const token = await adminToken();
      const before = await prisma.platform.findUnique({ where: { slug: 'playstation-5' } });

      const response = await patch(
        `${PLATFORM_ROUTES.list}/playstation-5`,
        { name: '  PLAYSTATION 5 ' },
        token,
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('PlayStation 5');
      expect(response.body.updatedAt).toBe(before?.updatedAt.toISOString());
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
    });

    it('CA-F6-17: conflito de nome, corpo inválido e identificador inexistente são rejeitados', async () => {
      const token = await adminToken();

      const conflict = await patch(`${PLATFORM_ROUTES.list}/playstation-5`, { name: 'PC' }, token);

      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('PLATFORM_NAME_TAKEN');

      expectValidationError(await patch(`${PLATFORM_ROUTES.list}/playstation-5`, {}, token));
      expectValidationError(
        await patch(`${PLATFORM_ROUTES.list}/playstation-5`, { slug: 'novo-slug' }, token),
      );
      expectValidationError(
        await patch(
          `${PLATFORM_ROUTES.list}/playstation-5`,
          { name: 'PlayStation 5', extra: true },
          token,
        ),
      );

      const unknownSlug = await patch(
        `${PLATFORM_ROUTES.list}/nao-existe`,
        { name: 'Novo' },
        token,
      );
      const unknownId = await patch(
        `${PLATFORM_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`,
        { name: 'Novo' },
        token,
      );

      for (const response of [unknownSlug, unknownId]) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });
  });

  describe('exclusão', () => {
    it('CA-F6-18: DELETE sem vínculos retorna 204 e a plataforma some das leituras', async () => {
      const token = await adminToken();
      const response = await remove(`${PLATFORM_ROUTES.list}/xbox-series-x-s`, token);

      expect(response.status).toBe(204);
      expect(await prisma.platform.count({ where: { slug: 'xbox-series-x-s' } })).toBe(0);

      const detail = await get(`${PLATFORM_ROUTES.list}/xbox-series-x-s`);

      expect(detail.status).toBe(404);

      const list = await get(PLATFORM_ROUTES.list);

      expect(
        list.body.data.some((platform: { slug: string }) => platform.slug === 'xbox-series-x-s'),
      ).toBe(false);
    });

    it('CA-F6-19: DELETE de plataforma em uso retorna 409 PLATFORM_IN_USE e preserva os dados', async () => {
      const token = await adminToken();
      const response = await remove(`${PLATFORM_ROUTES.list}/pc`, token);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('PLATFORM_IN_USE');
      expect(response.body.error.message).toContain('2 jogos');

      expect(await prisma.platform.count({ where: { slug: 'pc' } })).toBe(1);
      expect(await prisma.gamePlatform.count({ where: { platform: { slug: 'pc' } } })).toBe(2);
    });

    it('CA-F6-20: depois de desvincular os jogos, a mesma exclusão funciona', async () => {
      const token = await adminToken();

      expect((await remove(`${PLATFORM_ROUTES.list}/pc`, token)).status).toBe(409);

      await prisma.game.deleteMany({ where: { slug: { in: ['zelda', 'acao-total'] } } });

      const response = await remove(`${PLATFORM_ROUTES.list}/pc`, token);

      expect(response.status).toBe(204);
      expect(await prisma.platform.count({ where: { slug: 'pc' } })).toBe(0);
    });

    it('CA-F6-18: DELETE de identificador inexistente retorna 404', async () => {
      const token = await adminToken();
      const response = await remove(`${PLATFORM_ROUTES.list}/nao-existe`, token);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('dados, migração e seed', () => {
    it('CA-F6-21: o seed preenche name_normalized, é idempotente e a unicidade normalizada vale para as plataformas semeadas', async () => {
      await resetDatabase();

      const first = await seedCatalog(prisma, 'test');

      expect(first.status).toBe('seeded');
      expect(await prisma.platform.count()).toBe(6);

      const second = await seedCatalog(prisma, 'test');

      expect(second).toMatchObject({ status: 'seeded', platforms: 0 });
      expect(await prisma.platform.count()).toBe(6);

      const seeded = await prisma.platform.findUnique({ where: { slug: 'playstation-5' } });

      expect(seeded?.name).toBe('PlayStation 5');
      expect(seeded?.nameNormalized).toBe('playstation 5');

      const token = await adminToken();
      const duplicate = await post(PLATFORM_ROUTES.list, { name: 'Pc' }, token);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('PLATFORM_NAME_TAKEN');
    });
  });
});
