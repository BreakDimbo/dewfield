import { expect, test, type Page } from '@playwright/test';

type Hook = NonNullable<Window['__DEWFIELD__']>;
const state = (page: Page) => page.evaluate(() => (window as unknown as { __DEWFIELD__: Hook }).__DEWFIELD__.getState());

test('new game → T1 via test hooks → settlement → terrace, field remembered', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?e2e=1&seed=3');
  await page.getByRole('button', { name: '开始' }).click();
  await expect.poll(async () => (await state(page)).app, { timeout: 20_000 }).toBe('match');

  for (const [ax, ay, bx, by] of [
    [6, 5, 6, 6],
    [2, 2, 2, 3],
    [3, 5, 2, 5],
  ]) {
    await expect.poll(async () => page.evaluate(() => document.querySelector('[class*="skipHint"]') === null), { timeout: 20_000 }).toBe(true);
    await page.evaluate(([a, b, c, d]) => (window as unknown as { __DEWFIELD__: Hook }).__DEWFIELD__.applyMove(a!, b!, c!, d!), [ax, ay, bx, by]);
    await page.evaluate(() => (window as unknown as { __DEWFIELD__: Hook }).__DEWFIELD__.skipAnimations());
  }
  await expect.poll(async () => (await state(page)).app, { timeout: 20_000 }).toBe('settlement');
  await expect(page.getByRole('heading', { name: '委托完成' })).toBeVisible();
  await expect(page.getByTestId('settle-carrot')).toContainText('10 / 10');
  const endAscii = (await state(page)).ascii;

  await page.getByRole('button', { name: '回到露台' }).click();
  await expect.poll(async () => (await state(page)).app, { timeout: 20_000 }).toBe('hub');
  await expect(page.getByText('第 1 天')).toBeVisible();
  expect((await state(page)).wallet).toBeGreaterThan(0);
  expect(endAscii).not.toBeNull();
  expect(errors).toEqual([]);
});
