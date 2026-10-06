import { expect, test } from '@playwright/test';

test('a home carrega e exibe o status ok da API REST', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'GameLog' })).toBeVisible();
  await expect(page.getByTestId('api-status')).toHaveText(/ok/i, { timeout: 20_000 });
});
