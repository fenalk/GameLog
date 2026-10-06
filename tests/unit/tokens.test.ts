import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  roleSatisfies,
} from '@gamelog/shared';
import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';

import { env } from '../../src/backend/src/config/env.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from '../../src/backend/src/lib/tokens.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('RN-F1-09: tokens de acesso e de refresh', () => {
  it('o access token tem sub = id do usuário e validade de 15 minutos', () => {
    const token = signAccessToken(USER_ID);
    const payload = jwt.decode(token) as { sub: string; exp: number; iat: number; jti?: string };

    expect(payload.sub).toBe(USER_ID);
    expect(payload.exp - payload.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60);
    expect(payload.jti).toBeUndefined();
    expect(verifyAccessToken(token).sub).toBe(USER_ID);
  });

  it('o refresh token tem jti próprio e validade de 7 dias', () => {
    const { token, jti, expiresAt } = signRefreshToken(USER_ID);
    const payload = jwt.decode(token) as { sub: string; jti: string; exp: number; iat: number };

    expect(payload.sub).toBe(USER_ID);
    expect(payload.jti).toBe(jti);
    expect(payload.exp - payload.iat).toBe(REFRESH_TOKEN_TTL_SECONDS);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(verifyRefreshToken(token)).toEqual({ sub: USER_ID, jti });
  });

  it('os segredos são distintos: um token não é aceito no lugar do outro', () => {
    expect(() => verifyRefreshToken(signAccessToken(USER_ID))).toThrow();
    expect(() => verifyAccessToken(signRefreshToken(USER_ID).token)).toThrow();
  });

  it('recusa token assinado com segredo diferente', () => {
    const forged = jwt.sign({}, `${env.JWT_ACCESS_SECRET}outro`, {
      subject: USER_ID,
      expiresIn: 60,
    });

    expect(() => verifyAccessToken(forged)).toThrow();
  });
});

describe('hierarquia de papéis (T1.07)', () => {
  it('ADMIN satisfaz PLAYER, mas PLAYER não satisfaz ADMIN', () => {
    expect(roleSatisfies('ADMIN', 'PLAYER')).toBe(true);
    expect(roleSatisfies('ADMIN', 'ADMIN')).toBe(true);
    expect(roleSatisfies('PLAYER', 'PLAYER')).toBe(true);
    expect(roleSatisfies('PLAYER', 'ADMIN')).toBe(false);
  });
});
