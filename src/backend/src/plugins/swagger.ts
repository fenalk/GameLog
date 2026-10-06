import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';

/**
 * Documentação OpenAPI da API REST (seção 3.3 da SPEC de arquitetura), gerada a partir
 * dos schemas Zod compartilhados. Habilitada apenas quando OPENAPI_ENABLED=true.
 */
export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'GameLog API',
        description:
          'API REST do GameLog — contratos definidos com Zod e compartilhados via @gamelog/shared.',
        version: '0.1.0',
      },
      tags: [
        { name: 'health', description: 'Verificações de saúde da API' },
        { name: 'auth', description: 'Cadastro, login, sessão e identidade do usuário' },
      ],
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });
}
