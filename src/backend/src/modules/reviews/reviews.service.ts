import {
  defaultReviewOrder,
  excerptReviewBody,
  REVIEW_DEFAULT_SORT,
  REVIEW_PAGE_DEFAULT,
  REVIEW_PAGE_SIZE_DEFAULT,
  type ReviewDetail,
  type ReviewInput,
  type ReviewPage,
  type ReviewQuery,
  type ReviewSort,
  type ReviewSortOrder,
  type ReviewSummary,
  type ReviewUpdateInput,
} from '@gamelog/shared';

import { Prisma, type ReviewStatus as PrismaReviewStatus } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';
import { parseGameIdentifier } from '../catalog/game-identifier.js';

/**
 * Resenhas (SPEC F10, seção 3): escrita e gerenciamento das próprias resenhas e leituras
 * públicas por jogo, por perfil e por permalink. Reutiliza a identificação `:game`, a
 * paginação e o resumo de jogo da F3; o status de visibilidade é filtrado nas leituras
 * públicas (as transições são da F14).
 */

/** Campos devolvidos em toda leitura (RN-F10-10): autor e jogo em resumo, sem dados privados. */
const REVIEW_INCLUDE = {
  user: { select: { username: true, displayName: true, avatarUrl: true } },
  game: { select: { id: true, slug: true, title: true, coverUrl: true } },
} as const;

type ReviewRecord = {
  id: string;
  title: string;
  body: string;
  status: PrismaReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  user: { username: string; displayName: string | null; avatarUrl: string | null };
  game: { id: string; slug: string; title: string; coverUrl: string | null };
};

/** Autor público (RN-F10-10): `displayName` nulo é exibido como o `username` (RN-F2-02). */
function toAuthor(user: ReviewRecord['user']) {
  return {
    username: user.username,
    displayName: user.displayName ?? user.username,
    avatarUrl: user.avatarUrl,
  };
}

function toSummary(record: ReviewRecord): ReviewSummary {
  return {
    id: record.id,
    title: record.title,
    excerpt: excerptReviewBody(record.body),
    status: record.status,
    author: toAuthor(record.user),
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

function toDetail(record: ReviewRecord): ReviewDetail {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    status: record.status,
    author: toAuthor(record.user),
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
 * existir — uma resenha não pode apontar para um jogo fora do catálogo (RN-F10-08).
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

/** Ordenação (RN-F10-11), sempre com desempate por `id`; `order` sobrepõe o padrão. */
function orderByClause(sort: ReviewSort, order: ReviewSortOrder): Prisma.Sql {
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'recently_updated':
      return Prisma.sql`r.updated_at ${direction}, r.id ASC`;
    case 'game_title':
      return Prisma.sql`unaccent(lower(g.title)) ${direction}, r.id ASC`;
    case 'recently_created':
    default:
      return Prisma.sql`r.created_at ${direction}, r.id ASC`;
  }
}

/**
 * Listagem paginada (RN-F10-12): a página é buscada por id e as resenhas completas (com
 * autor e jogo) vêm em uma única consulta, então o número de consultas não depende do
 * `pageSize` (sem N+1). O `WHERE` é sempre restrito ao alias `r`.
 */
async function listReviews(where: Prisma.Sql, query: ReviewQuery): Promise<ReviewPage> {
  const sort = query.sort ?? REVIEW_DEFAULT_SORT;
  const order = query.order ?? defaultReviewOrder(sort);
  const page = query.page ?? REVIEW_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? REVIEW_PAGE_SIZE_DEFAULT;

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM reviews r ${where}`,
    ),
    prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT r.id FROM reviews r JOIN games g ON g.id = r.game_id ${where} ORDER BY ${orderByClause(sort, order)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);

  const records =
    ids.length === 0
      ? []
      : await prisma.review.findMany({ where: { id: { in: ids } }, include: REVIEW_INCLUDE });

  const byId = new Map(records.map((record) => [record.id, record]));
  const data: ReviewSummary[] = [];

  for (const id of ids) {
    const record = byId.get(id);

    if (record) {
      data.push(toSummary(record));
    }
  }

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/**
 * Resenhas públicas de um jogo (RN-F10-13): apenas `PUBLISHED`, paginadas e ordenadas;
 * `404` quando o jogo não existe.
 */
export async function listGameReviews(rawGame: string, query: ReviewQuery): Promise<ReviewPage> {
  const gameId = await findGameIdOrFail(rawGame);

  const where = Prisma.sql`WHERE r.status::text = 'PUBLISHED' AND r.game_id = ${gameId}`;

  return listReviews(where, query);
}

/**
 * Resenhas públicas de um jogador (RN-F10-13): apenas `PUBLISHED`; o `username` ignora
 * maiúsculas/minúsculas e um inexistente responde `404` (contas `SUSPENDED` continuam
 * com as resenhas acessíveis).
 */
export async function listPublicReviews(
  rawUsername: string,
  query: ReviewQuery,
): Promise<ReviewPage> {
  const username = rawUsername.trim().toLowerCase();

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });

  if (!user) {
    throw apiErrors.notFound('Perfil não encontrado');
  }

  const where = Prisma.sql`WHERE r.status::text = 'PUBLISHED' AND r.user_id = ${user.id}`;

  return listReviews(where, query);
}

/**
 * Resenhas do próprio autor (RN-F10-09): inclui `PUBLISHED`, `HIDDEN` e `REMOVED`, com o
 * status no item.
 */
export function listOwnReviews(userId: string, query: ReviewQuery): Promise<ReviewPage> {
  const where = Prisma.sql`WHERE r.user_id = ${userId}`;

  return listReviews(where, query);
}

/**
 * Permalink da resenha (RN-F10-14): `PUBLISHED` é pública; uma resenha não publicada só é
 * visível para o próprio autor autenticado; qualquer outro caso responde `404`.
 */
export async function getReviewDetail(id: string, viewerId: string | null): Promise<ReviewDetail> {
  const record = await prisma.review.findUnique({ where: { id }, include: REVIEW_INCLUDE });

  if (!record || (record.status !== 'PUBLISHED' && record.userId !== viewerId)) {
    throw apiErrors.notFound('Resenha não encontrada');
  }

  return toDetail(record);
}

/** Resenha do usuário para o jogo (RN-F10-08); `404` quando o jogo ou a resenha não existe. */
export async function getOwnReview(userId: string, rawGame: string): Promise<ReviewDetail> {
  const gameId = await findGameIdOrFail(rawGame);

  const record = await prisma.review.findUnique({
    where: { userId_gameId: { userId, gameId } },
    include: REVIEW_INCLUDE,
  });

  if (!record) {
    throw apiErrors.notFound('Resenha não encontrada');
  }

  return toDetail(record);
}

export type PutReviewResult = { review: ReviewDetail; created: boolean };

/**
 * Criação/substituição da resenha (RN-F10-02): o `PUT` substitui o conteúdo completo e o
 * `unique (user_id, game_id)` garante que nunca exista uma segunda resenha para o mesmo
 * par. O `upsert` do Prisma usa `ON CONFLICT` sobre a constraint, então requisições
 * concorrentes não criam duplicatas.
 */
export async function putOwnReview(
  userId: string,
  rawGame: string,
  input: ReviewInput,
): Promise<PutReviewResult> {
  const gameId = await findGameIdOrFail(rawGame);

  const existing = await prisma.review.findUnique({
    where: { userId_gameId: { userId, gameId } },
    select: { id: true },
  });

  const record = await prisma.review.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, title: input.title, body: input.body },
    update: { title: input.title, body: input.body },
    include: REVIEW_INCLUDE,
  });

  return { review: toDetail(record), created: existing === null };
}

/**
 * Edição parcial (RN-F10-06): campo omitido não muda; quando não há alteração efetiva
 * nenhum `UPDATE` é executado e o `updatedAt` permanece.
 */
export async function patchOwnReview(
  userId: string,
  rawGame: string,
  input: ReviewUpdateInput,
): Promise<ReviewDetail> {
  const gameId = await findGameIdOrFail(rawGame);

  const record = await prisma.review.findUnique({
    where: { userId_gameId: { userId, gameId } },
    include: REVIEW_INCLUDE,
  });

  if (!record) {
    throw apiErrors.notFound('Resenha não encontrada');
  }

  const data: { title?: string; body?: string } = {};

  if (input.title !== undefined && input.title !== record.title) {
    data.title = input.title;
  }

  if (input.body !== undefined && input.body !== record.body) {
    data.body = input.body;
  }

  // Sem alteração efetiva não há `UPDATE` (RN-F10-06).
  if (Object.keys(data).length === 0) {
    return toDetail(record);
  }

  const updated = await prisma.review.update({
    where: { userId_gameId: { userId, gameId } },
    data,
    include: REVIEW_INCLUDE,
  });

  return toDetail(updated);
}

/** Remoção (RN-F10-02): `404` quando não há resenha; repetir o `PUT` depois recria. */
export async function deleteOwnReview(userId: string, rawGame: string): Promise<void> {
  const gameId = await findGameIdOrFail(rawGame);

  const deleted = await prisma.review.deleteMany({ where: { userId, gameId } });

  if (deleted.count === 0) {
    throw apiErrors.notFound('Resenha não encontrada');
  }
}
