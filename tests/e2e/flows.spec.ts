import { expect, test } from '@playwright/test';
import { app, backToTerrace, dismissTips, freshGame, hook, playRun, waitApp } from './helpers';

test.describe.configure({ mode: 'serial' });

test('① day 1: T1 → T2 → guided watering → C01 → sleep → reload keeps everything', async ({ page }) => {
  await freshGame(page, 3);
  await playRun(page);
  await backToTerrace(page);
  await page.getByRole('button', { name: '委托' }).click();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
  await playRun(page);
  await backToTerrace(page);
  await expect(page.getByRole('button', { name: '先去浇水' })).toBeVisible();
  await page.getByRole('button', { name: '先去浇水' }).click();
  await dismissTips(page);
  const row = await hook(page, 'guideRow');
  expect(row).not.toBeNull();
  expect(await hook(page, 'water', row!)).toBe(true);
  await page.getByRole('button', { name: '委托' }).click();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
  await playRun(page);
  await backToTerrace(page);
  await page.getByRole('button', { name: '入夜' }).click();
  const confirm = page.getByRole('alertdialog').getByRole('button', { name: '入夜' });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await waitApp(page, 'night');
  await page.locator('[data-phase="dark"]').click();
  // The overnight growth wave is frame-driven; skip it like the runs above (software GL can run at ~1 fps).
  await expect.poll(async () => (await hook(page, 'skipAnimations'), app(page)), { timeout: 30_000 }).toBe('hub');
  const before = (await hook(page, 'home')) as { day: number; field: unknown; wallet: unknown };
  expect(before.day).toBe(2);
  await page.reload();
  await page.getByRole('button', { name: '继续' }).click();
  await waitApp(page, 'hub');
  const after = (await hook(page, 'home')) as typeof before;
  expect(after.day).toBe(2);
  expect(after.field).toEqual(before.field);
  expect(after.wallet).toEqual(before.wallet);
});

test('② a failed commission keeps partial delivery; the retry shows what is left', async ({ page }) => {
  await freshGame(page, 4);
  await playRun(page);
  await backToTerrace(page);
  const h = (await hook(page, 'home')) as {
    commissions: { active: Record<string, unknown> } & Record<string, unknown>;
  };
  await hook(page, 'patchHome', {
    commissions: { ...h.commissions, active: { ...h.commissions.active, items: [{ crop: 'tomato', count: 30 }] } },
  });
  await page.getByRole('button', { name: '委托' }).click();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
  await page.evaluate(async () => {
    const h = (window as unknown as { __DEWFIELD__: NonNullable<Window['__DEWFIELD__']> }).__DEWFIELD__;
    for (let k = 0; k < 2; k++) {
      h.autoMove();
      h.skipAnimations();
      await new Promise((r) => setTimeout(r, 80));
    }
  });
  const delivered = ((await hook(page, 'getState')).delivered as { tomato?: number }).tomato ?? 0;
  await playRun(page, false);
  await expect(page.getByText(/还差 \d+ 个，交了的都算数/)).toBeVisible();
  await backToTerrace(page);
  await page.getByRole('button', { name: '委托' }).click();
  // The greedy hint targets the order, so two moves always deliver something; retention is really tested.
  expect(delivered).toBeGreaterThan(0);
  await expect(page.getByText(`${delivered} / 30`)).toBeVisible();
});

test('③ buying the wind chime gives +1 move on the next run', async ({ page }) => {
  await freshGame(page, 5);
  await playRun(page);
  await backToTerrace(page);
  await hook(page, 'patchHome', {
    wallet: { dewdrop: 999 },
    tutorial: { done: true, completedSteps: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'], seenTips: [] },
  });
  await dismissTips(page);
  await page.getByRole('button', { name: '商店' }).click();
  await page.getByTestId('decor-windChime').getByRole('button').click();
  await expect(page.getByTestId('decor-windChime')).toContainText('已拥有');
  await page.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: '委托' }).click();
  await expect(page.getByText('15 步')).toBeVisible();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
  expect((await hook(page, 'getState')).movesLeft).toBe(15);
});

test('④ a corrupt save shows the recovery notice and keeps the raw text', async ({ page }) => {
  await page.goto('/?e2e=1');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('dewfield:save:v1', '{definitely not json');
  });
  await page.reload();
  await expect(page.getByText(/存档无法读取/)).toBeVisible();
  const kept = await page.evaluate(
    () => Object.keys(localStorage).filter((k) => k.startsWith('dewfield:save:corrupt:')).length,
  );
  expect(kept).toBe(1);
  expect(await app(page)).toBe('title');
});
