import { defineConfig, devices } from '@playwright/test';

import { resolveTestDatabaseUrl } from './tests/setup/test-database.js';

const isCI = Boolean(process.env.CI);
// O e2e roda em um banco dedicado (`*_test`), preparado pelo globalSetup; assim as
// contas criadas pelos testes não sujam o banco de desenvolvimento (ver AUD-03).
const testDatabaseUrl = resolveTestDatabaseUrl();

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/setup/prepare-database.ts',
  globalTeardown: './tests/setup/playwright-teardown.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:backend',
      url: 'http://localhost:3000/api/v1/health',
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: { DATABASE_URL: testDatabaseUrl },
    },
    {
      command: 'npm run dev:frontend',
      url: 'http://localhost:5173',
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
});
