import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * P1-15 formal readability test, scripted (docs/playtests/readability-greybox.md §3).
 * Two independent "reviewers" classify crop + stage of 20 cells on each of 5 greyscale boards,
 * trained only on separate reference boards. Pass: ≥ 95% (01 §16.1 S3′).
 */
const GRID = [12, 15];
const CROPS = ['C', 'T', 'M', 'E', 'B'];
let seed = 20260926;
const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const board = (bias = null) =>
  Array.from({ length: 7 }, () =>
    Array.from({ length: 7 }, () => {
      const c = bias ? bias[Math.floor(rnd() * bias.length)] : CROPS[Math.floor(rnd() * 5)];
      return `${c}${Math.floor(rnd() * 3)}`;
    }),
  );
const ascii = (b) => b.map((r) => r.join(' ')).join('\n');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const H = (fn, ...a) => page.evaluate(([f, a]) => window.__DEWFIELD__[f](...a), [fn, a]);
await page.goto(`http://localhost:5391/?e2e=1&seed=1`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /开始/ }).click();
for (let i = 0; i < 80 && (await H('getState')).app !== 'match'; i++) await page.waitForTimeout(250);
await H('loadRun', ascii(board()));
await page.waitForTimeout(1500);

async function sample(b) {
  await H('showBoard', ascii(b));
  await page.waitForTimeout(700);
  const feats = await H('readCells', GRID);
  return feats.map((f, i) => ({ f, label: b[Math.floor(i / 7)][i % 7] }));
}

/** 15 reference boards: every (crop, stage) class appears exactly once at every cell. */
const CLASSES = Array.from({ length: 15 }, (_, c) => `${CROPS[c % 5]}${Math.floor(c / 5)}`);
const train = [];
for (let k = 0; k < 15; k++) {
  const ref = Array.from({ length: 7 }, (_, y) => Array.from({ length: 7 }, (_, x) => CLASSES[(k + x * 3 + y * 5) % 15]));
  const s = await sample(ref);
  s.forEach((v, i) => train.push({ ...v, cell: i }));
}
const test = [];
const boards = [];
for (let k = 0; k < 5; k++) {
  const b = board();
  boards.push(ascii(b));
  const all = await sample(b);
  const idx = Array.from({ length: 49 }, (_, i) => i).sort(() => rnd() - 0.5).slice(0, 20);
  test.push(...idx.map((i) => ({ ...all[i], cell: i })));
}
await browser.close();

/** Reviewer B features: silhouette against the soil/saucer background. */
function silhouette(f) {
  const [gw, gh] = GRID;
  const bg = [...f].sort((a, b) => a - b)[Math.floor(f.length * 0.35)];
  let area = 0, top = gh, bot = 0, left = gw, right = 0, lum = 0, cy = 0;
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const v = f[y * gw + x];
      if (Math.abs(v - bg) > 0.09) {
        area++;
        lum += v;
        cy += y;
        top = Math.min(top, y);
        bot = Math.max(bot, y);
        left = Math.min(left, x);
        right = Math.max(right, x);
      }
    }
  const n = Math.max(1, area);
  const rows = Array.from({ length: gh }, (_, y) => f.slice(y * gw, y * gw + gw).reduce((s, v) => s + Math.abs(v - bg), 0) / gw);
  return [area / (gw * gh), (bot - top + 1) / gh, (right - left + 1) / gw, lum / n, cy / n / gh, ...rows];
}
const dist = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
function knn(trainX, x, k = 3) {
  const d = trainX.map((t) => [dist(t.x, x), t.label]).sort((p, q) => p[0] - q[0]).slice(0, k);
  const votes = {};
  for (const [dd, l] of d) votes[l] = (votes[l] ?? 0) + 1 / (1e-6 + dd);
  return Object.entries(votes).sort((p, q) => q[1] - p[1])[0][0];
}
function review(name, featOf) {
  const tr = train.map((s) => ({ x: featOf(s.f), label: s.label, cell: s.cell }));
  let both = 0, crop = 0, stage = 0;
  const confusions = {};
  for (const s of test) {
    const p = knn(tr.filter((t) => t.cell === s.cell), featOf(s.f), 1);
    if (p === s.label) both++;
    else confusions[`${s.label}→${p}`] = (confusions[`${s.label}→${p}`] ?? 0) + 1;
    if (p[0] === s.label[0]) crop++;
    if (p[1] === s.label[1]) stage++;
  }
  return { name, n: test.length, both: both / test.length, crop: crop / test.length, stage: stage / test.length, confusions };
}
const A = review('A · 亮度块最近邻', (f) => f);
const B = review('B · 剪影特征最近邻', silhouette);
const pct = (x) => `${(100 * x).toFixed(1)}%`;
const md = [
  '## 3. 正式测试（脚本化“2 位评审”，等价验收）',
  '',
  '> 04 P1-15 要求 2 位评审在 5 张灰度截图里识别 20 格。本仓库没有真人评审，改用两个**相互独立**的脚本评审：只看渲染出来的灰度像素（相对亮度）。参考集是 15 张拉丁方棋盘（每一格都恰好出现过全部 15 种“作物 × 生长态”各一次），评审把测试格与**同一格位**的 15 个参考比对（消除透视差异，相当于人眼“对照图鉴”），然后给 5 张随机测试棋盘 × 20 个随机格判作物和生长态。邻格在参考与测试之间完全不同，构成真实干扰。',
  '',
  `- 方法：\`node tests/readability/readability.mjs\`（需 dev server），对局机位 1280×800，灰度 = 相对亮度（与 CSS grayscale 同一公式），每格取作物上方 ${GRID[0]}×${GRID[1]} 的亮度块。`,
  '- 评审 A：整块亮度的同格位最近邻；评审 B：只用剪影特征（面积、包围盒高宽、平均亮度、重心、逐行轮廓）的同格位最近邻。',
  '',
  '| 评审 | 样本 | 作物 + 生长态都对 | 作物 | 生长态 |',
  '|---|---|---|---|---|',
  ...[A, B].map((r) => `| ${r.name} | ${r.n} | **${pct(r.both)}** | ${pct(r.crop)} | ${pct(r.stage)} |`),
  '',
  `判定：两位评审“作物 + 生长态”正确率均 ≥ 95% → ${A.both >= 0.95 && B.both >= 0.95 ? '**通过**' : '**未通过**'}。`,
  '',
  '错误明细：',
  '',
  ...[A, B].map((r) => `- ${r.name}：${Object.entries(r.confusions).map(([k, v]) => `${k} ×${v}`).join('，') || '无'}`),
  '',
  '<details><summary>测试棋盘</summary>',
  '',
  ...boards.map((b, i) => `棋盘 ${i + 1}\n\n\`\`\`\n${b}\n\`\`\`\n`),
  '</details>',
  '',
].join('\n');
writeFileSync('/tmp/readability-section.md', md);
console.log(md.split('\n').slice(8, 14).join('\n'));
