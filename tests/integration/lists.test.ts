import {
  AUTH_ROUTES,
  LIST_ITEMS_MAX,
  LIST_MAX_PER_USER,
  LIST_ROUTES,
  apiErrorSchema,
  listDetailSchema,
  listItemPageSchema,
  listItemSchema,
  listMeItemPath,
  listMeOrderPath,
  listMePath,
  listPageSchema,
  listPath,
  listSummarySchema,
  listUserPath,
} from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { createGame } from '../helpers/catalog.js';
import { createList, createListItem } from '../helpers/lists.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const AUTH_SCHEME = 'Bearer';

const GAME_A = 'cronicas'; // Crônicas de Aetheria
const GAME_B = 'acao-total'; // Ação Total
const GAME_C = 'zeloria'; // Zeloria

/** Corpo válido do `POST` de lista (seção 3 da SPEC F11). */
function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Melhores RPGs de turno',
    description: 'Uma seleção pessoal.',
    ...overrides,
  };
}

describe('SPEC F11 — criação e gerenciamento de listas (API REST)', () => {
  let app: App;
  let queryCount = 0;

  beforeAll(async () => {
    app = await buildTestApp();

    // Conta as consultas emitidas pelo Prisma para verificar o CA-F11-24 (o evento só
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

  function post(path: string, body: unknown, token?: string) {
    const call = request(app.server).post(testPath(path)).send(body);

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

  async function createOwnList(token: string, body: Record<string, unknown>): Promise<string> {
    const response = await post(LIST_ROUTES.myLists, body, token);

    expect(response.status).toBe(201);

    return listSummarySchema.parse(response.body).id;
  }

  function expectError(
    response: { status: number; body: unknown },
    status: number,
    code: string,
    field?: string,
  ): void {
    expect(response.status).toBe(status);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

    const body = response.body as {
      error: { code: string; details?: { field: string; message: string }[] };
    };

    expect(body.error.code).toBe(code);

    if (field) {
      expect(body.error.details?.some((detail) => detail.field === field)).toBe(true);
    }
  }

  function expectValidationError(response: { status: number; body: unknown }, field?: string) {
    expectError(response, 400, 'VALIDATION_ERROR', field);
  }

  async function setListUpdatedAt(listId: string, date: Date): Promise<void> {
    await prisma.$executeRaw`UPDATE game_lists SET updated_at = ${date} WHERE id = ${listId}::uuid`;
  }

  describe('criação e metadados', () => {
    it('CA-F11-01: POST cria (201) e a lista aparece nas listagens própria e pública', async () => {
      const token = await login('lista_autor');

      const created = await post(LIST_ROUTES.myLists, validBody(), token);

      expect(created.status).toBe(201);
      const list = listSummarySchema.parse(created.body);
      expect(list.title).toBe('Melhores RPGs de turno');
      expect(list.description).toBe('Uma seleção pessoal.');
      expect(list.visibility).toBe('PUBLIC');
      expect(list.itemsCount).toBe(0);
      expect(list.owner).toMatchObject({ username: 'lista_autor' });

      const own = listPageSchema.parse((await get(LIST_ROUTES.myLists, token)).body);
      expect(own.data.map((item) => item.id)).toEqual([list.id]);

      const publicLists = listPageSchema.parse((await get(listUserPath('lista_autor'))).body);
      expect(publicLists.data.map((item) => item.id)).toEqual([list.id]);
    });

    it('CA-F11-02: POST valida título, descrição, visibilidade e campos desconhecidos', async () => {
      const token = await login('lista_validacao');
      const path = LIST_ROUTES.myLists;

      expectValidationError(await post(path, { description: 'sem título' }, token), 'title');
      expectValidationError(await post(path, { title: '   ' }, token), 'title');
      expectValidationError(await post(path, { title: 'x'.repeat(81) }, token), 'title');
      expectValidationError(await post(path, { title: 'Ok\u0000título' }, token), 'title');
      expectValidationError(
        await post(path, { title: 'Ok', description: 'y'.repeat(501) }, token),
        'description',
      );
      expectValidationError(
        await post(path, { title: 'Ok', description: 'z\u0007z' }, token),
        'description',
      );
      expectValidationError(await post(path, { title: 'Ok', visibility: 'SECRET' }, token));
      expectValidationError(await post(path, { title: 'Ok', extra: true }, token));
      expect(await prisma.gameList.count()).toBe(0);
    });

    it('CA-F11-03: normaliza título e descrição; visibility omitida é PUBLIC', async () => {
      const token = await login('lista_norm');

      const created = await post(
        LIST_ROUTES.myLists,
        { title: '  Meus   RPGs  ', description: '  linha 1\r\nlinha 2\rlinha 3  ' },
        token,
      );

      expect(created.status).toBe(201);
      const list = listSummarySchema.parse(created.body);
      expect(list.title).toBe('Meus RPGs');
      expect(list.description).toBe('linha 1\nlinha 2\nlinha 3');
      expect(list.visibility).toBe('PUBLIC');
    });

    it('CA-F11-04: PATCH altera só o enviado, limpa a descrição, rejeita corpo vazio e não grava sem mudança', async () => {
      const token = await login('lista_patch');
      const listId = await createOwnList(token, validBody());
      const path = listMePath(listId);

      const updated = listSummarySchema.parse(
        (await patch(path, { title: 'Novo título' }, token)).body,
      );
      expect(updated.title).toBe('Novo título');
      expect(updated.description).toBe('Uma seleção pessoal.');

      const cleared = listSummarySchema.parse(
        (await patch(path, { description: null }, token)).body,
      );
      expect(cleared.description).toBeNull();

      const past = new Date(Date.now() - 60 * 60 * 1000);
      await setListUpdatedAt(listId, past);

      const same = listSummarySchema.parse(
        (await patch(path, { title: 'Novo título' }, token)).body,
      );
      expect(new Date(same.updatedAt).getTime()).toBe(past.getTime());

      expectValidationError(await patch(path, {}, token));
      expectValidationError(await patch(path, { title: null }, token));
      expectValidationError(await patch(path, { title: 'ok', extra: 1 }, token));

      const missing = await patch(
        listMePath('11111111-1111-4111-8111-111111111111'),
        { title: 'x' },
        token,
      );
      expectError(missing, 404, 'NOT_FOUND');
    });

    it('CA-F11-05: DELETE retorna 204, some com os itens e repetir dá 404', async () => {
      const token = await login('lista_delete');
      const listId = await createOwnList(token, validBody());
      const gameAId = await gameId(GAME_A);
      await createListItem(prisma, { listId, gameId: gameAId, position: 0 });

      const deleted = await remove(listMePath(listId), token);
      expect(deleted.status).toBe(204);
      expect(await prisma.gameList.count({ where: { id: listId } })).toBe(0);
      expect(await prisma.gameListItem.count({ where: { listId } })).toBe(0);

      expectError(await remove(listMePath(listId), token), 404, 'NOT_FOUND');
    });

    it('CA-F11-06: /me/lists exige token, outro dono recebe 404 e ADMIN gerencia as próprias', async () => {
      const tokenA = await login('lista_dono_a');
      const tokenB = await login('lista_dono_b');
      const listId = await createOwnList(tokenA, validBody());

      expect((await get(LIST_ROUTES.myLists)).status).toBe(401);
      expect((await post(LIST_ROUTES.myLists, validBody())).status).toBe(401);
      expect((await patch(listMePath(listId), { title: 'x' })).status).toBe(401);
      expect((await remove(listMePath(listId))).status).toBe(401);
      expect((await put(listMeItemPath(listId, GAME_A), {})).status).toBe(401);
      expect((await put(listMeOrderPath(listId), { games: [] })).status).toBe(401);

      expect((await get(LIST_ROUTES.myLists)).body.error.code).toBe('UNAUTHENTICATED');
      expectError(await patch(listMePath(listId), { title: 'x' }, tokenB), 404, 'NOT_FOUND');
      expectError(await remove(listMePath(listId), tokenB), 404, 'NOT_FOUND');

      const adminToken = await login('lista_admin', 'ADMIN');
      const adminListId = await createOwnList(adminToken, { title: 'Lista do admin' });
      expect((await patch(listMePath(adminListId), { title: 'Editada' }, adminToken)).status).toBe(
        200,
      );
    });
  });

  describe('visibilidade e leitura pública', () => {
    it('CA-F11-07: GET /lists/:id é público para PUBLIC e responde 404 quando não existe', async () => {
      const token = await login('lista_publica');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), { note: 'Destaque' }, token);

      const response = await get(listPath(listId));
      expect(response.status).toBe(200);

      const detail = listDetailSchema.parse(response.body);
      expect(detail.id).toBe(listId);
      expect(detail.owner.username).toBe('lista_publica');
      expect(detail.itemsCount).toBe(1);
      expect(detail.items.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(detail.items.data[0]?.game).toEqual({
        id: await gameId(GAME_A),
        slug: GAME_A,
        title: 'Crônicas de Aetheria',
        coverUrl: 'https://exemplo.com/cronicas.jpg',
      });
      expect(detail.items.data[0]?.note).toBe('Destaque');
      expect(detail.items.data[0]?.position).toBe(0);

      expectError(await get(listPath('11111111-1111-4111-8111-111111111111')), 404, 'NOT_FOUND');
      expectError(await get(listPath('nao-e-uuid')), 404, 'NOT_FOUND');
    });

    it('CA-F11-08: PRIVATE não aparece no perfil nem para o público; só o dono acessa', async () => {
      const token = await login('lista_privada');
      const listId = await createOwnList(token, { title: 'Segredos', visibility: 'PRIVATE' });
      const tokenB = await login('lista_terceiro');

      const publicLists = listPageSchema.parse((await get(listUserPath('lista_privada'))).body);
      expect(publicLists.data).toHaveLength(0);

      const ownLists = listPageSchema.parse((await get(LIST_ROUTES.myLists, token)).body);
      expect(ownLists.data.map((item) => item.id)).toEqual([listId]);
      expect(ownLists.data[0]?.visibility).toBe('PRIVATE');

      expectError(await get(listPath(listId)), 404, 'NOT_FOUND');
      expectError(await get(listPath(listId), tokenB), 404, 'NOT_FOUND');

      const asOwner = await get(listPath(listId), token);
      expect(asOwner.status).toBe(200);
      expect(listDetailSchema.parse(asOwner.body).visibility).toBe('PRIVATE');
    });

    it('CA-F11-09: listas públicas são públicas, ignoram caixa, respondem 200 para SUSPENDED e não expõem dados privados', async () => {
      const token = await login('lista_suspensa');
      await createOwnList(token, validBody());
      await createOwnList(token, { title: 'Privada', visibility: 'PRIVATE' });

      const suspended = await createTestUser({
        username: 'lista_suspenso',
        status: 'SUSPENDED',
      });
      await createList(prisma, { userId: suspended.id, title: 'Do suspenso' });

      const withoutToken = await get(listUserPath('lista_suspensa'));
      expect(withoutToken.status).toBe(200);

      const mixedCase = await get(listUserPath('LISTA_SUSPENSA'));
      expect(mixedCase.status).toBe(200);

      const page = listPageSchema.parse(withoutToken.body);
      expect(page.data).toHaveLength(1);
      expect(page.data[0]?.visibility).toBe('PUBLIC');

      const raw = JSON.stringify(withoutToken.body);
      expect(raw).not.toContain('email');
      expect(raw).not.toContain('password');
      expect(raw).not.toContain('role');

      expect((await get(listUserPath('lista_suspenso'))).status).toBe(200);
      expectError(await get(listUserPath('nao_existe')), 404, 'NOT_FOUND');
    });

    it('CA-F11-10: GET /me/lists inclui PRIVATE, filtra por visibilidade e exige token', async () => {
      const token = await login('lista_minhas');
      const publicId = await createOwnList(token, { title: 'Pública' });
      const privateId = await createOwnList(token, { title: 'Privada', visibility: 'PRIVATE' });

      const all = listPageSchema.parse((await get(LIST_ROUTES.myLists, token)).body);
      expect(all.data.map((item) => item.id).sort()).toEqual([publicId, privateId].sort());

      const onlyPrivate = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { visibility: 'private' })).body,
      );
      expect(onlyPrivate.data.map((item) => item.id)).toEqual([privateId]);

      expect((await get(LIST_ROUTES.myLists)).status).toBe(401);
    });
  });

  describe('itens da lista', () => {
    it('CA-F11-11: PUT adiciona o jogo (201) ao fim da lista', async () => {
      const token = await login('item_add');
      const listId = await createOwnList(token, validBody());

      const first = await put(listMeItemPath(listId, GAME_A), { note: 'Top 1' }, token);
      expect(first.status).toBe(201);
      expect(listItemSchema.parse(first.body).position).toBe(0);

      const second = await put(listMeItemPath(listId, GAME_B), {}, token);
      expect(second.status).toBe(201);
      expect(listItemSchema.parse(second.body).position).toBe(1);

      const detail = listDetailSchema.parse((await get(listPath(listId))).body);
      expect(detail.itemsCount).toBe(2);
      expect(detail.items.data.map((item) => item.game.slug)).toEqual([GAME_A, GAME_B]);
      expect(detail.items.data[0]?.note).toBe('Top 1');
      expect(detail.items.data[0]?.addedAt).toBeTruthy();
    });

    it('CA-F11-12: PUT repetido retorna 200, atualiza a nota, mantém a posição e não duplica', async () => {
      const token = await login('item_substitui');
      const listId = await createOwnList(token, validBody());

      await put(listMeItemPath(listId, GAME_A), { note: 'Antiga' }, token);
      await put(listMeItemPath(listId, GAME_B), {}, token);

      const replaced = await put(listMeItemPath(listId, GAME_A), { note: 'Nova' }, token);
      expect(replaced.status).toBe(200);

      const item = listItemSchema.parse(replaced.body);
      expect(item.note).toBe('Nova');
      expect(item.position).toBe(0);
      expect(await prisma.gameListItem.count({ where: { listId } })).toBe(2);
    });

    it('CA-F11-13: PUT valida jogo, lista e nota', async () => {
      const token = await login('item_validacao');
      const tokenB = await login('item_terceiro');
      const listId = await createOwnList(token, validBody());

      expectError(
        await put(listMeItemPath(listId, 'jogo-inexistente'), {}, token),
        404,
        'NOT_FOUND',
      );
      expectError(
        await put(listMeItemPath(listId, '11111111-1111-4111-8111-111111111111'), {}, token),
        404,
        'NOT_FOUND',
      );
      expectError(await put(listMeItemPath(listId, GAME_A), {}, tokenB), 404, 'NOT_FOUND');
      expectValidationError(
        await put(listMeItemPath(listId, GAME_A), { note: 'a'.repeat(281) }, token),
        'note',
      );
      expectValidationError(
        await put(listMeItemPath(listId, GAME_A), { note: 'nota\u0000controle' }, token),
        'note',
      );
      expectValidationError(await put(listMeItemPath(listId, GAME_A), { extra: 1 }, token));
    });

    it('CA-F11-14: PATCH altera só a nota, limpa com null, rejeita vazio e 404 sem item', async () => {
      const token = await login('item_patch');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), { note: 'Com nota' }, token);

      const updated = listItemSchema.parse(
        (await patch(listMeItemPath(listId, GAME_A), { note: 'Editada' }, token)).body,
      );
      expect(updated.note).toBe('Editada');
      expect(updated.position).toBe(0);

      const cleared = listItemSchema.parse(
        (await patch(listMeItemPath(listId, GAME_A), { note: null }, token)).body,
      );
      expect(cleared.note).toBeNull();

      expectValidationError(await patch(listMeItemPath(listId, GAME_A), {}, token));
      expectError(
        await patch(listMeItemPath(listId, GAME_B), { note: 'x' }, token),
        404,
        'NOT_FOUND',
      );
    });

    it('CA-F11-15: DELETE remove o item, repetir dá 404 e um novo PUT recria ao fim', async () => {
      const token = await login('item_delete');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);
      await put(listMeItemPath(listId, GAME_B), {}, token);

      const deleted = await remove(listMeItemPath(listId, GAME_A), token);
      expect(deleted.status).toBe(204);
      expect(await prisma.gameListItem.count({ where: { listId } })).toBe(1);

      expectError(await remove(listMeItemPath(listId, GAME_A), token), 404, 'NOT_FOUND');

      const recreated = await put(listMeItemPath(listId, GAME_A), {}, token);
      expect(recreated.status).toBe(201);
      expect(listItemSchema.parse(recreated.body).position).toBe(1);
    });

    it('CA-F11-16: mutações de item atualizam o updatedAt; PATCH de metadados sem mudança não', async () => {
      const token = await login('item_updated');
      const listId = await createOwnList(token, validBody());
      const past = new Date(Date.now() - 60 * 60 * 1000);

      await setListUpdatedAt(listId, past);
      await put(listMeItemPath(listId, GAME_A), { note: 'Uma nota' }, token);

      let list = await prisma.gameList.findUniqueOrThrow({
        where: { id: listId },
        select: { updatedAt: true },
      });
      expect(list.updatedAt.getTime()).toBeGreaterThan(past.getTime());

      const afterAdd = list.updatedAt.getTime();

      await patch(listMeItemPath(listId, GAME_A), { note: 'Outra nota' }, token);
      list = await prisma.gameList.findUniqueOrThrow({
        where: { id: listId },
        select: { updatedAt: true },
      });
      expect(list.updatedAt.getTime()).toBeGreaterThanOrEqual(afterAdd);

      const afterPatch = list.updatedAt.getTime();

      // PATCH de metadados sem alteração efetiva não grava (RN-F11-04).
      await patch(listMePath(listId), { title: 'Melhores RPGs de turno' }, token);
      const unchanged = await prisma.gameList.findUniqueOrThrow({
        where: { id: listId },
        select: { updatedAt: true },
      });
      expect(unchanged.updatedAt.getTime()).toBe(afterPatch);
    });
  });

  describe('reordenação e ordenação', () => {
    it('CA-F11-17: PUT /order reordena as posições (0..n-1) e reflete no detalhe', async () => {
      const token = await login('ordem_ok');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);
      await put(listMeItemPath(listId, GAME_B), {}, token);
      await put(listMeItemPath(listId, GAME_C), {}, token);

      const response = await put(
        listMeOrderPath(listId),
        { games: [GAME_C, GAME_A, GAME_B] },
        token,
      );

      expect(response.status).toBe(200);
      const detail = listDetailSchema.parse(response.body);
      expect(detail.items.data.map((item) => item.game.slug)).toEqual([GAME_C, GAME_A, GAME_B]);
      expect(detail.items.data.map((item) => item.position)).toEqual([0, 1, 2]);

      const reloaded = listDetailSchema.parse((await get(listPath(listId))).body);
      expect(reloaded.items.data.map((item) => item.game.slug)).toEqual([GAME_C, GAME_A, GAME_B]);
    });

    it('CA-F11-18: PUT /order rejeita conjunto diferente e aceita lista vazia', async () => {
      const token = await login('ordem_erro');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);
      await put(listMeItemPath(listId, GAME_B), {}, token);

      expectValidationError(
        await put(listMeOrderPath(listId), { games: [GAME_A] }, token),
        'games',
      );
      expectValidationError(
        await put(listMeOrderPath(listId), { games: [GAME_A, GAME_B, GAME_C] }, token),
        'games',
      );
      expectValidationError(
        await put(listMeOrderPath(listId), { games: [GAME_A, GAME_A] }, token),
        'games',
      );
      expectValidationError(
        await put(listMeOrderPath(listId), { games: [GAME_A, 'inexistente'] }, token),
        'games',
      );
      expectValidationError(await put(listMeOrderPath(listId), { games: 'não é array' }, token));

      const emptyToken = await login('ordem_vazia', 'PLAYER');
      const emptyListId = await createOwnList(emptyToken, { title: 'Vazia' });
      const empty = await put(listMeOrderPath(emptyListId), { games: [] }, emptyToken);
      expect(empty.status).toBe(200);
      expect(listDetailSchema.parse(empty.body).items.data).toHaveLength(0);
    });

    it('CA-F11-19: os itens ordenam por position, title e recently_added', async () => {
      await login('ordem_itens');
      const owner = await userId('ordem_itens');
      const list = await createList(prisma, { userId: owner, title: 'Ordenada' });

      await createListItem(prisma, {
        listId: list.id,
        gameId: await gameId(GAME_A),
        position: 2,
      });
      await createListItem(prisma, {
        listId: list.id,
        gameId: await gameId(GAME_B),
        position: 0,
      });
      await createListItem(prisma, {
        listId: list.id,
        gameId: await gameId(GAME_C),
        position: 1,
      });

      const byPosition = listDetailSchema.parse((await get(listPath(list.id))).body);
      expect(byPosition.items.data.map((item) => item.game.slug)).toEqual([GAME_B, GAME_C, GAME_A]);

      const byTitle = listDetailSchema.parse(
        (await get(listPath(list.id), undefined, { sort: 'title' })).body,
      );
      // "Ação Total" < "Crônicas de Aetheria" < "Zeloria" na collation pt-BR.
      expect(byTitle.items.data.map((item) => item.game.slug)).toEqual([GAME_B, GAME_A, GAME_C]);

      const desc = listDetailSchema.parse(
        (await get(listPath(list.id), undefined, { sort: 'title', order: 'desc' })).body,
      );
      expect(desc.items.data.map((item) => item.game.slug)).toEqual([GAME_C, GAME_A, GAME_B]);

      expectValidationError(await get(listPath(list.id), undefined, { sort: 'relevance' }));
    });

    it('CA-F11-20: as listas ordenam por recently_updated, recently_created e title', async () => {
      const token = await login('ordem_listas');
      const owner = await userId('ordem_listas');

      const older = await createList(prisma, {
        userId: owner,
        title: 'Beta',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      });
      const newer = await createList(prisma, {
        userId: owner,
        title: 'Alfa',
        createdAt: new Date('2024-03-01T00:00:00.000Z'),
        updatedAt: new Date('2024-03-02T00:00:00.000Z'),
      });

      const updated = listPageSchema.parse((await get(LIST_ROUTES.myLists, token)).body);
      expect(updated.data.map((item) => item.id)).toEqual([newer.id, older.id]);

      const created = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { sort: 'recently_created' })).body,
      );
      expect(created.data.map((item) => item.id)).toEqual([newer.id, older.id]);

      const title = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { sort: 'title' })).body,
      );
      expect(title.data.map((item) => item.title)).toEqual(['Alfa', 'Beta']);

      expectValidationError(await get(LIST_ROUTES.myLists, token, { sort: 'rating' }));
      expectValidationError(await get(LIST_ROUTES.myLists, token, { page: 0 }));
      expectValidationError(await get(LIST_ROUTES.myLists, token, { pageSize: 101 }));

      const beyond = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { page: 5, pageSize: 10 })).body,
      );
      expect(beyond.data).toEqual([]);
      expect(beyond.meta).toEqual({ page: 5, pageSize: 10, total: 2, totalPages: 1 });
    });
  });

  describe('limites e listagens', () => {
    it('CA-F11-21: exceder 100 listas ou 500 itens retorna 409 LIST_LIMIT_REACHED', async () => {
      const token = await login('limite_listas');
      const owner = await userId('limite_listas');

      await prisma.gameList.createMany({
        data: Array.from({ length: LIST_MAX_PER_USER }, (_, index) => ({
          userId: owner,
          title: `Lista ${index}`,
        })),
      });

      const overflow = await post(LIST_ROUTES.myLists, { title: 'Excedente' }, token);
      expectError(overflow, 409, 'LIST_LIMIT_REACHED');

      // Uma segunda conta para o limite de itens (a primeira já está no teto de listas).
      const itemToken = await login('limite_itens');
      const itemOwner = await userId('limite_itens');
      const list = await createList(prisma, { userId: itemOwner, title: 'Cheia' });

      await prisma.game.createMany({
        data: Array.from({ length: LIST_ITEMS_MAX + 1 }, (_, index) => ({
          slug: `limite-jogo-${index}`,
          title: `Jogo ${index}`,
        })),
      });
      const games = await prisma.game.findMany({
        where: { slug: { startsWith: 'limite-jogo-' } },
        select: { id: true },
      });
      expect(games).toHaveLength(LIST_ITEMS_MAX + 1);

      await prisma.gameListItem.createMany({
        data: games
          .slice(0, LIST_ITEMS_MAX)
          .map((game, index) => ({ listId: list.id, gameId: game.id, position: index })),
      });

      const itemOverflow = await put(
        listMeItemPath(list.id, games[LIST_ITEMS_MAX]!.id),
        {},
        itemToken,
      );
      expectError(itemOverflow, 409, 'LIST_LIMIT_REACHED');
    });

    it('CA-F11-22: as listagens usam o formato { data, meta } com o resumo da lista', async () => {
      const token = await login('lista_formato');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);

      const publicPage = listPageSchema.parse((await get(listUserPath('lista_formato'))).body);
      expect(publicPage.meta).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      const summary = publicPage.data[0]!;
      expect(summary).toMatchObject({ id: listId, itemsCount: 1, visibility: 'PUBLIC' });
      expect(summary.owner).toEqual({
        username: 'lista_formato',
        displayName: 'lista_formato',
        avatarUrl: null,
      });
    });

    it('CA-F11-23: GET /me/lists?game= restringe às listas que contêm o jogo', async () => {
      const token = await login('lista_filtro_jogo');
      const withGame = await createOwnList(token, { title: 'Com o jogo' });
      const withoutGame = await createOwnList(token, { title: 'Sem o jogo' });
      await put(listMeItemPath(withGame, GAME_A), {}, token);

      const filtered = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { game: GAME_A })).body,
      );
      expect(filtered.data.map((item) => item.id)).toEqual([withGame]);

      const byId = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { game: await gameId(GAME_A) })).body,
      );
      expect(byId.data.map((item) => item.id)).toEqual([withGame]);

      expect(filtered.data.map((item) => item.id)).not.toContain(withoutGame);

      expectError(
        await get(LIST_ROUTES.myLists, token, { game: 'jogo-inexistente' }),
        404,
        'NOT_FOUND',
      );
    });

    it('CA-F11-24: as listagens usam um número constante de consultas (sem N+1)', async () => {
      const token = await login('lista_nmais1');
      const owner = await userId('lista_nmais1');

      const manyItems = await createList(prisma, { userId: owner, title: 'Muitos itens' });
      await createListItem(prisma, {
        listId: manyItems.id,
        gameId: await gameId(GAME_A),
        position: 0,
      });
      await createListItem(prisma, {
        listId: manyItems.id,
        gameId: await gameId(GAME_B),
        position: 1,
      });
      await createListItem(prisma, {
        listId: manyItems.id,
        gameId: await gameId(GAME_C),
        position: 2,
      });

      await createList(prisma, { userId: owner, title: 'Segunda' });
      await createList(prisma, { userId: owner, title: 'Terceira' });

      queryCount = 0;
      const smallItems = listDetailSchema.parse(
        (await get(listPath(manyItems.id), token, { pageSize: 1 })).body,
      );
      const smallItemsCount = queryCount;

      queryCount = 0;
      const largeItems = listDetailSchema.parse(
        (await get(listPath(manyItems.id), token, { pageSize: 20 })).body,
      );
      const largeItemsCount = queryCount;

      expect(smallItems.items.data).toHaveLength(1);
      expect(largeItems.items.data).toHaveLength(3);
      expect(smallItemsCount).toBeGreaterThan(0);
      expect(largeItemsCount).toBe(smallItemsCount);

      queryCount = 0;
      const smallLists = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { pageSize: 1 })).body,
      );
      const smallListsCount = queryCount;

      queryCount = 0;
      const largeLists = listPageSchema.parse(
        (await get(LIST_ROUTES.myLists, token, { pageSize: 20 })).body,
      );
      const largeListsCount = queryCount;

      expect(smallLists.data).toHaveLength(1);
      expect(largeLists.data).toHaveLength(3);
      expect(smallListsCount).toBeGreaterThan(0);
      expect(largeListsCount).toBe(smallListsCount);
    });
  });

  describe('cascatas e integração', () => {
    it('CA-F11-25: excluir a conta remove as listas e os itens', async () => {
      const token = await login('lista_cascata_conta');
      const owner = await userId('lista_cascata_conta');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);

      const deleted = await remove('/me', token, { password: VALID_PASSWORD });
      expect(deleted.status).toBe(204);

      expect(await prisma.gameList.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.gameListItem.count({ where: { listId } })).toBe(0);
    });

    it('CA-F11-26: excluir o jogo remove os itens e mantém as listas', async () => {
      const token = await login('lista_cascata_jogo');
      const listId = await createOwnList(token, validBody());
      await put(listMeItemPath(listId, GAME_A), {}, token);
      await put(listMeItemPath(listId, GAME_B), {}, token);

      await prisma.game.delete({ where: { id: await gameId(GAME_A) } });

      expect(await prisma.gameList.count({ where: { id: listId } })).toBe(1);
      expect(await prisma.gameListItem.count({ where: { listId } })).toBe(1);

      const detail = listDetailSchema.parse((await get(listPath(listId))).body);
      expect(detail.itemsCount).toBe(1);
      expect(detail.items.data[0]?.game.slug).toBe(GAME_B);
    });

    it('CA-F11-27: listar um jogo é independente do diário, da nota e das resenhas', async () => {
      const token = await login('lista_indep');
      const owner = await userId('lista_indep');
      const gameAId = await gameId(GAME_A);
      const listId = await createOwnList(token, validBody());

      await put(listMeItemPath(listId, GAME_A), {}, token);
      await remove(listMeItemPath(listId, GAME_A), token);

      expect(await prisma.gameLog.count({ where: { userId: owner } })).toBe(0);
      expect(await prisma.review.count({ where: { userId: owner } })).toBe(0);

      const game = await prisma.game.findUniqueOrThrow({
        where: { id: gameAId },
        select: { ratingAverage: true, ratingCount: true },
      });
      expect(game).toEqual({ ratingAverage: null, ratingCount: 0 });
    });
  });

  it('o detalhe expõe os itens com a página do schema compartilhado', async () => {
    const token = await login('lista_item_page');
    const listId = await createOwnList(token, validBody());
    await put(listMeItemPath(listId, GAME_A), {}, token);

    const detail = listDetailSchema.parse((await get(listPath(listId))).body);
    expect(listItemPageSchema.safeParse(detail.items).success).toBe(true);
  });
});
