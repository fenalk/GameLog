import { ERROR_CODES, type ApiError, type ErrorCode } from '@gamelog/shared';
import type { FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

function httpStatusFrom(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    const { statusCode } = error as { statusCode?: unknown };

    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 599) {
      return statusCode;
    }
  }

  return 500;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : 'Erro inesperado';
}

function codeFrom(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ERROR_CODES.validation;
    case 401:
      return ERROR_CODES.unauthorized;
    case 403:
      return ERROR_CODES.forbidden;
    case 404:
      return ERROR_CODES.notFound;
    case 409:
      return ERROR_CODES.conflict;
    case 503:
      return ERROR_CODES.serviceUnavailable;
    default:
      return statusCode >= 500 ? ERROR_CODES.internal : ERROR_CODES.validation;
  }
}

/**
 * Tratamento de erros centralizado (seção 3.2 da SPEC de arquitetura): toda resposta
 * de erro da API segue o contrato `apiErrorSchema` de @gamelog/shared.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiError = {
      error: {
        code: ERROR_CODES.notFound,
        message: `Rota não encontrada: ${request.method} ${request.url}`,
      },
    };
    void reply.status(404).send(body);
  });

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ApiError = {
        error: {
          code: ERROR_CODES.validation,
          message: 'Requisição inválida',
          details: error.validation.map((issue) => ({
            path: issue.instancePath ?? '',
            message: issue.message ?? 'Valor inválido',
          })),
        },
      };
      return reply.status(400).send(body);
    }

    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'Falha ao serializar a resposta');
      const body: ApiError = {
        error: {
          code: ERROR_CODES.internal,
          message: 'Erro interno do servidor',
        },
      };
      return reply.status(500).send(body);
    }

    const statusCode = httpStatusFrom(error);

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Erro não tratado');
    }

    const body: ApiError = {
      error: {
        code: codeFrom(statusCode),
        message: statusCode >= 500 ? 'Erro interno do servidor' : messageFrom(error),
      },
    };
    return reply.status(statusCode).send(body);
  });
}
