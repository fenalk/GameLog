import {
  API_PREFIX,
  GENRE_ROUTES,
  apiErrorSchema,
  genreCreateSchema,
  genreDetailSchema,
  genreListSchema,
  genreParamsSchema,
  genrePath,
  genreUpdateSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createGenre,
  deleteGenre,
  getGenreDetail,
  listGenres,
  updateGenre,
} from './genres.service.js';

/**
 * Gerenciamento de gênero (SPEC F5, seções 3 e 4): leitura pública e CRUD exclusivo do
 * `ADMIN` (RN-F5-01), reutilizando a autenticação/RBAC e o formato de erro da F1.
 */
export const genresRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    GENRE_ROUTES.list,
    {
      schema: {
        tags: ['genres'],
        summary: 'Lista os gêneros do catálogo',
        description:
          'Lista completa (sem paginação), ordenada por nome, com a quantidade de jogos vinculados. Acesso público; inclui gêneros sem jogos.',
        response: {
          200: genreListSchema,
        },
      },
    },
    async (_request, reply) => reply.send(await listGenres()),
  );

  app.get(
    GENRE_ROUTES.detail,
    {
      schema: {
        tags: ['genres'],
        summary: 'Detalhe de um gênero pelo slug ou id',
        description:
          'Retorna nome, slug, quantidade de jogos e datas de criação/atualização. Identificador inexistente responde 404.',
        params: genreParamsSchema,
        response: {
          200: genreDetailSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => reply.send(await getGenreDetail(request.params.genre)),
  );

  app.post(
    GENRE_ROUTES.list,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['genres'],
        summary: 'Cria um gênero',
        description:
          'Exclusivo de ADMIN. O slug pode ser informado ou é derivado do nome; nome (sem diferenciar caixa/acentos) e slug são únicos. Retorna 201 com o cabeçalho Location.',
        body: genreCreateSchema,
        response: {
          201: genreDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const genre = await createGenre(request.body);

      return reply
        .status(201)
        .header('location', `${API_PREFIX}${genrePath(genre.slug)}`)
        .send(genre);
    },
  );

  app.patch(
    GENRE_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['genres'],
        summary: 'Renomeia um gênero',
        description:
          'Exclusivo de ADMIN. Aceita somente o nome; o slug é imutável e a data de criação é preservada. Enviar o mesmo nome não altera nada.',
        params: genreParamsSchema,
        body: genreUpdateSchema,
        response: {
          200: genreDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => reply.send(await updateGenre(request.params.genre, request.body)),
  );

  app.delete(
    GENRE_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['genres'],
        summary: 'Exclui um gênero',
        description:
          'Exclusivo de ADMIN. Só é permitido quando o gênero não possui jogos vinculados; caso contrário responde 409 GENRE_IN_USE. A exclusão não remove vínculos.',
        params: genreParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteGenre(request.params.genre);

      return reply.status(204).send(null);
    },
  );
};
