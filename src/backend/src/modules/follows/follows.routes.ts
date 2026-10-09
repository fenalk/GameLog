import {
  FOLLOW_ROUTES,
  apiErrorSchema,
  followPageSchema,
  followQuerySchema,
  followStateSchema,
  profileUsernameParamsSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { apiErrors } from '../../lib/api-error.js';
import type { AuthUser } from '../../lib/auth-user.js';
import { follow, listFollowers, listFollowing, unfollow } from './follows.service.js';

function authenticated(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  return request.user;
}

/**
 * Seguimento entre jogadores (SPEC F12, seção 3): seguir e deixar de seguir os próprios
 * vínculos (autenticados) e as leituras públicas de seguidores e seguindo. Reutiliza a
 * autenticação e o formato de erro da F1, o parâmetro `:username` da F2 e a paginação da
 * F3. O papel não bloqueia as rotas `/me/following*` (RN-F12-01).
 */
export const followsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    FOLLOW_ROUTES.followers,
    {
      preHandler: [app.optionalAuthenticate],
      schema: {
        tags: ['follows'],
        summary: 'Lista quem segue um jogador',
        description:
          'Acesso público, sem autenticação e inclusive para contas suspensas. O username ignora maiúsculas/minúsculas e inexistente responde 404. Com sessão, cada item traz isFollowedByMe; a resposta nunca expõe e-mail, papel ou hash de senha.',
        params: profileUsernameParamsSchema,
        querystring: followQuerySchema,
        response: {
          200: followPageSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(
        await listFollowers(request.params.username, request.user?.id ?? null, request.query),
      ),
  );

  app.get(
    FOLLOW_ROUTES.following,
    {
      preHandler: [app.optionalAuthenticate],
      schema: {
        tags: ['follows'],
        summary: 'Lista quem um jogador segue',
        description:
          'Acesso público, sem autenticação e inclusive para contas suspensas. O username ignora maiúsculas/minúsculas e inexistente responde 404. Com sessão, cada item traz isFollowedByMe; a resposta nunca expõe e-mail, papel ou hash de senha.',
        params: profileUsernameParamsSchema,
        querystring: followQuerySchema,
        response: {
          200: followPageSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(
        await listFollowing(request.params.username, request.user?.id ?? null, request.query),
      ),
  );

  app.put(
    FOLLOW_ROUTES.myFollowing,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['follows'],
        summary: 'Segue um jogador',
        description:
          'Responde 201 ao criar o vínculo e 200 quando ele já existia (idempotente, preservando o followedAt original). Seguir a si mesmo responde 409 CANNOT_FOLLOW_SELF e ultrapassar o limite de seguidos responde 409 FOLLOW_LIMIT_REACHED.',
        params: profileUsernameParamsSchema,
        response: {
          200: followStateSchema,
          201: followStateSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await follow(authenticated(request).id, request.params.username);

      return reply.status(result.created ? 201 : 200).send(result.state);
    },
  );

  app.delete(
    FOLLOW_ROUTES.myFollowing,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['follows'],
        summary: 'Deixa de seguir um jogador',
        description: 'Responde 204; quando não havia vínculo, responde 404 NOT_FOUND.',
        params: profileUsernameParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await unfollow(authenticated(request).id, request.params.username);

      return reply.status(204).send(null);
    },
  );
};
