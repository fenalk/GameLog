import { expect, test } from '@playwright/test';

test('a home carrega com a busca e os destaques do catálogo', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'GameLog' })).toBeVisible();
  await expect(page.getByLabel('Buscar jogos')).toBeVisible();
  await expect(page.getByTestId('destaque-recentes')).toBeVisible();
});
