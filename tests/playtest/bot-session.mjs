import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/** Records a real in-browser session played by ?autoplay=1 and exports its telemetry (PT1/PT2 pipeline check). */
const ms = Number(process.argv[2] ?? 240000);
const out = process.argv[3] ?? 'tests/fixtures/telemetry/bot-session.json';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://localhost:5391/?e2e=1&autoplay=1');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(ms);
const json = await page.evaluate(() => window.__DEWFIELD__.exportTelemetry());
writeFileSync(out, JSON.stringify(JSON.parse(json), null, 0) + '\n');
console.log(`${JSON.parse(json).length} events → ${out}`);
await browser.close();
