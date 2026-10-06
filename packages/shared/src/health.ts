import { z } from 'zod';

/** Versão e prefixo único da API REST, compartilhados entre backend e frontend. */
export const API_PREFIX = '/api/v1';

export const API_ROUTES = {
  health: '/health',
  readiness: '/health/ready',
} as const;

/** Contrato da verificação de vivacidade (liveness) do backend. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** Contrato da verificação de prontidão (readiness), que inclui o acesso ao banco. */
export const readinessResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
  timestamp: z.iso.datetime(),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
