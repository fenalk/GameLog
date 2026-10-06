import {
  AUTH_ROUTES,
  REFRESH_COOKIE_NAME,
  apiErrorSchema,
  authResponseSchema,
  loginSchema,
  meResponseSchema,
  registerSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { apiErrors } from '../../lib/api-error.js';
import { clearRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import { prisma } from '../../lib/prisma.js';
import { loginUser, registerUser, revokeRefreshToken, rotateRefreshToken } from './auth.service.js';

/**
 * Módulo de identidade e acesso (SPEC F1): cadastro, login, refresh com rotação, logout
 * e usuário autenticado. O refresh token trafega exclusivamente no cookie
 * `refresh_token` (RN-F1-09).
 */
export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  const loginAttempts = app.attemptLimiter;

  app.post(
    AUTH_ROUTES.register,
    {
      schema: {
        tags: ['auth'],
        summary: 'Cadastra um novo usuário',
        description:
          'Cria uma conta com papel PLAYER e status ACTIVE, emite o access token e entrega o refresh token em cookie HttpOnly.',
        body: registerSchema,
        response: {
          201: authResponseSchema,
          400: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await registerUser(request.body);
      setRefreshCookie(reply, session.refreshToken);

      return reply.status(201).send({ accessToken: session.accessToken, user: session.user });
    },
  );

  app.post(
    AUTH_ROUTES.login,
    {
      schema: {
        tags: ['auth'],
        summary: 'Entra com e-mail ou nome de usuário',
        description:
          'Aceita e-mail ou username em `identifier`. Credenciais inválidas retornam sempre a mesma resposta (401 INVALID_CREDENTIALS).',
        body: loginSchema,
        response: {
          200: authResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { identifier } = request.body;
      const attemptKey = `${identifier}|${request.ip}`;
      const limit = loginAttempts.check(attemptKey);

      if (limit.blocked) {
        throw apiErrors.rateLimited(limit.retryAfterSeconds);
      }

      const result = await loginUser(request.body);

      if (result.outcome === 'invalid-credentials') {
        loginAttempts.registerFailure(attemptKey);
        throw apiErrors.invalidCredentials();
      }

      if (result.outcome === 'suspended') {
        throw apiErrors.accountSuspended();
      }

      loginAttempts.reset(attemptKey);
      setRefreshCookie(reply, result.session.refreshToken);

      return reply.send({
        accessToken: result.session.accessToken,
        user: result.session.user,
      });
    },
  );

  app.post(
    AUTH_ROUTES.refresh,
    {
      schema: {
        tags: ['auth'],
        summary: 'Renova a sessão com rotação do refresh token',
        description:
          'Lê o cookie refresh_token, revoga o token usado e emite um novo par. Reuso de token revogado invalida todas as sessões do usuário.',
        response: {
          200: authResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await rotateRefreshToken(request.cookies[REFRESH_COOKIE_NAME]);
      setRefreshCookie(reply, session.refreshToken);

      return reply.send({ accessToken: session.accessToken, user: session.user });
    },
  );

  app.post(
    AUTH_ROUTES.logout,
    {
      schema: {
        tags: ['auth'],
        summary: 'Encerra a sessão atual',
        description: 'Revoga o refresh token atual e limpa o cookie. Idempotente: sempre 204.',
      },
    },
    async (request, reply) => {
      await revokeRefreshToken(request.cookies[REFRESH_COOKIE_NAME]);
      clearRefreshCookie(reply);

      return reply.status(204).send();
    },
  );

  app.get(
    AUTH_ROUTES.me,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['auth'],
        summary: 'Dados da conta autenticada',
        description: 'Retorna id, username, email, role e status do usuário do access token.',
        response: {
          200: meResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const authenticated = request.user;

      if (!authenticated) {
        throw apiErrors.unauthenticated('Token de acesso ausente');
      }

      const user = await prisma.user.findUnique({
        where: { id: authenticated.id },
        select: { id: true, username: true, email: true, role: true, status: true },
      });

      if (!user) {
        throw apiErrors.unauthenticated('Token de acesso inválido ou expirado');
      }

      return reply.send(user);
    },
  );
};
