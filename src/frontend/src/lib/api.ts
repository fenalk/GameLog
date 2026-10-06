import {
  API_PREFIX,
  API_ROUTES,
  apiErrorSchema,
  healthResponseSchema,
  type ApiErrorDetail,
  type HealthResponse,
} from '@gamelog/shared';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? API_PREFIX;

/** Erro de API com o `code` estável, a mensagem em pt-BR e os detalhes por campo. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ApiErrorDetail[];

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  fieldError(field: string): string | undefined {
    return this.details.find((detail) => detail.field === field)?.message;
  }
}

export type ApiRequestOptions = {
  method?: string | undefined;
  body?: unknown;
  token?: string | null | undefined;
  signal?: AbortSignal | undefined;
};

/**
 * Executa a requisição e devolve a resposta crua — usado pelo fluxo de sessão, que
 * precisa reagir a um 401 antes de decidir renovar e repetir a chamada.
 */
export async function apiFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  if (options.signal) {
    init.signal = options.signal;
  }

  return fetch(`${apiBaseUrl}${path}`, init);
}

function toApiError(status: number, payload: unknown): ApiError {
  const parsed = apiErrorSchema.safeParse(payload);

  if (parsed.success) {
    return new ApiError(
      status,
      parsed.data.error.code,
      parsed.data.error.message,
      parsed.data.error.details ?? [],
    );
  }

  return new ApiError(status, 'INTERNAL_ERROR', 'Erro inesperado ao falar com a API.');
}

/** Requisição JSON com o contrato de erro padrão da API (seção 2 da SPEC F1). */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  const payload: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => undefined);

  if (!response.ok) {
    throw toApiError(response.status, payload);
  }

  return payload as T;
}

/**
 * Exemplo de consumo da API REST usando o contrato Zod compartilhado: a resposta é
 * validada com o mesmo schema usado pelo backend.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  return healthResponseSchema.parse(await apiRequest(API_ROUTES.health));
}
