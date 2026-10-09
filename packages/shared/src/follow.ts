import { z } from 'zod';

import { GAMES_PAGE_DEFAULT, GAMES_PAGE_SIZE_DEFAULT, GAMES_PAGE_SIZE_MAX } from './catalog.js';

/**
 * Contratos do seguimento entre jogadores (SPEC F12, seção 3): seguir e deixar de seguir
 * pelas rotas `/me/following/:username` e as leituras públicas de seguidores e seguindo.
 * Reutiliza as convenções de paginação, os limites de `page`/`pageSize` e o `order` da F3;
 * os contadores do perfil são aditivos ao contrato da F2 (RN-F2-09/RN-F12-06).
 */

/** Limite configurável de contas seguidas por usuário (RN-F12-05). */
export const FOLLOWING_MAX = 5000;

export const FOLLOW_SORTS = ['recently_followed', 'username'] as const;
export type FollowSort = (typeof FOLLOW_SORTS)[number];

export const FOLLOW_SORT_ORDERS = ['asc', 'desc'] as const;
export type FollowSortOrder = (typeof FOLLOW_SORT_ORDERS)[number];

export const followSortSchema = z.enum(FOLLOW_SORTS, {
  error: `Ordenação deve ser uma das seguintes: ${FOLLOW_SORTS.join(', ')}`,
});

export const followSortOrderSchema = z.enum(FOLLOW_SORT_ORDERS);

/** Ordenação padrão das listagens: seguidos recentemente (RN-F12-08). */
export const FOLLOW_DEFAULT_SORT: FollowSort = 'recently_followed';

/** Direção padrão de cada ordenação: `username` sobe, `recently_followed` desce (RN-F12-08). */
export function defaultFollowOrder(sort: FollowSort): FollowSortOrder {
  return sort === 'username' ? 'asc' : 'desc';
}

/** Rótulos pt-BR das ordenações exibidas na interface (seção 4 da SPEC F12). */
export const FOLLOW_SORT_LABELS: Record<FollowSort, string> = {
  recently_followed: 'Seguidos recentemente',
  username: 'Nome de usuário (A–Z)',
};

export function followSortLabel(sort: FollowSort): string {
  return FOLLOW_SORT_LABELS[sort];
}

/** Texto do botão de seguimento (RN-F12-04): "Seguindo" quando o vínculo existe. */
export function followButtonLabel(following: boolean): string {
  return following ? 'Seguindo' : 'Seguir';
}

const PAGE_MESSAGE = 'Página deve ser um número inteiro maior ou igual a 1';
const PAGE_SIZE_MESSAGE = `Tamanho da página deve ser um número inteiro entre 1 e ${GAMES_PAGE_SIZE_MAX}`;

const pageSchema = z.coerce.number(PAGE_MESSAGE).int(PAGE_MESSAGE).min(1, PAGE_MESSAGE).optional();
const pageSizeSchema = z.coerce
  .number(PAGE_SIZE_MESSAGE)
  .int(PAGE_SIZE_MESSAGE)
  .min(1, PAGE_SIZE_MESSAGE)
  .max(GAMES_PAGE_SIZE_MAX, PAGE_SIZE_MESSAGE)
  .optional();

/** Query string de `GET /users/:username/followers` e `.../following` (RN-F12-07/08). */
export const followQuerySchema = z.object({
  sort: followSortSchema.optional(),
  order: followSortOrderSchema.optional(),
  page: pageSchema,
  pageSize: pageSizeSchema,
});

export type FollowQuery = z.infer<typeof followQuerySchema>;

/**
 * Item das listagens (RN-F12-09): apenas os dados de exibição e o `followedAt` do vínculo
 * (em `/followers`, quando a pessoa passou a seguir o perfil; em `/following`, quando o
 * perfil passou a segui-la). Nunca inclui e-mail, papel, status nem hash de senha.
 */
export const followItemSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  followedAt: z.iso.datetime(),
  isFollowedByMe: z.boolean(),
});

export type FollowItem = z.infer<typeof followItemSchema>;

/** Resposta paginada das listagens de seguidores/seguindo (convenções da F3). */
export const followPageSchema = z.object({
  data: z.array(followItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type FollowPage = z.infer<typeof followPageSchema>;

/** Resposta do `PUT /me/following/:username` (RN-F12-04/06): o estado do alvo. */
export const followStateSchema = z.object({
  username: z.string(),
  followersCount: z.number().int(),
  followingCount: z.number().int(),
  isFollowedByMe: z.boolean(),
});

export type FollowState = z.infer<typeof followStateSchema>;

export const FOLLOW_ROUTES = {
  /** Padrão de seguir/deixar de seguir um jogador (backend). */
  myFollowing: '/me/following/:username',
  /** Padrão de quem segue um jogador (backend). */
  followers: '/users/:username/followers',
  /** Padrão de quem o jogador segue (backend). */
  following: '/users/:username/following',
} as const;

/** Caminho de seguir/deixar de seguir um `username` (frontend e testes). */
export function followMePath(username: string): string {
  return `/me/following/${encodeURIComponent(username)}`;
}

/** Caminho dos seguidores de um `username` (frontend e testes). */
export function followersPath(username: string): string {
  return `/users/${encodeURIComponent(username)}/followers`;
}

/** Caminho de quem um `username` segue (frontend e testes). */
export function followingPath(username: string): string {
  return `/users/${encodeURIComponent(username)}/following`;
}

export const FOLLOW_PAGE_DEFAULT = GAMES_PAGE_DEFAULT;
export const FOLLOW_PAGE_SIZE_DEFAULT = GAMES_PAGE_SIZE_DEFAULT;
export const FOLLOW_PAGE_SIZE_MAX = GAMES_PAGE_SIZE_MAX;
