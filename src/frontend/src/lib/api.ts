import { API_PREFIX, API_ROUTES, healthResponseSchema, type HealthResponse } from '@gamelog/shared';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? API_PREFIX;

/**
 * Exemplo de consumo da API REST usando o contrato Zod compartilhado: a resposta é
 * validada com o mesmo schema usado pelo backend.
 */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}${API_ROUTES.health}`);

  if (!response.ok) {
    throw new Error(`Falha ao consultar a API REST (HTTP ${response.status}).`);
  }

  return healthResponseSchema.parse(await response.json());
}
