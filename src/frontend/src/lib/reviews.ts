import {
  REVIEW_DEFAULT_SORT,
  REVIEW_PAGE_SIZE_DEFAULT,
  REVIEW_ROUTES,
  defaultReviewOrder,
  reviewDetailSchema,
  reviewGamePath,
  reviewMePath,
  reviewPageSchema,
  reviewPath,
  reviewPublicPath,
  reviewSortOrderSchema,
  reviewSortSchema,
  type ReviewDetail,
  type ReviewInput,
  type ReviewPage,
  type ReviewSort,
  type ReviewSortOrder,
  type ReviewUpdateInput,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest, getAuthState } from '@/lib/auth-store';

/**
 * Cliente das resenhas (SPEC F10, seção 3): a escrita e a listagem própria exigem sessão
 * (`authorizedRequest`, com renovação transparente), enquanto a listagem por jogo, por
 * perfil e o permalink são públicos.
 */

export type ReviewsRequest = {
  sort?: ReviewSort | undefined;
  order?: ReviewSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

/** Monta a query string das listagens (padrões da SPEC F10). */
export function reviewsQueryString(request: ReviewsRequest): string {
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

/** Resenhas públicas de um jogo (RN-F10-13). */
export async function fetchGameReviews(game: string, request: ReviewsRequest): Promise<ReviewPage> {
  return reviewPageSchema.parse(
    await apiRequest(`${reviewGamePath(game)}${reviewsQueryString(request)}`),
  );
}

/** Resenhas públicas de um jogador (RN-F10-13). */
export async function fetchPublicReviews(
  username: string,
  request: ReviewsRequest,
): Promise<ReviewPage> {
  return reviewPageSchema.parse(
    await apiRequest(`${reviewPublicPath(username)}${reviewsQueryString(request)}`),
  );
}

/** Resenhas do próprio autor, incluindo as não publicadas (RN-F10-09). */
export async function fetchMyReviews(request: ReviewsRequest): Promise<ReviewPage> {
  return reviewPageSchema.parse(
    await authorizedRequest(`${REVIEW_ROUTES.myReviews}${reviewsQueryString(request)}`),
  );
}

/** Resenha do usuário para o jogo (`:game` aceita slug ou id); `404` quando não existe. */
export async function fetchMyReview(identifier: string): Promise<ReviewDetail> {
  return reviewDetailSchema.parse(await authorizedRequest(reviewMePath(identifier)));
}

/** Criação/substituição completa da resenha — RN-F10-02. */
export async function saveMyReview(identifier: string, input: ReviewInput): Promise<ReviewDetail> {
  return reviewDetailSchema.parse(
    await authorizedRequest(reviewMePath(identifier), { method: 'PUT', body: input }),
  );
}

/** Edição parcial da resenha — RN-F10-06. */
export async function updateMyReview(
  identifier: string,
  input: ReviewUpdateInput,
): Promise<ReviewDetail> {
  return reviewDetailSchema.parse(
    await authorizedRequest(reviewMePath(identifier), { method: 'PATCH', body: input }),
  );
}

export async function deleteMyReview(identifier: string): Promise<void> {
  await authorizedRequest<void>(reviewMePath(identifier), { method: 'DELETE' });
}

/**
 * Permalink da resenha (RN-F10-14): com sessão, o autor vê a própria resenha não
 * publicada; sem sessão, apenas as publicadas.
 */
export async function fetchReview(id: string): Promise<ReviewDetail> {
  const path = reviewPath(id);
  const payload = getAuthState().accessToken
    ? await authorizedRequest(path)
    : await apiRequest(path);

  return reviewDetailSchema.parse(payload);
}

/** Estado das resenhas refletido na URL (página do jogo e aba do perfil). */
export type ReviewsUrlState = {
  sort: ReviewSort | '';
  order: ReviewSortOrder | '';
  page: number;
};

/**
 * Lê o estado da URL a partir dos nomes de parâmetro informados — o perfil usa um prefixo
 * (`rsort`/`rorder`/`rpage`) para não colidir com o estado do diário.
 */
export function reviewsStateFromSearch(search: URLSearchParams, prefix = ''): ReviewsUrlState {
  const sort = search.get(`${prefix}sort`);
  const order = search.get(`${prefix}order`);
  const page = Number(search.get(`${prefix}page`));

  return {
    sort: reviewSortSchema.safeParse(sort).success ? (sort as ReviewSort) : '',
    order: reviewSortOrderSchema.safeParse(order).success ? (order as ReviewSortOrder) : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Traduz o estado da URL para os parâmetros da API, com os padrões da SPEC F10. */
export function reviewsRequestFromState(
  state: ReviewsUrlState,
  pageSize: number = REVIEW_PAGE_SIZE_DEFAULT,
): ReviewsRequest {
  const sort = state.sort || REVIEW_DEFAULT_SORT;
  const order = state.order || defaultReviewOrder(sort);

  return { sort, order, page: state.page, pageSize };
}

/** Rota do editor de resenha do jogo (`/jogos/:slug/resenha`). */
export function reviewEditorPath(slug: string): string {
  return `/jogos/${encodeURIComponent(slug)}/resenha`;
}

/** Opções de ordenação exibidas na interface (RN-F10-11). */
export const REVIEW_SORT_OPTIONS = [
  { value: 'recently_created', label: 'Mais recentes' },
  { value: 'recently_updated', label: 'Atualizadas recentemente' },
  { value: 'game_title', label: 'Jogo (A–Z)' },
] as const satisfies readonly { value: ReviewSort; label: string }[];

/** Data da resenha em pt-BR (`04/02/2024`). */
export function formatReviewDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(isoDateTime));
}
