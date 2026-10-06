import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from '@gamelog/shared';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply } from 'fastify';

import { env } from '../config/env.js';

/**
 * Opções do cookie de refresh (RN-F1-09): `HttpOnly`, `SameSite=Strict`, restrito ao
 * caminho da autenticação e `Secure` quando em produção.
 */
export function buildRefreshCookieOptions(production: boolean): CookieSerializeOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    secure: production,
    maxAge: REFRESH_TOKEN_TTL_SECONDS,
  };
}

function currentOptions(): CookieSerializeOptions {
  return buildRefreshCookieOptions(env.NODE_ENV === 'production');
}

/** O refresh token é entregue exclusivamente por cookie, nunca no corpo (RN-F1-09). */
export function setRefreshCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(REFRESH_COOKIE_NAME, token, currentOptions());
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE_NAME, currentOptions());
}
