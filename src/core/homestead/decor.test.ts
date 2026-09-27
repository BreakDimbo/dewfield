import { describe, expect, it } from 'vitest';
import { findGroups } from '@/core/board/match';
import { DECOR } from '@/core/config/decor';
import { DEFAULT_TUNABLES } from '@/core/config/tunables';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { applyMove } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import { pickMove } from '@/core/testkit/scenario';
import { carePlaceBee, carePointsMax, effectiveModifiers, purchaseDecor, terraceLevel } from './decor';
import { activeFrom, fieldBoard, newHomestead, sleep, startRun } from './homestead';
import type { HomesteadState } from './state';

const cfg = DEFAULT_TUNABLES;
const rich = (h: HomesteadState, n = 9999) => ({ ...h, wallet: { dewdrop: n } });

describe('decor, shop, modifiers, terrace level (P2-06)', () => {
  it('rejects locked, owned and unaffordable; buying deducts and owns', () => {
    const h = rich(newHomestead(1, cfg), 210);
    expect(purchaseDecor(h, 'bench', cfg)).toEqual({ ok: false, reason: 'locked' });
    expect(purchaseDecor(h, 'beehive', cfg)).toEqual({ ok: false, reason: 'poor' });
    const r = purchaseDecor(h, 'windChime', cfg);
    if (!r.ok) throw new Error(r.reason);
    expect(r.home.wallet.dewdrop).toBe(10);
    expect(r.home.decor.owned).toEqual(['windChime']);
    expect(r.events).toEqual([{ t: 'decorPurchased', id: 'windChime', price: 200 }]);
    expect(purchaseDecor(rich(r.home), 'windChime', cfg)).toEqual({ ok: false, reason: 'owned' });
  });

  it('levels up at 3 and 6 owned, unlocking higher-tier decor', () => {
    let h = rich(newHomestead(1, cfg));
    const events: string[] = [];
    for (const id of ['windChime', 'planters', 'awning', 'bench', 'beehive', 'irrigation', 'glassMobile', 'dewLanterns'] as const) {
      const r = purchaseDecor(h, id, cfg);
      if (!r.ok) throw new Error(`${id}: ${r.reason}`);
      h = r.home;
      events.push(...r.events.filter((e) => e.t === 'terraceLevelUp').map((e) => `L${(e as { level: number }).level}@${h.decor.owned.length}`));
    }
    expect(events).toEqual(['L2@3', 'L3@6']);
    expect(terraceLevel(h, cfg)).toBe(3);
    expect(DECOR).toHaveLength(8);
  });

  it('sums the four passive effects and applies them', () => {
    const h = { ...newHomestead(1, cfg), decor: { owned: ['windChime', 'beehive', 'irrigation', 'dewLanterns'] as HomesteadState['decor']['owned'] } };
    expect(effectiveModifiers(h)).toEqual({ extraMoves: 1, carePointsMax: 1, rushBonus: 2, careVerbs: ['water', 'bee'] });
    expect(carePointsMax(h, cfg)).toBe(4);
    const run = startRun(h, cfg).run;
    expect(run.movesTotal).toBe(11);
    expect(run.modifiers).toEqual({ extraMoves: 1, rushBonus: 2 });
    const night = sleep({ ...h, tutorial: { ...h.tutorial, done: true } }, cfg);
    expect(night.ok && night.home.care.pointsLeft).toBe(4);
  });
});

describe('dew lanterns end to end (P2-06 AC2 rushBonus)', () => {
  /**
   * Start C01 from the homestead and play the first legal move each turn until the run ends.
   * The order is shrunk to 3 carrots so the naive bot wins regardless of C01 balance tuning.
   */
  const playC01 = (owned: HomesteadState['decor']['owned']) => {
    const base = newHomestead(7, cfg);
    const h: HomesteadState = {
      ...base,
      decor: { owned },
      tutorial: { ...base.tutorial, done: true },
      commissions: { ...base.commissions, cursor: 3, active: { ...activeFrom(COMMISSION_BY_ID.C01!), items: [{ crop: 'carrot', count: 3 }] } },
    };
    let run: RunState = startRun(h, cfg).run;
    const rushBonus = run.modifiers.rushBonus;
    while (run.status === 'playing') {
      const r = applyMove(run, pickMove(run.board, 0)!, cfg);
      if (!r.ok) throw new Error(r.reason);
      run = r.run;
    }
    return { run, rushBonus };
  };

  it('owning dewLanterns adds rushBonus conversions to the harvest rush', () => {
    const plain = playC01([]);
    const lit = playC01(['dewLanterns']);
    expect(plain.run.status).toBe('won');
    expect(lit.run.status).toBe('won');
    expect([plain.rushBonus, lit.rushBonus]).toEqual([0, 2]);
    // Same seed, same moves: the pre-rush state is identical, only the conversion count differs.
    expect(lit.run.movesLeftAtWin).toBe(plain.run.movesLeftAtWin);
    const expected = Math.min(plain.run.movesLeftAtWin!, cfg.rush.maxConversions);
    expect(plain.run.rushConversions).toBe(expected);
    expect(lit.run.rushConversions).toBe(expected + 2);
  });
});

describe('release bees (P2-07)', () => {
  const unlocked = () => ({ ...newHomestead(1, cfg), decor: { owned: ['beehive'] as HomesteadState['decor']['owned'] } });
  it('rejects when locked, used, out of points, or on a special', () => {
    expect(carePlaceBee(newHomestead(1, cfg), { x: 0, y: 0 }, cfg)).toEqual({ ok: false, reason: 'locked' });
    const h = unlocked();
    expect(carePlaceBee({ ...h, care: { ...h.care, pointsLeft: 0 } }, { x: 0, y: 0 }, cfg)).toEqual({ ok: false, reason: 'noPoints' });
    expect(carePlaceBee({ ...h, care: { ...h.care, beeUsed: true } }, { x: 0, y: 0 }, cfg)).toEqual({ ok: false, reason: 'beeUsed' });
    const withSpecial = { ...h, field: { ...h.field, rows: h.field.rows.map((r, y) => (y === 0 ? r.replace(/^T2/, 'T2h') : r)) } };
    expect(carePlaceBee(withSpecial, { x: 0, y: 0 }, cfg)).toEqual({ ok: false, reason: 'badTarget' });
    expect(carePlaceBee(h, { x: 9, y: 0 }, cfg)).toEqual({ ok: false, reason: 'badTarget' });
  });
  it('rejects a bee on a bee (badTarget), even on a fresh day', () => {
    const r = carePlaceBee(unlocked(), { x: 3, y: 3 }, cfg);
    if (!r.ok) throw new Error(r.reason);
    const nextDay = { ...r.home, care: { ...r.home.care, pointsLeft: 3, beeUsed: false } };
    expect(carePlaceBee(nextDay, { x: 3, y: 3 }, cfg)).toEqual({ ok: false, reason: 'badTarget' });
    expect(carePlaceBee(nextDay, { x: 4, y: 3 }, cfg).ok).toBe(true);
  });
  it('places a new-uid bee, keeps the field quiet, and the bee starts the next run', () => {
    const h = unlocked();
    const r = carePlaceBee(h, { x: 3, y: 3 }, cfg);
    if (!r.ok) throw new Error(r.reason);
    expect(r.events).toEqual([{ t: 'beePlaced', pos: { x: 3, y: 3 }, uid: 50, replacedUid: h.field.uids[24] }]);
    expect(r.home.uidCounter).toBe(51);
    expect(r.home.care).toMatchObject({ pointsLeft: 2, beeUsed: true });
    expect(findGroups(fieldBoard(r.home).cells)).toEqual([]);
    expect(startRun(r.home, cfg).run.board.cells[24]).toEqual({ uid: 50, kind: 'bee' });
  });
});
