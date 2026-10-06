import {
  ERROR_CODES,
  PROFILE_ROUTES,
  accountDeleteSchema,
  apiErrorSchema,
  emailChangeSchema,
  ownProfileSchema,
  passwordChangeResponseSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  profileUsernameParamsSchema,
  publicProfileSchema,
} from '@gamelog/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { ApiException, apiErrors } from '../../lib/api-error.js';
import type { AuthUser } from '../../lib/auth-user.js';
import { clearRefreshCookie, setRefreshCookie } from '../../lib/cookies.js';
import {
  changeEmail,
  changePassword,
  deleteAccount,
  getOwnProfile,
  getPublicProfileByUsername,
  updateOwnProfile,
} from './profile.service.js';

const SENSITIVE_OPERATION_RATE_LIMIT_MESSAGE =
  'Muitas tentativas com a senha atual. Aguarde antes de tentar novamente.';

function authenticatedUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  return request.user;
}

function sensitiveAttemptKey(userId: string): string {
  return `sensitive:${userId}`;
}

/**
 * Executa uma operação sensível (e-mail, senha ou exclusão) sob o limitador
 * compartilhado da F1 (RN-F2-08): a senha atual incorreta conta como falha por usuário
 * e o sucesso zera o contador.
 */
async function runSensitiveOperation<T>(
  app: FastifyInstance,
  request: FastifyRequest,
  operation: () => Promise<T>,
): Promise<T> {
  const key = sensitiveAttemptKey(authenticatedUser(request).id);
  const limit = app.attemptLimiter.check(key);

  if (limit.blocked) {
    throw apiErrors.rateLimited(limit.retryAfterSeconds, SENSITIVE_OPERATION_RATE_LIMIT_MESSAGE);
  }

  try {
    const result = await operation();
    app.attemptLimiter.reset(key);

    return result;
  } catch (error) {
    if (error instanceof ApiException && error.code === ERROR_CODES.invalidCurrentPassword) {
      app.attemptLimiter.registerFailure(key);
    }

    throw error;
  }
}

/**
 * Módulo de perfil (SPEC F2): perfil público por `username`, perfil próprio e as
 * operações sensíveis da conta (e-mail, senha e exclusão). Reutiliza a autenticação, o
 * formato de erro e os tokens da F1.
 */
export const profileRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    PROFILE_ROUTES.publicProfile,
    {
      preHandler: [app.optionalAuthenticate],
      schema: {
        tags: ['profile'],
        summary: 'Perfil público de um jogador',
        description:
          'Retorna username, displayName, bio, avatarUrl e createdAt. Nunca expõe e-mail, papel ou hash de senha. A busca ignora maiúsculas/minúsculas.',
        params: profileUsernameParamsSchema,
        response: {
          200: publicProfileSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const profile = await getPublicProfileByUsername(request.params.username);

      return reply.send(profile);
    },
  );

  app.get(
    PROFILE_ROUTES.myProfile,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['profile'],
        summary: 'Perfil da conta autenticada',
        description: 'Além dos campos públicos, inclui id, email e role do próprio usuário.',
        response: {
          200: ownProfileSchema,
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const profile = await getOwnProfile(authenticatedUser(request).id);

      return reply.send(profile);
    },
  );

  app.patch(
    PROFILE_ROUTES.myProfile,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['profile'],
        summary: 'Atualiza o próprio perfil (edição parcial)',
        description:
          'Campo omitido permanece igual; null limpa bio/avatarUrl e restaura o username em displayName.',
        body: profileUpdateSchema,
        response: {
          200: ownProfileSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const profile = await updateOwnProfile(authenticatedUser(request).id, request.body);

      return reply.send(profile);
    },
  );

  app.patch(
    PROFILE_ROUTES.myEmail,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['profile'],
        summary: 'Troca o e-mail da conta',
        description:
          'Exige a senha atual; o novo e-mail segue as regras da F1, deve ser único e diferente do atual.',
        body: emailChangeSchema,
        response: {
          200: ownProfileSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          409: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const profile = await runSensitiveOperation(app, request, () =>
        changeEmail(authenticatedUser(request).id, request.body),
      );

      return reply.send(profile);
    },
  );

  app.patch(
    PROFILE_ROUTES.myPassword,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['profile'],
        summary: 'Troca a senha da conta',
        description:
          'Exige a senha atual e a nova segundo a política da F1. Todos os refresh tokens são revogados e um novo par é emitido para a sessão atual.',
        body: passwordChangeSchema,
        response: {
          200: passwordChangeResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await runSensitiveOperation(app, request, () =>
        changePassword(authenticatedUser(request).id, request.body),
      );

      setRefreshCookie(reply, session.refreshToken);

      return reply.send({ accessToken: session.accessToken });
    },
  );

  app.delete(
    PROFILE_ROUTES.myAccount,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['profile'],
        summary: 'Exclui a própria conta',
        description:
          'Exige a senha, é irreversível e remove os dados em cascata. O último administrador ativo não pode se excluir.',
        body: accountDeleteSchema,
        response: {
          204: z.null(),
          400: apiErrorSchema,
          401: apiErrorSchema,
          409: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await runSensitiveOperation(app, request, () =>
        deleteAccount(authenticatedUser(request).id, request.body.password),
      );

      clearRefreshCookie(reply);

      return reply.status(204).send(null);
    },
  );
};
