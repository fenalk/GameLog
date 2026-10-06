import { API_PREFIX } from '@gamelog/shared';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { env } from './config/env.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { gamesRoutes } from './modules/catalog/games.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { attemptLimiterPlugin } from './plugins/attempt-limiter.js';
import { authPlugin } from './plugins/auth.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerOpenApi } from './plugins/swagger.js';

/**
 * Cria a aplicação Fastify com plugins transversais, tratamento de erros e os módulos
 * da API REST. Não chama `listen` — o servidor HTTP é iniciado em `server.ts` e os
 * testes de integração usam a instância diretamente.
 */
export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  await app.register(cors, { origin: env.CORS_ORIGIN });
  await app.register(cookie);
  await app.register(authPlugin);
  await app.register(attemptLimiterPlugin);

  if (env.OPENAPI_ENABLED) {
    await registerOpenApi(app);
  }

  await app.register(healthRoutes, { prefix: API_PREFIX });
  await app.register(authRoutes, { prefix: API_PREFIX });
  await app.register(profileRoutes, { prefix: API_PREFIX });
  await app.register(gamesRoutes, { prefix: API_PREFIX });

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
