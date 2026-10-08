import { z } from 'zod';

/**
 * Formato único de resposta de erro da API REST (seção 2 da SPEC F1).
 * `details` é opcional e, quando presente, traz o campo e a mensagem em pt-BR.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          field: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const apiErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});

export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

/** Códigos estáveis de erro da API (UPPER_SNAKE) verificados pelos testes. */
export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  unauthenticated: 'UNAUTHENTICATED',
  invalidCredentials: 'INVALID_CREDENTIALS',
  forbidden: 'FORBIDDEN',
  accountSuspended: 'ACCOUNT_SUSPENDED',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  rateLimited: 'RATE_LIMITED',
  internal: 'INTERNAL_ERROR',
  usernameTaken: 'USERNAME_TAKEN',
  emailTaken: 'EMAIL_TAKEN',
  invalidCurrentPassword: 'INVALID_CURRENT_PASSWORD',
  lastAdmin: 'LAST_ADMIN',
  genreNameTaken: 'GENRE_NAME_TAKEN',
  genreSlugTaken: 'GENRE_SLUG_TAKEN',
  genreInUse: 'GENRE_IN_USE',
  platformNameTaken: 'PLATFORM_NAME_TAKEN',
  platformSlugTaken: 'PLATFORM_SLUG_TAKEN',
  platformInUse: 'PLATFORM_IN_USE',
  developerNameTaken: 'DEVELOPER_NAME_TAKEN',
  developerSlugTaken: 'DEVELOPER_SLUG_TAKEN',
  developerInUse: 'DEVELOPER_IN_USE',
  listLimitReached: 'LIST_LIMIT_REACHED',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
