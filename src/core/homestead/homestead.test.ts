import { describe, expect, it } from 'vitest';
import { fieldFromBoard, parseBoard } from '@/core/board/ascii';
import { findGroups } from '@/core/board/match';
import { COMMISSIONS } from '@/core/config/commissions';
import { VS_TUNABLES } from '@/core/config/tunables';
import { deriveSeed } from '@/core/rng/rng';
import { applyMove } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import { mv } from '@/core/testkit/runs';
import { pickMove } from '@/core/testkit/scenario';
import {
  activateNext,
  careWaterRow,
  computeStars,
  fieldBoard,
  generateCommission,
  newHomestead,
  pickWaterRowHint,
  settleRun,
  sleep,
  startRun,
} from './homestead';

const cfg = VS_TUNABLES;

function playT1(seed = 1) {
  const home0 = newHomestead(seed, cfg);
  const started = startRun(home0, cfg);
  let run = started.run;
  for (const m of [mv(6, 5, 6, 6), mv(2, 2, 2, 3), mv(3, 5, 2, 5)]) {
    const r = applyMove(run, m, cfg);
    if (!r.ok) throw new Error('T1 move rejected');
    run = r.run;
  }
  return { home: started.home, run };
}

function burn(run: RunState): RunState {
  let r = run;
  for (let k = 0; r.status === 'playing'; k++) {
    const res = applyMove(r, pickMove(r.board, k * 13)!, cfg);
    if (!res.ok) throw new Error('bad move');
    r = res.run;
  }
  return r;
}

describe('newHomestead / startRun (P1-10)', () => {
  it('starts on day 1 with the T1 fixture as the field', () => {
    const h = newHomestead(123, cfg);
    expect(h).toMatchObject({ day: 1, phase: 'morning', uidCounter: 50, runCounter: 0, wallet: { dewdrop: 0 } });
    expect(h.field.uids).toEqual(Array.from({ length: 49 }, (_, i) => i + 1));
    expect(h.commissions.active?.id).toBe('T1');
    expect(h.commissions.cursor).toBe(1);
  });

  it('startRun derives the run seed, bumps runCounter, needs zero legalize fixes', () => {
    const h = newHomestead(9, cfg);
    const { home, run, legalizeFixes } = startRun(h, cfg);
    expect(legalizeFixes).toBe(0);
    expect(home.runCounter).toBe(1);
    expect(run.spawnQueue).toEqual(['M2', 'B2', 'M2', 'M2', 'T2', 'T2']);
    expect(run.board).toEqual(fieldBoard(h));
    const again = startRun(h, cfg).run;
    expect(again.rng).toEqual(run.rng);
    expect(startRun(home, cfg).run.rng).not.toEqual(run.rng);
    expect(() => startRun({ ...h, commissions: { ...h.commissions, active: null } }, cfg)).toThrow();
    void deriveSeed;
  });
});

describe('settleRun (P1-10, P2-04)', () => {
  it('win: writes the final board back tile-for-tile, pays out, activates T2 (day exempt)', () => {
    const { home, run } = playT1();
    const { home: h2, settlement } = settleRun(home, run, cfg);
    expect(h2.field).toEqual(fieldFromBoard(run.board));
    expect(h2.uidCounter).toBe(run.uidCounter);
    expect(settlement.result).toBe('won');
    expect(settlement.stars).toBeNull();
    expect(settlement.tutorialBonus).toBe(7 * cfg.economy.tutorialMoveBonus);
    expect(settlement.baseReward).toBe(40);
    expect(h2.wallet.dewdrop).toBe(settlement.total);
    expect(h2.commissions.active?.id).toBe('T2');
    expect(h2.commissions.completed).toEqual([{ id: 'T1', day: 1, stars: expect.any(Number), attempts: 1 }]);
    expect(h2.phase).toBe('morning');
    expect(findGroups(fieldBoard(h2).cells)).toEqual([]);
    expect(startRun(h2, cfg).legalizeFixes).toBe(0);
  });

  it('win on a regular commission moves the day to dusk and awards stars', () => {
    let { home, run } = playT1();
    home = settleRun(home, run, cfg).home;
    home = { ...home, commissions: { ...home.commissions, active: { ...home.commissions.active!, dayExempt: false, isTutorial: false, items: [{ crop: 'corn', count: 1 }] } } };
    const s = startRun(home, cfg);
    run = burn(s.run);
    const out = settleRun(s.home, run, cfg);
    expect(out.settlement.result).toBe('won');
    expect(out.home.phase).toBe('dusk');
    expect(out.home.commissions.active).toBeNull();
    expect(out.settlement.stars).toBe(3);
    expect(out.settlement.starBonus).toBe(20);
  });

  it('loss keeps partial delivery and counts the attempt; abandon settles as a loss', () => {
    const h = newHomestead(5, cfg);
    const huge = { ...h, commissions: { ...h.commissions, active: { ...h.commissions.active!, items: [{ crop: 'eggplant' as const, count: 999 }], moves: 3 } } };
    const s = startRun(huge, cfg);
    const run = burn(s.run);
    expect(run.status).toBe('lost');
    const out = settleRun(s.home, run, cfg);
    expect(out.settlement.result).toBe('lost');
    expect(out.home.commissions.active?.attempts).toBe(1);
    expect(out.home.commissions.active?.delivered.eggplant).toBe(run.delivered.eggplant ?? 0);
    expect(out.settlement.baseReward).toBe(0);
    const ab = settleRun(s.home, s.run, cfg, true);
    expect(ab.settlement.result).toBe('abandoned');
    expect(ab.home.field).toEqual(fieldFromBoard(s.run.board));
  });

  it('computeStars thresholds: exactly 0.2 and 0.4, retries fixed at 1', () => {
    const base = { movesTotal: 10, commission: { attempts: 0 } } as unknown as RunState;
    expect(computeStars({ ...base, movesLeft: 4 }, cfg)).toBe(3);
    expect(computeStars({ ...base, movesLeft: 3 }, cfg)).toBe(2);
    expect(computeStars({ ...base, movesLeft: 2 }, cfg)).toBe(2);
    expect(computeStars({ ...base, movesLeft: 1 }, cfg)).toBe(1);
    expect(computeStars({ ...base, movesLeft: 9, commission: { attempts: 1 } } as unknown as RunState, cfg)).toBe(1);
  });
});

describe('care, sleep, commissions (P1-11, P1-12, P2-05)', () => {
  it('water: +1 on the row, one point, once per row per day, refuses at 0 points', () => {
    const h = newHomestead(1, cfg);
    const sprouty = { ...h, field: { ...h.field, rows: h.field.rows.map((r) => r.replace(/2/g, '0')) } };
    const r = careWaterRow(sprouty, 3, cfg);
    if (!r.ok) throw new Error(r.reason);
    expect(r.home.care).toEqual({ pointsLeft: cfg.care.pointsBase - 1, wateredRows: [3], beeUsed: false });
    expect(r.events[0]).toMatchObject({ t: 'grow', cause: 'water' });
    expect(fieldBoard(r.home).cells.slice(21, 28).every((t) => t.kind === 'crop' && t.stage === 1)).toBe(true);
    expect(careWaterRow(r.home, 3, cfg)).toEqual({ ok: false, reason: 'rowWatered' });
    expect(careWaterRow({ ...r.home, care: { ...r.home.care, pointsLeft: 0 } }, 1, cfg)).toEqual({ ok: false, reason: 'noPoints' });
    expect(careWaterRow(r.home, 9, cfg)).toEqual({ ok: false, reason: 'badTarget' });
    const ripe = careWaterRow(h, 0, cfg);
    expect(ripe.ok && ripe.allRipe).toBe(true);
  });

  it('sleep: whole field grows, care refills, day advances, next commission activates when idle', () => {
    const h = newHomestead(1, cfg);
    const young = { ...h, phase: 'dusk' as const, care: { pointsLeft: 0, wateredRows: [1], beeUsed: true }, field: { ...h.field, rows: h.field.rows.map((r) => r.replace(/2/g, '0')) } };
    const s = sleep({ ...young, tutorial: { ...young.tutorial, done: true }, commissions: { ...young.commissions, active: null } }, cfg);
    if (!s.ok) throw new Error('gate');
    expect(s.home).toMatchObject({ day: 2, phase: 'morning', care: { pointsLeft: cfg.care.pointsBase, wateredRows: [], beeUsed: false } });
    expect(s.events[0]).toMatchObject({ t: 'grow', cause: 'overnight' });
    expect(s.home.commissions.active?.id).toBe('T2');
    expect(sleep(h, cfg)).toEqual({ ok: false, reason: 'gate' });
    const done = sleep({ ...h, tutorial: { ...h.tutorial, done: true } }, cfg);
    if (!done.ok) throw new Error('gate');
    expect(done.home.commissions.active?.id).toBe('T1');
    expect(done.events).toEqual([]);
  });

  it('procedural commissions are deterministic, 1–2 items, weighted by the field', () => {
    const h = { ...newHomestead(3, cfg), commissions: { cursor: COMMISSIONS.length, generatedCount: 0, active: null, completed: [] } };
    const a = activateNext(h, cfg);
    expect(a.commissions.active?.id).toBe('P0001');
    expect(a.commissions.generatedCount).toBe(1);
    expect(generateCommission(h, 0, cfg)).toEqual(a.commissions.active);
    for (let n = 0; n < 30; n++) {
      const c = generateCommission(h, n, cfg);
      expect(c.items.length).toBeGreaterThanOrEqual(1);
      const total = c.items.reduce((s, i) => s + i.count, 0);
      if (c.items.length === 1) expect(total).toBeGreaterThanOrEqual(20);
      expect(c.text).not.toMatch(/\{/);
      expect(c.moves).toBe(20);
    }
    const carroty = { ...h, field: fieldFromBoard(parseBoard(Array(7).fill('C2 C2 T0 C2 C2 M0 C2').join('\n')).board) };
    let carrots = 0;
    for (let n = 0; n < 200; n++) if (generateCommission(carroty, n, cfg).items.some((i) => i.crop === 'carrot')) carrots++;
    expect(carrots).toBeGreaterThan(120);
  });

  it('pickWaterRowHint picks the row with most non-ripe of the crop, ties → larger y', () => {
    const { board } = parseBoard(`
      C0 C1 T2 M2 E2 B2 T2
      T2 M2 E2 B2 T2 M2 E2
      C0 C1 T2 M2 E2 B2 T2
      T2 M2 E2 B2 T2 M2 E2
      C2 C2 T2 M2 E2 B2 T2
      T2 M2 E2 B2 T2 M2 E2
      T2 M2 E2 B2 T2 M2 E2`);
    expect(pickWaterRowHint(board, 'carrot')).toBe(2);
    expect(pickWaterRowHint(board, 'eggplant')).toBe(6);
  });
});
