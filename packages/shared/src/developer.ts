import { z } from 'zod';

import { CONTROL_CHARACTERS_PATTERN, normalizeDisplayName } from './taxonomy.js';

/**
 * Contratos do gerenciamento de desenvolvedora (SPEC F7, seções 2 e 3): leituras
 * públicas e CRUD administrativo. Leitura pública, escrita exclusiva do `ADMIN`
 * (RN-F7-01).
 */

export const DEVELOPER_NAME_MAX_LENGTH = 100;
export const DEVELOPER_SLUG_MAX_LENGTH = 110;
export const DEVELOPER_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const DEVELOPER_NAME_LENGTH_MESSAGE = `Nome da desenvolvedora deve ter entre 1 e ${DEVELOPER_NAME_MAX_LENGTH} caracteres`;
const DEVELOPER_SLUG_LENGTH_MESSAGE = `Identificador deve ter entre 1 e ${DEVELOPER_SLUG_MAX_LENGTH} caracteres`;
const DEVELOPER_SLUG_FORMAT_MESSAGE =
  'Identificador deve usar apenas letras minúsculas, números e hífens (sem hífen no início ou fim)';

/**
 * `name` (RN-F7-02): normalizado para exibição (`trim` + espaços colapsados) antes da
 * validação de tamanho e de caracteres de controle.
 */
export const developerNameSchema = z
  .string()
  .transform(normalizeDisplayName)
  .pipe(
    z
      .string()
      .min(1, DEVELOPER_NAME_LENGTH_MESSAGE)
      .max(DEVELOPER_NAME_MAX_LENGTH, DEVELOPER_NAME_LENGTH_MESSAGE)
      .refine(
        (value) => !CONTROL_CHARACTERS_PATTERN.test(value),
        'Nome da desenvolvedora não pode conter caracteres de controle',
      ),
  );

/** `slug` (RN-F7-03): normalizado (`trim` + minúsculas) antes da validação de formato. */
export const developerSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1, DEVELOPER_SLUG_LENGTH_MESSAGE)
      .max(DEVELOPER_SLUG_MAX_LENGTH, DEVELOPER_SLUG_LENGTH_MESSAGE)
      .regex(DEVELOPER_SLUG_PATTERN, DEVELOPER_SLUG_FORMAT_MESSAGE),
  );

/** Corpo de `POST /developers`: `slug` omitido é derivado do nome (RN-F7-03). */
export const developerCreateSchema = z.strictObject(
  {
    name: developerNameSchema,
    slug: developerSlugSchema.optional(),
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type DeveloperCreateInput = z.infer<typeof developerCreateSchema>;

/** Corpo de `PATCH /developers/:developer`: somente `name`; o `slug` é imutável (RN-F7-04). */
export const developerUpdateSchema = z.strictObject(
  {
    name: developerNameSchema,
  },
  { error: 'Campo não permitido no corpo da requisição' },
);

export type DeveloperUpdateInput = z.infer<typeof developerUpdateSchema>;

/** Desenvolvedora resumida das leituras públicas (RN-F7-08). */
export const developerRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  gameCount: z.number().int().nonnegative(),
});

export type DeveloperRef = z.infer<typeof developerRefSchema>;

/** Detalhe da desenvolvedora (RN-F7-09): resumo + colunas de auditoria. */
export const developerDetailSchema = developerRefSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type DeveloperDetail = z.infer<typeof developerDetailSchema>;

/** Resposta de `GET /developers` (RN-F7-08): lista completa, sem paginação. */
export const developerListSchema = z.object({ data: z.array(developerRefSchema) });

export type DeveloperList = z.infer<typeof developerListSchema>;

/**
 * Parâmetro `:developer` (RN-F7-09): aceita o `slug` ou o `id` (UUID). O formato não é
 * validado aqui de propósito — um identificador inexistente deve responder `404`.
 */
export const developerParamsSchema = z.object({ developer: z.string().min(1) });

export const DEVELOPER_ROUTES = {
  /** Padrão da listagem (backend). */
  list: '/developers',
  /** Padrão do detalhe (backend). */
  detail: '/developers/:developer',
} as const;

/** Caminho do detalhe de uma desenvolvedora pelo `slug` (frontend e testes). */
export function developerPath(slug: string): string {
  return `/developers/${encodeURIComponent(slug)}`;
}
