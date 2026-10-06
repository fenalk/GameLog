import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { resolveTestDatabaseUrl } from './tests/setup/test-database.js';

// Os testes usam um banco dedicado (`<nome do banco>_test`), criado e migrado pelo
// globalSetup, para não apagar dados do banco de desenvolvimento (ver AUD-03).
const testDatabaseUrl = resolveTestDatabaseUrl();

const testEnv = {
  LOG_LEVEL: 'silent',
  DATABASE_URL: testDatabaseUrl,
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789-0123456789',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-0123456789',
};

export default defineConfig({
  // Mesmo alias do frontend, para que testes unitários importem seus módulos (`@/…`).
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/frontend/src', import.meta.url)),
    },
  },
  test: {
    globalSetup: ['./tests/setup/prepare-database.ts'],
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          env: { ...testEnv },
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          env: { ...testEnv },
          // Os arquivos de integração compartilham o mesmo banco dedicado e limpam as
          // tabelas entre os casos: rodar arquivos em paralelo causaria interferência.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
