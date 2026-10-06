import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          env: { LOG_LEVEL: 'silent' },
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
