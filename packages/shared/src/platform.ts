import { z } from 'zod';

import { CONTROL_CHARACTERS_PATTERN, normalizeDisplayName } from './taxonomy.js';

/**
 * Contratos do gerenciamento de plataforma (SPEC F6, seções 3 e 4): leituras públicas e
 * CRUD administrativo. Leitura pública, escrita exclusiva do `ADMIN` (RN-F6-01).
 */

export const PLATFORM_NAME_MAX_LENGTH = 60;
export const PLATFORM_SLUG_MAX_LENGTH = 70;
export const PLATFORM_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const PLATFORM_NAME_LENGTH_MESSAGE = `Nome da plataforma deve ter entre 1 e ${PLATFORM_NAME_MAX_LENGTH} caracteres`;
const PLATFORM_SLUG_LENGTH_MESSAGE = `Identificador deve ter entre 1 e ${PLATFORM_SLUG_MAX_LENGTH} caracteres`;
const PLATFORM_SLUG_FORMAT_MESSAGE =
  'Identificador deve usar apenas letras minúsculas, números e hífens (sem hífen no início ou fim)';

/**
 * `name` (RN-F6-02): normalizado para exibição (`trim` + espaços colapsados) antes da
 * validação de tamanho e de caracteres de controle.
 */
export const platformNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(1, PLATFORM_NAME_LENGTH_MESSAGE)
      .max(PLATFORM_NAME_MAX_LENGTH, PLATFORM_NAME_LENGTH_MESSAGE)
      .refine(
        (value) => !CONTROL_CHARACTERS_PATTERN.test(value),
        'Nome da plataforma não pode conter caracteres de controle',
      ),
  );

/** `slug` (RN-F6-03): normalizado (`trim` + minúsculas) antes da validação de formato. */
export const platformSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1, PLATFORM_SLUG_LENGTH_MESSAGE)
      .max(PLATFORM_SLUG_MAX_LENGTH, PLATFORM_SLUG_LENGTH_MESSAGE)
      .regex(PLATFORM_SLUG_PATTERN, PLATFORM_SLUG_FORMAT_MESSAGE),
  );

/** Corpo de `POST /platforms`: `slug` omitido é derivado do nome (RN-F6-03). */
export const platformCreateSchema = z.strictObject(
  {
    name: platformNameSchema,
    slug: platformSlugSchema.optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type PlatformCreateInput = z.infer<typeof platformCreateSchema>;

/** Corpo de `PATCH /platforms/:platform`: somente `name`; o `slug` é imutável (RN-F6-04). */
export const platformUpdateSchema = z.strictObject(
  {
    name: platformNameSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type PlatformUpdateInput = z.infer<typeof platformUpdateSchema>;

/** Plataforma resumida das leituras públicas (RN-F6-08). */
export const platformRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  gameCount: z.number().int().nonnegative(),
});

export type PlatformRef = z.infer<typeof platformRefSchema>;

/** Detalhe da plataforma (RN-F6-09): resumo + colunas de auditoria. */
export const platformDetailSchema = platformRefSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type PlatformDetail = z.infer<typeof platformDetailSchema>;

/** Resposta de `GET /platforms` (RN-F6-08): lista completa, sem paginação. */
export const platformListSchema = z.object({ data: z.array(platformRefSchema) });

export type PlatformList = z.infer<typeof platformListSchema>;

/**
 * Parâmetro `:platform` (RN-F6-09): aceita o `slug` ou o `id` (UUID). O formato não é
 * validado aqui de propósito — um identificador inexistente deve responder `404`.
 */
export const platformParamsSchema = z.object({ platform: z.string().min(1) });

export const PLATFORM_ROUTES = {
  /** Padrão da listagem (backend). */
  list: '/platforms',
  /** Padrão do detalhe (backend). */
  detail: '/platforms/:platform',
} as const;

/** Caminho do detalhe de uma plataforma pelo `slug` (frontend e testes). */
export function platformPath(slug: string): string {
  return `/platforms/${encodeURIComponent(slug)}`;
}
