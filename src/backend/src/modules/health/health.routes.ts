import {
  API_ROUTES,
  ERROR_CODES,
  apiErrorSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@gamelog/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { checkDatabaseConnection } from '../../lib/prisma.js';

/**
 * Módulo de saúde da API (T0.08 da Etapa 0): liveness (sem dependências) e readiness
 * (com verificação do PostgreSQL via Prisma). Módulos de negócio seguem este mesmo
 * formato: rotas com schemas Zod compartilhados em `modules/<funcionalidade>/`.
 */
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    API_ROUTES.health,
    {
      schema: {
        tags: ['health'],
        summary: 'Verificação de vivacidade da API',
        description: 'Responde 200 quando a API REST está de pé.',
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => ({
      status: 'ok' as const,
      service: 'gamelog-api',
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    }),
  );

  app.get(
    API_ROUTES.readiness,
    {
      schema: {
        tags: ['health'],
        summary: 'Verificação de prontidão da API',
        description: 'Responde 200 quando a API REST está de pé e o PostgreSQL acessível.',
        response: {
          200: readinessResponseSchema,
          503: apiErrorSchema,
        },
      },
    },
    async (_request, reply) => {
      const databaseUp = await checkDatabaseConnection();

      if (!databaseUp) {
        return reply.status(503).send({
          error: {
            code: ERROR_CODES.serviceUnavailable,
            message: 'Banco de dados indisponível',
          },
        });
      }

      return {
        status: 'ok' as const,
        database: 'up' as const,
        timestamp: new Date().toISOString(),
      };
    },
  );
};
