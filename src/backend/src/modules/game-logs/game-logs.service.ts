import {
  GAME_LOG_DEFAULT_SORT,
  GAME_LOG_PAGE_DEFAULT,
  GAME_LOG_PAGE_SIZE_DEFAULT,
  defaultGameLogOrder,
  type GameLogEntry,
  type GameLogEntryInput,
  type GameLogEntryUpdateInput,
  type GameLogPage,
  type GameLogQuery,
  type GameLogSort,
  type GameLogSortOrder,
  type GameLogStatus,
} from '@gamelog/shared';

import {
  Prisma,
  type GameLogStatus as PrismaGameLogStatus,
} from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';
import { parseGameIdentifier } from '../catalog/game-identifier.js';

/** Campos devolvidos em toda leitura do diário (RN-F8-08): jogo e plataforma em resumo. */
const ENTRY_INCLUDE = {
  game: { select: { id: true, slug: true, title: true, coverUrl: true } },
  platform: { select: { id: true, name: true, slug: true } },
} as const;

type EntryRecord = {
  id: string;
  status: PrismaGameLogStatus;
  startedAt: Date | null;
  finishedAt: Date | null;
  playtimeMinutes: number | null;
  createdAt: Date;
  updatedAt: Date;
  game: { id: string; slug: string; title: string; coverUrl: string | null };
  platform: { id: string; name: string; slug: string } | null;
};

/** Data (`@db.Date`) ↔ `YYYY-MM-DD`: o dia é lido e gravado sempre em UTC (RN-F8-04). */
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDbDate(value: string | null | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function toEntry(record: EntryRecord): GameLogEntry {
  return {
    id: record.id,
    status: record.status,
    startedAt: record.startedAt ? toIsoDate(record.startedAt) : null,
    finishedAt: record.finishedAt ? toIsoDate(record.finishedAt) : null,
    playtimeMinutes: record.playtimeMinutes,
    platform: record.platform
      ? { id: record.platform.id, name: record.platform.name, slug: record.platform.slug }
      : null,
    game: {
      id: record.game.id,
      slug: record.game.slug,
      title: record.game.title,
      coverUrl: record.game.coverUrl,
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Resolve o parâmetro `:game` (convenção da F3) e responde `404` quando o jogo não
 * existir — um registro não pode apontar para um jogo fora do catálogo (RN-F8-07).
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

/**
 * `platformId`, quando informado, deve ser uma das plataformas do jogo (RN-F8-06); a
 * plataforma também precisa existir, o que o vínculo `game_platforms` já garante.
 */
async function assertPlatformBelongsToGame(gameId: string, platformId: string): Promise<void> {
  const link = await prisma.gamePlatform.findUnique({
    where: { gameId_platformId: { gameId, platformId } },
    select: { gameId: true },
  });

  if (!link) {
    throw apiErrors.validation('Plataforma inválida para este jogo', [
      { field: 'platformId', message: 'Selecione uma plataforma vinculada ao jogo' },
    ]);
  }
}

function toStatusList(value: GameLogStatus | GameLogStatus[] | undefined): GameLogStatus[] {
  if (value === undefined) {
    return [];
  }

  return [...new Set(Array.isArray(value) ? value : [value])];
}

/** Filtro compartilhado pelas listagens (RN-F8-08): diário do usuário e status repetível. */
function diaryWhere(userId: string, statuses: GameLogStatus[]): Prisma.Sql {
  const conditions: Prisma.Sql[] = [Prisma.sql`l.user_id = ${userId}`];

  if (statuses.length > 0) {
    conditions.push(Prisma.sql`l.status::text IN (${Prisma.join(statuses)})`);
  }

  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}

/** Ordenação (RN-F8-10), sempre com desempate por `id`; `order` sobrepõe o padrão. */
function orderByClause(sort: GameLogSort, order: GameLogSortOrder): Prisma.Sql {
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'recently_added':
      return Prisma.sql`l.created_at ${direction}, l.id ASC`;
    case 'title':
      return Prisma.sql`unaccent(lower(g.title)) ${direction}, l.id ASC`;
    case 'recently_updated':
    default:
      return Prisma.sql`l.updated_at ${direction}, l.id ASC`;
  }
}

/**
 * Listagem paginada do diário (RN-F8-08 a RN-F8-11): a página é buscada por id e os
 * registros completos (com jogo e plataforma) vêm em uma única consulta, então o número
 * de consultas não depende do `pageSize` (sem N+1).
 */
async function listDiary(userId: string, query: GameLogQuery): Promise<GameLogPage> {
  const sort = query.sort ?? GAME_LOG_DEFAULT_SORT;
  const order = query.order ?? defaultGameLogOrder(sort);
  const page = query.page ?? GAME_LOG_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? GAME_LOG_PAGE_SIZE_DEFAULT;
  const statuses = toStatusList(query.status);
  const where = diaryWhere(userId, statuses);

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM game_logs l ${where}`,
    ),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT l.id FROM game_logs l JOIN games g ON g.id = l.game_id ${where} ORDER BY ${orderByClause(sort, order)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);

  const records =
    ids.length === 0
      ? []
      : await prisma.gameLog.findMany({ where: { id: { in: ids } }, include: ENTRY_INCLUDE });

  const byId = new Map(records.map((record) => [record.id, record]));
  const data: GameLogEntry[] = [];

  for (const id of ids) {
    const record = byId.get(id);

    if (record) {
      data.push(toEntry(record));
    }
  }

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/** Diário próprio do usuário autenticado (RN-F8-08). */
export function listOwnDiary(userId: string, query: GameLogQuery): Promise<GameLogPage> {
  return listDiary(userId, query);
}

/**
 * Diário público (RN-F8-09): o `username` ignora maiúsculas/minúsculas e um username
 * inexistente responde `404`; contas `SUSPENDED` seguem com o diário acessível.
 */
export async function listPublicDiary(
  rawUsername: string,
  query: GameLogQuery,
): Promise<GameLogPage> {
  const username = rawUsername.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });

  if (!user) {
    throw apiErrors.notFound('Perfil não encontrado');
  }

  return listDiary(user.id, query);
}

/** Registro do usuário para o jogo (RN-F8-07); `404` quando o jogo ou o registro não existe. */
export async function getOwnEntry(userId: string, rawGame: string): Promise<GameLogEntry> {
  const gameId = await findGameIdOrFail(rawGame);

  const record = await prisma.gameLog.findUnique({
    where: { userId_gameId: { userId, gameId } },
    include: ENTRY_INCLUDE,
  });

  if (!record) {
    throw apiErrors.notFound('Registro não encontrado no diário');
  }

  return toEntry(record);
}

export type PutEntryResult = { entry: GameLogEntry; created: boolean };

/**
 * Criação/substituição do registro (RN-F8-02): o `PUT` substitui o registro completo e
 * os campos opcionais omitidos viram `null`; o `unique (user_id, game_id)` garante que
 * nunca exista um segundo registro para o mesmo par (idempotente).
 */
export async function putOwnEntry(
  userId: string,
  rawGame: string,
  input: GameLogEntryInput,
): Promise<PutEntryResult> {
  const gameId = await findGameIdOrFail(rawGame);

  if (input.platformId) {
    await assertPlatformBelongsToGame(gameId, input.platformId);
  }

  const data = {
    status: input.status,
    startedAt: toDbDate(input.startedAt),
    finishedAt: toDbDate(input.finishedAt),
    playtimeMinutes: input.playtimeMinutes ?? null,
    platformId: input.platformId ?? null,
  };

  const existing = await prisma.gameLog.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { id: true },
  });

  const record = await prisma.gameLog.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, ...data },
    update: data,
    include: ENTRY_INCLUDE,
  });

  return { entry: toEntry(record), created: existing === null };
}

/**
 * Edição parcial (RN-F8-02): campo omitido não muda e `null` limpa. Quando não há
 * alteração efetiva nenhum `UPDATE` é executado.
 */
export async function patchOwnEntry(
  userId: string,
  rawGame: string,
  input: GameLogEntryUpdateInput,
): Promise<GameLogEntry> {
  const gameId = await findGameIdOrFail(rawGame);

  const record = await prisma.gameLog.findUnique({
    where: { userId_gameId: { userId, gameId } },
    include: ENTRY_INCLUDE,
  });

  if (!record) {
    throw apiErrors.notFound('Registro não encontrado no diário');
  }

  const currentStartedAt = record.startedAt ? toIsoDate(record.startedAt) : null;
  const currentFinishedAt = record.finishedAt ? toIsoDate(record.finishedAt) : null;

  const nextStartedAt =
    input.startedAt === undefined ? currentStartedAt : (input.startedAt ?? null);
  const nextFinishedAt =
    input.finishedAt === undefined ? currentFinishedAt : (input.finishedAt ?? null);

  if (nextStartedAt && nextFinishedAt && nextFinishedAt < nextStartedAt) {
    const message = 'Data de conclusão não pode ser anterior à data de início';

    throw apiErrors.validation(message, [{ field: 'finishedAt', message }]);
  }

  const nextPlaytime =
    input.playtimeMinutes === undefined ? record.playtimeMinutes : (input.playtimeMinutes ?? null);
  const nextPlatformId =
    input.platformId === undefined ? record.platformId : (input.platformId ?? null);

  const platformChanged = nextPlatformId !== record.platformId;

  const data: {
    status?: GameLogStatus;
    startedAt?: Date | null;
    finishedAt?: Date | null;
    playtimeMinutes?: number | null;
    platformId?: string | null;
  } = {};

  if (input.status !== undefined && input.status !== record.status) {
    data.status = input.status;
  }

  if (nextStartedAt !== currentStartedAt) {
    data.startedAt = toDbDate(nextStartedAt);
  }

  if (nextFinishedAt !== currentFinishedAt) {
    data.finishedAt = toDbDate(nextFinishedAt);
  }

  if (nextPlaytime !== record.playtimeMinutes) {
    data.playtimeMinutes = nextPlaytime;
  }

  if (platformChanged) {
    data.platformId = nextPlatformId;
  }

  // Sem alteração efetiva não há `UPDATE` (RN-F8-02).
  if (Object.keys(data).length === 0) {
    return toEntry(record);
  }

  if (data.platformId) {
    await assertPlatformBelongsToGame(gameId, data.platformId);
  }

  const updated = await prisma.gameLog.update({
    where: { userId_gameId: { userId, gameId } },
    data,
    include: ENTRY_INCLUDE,
  });

  return toEntry(updated);
}

/** Remoção (RN-F8-02): `404` quando não há registro; repetir o `PUT` depois recria. */
export async function deleteOwnEntry(userId: string, rawGame: string): Promise<void> {
  const gameId = await findGameIdOrFail(rawGame);

  const deleted = await prisma.gameLog.deleteMany({ where: { userId, gameId } });

  if (deleted.count === 0) {
    throw apiErrors.notFound('Registro não encontrado no diário');
  }
}
