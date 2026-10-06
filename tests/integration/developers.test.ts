import {
  AUTH_ROUTES,
  DEVELOPER_ROUTES,
  apiErrorSchema,
  developerDetailSchema,
  developerListSchema,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCatalog } from '../../src/backend/src/modules/catalog/catalog.seed.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createDeveloper, createGame } from '../helpers/catalog.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const ADMIN = { username: 'admin_devs', email: 'admin_devs@example.com' };
const PLAYER = { username: 'jogador_devs', email: 'jogador_devs@example.com' };

/** Nome do cabeçalho e esquema do token de acesso da API (F1). */
const AUTH_HEADER = 'Authorization';
const BEARER = 'Bearer';

/** Fixtures determinísticas (4 desenvolvedoras; uma com 2 jogos, uma com 1, duas sem). */
async function createFixtures(): Promise<void> {
  await createDeveloper(prisma, { name: 'Aurora Bytes', slug: 'aurora-bytes' });
  await createDeveloper(prisma, { name: 'Boreal Games', slug: 'boreal-games' });
  await createDeveloper(prisma, { name: 'Céu Aberto', slug: 'ceu-aberto' });
  await createDeveloper(prisma, { name: 'Zeta Estúdio', slug: 'zeta-estudio' });

  await createGame(prisma, {
    slug: 'jogo-aurora',
    title: 'Jogo Aurora',
    developers: ['aurora-bytes'],
  });
  await createGame(prisma, {
    slug: 'jogo-boreal-1',
    title: 'Jogo Boreal 1',
    developers: ['boreal-games'],
  });
  await createGame(prisma, {
    slug: 'jogo-boreal-2',
    title: 'Jogo Boreal 2',
    developers: ['boreal-games'],
  });
}

describe('SPEC F7 — gerenciamento de desenvolvedora (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F7-05 (o evento só
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

    return token ? call.set(AUTH_HEADER, `${BEARER} ${token}`) : call;
  }

  function patch(path: string, body: unknown, token?: string) {
    const call = request(app.server).patch(testPath(path)).send(body);

    return token ? call.set(AUTH_HEADER, `${BEARER} ${token}`) : call;
  }

  function remove(path: string, token?: string) {
    const call = request(app.server).delete(testPath(path));

    return token ? call.set(AUTH_HEADER, `${BEARER} ${token}`) : call;
  }

  async function login(user: typeof ADMIN): Promise<string> {
    await createTestUser({
      ...user,
      password: VALID_PASSWORD,
      ...(user === ADMIN ? { role: 'ADMIN' as const } : {}),
    });

    const response = await post(AUTH_ROUTES.login, {
      identifier: user.username,
      password: VALID_PASSWORD,
    });

    expect(response.status).toBe(200);

    return response.body.accessToken as string;
  }

  function adminToken() {
    return login(ADMIN);
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
    it('CA-F7-01: GET /developers sem token retorna 200 com todas as desenvolvedoras e gameCount', async () => {
      const response = await get(DEVELOPER_ROUTES.list);

      expect(response.status).toBe(200);
      expect(developerListSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(response.body.meta).toBeUndefined();

      const item = response.body.data[0];

      expect(Object.keys(item).sort()).toEqual(['gameCount', 'id', 'name', 'slug']);
      expect(JSON.stringify(response.body)).not.toContain('nameNormalized');
      expect(JSON.stringify(response.body)).not.toContain('name_normalized');
    });

    it('CA-F7-02: a ordem é por nome (pt-BR, sem diferenciar caixa) e gameCount reflete os vínculos', async () => {
      const response = await get(DEVELOPER_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data.map((developer: { name: string }) => developer.name)).toEqual([
        'Aurora Bytes',
        'Boreal Games',
        'Céu Aberto',
        'Zeta Estúdio',
      ]);
      expect(
        Object.fromEntries(
          response.body.data.map((developer: { slug: string; gameCount: number }) => [
            developer.slug,
            developer.gameCount,
          ]),
        ),
      ).toEqual({ 'aurora-bytes': 1, 'boreal-games': 2, 'ceu-aberto': 0, 'zeta-estudio': 0 });
    });

    it('CA-F7-02: nomes equivalentes na collation são desempatados pelo slug', async () => {
      // Premissa: "Ａurora" (A fullwidth) e "Aurora" empatam na collation pt-BR com
      // `sensitivity: 'base'`, mas têm formas normalizadas diferentes ("ａurora" e
      // "aurora") — por isso a unicidade do nome aceita as duas e o desempate por slug
      // é exercitado.
      const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

      expect(collator.compare('Ａurora', 'Aurora')).toBe(0);

      await prisma.gameDeveloper.deleteMany();
      await prisma.game.deleteMany();
      await prisma.developer.deleteMany();
      await createDeveloper(prisma, { name: 'Ａurora', slug: 'zeta-empate' });
      await createDeveloper(prisma, { name: 'Aurora', slug: 'alfa-empate' });

      const normalized = await prisma.developer.findMany({
        orderBy: { slug: 'asc' },
        select: { nameNormalized: true },
      });

      expect(normalized.map((developer) => developer.nameNormalized)).toEqual([
        'aurora',
        'ａurora',
      ]);

      const response = await get(DEVELOPER_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ name: 'Aurora', slug: 'alfa-empate' }),
        expect.objectContaining({ name: 'Ａurora', slug: 'zeta-empate' }),
      ]);
    });

    it('CA-F7-03: GET /developers/:developer funciona com slug e com id; inexistente retorna 404', async () => {
      const bySlug = await get(`${DEVELOPER_ROUTES.list}/boreal-games`);

      expect(bySlug.status).toBe(200);
      expect(developerDetailSchema.safeParse(bySlug.body).success).toBe(true);
      expect(bySlug.body).toMatchObject({
        name: 'Boreal Games',
        slug: 'boreal-games',
        gameCount: 2,
      });
      expect(bySlug.body.createdAt).toEqual(expect.any(String));
      expect(bySlug.body.updatedAt).toEqual(expect.any(String));

      const developer = await prisma.developer.findUnique({ where: { slug: 'boreal-games' } });
      const byId = await get(`${DEVELOPER_ROUTES.list}/${developer?.id}`);

      expect(byId.status).toBe(200);
      expect(byId.body.slug).toBe('boreal-games');

      const unknownSlug = await get(`${DEVELOPER_ROUTES.list}/nao-existe`);
      const unknownId = await get(`${DEVELOPER_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`);

      for (const response of [unknownSlug, unknownId]) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });

    it('CA-F7-05: a listagem e o detalhe usam um número constante de consultas (sem N+1)', async () => {
      queryCount = 0;
      await get(DEVELOPER_ROUTES.list);
      const listWithFew = queryCount;

      await get(`${DEVELOPER_ROUTES.list}/boreal-games`);
      const detailWithFew = queryCount - listWithFew;

      for (let index = 0; index < 10; index += 1) {
        await createDeveloper(prisma, { name: `Extra ${index}`, slug: `extra-${index}` });
      }

      queryCount = 0;
      await get(DEVELOPER_ROUTES.list);
      const listWithMany = queryCount;

      await get(`${DEVELOPER_ROUTES.list}/boreal-games`);
      const detailWithMany = queryCount - listWithMany;

      expect(listWithFew).toBe(listWithMany);
      expect(detailWithFew).toBe(detailWithMany);
      expect(listWithFew).toBeLessThanOrEqual(2);
    });
  });

  describe('autorização', () => {
    it('CA-F7-07: POST, PATCH e DELETE sem token retornam 401 UNAUTHENTICATED', async () => {
      const responses = [
        await post(DEVELOPER_ROUTES.list, { name: 'Nova Dev' }),
        await patch(`${DEVELOPER_ROUTES.list}/aurora-bytes`, { name: 'Aurora Renomeada' }),
        await remove(`${DEVELOPER_ROUTES.list}/ceu-aberto`),
      ];

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('CA-F7-08: PLAYER recebe 403 e não altera dados; ADMIN é permitido', async () => {
      const token = await playerToken();

      const create = await post(DEVELOPER_ROUTES.list, { name: 'Nova Dev' }, token);
      const rename = await patch(
        `${DEVELOPER_ROUTES.list}/aurora-bytes`,
        { name: 'Aurora Renomeada' },
        token,
      );
      const removeAttempt = await remove(`${DEVELOPER_ROUTES.list}/ceu-aberto`, token);

      for (const response of [create, rename, removeAttempt]) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }

      expect(await prisma.developer.count({ where: { slug: 'nova-dev' } })).toBe(0);
      expect((await prisma.developer.findUnique({ where: { slug: 'aurora-bytes' } }))?.name).toBe(
        'Aurora Bytes',
      );

      const admin = await adminToken();
      const allowed = await post(DEVELOPER_ROUTES.list, { name: 'Nova Dev' }, admin);

      expect(allowed.status).toBe(201);
    });
  });

  describe('criação', () => {
    it('CA-F7-10: POST apenas com nome deriva o slug, retorna 201 com Location e aparece na listagem', async () => {
      const token = await adminToken();
      const response = await post(DEVELOPER_ROUTES.list, { name: 'Órbita Norte' }, token);

      expect(response.status).toBe(201);
      expect(developerDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        name: 'Órbita Norte',
        slug: 'orbita-norte',
        gameCount: 0,
      });
      expect(response.headers.location).toBe('/api/v1/developers/orbita-norte');

      const list = await get(DEVELOPER_ROUTES.list);
      const created = list.body.data.find(
        (developer: { slug: string }) => developer.slug === 'orbita-norte',
      );

      expect(created).toMatchObject({ name: 'Órbita Norte', gameCount: 0 });
    });

    it('CA-F7-11: POST com slug informado normaliza e respeita o valor', async () => {
      const token = await adminToken();
      const response = await post(
        DEVELOPER_ROUTES.list,
        { name: 'Pixel Voador', slug: 'Studio-Pixel' },
        token,
      );

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('studio-pixel');

      const unrelated = await post(
        DEVELOPER_ROUTES.list,
        { name: 'Pixel & Cia', slug: 'pixel-cia' },
        token,
      );

      expect(unrelated.status).toBe(201);
      expect(unrelated.body.slug).toBe('pixel-cia');
    });

    it('CA-F7-12: nome duplicado (ignorando caixa/acentos) e slug duplicado retornam 409', async () => {
      const token = await adminToken();

      const sameName = await post(DEVELOPER_ROUTES.list, { name: 'AURORA BYTES' }, token);
      const accentVariant = await post(DEVELOPER_ROUTES.list, { name: 'Ceu Aberto' }, token);
      const sameSlug = await post(
        DEVELOPER_ROUTES.list,
        { name: 'Outra Dev', slug: 'aurora-bytes' },
        token,
      );

      expect(sameName.status).toBe(409);
      expect(sameName.body.error.code).toBe('DEVELOPER_NAME_TAKEN');
      expect(accentVariant.status).toBe(409);
      expect(accentVariant.body.error.code).toBe('DEVELOPER_NAME_TAKEN');
      expect(sameSlug.status).toBe(409);
      expect(sameSlug.body.error.code).toBe('DEVELOPER_SLUG_TAKEN');
    });

    it('CA-F7-13: entradas inválidas retornam 400 VALIDATION_ERROR', async () => {
      const token = await adminToken();

      const cases: { body: unknown; field?: string }[] = [
        { body: { name: '' }, field: 'name' },
        { body: { name: '   ' }, field: 'name' },
        { body: { name: 'a'.repeat(101) }, field: 'name' },
        { body: { name: 'Nome\u0007Inválido' }, field: 'name' },
        { body: { name: 'Nova Dev', slug: '-nova-dev' }, field: 'slug' },
        { body: { name: 'Nova Dev', slug: 'nova--dev' }, field: 'slug' },
        { body: { name: 'Nova Dev', slug: 'Nova Dev' }, field: 'slug' },
        { body: { name: 'Nova Dev', slug: 'a'.repeat(111) }, field: 'slug' },
        { body: { name: 'Nova Dev', extra: true } },
        { body: { name: '!!!' }, field: 'name' },
      ];

      for (const testCase of cases) {
        expectValidationError(
          await post(DEVELOPER_ROUTES.list, testCase.body, token),
          testCase.field,
        );
      }
    });

    it('CA-F7-14: o nome é persistido com trim e espaços internos colapsados', async () => {
      const token = await adminToken();
      const response = await post(DEVELOPER_ROUTES.list, { name: '  Estúdio   Vitral  ' }, token);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Estúdio Vitral');
      expect(response.body.slug).toBe('estudio-vitral');

      const stored = await prisma.developer.findUnique({ where: { slug: 'estudio-vitral' } });

      expect(stored?.name).toBe('Estúdio Vitral');
      expect(stored?.nameNormalized).toBe('estudio vitral');
    });
  });

  describe('renomeação', () => {
    it('CA-F7-15: PATCH atualiza o nome e updatedAt, preservando slug e createdAt', async () => {
      const token = await adminToken();
      const before = await prisma.developer.findUnique({ where: { slug: 'aurora-bytes' } });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const response = await patch(
        `${DEVELOPER_ROUTES.list}/aurora-bytes`,
        { name: 'Aurora Byte Works' },
        token,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Aurora Byte Works',
        slug: 'aurora-bytes',
      });
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        before?.updatedAt.getTime() ?? 0,
      );
      // O `slug` é imutável na renomeação, então a mesma URL continua válida (RN-F7-04).
      const detail = await get(`${DEVELOPER_ROUTES.list}/aurora-bytes`);

      expect(detail.body.name).toBe('Aurora Byte Works');
    });

    it('CA-F7-16: PATCH com nome equivalente é aceito sem alteração efetiva', async () => {
      const token = await adminToken();
      const before = await prisma.developer.findUnique({ where: { slug: 'aurora-bytes' } });

      const response = await patch(
        `${DEVELOPER_ROUTES.list}/aurora-bytes`,
        { name: '  AURORA BYTES ' },
        token,
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Aurora Bytes');
      expect(response.body.updatedAt).toBe(before?.updatedAt.toISOString());
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
    });

    it('CA-F7-17: conflito de nome, corpo inválido e identificador inexistente são rejeitados', async () => {
      const token = await adminToken();

      const conflict = await patch(
        `${DEVELOPER_ROUTES.list}/aurora-bytes`,
        { name: 'Boreal Games' },
        token,
      );

      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('DEVELOPER_NAME_TAKEN');

      expectValidationError(await patch(`${DEVELOPER_ROUTES.list}/aurora-bytes`, {}, token));
      expectValidationError(
        await patch(`${DEVELOPER_ROUTES.list}/aurora-bytes`, { slug: 'novo-slug' }, token),
      );
      expectValidationError(
        await patch(
          `${DEVELOPER_ROUTES.list}/aurora-bytes`,
          { name: 'Aurora Bytes', extra: true },
          token,
        ),
      );

      const unknownSlug = await patch(
        `${DEVELOPER_ROUTES.list}/nao-existe`,
        { name: 'Novo' },
        token,
      );
      const unknownId = await patch(
        `${DEVELOPER_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`,
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
    it('CA-F7-18: DELETE sem vínculos retorna 204 e a desenvolvedora some das leituras', async () => {
      const token = await adminToken();
      const response = await remove(`${DEVELOPER_ROUTES.list}/ceu-aberto`, token);

      expect(response.status).toBe(204);
      expect(await prisma.developer.count({ where: { slug: 'ceu-aberto' } })).toBe(0);

      const detail = await get(`${DEVELOPER_ROUTES.list}/ceu-aberto`);

      expect(detail.status).toBe(404);

      const list = await get(DEVELOPER_ROUTES.list);

      expect(
        list.body.data.some((developer: { slug: string }) => developer.slug === 'ceu-aberto'),
      ).toBe(false);
    });

    it('CA-F7-19: DELETE de desenvolvedora em uso retorna 409 DEVELOPER_IN_USE e preserva os dados', async () => {
      const token = await adminToken();
      const response = await remove(`${DEVELOPER_ROUTES.list}/aurora-bytes`, token);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DEVELOPER_IN_USE');
      expect(response.body.error.message).toContain('1 jogo');

      expect(await prisma.developer.count({ where: { slug: 'aurora-bytes' } })).toBe(1);
      expect(
        await prisma.gameDeveloper.count({ where: { developer: { slug: 'aurora-bytes' } } }),
      ).toBe(1);
    });

    it('CA-F7-20: depois de desvincular os jogos, a mesma exclusão funciona', async () => {
      const token = await adminToken();

      expect((await remove(`${DEVELOPER_ROUTES.list}/aurora-bytes`, token)).status).toBe(409);

      await prisma.game.delete({ where: { slug: 'jogo-aurora' } });

      const response = await remove(`${DEVELOPER_ROUTES.list}/aurora-bytes`, token);

      expect(response.status).toBe(204);
      expect(await prisma.developer.count({ where: { slug: 'aurora-bytes' } })).toBe(0);
    });

    it('CA-F7-18: DELETE de identificador inexistente retorna 404', async () => {
      const token = await adminToken();
      const response = await remove(`${DEVELOPER_ROUTES.list}/nao-existe`, token);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('dados, migração e seed', () => {
    it('CA-F7-21: o seed preenche name_normalized, é idempotente e a unicidade normalizada vale para as desenvolvedoras semeadas', async () => {
      await resetDatabase();

      const first = await seedCatalog(prisma, 'test');

      expect(first.status).toBe('seeded');
      expect(await prisma.developer.count()).toBe(10);

      const second = await seedCatalog(prisma, 'test');

      expect(second).toMatchObject({ status: 'seeded', developers: 0 });
      expect(await prisma.developer.count()).toBe(10);

      const seeded = await prisma.developer.findUnique({ where: { slug: 'orbita-norte' } });

      expect(seeded?.name).toBe('Órbita Norte');
      expect(seeded?.nameNormalized).toBe('orbita norte');

      const token = await adminToken();
      const duplicate = await post(DEVELOPER_ROUTES.list, { name: 'ORBITA NORTE' }, token);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('DEVELOPER_NAME_TAKEN');
    });
  });
});
