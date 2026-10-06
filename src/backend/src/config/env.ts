import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

// Carrega src/backend/.env independentemente do diretório de execução (dev, build ou testes).
loadEnv({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const booleanFromEnv = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  OPENAPI_ENABLED: booleanFromEnv.default(true),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const details = z.prettifyError(parsedEnv.error);
  throw new Error(
    `Configuração de ambiente inválida. Copie src/backend/.env.example para src/backend/.env.\n${details}`,
  );
}

export const env = parsedEnv.data;

export type Env = typeof env;
