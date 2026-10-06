import {
  GAMES_PAGE_SIZE_DEFAULT,
  GAMES_PAGE_SIZE_MAX,
  GAME_ROUTES,
  defaultGameSort,
  gameDetailSchema,
  gameSortOrderSchema,
  gameSortSchema,
  gamesPageSchema,
  type GameDetail,
  type GamesPage,
  type GameSort,
  type GameSortOrder,
  type GameTaxonomyRef,
} from '@gamelog/shared';

import { apiRequest } from '@/lib/api';

/** Parâmetros aceitos por `GET /games` (SPEC F3, seção 4). */
export type GamesRequest = {
  q?: string | undefined;
  genres?: string[];
  platforms?: string[];
  developers?: string[];
  releaseYearFrom?: number | undefined;
  releaseYearTo?: number | undefined;
  minRating?: number | undefined;
  sort?: GameSort | undefined;
  order?: GameSortOrder | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
};

/** Monta a query string da listagem (parâmetros repetíveis para os filtros). */
export function gamesQueryString(request: GamesRequest): string {
  const params = new URLSearchParams();

  if (request.q) {
    params.set('q', request.q);
  }

  for (const genre of request.genres ?? []) {
    params.append('genre', genre);
  }

  for (const platform of request.platforms ?? []) {
    params.append('platform', platform);
  }

  for (const developer of request.developers ?? []) {
    params.append('developer', developer);
  }

  if (request.releaseYearFrom !== undefined) {
    params.set('releaseYearFrom', String(request.releaseYearFrom));
  }

  if (request.releaseYearTo !== undefined) {
    params.set('releaseYearTo', String(request.releaseYearTo));
  }

  if (request.minRating !== undefined) {
    params.set('minRating', String(request.minRating));
  }

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

export async function fetchGames(request: GamesRequest): Promise<GamesPage> {
  return gamesPageSchema.parse(await apiRequest(`${GAME_ROUTES.list}${gamesQueryString(request)}`));
}

export async function fetchGameDetail(identifier: string): Promise<GameDetail> {
  return gameDetailSchema.parse(
    await apiRequest(`${GAME_ROUTES.list}/${encodeURIComponent(identifier)}`),
  );
}

/**
 * Opções dos filtros de gênero/plataforma. Enquanto as leituras públicas de F5/F6 não
 * existem, as opções são derivadas de uma página ampla do próprio catálogo; trocar pelas
 * leituras de gêneros e plataformas quando elas forem entregues (seção 4 da SPEC F3).
 */
export async function fetchFilterOptions(): Promise<{
  genres: GameTaxonomyRef[];
  platforms: GameTaxonomyRef[];
}> {
  const page = await fetchGames({
    sort: 'title',
    order: 'asc',
    pageSize: GAMES_PAGE_SIZE_MAX,
  });

  const genres = new Map<string, GameTaxonomyRef>();
  const platforms = new Map<string, GameTaxonomyRef>();

  for (const game of page.data) {
    for (const genre of game.genres) {
      genres.set(genre.slug, genre);
    }

    for (const platform of game.platforms) {
      platforms.set(platform.slug, platform);
    }
  }

  const byName = (a: GameTaxonomyRef, b: GameTaxonomyRef) => a.name.localeCompare(b.name, 'pt-BR');

  return {
    genres: [...genres.values()].sort(byName),
    platforms: [...platforms.values()].sort(byName),
  };
}

/** Estado do catálogo refletido na URL (query string da rota `/jogos`). */
export type CatalogUrlState = {
  q: string;
  genres: string[];
  platforms: string[];
  releaseYearFrom: string;
  releaseYearTo: string;
  minRating: string;
  sort: GameSort | '';
  order: GameSortOrder | '';
  page: number;
};

export function catalogStateFromSearch(search: URLSearchParams): CatalogUrlState {
  const sort = search.get('sort');
  const order = search.get('order');
  const page = Number(search.get('page'));

  return {
    q: search.get('q') ?? '',
    genres: search.getAll('genre'),
    platforms: search.getAll('platform'),
    releaseYearFrom: search.get('releaseYearFrom') ?? '',
    releaseYearTo: search.get('releaseYearTo') ?? '',
    minRating: search.get('minRating') ?? '',
    sort: gameSortSchema.safeParse(sort).success ? (sort as GameSort) : '',
    order: gameSortOrderSchema.safeParse(order).success ? (order as GameSortOrder) : '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

function yearFrom(value: string): number | undefined {
  const year = Number(value);

  return Number.isInteger(year) && year > 0 ? year : undefined;
}

function ratingFrom(value: string): number | undefined {
  const rating = Number(value.replace(',', '.'));

  return Number.isFinite(rating) && rating > 0 ? rating : undefined;
}

/** Traduz o estado da URL para os parâmetros da API, aplicando os padrões da SPEC. */
export function catalogRequestFromState(state: CatalogUrlState, pageSize?: number): GamesRequest {
  const q = state.q.trim();
  const sort = state.sort || defaultGameSort(q.length > 0);
  const order = state.order || (sort === 'title' ? 'asc' : 'desc');

  return {
    q: q.length > 0 ? q : undefined,
    genres: state.genres,
    platforms: state.platforms,
    releaseYearFrom: yearFrom(state.releaseYearFrom),
    releaseYearTo: yearFrom(state.releaseYearTo),
    minRating: ratingFrom(state.minRating),
    sort,
    order,
    page: state.page,
    pageSize: pageSize ?? GAMES_PAGE_SIZE_DEFAULT,
  };
}

/** Rota da página do catálogo a partir do estado atual (sem parâmetros padrão). */
export function catalogPath(state: CatalogUrlState): string {
  const request: GamesRequest = {
    q: state.q.trim() || undefined,
    genres: state.genres,
    platforms: state.platforms,
    releaseYearFrom: yearFrom(state.releaseYearFrom),
    releaseYearTo: yearFrom(state.releaseYearTo),
    minRating: ratingFrom(state.minRating),
    sort: state.sort || undefined,
    order: state.order || undefined,
    page: state.page,
  };

  return `/jogos${gamesQueryString(request)}`;
}

/** Rota da página de detalhe do jogo (`/jogos/:slug`). */
export function gamePagePath(slug: string): string {
  return `/jogos/${encodeURIComponent(slug)}`;
}

/** Nota formatada em pt-BR com uma casa ("4,5"); `null` vira "Sem nota". */
export function formatRating(ratingAverage: number | null): string {
  if (ratingAverage === null) {
    return 'Sem nota';
  }

  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(ratingAverage);
}

/** Ano de lançamento de um jogo (`releaseDate` no formato `YYYY-MM-DD`). */
export function releaseYear(releaseDate: string | null): string | null {
  return releaseDate ? releaseDate.slice(0, 4) : null;
}

/** Data de lançamento por extenso em pt-BR; `null` vira "Data não anunciada". */
export function formatReleaseDate(releaseDate: string | null): string {
  if (!releaseDate) {
    return 'Data não anunciada';
  }

  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${releaseDate}T00:00:00.000Z`),
  );
}
