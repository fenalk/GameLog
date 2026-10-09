import {
  LIST_DEFAULT_SORT,
  LIST_ITEM_DEFAULT_SORT,
  LIST_ITEMS_MAX,
  LIST_MAX_PER_USER,
  LIST_PAGE_DEFAULT,
  LIST_PAGE_SIZE_DEFAULT,
  defaultListOrder,
  defaultListItemOrder,
  type ListDetail,
  type ListInput,
  type ListItem,
  type ListItemInput,
  type ListItemPage,
  type ListItemSort,
  type ListItemUpdateInput,
  type ListItemsQuery,
  type ListOrderInput,
  type ListPage,
  type ListQuery,
  type ListSort,
  type ListSortOrder,
  type ListSummary,
  type ListUpdateInput,
  type ListVisibility,
  type PublicListQuery,
} from '@gamelog/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';
import { parseGameIdentifier } from '../catalog/game-identifier.js';

/**
 * Listas de jogos (SPEC F11, seção 3): criação e gerenciamento das próprias listas,
 * leitura pública por perfil e por permalink, itens com ordem manual e visibilidade.
 * Reutiliza a identificação `:game`, a paginação e o resumo de jogo da F3; a lista é
 * independente do diário (F8), da nota (F9) e das resenhas (F10) — RN-F11-19.
 */

/** Dono exibido nas leituras (RN-F11-13): dados do perfil público, sem dados privados. */
const OWNER_SELECT = { username: true, displayName: true, avatarUrl: true } as const;

/** Resumo completo (RN-F11-13): dono em resumo e contagem de itens derivada na leitura. */
const SUMMARY_INCLUDE = {
  user: { select: OWNER_SELECT },
  _count: { select: { items: true } },
} as const;

/** Item (RN-F11-14): o jogo em resumo. */
const ITEM_INCLUDE = {
  game: { select: { id: true, slug: true, title: true, coverUrl: true } },
} as const;

type ListRecord = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  visibility: ListVisibility;
  createdAt: Date;
  updatedAt: Date;
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  _count: { items: number };
};

type ItemRecord = {
  id: string;
  position: number;
  note: string | null;
  createdAt: Date;
  game: { id: string; slug: string; title: string; coverUrl: string | null };
};

/** Dono público (RN-F11-13): `displayName` nulo é exibido como o `username` (RN-F2-02). */
function toSummary(record: ListRecord): ListSummary {
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    visibility: record.visibility,
    owner: {
      username: record.user.username,
      displayName: record.user.displayName ?? record.user.username,
      avatarUrl: record.user.avatarUrl,
    },
    itemsCount: record._count.items,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toItem(record: ItemRecord): ListItem {
  return {
    game: {
      id: record.game.id,
      slug: record.game.slug,
      title: record.game.title,
      coverUrl: record.game.coverUrl,
    },
    note: record.note,
    position: record.position,
    addedAt: record.createdAt.toISOString(),
  };
}

/** Formato de UUID (qualquer versão); um `:id` malformado responde `404` (seção 3). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseListId(rawId: string): string {
  const value = rawId.trim().toLowerCase();

  if (!UUID_PATTERN.test(value)) {
    throw apiErrors.notFound('Lista não encontrada');
  }

  return value;
}

/** Resolve a lista do próprio usuário; inexistente ou de outro dono responde `404`. */
async function findOwnListOrFail(userId: string, rawId: string): Promise<string> {
  const id = parseListId(rawId);

  const list = await prisma.gameList.findUnique({ where: { id }, select: { userId: true } });

  if (!list || list.userId !== userId) {
    throw apiErrors.notFound('Lista não encontrada');
  }

  return id;
}

/**
 * Resolve o parâmetro `:game` (convenção da F3) e responde `404` quando o jogo não
 * existir — um item não pode apontar para um jogo fora do catálogo (RN-F11-06).
 */
async function findGameIdOrFail(rawIdentifier: string): Promise<string> {
  const identifier = parseGameIdentifier(rawIdentifier);

  const game = await prisma.game.findUnique({
    where: identifier.kind === 'id' ? { id: identifier.value } : { slug: identifier.value },
    select: { id: true },
  });

  if (!game) {
    throw apiErrors.notFound('Jogo não encontrado');
  }

  return game.id;
}

async function assertListLimit(userId: string): Promise<void> {
  const count = await prisma.gameList.count({ where: { userId } });

  if (count >= LIST_MAX_PER_USER) {
    throw apiErrors.listLimitReached(`Você atingiu o limite de ${LIST_MAX_PER_USER} listas`);
  }
}

async function assertItemsLimit(listId: string): Promise<void> {
  const count = await prisma.gameListItem.count({ where: { listId } });

  if (count >= LIST_ITEMS_MAX) {
    throw apiErrors.listLimitReached(`Uma lista pode ter no máximo ${LIST_ITEMS_MAX} jogos`);
  }
}

/** Atualiza `updated_at` da lista nas mutações de item (RN-F11-16). */
async function touchList(tx: Prisma.TransactionClient, listId: string): Promise<void> {
  await tx.gameList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
}

function toVisibilityList(value: ListVisibility | ListVisibility[] | undefined): ListVisibility[] {
  if (value === undefined) {
    return [];
  }

  return [...new Set(Array.isArray(value) ? value : [value])];
}

/** Filtro compartilhado pelas listagens (RN-F11-05/17): dono, visibilidade e jogo. */
function listWhere(
  userId: string,
  visibilities: ListVisibility[] | null,
  gameId: string | null,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`l.user_id = ${userId}`];

  if (visibilities && visibilities.length > 0) {
    conditions.push(Prisma.sql`l.visibility::text IN (${Prisma.join(visibilities)})`);
  }

  if (gameId) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM game_list_items i WHERE i.list_id = l.id AND i.game_id = ${gameId})`,
    );
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

/** Ordenação das listas (RN-F11-10), sempre com desempate por `id`. */
function listOrderClause(sort: ListSort, order: ListSortOrder): Prisma.Sql {
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'recently_created':
      return Prisma.sql`l.created_at ${direction}, l.id ASC`;
    case 'title':
      return Prisma.sql`unaccent(lower(l.title)) ${direction}, l.id ASC`;
    case 'recently_updated':
    default:
      return Prisma.sql`l.updated_at ${direction}, l.id ASC`;
  }
}

/** Ordenação dos itens (RN-F11-09), com os desempates definidos na SPEC. */
function itemOrderClause(sort: ListItemSort, order: ListSortOrder): Prisma.Sql {
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'title':
      return Prisma.sql`unaccent(lower(g.title)) ${direction}, i.position ASC`;
    case 'recently_added':
      return Prisma.sql`i.created_at ${direction}, i.position ASC`;
    case 'position':
    default:
      return Prisma.sql`i.position ${direction}, i.created_at ASC, unaccent(lower(g.title)) ASC`;
  }
}

/**
 * Listagem paginada de listas (RN-F11-12): a página é buscada por id e os resumos
 * completos (com dono e contagem de itens) vêm em uma única consulta, então o número de
 * consultas não depende do `pageSize` (sem N+1).
 */
async function loadListsPage(where: Prisma.Sql, query: PublicListQuery): Promise<ListPage> {
  const sort = query.sort ?? LIST_DEFAULT_SORT;
  const order = query.order ?? defaultListOrder(sort);
  const page = query.page ?? LIST_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? LIST_PAGE_SIZE_DEFAULT;

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM game_lists l ${where}`,
    ),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT l.id FROM game_lists l ${where} ORDER BY ${listOrderClause(sort, order)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);

  const records =
    ids.length === 0
      ? []
      : await prisma.gameList.findMany({ where: { id: { in: ids } }, include: SUMMARY_INCLUDE });

  const byId = new Map(records.map((record) => [record.id, record]));
  const data: ListSummary[] = [];

  for (const id of ids) {
    const record = byId.get(id);

    if (record) {
      data.push(toSummary(record));
    }
  }

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/**
 * Página de itens de uma lista (RN-F11-09/12): a página é buscada por id e os itens
 * completos (com o jogo) vêm em uma única consulta, sem N+1.
 */
async function loadItemsPage(listId: string, query: ListItemsQuery): Promise<ListItemPage> {
  const sort = query.sort ?? LIST_ITEM_DEFAULT_SORT;
  const order = query.order ?? defaultListItemOrder(sort);
  const page = query.page ?? LIST_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? LIST_PAGE_SIZE_DEFAULT;

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM game_list_items i WHERE i.list_id = ${listId}`,
    ),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT i.id FROM game_list_items i JOIN games g ON g.id = i.game_id WHERE i.list_id = ${listId} ORDER BY ${itemOrderClause(sort, order)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);

  const records =
    ids.length === 0
      ? []
      : await prisma.gameListItem.findMany({ where: { id: { in: ids } }, include: ITEM_INCLUDE });

  const byId = new Map(records.map((record) => [record.id, record]));
  const data: ListItem[] = [];

  for (const id of ids) {
    const record = byId.get(id);

    if (record) {
      data.push(toItem(record));
    }
  }

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/** Listas públicas de um jogador (RN-F11-05): apenas `PUBLIC`; username sem caixa. */
export async function listPublicLists(
  rawUsername: string,
  query: PublicListQuery,
): Promise<ListPage> {
  const username = rawUsername.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });

  if (!user) {
    throw apiErrors.notFound('Perfil não encontrado');
  }

  return loadListsPage(listWhere(user.id, ['PUBLIC'], null), query);
}

/** Listas do próprio usuário (RN-F11-05/17): todas as visibilidades, com filtros. */
export async function listOwnLists(userId: string, query: ListQuery): Promise<ListPage> {
  const visibilities = toVisibilityList(query.visibility);
  const gameId = query.game ? await findGameIdOrFail(query.game) : null;

  return loadListsPage(
    listWhere(userId, visibilities.length > 0 ? visibilities : null, gameId),
    query,
  );
}

/**
 * Detalhe (permalink) de uma lista (RN-F11-05/14): `PUBLIC` é pública; `PRIVATE` só é
 * retornada ao dono autenticado, e os demais recebem `404`.
 */
export async function getListDetail(
  rawId: string,
  requesterId: string | null,
  query: ListItemsQuery,
): Promise<ListDetail> {
  const id = parseListId(rawId);

  const list = await prisma.gameList.findUnique({ where: { id }, include: SUMMARY_INCLUDE });

  if (!list || (list.visibility === 'PRIVATE' && list.userId !== requesterId)) {
    throw apiErrors.notFound('Lista não encontrada');
  }

  const items = await loadItemsPage(list.id, query);

  return { ...toSummary(list), items };
}

/** Criação (RN-F11-04): títulos iguais geram listas distintas; `visibility` ausente = PUBLIC. */
export async function createOwnList(userId: string, input: ListInput): Promise<ListSummary> {
  await assertListLimit(userId);

  const list = await prisma.gameList.create({
    data: {
      userId,
      title: input.title,
      description: input.description ?? null,
      ...(input.visibility ? { visibility: input.visibility } : {}),
    },
    include: SUMMARY_INCLUDE,
  });

  return toSummary(list);
}

/**
 * Edição parcial (RN-F11-04): campo omitido não muda e `null` limpa a descrição. Quando
 * não há alteração efetiva nenhum `UPDATE` é executado (o `updatedAt` não muda).
 */
export async function patchOwnList(
  userId: string,
  rawId: string,
  input: ListUpdateInput,
): Promise<ListSummary> {
  const id = await findOwnListOrFail(userId, rawId);

  const current = await prisma.gameList.findUniqueOrThrow({
    where: { id },
    select: { title: true, description: true, visibility: true },
  });

  const data: { title?: string; description?: string | null; visibility?: ListVisibility } = {};

  if (input.title !== undefined && input.title !== current.title) {
    data.title = input.title;
  }

  if (input.description !== undefined) {
    const nextDescription = input.description ?? null;

    if (nextDescription !== current.description) {
      data.description = nextDescription;
    }
  }

  if (input.visibility !== undefined && input.visibility !== current.visibility) {
    data.visibility = input.visibility;
  }

  const list =
    Object.keys(data).length === 0
      ? await prisma.gameList.findUniqueOrThrow({ where: { id }, include: SUMMARY_INCLUDE })
      : await prisma.gameList.update({ where: { id }, data, include: SUMMARY_INCLUDE });

  return toSummary(list);
}

/** Remoção (RN-F11-04): remove a lista com os itens (cascade); inexistente dá `404`. */
export async function deleteOwnList(userId: string, rawId: string): Promise<void> {
  const id = await findOwnListOrFail(userId, rawId);

  await prisma.gameList.delete({ where: { id } });
}

export type PutListItemResult = { item: ListItem; created: boolean };

/**
 * Adição/substituição de um jogo na lista (RN-F11-06): cria ao fim (`201`) ou substitui a
 * nota preservando a posição (`200`); idempotente e sem duplicar (unique `list_id+game_id`).
 */
export async function putOwnListItem(
  userId: string,
  rawId: string,
  rawGame: string,
  input: ListItemInput,
): Promise<PutListItemResult> {
  const listId = await findOwnListOrFail(userId, rawId);
  const gameId = await findGameIdOrFail(rawGame);
  const note = input.note ?? null;

  const existing = await prisma.gameListItem.findUnique({
    where: { listId_gameId: { listId, gameId } },
    select: { id: true },
  });

  if (existing) {
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.gameListItem.update({
        where: { id: existing.id },
        data: { note },
        include: ITEM_INCLUDE,
      });
      await touchList(tx, listId);
      return updated;
    });

    return { item: toItem(item), created: false };
  }

  await assertItemsLimit(listId);

  const item = await prisma.$transaction(async (tx) => {
    const position = await tx.gameListItem.count({ where: { listId } });

    const created = await tx.gameListItem.create({
      data: { listId, gameId, position, note },
      include: ITEM_INCLUDE,
    });
    await touchList(tx, listId);
    return created;
  });

  return { item: toItem(item), created: true };
}

/**
 * Edição parcial do item (RN-F11-07): altera apenas a nota; `null` limpa e, sem alteração
 * efetiva, nenhum `UPDATE` é executado.
 */
export async function patchOwnListItem(
  userId: string,
  rawId: string,
  rawGame: string,
  input: ListItemUpdateInput,
): Promise<ListItem> {
  const listId = await findOwnListOrFail(userId, rawId);
  const gameId = await findGameIdOrFail(rawGame);

  const existing = await prisma.gameListItem.findUnique({
    where: { listId_gameId: { listId, gameId } },
    include: ITEM_INCLUDE,
  });

  if (!existing) {
    throw apiErrors.notFound('Jogo não está nesta lista');
  }

  const nextNote = input.note ?? null;

  if (nextNote === existing.note) {
    return toItem(existing);
  }

  const item = await prisma.$transaction(async (tx) => {
    const updated = await tx.gameListItem.update({
      where: { id: existing.id },
      data: { note: nextNote },
      include: ITEM_INCLUDE,
    });
    await touchList(tx, listId);
    return updated;
  });

  return toItem(item);
}

/** Remoção do item (RN-F11-06): `404` quando o jogo não está na lista. */
export async function deleteOwnListItem(
  userId: string,
  rawId: string,
  rawGame: string,
): Promise<void> {
  const listId = await findOwnListOrFail(userId, rawId);
  const gameId = await findGameIdOrFail(rawGame);

  await prisma.$transaction(async (tx) => {
    const deleted = await tx.gameListItem.deleteMany({ where: { listId, gameId } });

    if (deleted.count === 0) {
      throw apiErrors.notFound('Jogo não está nesta lista');
    }

    await touchList(tx, listId);
  });
}

/**
 * Resolve uma lista de identificadores (`:game`, slug ou UUID) para os ids dos jogos,
 * em **uma** consulta. Devolve `''` nas posições sem jogo correspondente.
 */
async function resolveGameIds(identifiers: string[]): Promise<string[]> {
  const parsed = identifiers.map(parseGameIdentifier);
  const ids = [...new Set(parsed.filter((item) => item.kind === 'id').map((item) => item.value))];
  const slugs = [
    ...new Set(parsed.filter((item) => item.kind === 'slug').map((item) => item.value)),
  ];

  const or: { id?: { in: string[] }; slug?: { in: string[] } }[] = [];

  if (ids.length > 0) {
    or.push({ id: { in: ids } });
  }

  if (slugs.length > 0) {
    or.push({ slug: { in: slugs } });
  }

  const games =
    or.length === 0
      ? []
      : await prisma.game.findMany({ where: { OR: or }, select: { id: true, slug: true } });

  const byId = new Map(games.map((game) => [game.id, game.id]));
  const bySlug = new Map(games.map((game) => [game.slug, game.id]));

  return parsed.map((item) =>
    item.kind === 'id' ? (byId.get(item.value) ?? '') : (bySlug.get(item.value) ?? ''),
  );
}

/**
 * Reordenação (RN-F11-08): o corpo precisa conter exatamente os jogos da lista, uma única
 * vez cada; as posições viram `0..n-1` na ordem informada, de forma atômica.
 */
export async function reorderOwnList(
  userId: string,
  rawId: string,
  input: ListOrderInput,
): Promise<ListDetail> {
  const listId = await findOwnListOrFail(userId, rawId);

  const current = await prisma.gameListItem.findMany({
    where: { listId },
    select: { id: true, gameId: true },
  });

  const currentGameIds = new Set(current.map((item) => item.gameId));
  const resolved = await resolveGameIds(input.games);

  if (resolved.some((gameId) => gameId === '')) {
    const message = 'A ordenação deve conter apenas jogos existentes';

    throw apiErrors.validation(message, [{ field: 'games', message }]);
  }

  if (new Set(resolved).size !== resolved.length) {
    const message = 'A ordenação não pode repetir jogos';

    throw apiErrors.validation(message, [{ field: 'games', message }]);
  }

  if (
    resolved.length !== currentGameIds.size ||
    resolved.some((gameId) => !currentGameIds.has(gameId))
  ) {
    const message = 'A ordenação deve conter exatamente os jogos da lista';

    throw apiErrors.validation(message, [{ field: 'games', message }]);
  }

  const itemIdByGameId = new Map(current.map((item) => [item.gameId, item.id]));
  const orderedItemIds = resolved.map((gameId) => itemIdByGameId.get(gameId) ?? '');

  await prisma.$transaction(async (tx) => {
    if (orderedItemIds.length > 0) {
      const values = orderedItemIds.map((itemId, index) => Prisma.sql`(${itemId}, ${index})`);

      await tx.$executeRaw(
        Prisma.sql`
          UPDATE game_list_items AS i
          SET position = v.position::int, updated_at = NOW()
          FROM (VALUES ${Prisma.join(values)}) AS v(id, position)
          WHERE i.id = v.id::uuid AND i.list_id = ${listId}
        `,
      );
    }

    await touchList(tx, listId);
  });

  const list = await prisma.gameList.findUniqueOrThrow({
    where: { id: listId },
    include: SUMMARY_INCLUDE,
  });
  const items = await loadItemsPage(listId, {});

  return { ...toSummary(list), items };
}
