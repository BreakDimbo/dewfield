import { COMMISSIONS, type CommissionDef } from '../../src/core/config/commissions';
import { DEFAULT_TUNABLES } from '../../src/core/config/tunables';
import { simulateSingle } from './sim';

/**
 * P1-26 / P2-23 helper. Moves stay at the tier default (02 §5.7); order counts are scaled within the tier's
 * total range until the greedy / no-care win rate is nearest the tier band centre.
 */
const CENTRE: Record<number, number> = { 1: 0.93, 2: 0.8, 3: 0.68 };
const RANGE: Record<number, [number, number]> = { 1: [10, 14], 2: [14, 20], 3: [20, 32] };
const runs = Number(process.argv[2] ?? 200);
const cfg = DEFAULT_TUNABLES;

function scaled(def: CommissionDef, total: number) {
  const sum = def.items.reduce((s, i) => s + i.count, 0);
  const items = def.items.map((i) => ({ ...i, count: Math.max(1, Math.round((i.count * total) / sum)) }));
  return items;
}

function rate(def: CommissionDef, items: CommissionDef['items'], care: 'none' | 'waterOrdered') {
  const saved = def.items;
  def.items = items;
  const s = simulateSingle({ commission: def.id, runs, seed: 11, bot: 'greedy', care, fieldStages: [0.3, 0.4, 0.3] }, cfg);
  def.items = saved;
  return s.winRate;
}

const rows = ['| 委托 | 档 | 步数 | 原订单 | 调后订单 | 胜率（不照料） | 胜率（照料） | 照料提升 |', '|---|---|---|---|---|---|---|---|'];
const fmt = (items: CommissionDef['items']) => items.map((i) => `${i.crop}×${i.count}`).join(' + ');
for (const def of COMMISSIONS.filter((d) => !d.isTutorial)) {
  const [lo, hi] = RANGE[def.tier]!;
  let best = def.items;
  let bestErr = Infinity;
  for (let total = lo; total <= hi; total++) {
    const items = scaled(def, total);
    const r = rate(def, items, 'none');
    const err = def.tier === 1 ? (r >= CENTRE[1]! ? hi - total : 100 + total) : Math.abs(r - CENTRE[def.tier]!);
    if (err < bestErr) {
      bestErr = err;
      best = items;
    }
    if (def.tier > 1 && r < CENTRE[def.tier]! - 0.12) break;
  }
  const none = rate(def, best, 'none');
  const care = rate(def, best, 'waterOrdered');
  rows.push(
    `| ${def.id} | ${def.tier} | ${def.moves} | ${fmt(def.items)} | ${fmt(best)} | ${(100 * none).toFixed(1)}% | ${(100 * care).toFixed(1)}% | ${(100 * (care - none)).toFixed(1)} pp |`,
  );
}
process.stdout.write(rows.join('\n') + '\n');
