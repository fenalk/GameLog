import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = await buildApp();

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  app.log.info({ signal }, 'Encerrando a API REST');
  await app.close();
  process.exit(0);
}

process.once('SIGINT', (signal) => void shutdown(signal));
process.once('SIGTERM', (signal) => void shutdown(signal));

try {
  await app.listen({ host: env.HOST, port: env.PORT });

  if (env.OPENAPI_ENABLED) {
    app.log.info(`Documentação OpenAPI disponível em http://localhost:${env.PORT}/docs`);
  }
} catch (error) {
  app.log.error(error, 'Falha ao iniciar a API REST');
  process.exit(1);
}
