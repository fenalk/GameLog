import {
  AUTH_ROUTES,
  ERROR_CODES,
  INVALID_CREDENTIALS_MESSAGE,
  REFRESH_COOKIE_NAME,
  apiErrorSchema,
  authResponseSchema,
  meResponseSchema,
} from '@gamelog/shared';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../src/backend/src/config/env.js';
import { hashRefreshTokenJti } from '../../src/backend/src/lib/tokens.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import {
  refreshCookieAttributes,
  refreshCookiePair,
  refreshTokenValue,
} from '../helpers/cookies.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';

function validRegistration(overrides: Record<string, unknown> = {}) {
  return {
    username: 'jogador_01',
    email: 'jogador@example.com',
    password: VALID_PASSWORD,
    ...overrides,
  };
}

describe('SPEC F1 — identidade e acesso (API REST)', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectDatabase();
  });

  function post(path: string, body?: unknown) {
    return request(app.server).post(testPath(path)).send(body);
  }

  function get(path: string) {
    return request(app.server).get(testPath(path));
  }

  async function registerAndGetSession(body = validRegistration()) {
    const response = await post(AUTH_ROUTES.register, body);

    expect(response.status).toBe(201);

    return {
      response,
      accessToken: response.body.accessToken as string,
      cookie: refreshCookiePair(response) as string,
    };
  }

  describe('cadastro', () => {
    it('CA-F1-01: cadastro válido retorna 201, tokens e senha apenas como hash argon2id', async () => {
      const response = await post(AUTH_ROUTES.register, validRegistration());

      expect(response.status).toBe(201);
      expect(authResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.user.role).toBe('PLAYER');
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain(VALID_PASSWORD);
      expect(refreshTokenValue(response)).toBeTruthy();

      const stored = await prisma.user.findUniqueOrThrow({
        where: { username: 'jogador_01' },
      });
      expect(stored.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(stored.status).toBe('ACTIVE');
      expect(stored.role).toBe('PLAYER');
    });

    it('CA-F1-02: username e e-mail duplicados (sem diferenciar maiúsculas) retornam 409', async () => {
      await post(AUTH_ROUTES.register, validRegistration());

      const duplicatedUsername = await post(
        AUTH_ROUTES.register,
        validRegistration({ username: 'JOGADOR_01', email: 'outro@example.com' }),
      );
      expect(duplicatedUsername.status).toBe(409);
      expect(duplicatedUsername.body.error.code).toBe('USERNAME_TAKEN');

      const duplicatedEmail = await post(
        AUTH_ROUTES.register,
        validRegistration({ username: 'outro_01', email: 'JOGADOR@EXAMPLE.COM' }),
      );
      expect(duplicatedEmail.status).toBe(409);
      expect(duplicatedEmail.body.error.code).toBe('EMAIL_TAKEN');

      expect(await prisma.user.count()).toBe(1);
    });

    it('CA-F1-03: entradas inválidas retornam 400 VALIDATION_ERROR com details por campo', async () => {
      const cases: { body: Record<string, unknown>; field: string }[] = [
        { body: validRegistration({ username: 'ab' }), field: 'username' },
        { body: validRegistration({ username: 'maria-teste' }), field: 'username' },
        { body: validRegistration({ username: 'admin' }), field: 'username' },
        { body: validRegistration({ email: 'nao-é-email' }), field: 'email' },
        { body: validRegistration({ password: 'curta1' }), field: 'password' },
        { body: validRegistration({ password: 'somenteletras' }), field: 'password' },
        { body: validRegistration({ password: '12345678' }), field: 'password' },
      ];

      for (const testCase of cases) {
        const response = await post(AUTH_ROUTES.register, testCase.body);

        expect(response.status).toBe(400);
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');

        const fields = (response.body.error.details as { field: string }[]).map(
          (detail) => detail.field,
        );
        expect(fields).toContain(testCase.field);
      }

      expect(await prisma.user.count()).toBe(0);
    });

    it('CA-F1-04: username e e-mail são normalizados antes de persistir', async () => {
      const response = await post(
        AUTH_ROUTES.register,
        validRegistration({ username: '  Maria_01 ', email: 'MARIA@EX.COM' }),
      );

      expect(response.status).toBe(201);

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'maria_01' } });
      expect(stored.email).toBe('maria@ex.com');
    });

    it('CA-F1-05: campos desconhecidos (como role) retornam 400 e nenhum ADMIN é criado', async () => {
      const withRole = await post(AUTH_ROUTES.register, validRegistration({ role: 'ADMIN' }));

      expect(withRole.status).toBe(400);
      expect(withRole.body.error.code).toBe('VALIDATION_ERROR');

      const withUnknownField = await post(
        AUTH_ROUTES.register,
        validRegistration({ isAdmin: true }),
      );
      expect(withUnknownField.status).toBe(400);

      expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(0);
      expect(await prisma.user.count()).toBe(0);
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await post(AUTH_ROUTES.register, validRegistration());
    });

    it('CA-F1-06: login por e-mail e por username retornam 200 com tokens', async () => {
      const byEmail = await post(AUTH_ROUTES.login, {
        identifier: 'jogador@example.com',
        password: VALID_PASSWORD,
      });

      expect(byEmail.status).toBe(200);
      expect(authResponseSchema.safeParse(byEmail.body).success).toBe(true);
      expect(byEmail.body.accessToken).toBeTypeOf('string');
      expect(refreshTokenValue(byEmail)).toBeTruthy();

      const byUsername = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });

      expect(byUsername.status).toBe(200);
      expect(byUsername.body.user.username).toBe('jogador_01');
    });

    it('CA-F1-07: senha errada e usuário inexistente têm resposta idêntica', async () => {
      const wrongPassword = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: 'senhaErrada1',
      });
      const unknownUser = await post(AUTH_ROUTES.login, {
        identifier: 'ninguem_aqui',
        password: 'senhaErrada1',
      });

      expect(wrongPassword.status).toBe(401);
      expect(unknownUser.status).toBe(401);
      expect(wrongPassword.body).toEqual(unknownUser.body);
      expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(wrongPassword.body.error.message).toBe(INVALID_CREDENTIALS_MESSAGE);
      expect(refreshCookiePair(wrongPassword)).toBeUndefined();
      expect(refreshCookiePair(unknownUser)).toBeUndefined();
    });

    it('CA-F1-08: conta suspensa com credenciais corretas retorna 403 sem tokens', async () => {
      await prisma.user.update({
        where: { username: 'jogador_01' },
        data: { status: 'SUSPENDED' },
      });

      const response = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('ACCOUNT_SUSPENDED');
      expect(response.body.accessToken).toBeUndefined();
      expect(refreshCookiePair(response)).toBeUndefined();
    });

    it('CA-F1-09: a 6ª tentativa após 5 falhas retorna 429 com Retry-After; sucesso zera o contador', async () => {
      const identifier = 'alvo_limite';

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await post(AUTH_ROUTES.login, {
          identifier,
          password: 'senhaErrada1',
        });
        expect(response.status).toBe(401);
      }

      const blocked = await post(AUTH_ROUTES.login, {
        identifier,
        password: 'senhaErrada1',
      });

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

      // Login bem-sucedido zera o contador: as falhas seguintes recomeçam do zero.
      const success = await post(AUTH_ROUTES.login, {
        identifier: 'JOGADOR_01',
        password: VALID_PASSWORD,
      });
      expect(success.status).toBe(200);

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await post(AUTH_ROUTES.login, {
          identifier: 'jogador_01',
          password: 'senhaErrada1',
        });
        expect(response.status).toBe(401);
      }

      const blockedAgain = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: 'senhaErrada1',
      });
      expect(blockedAgain.status).toBe(429);
    });
  });

  describe('sessão e tokens', () => {
    it('CA-F1-10: o cookie de refresh tem HttpOnly, SameSite=Strict e Path=/api/v1/auth', async () => {
      const { response } = await registerAndGetSession();
      const attributes = refreshCookieAttributes(response);

      expect(attributes).toContain(`${REFRESH_COOKIE_NAME}=`);
      expect(attributes).toContain('HttpOnly');
      expect(attributes).toContain('SameSite=Strict');
      expect(attributes).toContain('Path=/api/v1/auth');
      expect(attributes).not.toContain('Secure');

      const token = refreshTokenValue(response) as string;
      expect(token.length).toBeGreaterThan(0);
      expect(JSON.stringify(response.body)).not.toContain(token);
      expect(Object.keys(response.body).sort()).toEqual(['accessToken', 'user']);
    });

    it('CA-F1-11: o refresh rotaciona o token e revoga o anterior', async () => {
      const { cookie } = await registerAndGetSession();
      const oldToken = cookie.slice(`${REFRESH_COOKIE_NAME}=`.length);

      const refreshed = await post(AUTH_ROUTES.refresh).set('Cookie', [cookie]);

      expect(refreshed.status).toBe(200);
      expect(authResponseSchema.safeParse(refreshed.body).success).toBe(true);

      const newToken = refreshTokenValue(refreshed) as string;
      expect(newToken).toBeTruthy();
      expect(newToken).not.toBe(oldToken);

      const oldJti = (jwt.decode(oldToken) as { jti: string }).jti;
      const storedOld = await prisma.refreshToken.findUniqueOrThrow({
        where: { jtiHash: hashRefreshTokenJti(oldJti) },
      });
      expect(storedOld.revokedAt).not.toBeNull();

      const newJti = (jwt.decode(newToken) as { jti: string }).jti;
      const storedNew = await prisma.refreshToken.findUniqueOrThrow({
        where: { jtiHash: hashRefreshTokenJti(newJti) },
      });
      expect(storedNew.revokedAt).toBeNull();
    });

    it('CA-F1-12: reuso de refresh revogado retorna 401 e revoga todos os tokens do usuário', async () => {
      const { cookie } = await registerAndGetSession();

      const rotated = await post(AUTH_ROUTES.refresh).set('Cookie', [cookie]);
      expect(rotated.status).toBe(200);
      const newestCookie = refreshCookiePair(rotated) as string;

      const reused = await post(AUTH_ROUTES.refresh).set('Cookie', [cookie]);
      expect(reused.status).toBe(401);
      expect(reused.body.error.code).toBe('UNAUTHENTICATED');

      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      const activeTokens = await prisma.refreshToken.count({
        where: { userId: user.id, revokedAt: null },
      });
      expect(activeTokens).toBe(0);

      const afterReuse = await post(AUTH_ROUTES.refresh).set('Cookie', [newestCookie]);
      expect(afterReuse.status).toBe(401);
    });

    it('CA-F1-13: refresh ausente, expirado ou adulterado retorna 401 UNAUTHENTICATED', async () => {
      const missing = await post(AUTH_ROUTES.refresh);
      expect(missing.status).toBe(401);
      expect(missing.body.error.code).toBe('UNAUTHENTICATED');

      const tampered = await post(AUTH_ROUTES.refresh).set('Cookie', [
        `${REFRESH_COOKIE_NAME}=token-que-nao-e-jwt`,
      ]);
      expect(tampered.status).toBe(401);
      expect(tampered.body.error.code).toBe('UNAUTHENTICATED');

      const { cookie } = await registerAndGetSession();
      const validToken = cookie.slice(`${REFRESH_COOKIE_NAME}=`.length);
      const [header, payload] = validToken.split('.');
      const corrupted = `${header}.${payload}x.assinatura-invalida`;

      const corruptedResponse = await post(AUTH_ROUTES.refresh).set('Cookie', [
        `${REFRESH_COOKIE_NAME}=${corrupted}`,
      ]);
      expect(corruptedResponse.status).toBe(401);

      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      const expired = jwt.sign({}, env.JWT_REFRESH_SECRET, {
        subject: user.id,
        jwtid: 'expirado',
        expiresIn: -10,
      });
      const expiredResponse = await post(AUTH_ROUTES.refresh).set('Cookie', [
        `${REFRESH_COOKIE_NAME}=${expired}`,
      ]);
      expect(expiredResponse.status).toBe(401);
      expect(expiredResponse.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('CA-F1-14: logout revoga o refresh, limpa o cookie e é idempotente', async () => {
      const { cookie } = await registerAndGetSession();

      const logout = await post(AUTH_ROUTES.logout).set('Cookie', [cookie]);

      expect(logout.status).toBe(204);
      expect(refreshTokenValue(logout)).toBe('');
      expect(refreshCookieAttributes(logout)).toMatch(/Expires=Thu, 01 Jan 1970/);

      const afterLogout = await post(AUTH_ROUTES.refresh).set('Cookie', [cookie]);
      expect(afterLogout.status).toBe(401);

      const logoutAgain = await post(AUTH_ROUTES.logout).set('Cookie', [cookie]);
      expect(logoutAgain.status).toBe(204);

      const logoutWithoutCookie = await post(AUTH_ROUTES.logout);
      expect(logoutWithoutCookie.status).toBe(204);
    });

    it('CA-F1-15: access token expirado retorna 401 UNAUTHENTICATED em rota protegida', async () => {
      const { accessToken } = await registerAndGetSession();

      vi.useFakeTimers({ toFake: ['Date'] });

      try {
        vi.setSystemTime(new Date(Date.now() + 16 * 60 * 1000));

        const response = await get(AUTH_ROUTES.me).set('Authorization', `Bearer ${accessToken}`);

        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('autorização', () => {
    it('CA-F1-16: rota protegida sem token ou com token adulterado retorna 401', async () => {
      const withoutToken = await get(AUTH_ROUTES.me);
      expect(withoutToken.status).toBe(401);
      expect(withoutToken.body.error.code).toBe('UNAUTHENTICATED');

      const tampered = await get(AUTH_ROUTES.me).set('Authorization', 'Bearer token-invalido');
      expect(tampered.status).toBe(401);
      expect(tampered.body.error.code).toBe('UNAUTHENTICATED');

      const { accessToken } = await registerAndGetSession();
      const [header, payload] = accessToken.split('.');
      const forged = `${header}.${payload}.assinatura-falsa`;

      const forgedResponse = await get(AUTH_ROUTES.me).set('Authorization', `Bearer ${forged}`);
      expect(forgedResponse.status).toBe(401);
    });

    it('CA-F1-17: PLAYER recebe 403 em rota de ADMIN e ADMIN acessa rotas de PLAYER e ADMIN', async () => {
      await createTestUser({ username: 'jogador_comum', password: VALID_PASSWORD });
      await createTestUser({
        username: 'admin_geral',
        email: 'admin@example.com',
        password: VALID_PASSWORD,
        role: 'ADMIN',
      });

      const playerLogin = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_comum',
        password: VALID_PASSWORD,
      });
      const adminLogin = await post(AUTH_ROUTES.login, {
        identifier: 'admin_geral',
        password: VALID_PASSWORD,
      });

      const playerOnAdmin = await get('/test/admin').set(
        'Authorization',
        `Bearer ${playerLogin.body.accessToken}`,
      );
      expect(playerOnAdmin.status).toBe(403);
      expect(playerOnAdmin.body.error.code).toBe('FORBIDDEN');

      const adminOnAdmin = await get('/test/admin').set(
        'Authorization',
        `Bearer ${adminLogin.body.accessToken}`,
      );
      expect(adminOnAdmin.status).toBe(200);
      expect(adminOnAdmin.body.user.role).toBe('ADMIN');

      // Hierarquia: ADMIN satisfaz requireRole('PLAYER').
      const adminOnPlayer = await get('/test/player').set(
        'Authorization',
        `Bearer ${adminLogin.body.accessToken}`,
      );
      expect(adminOnPlayer.status).toBe(200);

      const playerOnPlayer = await get('/test/player').set(
        'Authorization',
        `Bearer ${playerLogin.body.accessToken}`,
      );
      expect(playerOnPlayer.status).toBe(200);
    });

    it('CA-F1-18: suspensão e mudança de papel têm efeito na requisição seguinte', async () => {
      await createTestUser({ username: 'mutavel_01', password: VALID_PASSWORD });

      const login = await post(AUTH_ROUTES.login, {
        identifier: 'mutavel_01',
        password: VALID_PASSWORD,
      });
      const accessToken = login.body.accessToken as string;
      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'mutavel_01' } });

      const beforeSuspension = await get('/test/player').set(
        'Authorization',
        `Bearer ${accessToken}`,
      );
      expect(beforeSuspension.status).toBe(200);

      await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });

      const suspended = await get('/test/player').set('Authorization', `Bearer ${accessToken}`);
      expect(suspended.status).toBe(403);
      expect(suspended.body.error.code).toBe('ACCOUNT_SUSPENDED');

      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', role: 'ADMIN' },
      });

      const promoted = await get('/test/admin').set('Authorization', `Bearer ${accessToken}`);
      expect(promoted.status).toBe(200);
    });

    it('CA-F1-19: optionalAuthenticate trata anônimo, token válido e token inválido', async () => {
      const anonymous = await get('/test/optional');
      expect(anonymous.status).toBe(200);
      expect(anonymous.body.user).toBeNull();

      const { accessToken } = await registerAndGetSession();

      const authenticated = await get('/test/optional').set(
        'Authorization',
        `Bearer ${accessToken}`,
      );
      expect(authenticated.status).toBe(200);
      expect(authenticated.body.user.username).toBe('jogador_01');
      expect(authenticated.body.user).not.toHaveProperty('passwordHash');

      const invalid = await get('/test/optional').set('Authorization', 'Bearer invalido');
      expect(invalid.status).toBe(401);
      expect(invalid.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('CA-F1-20: GET /auth/me retorna os dados da conta e 401 sem token', async () => {
      const { accessToken } = await registerAndGetSession();

      const response = await get(AUTH_ROUTES.me).set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(meResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toMatchObject({
        username: 'jogador_01',
        email: 'jogador@example.com',
        role: 'PLAYER',
        status: 'ACTIVE',
      });
      expect(response.body).not.toHaveProperty('passwordHash');

      const anonymous = await get(AUTH_ROUTES.me);
      expect(anonymous.status).toBe(401);
    });
  });

  describe('convenções e configuração', () => {
    it('CA-F1-21: respostas de erro seguem o formato padrão e 500 não expõe stack trace', async () => {
      await registerAndGetSession();

      const errorResponses = [
        await post(AUTH_ROUTES.register, validRegistration({ username: 'ab' })),
        await post(AUTH_ROUTES.login, { identifier: 'ninguem', password: 'senhaErrada1' }),
        await get('/test/admin').set('Authorization', 'Bearer invalido'),
        await get('/rota-inexistente'),
        await post(AUTH_ROUTES.register, validRegistration()),
      ];

      for (const response of errorResponses) {
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
      }

      expect(errorResponses.map((response) => response.body.error.code)).toEqual([
        'VALIDATION_ERROR',
        'INVALID_CREDENTIALS',
        'UNAUTHENTICATED',
        'NOT_FOUND',
        'USERNAME_TAKEN',
      ]);

      const internal = await get('/test/boom');

      expect(internal.status).toBe(500);
      expect(apiErrorSchema.safeParse(internal.body).success).toBe(true);
      expect(internal.body.error.code).toBe(ERROR_CODES.internal);
      expect(internal.body.error.message).toBe('Erro interno do servidor');
      expect(JSON.stringify(internal.body)).not.toContain('falha proposital');
      expect(JSON.stringify(internal.body)).not.toContain('stack');
    });

    it('AUD-02: validação e JSON inválido respondem mensagens em pt-BR', async () => {
      const missingFields = await post(AUTH_ROUTES.login, {});

      expect(missingFields.status).toBe(400);
      expect(missingFields.body.error.code).toBe('VALIDATION_ERROR');

      const validationMessages = (missingFields.body.error.details as { message: string }[])
        .map((detail) => detail.message)
        .join(' | ');
      expect(validationMessages).toMatch(/esperava um texto/i);
      expect(validationMessages).not.toMatch(/invalid input|expected string/i);

      const malformed = await request(app.server)
        .post(testPath(AUTH_ROUTES.login))
        .set('Content-Type', 'application/json')
        .send('{"identifier":');

      expect(malformed.status).toBe(400);
      expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
      expect(malformed.body.error.message).toBe('Corpo da requisição não é um JSON válido');
    });
  });
});
