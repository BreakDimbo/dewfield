import { isCrop, neighborIdx, posOf } from '../../src/core/board/model';
import type { CropId } from '../../src/core/config/crops';
import type { Tunables } from '../../src/core/config/tunables';
import { carePlaceBee, effectiveModifiers } from '../../src/core/homestead/decor';
import { careWaterRow, fieldBoard } from '../../src/core/homestead/homestead';
import type { HomesteadState } from '../../src/core/homestead/state';

export type CarePolicy = 'none' | 'waterOrdered';

/** Non-ripe tiles of the still-needed order crops in row y. */
function rowNeed(home: HomesteadState, y: number, crops: CropId[]): number {
  const b = fieldBoard(home);
  let n = 0;
  for (let x = 0; x < 7; x++) {
    const t = b.cells[y * 7 + x]!;
    if (isCrop(t) && crops.includes(t.crop) && t.stage < 2) n++;
  }
  return n;
}

/** 02 §15.3 `waterOrdered`: spend all points on the neediest rows (ties → larger y); bee next to most order crops. */
export function applyCare(home: HomesteadState, policy: CarePolicy, cfg: Tunables): { home: HomesteadState; actions: number } {
  if (policy === 'none' || !home.commissions.active) return { home, actions: 0 };
  const a = home.commissions.active;
  const crops = a.items.filter((it) => (a.delivered[it.crop] ?? 0) < it.count).map((it) => it.crop);
  let h = home;
  let actions = 0;
  if (effectiveModifiers(h).careVerbs.includes('bee') && !h.care.beeUsed && h.care.pointsLeft > 0) {
    const b = fieldBoard(h);
    let best = -1;
    let bestN = -1;
    b.cells.forEach((t, i) => {
      if (!isCrop(t) || t.special !== null) return;
      const n = neighborIdx(i).filter((j) => {
        const u = b.cells[j]!;
        return isCrop(u) && crops.includes(u.crop);
      }).length;
      if (n > bestN) {
        best = i;
        bestN = n;
      }
    });
    if (best >= 0) {
      const r = carePlaceBee(h, posOf(best), cfg);
      if (r.ok) {
        h = r.home;
        actions++;
      }
    }
  }
  while (h.care.pointsLeft > 0) {
    let row = -1;
    let rowN = -1;
    for (let y = 0; y < 7; y++) {
      if (h.care.wateredRows.includes(y)) continue;
      const n = rowNeed(h, y, crops);
      if (n >= rowN) {
        row = y;
        rowN = n;
      }
    }
    if (row < 0) break;
    const r = careWaterRow(h, row, cfg);
    if (!r.ok) break;
    h = r.home;
    actions++;
  }
  return { home: h, actions };
}
