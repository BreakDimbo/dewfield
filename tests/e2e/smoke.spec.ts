import { expect, test } from '@playwright/test';

test('boots to the title screen without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /晨露田园/ })).toBeVisible();
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
