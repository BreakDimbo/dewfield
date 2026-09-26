import { expect, test } from '@playwright/test';
import { freshGame, hook } from './helpers';

test('P1-14 #4: at most 5 React commits per move', async ({ page }) => {
  await freshGame(page, 3);
  await page.waitForTimeout(500);
  const counts: number[] = [];
  for (let k = 0; k < 3; k++) {
    const before = await page.evaluate(() => (window as unknown as { __DEWFIELD_COMMITS__: { n: number } }).__DEWFIELD_COMMITS__.n);
    await hook(page, 'autoMove');
    await expect.poll(async () => page.evaluate(() => !document.querySelector('[data-testid="hud-bottom"]')?.textContent?.includes('点击加速')), { timeout: 90_000 }).toBe(true);
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => (window as unknown as { __DEWFIELD_COMMITS__: { n: number } }).__DEWFIELD_COMMITS__.n);
    if ((await hook(page, 'getState')).app !== 'match') break;
    counts.push(after - before);
  }
  test.info().annotations.push({ type: 'commits per move', description: counts.join(', ') });
  expect(counts.length).toBeGreaterThan(0);
  for (const c of counts) expect(c).toBeLessThanOrEqual(5);
});

for (const [w, h] of <[number, number][]>[
  [1280, 800],
  [1920, 1080],
  [1024, 768],
]) {
  test(`RD-6 / P1-18 #3: HUD never covers the board + 0.5 cell at ${w}×${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await freshGame(page, 3);
    await page.waitForTimeout(1500);
    const board = (await hook(page, 'boardRect'))!;
    for (const id of ['hud-top', 'hud-side', 'hud-bottom']) {
      const r = await page.getByTestId(id).boundingBox();
      if (!r) continue;
      const overlap = r.x < board.right && r.x + r.width > board.left && r.y < board.bottom && r.y + r.height > board.top;
      expect(overlap, `${id} ${JSON.stringify(r)} vs board ${JSON.stringify(board)}`).toBe(false);
    }
  });
}
