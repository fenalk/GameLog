import {
  AUTH_ROUTES,
  PROFILE_ROUTES,
  apiErrorSchema,
  ownProfileSchema,
  passwordChangeResponseSchema,
  publicProfilePath,
  publicProfileSchema,
} from '@gamelog/shared';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { hashRefreshTokenJti } from '../../src/backend/src/lib/tokens.js';
import { buildTestApp, testPath, type App } from '../helpers/app.js';
import { refreshCookiePair, refreshTokenValue } from '../helpers/cookies.js';
import { createTestUser, disconnectDatabase, prisma, resetDatabase } from '../helpers/db.js';

const VALID_PASSWORD = 'senhaForte1';
const NEW_PASSWORD = 'outraSenha2';

function validRegistration(overrides: Record<string, unknown> = {}) {
  return {
    username: 'jogador_01',
    email: 'jogador@example.com',
    password: VALID_PASSWORD,
    ...overrides,
  };
}

/** `jti` em claro de um refresh token (para conferir a revogação no banco). */
function jtiFromToken(token: string): string {
  return (jwt.decode(token) as { jti: string }).jti;
}

describe('SPEC F2 — gerenciamento de perfil (API REST)', () => {
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

  function patch(path: string, body: unknown, token?: string) {
    const call = request(app.server).patch(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function remove(path: string, body: unknown, token?: string) {
    const call = request(app.server).delete(testPath(path)).send(body);

    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function registerAndGetSession(body = validRegistration()) {
    const response = await post(AUTH_ROUTES.register, body);

    expect(response.status).toBe(201);

    return {
      response,
      accessToken: response.body.accessToken as string,
      cookie: refreshCookiePair(response) as string,
      token: refreshTokenValue(response) as string,
    };
  }

  describe('perfil público', () => {
    it('CA-F2-01: GET /users/:username retorna 200 sem autenticação e sem dados privados', async () => {
      await registerAndGetSession();

      const response = await get(publicProfilePath('jogador_01'));

      expect(response.status).toBe(200);
      expect(publicProfileSchema.safeParse(response.body).success).toBe(true);
      expect(response.body).toEqual({
        username: 'jogador_01',
        displayName: 'jogador_01',
        bio: null,
        avatarUrl: null,
        createdAt: expect.any(String),
      });
      expect(response.body).not.toHaveProperty('email');
      expect(response.body).not.toHaveProperty('role');
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toContain('@example.com');
      expect(JSON.stringify(response.body)).not.toContain('$argon2id$');
    });

    it('CA-F2-02: a busca ignora maiúsculas/minúsculas e username inexistente retorna 404 NOT_FOUND', async () => {
      await registerAndGetSession();

      const upperCase = await get(publicProfilePath('JOGADOR_01'));

      expect(upperCase.status).toBe(200);
      expect(upperCase.body.username).toBe('jogador_01');

      const missing = await get(publicProfilePath('ninguem_aqui'));

      expect(missing.status).toBe(404);
      expect(missing.body.error.code).toBe('NOT_FOUND');
      expect(apiErrorSchema.safeParse(missing.body).success).toBe(true);
    });

    it('CA-F2-03: o perfil de uma conta SUSPENDED continua retornando 200', async () => {
      await registerAndGetSession();
      await prisma.user.update({
        where: { username: 'jogador_01' },
        data: { status: 'SUSPENDED' },
      });

      const response = await get(publicProfilePath('jogador_01'));

      expect(response.status).toBe(200);
      expect(response.body.username).toBe('jogador_01');
    });

    it('CA-F2-04: recém-cadastrado tem displayName igual ao username e bio/avatarUrl nulos', async () => {
      const { accessToken } = await registerAndGetSession();

      const publicProfile = await get(publicProfilePath('jogador_01'));
      const ownProfile = await get(PROFILE_ROUTES.myProfile).set(
        'Authorization',
        `Bearer ${accessToken}`,
      );

      for (const response of [publicProfile, ownProfile]) {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          displayName: 'jogador_01',
          bio: null,
          avatarUrl: null,
        });
      }

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.displayName).toBeNull();
      expect(stored.bio).toBeNull();
      expect(stored.avatarUrl).toBeNull();
    });
  });

  describe('edição de perfil', () => {
    it('CA-F2-05: PATCH /me/profile atualiza apenas os campos enviados', async () => {
      const { accessToken } = await registerAndGetSession();

      const first = await patch(
        PROFILE_ROUTES.myProfile,
        { displayName: 'Maria', bio: 'Bio inicial' },
        accessToken,
      );

      expect(first.status).toBe(200);
      expect(first.body).toMatchObject({
        displayName: 'Maria',
        bio: 'Bio inicial',
        avatarUrl: null,
      });

      // `avatarUrl` omitido antes continua nulo; agora só o avatar muda.
      const second = await patch(
        PROFILE_ROUTES.myProfile,
        { avatarUrl: 'https://exemplo.com/avatar.png' },
        accessToken,
      );

      expect(second.status).toBe(200);
      expect(second.body).toMatchObject({
        displayName: 'Maria',
        bio: 'Bio inicial',
        avatarUrl: 'https://exemplo.com/avatar.png',
      });

      const publicProfile = await get(publicProfilePath('jogador_01'));
      expect(publicProfile.body).toMatchObject({
        displayName: 'Maria',
        bio: 'Bio inicial',
        avatarUrl: 'https://exemplo.com/avatar.png',
      });
    });

    it('CA-F2-06: null limpa bio/avatarUrl e displayName null restaura o username', async () => {
      const { accessToken } = await registerAndGetSession();

      await patch(
        PROFILE_ROUTES.myProfile,
        { displayName: 'Maria', bio: 'Bio', avatarUrl: 'https://exemplo.com/avatar.png' },
        accessToken,
      );

      const cleared = await patch(
        PROFILE_ROUTES.myProfile,
        { displayName: null, bio: null, avatarUrl: null },
        accessToken,
      );

      expect(cleared.status).toBe(200);
      expect(cleared.body).toMatchObject({
        username: 'jogador_01',
        displayName: 'jogador_01',
        bio: null,
        avatarUrl: null,
      });

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.displayName).toBeNull();
      expect(stored.bio).toBeNull();
      expect(stored.avatarUrl).toBeNull();

      const publicProfile = await get(publicProfilePath('jogador_01'));
      expect(publicProfile.body.displayName).toBe('jogador_01');
    });

    it('CA-F2-07: rejeita campos inválidos com 400 VALIDATION_ERROR sem persistir', async () => {
      const { accessToken } = await registerAndGetSession();

      const cases: { body: Record<string, unknown>; field: string }[] = [
        { body: { displayName: '' }, field: 'displayName' },
        { body: { displayName: '   ' }, field: 'displayName' },
        { body: { displayName: 'x'.repeat(51) }, field: 'displayName' },
        { body: { displayName: 'nome\u0007controlado' }, field: 'displayName' },
        { body: { bio: 'a'.repeat(301) }, field: 'bio' },
        { body: { avatarUrl: 'http://exemplo.com/avatar.png' }, field: 'avatarUrl' },
        { body: { avatarUrl: 'nao-e-url' }, field: 'avatarUrl' },
        { body: { username: 'novo_nome' }, field: 'username' },
      ];

      for (const testCase of cases) {
        const response = await patch(PROFILE_ROUTES.myProfile, testCase.body, accessToken);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(apiErrorSchema.safeParse(response.body).success).toBe(true);

        const fields = (response.body.error.details as { field: string }[]).map(
          (detail) => detail.field,
        );
        expect(fields).toContain(testCase.field);
      }

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.username).toBe('jogador_01');
      expect(stored.displayName).toBeNull();
      expect(stored.bio).toBeNull();
      expect(stored.avatarUrl).toBeNull();
    });

    it('CA-F2-08: todas as rotas /me/* retornam 401 sem token', async () => {
      const responses = [
        await get(PROFILE_ROUTES.myProfile),
        await patch(PROFILE_ROUTES.myProfile, { displayName: 'Maria' }),
        await patch(PROFILE_ROUTES.myEmail, {
          email: 'novo@example.com',
          currentPassword: VALID_PASSWORD,
        }),
        await patch(PROFILE_ROUTES.myPassword, {
          currentPassword: VALID_PASSWORD,
          newPassword: NEW_PASSWORD,
        }),
        await remove(PROFILE_ROUTES.myAccount, { password: VALID_PASSWORD }),
      ];

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHENTICATED');
      }
    });
  });

  describe('troca de e-mail', () => {
    it('CA-F2-09: troca com senha correta funciona e o login passa a aceitar o novo e-mail', async () => {
      const { accessToken } = await registerAndGetSession();

      const response = await patch(
        PROFILE_ROUTES.myEmail,
        { email: '  NOVO@Example.com ', currentPassword: VALID_PASSWORD },
        accessToken,
      );

      expect(response.status).toBe(200);
      expect(ownProfileSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.email).toBe('novo@example.com');

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.email).toBe('novo@example.com');

      const newEmailLogin = await post(AUTH_ROUTES.login, {
        identifier: 'novo@example.com',
        password: VALID_PASSWORD,
      });
      expect(newEmailLogin.status).toBe(200);

      const oldEmailLogin = await post(AUTH_ROUTES.login, {
        identifier: 'jogador@example.com',
        password: VALID_PASSWORD,
      });
      expect(oldEmailLogin.status).toBe(401);
    });

    it('CA-F2-10: senha errada, e-mail em uso e e-mail igual ao atual são rejeitados', async () => {
      const { accessToken } = await registerAndGetSession();

      const wrongPassword = await patch(
        PROFILE_ROUTES.myEmail,
        { email: 'novo@example.com', currentPassword: 'senhaErrada1' },
        accessToken,
      );
      expect(wrongPassword.status).toBe(400);
      expect(wrongPassword.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      await createTestUser({
        username: 'outro_usuario',
        email: 'ocupado@example.com',
        password: VALID_PASSWORD,
      });

      const taken = await patch(
        PROFILE_ROUTES.myEmail,
        { email: 'OCUPADO@example.com', currentPassword: VALID_PASSWORD },
        accessToken,
      );
      expect(taken.status).toBe(409);
      expect(taken.body.error.code).toBe('EMAIL_TAKEN');

      const sameEmail = await patch(
        PROFILE_ROUTES.myEmail,
        { email: 'jogador@example.com', currentPassword: VALID_PASSWORD },
        accessToken,
      );
      expect(sameEmail.status).toBe(400);

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.email).toBe('jogador@example.com');
    });
  });

  describe('troca de senha', () => {
    it('CA-F2-11: troca válida invalida a senha antiga, revoga os refresh tokens e emite novo par', async () => {
      const { accessToken, cookie, token } = await registerAndGetSession();
      const secondLogin = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });
      const secondToken = refreshTokenValue(secondLogin) as string;

      const response = await patch(
        PROFILE_ROUTES.myPassword,
        { currentPassword: VALID_PASSWORD, newPassword: NEW_PASSWORD },
        accessToken,
      );

      expect(response.status).toBe(200);
      expect(passwordChangeResponseSchema.safeParse(response.body).success).toBe(true);
      expect(response.body.accessToken).toBeTypeOf('string');

      const newCookie = refreshCookiePair(response) as string;
      const newToken = refreshTokenValue(response) as string;
      expect(newCookie).toBeTruthy();
      expect(JSON.stringify(response.body)).not.toContain(newToken);

      // Os dois refresh tokens anteriores ficam revogados no banco.
      for (const oldToken of [token, secondToken]) {
        const stored = await prisma.refreshToken.findUniqueOrThrow({
          where: { jtiHash: hashRefreshTokenJti(jtiFromToken(oldToken)) },
        });
        expect(stored.revokedAt).not.toBeNull();
      }

      const oldPasswordLogin = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });
      expect(oldPasswordLogin.status).toBe(401);

      const newPasswordLogin = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: NEW_PASSWORD,
      });
      expect(newPasswordLogin.status).toBe(200);

      // O novo cookie da sessão atual continua válido; os antigos, não.
      const currentRefresh = await post(AUTH_ROUTES.refresh).set('Cookie', [newCookie]);
      expect(currentRefresh.status).toBe(200);

      const oldRefresh = await post(AUTH_ROUTES.refresh).set('Cookie', [cookie]);
      expect(oldRefresh.status).toBe(401);
    });

    it('CA-F2-12: nova senha fora da política ou igual à atual retorna 400 VALIDATION_ERROR', async () => {
      const { accessToken } = await registerAndGetSession();

      for (const newPassword of ['curta1', 'somenteletras', '12345678']) {
        const response = await patch(
          PROFILE_ROUTES.myPassword,
          { currentPassword: VALID_PASSWORD, newPassword },
          accessToken,
        );

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_ERROR');

        const fields = (response.body.error.details as { field: string }[]).map(
          (detail) => detail.field,
        );
        expect(fields).toContain('newPassword');
      }

      const sameAsCurrent = await patch(
        PROFILE_ROUTES.myPassword,
        { currentPassword: VALID_PASSWORD, newPassword: VALID_PASSWORD },
        accessToken,
      );
      expect(sameAsCurrent.status).toBe(400);
      expect(sameAsCurrent.body.error.code).toBe('VALIDATION_ERROR');

      const fields = (sameAsCurrent.body.error.details as { field: string }[]).map(
        (detail) => detail.field,
      );
      expect(fields).toContain('newPassword');

      const login = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });
      expect(login.status).toBe(200);
    });

    it('CA-F2-13: cinco senhas atuais incorretas nas rotas sensíveis resultam em 429', async () => {
      const { accessToken } = await registerAndGetSession();

      // O contador é compartilhado pelas operações sensíveis, por usuário (RN-F2-08).
      const attempts = [
        {
          path: PROFILE_ROUTES.myEmail,
          body: { email: 'novo@example.com', currentPassword: 'senhaErrada1' },
        },
        {
          path: PROFILE_ROUTES.myEmail,
          body: { email: 'novo@example.com', currentPassword: 'senhaErrada2' },
        },
        {
          path: PROFILE_ROUTES.myEmail,
          body: { email: 'novo@example.com', currentPassword: 'senhaErrada3' },
        },
        {
          path: PROFILE_ROUTES.myPassword,
          body: { currentPassword: 'senhaErrada4', newPassword: NEW_PASSWORD },
        },
        {
          path: PROFILE_ROUTES.myPassword,
          body: { currentPassword: 'senhaErrada5', newPassword: NEW_PASSWORD },
        },
      ];

      for (const attempt of attempts) {
        const response = await patch(attempt.path, attempt.body, accessToken);

        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
      }

      const blocked = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        accessToken,
      );

      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('RATE_LIMITED');
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

      const stored = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      expect(stored.email).toBe('jogador@example.com');
    });
  });

  describe('exclusão de conta', () => {
    it('CA-F2-14: DELETE /me com senha correta retorna 204, revoga os tokens e remove a conta', async () => {
      const { accessToken } = await registerAndGetSession();

      const response = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        accessToken,
      );

      expect(response.status).toBe(204);
      expect(refreshTokenValue(response)).toBe('');

      expect(await prisma.user.count()).toBe(0);
      expect(await prisma.refreshToken.count()).toBe(0);

      const login = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });
      expect(login.status).toBe(401);

      const publicProfile = await get(publicProfilePath('jogador_01'));
      expect(publicProfile.status).toBe(404);
    });

    it('CA-F2-15: DELETE /me com senha errada retorna 400 e a conta permanece', async () => {
      const { accessToken } = await registerAndGetSession();

      const response = await remove(
        PROFILE_ROUTES.myAccount,
        { password: 'senhaErrada1' },
        accessToken,
      );

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_CURRENT_PASSWORD');

      expect(await prisma.user.count()).toBe(1);

      const login = await post(AUTH_ROUTES.login, {
        identifier: 'jogador_01',
        password: VALID_PASSWORD,
      });
      expect(login.status).toBe(200);
    });

    it('CA-F2-16: o último ADMIN ativo recebe 409 LAST_ADMIN; havendo outro, a exclusão é permitida', async () => {
      await createTestUser({
        username: 'admin_um',
        email: 'admin1@example.com',
        password: VALID_PASSWORD,
        role: 'ADMIN',
      });
      // Um ADMIN suspenso não conta como administrador ativo (RN-F2-07).
      await createTestUser({
        username: 'admin_suspenso',
        email: 'suspenso@example.com',
        password: VALID_PASSWORD,
        role: 'ADMIN',
        status: 'SUSPENDED',
      });

      const login = await post(AUTH_ROUTES.login, {
        identifier: 'admin_um',
        password: VALID_PASSWORD,
      });
      const accessToken = login.body.accessToken as string;

      const lastAdmin = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        accessToken,
      );
      expect(lastAdmin.status).toBe(409);
      expect(lastAdmin.body.error.code).toBe('LAST_ADMIN');
      expect(await prisma.user.count({ where: { username: 'admin_um' } })).toBe(1);

      await createTestUser({
        username: 'admin_dois',
        email: 'admin2@example.com',
        password: VALID_PASSWORD,
        role: 'ADMIN',
      });

      const allowed = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        accessToken,
      );
      expect(allowed.status).toBe(204);
      expect(await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })).toBe(1);

      const lastLogin = await post(AUTH_ROUTES.login, {
        identifier: 'admin_dois',
        password: VALID_PASSWORD,
      });
      const lastBlocked = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        lastLogin.body.accessToken as string,
      );
      expect(lastBlocked.status).toBe(409);
      expect(lastBlocked.body.error.code).toBe('LAST_ADMIN');
    });

    it('CA-F2-17: a exclusão remove em cascata os dados do usuário (refresh tokens)', async () => {
      const { accessToken } = await registerAndGetSession();
      await post(AUTH_ROUTES.login, { identifier: 'jogador_01', password: VALID_PASSWORD });

      const user = await prisma.user.findUniqueOrThrow({ where: { username: 'jogador_01' } });
      const tokensBefore = await prisma.refreshToken.count({ where: { userId: user.id } });
      expect(tokensBefore).toBeGreaterThan(1);

      const response = await remove(
        PROFILE_ROUTES.myAccount,
        { password: VALID_PASSWORD },
        accessToken,
      );
      expect(response.status).toBe(204);

      expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.user.count({ where: { id: user.id } })).toBe(0);
    });
  });
});
