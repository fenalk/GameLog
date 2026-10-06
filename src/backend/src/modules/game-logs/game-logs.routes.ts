import {
  GAME_LOG_ROUTES,
  apiErrorSchema,
  gameLogEntryInputSchema,
  gameLogEntrySchema,
  gameLogEntryUpdateSchema,
  gameLogGameParamsSchema,
  gameLogPageSchema,
  gameLogQuerySchema,
  gameLogUserParamsSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { apiErrors } from '../../lib/api-error.js';
import type { AuthUser } from '../../lib/auth-user.js';
import {
  deleteOwnEntry,
  getOwnEntry,
  listOwnDiary,
  listPublicDiary,
  patchOwnEntry,
  putOwnEntry,
} from './game-logs.service.js';

function authenticated(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  return request.user;
}

/**
 * Diário de jogos jogados (SPEC F8, seção 3): escrita e leitura do próprio diário
 * (autenticadas) e leitura do diário público, reutilizando a autenticação e o formato de
 * erro da F1. O papel não bloqueia as rotas `/me/games*` (RN-F8-01): o `ADMIN` mantém o
 * próprio diário normalmente.
 */
export const gameLogsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    GAME_LOG_ROUTES.myDiary,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['game-logs'],
        summary: 'Lista o próprio diário',
        description:
          'Diário do usuário autenticado, paginado, com filtro status repetível, ordenações recently_updated (padrão), recently_added e title, e as convenções de paginação da F3.',
        querystring: gameLogQuerySchema,
        response: {
          200: gameLogPageSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listOwnDiary(authenticated(request).id, request.query)),
  );

  app.get(
    GAME_LOG_ROUTES.publicDiary,
    {
      schema: {
        tags: ['game-logs'],
        summary: 'Lista o diário público de um jogador',
        description:
          'Acesso público, sem autenticação e inclusive para contas suspensas. O username ignora maiúsculas/minúsculas, inexistente responde 404 e a resposta nunca expõe e-mail, papel ou hash de senha do dono.',
        params: gameLogUserParamsSchema,
        querystring: gameLogQuerySchema,
        response: {
          200: gameLogPageSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listPublicDiary(request.params.username, request.query)),
  );

  app.get(
    GAME_LOG_ROUTES.myEntry,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['game-logs'],
        summary: 'Consulta o próprio registro de um jogo',
        description:
          'Aceita o slug ou o id do jogo. Retorna o registro do usuário autenticado com jogo e plataforma, ou 404 quando não há registro (ou o jogo não existe).',
        params: gameLogGameParamsSchema,
        response: {
          200: gameLogEntrySchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await getOwnEntry(authenticated(request).id, request.params.game)),
  );

  app.put(
    GAME_LOG_ROUTES.myEntry,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['game-logs'],
        summary: 'Cria ou substitui o próprio registro de um jogo',
        description:
          'Substituição completa: campos opcionais omitidos viram null. Retorna 201 na criação e 200 na substituição, sempre sem duplicar o registro do par jogador↔jogo.',
        params: gameLogGameParamsSchema,
        body: gameLogEntryInputSchema,
        response: {
          200: gameLogEntrySchema,
          201: gameLogEntrySchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { entry, created } = await putOwnEntry(
        authenticated(request).id,
        request.params.game,
        request.body,
      );

      return reply.status(created ? 201 : 200).send(entry);
    },
  );

  app.patch(
    GAME_LOG_ROUTES.myEntry,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['game-logs'],
        summary: 'Edita parcialmente o próprio registro de um jogo',
        description:
          'Campo omitido não muda; null limpa datas, tempo e plataforma. Sem registro existente responde 404 e um corpo sem nenhum campo é inválido.',
        params: gameLogGameParamsSchema,
        body: gameLogEntryUpdateSchema,
        response: {
          200: gameLogEntrySchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await patchOwnEntry(authenticated(request).id, request.params.game, request.body)),
  );

  app.delete(
    GAME_LOG_ROUTES.myEntry,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['game-logs'],
        summary: 'Remove o próprio registro de um jogo',
        description:
          'Responde 204 e o registro some das listagens; sem registro existente responde 404.',
        params: gameLogGameParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteOwnEntry(authenticated(request).id, request.params.game);

      return reply.status(204).send(null);
    },
  );
};
