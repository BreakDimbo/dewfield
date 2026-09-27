// Scripted play-through (sakura-farm): real game mode (HUD, input, clock), not shot mode.
// usage: node tools/play.mjs <script.json> [--out shots/play] [--demo trees] [--w 1280 --h 720] [--q low]
// script: [{ "cam": [x, z, yawDeg, pitchDeg] }, { "key": "Digit3" }, { "click": true }, { "wait": 500 },
//          { "shot": "name" }, { "eval": "window.__game.state.day" }, { "sleep": true }]
// Uses the same local server trick as shot.mjs (three from node_modules) and a local Chromium.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = { _: [] };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[++i] : '1';
  else args._.push(a);
}
const steps = JSON.parse(fs.readFileSync(args._[0], 'utf8'));
const W = Number(args.w || 1280), H = Number(args.h || 720);
const out = args.out || 'shots/play';
fs.mkdirSync(path.resolve(root, out), { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(path.join(root, p), (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    if (p.endsWith('index.html')) data = Buffer.from(String(data).replaceAll('https://cdn.jsdelivr.net/npm/three@0.170.0/', '/node_modules/three/'));
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const exe = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
const browser = await puppeteer.launch({
  executablePath: exe, headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--ignore-gpu-blocklist', `--window-size=${W},${H}`],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 }, protocolTimeout: 600000,
});
const logs = [];
let failed = false;
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[console.error] ${m.text()}`); });
  const q = new URLSearchParams({ q: args.q || 'low' });
  if (args.demo) q.set('demo', args.demo);
  q.set('drs', args.drs ?? '0'); // fixed render scale for comparable screenshots
  if (args.only) q.set('only', args.only);
  await page.goto(`http://127.0.0.1:${port}/index.html?${q}`, { waitUntil: 'load', timeout: 180000 });
  await page.evaluate(() => localStorage.removeItem('sakurafarm.save.v1'));
  await page.waitForFunction('document.body.classList.contains("loaded")', { timeout: 600000, polling: 500 });
  await page.click('#go');
  const frames = (n) => page.evaluate((n) => new Promise((r) => { let k = 0; const f = () => (++k >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  let shotN = 0;
  for (const st of steps) {
    if (st.cam) await page.evaluate((v) => window.__setCam(v[0], null, v[1], v[2], v[3]), st.cam);
    if (st.key) { await page.keyboard.press(st.key); }
    if (st.click) await page.evaluate(() => window.__farm && window.__farmUse?.());
    if (st.use) await page.keyboard.press('KeyE');
    if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
    if (st.frames) await frames(st.frames);
    if (st.eval) console.log(`eval ${st.eval} →`, JSON.stringify(await page.evaluate(st.eval)));
    if (st.shot) {
      await frames(3);
      const f = path.join(out, `${String(shotN++).padStart(2, '0')}-${st.shot}.png`);
      await page.screenshot({ path: path.resolve(root, f) });
      console.log('saved', f);
    }
  }
} catch (e) {
  failed = true;
  console.log('PLAY FAILED:', e.message);
} finally {
  if (logs.length) { console.log('PAGE LOGS:'); for (const l of logs.slice(0, 30)) console.log(' ', l.slice(0, 400)); }
  await browser.close();
  server.close();
  if (failed || logs.some((l) => l.startsWith('[pageerror]'))) process.exitCode = 1;
}
