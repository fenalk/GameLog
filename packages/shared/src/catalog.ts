import { z } from 'zod';

/**
 * Contratos da consulta pública do catálogo (SPEC F3, seção 4): listagem paginada com
 * busca, filtros e ordenação, e o detalhe de um jogo.
 */

/** Paginação (seção 2 da SPEC F3). */
export const GAMES_PAGE_DEFAULT = 1;
export const GAMES_PAGE_SIZE_DEFAULT = 20;
export const GAMES_PAGE_SIZE_MAX = 100;

/** Busca textual (RN-F3-02). */
export const GAME_SEARCH_MAX_LENGTH = 100;

/** Faixa aceita nos filtros de ano (RN-F3-04); valores fora dela são formato inválido. */
export const GAME_YEAR_MIN = 1000;
export const GAME_YEAR_MAX = 9999;

/** Faixa aceita em `minRating` (RN-F3-04). */
export const GAME_MIN_RATING_MIN = 0.5;
export const GAME_MIN_RATING_MAX = 5;

/**
 * Mínimo de avaliações para um jogo aparecer no destaque "Mais bem avaliados" da Home
 * (RN-F3-09) — a constante é configurável e aplicada pelo frontend sobre `sort=rating`.
 */
export const MIN_RATINGS_FOR_RANKING = 3;

export const GAME_SORTS = [
  'relevance',
  'popularity',
  'rating',
  'title',
  'release_date',
  'recently_added',
] as const;
export type GameSort = (typeof GAME_SORTS)[number];

export const GAME_SORT_ORDERS = ['asc', 'desc'] as const;
export type GameSortOrder = (typeof GAME_SORT_ORDERS)[number];

/** `sort`/`order` (RN-F3-05). */
export const gameSortSchema = z.enum(GAME_SORTS);
export const gameSortOrderSchema = z.enum(GAME_SORT_ORDERS);

const SEARCH_LENGTH_MESSAGE = `Busca deve ter no máximo ${GAME_SEARCH_MAX_LENGTH} caracteres`;
const YEAR_RANGE_MESSAGE = `Ano deve estar entre ${GAME_YEAR_MIN} e ${GAME_YEAR_MAX}`;
const MIN_RATING_MESSAGE = `Nota mínima deve estar entre ${GAME_MIN_RATING_MIN} e ${GAME_MIN_RATING_MAX}`;
const PAGE_MESSAGE = 'Página deve ser um número inteiro maior ou igual a 1';
const PAGE_SIZE_MESSAGE = `Tamanho da página deve ser um número inteiro entre 1 e ${GAMES_PAGE_SIZE_MAX}`;

/** Parâmetro repetível (`genre=rpg&genre=acao`): uma ou várias ocorrências (RN-F3-04). */
const repeatedFilterSchema = z.union([z.string(), z.array(z.string())]);

/**
 * Query string de `GET /games`. A validação de formato retorna `400 VALIDATION_ERROR`;
 * a semântica dos filtros (slugs inexistentes não casam com nada) fica no serviço.
 */
export const gameListQuerySchema = z.object({
  q: z.string().trim().max(GAME_SEARCH_MAX_LENGTH, SEARCH_LENGTH_MESSAGE).optional(),
  genre: repeatedFilterSchema.optional(),
  platform: repeatedFilterSchema.optional(),
  developer: repeatedFilterSchema.optional(),
  releaseYearFrom: z.coerce
    .number(YEAR_RANGE_MESSAGE)
    .int(YEAR_RANGE_MESSAGE)
    .min(GAME_YEAR_MIN, YEAR_RANGE_MESSAGE)
    .max(GAME_YEAR_MAX, YEAR_RANGE_MESSAGE)
    .optional(),
  releaseYearTo: z.coerce
    .number(YEAR_RANGE_MESSAGE)
    .int(YEAR_RANGE_MESSAGE)
    .min(GAME_YEAR_MIN, YEAR_RANGE_MESSAGE)
    .max(GAME_YEAR_MAX, YEAR_RANGE_MESSAGE)
    .optional(),
  minRating: z.coerce
    .number(MIN_RATING_MESSAGE)
    .min(GAME_MIN_RATING_MIN, MIN_RATING_MESSAGE)
    .max(GAME_MIN_RATING_MAX, MIN_RATING_MESSAGE)
    .optional(),
  sort: gameSortSchema.optional(),
  order: gameSortOrderSchema.optional(),
  page: z.coerce.number(PAGE_MESSAGE).int(PAGE_MESSAGE).min(1, PAGE_MESSAGE).optional(),
  pageSize: z.coerce
    .number(PAGE_SIZE_MESSAGE)
    .int(PAGE_SIZE_MESSAGE)
    .min(1, PAGE_SIZE_MESSAGE)
    .max(GAMES_PAGE_SIZE_MAX, PAGE_SIZE_MESSAGE)
    .optional(),
});

export type GameListQuery = z.infer<typeof gameListQuerySchema>;

/**
 * Ordenação padrão (RN-F3-05): `relevance` quando há busca; `popularity` caso contrário.
 */
export function defaultGameSort(hasQuery: boolean): GameSort {
  return hasQuery ? 'relevance' : 'popularity';
}

/** Gênero, plataforma ou desenvolvedora referenciados por um jogo (RN-F3-06). */
export const gameTaxonomyRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export type GameTaxonomyRef = z.infer<typeof gameTaxonomyRefSchema>;

/** Resumo de jogo reutilizado por outras SPECs (seção 2 da SPEC F3). */
export const gameSummarySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  title: z.string(),
  coverUrl: z.string().nullable(),
});

export type GameSummary = z.infer<typeof gameSummarySchema>;

/** Item da listagem (RN-F3-06). */
export const gameListItemSchema = gameSummarySchema.extend({
  releaseDate: z.iso.date().nullable(),
  genres: z.array(gameTaxonomyRefSchema),
  platforms: z.array(gameTaxonomyRefSchema),
  ratingAverage: z.number().nullable(),
  ratingCount: z.number().int(),
});

export type GameListItem = z.infer<typeof gameListItemSchema>;

/** Detalhe do jogo (RN-F3-07): campos da listagem mais descrição, desenvolvedoras e datas. */
export const gameDetailSchema = gameListItemSchema.extend({
  description: z.string().nullable(),
  developers: z.array(gameTaxonomyRefSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GameDetail = z.infer<typeof gameDetailSchema>;

/** Resposta paginada da listagem (seção 2 da SPEC F3). */
export const gamesPageSchema = z.object({
  data: z.array(gameListItemSchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type GamesPage = z.infer<typeof gamesPageSchema>;

/**
 * Parâmetro `:game` (seção 2 da SPEC F3): aceita o `slug` ou o `id` (UUID). O formato
 * não é validado aqui de propósito — um identificador inexistente deve responder `404`.
 */
export const gameParamsSchema = z.object({ game: z.string().min(1) });

export const GAME_ROUTES = {
  /** Padrão da listagem (backend). */
  list: '/games',
  /** Padrão do detalhe (backend). */
  detail: '/games/:game',
} as const;

/** Caminho do detalhe de um jogo pelo `slug` (frontend e testes). */
export function gamePath(slug: string): string {
  return `/games/${encodeURIComponent(slug)}`;
}
