import { z } from 'zod';

import { CONTROL_CHARACTERS_PATTERN, normalizeDisplayName } from './taxonomy.js';

/**
 * Contratos do gerenciamento de gênero (SPEC F5, seções 2 e 3): leituras públicas e
 * CRUD administrativo. Leitura pública, escrita exclusiva do `ADMIN` (RN-F5-01).
 */

export const GENRE_NAME_MAX_LENGTH = 50;
export const GENRE_SLUG_MAX_LENGTH = 60;
export const GENRE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const GENRE_NAME_LENGTH_MESSAGE = `Nome do gênero deve ter entre 1 e ${GENRE_NAME_MAX_LENGTH} caracteres`;
const GENRE_SLUG_LENGTH_MESSAGE = `Identificador deve ter entre 1 e ${GENRE_SLUG_MAX_LENGTH} caracteres`;
const GENRE_SLUG_FORMAT_MESSAGE =
  'Identificador deve usar apenas letras minúsculas, números e hífens (sem hífen no início ou fim)';

/**
 * `name` (RN-F5-02): normalizado para exibição (`trim` + espaços colapsados) antes da
 * validação de tamanho e de caracteres de controle.
 */
export const genreNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(1, GENRE_NAME_LENGTH_MESSAGE)
      .max(GENRE_NAME_MAX_LENGTH, GENRE_NAME_LENGTH_MESSAGE)
      .refine(
        (value) => !CONTROL_CHARACTERS_PATTERN.test(value),
        'Nome do gênero não pode conter caracteres de controle',
      ),
  );

/** `slug` (RN-F5-03): normalizado (`trim` + minúsculas) antes da validação de formato. */
export const genreSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1, GENRE_SLUG_LENGTH_MESSAGE)
      .max(GENRE_SLUG_MAX_LENGTH, GENRE_SLUG_LENGTH_MESSAGE)
      .regex(GENRE_SLUG_PATTERN, GENRE_SLUG_FORMAT_MESSAGE),
  );

/** Corpo de `POST /genres`: `slug` omitido é derivado do nome (RN-F5-03). */
export const genreCreateSchema = z.strictObject(
  {
    name: genreNameSchema,
    slug: genreSlugSchema.optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type GenreCreateInput = z.infer<typeof genreCreateSchema>;

/** Corpo de `PATCH /genres/:genre`: somente `name`; o `slug` é imutável (RN-F5-04). */
export const genreUpdateSchema = z.strictObject(
  {
    name: genreNameSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type GenreUpdateInput = z.infer<typeof genreUpdateSchema>;

/** Gênero resumido das leituras públicas (RN-F5-08). */
export const genreRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  gameCount: z.number().int().nonnegative(),
});

export type GenreRef = z.infer<typeof genreRefSchema>;

/** Detalhe do gênero (RN-F5-09): resumo + colunas de auditoria. */
export const genreDetailSchema = genreRefSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type GenreDetail = z.infer<typeof genreDetailSchema>;

/** Resposta de `GET /genres` (RN-F5-08): lista completa, sem paginação. */
export const genreListSchema = z.object({ data: z.array(genreRefSchema) });

export type GenreList = z.infer<typeof genreListSchema>;

/**
 * Parâmetro `:genre` (RN-F5-09): aceita o `slug` ou o `id` (UUID). O formato não é
 * validado aqui de propósito — um identificador inexistente deve responder `404`.
 */
export const genreParamsSchema = z.object({ genre: z.string().min(1) });

export const GENRE_ROUTES = {
  /** Padrão da listagem (backend). */
  list: '/genres',
  /** Padrão do detalhe (backend). */
  detail: '/genres/:genre',
} as const;

/** Caminho do detalhe de um gênero pelo `slug` (frontend e testes). */
export function genrePath(slug: string): string {
  return `/genres/${encodeURIComponent(slug)}`;
}
