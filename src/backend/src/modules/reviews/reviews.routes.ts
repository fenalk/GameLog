import {
  REVIEW_ROUTES,
  apiErrorSchema,
  reviewDetailSchema,
  reviewGameParamsSchema,
  reviewIdParamsSchema,
  reviewInputSchema,
  reviewPageSchema,
  reviewQuerySchema,
  reviewUpdateSchema,
  reviewUserParamsSchema,
} from '@gamelog/shared';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { apiErrors } from '../../lib/api-error.js';
import type { AuthUser } from '../../lib/auth-user.js';
import {
  deleteOwnReview,
  getOwnReview,
  getReviewDetail,
  listGameReviews,
  listOwnReviews,
  listPublicReviews,
  patchOwnReview,
  putOwnReview,
} from './reviews.service.js';

function authenticated(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  return request.user;
}

/**
 * Resenhas (SPEC F10, seção 3): escrita e gerenciamento das próprias resenhas
 * (autenticados) e leituras públicas por jogo, perfil e permalink, reutilizando a
 * autenticação e o formato de erro da F1. O papel não bloqueia as rotas `/me/reviews*`
 * (RN-F10-18): o `ADMIN` gerencia a própria resenha normalmente.
 */
export const reviewsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    REVIEW_ROUTES.gameReviews,
    {
      schema: {
        tags: ['reviews'],
        summary: 'Lista as resenhas públicas de um jogo',
        description:
          'Acesso público. Aceita o slug ou o id do jogo, retorna apenas resenhas PUBLISHED, no formato { data, meta } da F3, com as ordenações recently_created (padrão), recently_updated e game_title. Jogo inexistente responde 404.',
        params: reviewGameParamsSchema,
        querystring: reviewQuerySchema,
        response: {
          200: reviewPageSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => reply.send(await listGameReviews(request.params.game, request.query)),
  );

  app.get(
    REVIEW_ROUTES.userReviews,
    {
      schema: {
        tags: ['reviews'],
        summary: 'Lista as resenhas públicas de um jogador',
        description:
          'Acesso público, sem autenticação e inclusive para contas suspensas. Retorna apenas resenhas PUBLISHED. O username ignora maiúsculas/minúsculas, inexistente responde 404 e a resposta nunca expõe e-mail, papel ou hash de senha do autor.',
        params: reviewUserParamsSchema,
        querystring: reviewQuerySchema,
        response: {
          200: reviewPageSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listPublicReviews(request.params.username, request.query)),
  );

  app.get(
    REVIEW_ROUTES.detail,
    {
      preHandler: [app.optionalAuthenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Detalhe (permalink) de uma resenha',
        description:
          'Resenha PUBLISHED é pública. Uma resenha HIDDEN/REMOVED só é retornada para o próprio autor autenticado; para os demais, inexistente ou não publicada responde 404. Retorna o corpo completo.',
        params: reviewIdParamsSchema,
        response: {
          200: reviewDetailSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await getReviewDetail(request.params.id, request.user?.id ?? null)),
  );

  app.get(
    REVIEW_ROUTES.myReviews,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Lista as próprias resenhas',
        description:
          'Resenhas do usuário autenticado, incluindo HIDDEN e REMOVED, com o status em cada item, no formato { data, meta } e com as mesmas ordenações das listagens públicas.',
        querystring: reviewQuerySchema,
        response: {
          200: reviewPageSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listOwnReviews(authenticated(request).id, request.query)),
  );

  app.get(
    REVIEW_ROUTES.myReview,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Consulta a própria resenha de um jogo',
        description:
          'Aceita o slug ou o id do jogo. Retorna a resenha do usuário autenticado (com o corpo completo e o status), ou 404 quando não há resenha (ou o jogo não existe).',
        params: reviewGameParamsSchema,
        response: {
          200: reviewDetailSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await getOwnReview(authenticated(request).id, request.params.game)),
  );

  app.put(
    REVIEW_ROUTES.myReview,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Cria ou substitui a própria resenha de um jogo',
        description:
          'Substituição completa (título e corpo). Retorna 201 na criação e 200 na substituição, sempre sem duplicar a resenha do par jogador↔jogo.',
        params: reviewGameParamsSchema,
        body: reviewInputSchema,
        response: {
          200: reviewDetailSchema,
          201: reviewDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { review, created } = await putOwnReview(
        authenticated(request).id,
        request.params.game,
        request.body,
      );

      return reply.status(created ? 201 : 200).send(review);
    },
  );

  app.patch(
    REVIEW_ROUTES.myReview,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Edita parcialmente a própria resenha de um jogo',
        description:
          'Campo omitido não muda; um corpo sem nenhum campo é inválido. Sem resenha existente responde 404 e, quando nada muda, retorna 200 sem alterar updatedAt.',
        params: reviewGameParamsSchema,
        body: reviewUpdateSchema,
        response: {
          200: reviewDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(
        await patchOwnReview(authenticated(request).id, request.params.game, request.body),
      ),
  );

  app.delete(
    REVIEW_ROUTES.myReview,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['reviews'],
        summary: 'Remove a própria resenha de um jogo',
        description:
          'Responde 204 e a resenha some das listagens; sem resenha existente responde 404.',
        params: reviewGameParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteOwnReview(authenticated(request).id, request.params.game);

      return reply.status(204).send(null);
    },
  );
};
