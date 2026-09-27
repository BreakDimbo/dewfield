import { COMMISSIONS, type CommissionDef } from '../../src/core/config/commissions';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables } from '../../src/core/config/tunables';
import { BANDS, parseSet } from './audit-lib';
import type { CarePolicy } from './policies';
import { simulateSingle } from './sim';

/**
 * P1-26 / P2-23 helper (02 §15.6 lever 2: order counts and moves).
 * For each commission, walks moves from the current value downwards; for each moves value, scales the order counts
 * (keeping the item ratio) until the greedy / no-care win rate is nearest the tier band centre, then measures the
 * waterOrdered care rate. The first (i.e. longest) candidate that sits inside both 02 §5.7 bands with ≥ +10 pp care
 * uplift is proposed; otherwise the candidate with the smallest band error.
 *
 * `pnpm tsx tools/sim/tune.ts [--runs 400] [--seed 11] [--ids C04,C05] [--set care.pointsBase=4] [--vs] [--minMoves 11] [--margin 0.01]`
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1]!.startsWith('--') ? process.argv[i + 1]! : fallback;
}
/** Aim at the lower-middle of each band: the win-rate curve is steeper there, so care buys more uplift. */
const CENTRE: Record<number, number> = { 1: 0.93, 2: Number(arg('c2', '0.775')), 3: Number(arg('c3', '0.65')) };
const runs = Number(arg('runs', '400'));
const seed = Number(arg('seed', '11'));
const minMoves = Number(arg('minMoves', '11'));
/** Safety margin inside the bands (and above +10 pp) so the proposal survives a different seed. */
const margin = Number(arg('margin', '0.01'));
const ids = arg('ids', '').split(',').filter(Boolean);
const cfg = withTunables(parseSet(arg('set', '')), process.argv.includes('--vs') ? VS_TUNABLES : DEFAULT_TUNABLES);

function scaled(def: CommissionDef, total: number): CommissionDef['items'] {
  const sum = def.items.reduce((s, i) => s + i.count, 0);
  return def.items.map((i) => ({ ...i, count: Math.max(1, Math.round((i.count * total) / sum)) }));
}

function rate(def: CommissionDef, moves: number, items: CommissionDef['items'], care: CarePolicy): number {
  const saved = { items: def.items, moves: def.moves };
  const d = def as { items: CommissionDef['items']; moves: number };
  d.items = items;
  d.moves = moves;
  const s = simulateSingle({ commission: def.id, runs, seed, bot: 'greedy', care, fieldStages: [0.3, 0.4, 0.3] }, cfg);
  d.items = saved.items;
  d.moves = saved.moves;
  return s.winRate;
}

interface Cand {
  moves: number;
  items: CommissionDef['items'];
  none: number;
  care: number;
  err: number;
}

const fmt = (items: CommissionDef['items']) => items.map((i) => `${i.crop}×${i.count}`).join(' + ');
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const rows = ['| 委托 | 档 | 原步数 / 订单 | 建议步数 / 订单 | 不照料 | 照料 | 提升 | 达标 |', '|---|---|---|---|---|---|---|---|'];

for (const def of COMMISSIONS.filter((d) => !d.isTutorial && (ids.length ? ids.includes(d.id) : true))) {
  const band = BANDS[def.tier];
  const centre = CENTRE[def.tier]!;
  const origTotal = def.items.reduce((s, i) => s + i.count, 0);
  let chosen: Cand | null = null;
  let best: Cand | null = null;
  for (let moves = def.moves; moves >= minMoves; moves--) {
    let total = Math.max(def.items.length, Math.round((origTotal * moves) / def.moves));
    const tried = new Map<number, number>();
    const at = (t: number) => {
      if (!tried.has(t)) tried.set(t, rate(def, moves, scaled(def, t), 'none'));
      return tried.get(t)!;
    };
    // walk towards the centre: too easy → more items, too hard → fewer
    for (let k = 0; k < 8; k++) {
      const r = at(total);
      const next = r > centre ? total + 1 : total - 1;
      if (next < def.items.length) break;
      const rn = at(next);
      if ((r > centre) !== (rn > centre)) {
        total = Math.abs(rn - centre) < Math.abs(r - centre) ? next : total;
        break;
      }
      total = next;
    }
    const items = scaled(def, total);
    const none = at(total);
    const care = rate(def, moves, items, 'waterOrdered');
    const up = care - none;
    const out = (x: number, [lo, hi]: [number, number]) => Math.max(0, lo + margin - x, hi < 1 ? x - hi + margin : 0);
    const err = out(none, band.none) + out(care, band.care) + (def.tier > 1 ? Math.max(0, 0.1 + margin - up) : 0);
    const cand = { moves, items, none, care, err };
    if (!best || err < best.err) best = cand;
    if (err === 0) {
      chosen = cand;
      break;
    }
  }
  const c = chosen ?? best!;
  rows.push(
    `| ${def.id} | ${def.tier} | ${def.moves} / ${fmt(def.items)} | ${c.moves} / ${fmt(c.items)} | ${pct(c.none)} | ${pct(c.care)} | ${(100 * (c.care - c.none)).toFixed(1)} pp | ${chosen ? '✓' : '✗'} |`,
  );
  process.stderr.write(rows[rows.length - 1] + '\n');
}
process.stdout.write(rows.join('\n') + '\n');
