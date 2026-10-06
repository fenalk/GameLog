import { API_PREFIX } from '@gamelog/shared';
import type { FastifyInstance } from 'fastify';

import { buildApp, type App } from '../../src/backend/src/app.js';

/**
 * Rotas exclusivas de teste: exercitam o mecanismo reutilizável de autenticação e
 * autorização (T1.08) sem criar endpoints públicos fora do escopo da SPEC F1.
 */
async function registerTestRoutes(app: FastifyInstance): Promise<void> {
  app.get(testPath('/test/boom'), async () => {
    throw new Error('falha proposital para o teste de 500');
  });

  app.get(
    testPath('/test/player'),
    { preHandler: [app.authenticate, app.requireRole('PLAYER')] },
    async (request) => ({ user: request.user }),
  );

  app.get(
    testPath('/test/admin'),
    { preHandler: [app.authenticate, app.requireRole('ADMIN')] },
    async (request) => ({ user: request.user }),
  );

  app.get(
    testPath('/test/optional'),
    { preHandler: [app.optionalAuthenticate] },
    async (request) => ({ user: request.user }),
  );

  await app.ready();
}

/** Instância da API usada pelos testes de integração, com as rotas de teste registradas. */
export async function buildTestApp(): Promise<App> {
  const app = await buildApp();
  await registerTestRoutes(app);
  return app;
}

export function testPath(path: string): string {
  return `${API_PREFIX}${path}`;
}
