import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Carrega src/backend/.env independentemente do diretório de execução (dev, build ou testes).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

/** Comprimento mínimo exigido para os segredos de JWT (RN-F1-13). */
export const MIN_JWT_SECRET_LENGTH = 32;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  OPENAPI_ENABLED: booleanFromEnv.default(true),
  JWT_ACCESS_SECRET: z
    .string()
    .min(
      MIN_JWT_SECRET_LENGTH,
      `JWT_ACCESS_SECRET deve ter ao menos ${MIN_JWT_SECRET_LENGTH} caracteres`,
    ),
  JWT_REFRESH_SECRET: z
    .string()
    .min(
      MIN_JWT_SECRET_LENGTH,
      `JWT_REFRESH_SECRET deve ter ao menos ${MIN_JWT_SECRET_LENGTH} caracteres`,
    ),
  // Usados apenas pelo seed do administrador inicial (npm run db:seed) — RN-F1-14.
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Valida a configuração de ambiente. A aplicação recusa iniciar sem os segredos de JWT,
 * com segredos menores que 32 caracteres ou com os dois segredos iguais (RN-F1-13).
 */
export function parseEnv(source: NodeJS.ProcessEnv): EnvConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const details = z.prettifyError(parsed.error);
    throw new Error(
      `Configuração de ambiente inválida. Copie src/backend/.env.example para src/backend/.env.\n${details}`,
    );
  }

  if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
    throw new Error(
      'Configuração de ambiente inválida: JWT_ACCESS_SECRET e JWT_REFRESH_SECRET devem ser diferentes.',
    );
  }

  return parsed.data;
}

export const env = parseEnv(process.env);

export type Env = typeof env;
