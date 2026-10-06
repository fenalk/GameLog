import { z } from 'zod';

import { USERNAME_MAX_LENGTH } from './auth.js';
import {
  GAMES_PAGE_DEFAULT,
  GAMES_PAGE_SIZE_DEFAULT,
  GAMES_PAGE_SIZE_MAX,
  gameSummarySchema,
  gameTaxonomyRefSchema,
} from './catalog.js';

/**
 * Contratos do diário (SPEC F8, seção 3): registro de jogos jogados — escrita do próprio
 * diário, leitura do diário próprio e do diário público. Reutiliza as convenções de
 * paginação, de identificação (`:game`) e os resumos da F3.
 */

export const GAME_LOG_STATUSES = ['PLAYING', 'COMPLETED', 'ON_HOLD', 'DROPPED', 'BACKLOG'] as const;
export type GameLogStatus = (typeof GAME_LOG_STATUSES)[number];

/** Rótulos pt-BR exibidos na interface (seção 1 da SPEC F8). */
export const GAME_LOG_STATUS_LABELS: Record<GameLogStatus, string> = {
  PLAYING: 'Jogando',
  COMPLETED: 'Zerado',
  ON_HOLD: 'Em pausa',
  DROPPED: 'Abandonado',
  BACKLOG: 'Na fila',
};

export function gameLogStatusLabel(status: GameLogStatus): string {
  return GAME_LOG_STATUS_LABELS[status];
}

/** `status` é obrigatório na escrita e restrito ao enum (RN-F8-03). */
export const gameLogStatusSchema = z.enum(GAME_LOG_STATUSES, {
  error: `Status deve ser um dos seguintes: ${GAME_LOG_STATUSES.join(', ')}`,
});

/** Menor data aceita em `startedAt`/`finishedAt` (RN-F8-04). */
export const GAME_LOG_MIN_DATE = '1950-01-01';

/** Limite superior de `playtimeMinutes` (RN-F8-05). */
export const PLAYTIME_MINUTES_MAX = 1_000_000;

/** Ordenações da listagem (RN-F8-10). */
export const GAME_LOG_SORTS = ['recently_updated', 'recently_added', 'title'] as const;
export type GameLogSort = (typeof GAME_LOG_SORTS)[number];

export const GAME_LOG_SORT_ORDERS = ['asc', 'desc'] as const;
export type GameLogSortOrder = (typeof GAME_LOG_SORT_ORDERS)[number];

export const gameLogSortSchema = z.enum(GAME_LOG_SORTS);
export const gameLogSortOrderSchema = z.enum(GAME_LOG_SORT_ORDERS);

/** Ordenação padrão da listagem: atualização recente, decrescente (RN-F8-10). */
export const GAME_LOG_DEFAULT_SORT: GameLogSort = 'recently_updated';

/** Data (UTC) do dia atual no formato `YYYY-MM-DD`. */
export function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Faixa de datas da SPEC (RN-F8-04): de `GAME_LOG_MIN_DATE` até hoje (UTC). */
export function isGameLogDateInRange(value: string, today: string = todayIsoDate()): boolean {
  return value >= GAME_LOG_MIN_DATE && value <= today;
}

const DATE_RANGE_MESSAGE = `Data deve estar entre ${GAME_LOG_MIN_DATE} e hoje`;

/**
 * `startedAt`/`finishedAt` (RN-F8-04): `YYYY-MM-DD` dentro da faixa aceita. Nenhuma data
 * é preenchida automaticamente; o formato inválido também é rejeitado por `z.iso.date()`.
 */
export const gameLogDateSchema = z.iso.date().refine(isGameLogDateInRange, DATE_RANGE_MESSAGE);

/** Mesma validação da data, nulável — usada pelos campos que podem ser limpos. */
export const gameLogNullableDateSchema = gameLogDateSchema.nullable();

const PLAYTIME_RANGE_MESSAGE = `Tempo jogado em minutos deve estar entre 0 e ${PLAYTIME_MINUTES_MAX}`;

/** `playtimeMinutes` (RN-F8-05): inteiro entre 0 e 1.000.000, nulável. */
export const gameLogPlaytimeSchema = z
  .number(PLAYTIME_RANGE_MESSAGE)
  .int(PLAYTIME_RANGE_MESSAGE)
  .min(0, PLAYTIME_RANGE_MESSAGE)
  .max(PLAYTIME_MINUTES_MAX, PLAYTIME_RANGE_MESSAGE);

const FINISHED_BEFORE_STARTED_MESSAGE = 'Data de conclusão não pode ser anterior à data de início';

function startsBeforeEnd(input: {
  startedAt?: string | null | undefined;
  finishedAt?: string | null | undefined;
}): boolean {
  if (!input.startedAt || !input.finishedAt) {
    return true;
  }

  return input.finishedAt >= input.startedAt;
}

/**
 * Corpo de `PUT /me/games/:game` (RN-F8-02 a RN-F8-06): substituição completa — campos
 * opcionais omitidos viram `null` no serviço. `null` explícito também limpa o campo.
 */
export const gameLogEntryInputSchema = z
  .strictObject(
    {
      status: gameLogStatusSchema,
      startedAt: gameLogNullableDateSchema.optional(),
      finishedAt: gameLogNullableDateSchema.optional(),
      playtimeMinutes: gameLogPlaytimeSchema.nullable().optional(),
      platformId: z.uuid('Plataforma inválida').nullable().optional(),
    },
    { error: 'Campo não permitido no corpo da requisição' },
  )
  .refine(startsBeforeEnd, { path: ['finishedAt'], message: FINISHED_BEFORE_STARTED_MESSAGE });

export type GameLogEntryInput = z.infer<typeof gameLogEntryInputSchema>;

const AT_LEAST_ONE_FIELD_MESSAGE = 'Informe ao menos um campo para atualizar';

/**
 * Corpo de `PATCH /me/games/:game` (RN-F8-02): edição parcial — campo omitido não muda,
 * `null` limpa datas, tempo e plataforma. `status` não é nulável (RN-F8-03) e o corpo
 * vazio é inválido.
 */
export const gameLogEntryUpdateSchema = z
  .strictObject(
    {
      status: gameLogStatusSchema.optional(),
      startedAt: gameLogNullableDateSchema.optional(),
      finishedAt: gameLogNullableDateSchema.optional(),
      playtimeMinutes: gameLogPlaytimeSchema.nullable().optional(),
      platformId: z.uuid('Plataforma inválida').nullable().optional(),
    },
    { error: 'Campo não permitido no corpo da requisição' },
  )
  .refine((input) => Object.keys(input).length > 0, { message: AT_LEAST_ONE_FIELD_MESSAGE })
  .refine(startsBeforeEnd, { path: ['finishedAt'], message: FINISHED_BEFORE_STARTED_MESSAGE });

export type GameLogEntryUpdateInput = z.infer<typeof gameLogEntryUpdateSchema>;

/** Registro do diário (seção 3 da SPEC F8). */
export const gameLogEntrySchema = z.object({
  id: z.uuid(),
  status: gameLogStatusSchema,
  startedAt: z.iso.date().nullable(),
  finishedAt: z.iso.date().nullable(),
  playtimeMinutes: z.number().int().nullable(),
  platform: gameTaxonomyRefSchema.nullable(),
  game: gameSummarySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GameLogEntry = z.infer<typeof gameLogEntrySchema>;

const PAGE_MESSAGE = 'Página deve ser um número inteiro maior ou igual a 1';
const PAGE_SIZE_MESSAGE = `Tamanho da página deve ser um número inteiro entre 1 e ${GAMES_PAGE_SIZE_MAX}`;

/** Filtro `status` repetível, sem diferenciar maiúsculas/minúsculas (RN-F8-08). */
const statusFilterSchema = z.string().trim().toUpperCase().pipe(gameLogStatusSchema);

const repeatedStatusSchema = z.union([statusFilterSchema, z.array(statusFilterSchema)]);

/** Query string de `GET /me/games` e de `GET /users/:username/games` (RN-F8-08 a RN-F8-10). */
export const gameLogQuerySchema = z.object({
  status: repeatedStatusSchema.optional(),
  sort: gameLogSortSchema.optional(),
  order: gameLogSortOrderSchema.optional(),
  page: z.coerce.number(PAGE_MESSAGE).int(PAGE_MESSAGE).min(1, PAGE_MESSAGE).optional(),
  pageSize: z.coerce
    .number(PAGE_SIZE_MESSAGE)
    .int(PAGE_SIZE_MESSAGE)
    .min(1, PAGE_SIZE_MESSAGE)
    .max(GAMES_PAGE_SIZE_MAX, PAGE_SIZE_MESSAGE)
    .optional(),
});

export type GameLogQuery = z.infer<typeof gameLogQuerySchema>;

/** Resposta paginada das listagens do diário (convenções da F3). */
export const gameLogPageSchema = z.object({
  data: z.array(gameLogEntrySchema),
  meta: z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
});

export type GameLogPage = z.infer<typeof gameLogPageSchema>;

/** Direção padrão de cada ordenação (RN-F8-10): `title` é ascendente, as demais descem. */
export function defaultGameLogOrder(sort: GameLogSort): GameLogSortOrder {
  return sort === 'title' ? 'asc' : 'desc';
}

/**
 * Parâmetro `:game` (convenção da F3): aceita o `slug` ou o `id`. O formato não é
 * validado aqui de propósito — um identificador inexistente responde `404`.
 */
export const gameLogGameParamsSchema = z.object({ game: z.string().min(1) });

/** Parâmetro `:username` do diário público (mesma convenção do perfil, RN-F8-09). */
export const gameLogUserParamsSchema = z.object({
  username: z.string().min(1).max(USERNAME_MAX_LENGTH),
});

export const GAME_LOG_ROUTES = {
  /** Padrão do diário próprio (backend). */
  myDiary: '/me/games',
  /** Padrão de um registro do diário próprio (backend). */
  myEntry: '/me/games/:game',
  /** Padrão do diário público (backend). */
  publicDiary: '/users/:username/games',
} as const;

/** Caminho de um registro do próprio diário (frontend e testes). */
export function gameLogEntryPath(game: string): string {
  return `/me/games/${encodeURIComponent(game)}`;
}

/** Caminho do diário público de um `username` (frontend e testes). */
export function gameLogPublicPath(username: string): string {
  return `/users/${encodeURIComponent(username)}/games`;
}

/** Horas informadas pelo jogador (aceita `12,5` ou `12.5`) → minutos inteiros (seção 4). */
export function hoursToMinutes(value: string): number | null {
  const normalized = value.trim().replace(',', '.');

  if (normalized.length === 0 || !/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Math.round(Number(normalized) * 60);
}

const MINUTES_IN_HOUR = 60;

/** Minutos → horas decimais para o formulário: `750` → `12,5`, `45` → `0,75`. */
export function minutesToHoursInput(minutes: number): string {
  return String(Number((minutes / MINUTES_IN_HOUR).toFixed(4))).replace('.', ',');
}

/** Exibição do tempo jogado (seção 4): `750` → `12h 30min`, `45` → `45min`, `60` → `1h`. */
export function formatPlaytime(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_IN_HOUR);
  const remainingMinutes = minutes % MINUTES_IN_HOUR;

  if (hours === 0) {
    return `${remainingMinutes}min`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

/** Data no formato `YYYY-MM-DD` exibida em pt-BR no fuso UTC (seção 4): `03/02/2024`. */
export function formatGameLogDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');

  return `${day}/${month}/${year}`;
}

/** Data exibida em pt-BR; `null` vira "não informado". */
export function formatGameLogDateOrNull(isoDate: string | null): string {
  return isoDate ? formatGameLogDate(isoDate) : 'não informado';
}

export const GAME_LOG_PAGE_DEFAULT = GAMES_PAGE_DEFAULT;
export const GAME_LOG_PAGE_SIZE_DEFAULT = GAMES_PAGE_SIZE_DEFAULT;
export const GAME_LOG_PAGE_SIZE_MAX = GAMES_PAGE_SIZE_MAX;
