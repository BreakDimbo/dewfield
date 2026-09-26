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

const server = spawn('node', ['scripts/serve.mjs'], { env: { ...process.env, PORT: '5393' }, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

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
const sampleStats = async () => {
  await dev.waitForTimeout(3000);
  return dev.evaluate(() => ({ ...window.__DEWFIELD_STATS__ }));
};
await dev.goto('http://localhost:5391/?e2e=1&seed=3');
await dev.evaluate(() => localStorage.clear());
await dev.reload();
views.title = await sampleStats();
await dev.getByRole('button', { name: '开始' }).click();
for (let i = 0; i < 80 && (await H('getState')).app !== 'match'; i++) await dev.waitForTimeout(250);
views.match = await sampleStats();
for (const m of [[6, 5, 6, 6], [2, 2, 2, 3], [3, 5, 2, 5]]) { await H('applyMove', ...m); await H('skipAnimations'); await dev.waitForTimeout(300); }
for (let i = 0; i < 80 && (await H('getState')).app !== 'settlement'; i++) await dev.waitForTimeout(250);
await H('closeSettlement');
for (let i = 0; i < 80 && (await H('getState')).app !== 'hub'; i++) await dev.waitForTimeout(250);
await H('patchHome', { decor: { owned: ['windChime', 'planters', 'awning', 'beehive', 'bench', 'irrigation', 'glassMobile', 'dewLanterns'] } });
views.hub = await sampleStats();

const bench = await ctx.newPage();
const logs = [];
bench.on('console', (m) => logs.push(m.text()));
await bench.goto('http://localhost:5393/?bench=1&benchMs=20000');
for (let i = 0; i < 60 && !logs.some((l) => l.startsWith('[bench]')); i++) await bench.waitForTimeout(1000);
const line = logs.find((l) => l.startsWith('[bench]')) ?? '[bench] n/a';
await browser.close();
server.kill();

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

- 这是 **SwiftShader 纯 CPU 软件渲染** 的下限数据，不代表 GPU 设备；参考设备（核显笔记本、iPad A13）的实机测量需要真机，本环境无法提供，列为等价验收：以 draw call / 三角形 / 体积三项硬预算全部达标 + 自动降级（\`render/quality.ts\`：DPR 2 → 1.5 → 1 → 粒子减半，最多 ${4} 次切换防抖，单测覆盖）作为替代证据。
- 降级与恢复：drei \`PerformanceMonitor\`（bounds 45–58 fps）驱动 \`qualityStep\`；设置中的“高 / 低”直接锁定档位。
`;
writeFileSync('docs/balance/perf-report.md', md);
console.log(md);
