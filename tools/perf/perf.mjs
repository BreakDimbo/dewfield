import { execSync, spawn } from 'node:child_process';
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/** P2-21 report: bundle + assets, time-to-title at 20 Mbps, draw calls/triangles per view, ?bench frame times. */
execSync('pnpm build', { stdio: 'ignore' });
const dist = join(process.cwd(), 'dist');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk(dist).map((f) => ({ f: f.slice(dist.length + 1), size: statSync(f).size, gz: /\.(js|css|html|json)$/.test(f) ? gzipSync(readFileSync(f)).length : statSync(f).size }));
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const initial = files.filter((x) => x.f.endsWith('.js') && (html.includes(x.f) || /vendor|index-|rolldown/.test(x.f)));
const initialGz = initial.reduce((s, x) => s + x.gz, 0);
const firstScene = files.filter((x) => !x.f.startsWith('audio/music') && !/leva|DebugPanel|bench/.test(x.f)).reduce((s, x) => s + x.size, 0);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

const up = (url) => fetch(url).then((r) => r.ok, () => false);
const waitUp = async (url) => {
  for (let i = 0; i < 120 && !(await up(url)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up(url))) throw new Error(`server did not start: ${url}`);
};
const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: '5393' }, stdio: 'ignore' });
// Draw-call sampling drives the game through the dev-only test hooks, so it needs the dev server too.
const devServer = (await up('http://localhost:5391/')) ? null : spawn('pnpm', ['dev'], { stdio: 'ignore', detached: true });
await waitUp('http://localhost:5393/');
await waitUp('http://localhost:5391/');
const MAX_FLIPS = Number(/MAX_FLIPS\s*=\s*(\d+)/.exec(readFileSync('src/render/quality.ts', 'utf8'))?.[1] ?? NaN);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
});

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 20, downloadThroughput: (20 * 1024 * 1024) / 8, uploadThroughput: (5 * 1024 * 1024) / 8 });
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const t0 = Date.now();
await page.goto('http://localhost:5393/');
await page.getByRole('heading', { name: '晨露田园' }).waitFor();
const titleMs = Date.now() - t0;
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

const views = {};
const dev = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const H = (fn, ...a) => dev.evaluate(([f, a]) => window.__DEWFIELD__[f](...a), [fn, a]);
// Software GL runs at ~1 fps and camera tweens are frame-driven, so waits are generous and must succeed.
const waitApp = async (name) => {
  for (let i = 0; i < 480 && (await H('getState')).app !== name; i++) await dev.waitForTimeout(250);
  const now = (await H('getState')).app;
  if (now !== name) throw new Error(`expected app "${name}", still "${now}"`);
};
const sampleStats = async (app) => {
  await waitApp(app);
  await dev.waitForTimeout(8000);
  return { app, ...(await dev.evaluate(() => ({ ...window.__DEWFIELD_STATS__ }))) };
};
await dev.goto('http://localhost:5391/?e2e=1&seed=3');
await dev.evaluate(() => localStorage.clear());
await dev.reload();
views.title = await sampleStats('title');
await dev.getByRole('button', { name: '开始' }).click();
views.match = await sampleStats('match');
// Play T1 through with the scripted guide / greedy hint, like the e2e helper.
for (let k = 0; k < 40 && (await H('getState')).app === 'match'; k++) {
  await H('autoMove');
  await H('skipAnimations');
  await dev.waitForTimeout(300);
}
await waitApp('settlement');
await H('closeSettlement');
await waitApp('hub');
const home = await H('home');
await H('patchHome', { decor: { ...home.decor, owned: ['windChime', 'planters', 'awning', 'beehive', 'bench', 'irrigation', 'glassMobile', 'dewLanterns'] } });
views.hub = await sampleStats('hub');
console.error(JSON.stringify(views));

const bench = await ctx.newPage();
const logs = [];
bench.on('console', (m) => logs.push(m.text()));
await bench.goto('http://localhost:5393/?bench=1&benchMs=20000');
for (let i = 0; i < 60 && !logs.some((l) => l.startsWith('[bench]')); i++) await bench.waitForTimeout(1000);
const line = logs.find((l) => l.startsWith('[bench]')) ?? '[bench] n/a';
await browser.close();
server.kill();
if (devServer) process.kill(-devServer.pid);

const md = `# 性能报告（P2-21）

> 生成：\`node tools/perf/perf.mjs\`（生产构建 + \`pnpm serve\`，Chromium + SwiftShader 软件渲染，1280×800，DPR 1）。

## 1. 体积预算（03 §13）

| 项 | 结果 | 预算 |
|---|---|---|
| 初始 JS（gzip） | **${kb(initialGz)}**（${initial.map((x) => x.f.replace('assets/', '')).join('、')}） | ≤ 500 KB |
| 首个场景的资源（不含懒加载音乐与调试模块） | **${kb(firstScene)}** | ≤ 6 MB |
| 展示字体子集 | ${kb(files.find((x) => x.f.includes('wenkai'))?.size ?? 0)} | ≤ 150 KB |
| 音效精灵（webm / mp3） | ${kb(files.find((x) => x.f === 'audio/sfx.webm')?.size ?? 0)} / ${kb(files.find((x) => x.f === 'audio/sfx.mp3')?.size ?? 0)} | — |
| 3 首音乐（懒加载，html5 流式） | ${kb(files.filter((x) => x.f.startsWith('audio/music') && x.f.endsWith('.webm')).reduce((s, x) => s + x.size, 0))}（webm 合计） | — |

## 2. 加载

| 项 | 结果 | 预算 |
|---|---|---|
| 到达标题页（20 Mbps、20 ms 延迟、禁用缓存） | **${(titleMs / 1000).toFixed(2)} 秒** | ≤ 4 秒 |

## 3. 渲染预算（\`renderer.info\`）

| 视图 | draw calls | 三角形 | 预算 |
|---|---|---|---|
| 标题（露台 L1） | ${views.title.calls} | ${(views.title.triangles / 1000).toFixed(1)}k | ≤ 180 / ≤ 150k |
| 露台 L3（8 件装饰全部拥有） | ${views.hub.calls} | ${(views.hub.triangles / 1000).toFixed(1)}k | ≤ 180 / ≤ 150k |
| 对局 | ${views.match.calls} | ${(views.match.triangles / 1000).toFixed(1)}k | ≤ 100 / ≤ 80k |

## 4. 帧时间（\`?bench=1\`，20 秒 bot 自动游玩）

\`${line}\`

- 这是 **SwiftShader 纯 CPU 软件渲染** 的数据，不代表 GPU 设备，不能用来判断 P2-21 验收 1（≥ 55 fps、p95 ≤ 22 ms）。
- **待真机测量**：在核显笔记本与 iPad（A13）上分别打开 \`?bench=1\`（标题/露台与对局各一次），把控制台 \`[bench]\` 行填入下表。未填之前 P2-21 不能勾选。

| 设备 | 视图 | 平均帧时间 | p95 | 结论 |
|---|---|---|---|---|
| 核显笔记本 | 露台 / 对局 | 待测 | 待测 | — |
| iPad A13 | 露台 / 对局 | 待测 | 待测 | — |

- 自动降级（\`render/quality.ts\`：DPR 2 → 1.5 → 1 → 粒子减半，最多 ${MAX_FLIPS} 次切换后锁定防抖）有单测覆盖。
- 降级与恢复：drei \`PerformanceMonitor\`（bounds 45–58 fps）驱动 \`qualityStep\`；设置中的“高 / 低”直接锁定档位。
`;
writeFileSync('docs/balance/perf-report.md', md);
console.log(md);
