import {
  FOLLOWING_MAX,
  FOLLOW_DEFAULT_SORT,
  FOLLOW_PAGE_DEFAULT,
  FOLLOW_PAGE_SIZE_DEFAULT,
  defaultFollowOrder,
  type FollowItem,
  type FollowPage,
  type FollowQuery,
  type FollowSort,
  type FollowSortOrder,
  type FollowState,
} from '@gamelog/shared';

import { Prisma } from '../../generated/prisma/client.js';
import { apiErrors } from '../../lib/api-error.js';
import { prisma } from '../../lib/prisma.js';
import { isUniqueViolation } from '../../lib/prisma-errors.js';

/**
 * Seguimento entre jogadores (SPEC F12, seções 1 a 3): relação direcionada seguidor→seguido,
 * escrita autenticada pelo próprio usuário, leitura pública de seguidores e seguindo e os
 * contadores derivados do perfil (RN-F12-06). Os vínculos são independentes do diário (F8),
 * da nota (F9), das resenhas (F10) e das listas (F11) — RN-F12-12.
 */

/** Direção da listagem: quem segue o perfil (`followers`) ou quem o perfil segue (`following`). */
export type FollowDirection = 'followers' | 'following';

export type FollowCounts = { followersCount: number; followingCount: number };

type UserRef = { id: string; username: string };

/** Dados de exibição dos itens (RN-F12-09): nunca inclui e-mail, papel, status ou hash. */
const USER_SELECT = { id: true, username: true, displayName: true, avatarUrl: true } as const;

/** Contadores do perfil derivados na leitura (RN-F12-06), sem coluna desnormalizada. */
export async function followCountsFor(userId: string): Promise<FollowCounts> {
  const [followersCount, followingCount] = await Promise.all([
    prisma.follow.count({ where: { followingId: userId } }),
    prisma.follow.count({ where: { followerId: userId } }),
  ]);

  return { followersCount, followingCount };
}

/** Se `followerId` segue `followingId` (base do `isFollowedByMe` — RN-F12-06). */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const link = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });

  return link !== null;
}

/** Alvo do seguimento pelo `username`, sem diferenciar maiúsculas/minúsculas (RN-F12-03). */
async function findTargetOrFail(rawUsername: string): Promise<UserRef> {
  const username = rawUsername.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true, username: true },
  });

  if (!user) {
    throw apiErrors.notFound('Perfil não encontrado');
  }

  return user;
}

/** Estado devolvido pelo `PUT` (RN-F12-04/06): contadores do alvo e o vínculo existente. */
async function followStateFor(target: UserRef): Promise<FollowState> {
  const counts = await followCountsFor(target.id);

  return { username: target.username, ...counts, isFollowedByMe: true };
}

/**
 * Segue um jogador (RN-F12-01 a RN-F12-05): idempotente (o vínculo existente é devolvido
 * sem nova gravação), recusa o autosseguimento e respeita o limite `FOLLOWING_MAX`.
 */
export async function follow(
  followerId: string,
  rawUsername: string,
): Promise<{ state: FollowState; created: boolean }> {
  const target = await findTargetOrFail(rawUsername);

  if (target.id === followerId) {
    throw apiErrors.cannotFollowSelf();
  }

  if (await isFollowing(followerId, target.id)) {
    return { state: await followStateFor(target), created: false };
  }

  const followingCount = await prisma.follow.count({ where: { followerId } });

  if (followingCount >= FOLLOWING_MAX) {
    throw apiErrors.followLimitReached(`Você atingiu o limite de ${FOLLOWING_MAX} seguidos`);
  }

  try {
    await prisma.follow.create({ data: { followerId, followingId: target.id } });
  } catch (error) {
    // Corrida entre duas requisições simultâneas: o unique decide e a resposta permanece
    // idempotente (o vínculo existe, ainda que não tenha sido criado por esta requisição).
    if (!isUniqueViolation(error, 'following_id')) {
      throw error;
    }

    return { state: await followStateFor(target), created: false };
  }

  return { state: await followStateFor(target), created: true };
}

/** Deixa de seguir (RN-F12-03/04): sem vínculo, responde `404 NOT_FOUND`. */
export async function unfollow(followerId: string, rawUsername: string): Promise<void> {
  const target = await findTargetOrFail(rawUsername);

  const removed = await prisma.follow.deleteMany({
    where: { followerId, followingId: target.id },
  });

  if (removed.count === 0) {
    throw apiErrors.notFound('Seguimento não encontrado');
  }
}

/** Ordenação das listagens (RN-F12-08), sempre com os desempates definidos na SPEC. */
function followOrderClause(sort: FollowSort, order: FollowSortOrder): Prisma.Sql {
  const direction = Prisma.raw(order === 'asc' ? 'ASC' : 'DESC');

  switch (sort) {
    case 'username':
      return Prisma.sql`unaccent(lower(u.username)) ${direction}, u.id ASC`;
    case 'recently_followed':
    default:
      return Prisma.sql`f.created_at ${direction}, unaccent(lower(u.username)) ASC, u.id ASC`;
  }
}

/**
 * Listagem paginada de seguidores ou seguindo (RN-F12-07 a RN-F12-10): a página é buscada
 * por id (com o `created_at` do vínculo) e os usuários vêm em uma única consulta, então o
 * número de consultas não depende do `pageSize` (sem N+1).
 */
async function loadFollowPage(
  direction: FollowDirection,
  userId: string,
  viewerId: string | null,
  query: FollowQuery,
): Promise<FollowPage> {
  const sort = query.sort ?? FOLLOW_DEFAULT_SORT;
  const order = query.order ?? defaultFollowOrder(sort);
  const page = query.page ?? FOLLOW_PAGE_DEFAULT;
  const pageSize = query.pageSize ?? FOLLOW_PAGE_SIZE_DEFAULT;

  // Em `/followers` as linhas listadas são os seguidores (`follower_id`); em `/following`,
  // quem o perfil segue (`following_id`). O filtro é sempre a outra ponta do vínculo.
  const listedColumn =
    direction === 'followers' ? Prisma.sql`f.follower_id` : Prisma.sql`f.following_id`;
  const filteredColumn =
    direction === 'followers' ? Prisma.sql`f.following_id` : Prisma.sql`f.follower_id`;

  const [countRows, pageRows] = await Promise.all([
    prisma.$queryRaw<{ total: bigint }[]>(
      Prisma.sql`SELECT COUNT(*) AS total FROM follows f WHERE ${filteredColumn} = ${userId}`,
    ),
    prisma.$queryRaw<{ id: string; followed_at: Date }[]>(
      Prisma.sql`SELECT u.id, f.created_at AS followed_at FROM follows f JOIN users u ON u.id = ${listedColumn} WHERE ${filteredColumn} = ${userId} ORDER BY ${followOrderClause(sort, order)} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    ),
  ]);

  const total = Number(countRows[0]?.total ?? 0);
  const ids = pageRows.map((row) => row.id);
  const followedAtById = new Map(pageRows.map((row) => [row.id, row.followed_at]));

  // RN-F12-09: o vínculo do solicitante é sempre `false` para visitante e ao listar o
  // próprio perfil — as listas do dono não exibem o botão de seguir.
  const viewerFollows = new Set<string>();

  if (viewerId && viewerId !== userId && ids.length > 0) {
    const links = await prisma.follow.findMany({
      where: { followerId: viewerId, followingId: { in: ids } },
      select: { followingId: true },
    });

    for (const link of links) {
      viewerFollows.add(link.followingId);
    }
  }

  const records =
    ids.length === 0
      ? []
      : await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_SELECT });

  const byId = new Map(records.map((record) => [record.id, record]));
  const data: FollowItem[] = [];

  for (const id of ids) {
    const record = byId.get(id);
    const followedAt = followedAtById.get(id);

    if (record && followedAt) {
      data.push({
        username: record.username,
        displayName: record.displayName ?? record.username,
        avatarUrl: record.avatarUrl,
        followedAt: followedAt.toISOString(),
        isFollowedByMe: viewerFollows.has(id),
      });
    }
  }

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/** Seguidores de um jogador (RN-F12-07): público, inclusive para contas `SUSPENDED`. */
export async function listFollowers(
  rawUsername: string,
  viewerId: string | null,
  query: FollowQuery,
): Promise<FollowPage> {
  const profile = await findTargetOrFail(rawUsername);

  return loadFollowPage('followers', profile.id, viewerId, query);
}

/** Quem um jogador segue (RN-F12-07): público, inclusive para contas `SUSPENDED`. */
export async function listFollowing(
  rawUsername: string,
  viewerId: string | null,
  query: FollowQuery,
): Promise<FollowPage> {
  const profile = await findTargetOrFail(rawUsername);

  return loadFollowPage('following', profile.id, viewerId, query);
}
