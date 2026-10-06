import { z } from 'zod';

/** Formato único de resposta de erro da API REST (ver seção 3.2 da SPEC de arquitetura). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  notFound: 'NOT_FOUND',
  conflict: 'CONFLICT',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
  internal: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
