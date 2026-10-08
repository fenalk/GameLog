import {
  LIST_DEFAULT_SORT,
  LIST_ITEM_DEFAULT_SORT,
  LIST_PAGE_SIZE_DEFAULT,
  LIST_ROUTES,
  defaultListOrder,
  defaultListItemOrder,
  listDetailSchema,
  listItemSchema,
  listItemSortSchema,
  listPageSchema,
  listPath,
  listMeItemPath,
  listMeOrderPath,
  listMePath,
  listSortOrderSchema,
  listSortSchema,
  listSummarySchema,
  listUserPath,
  type ListDetail,
  type ListInput,
  type ListItem,
  type ListItemInput,
  type ListItemSort,
  type ListItemUpdateInput,
  type ListPage,
  type ListSort,
  type ListSortOrder,
  type ListSummary,
  type ListUpdateInput,
  type ListVisibility,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';
import { authorizedRequest, getAuthState } from '@/lib/auth-store';

/**
 * Cliente das listas (SPEC F11, seção 3): a escrita e as listagens próprias exigem sessão
 * (`authorizedRequest`, com renovação transparente), enquanto as listas públicas e o
 * permalink são lidos sem autenticação.
 */

export type ListsRequest = {
  sort?: ListSort | undefined;
  order?: ListSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type ListItemsRequest = {
  sort?: ListItemSort | undefined;
  order?: ListSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

export type MyListsRequest = ListsRequest & {
  game?: string | undefined;
  visibilities?: ListVisibility[] | undefined;
};

function appendPagination(
  params: URLSearchParams,
  request: { page?: number | undefined; pageSize?: number | undefined },
): void {
  if (request.page !== undefined && request.page > 1) {
    params.set('page', String(request.page));
  }

  if (request.pageSize !== undefined) {
    params.set('pageSize', String(request.pageSize));
  }
}

/** Monta a query string das listagens de listas. */
export function listsQueryString(request: ListsRequest): string {
  const params = new URLSearchParams();

  if (request.sort) {
    params.set('sort', request.sort);
  }

  if (request.order) {
    params.set('order', request.order);
  }

  appendPagination(params, request);

  const query = params.toString();

  return query ? `?${query}` : '';
}

/** Query string de `GET /me/lists`, com os filtros de visibilidade e de jogo (RN-F11-17). */
export function myListsQueryString(request: MyListsRequest): string {
  const params = new URLSearchParams();

  for (const visibility of request.visibilities ?? []) {
    params.append('visibility', visibility);
  }

  if (request.game) {
    params.set('game', request.game);
  }

  if (request.sort) {
    params.set('sort', request.sort);
  }

  if (request.order) {
    params.set('order', request.order);
  }

  appendPagination(params, request);

  const query = params.toString();

  return query ? `?${query}` : '';
}

/** Query string da paginação/ordenação dos itens de uma lista (RN-F11-09). */
export function listItemsQueryString(request: ListItemsRequest): string {
  const params = new URLSearchParams();

  if (request.sort) {
    params.set('sort', request.sort);
  }

  if (request.order) {
    params.set('order', request.order);
  }

  appendPagination(params, request);

  const query = params.toString();

  return query ? `?${query}` : '';
}

/** Listas públicas de um jogador (RN-F11-05). */
export async function fetchPublicLists(username: string, request: ListsRequest): Promise<ListPage> {
  return listPageSchema.parse(
    await apiRequest(`${listUserPath(username)}${listsQueryString(request)}`),
  );
}

/** Listas do próprio usuário, incluindo as privadas (RN-F11-05/17). */
export async function fetchMyLists(request: MyListsRequest = {}): Promise<ListPage> {
  return listPageSchema.parse(
    await authorizedRequest(`${LIST_ROUTES.myLists}${myListsQueryString(request)}`),
  );
}

/** Detalhe (permalink) da lista; com sessão, o dono vê também as listas privadas (RN-F11-05). */
export async function fetchListDetail(
  id: string,
  request: ListItemsRequest = {},
): Promise<ListDetail> {
  const path = `${listPath(id)}${listItemsQueryString(request)}`;
  const payload = getAuthState().accessToken
    ? await authorizedRequest(path)
    : await apiRequest(path);

  return listDetailSchema.parse(payload);
}

/** Criação da lista — RN-F11-04. */
export async function createMyList(input: ListInput): Promise<ListSummary> {
  return listSummarySchema.parse(
    await authorizedRequest(LIST_ROUTES.myLists, { method: 'POST', body: input }),
  );
}

/** Edição parcial dos metadados — RN-F11-04. */
export async function updateMyList(id: string, input: ListUpdateInput): Promise<ListSummary> {
  return listSummarySchema.parse(
    await authorizedRequest(listMePath(id), { method: 'PATCH', body: input }),
  );
}

export async function deleteMyList(id: string): Promise<void> {
  await authorizedRequest<void>(listMePath(id), { method: 'DELETE' });
}

/** Adiciona/substitui um jogo na lista (`:game` aceita slug ou id) — RN-F11-06. */
export async function addGameToList(
  id: string,
  game: string,
  input: ListItemInput = {},
): Promise<ListItem> {
  return listItemSchema.parse(
    await authorizedRequest(listMeItemPath(id, game), { method: 'PUT', body: input }),
  );
}

/** Edição parcial da nota de um item — RN-F11-07. */
export async function updateListItem(
  id: string,
  game: string,
  input: ListItemUpdateInput,
): Promise<ListItem> {
  return listItemSchema.parse(
    await authorizedRequest(listMeItemPath(id, game), { method: 'PATCH', body: input }),
  );
}

export async function removeListItem(id: string, game: string): Promise<void> {
  await authorizedRequest<void>(listMeItemPath(id, game), { method: 'DELETE' });
}

/** Reordenação completa dos itens — RN-F11-08. */
export async function reorderList(id: string, games: string[]): Promise<ListDetail> {
  return listDetailSchema.parse(
    await authorizedRequest(listMeOrderPath(id), { method: 'PUT', body: { games } }),
  );
}

/**
 * Carrega **todos** os itens de uma lista na ordem manual, percorrendo as páginas
 * (a reordenação exige o conjunto completo dos jogos — RN-F11-08).
 */
export async function fetchAllListItems(id: string): Promise<ListItem[]> {
  const items: ListItem[] = [];

  for (let page = 1; ; page += 1) {
    const detail = await fetchListDetail(id, { sort: 'position', page, pageSize: 100 });

    items.push(...detail.items.data);

    if (page >= detail.items.meta.totalPages) {
      return items;
    }
  }
}

/** Estado das listas refletido na URL (aba do perfil). */
export type ListsUrlState = {
  sort: ListSort | '';
  order: ListSortOrder | '';
  page: number;
};

/** Estado dos itens refletido na URL (página da lista). */
export type ListItemsUrlState = {
  sort: ListItemSort | '';
  order: ListSortOrder | '';
  page: number;
};

/**
 * Lê o estado das listas a partir dos nomes de parâmetro informados — o perfil usa um
 * prefixo (`lsort`/`lorder`/`lpage`) para não colidir com os estados do diário/resenhas.
 */
export function listsStateFromSearch(search: URLSearchParams, prefix = ''): ListsUrlState {
  const sort = search.get(`${prefix}sort`);
  const order = search.get(`${prefix}order`);
  const page = Number(search.get(`${prefix}page`));

  return {
    sort: listSortSchema.safeParse(sort).success ? (sort as ListSort) : '',
    order: listSortOrderSchema.safeParse(order).success ? (order as ListSortOrder) : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Traduz o estado da URL para os parâmetros da API, com os padrões da SPEC F11. */
export function listsRequestFromState(
  state: ListsUrlState,
  pageSize: number = LIST_PAGE_SIZE_DEFAULT,
): ListsRequest {
  const sort = state.sort || LIST_DEFAULT_SORT;
  const order = state.order || defaultListOrder(sort);

  return { sort, order, page: state.page, pageSize };
}

/** Lê o estado dos itens a partir da URL da página da lista. */
export function listItemsStateFromSearch(search: URLSearchParams): ListItemsUrlState {
  const sort = search.get('sort');
  const order = search.get('order');
  const page = Number(search.get('page'));

  return {
    sort: listItemSortSchema.safeParse(sort).success ? (sort as ListItemSort) : '',
    order: listSortOrderSchema.safeParse(order).success ? (order as ListSortOrder) : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

/** Traduz o estado da URL dos itens para os parâmetros da API. */
export function listItemsRequestFromState(
  state: ListItemsUrlState,
  pageSize: number = LIST_PAGE_SIZE_DEFAULT,
): ListItemsRequest {
  const sort = state.sort || LIST_ITEM_DEFAULT_SORT;
  const order = state.order || defaultListItemOrder(sort);

  return { sort, order, page: state.page, pageSize };
}

/** Rota do permalink da lista (`/listas/:id`). */
export function listPagePath(id: string): string {
  return `/listas/${encodeURIComponent(id)}`;
}

/** Rota do editor de lista (`/listas/nova` ou `/listas/:id/editar`). */
export function listEditorPath(id?: string): string {
  return id ? `/listas/${encodeURIComponent(id)}/editar` : '/listas/nova';
}

/** Opções de ordenação das listas exibidas na interface (RN-F11-10). */
export const LIST_SORT_OPTIONS = [
  { value: 'recently_updated', label: 'Atualizadas recentemente' },
  { value: 'recently_created', label: 'Criadas recentemente' },
  { value: 'title', label: 'Título (A–Z)' },
] as const satisfies readonly { value: ListSort; label: string }[];

/** Opções de ordenação dos itens exibidas na interface (RN-F11-09). */
export const LIST_ITEM_SORT_OPTIONS = [
  { value: 'position', label: 'Ordem da lista' },
  { value: 'title', label: 'Jogo (A–Z)' },
  { value: 'recently_added', label: 'Adicionados recentemente' },
] as const satisfies readonly { value: ListItemSort; label: string }[];

/** Data da lista em pt-BR (`04/02/2024`). */
export function formatListDate(isoDateTime: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(isoDateTime));
}

/** Plurais exibidos no cartão da lista. */
export function formatItemsCount(count: number): string {
  return count === 1 ? '1 jogo' : `${count} jogos`;
}
