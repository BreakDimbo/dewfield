import { fieldFromBoard } from '@/core/board/ascii';
import type { BoardEvent } from '@/core/board/events';
import { idx, isCrop, makeBoard, type Pos, type Tile } from '@/core/board/model';
import { DECOR_BY_ID } from '@/core/config/decor';
import type { Tunables } from '@/core/config/tunables';
import { fieldBoard } from './homestead';
import type { DecorId, HomesteadState } from './state';

export interface Modifiers {
  extraMoves: number;
  carePointsMax: number;
  rushBonus: number;
  careVerbs: ('water' | 'bee')[];
}

/** 02 §9 */
export function effectiveModifiers(home: Pick<HomesteadState, 'decor'>): Modifiers {
  const m: Modifiers = { extraMoves: 0, carePointsMax: 0, rushBonus: 0, careVerbs: ['water'] };
  for (const id of home.decor.owned) {
    const e = DECOR_BY_ID[id].effect;
    if (!e) continue;
    if (e.type === 'extraMoves') m.extraMoves += e.value;
    else if (e.type === 'carePointsMax') m.carePointsMax += e.value;
    else if (e.type === 'rushBonus') m.rushBonus += e.value;
    else if (!m.careVerbs.includes('bee')) m.careVerbs.push('bee');
  }
  return m;
}

export function terraceLevel(home: Pick<HomesteadState, 'decor'>, cfg: Tunables): 1 | 2 | 3 {
  const n = home.decor.owned.length;
  const [a, b] = cfg.terrace.levelThresholds;
  return (1 + (n >= a ? 1 : 0) + (n >= b ? 1 : 0)) as 1 | 2 | 3;
}

export const carePointsMax = (home: Pick<HomesteadState, 'decor'>, cfg: Tunables): number =>
  cfg.care.pointsBase + effectiveModifiers(home).carePointsMax;

export type HomesteadEvent = { t: 'decorPurchased'; id: DecorId; price: number } | { t: 'terraceLevelUp'; level: 2 | 3 };

export type PurchaseReject = 'locked' | 'owned' | 'poor';

/** 02 §9 purchase. */
export function purchaseDecor(
  home: HomesteadState,
  id: DecorId,
  cfg: Tunables,
): { ok: true; home: HomesteadState; events: HomesteadEvent[] } | { ok: false; reason: PurchaseReject } {
  const def = DECOR_BY_ID[id];
  if (home.decor.owned.includes(id)) return { ok: false, reason: 'owned' };
  const before = terraceLevel(home, cfg);
  if (def.level > before) return { ok: false, reason: 'locked' };
  if (home.wallet.dewdrop < def.price) return { ok: false, reason: 'poor' };
  const next: HomesteadState = {
    ...home,
    wallet: { dewdrop: home.wallet.dewdrop - def.price },
    decor: { owned: [...home.decor.owned, id] },
  };
  const events: HomesteadEvent[] = [{ t: 'decorPurchased', id, price: def.price }];
  const after = terraceLevel(next, cfg);
  if (after > before) events.push({ t: 'terraceLevelUp', level: after as 2 | 3 });
  return { ok: true, home: next, events };
}

export type BeeReject = 'locked' | 'noPoints' | 'beeUsed' | 'badTarget';

/** 02 §8 release bees: one plain crop tile becomes a bee tile (new uid). */
export function carePlaceBee(
  home: HomesteadState,
  pos: Pos,
  cfg: Tunables,
): { ok: true; home: HomesteadState; events: BoardEvent[] } | { ok: false; reason: BeeReject } {
  if (!effectiveModifiers(home).careVerbs.includes('bee')) return { ok: false, reason: 'locked' };
  if (home.care.pointsLeft <= 0) return { ok: false, reason: 'noPoints' };
  if (home.care.beeUsed || cfg.care.beePerDay <= 0) return { ok: false, reason: 'beeUsed' };
  if (pos.x < 0 || pos.x > 6 || pos.y < 0 || pos.y > 6) return { ok: false, reason: 'badTarget' };
  const board = fieldBoard(home);
  const i = idx(pos);
  const t = board.cells[i]!;
  if (!isCrop(t) || t.special !== null) return { ok: false, reason: 'badTarget' };
  const cells: Tile[] = board.cells.slice();
  const uid = home.uidCounter;
  cells[i] = { uid, kind: 'bee' };
  return {
    ok: true,
    events: [{ t: 'beePlaced', pos, uid, replacedUid: t.uid }],
    home: {
      ...home,
      field: fieldFromBoard(makeBoard(cells)),
      uidCounter: uid + 1,
      care: { ...home.care, pointsLeft: home.care.pointsLeft - 1, beeUsed: true },
    },
  };
}
