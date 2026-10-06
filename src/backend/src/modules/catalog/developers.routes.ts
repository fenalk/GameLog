import {
  API_PREFIX,
  DEVELOPER_ROUTES,
  apiErrorSchema,
  developerCreateSchema,
  developerDetailSchema,
  developerListSchema,
  developerParamsSchema,
  developerPath,
  developerUpdateSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';

import {
  createDeveloper,
  deleteDeveloper,
  getDeveloperDetail,
  listDevelopers,
  updateDeveloper,
} from './developers.service.js';

/**
 * Gerenciamento de desenvolvedora (SPEC F7, seções 2 e 3): leitura pública e CRUD
 * exclusivo do `ADMIN` (RN-F7-01), reutilizando a autenticação/RBAC e o formato de erro
 * da F1.
 */
export const developersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    DEVELOPER_ROUTES.list,
    {
      schema: {
        tags: ['developers'],
        summary: 'Lista as desenvolvedoras do catálogo',
        description:
          'Lista completa (sem paginação), ordenada por nome, com a quantidade de jogos vinculados. Acesso público; inclui desenvolvedoras sem jogos.',
        response: {
          200: developerListSchema,
        },
      },
    },
    async (_request, reply) => reply.send(await listDevelopers()),
  );

  app.get(
    DEVELOPER_ROUTES.detail,
    {
      schema: {
        tags: ['developers'],
        summary: 'Detalhe de uma desenvolvedora pelo slug ou id',
        description:
          'Retorna nome, slug, quantidade de jogos e datas de criação/atualização. Identificador inexistente responde 404.',
        params: developerParamsSchema,
        response: {
          200: developerDetailSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => reply.send(await getDeveloperDetail(request.params.developer)),
  );

  app.post(
    DEVELOPER_ROUTES.list,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['developers'],
        summary: 'Cria uma desenvolvedora',
        description:
          'Exclusivo de ADMIN. O slug pode ser informado ou é derivado do nome; nome (sem diferenciar caixa/acentos) e slug são únicos. Retorna 201 com o cabeçalho Location.',
        body: developerCreateSchema,
        response: {
          201: developerDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const developer = await createDeveloper(request.body);

      return reply
        .status(201)
        .header('location', `${API_PREFIX}${developerPath(developer.slug)}`)
        .send(developer);
    },
  );

  app.patch(
    DEVELOPER_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['developers'],
        summary: 'Renomeia uma desenvolvedora',
        description:
          'Exclusivo de ADMIN. Aceita somente o nome; o slug é imutável e a data de criação é preservada. Enviar o mesmo nome não altera nada.',
        params: developerParamsSchema,
        body: developerUpdateSchema,
        response: {
          200: developerDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await updateDeveloper(request.params.developer, request.body)),
  );

  app.delete(
    DEVELOPER_ROUTES.detail,
    {
      preHandler: [app.authenticate, app.requireRole('ADMIN')],
      schema: {
        tags: ['developers'],
        summary: 'Exclui uma desenvolvedora',
        description:
          'Exclusivo de ADMIN. Só é permitido quando a desenvolvedora não possui jogos vinculados; caso contrário responde 409 DEVELOPER_IN_USE. A exclusão não remove vínculos.',
        params: developerParamsSchema,
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
      await deleteDeveloper(request.params.developer);

      return reply.status(204).send(null);
    },
  );
};
