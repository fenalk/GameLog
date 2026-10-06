import {
  AUTH_ROUTES,
  GENRE_ROUTES,
  apiErrorSchema,
  genreDetailSchema,
  genreListSchema,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedCatalog } from '../../src/backend/src/modules/catalog/catalog.seed.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame, createGenre } from '../helpers/catalog.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const ADMIN = { username: 'admin_generos', email: 'admin_generos@example.com' };
const PLAYER = { username: 'jogador_generos', email: 'jogador_generos@example.com' };

/** Fixtures determinísticas (4 gêneros; três com jogos, um sem). */
async function createFixtures(): Promise<void> {
  await createGenre(prisma, { name: 'Aventura', slug: 'aventura' });
  await createGenre(prisma, { name: 'Ação', slug: 'acao' });
  await createGenre(prisma, { name: 'RPG', slug: 'rpg' });
  await createGenre(prisma, { name: 'Puzzle', slug: 'puzzle' });

  await createGame(prisma, { slug: 'zelda', title: 'Zelda', genres: ['aventura', 'rpg'] });
  await createGame(prisma, { slug: 'acao-total', title: 'Ação Total', genres: ['acao'] });
}

describe('SPEC F5 — gerenciamento de gênero (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F5-05 (o evento só
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
    it('CA-F5-01: GET /genres sem token retorna 200 com todos os gêneros, gameCount e sem nome normalizado', async () => {
      const response = await get(GENRE_ROUTES.list);

      expect(response.status).toBe(200);
      expect(genreListSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.data).toHaveLength(4);
      expect(response.body.meta).toBeUndefined();

      const item = response.body.data[0];

      expect(Object.keys(item).sort()).toEqual(['gameCount', 'id', 'name', 'slug']);
      expect(JSON.stringify(response.body)).not.toContain('nameNormalized');
      expect(JSON.stringify(response.body)).not.toContain('name_normalized');
    });

    it('CA-F5-02: a ordem é por nome (pt-BR, sem diferenciar caixa) e gameCount reflete os vínculos', async () => {
      const response = await get(GENRE_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data.map((genre: { name: string }) => genre.name)).toEqual([
        'Ação',
        'Aventura',
        'Puzzle',
        'RPG',
      ]);
      expect(
        Object.fromEntries(
          response.body.data.map((genre: { slug: string; gameCount: number }) => [
            genre.slug,
            genre.gameCount,
          ]),
        ),
      ).toEqual({ acao: 1, aventura: 1, puzzle: 0, rpg: 1 });
    });

    it('CA-F5-02: nomes equivalentes na collation são desempatados pelo slug', async () => {
      // Premissa: "Ａção" (A fullwidth) e "Ação" empatam na collation pt-BR com
      // `sensitivity: 'base'`, que é a usada pelo serviço, mas têm formas normalizadas
      // diferentes ("ａcao" e "acao") — por isso os dois são aceitos pela unicidade do
      // nome e o par persistido exercita o desempate por `slug` da RN-F5-08.
      const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

      expect(collator.compare('Ａção', 'Ação')).toBe(0);

      await prisma.genre.deleteMany();
      await createGenre(prisma, { name: 'Ａção', slug: 'zeta-empate' });
      await createGenre(prisma, { name: 'Ação', slug: 'alfa-empate' });

      const normalized = await prisma.genre.findMany({
        orderBy: { slug: 'asc' },
        select: { nameNormalized: true },
      });

      expect(normalized.map((genre) => genre.nameNormalized)).toEqual(['acao', 'ａcao']);

      const response = await get(GENRE_ROUTES.list);

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual([
        expect.objectContaining({ name: 'Ação', slug: 'alfa-empate' }),
        expect.objectContaining({ name: 'Ａção', slug: 'zeta-empate' }),
      ]);
    });

    it('CA-F5-03: GET /genres/:genre funciona com slug e com id; inexistente retorna 404', async () => {
      const bySlug = await get(`${GENRE_ROUTES.list}/acao`);

      expect(bySlug.status).toBe(200);
      expect(genreDetailSchema.safeParse(bySlug.body).success).toBe(true);
      expect(bySlug.body).toMatchObject({ name: 'Ação', slug: 'acao', gameCount: 1 });
      expect(bySlug.body.createdAt).toEqual(expect.any(String));
      expect(bySlug.body.updatedAt).toEqual(expect.any(String));

      const genre = await prisma.genre.findUnique({ where: { slug: 'acao' } });
      const byId = await get(`${GENRE_ROUTES.list}/${genre?.id}`);

      expect(byId.status).toBe(200);
      expect(byId.body.slug).toBe('acao');

      const unknownSlug = await get(`${GENRE_ROUTES.list}/nao-existe`);
      const unknownId = await get(`${GENRE_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`);

      for (const response of [unknownSlug, unknownId]) {
        expect(response.status).toBe(404);
        expect(response.body.error.code).toBe('NOT_FOUND');
      }
    });

    it('CA-F5-05: a listagem e o detalhe usam um número constante de consultas (sem N+1)', async () => {
      queryCount = 0;
      await get(GENRE_ROUTES.list);
      const listWithFew = queryCount;

      await get(`${GENRE_ROUTES.list}/acao`);
      const detailWithFew = queryCount - listWithFew;

      for (let index = 0; index < 10; index += 1) {
        await createGenre(prisma, { name: `Extra ${index}`, slug: `extra-${index}` });
      }

      queryCount = 0;
      await get(GENRE_ROUTES.list);
      const listWithMany = queryCount;

      await get(`${GENRE_ROUTES.list}/acao`);
      const detailWithMany = queryCount - listWithMany;

      expect(listWithFew).toBe(listWithMany);
      expect(detailWithFew).toBe(detailWithMany);
      expect(listWithFew).toBeLessThanOrEqual(2);
    });
  });

  describe('autorização', () => {
    it('CA-F5-07: POST, PATCH e DELETE sem token retornam 401 UNAUTHENTICATED', async () => {
      const responses = [
        await post(GENRE_ROUTES.list, { name: 'Corrida' }),
        await patch(`${GENRE_ROUTES.list}/acao`, { name: 'Ação e Aventura' }),
        await remove(`${GENRE_ROUTES.list}/puzzle`),
      ];

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      }
    });

    it('CA-F5-08: PLAYER recebe 403 e não altera dados; ADMIN é permitido', async () => {
      const token = await playerToken();

      const create = await post(GENRE_ROUTES.list, { name: 'Corrida' }, token);
      const rename = await patch(`${GENRE_ROUTES.list}/acao`, { name: 'Ação e Aventura' }, token);
      const removeAttempt = await remove(`${GENRE_ROUTES.list}/puzzle`, token);

      for (const response of [create, rename, removeAttempt]) {
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      }

      expect(await prisma.genre.count({ where: { slug: 'corrida' } })).toBe(0);
      expect((await prisma.genre.findUnique({ where: { slug: 'acao' } }))?.name).toBe('Ação');

      const admin = await adminToken();
      const allowed = await post(GENRE_ROUTES.list, { name: 'Corrida' }, admin);

      expect(allowed.status).toBe(201);
    });
  });

  describe('criação', () => {
    it('CA-F5-10: POST apenas com nome deriva o slug, retorna 201 com Location e aparece na listagem', async () => {
      const token = await adminToken();
      const response = await post(GENRE_ROUTES.list, { name: 'Ficção Científica' }, token);

      expect(response.status).toBe(201);
      expect(genreDetailSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        name: 'Ficção Científica',
        slug: 'ficcao-cientifica',
        gameCount: 0,
      });
      expect(response.headers.location).toBe('/api/v1/genres/ficcao-cientifica');

      const list = await get(GENRE_ROUTES.list);
      const created = list.body.data.find(
        (genre: { slug: string }) => genre.slug === 'ficcao-cientifica',
      );

      expect(created).toMatchObject({ name: 'Ficção Científica', gameCount: 0 });
    });

    it('CA-F5-11: POST com slug informado normaliza e respeita o valor', async () => {
      const token = await adminToken();
      const response = await post(
        GENRE_ROUTES.list,
        { name: 'Roguelike', slug: 'Rogue-Like' },
        token,
      );

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('rogue-like');

      const unrelated = await post(
        GENRE_ROUTES.list,
        { name: 'Metroidvania', slug: 'exploracao-2d' },
        token,
      );

      expect(unrelated.status).toBe(201);
      expect(unrelated.body.slug).toBe('exploracao-2d');
    });

    it('CA-F5-12: nome duplicado (ignorando caixa/acentos) e slug duplicado retornam 409', async () => {
      const token = await adminToken();

      const sameName = await post(GENRE_ROUTES.list, { name: 'AÇÃO' }, token);
      const accentVariant = await post(GENRE_ROUTES.list, { name: 'Acao' }, token);
      const sameSlug = await post(GENRE_ROUTES.list, { name: 'Corrida', slug: 'acao' }, token);

      expect(sameName.status).toBe(409);
      expect(sameName.body.error.code).toBe('GENRE_NAME_TAKEN');
      expect(accentVariant.status).toBe(409);
      expect(accentVariant.body.error.code).toBe('GENRE_NAME_TAKEN');
      expect(sameSlug.status).toBe(409);
      expect(sameSlug.body.error.code).toBe('GENRE_SLUG_TAKEN');
    });

    it('CA-F5-13: entradas inválidas retornam 400 VALIDATION_ERROR', async () => {
      const token = await adminToken();

      const cases: { body: unknown; field?: string }[] = [
        { body: { name: '' }, field: 'name' },
        { body: { name: '   ' }, field: 'name' },
        { body: { name: 'a'.repeat(51) }, field: 'name' },
        { body: { name: 'Nome\u0007Inválido' }, field: 'name' },
        { body: { name: 'Corrida', slug: '-corrida' }, field: 'slug' },
        { body: { name: 'Corrida', slug: 'corrida--rpg' }, field: 'slug' },
        { body: { name: 'Corrida', slug: 'Corrida RPG' }, field: 'slug' },
        { body: { name: 'Corrida', slug: 'a'.repeat(61) }, field: 'slug' },
        { body: { name: 'Corrida', cor: 'azul' } },
        { body: { name: '!!!' }, field: 'name' },
      ];

      for (const testCase of cases) {
        expectValidationError(await post(GENRE_ROUTES.list, testCase.body, token), testCase.field);
      }
    });

    it('CA-F5-14: o nome é persistido com trim e espaços internos colapsados', async () => {
      const token = await adminToken();
      const response = await post(GENRE_ROUTES.list, { name: '  Mundo   Aberto  ' }, token);

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Mundo Aberto');
      expect(response.body.slug).toBe('mundo-aberto');

      const stored = await prisma.genre.findUnique({ where: { slug: 'mundo-aberto' } });

      expect(stored?.name).toBe('Mundo Aberto');
      expect(stored?.nameNormalized).toBe('mundo aberto');
    });
  });

  describe('renomeação', () => {
    it('CA-F5-15: PATCH atualiza o nome e updatedAt, preservando slug e createdAt', async () => {
      const token = await adminToken();
      const before = await prisma.genre.findUnique({ where: { slug: 'aventura' } });

      await new Promise((resolve) => setTimeout(resolve, 5));

      const response = await patch(
        `${GENRE_ROUTES.list}/aventura`,
        { name: 'Aventura e Exploração' },
        token,
      );

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        name: 'Aventura e Exploração',
        slug: 'aventura',
      });
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
      expect(new Date(response.body.updatedAt).getTime()).toBeGreaterThan(
        before?.updatedAt.getTime() ?? 0,
      );
    });

    it('CA-F5-16: PATCH com nome equivalente é aceito sem alteração efetiva', async () => {
      const token = await adminToken();
      const before = await prisma.genre.findUnique({ where: { slug: 'aventura' } });

      const response = await patch(`${GENRE_ROUTES.list}/aventura`, { name: '  AVENTURA ' }, token);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Aventura');
      expect(response.body.updatedAt).toBe(before?.updatedAt.toISOString());
      expect(response.body.createdAt).toBe(before?.createdAt.toISOString());
    });

    it('CA-F5-17: conflito de nome, corpo inválido e identificador inexistente são rejeitados', async () => {
      const token = await adminToken();

      const conflict = await patch(`${GENRE_ROUTES.list}/aventura`, { name: 'Ação' }, token);

      expect(conflict.status).toBe(409);
      expect(conflict.body.error.code).toBe('GENRE_NAME_TAKEN');

      expectValidationError(await patch(`${GENRE_ROUTES.list}/aventura`, {}, token));
      expectValidationError(
        await patch(`${GENRE_ROUTES.list}/aventura`, { slug: 'novo-slug' }, token),
      );
      expectValidationError(
        await patch(`${GENRE_ROUTES.list}/aventura`, { name: 'Aventura', extra: true }, token),
      );

      const unknownSlug = await patch(`${GENRE_ROUTES.list}/nao-existe`, { name: 'Novo' }, token);
      const unknownId = await patch(
        `${GENRE_ROUTES.list}/3f2504e0-4f89-41d3-9a0c-0305e82c3301`,
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
    it('CA-F5-18: DELETE sem vínculos retorna 204 e o gênero some das leituras', async () => {
      const token = await adminToken();
      const response = await remove(`${GENRE_ROUTES.list}/puzzle`, token);

      expect(response.status).toBe(204);
      expect(await prisma.genre.count({ where: { slug: 'puzzle' } })).toBe(0);

      const detail = await get(`${GENRE_ROUTES.list}/puzzle`);

      expect(detail.status).toBe(404);

      const list = await get(GENRE_ROUTES.list);

      expect(list.body.data.some((genre: { slug: string }) => genre.slug === 'puzzle')).toBe(false);
    });

    it('CA-F5-19: DELETE de gênero em uso retorna 409 GENRE_IN_USE e preserva os dados', async () => {
      const token = await adminToken();
      const response = await remove(`${GENRE_ROUTES.list}/acao`, token);

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('GENRE_IN_USE');
      expect(response.body.error.message).toContain('1 jogo');

      expect(await prisma.genre.count({ where: { slug: 'acao' } })).toBe(1);
      expect(await prisma.gameGenre.count({ where: { genre: { slug: 'acao' } } })).toBe(1);
    });

    it('CA-F5-20: depois de desvincular os jogos, a mesma exclusão funciona', async () => {
      const token = await adminToken();

      expect((await remove(`${GENRE_ROUTES.list}/acao`, token)).status).toBe(409);

      await prisma.game.delete({ where: { slug: 'acao-total' } });

      const response = await remove(`${GENRE_ROUTES.list}/acao`, token);

      expect(response.status).toBe(204);
      expect(await prisma.genre.count({ where: { slug: 'acao' } })).toBe(0);
    });

    it('CA-F5-18: DELETE de identificador inexistente retorna 404', async () => {
      const token = await adminToken();
      const response = await remove(`${GENRE_ROUTES.list}/nao-existe`, token);

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('dados, migração e seed', () => {
    it('CA-F5-21: o seed preenche name_normalized, é idempotente e a unicidade normalizada vale para os gêneros semeados', async () => {
      await resetDatabase();

      const first = await seedCatalog(prisma, 'test');

      expect(first.status).toBe('seeded');
      expect(await prisma.genre.count()).toBe(10);

      const second = await seedCatalog(prisma, 'test');

      expect(second).toMatchObject({ status: 'seeded', genres: 0 });
      expect(await prisma.genre.count()).toBe(10);

      const seeded = await prisma.genre.findUnique({ where: { slug: 'acao' } });

      expect(seeded?.name).toBe('Ação');
      expect(seeded?.nameNormalized).toBe('acao');

      const token = await adminToken();
      const duplicate = await post(GENRE_ROUTES.list, { name: 'Acao' }, token);

      expect(duplicate.status).toBe(409);
      expect(duplicate.body.error.code).toBe('GENRE_NAME_TAKEN');
    });
  });
});
