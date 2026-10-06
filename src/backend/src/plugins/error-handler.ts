import { ERROR_CODES, type ApiError, type ErrorCode } from '@gamelog/shared';
import type { FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';

import { ApiException } from '../lib/api-error.js';

type ValidationIssue = {
  instancePath?: string;
  message?: string;
  keyword?: string;
  params?: Record<string, unknown>;
};

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

/**
 * Erros de parse do corpo gerados pelo próprio Fastify (códigos `FST_ERR_CTP_*`) chegam
 * em inglês; a SPEC F1 (seção 2) exige mensagens ao usuário em pt-BR.
 */
const CLIENT_ERROR_MESSAGES: Record<string, string> = {
  FST_ERR_CTP_INVALID_JSON_BODY: 'Corpo da requisição não é um JSON válido',
  FST_ERR_CTP_EMPTY_JSON_BODY: 'Corpo da requisição vazio',
  FST_ERR_CTP_INVALID_MEDIA_TYPE: 'Tipo de mídia não suportado',
  FST_ERR_CTP_INVALID_CONTENT_TYPE: 'Tipo de conteúdo não suportado',
  FST_ERR_CTP_BODY_TOO_LARGE: 'Corpo da requisição maior que o limite permitido',
};

function clientMessageFrom(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };

  return typeof code === 'string' ? CLIENT_ERROR_MESSAGES[code] : undefined;
}

function codeFrom(statusCode: number): ErrorCode {
  switch (statusCode) {
    case 400:
      return ERROR_CODES.validation;
    case 401:
      return ERROR_CODES.unauthenticated;
    case 403:
      return ERROR_CODES.forbidden;
    case 404:
      return ERROR_CODES.notFound;
    case 409:
      return ERROR_CODES.conflict;
    case 429:
      return ERROR_CODES.rateLimited;
    case 503:
      return ERROR_CODES.serviceUnavailable;
    default:
      return statusCode >= 500 ? ERROR_CODES.internal : ERROR_CODES.validation;
  }
}

/** Converte cada issue do Zod em `{ field, message }` (formato de `details` da SPEC F1). */
function detailsFromValidationIssues(
  issues: ValidationIssue[],
): { field: string; message: string }[] {
  return issues.map((issue) => {
    // `instancePath` chega como `/campo` (ou `/` quando a issue é do corpo inteiro).
    const field = (issue.instancePath ?? '').replace(/^\//, '');

    if (field.length > 0) {
      return { field, message: issue.message ?? 'Valor inválido' };
    }

    const keys = issue.params?.keys;

    if (issue.keyword === 'unrecognized_keys' && Array.isArray(keys)) {
      return { field: keys.join(', '), message: issue.message ?? 'Campo não permitido' };
    }

    return { field: 'body', message: issue.message ?? 'Valor inválido' };
  });
}

/**
 * Tratamento de erros centralizado (seção 2 da SPEC F1): toda resposta de erro da API
 * segue o contrato `apiErrorSchema` de @gamelog/shared, com `code` estável e mensagem em
 * pt-BR. Erros 500 nunca expõem stack trace.
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
    if (error instanceof ApiException) {
      if (error.headers) {
        for (const [header, value] of Object.entries(error.headers)) {
          void reply.header(header, value);
        }
      }

      return reply.status(error.statusCode).send(error.toBody());
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const body: ApiError = {
        error: {
          code: ERROR_CODES.validation,
          message: 'Requisição inválida',
          details: detailsFromValidationIssues(error.validation as ValidationIssue[]),
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
        message:
          statusCode >= 500
            ? 'Erro interno do servidor'
            : (clientMessageFrom(error) ?? messageFrom(error)),
      },
    };
    return reply.status(statusCode).send(body);
  });
}
