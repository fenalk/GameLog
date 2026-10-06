import {
  AUTH_ROUTES,
  authResponseSchema,
  type AuthResponse,
  type AuthUser,
  type LoginInput,
  type RegisterInput,
} from '@gamelog/shared';
import { useSyncExternalStore } from 'react';

import { ApiError, apiFetch, apiRequest, type ApiRequestOptions } from '@/lib/api';

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated';

export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  /**
   * O access token vive apenas em memória (nunca em localStorage/cookies): a sessão é
   * restaurada no carregamento via `POST /auth/refresh` com o cookie HttpOnly.
   */
  accessToken: string | null;
};

const ANONYMOUS: AuthState = { status: 'anonymous', user: null, accessToken: null };

let state: AuthState = { status: 'loading', user: null, accessToken: null };
const listeners = new Set<() => void>();

function setState(next: AuthState): void {
  state = next;

  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState);
}

function applySession(payload: AuthResponse): void {
  setState({ status: 'authenticated', user: payload.user, accessToken: payload.accessToken });
}

export function clearSession(): void {
  setState(ANONYMOUS);
}

let refreshInFlight: Promise<boolean> | null = null;

async function performRefresh(): Promise<boolean> {
  try {
    const response = await apiFetch(AUTH_ROUTES.refresh, { method: 'POST' });

    if (!response.ok) {
      clearSession();
      return false;
    }

    applySession(authResponseSchema.parse(await response.json()));
    return true;
  } catch {
    // Falha de rede/servidor ou payload inesperado: a sessão local é encerrada.
    clearSession();
    return false;
  }
}

/**
 * Renova a sessão com uma única requisição em voo; chamadas concorrentes compartilham
 * o mesmo resultado (renovação transparente ao usuário).
 */
export function refreshSession(): Promise<boolean> {
  refreshInFlight ??= performRefresh().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

/** Restaura a sessão no carregamento da aplicação (cookie de refresh → nova sessão). */
export function restoreSession(): Promise<boolean> {
  return refreshSession();
}

export async function signUp(values: RegisterInput): Promise<void> {
  const payload = authResponseSchema.parse(
    await apiRequest(AUTH_ROUTES.register, { method: 'POST', body: values }),
  );

  applySession(payload);
}

export async function signIn(values: LoginInput): Promise<void> {
  const payload = authResponseSchema.parse(
    await apiRequest(AUTH_ROUTES.login, { method: 'POST', body: values }),
  );

  applySession(payload);
}

/** Encerra a sessão no servidor e localmente; a limpeza local ocorre mesmo em falha. */
export async function signOut(): Promise<void> {
  try {
    await apiRequest(AUTH_ROUTES.logout, { method: 'POST' });
  } finally {
    clearSession();
  }
}

/**
 * Requisição autenticada com uma única tentativa de renovação: em `401` tenta
 * `POST /auth/refresh` e repete a requisição; se a renovação falhar, encerra a sessão
 * local e propaga o erro.
 */
export async function authorizedRequest<T>(
  path: string,
  options: Omit<ApiRequestOptions, 'token'> = {},
): Promise<T> {
  if (!state.accessToken) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Sessão não iniciada.');
  }

  try {
    return await apiRequest<T>(path, { ...options, token: state.accessToken });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) {
      throw error;
    }

    const renewed = await refreshSession();

    if (!renewed || !state.accessToken) {
      throw error;
    }

    return apiRequest<T>(path, { ...options, token: state.accessToken });
  }
}
