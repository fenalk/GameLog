import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { createLoginAttemptLimiter, type LoginAttemptLimiter } from '../lib/login-rate-limit.js';

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Limitador compartilhado pelas falhas de login (RN-F1-08) e pelas senhas incorretas
     * nas operações sensíveis do perfil (RN-F2-08): os módulos usam chaves distintas e
     * contabilizam no mesmo mecanismo.
     */
    attemptLimiter: LoginAttemptLimiter;
  }
}

export const attemptLimiterPlugin = fp(
  async (app: FastifyInstance) => {
    app.decorate('attemptLimiter', createLoginAttemptLimiter());
  },
  { name: 'attempt-limiter' },
);
