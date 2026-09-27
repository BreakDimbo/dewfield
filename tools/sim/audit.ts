import { writeFileSync } from 'node:fs';
import { COMMISSIONS } from '../../src/core/config/commissions';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables } from '../../src/core/config/tunables';
import { applyDefs, BANDS, parseSet } from './audit-lib';
import type { BotId } from './bots';
import type { CarePolicy } from './policies';
import { simulateSingle } from './sim';

/**
 * P1-26 / P2-23 audit: every commission × {no care, waterOrdered} against the 02 §5.7 bands.
 * `pnpm tsx tools/sim/audit.ts --runs 300 --seed 1 [--vs] [--ids T2,C01] [--set care.pointsBase=4] [--out f.json]`
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1]! : fallback;
}

applyDefs(arg('def', ''));
const base = process.argv.includes('--vs') ? VS_TUNABLES : DEFAULT_TUNABLES;
const cfg = withTunables(parseSet(arg('set', '')), base);
const runs = Number(arg('runs', '300'));
const seed = Number(arg('seed', '1'));
const bot = arg('bot', 'greedy') as BotId;
const ids = arg('ids', '').split(',').filter(Boolean);
const out = arg('out', '');
const defs = COMMISSIONS.filter((d) => (ids.length ? ids.includes(d.id) : d.id !== 'T1'));
const pct = (x: number) => (100 * x).toFixed(1);
const inBand = (x: number, [lo, hi]: [number, number]) => x >= lo - 1e-9 && x <= hi + 1e-9;

const rows: unknown[] = [];
const md = [
  '| 委托 | 档 | 步数 | 订单 | 不照料 | 照料 | 提升 (pp) | 前 10 手特效 | 达标 |',
  '|---|---|---|---|---|---|---|---|---|',
];
let sw = 0;
let swN = 0;
for (const def of defs) {
  const o = { commission: def.id, runs, seed, bot, fieldStages: [0.3, 0.4, 0.3] as [number, number, number] };
  const none = simulateSingle({ ...o, care: 'none' }, cfg);
  const care = simulateSingle({ ...o, care: arg('care', 'waterOrdered') as CarePolicy }, cfg);
  sw += none.specialWithin10 * none.runs;
  swN += none.runs;
  const b = BANDS[def.tier];
  const up = care.winRate - none.winRate;
  const miss: string[] = [];
  if (!inBand(none.winRate, b.none)) miss.push('不照料');
  if (!inBand(care.winRate, b.care)) miss.push('照料');
  if (def.id === 'T2' && none.winRate < 0.95) miss.push('T2<95%');
  if (def.tier > 1 && up < 0.1 - 1e-9) miss.push('提升');
  const order = def.items.map((i) => `${i.crop}×${i.count}`).join(' + ');
  md.push(
    `| ${def.id} | ${def.tier} | ${def.moves} | ${order} | ${pct(none.winRate)}% | ${pct(care.winRate)}% | ${(100 * up).toFixed(1)} | ${pct(none.specialWithin10)}% | ${miss.length ? '✗ ' + miss.join('/') : '✓'} |`,
  );
  rows.push({ id: def.id, tier: def.tier, moves: def.moves, items: def.items, none, care });
}
md.push('', `前 10 手内出特效（全部委托合计，不照料）：${pct(sw / Math.max(1, swN))}%`);
const head = `## audit · ${process.argv.includes('--vs') ? 'VS' : 'MVP'} · ${bot} · ${runs} 局 · seed ${seed}${arg('set', '') ? ` · set ${arg('set', '')}` : ''}${arg('def', '') ? ` · def ${arg('def', '')}` : ''}\n\n`;
if (out) writeFileSync(out, JSON.stringify({ profile: process.argv.includes('--vs') ? 'VS' : 'MVP', runs, seed, bot, set: arg('set', ''), rows }, null, 2));
process.stdout.write(head + md.join('\n') + '\n');
