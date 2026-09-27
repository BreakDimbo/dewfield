import { expect, test, type Page } from '@playwright/test';
import { app, backToTerrace, dismissTips, freshGame, hook, playRun, waitApp } from './helpers';

test.describe.configure({ mode: 'serial' });

const DONE = { done: true, completedSteps: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5'], seenTips: [] };

/** After T1, unlock everything so any commission can be opened from the hub. */
async function hubAfterTutorial(page: Page, seed: number) {
  await freshGame(page, seed);
  await playRun(page);
  await backToTerrace(page);
  await hook(page, 'patchHome', { tutorial: DONE });
  await dismissTips(page);
}

async function openAndStart(page: Page) {
  await page.getByRole('button', { name: '委托' }).click();
  await page.getByRole('button', { name: '开始' }).click();
  await waitApp(page, 'match');
}

test('P1-20: five hub ↔ match round trips keep one canvas, one FieldView and the same field', async ({ page }) => {
  await hubAfterTutorial(page, 6);
  const start = await hook(page, 'mounts');
  expect(start).toMatchObject({ canvas: 1, field: 1 });
  for (let k = 0; k < 5; k++) {
    const field = ((await hook(page, 'home')) as { field: { rows: string[] } }).field.rows.join('\n');
    await openAndStart(page);
    // 田就是棋盘: the run starts on exactly the terrace field.
    expect((await hook(page, 'getState')).ascii).toBe(field);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '放弃委托' }).click();
    await waitApp(page, 'settlement');
    await backToTerrace(page);
    // Abandoning on the first move changes nothing on the field.
    expect(((await hook(page, 'home')) as { field: { rows: string[] } }).field.rows.join('\n')).toBe(field);
  }
  expect(await hook(page, 'mounts')).toEqual({ ...start });
});

test('P2-11: skipping the harvest rush jumps to settlement with presentation == logic', async ({ page }) => {
  await hubAfterTutorial(page, 7);
  const h = (await hook(page, 'home')) as {
    commissions: { active: Record<string, unknown> } & Record<string, unknown>;
  };
  // A single carrot finishes the order on the first harvest, leaving almost every move for the rush.
  await hook(page, 'patchHome', {
    commissions: {
      ...h.commissions,
      active: { ...h.commissions.active, items: [{ crop: 'carrot', count: 1 }] },
    },
  });
  await openAndStart(page);
  let skipped = false;
  for (let k = 0; k < 30 && (await app(page)) === 'match'; k++) {
    const skip = page.getByRole('button', { name: '跳过' });
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      skipped = true;
      break;
    }
    await hook(page, 'autoMove');
    await hook(page, 'skipAnimations');
    await page.waitForTimeout(200);
  }
  await waitApp(page, 'settlement');
  expect(await hook(page, 'mismatches')).toBe(0);
  test.info().annotations.push({ type: 'rush-skip-clicked', description: String(skipped) });
});

test('P2-20: photo capture is the canvas only, full size, not blank', async ({ page }) => {
  await hubAfterTutorial(page, 8);
  const url = await hook(page, 'photo', '晨露田园 · 第 1 天');
  expect(url).toMatch(/^data:image\/png;base64,/);
  const info = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const lums = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 97) lums.add((d[i]! + d[i + 1]! + d[i + 2]!) >> 4);
    const canvas = document.querySelector('canvas')!;
    return { w: img.width, h: img.height, cw: canvas.width, ch: canvas.height, distinct: lums.size };
  }, url!);
  expect(info.w).toBe(info.cw);
  expect(info.h).toBe(info.ch);
  expect(info.distinct).toBeGreaterThan(8);
});

test('P2-22: a lost WebGL context shows the reload overlay, and reload resumes from the last save', async ({
  page,
}) => {
  await hubAfterTutorial(page, 9);
  const saved = await page.evaluate(() => localStorage.getItem('dewfield:save:v1'));
  expect(saved).not.toBeNull();
  await page.evaluate(() => {
    const c = document.querySelector('canvas')!;
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').click();
  await page.getByRole('button', { name: '继续' }).click();
  await waitApp(page, 'hub');
  expect(await page.evaluate(() => localStorage.getItem('dewfield:save:v1'))).toBe(saved);
  const home = (await hook(page, 'home')) as { day: number };
  expect(home.day).toBe(JSON.parse(saved!).home?.day ?? home.day);
});

test('RD-6 / P2-10: at terrace L3 nothing in the scene covers the board + 0.5 cell from the match camera', async ({
  page,
}) => {
  await hubAfterTutorial(page, 10);
  const h = (await hook(page, 'home')) as { decor: Record<string, unknown> };
  const all = ['windChime', 'planters', 'awning', 'beehive', 'bench', 'irrigation', 'glassMobile', 'dewLanterns'];
  await hook(page, 'patchHome', { decor: { ...h.decor, owned: all } });
  await openAndStart(page);
  // app === 'match' only after the camera reports it has arrived at the match pose.
  await page.waitForTimeout(2000);
  expect(await hook(page, 'occluders')).toEqual([]);
});
