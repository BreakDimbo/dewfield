import { chromium } from '@playwright/test';

/**
 * P1-14 #3: `?autoplay=1` plays the whole loop (runs, hub, shop, night) with the greedy bot; the choreographer
 * throws on any presentation ≠ logic mismatch. Passes when N moves complete with 0 mismatches and no page errors.
 * Needs `pnpm dev`. A small viewport keeps software GL fast; consistency does not depend on resolution.
 * Usage: node tools/perf/autoplay-check.mjs [moves=200]
 */
const target = Number(process.argv[2] ?? 200);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage({ viewport: { width: 480, height: 320 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:5391/?e2e=1');
await page.evaluate(() => localStorage.clear());
await page.goto('http://localhost:5391/?e2e=1&autoplay=1');
const t0 = Date.now();
let last;
for (;;) {
  await page.waitForTimeout(10_000);
  last = await page.evaluate(() => ({
    moves: window.__DEWFIELD_AUTOPLAY__?.moves ?? 0,
    runs: window.__DEWFIELD_AUTOPLAY__?.runs ?? 0,
    mismatches: window.__DEWFIELD__.mismatches(),
    day: window.__DEWFIELD__.home()?.day ?? 0,
  }));
  console.log(`${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(last)}`);
  if (last.moves >= target || errors.length || last.mismatches) break;
  if (Date.now() - t0 > 3 * 60 * 60 * 1000) break;
}
await browser.close();
const ok = last.moves >= target && last.mismatches === 0 && errors.length === 0;
console.log(`${ok ? 'PASS' : 'FAIL'}: ${last.moves} moves, day ${last.day}, ${last.mismatches} mismatches, ${errors.length} errors`);
for (const e of errors.slice(0, 10)) console.log('  ', e);
process.exit(ok ? 0 : 1);
