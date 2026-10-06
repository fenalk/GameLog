import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// O Prisma 7 não carrega .env automaticamente: as variáveis são lidas de src/backend/.env,
// independentemente do diretório de execução do comando.
loadEnv({ path: fileURLToPath(new URL('.env', import.meta.url)), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // O fallback mantém `prisma generate` funcionando no npm install mesmo sem .env
    // (primeiro clone); os comandos que acessam o banco exigem a variável DATABASE_URL
    // definida em src/backend/.env (ver .env.example).
    url: process.env.DATABASE_URL ?? '',
  },
});
