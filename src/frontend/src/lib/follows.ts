import {
  FOLLOW_DEFAULT_SORT,
  FOLLOW_PAGE_SIZE_DEFAULT,
  FOLLOW_SORTS,
  defaultFollowOrder,
  followMePath,
  followPageSchema,
  followSortLabel,
  followSortOrderSchema,
  followSortSchema,
  followStateSchema,
  followersPath,
  followingPath,
  type FollowPage,
  type FollowSort,
  type FollowSortOrder,
  type FollowState,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest, getAuthState } from '@/lib/auth-store';

/**
 * Cliente do seguimento (SPEC F12, seção 3): seguir e deixar de seguir exigem sessão
 * (`authorizedRequest`, com renovação transparente), enquanto seguidores e seguindo são
 * leitura pública. Com sessão, a leitura também devolve `isFollowedByMe` em cada item
 * (RN-F12-09), por isso o token é enviado quando existe.
 */

/** Direção da listagem: quem segue o perfil (`followers`) ou quem o perfil segue (`following`). */
export type FollowListKind = 'followers' | 'following';

export type FollowListRequest = {
  sort?: FollowSort | undefined;
  order?: FollowSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

/** Query string das listagens (convenções de paginação e `order` da F3). */
export function followListQueryString(request: FollowListRequest): string {
  const params = new URLSearchParams();

  if (request.sort) {
    params.set('sort', request.sort);
  }

  if (request.order) {
    params.set('order', request.order);
  }

  if (request.page !== undefined && request.page > 1) {
    params.set('page', String(request.page));
  }

  if (request.pageSize !== undefined) {
    params.set('pageSize', String(request.pageSize));
  }

  const query = params.toString();

  return query ? `?${query}` : '';
}

/** Caminho da API de seguidores/seguindo de um `username` (RN-F12-07). */
export function followListApiPath(kind: FollowListKind, username: string): string {
  return kind === 'followers' ? followersPath(username) : followingPath(username);
}

/** Rota da página de seguidores/seguindo de um `username` (frontend). */
export function followListPagePath(kind: FollowListKind, username: string): string {
  const segment = kind === 'followers' ? 'seguidores' : 'seguindo';

  return `/jogadores/${encodeURIComponent(username)}/${segment}`;
}

/** Seguidores ou seguindo de um jogador — público, com `isFollowedByMe` quando há sessão. */
export async function fetchFollowList(
  kind: FollowListKind,
  username: string,
  request: FollowListRequest = {},
): Promise<FollowPage> {
  const path = `${followListApiPath(kind, username)}${followListQueryString(request)}`;
  const payload = getAuthState().accessToken
    ? await authorizedRequest(path)
    : await apiRequest(path);

  return followPageSchema.parse(payload);
}

/** Segue um jogador (RN-F12-04): `201` ao criar e `200` quando o vínculo já existia. */
export async function followPlayer(username: string): Promise<FollowState> {
  return followStateSchema.parse(
    await authorizedRequest(followMePath(username), { method: 'PUT' }),
  );
}

/** Deixa de seguir um jogador (RN-F12-04): sem vínculo, a API responde `404`. */
export async function unfollowPlayer(username: string): Promise<void> {
  await authorizedRequest<void>(followMePath(username), { method: 'DELETE' });
}

/** Estado das listagens refletido na URL (página de seguidores/seguindo). */
export type FollowListUrlState = {
  sort: FollowSort | '';
  order: FollowSortOrder | '';
  page: number;
};

/** Lê o estado das listagens a partir da URL; valores inválidos caem no padrão da SPEC. */
export function followListStateFromSearch(search: URLSearchParams): FollowListUrlState {
  const sort = search.get('sort');
  const order = search.get('order');
  const page = Number(search.get('page'));

  return {
    sort: followSortSchema.safeParse(sort).success ? (sort as FollowSort) : '',
    order: followSortOrderSchema.safeParse(order).success ? (order as FollowSortOrder) : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Traduz o estado da URL para os parâmetros da API, com os padrões da SPEC F12. */
export function followListRequestFromState(
  state: FollowListUrlState,
  pageSize: number = FOLLOW_PAGE_SIZE_DEFAULT,
): FollowListRequest {
  const sort = state.sort || FOLLOW_DEFAULT_SORT;
  const order = state.order || defaultFollowOrder(sort);

  return { sort, order, page: state.page, pageSize };
}

/** Opções de ordenação exibidas na interface (rótulos pt-BR — RN-F12-08). */
export const FOLLOW_SORT_OPTIONS = FOLLOW_SORTS.map((value) => ({
  value,
  label: followSortLabel(value),
}));

/** Data do vínculo em pt-BR (`07/10/2026`), usada nos itens das listagens. */
export function formatFollowedAt(isoDateTime: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(isoDateTime));
}
