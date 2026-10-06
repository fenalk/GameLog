import { API_PREFIX, API_ROUTES, apiErrorSchema, healthResponseSchema } from '@gamelog/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/backend/src/app.js';

describe('API REST — fundação (Etapa 0)', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health responde 200 conforme o contrato Zod compartilhado', async () => {
    const response = await request(app.server).get(`${API_PREFIX}${API_ROUTES.health}`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/json');

    const parsed = healthResponseSchema.safeParse(response.body);
    expect(parsed.success).toBe(true);
  });

  it('rota inexistente responde 404 no formato de erro padrão', async () => {
    const response = await request(app.server).get(`${API_PREFIX}/rota-inexistente`);

    expect(response.status).toBe(404);
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('expõe a documentação OpenAPI em desenvolvimento', async () => {
    const response = await request(app.server).get('/docs/json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBeDefined();
    expect(response.body.paths[`${API_PREFIX}${API_ROUTES.health}`]).toBeDefined();
  });
});
