import { REFRESH_COOKIE_NAME } from '@gamelog/shared';
import type { Response } from 'supertest';

/** Extrai o par `nome=valor` do cookie de refresh de uma resposta (ou undefined). */
export function refreshCookiePair(response: Response): string | undefined {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];

  for (const cookie of cookies) {
    const [pair] = cookie.split(';');

    if (pair?.startsWith(`${REFRESH_COOKIE_NAME}=`)) {
      return pair;
    }
  }

  return undefined;
}

/** Valor do refresh token entregue no cookie (string vazia quando o cookie foi limpo). */
export function refreshTokenValue(response: Response): string | undefined {
  const pair = refreshCookiePair(response);
  return pair?.slice(`${REFRESH_COOKIE_NAME}=`.length);
}

export function refreshCookieAttributes(response: Response): string {
  const header = response.headers['set-cookie'];
  const cookies = Array.isArray(header) ? header : header ? [header] : [];
  return cookies.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`)) ?? '';
}
