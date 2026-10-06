import {
  ERROR_CODES,
  INVALID_CREDENTIALS_MESSAGE,
  type ApiError,
  type ApiErrorDetail,
  type ErrorCode,
} from '@gamelog/shared';

export type { ApiErrorDetail };

/**
 * Erro de domínio da API REST. Carrega o status HTTP, o `code` estável e, quando
 * aplicável, os detalhes por campo — tudo no formato de erro da seção 2 da SPEC F1.
 */
export class ApiException extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;
  readonly details: ApiErrorDetail[] | undefined;
  readonly headers: Record<string, string> | undefined;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    options: { details?: ApiErrorDetail[]; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = 'ApiException';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    this.headers = options.headers;
  }

  toBody(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

/** Fábrica dos erros usados pela aplicação, evitando literais dispersos nas rotas. */
export const apiErrors = {
  validation(message = 'Requisição inválida', details?: ApiErrorDetail[]): ApiException {
    return new ApiException(400, ERROR_CODES.validation, message, {
      ...(details ? { details } : {}),
    });
  },

  unauthenticated(message = 'Autenticação necessária'): ApiException {
    return new ApiException(401, ERROR_CODES.unauthenticated, message);
  },

  /** Credenciais erradas: mesma resposta para usuário inexistente e senha incorreta (RN-F1-06). */
  invalidCredentials(): ApiException {
    return new ApiException(401, ERROR_CODES.invalidCredentials, INVALID_CREDENTIALS_MESSAGE);
  },

  forbidden(message = 'Você não tem permissão para acessar este recurso'): ApiException {
    return new ApiException(403, ERROR_CODES.forbidden, message);
  },

  accountSuspended(): ApiException {
    return new ApiException(403, ERROR_CODES.accountSuspended, 'Conta suspensa');
  },

  notFound(message = 'Recurso não encontrado'): ApiException {
    return new ApiException(404, ERROR_CODES.notFound, message);
  },

  conflict(code: ErrorCode, message: string): ApiException {
    return new ApiException(409, code, message);
  },

  /** Senha atual incorreta nas operações sensíveis do perfil (RN-F2-05 a RN-F2-07). */
  invalidCurrentPassword(): ApiException {
    return new ApiException(400, ERROR_CODES.invalidCurrentPassword, 'Senha atual incorreta.');
  },

  /** O último administrador ativo não pode excluir a própria conta (RN-F2-07). */
  lastAdmin(): ApiException {
    return new ApiException(
      409,
      ERROR_CODES.lastAdmin,
      'Não é possível excluir a conta do último administrador ativo.',
    );
  },

  rateLimited(retryAfterSeconds: number, message = 'Muitas tentativas de login'): ApiException {
    return new ApiException(429, ERROR_CODES.rateLimited, message, {
      headers: { 'retry-after': String(retryAfterSeconds) },
    });
  },
  internal(): ApiException {
    return new ApiException(500, ERROR_CODES.internal, 'Erro interno do servidor');
  },
};
