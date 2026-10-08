import {
  LIST_ROUTES,
  apiErrorSchema,
  listDetailSchema,
  listIdParamsSchema,
  listInputSchema,
  listItemInputSchema,
  listItemParamsSchema,
  listItemSchema,
  listItemUpdateSchema,
  listItemsQuerySchema,
  listOrderInputSchema,
  listPageSchema,
  listQuerySchema,
  listSummarySchema,
  listUpdateSchema,
  listUserParamsSchema,
  publicListQuerySchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

import { apiErrors } from '../../lib/api-error.js';
import type { AuthUser } from '../../lib/auth-user.js';
import {
  createOwnList,
  deleteOwnList,
  deleteOwnListItem,
  getListDetail,
  listOwnLists,
  listPublicLists,
  patchOwnList,
  patchOwnListItem,
  putOwnListItem,
  reorderOwnList,
} from './lists.service.js';

function authenticated(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw apiErrors.unauthenticated('Token de acesso ausente');
  }

  return request.user;
}

/**
 * Listas de jogos (SPEC F11, seção 3): criação e gerenciamento das próprias listas
 * (autenticados) e leitura pública por perfil e por permalink, reutilizando a autenticação
 * e o formato de erro da F1. O papel não bloqueia as rotas `/me/lists*` (RN-F11-21): o
 * `ADMIN` gerencia as próprias listas normalmente.
 */
export const listsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    LIST_ROUTES.publicLists,
    {
      schema: {
        tags: ['lists'],
        summary: 'Lista as listas públicas de um jogador',
        description:
          'Acesso público, sem autenticação e inclusive para contas suspensas. Retorna apenas listas PUBLIC. O username ignora maiúsculas/minúsculas, inexistente responde 404 e a resposta nunca expõe e-mail, papel ou hash de senha do dono.',
        params: listUserParamsSchema,
        querystring: publicListQuerySchema,
        response: {
          200: listPageSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listPublicLists(request.params.username, request.query)),
  );

  app.get(
    LIST_ROUTES.detail,
    {
      preHandler: [app.optionalAuthenticate],
      schema: {
        tags: ['lists'],
        summary: 'Detalhe (permalink) de uma lista',
        description:
          'Lista PUBLIC é pública. Uma lista PRIVATE só é retornada para o dono autenticado; para os demais, inexistente ou privada responde 404. Os itens são paginados e ordenados (position, title, recently_added).',
        params: listIdParamsSchema,
        querystring: listItemsQuerySchema,
        response: {
          200: listDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await getListDetail(request.params.id, request.user?.id ?? null, request.query)),
  );

  app.get(
    LIST_ROUTES.myLists,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Lista as próprias listas',
        description:
          'Listas do usuário autenticado, incluindo PRIVATE, com o campo visibility em cada item. Filtro visibility repetível e filtro game (slug ou id) que restringe às listas que contêm o jogo.',
        querystring: listQuerySchema,
        response: {
          200: listPageSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await listOwnLists(authenticated(request).id, request.query)),
  );

  app.post(
    LIST_ROUTES.myLists,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Cria uma lista',
        description:
          'Cria a lista do usuário autenticado (sempre 201). Títulos iguais geram listas distintas; visibility ausente equivale a PUBLIC.',
        body: listInputSchema,
        response: {
          201: listSummarySchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const list = await createOwnList(authenticated(request).id, request.body);

      return reply.status(201).send(list);
    },
  );

  app.patch(
    LIST_ROUTES.myList,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Edita parcialmente uma lista',
        description:
          'Campo omitido não muda; null limpa a descrição. Um corpo sem nenhum campo é inválido, lista inexistente ou de outro dono responde 404 e, quando nada muda, retorna 200 sem alterar updatedAt.',
        params: listIdParamsSchema,
        body: listUpdateSchema,
        response: {
          200: listSummarySchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await patchOwnList(authenticated(request).id, request.params.id, request.body)),
  );

  app.delete(
    LIST_ROUTES.myList,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Remove uma lista',
        description:
          'Responde 204 e remove a lista com os itens; lista inexistente ou de outro dono responde 404.',
        params: listIdParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteOwnList(authenticated(request).id, request.params.id);

      return reply.status(204).send(null);
    },
  );

  app.put(
    LIST_ROUTES.myListItem,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Adiciona ou substitui um jogo na lista',
        description:
          'Aceita o slug ou o id do jogo. Substitição completa da nota: omitida vira null. Retorna 201 na criação (ao fim da lista) e 200 na substituição (preservando a posição), sem duplicar o jogo.',
        params: listItemParamsSchema,
        body: listItemInputSchema,
        response: {
          200: listItemSchema,
          201: listItemSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const { item, created } = await putOwnListItem(
        authenticated(request).id,
        request.params.id,
        request.params.game,
        request.body,
      );

      return reply.status(created ? 201 : 200).send(item);
    },
  );

  app.patch(
    LIST_ROUTES.myListItem,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Edita parcialmente a nota de um item',
        description:
          'Altera apenas a nota; null limpa o campo. Corpo vazio é inválido e item inexistente responde 404.',
        params: listItemParamsSchema,
        body: listItemUpdateSchema,
        response: {
          200: listItemSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(
        await patchOwnListItem(
          authenticated(request).id,
          request.params.id,
          request.params.game,
          request.body,
        ),
      ),
  );

  app.delete(
    LIST_ROUTES.myListItem,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Remove um jogo da lista',
        description: 'Responde 204; quando o jogo não está na lista, responde 404.',
        params: listItemParamsSchema,
        response: {
          204: z.null(),
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await deleteOwnListItem(authenticated(request).id, request.params.id, request.params.game);

      return reply.status(204).send(null);
    },
  );

  app.put(
    LIST_ROUTES.myListOrder,
    {
      preHandler: [app.authenticate],
      schema: {
        tags: ['lists'],
        summary: 'Reordena os itens da lista',
        description:
          'O corpo precisa conter exatamente os jogos da lista, uma única vez cada; as posições viram 0..n-1 na ordem informada. Conjunto diferente, duplicado ou jogo inexistente responde 400.',
        params: listIdParamsSchema,
        body: listOrderInputSchema,
        response: {
          200: listDetailSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) =>
      reply.send(await reorderOwnList(authenticated(request).id, request.params.id, request.body)),
  );
};
