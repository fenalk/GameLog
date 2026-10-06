import {
  GAME_ROUTES,
  apiErrorSchema,
  gameDetailSchema,
  gameListQuerySchema,
  gameParamsSchema,
  gamesPageSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { getGameDetail, listGames } from './games.service.js';

/**
 * Consulta pública do catálogo (SPEC F3, seção 4): listagem com busca, filtros,
 * ordenação e paginação, e o detalhe de um jogo. O acesso é público (RN-F3-01): o
 * Visitante não precisa de autenticação.
 */
export const gamesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    GAME_ROUTES.list,
    {
      schema: {
        tags: ['catalog'],
        summary: 'Lista e pesquisa jogos do catálogo',
        description:
          'Busca textual (q), filtros por gênero, plataforma, desenvolvedora, ano e nota mínima, ordenação e paginação. Página além do fim retorna data vazia; parâmetros com formato inválido retornam 400.',
        querystring: gameListQuerySchema,
        response: {
          200: gamesPageSchema,
          400: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const page = await listGames(request.query);

      return reply.send(page);
    },
  );

  app.get(
    GAME_ROUTES.detail,
    {
      schema: {
        tags: ['catalog'],
        summary: 'Detalhe de um jogo pelo slug ou id',
        description:
          'Retorna os campos da listagem mais descrição, desenvolvedoras e datas. Identificador inexistente retorna 404.',
        params: gameParamsSchema,
        response: {
          200: gameDetailSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const game = await getGameDetail(request.params.game);

      return reply.send(game);
    },
  );
};
