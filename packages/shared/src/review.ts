import { z } from 'zod';

import { USERNAME_MAX_LENGTH } from './auth.js';
import {
  GAMES_PAGE_DEFAULT,
  GAMES_PAGE_SIZE_DEFAULT,
  GAMES_PAGE_SIZE_MAX,
  gameSummarySchema,
} from './catalog.js';
import { CONTROL_CHARACTERS_PATTERN, normalizeDisplayName } from './taxonomy.js';

/**
 * Contratos das resenhas (SPEC F10, seção 3): escrita e gerenciamento das próprias
 * resenhas, leitura pública por jogo e por perfil e o detalhe permalink. Reutiliza as
 * convenções de paginação, de identificação (`:game`) e os resumos da F3.
 *
 * A resenha é texto puro e independente da nota (F9): não há campo de avaliação aqui.
 */

export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 10_000;
export const REVIEW_EXCERPT_MAX = 280;

export const REVIEW_STATUSES = ['PUBLISHED', 'HIDDEN', 'REMOVED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Rótulos pt-BR exibidos na interface (seção 1 da SPEC F10). */
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  PUBLISHED: 'Publicada',
  HIDDEN: 'Oculta',
  REMOVED: 'Removida',
};

export function reviewStatusLabel(status: ReviewStatus): string {
  return REVIEW_STATUS_LABELS[status];
}

/** `status` do recurso (`PUBLISHED`/`HIDDEN`/`REMOVED`); as transições são da F14. */
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);

const TITLE_LENGTH_MESSAGE = `Título deve ter entre 1 e ${REVIEW_TITLE_MAX} caracteres`;
const BODY_LENGTH_MESSAGE = `Corpo deve ter entre 1 e ${REVIEW_BODY_MAX} caracteres`;
const TITLE_CONTROL_MESSAGE = 'Título não pode conter caracteres de controle';
const BODY_CONTROL_MESSAGE = 'Corpo não pode conter caracteres de controle';

/**
 * `title` (RN-F10-03): 1–120 caracteres após normalização (`trim` + espaços internos
 * colapsados) e sem caracteres de controle.
 */
export const reviewTitleSchema = z
  .string()
  .transform((value) => normalizeDisplayName(value))
  .pipe(
    z
      .string()
      .min(1, TITLE_LENGTH_MESSAGE)
      .max(REVIEW_TITLE_MAX, TITLE_LENGTH_MESSAGE)
      .refine((value) => !CONTROL_CHARACTERS_PATTERN.test(value), TITLE_CONTROL_MESSAGE),
  );

/**
 * Normaliza o corpo (RN-F10-04): `trim` nas pontas e quebras `\r\n`/`\r` convertidas em
 * `\n`, preservando as quebras de linha internas. O texto permanece puro — a API não
 * interpreta HTML nem Markdown (o frontend escapa ao renderizar).
 */
export function normalizeReviewBody(value: string): string {
  return value.replace(/\r\n?/g, '\n').trim();
}

/** Caracteres de controle proibidos no corpo, exceto a quebra de linha (`\n`) (RN-F10-04). */
function hasForbiddenControlCharacter(value: string): boolean {
  return CONTROL_CHARACTERS_PATTERN.test(value.replace(/\n/g, ''));
}

/** `body` (RN-F10-04): 1–10.000 caracteres após normalização e sem caracteres de controle. */
export const reviewBodySchema = z
  .string()
  .transform((value) => normalizeReviewBody(value))
  .pipe(
    z
      .string()
      .min(1, BODY_LENGTH_MESSAGE)
      .max(REVIEW_BODY_MAX, BODY_LENGTH_MESSAGE)
      .refine((value) => !hasForbiddenControlCharacter(value), BODY_CONTROL_MESSAGE),
  );

/** Corpo de `PUT /me/reviews/:game` (RN-F10-02): substituição completa. */
export const reviewInputSchema = z.strictObject(
  {
    title: reviewTitleSchema,
    body: reviewBodySchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type ReviewInput = z.infer<typeof reviewInputSchema>;

const AT_LEAST_ONE_FIELD_MESSAGE = 'Informe ao menos um campo para atualizar';

/**
 * Corpo de `PATCH /me/reviews/:game` (RN-F10-06): edição parcial — campo omitido não muda
 * e `null` é inválido; o corpo precisa ter ao menos um campo.
 */
export const reviewUpdateSchema = z
  .strictObject(
    {
      title: reviewTitleSchema.optional(),
      body: reviewBodySchema.optional(),
    },
    { error: 'Campo não permitido no corpo da requisição' },
  )
  .refine((input) => input.title !== undefined || input.body !== undefined, {
    message: AT_LEAST_ONE_FIELD_MESSAGE,
  });

export type ReviewUpdateInput = z.infer<typeof reviewUpdateSchema>;

/** Autor exibido nas resenhas (RN-F10-10): dados do perfil público, nunca e-mail/papel/hash. */
export const reviewAuthorSchema = z.object({
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

export type ReviewAuthor = z.infer<typeof reviewAuthorSchema>;

/**
 * Trecho derivado do corpo na leitura (RN-F10-10): devolve o texto inteiro quando cabe no
 * limite; caso contrário corta em limite de palavra (espaço ou quebra de linha) e
 * acrescenta reticências.
 */
export function excerptReviewBody(body: string, max: number = REVIEW_EXCERPT_MAX): string {
  if (body.length <= max) {
    return body;
  }

  const slice = body.slice(0, max);
  const lastBreak = Math.max(slice.lastIndexOf(' '), slice.lastIndexOf('\n'));
  const base = lastBreak > 0 ? slice.slice(0, lastBreak) : slice;

  return `${base.trimEnd()}…`;
}

/** Item das listagens (RN-F10-10): resenha em resumo, com autor e jogo. */
export const reviewSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  excerpt: z.string(),
  status: reviewStatusSchema,
  author: reviewAuthorSchema,
  game: gameSummarySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ReviewSummary = z.infer<typeof reviewSummarySchema>;

/** Detalhe da resenha (RN-F10-14): o resumo com o `body` completo no lugar do trecho. */
export const reviewDetailSchema = reviewSummarySchema.omit({ excerpt: true }).extend({
  body: z.string(),
});

export type ReviewDetail = z.infer<typeof reviewDetailSchema>;

/** Ordenações da listagem (RN-F10-11). */
export const REVIEW_SORTS = ['recently_created', 'recently_updated', 'game_title'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const REVIEW_SORT_ORDERS = ['asc', 'desc'] as const;
export type ReviewSortOrder = (typeof REVIEW_SORT_ORDERS)[number];

export const reviewSortSchema = z.enum(REVIEW_SORTS);
export const reviewSortOrderSchema = z.enum(REVIEW_SORT_ORDERS);

/** Ordenação padrão da listagem: criação recente, decrescente (RN-F10-11). */
export const REVIEW_DEFAULT_SORT: ReviewSort = 'recently_created';

/** Direção padrão de cada ordenação (RN-F10-11): `game_title` é ascendente, as demais descem. */
export function defaultReviewOrder(sort: ReviewSort): ReviewSortOrder {
  return sort === 'game_title' ? 'asc' : 'desc';
}

const PAGE_MESSAGE = 'Página deve ser um número inteiro maior ou igual a 1';
const PAGE_SIZE_MESSAGE = `Tamanho da página deve ser um número inteiro entre 1 e ${GAMES_PAGE_SIZE_MAX}`;

/** Query string das listagens de resenhas (RN-F10-11). */
export const reviewQuerySchema = z.object({
  sort: reviewSortSchema.optional(),
  order: reviewSortOrderSchema.optional(),
  page: z.coerce.number(PAGE_MESSAGE).int(PAGE_MESSAGE).min(1, PAGE_MESSAGE).optional(),
  pageSize: z.coerce
    .number(PAGE_SIZE_MESSAGE)
    .int(PAGE_SIZE_MESSAGE)
    .min(1, PAGE_SIZE_MESSAGE)
    .max(GAMES_PAGE_SIZE_MAX, PAGE_SIZE_MESSAGE)
    .optional(),
});

export type ReviewQuery = z.infer<typeof reviewQuerySchema>;

/** Resposta paginada das listagens de resenhas (convenções da F3). */
export const reviewPageSchema = z.object({
  data: z.array(reviewSummarySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type ReviewPage = z.infer<typeof reviewPageSchema>;

/**
 * Parâmetro `:game` (convenção da F3): aceita o `slug` ou o `id`. O formato não é
 * validado aqui de propósito — um identificador inexistente responde `404`.
 */
export const reviewGameParamsSchema = z.object({ game: z.string().min(1) });

/** Parâmetro `:username` das resenhas públicas (mesma convenção do perfil, RN-F10-13). */
export const reviewUserParamsSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
});

/** Parâmetro `:id` do permalink (RN-F10-14); inexistente responde `404`. */
export const reviewIdParamsSchema = z.object({ id: z.string().min(1) });

export const REVIEW_ROUTES = {
  /** Padrão das resenhas públicas de um jogo (backend). */
  gameReviews: '/games/:game/reviews',
  /** Padrão das resenhas públicas de um perfil (backend). */
  userReviews: '/users/:username/reviews',
  /** Padrão do permalink de uma resenha (backend). */
  detail: '/reviews/:id',
  /** Padrão da listagem das próprias resenhas (backend). */
  myReviews: '/me/reviews',
  /** Padrão da própria resenha de um jogo (backend). */
  myReview: '/me/reviews/:game',
} as const;

/** Caminho das resenhas públicas de um jogo (frontend e testes). */
export function reviewGamePath(game: string): string {
  return `/games/${encodeURIComponent(game)}/reviews`;
}

/** Caminho das resenhas públicas de um `username` (frontend e testes). */
export function reviewPublicPath(username: string): string {
  return `/users/${encodeURIComponent(username)}/reviews`;
}

/** Caminho do permalink de uma resenha (frontend e testes). */
export function reviewPath(id: string): string {
  return `/reviews/${encodeURIComponent(id)}`;
}

/** Caminho da própria resenha de um jogo (frontend e testes). */
export function reviewMePath(game: string): string {
  return `/me/reviews/${encodeURIComponent(game)}`;
}

export const REVIEW_PAGE_DEFAULT = GAMES_PAGE_DEFAULT;
export const REVIEW_PAGE_SIZE_DEFAULT = GAMES_PAGE_SIZE_DEFAULT;
export const REVIEW_PAGE_SIZE_MAX = GAMES_PAGE_SIZE_MAX;
