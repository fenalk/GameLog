import {
  API_PREFIX,
  PLATFORM_ROUTES,
  apiErrorSchema,
  platformCreateSchema,
  platformDetailSchema,
  platformListSchema,
  platformParamsSchema,
  platformPath,
  platformUpdateSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createPlatform,
  deletePlatform,
  getPlatformDetail,
  listPlatforms,
  updatePlatform,
} from './platforms.service.js';

/**
 * Gerenciamento de plataforma (SPEC F6, seções 3 e 4): leitura pública e CRUD exclusivo
 * do `ADMIN` (RN-F6-01), reutilizando a autenticação/RBAC e o formato de erro da F1.
 */
export const platformsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    PLATFORM_ROUTES.list,
    {
      schema: {
        tags: ['platforms'],
        summary: 'Lista as plataformas do catálogo',
        description:
          'Lista completa (sem paginação), ordenada por nome, com a quantidade de jogos vinculados. Acesso público; inclui plataformas sem jogos.',
        response: {
          200: platformListSchema,
        },
      },
    },
    async (_request, reply) => reply.send(await listPlatforms()),
  );

  app.get(
    PLATFORM_ROUTES.detail,
    {
      schema: {
        tags: ['platforms'],
        summary: 'Detalhe de uma plataforma pelo slug ou id',
        description:
          'Retorna nome, slug, quantidade de jogos e datas de criação/atualização. Identificador inexistente responde 404.',
        params: platformParamsSchema,
        response: {
          200: platformDetailSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => reply.send(await getPlatformDetail(request.params.platform)),
  );

  app.post(
    PLATFORM_ROUTES.list,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['platforms'],
        summary: 'Cria uma plataforma',
        description:
          'Exclusivo de ADMIN. O slug pode ser informado ou é derivado do nome; nome (sem diferenciar caixa/acentos) e slug são únicos. Retorna 201 com o cabeçalho Location.',
        body: platformCreateSchema,
        response: {
          201: platformDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const platform = await createPlatform(request.body);

      return reply
        .status(201)
        .header('location', `${API_PREFIX}${platformPath(platform.slug)}`)
        .send(platform);
    },
  );

  app.patch(
    PLATFORM_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['platforms'],
        summary: 'Renomeia uma plataforma',
        description:
          'Exclusivo de ADMIN. Aceita somente o nome; o slug é imutável e a data de criação é preservada. Enviar o mesmo nome não altera nada.',
        params: platformParamsSchema,
        body: platformUpdateSchema,
        response: {
          200: platformDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await updatePlatform(request.params.platform, request.body)),
  );

  app.delete(
    PLATFORM_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['platforms'],
        summary: 'Exclui uma plataforma',
        description:
          'Exclusivo de ADMIN. Só é permitido quando a plataforma não possui jogos vinculados; caso contrário responde 409 PLATFORM_IN_USE. A exclusão não remove vínculos.',
        params: platformParamsSchema,
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
      await deletePlatform(request.params.platform);

      return reply.status(204).send(null);
    },
  );
};
