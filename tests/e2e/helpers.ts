import { expect, type Page } from '@playwright/test';

type Hook = NonNullable<Window['__DEWFIELD__']>;
export const hook = <K extends keyof Hook>(page: Page, fn: K, ...args: Parameters<Hook[K]>) =>
  page.evaluate(([f, a]) => ((window as unknown as { __DEWFIELD__: Hook }).__DEWFIELD__[f as K] as (...x: unknown[]) => unknown)(...(a as unknown[])), [fn, args] as const) as Promise<Awaited<ReturnType<Hook[K]>>>;

export const app = async (page: Page) => (await hook(page, 'getState')).app;
export const waitApp = (page: Page, name: string) => expect.poll(() => app(page), { timeout: 30_000 }).toBe(name);

export async function freshGame(page: Page, seed = 3) {
  await page.goto(`/?e2e=1&seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
}

export async function dismissTips(page: Page) {
  for (let k = 0; k < 6; k++) {
    const b = page.getByRole('button', { name: '知道了' });
    if (!(await b.isVisible().catch(() => false))) return;
    await b.click();
    await page.waitForTimeout(150);
  }
}

/** Play the current run with the scripted T1 steps or the greedy hint, skipping animations. */
export async function playRun(page: Page, win = true) {
  if (!win) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '放弃委托' }).click();
  } else {
    await page.evaluate(async () => {
      const h = (window as unknown as { __DEWFIELD__: Hook }).__DEWFIELD__;
      for (let k = 0; k < 40 && h.getState().app === 'match'; k++) {
        h.autoMove();
        h.skipAnimations();
        await new Promise((r) => setTimeout(r, 60));
      }
    });
  }
  await waitApp(page, 'settlement');
}

export async function backToTerrace(page: Page) {
  await page.getByRole('button', { name: '回到露台' }).click();
  await expect.poll(() => app(page), { timeout: 30_000 }).toMatch(/hub|brief/);
  await dismissTips(page);
}
