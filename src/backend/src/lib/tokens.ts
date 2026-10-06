import { createHash, randomUUID } from 'node:crypto';

import { ACCESS_TOKEN_TTL_SECONDS, REFRESH_TOKEN_TTL_SECONDS } from '@gamelog/shared';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';

const ALGORITHM = 'HS256';

export type AccessTokenPayload = {
  sub: string;
};

export type RefreshTokenPayload = {
  sub: string;
  jti: string;
};

/** Erro lançado quando um token não é válido (assinatura, formato ou expiração). */
export class InvalidTokenError extends Error {
  constructor(message = 'Token inválido') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

/** Access token: 15 min, claim `sub` = id do usuário (RN-F1-09). */
export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const payload = verify(token, env.JWT_ACCESS_SECRET);

  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new InvalidTokenError('Token sem o claim sub');
  }

  return { sub: payload.sub };
}

/**
 * Refresh token: 7 dias, com `jti` e segredo distinto do access token (RN-F1-09).
 * O retorno traz o `jti` em claro (usado só no hash persistido) e a expiração.
 */
export function signRefreshToken(userId: string): { token: string; jti: string; expiresAt: Date } {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
  const jti = randomUUID();
  const token = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    jwtid: jti,
    expiresIn: REFRESH_TOKEN_TTL_SECONDS,
  });

  return { token, jti, expiresAt };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const payload = verify(token, env.JWT_REFRESH_SECRET);

  if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
    throw new InvalidTokenError('Refresh token sem sub/jti');
  }

  return { sub: payload.sub, jti: payload.jti };
}

/** O banco guarda apenas o hash do `jti`, nunca o valor em claro (RN-F1-09). */
export function hashRefreshTokenJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

function verify(token: string, secret: string): jwt.JwtPayload {
  let payload: string | jwt.JwtPayload;

  try {
    payload = jwt.verify(token, secret, { algorithms: [ALGORITHM] });
  } catch {
    throw new InvalidTokenError();
  }

  if (typeof payload === 'string') {
    throw new InvalidTokenError('Payload inesperado');
  }

  return payload;
}
