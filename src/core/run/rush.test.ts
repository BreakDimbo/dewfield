import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { BoardEvent } from '@/core/board/events';
import { isSpecial, type Board } from '@/core/board/model';
import { countValidMoves } from '@/core/board/moves';
import { hashBoard } from '@/core/board/model';
import { replayEvents } from '@/core/board/replay';
import { resolveRush, type Ledger } from '@/core/board/resolve';
import { grid } from '@/core/board/testkit';
import { DEFAULT_TUNABLES, withTunables } from '@/core/config/tunables';
import { createRng, nextInt } from '@/core/rng/rng';
import { checker, keys } from '@/core/testkit/checker';
import { scenarioBoard } from '@/core/testkit/scenario';
import { mv, sandboxCommission, t1Run } from '@/core/testkit/runs';
import { applyMove, createRun } from './run';

const cfg = DEFAULT_TUNABLES;
const win = (moves: number, rushBonus = 0, c = cfg) => {
  const board = checker({ '0,6': 'C2', '1,6': 'C2', '2,5': 'C2' });
  const run = createRun(
    { commission: sandboxCommission([{ crop: 'carrot', count: 3 }], moves), board, seed: 9, uidCounter: 60, modifiers: { extraMoves: 0, rushBonus } },
    c,
  );
  const r = applyMove(run, mv(2, 5, 2, 6), c);
  if (!r.ok) throw new Error();
  return { run, r };
};
const pick = <T extends BoardEvent['t']>(ev: BoardEvent[], t: T) => ev.filter((e): e is Extract<BoardEvent, { t: T }> => e.t === t);

describe('harvest rush (P2-03, 02 §5.5)', () => {
  it('converts min(movesLeft, max) + bonus plain crops into alternating sickles', () => {
    const { r } = win(8, 2);
    const start = pick(r.events, 'rushStart')[0]!;
    expect(start.conversions).toBe(7 + 2);
    const conv = pick(r.events, 'convert').find((c) => c.cause === 'rush')!;
    expect(conv.items).toHaveLength(9);
    const kinds = conv.items.map((i) => i.kind);
    expect(kinds.filter((k) => k === 'sickleH').length - kinds.filter((k) => k === 'sickleV').length).toBeLessThanOrEqual(1);
    expect(r.run.rushConversions).toBe(9);
    expect(pick(r.events, 'rushEnd')).toHaveLength(1);
    expect(r.events.at(-1)).toEqual({ t: 'runEnded', result: 'won' });
  });

  it('caps at rush.maxConversions', () => {
    const { r } = win(30, 0, withTunables({ rush: { maxConversions: 4 } }));
    expect(pick(r.events, 'rushStart')[0]!.conversions).toBe(4);
  });

  it('ends with no specials (or the iteration cap), a playable board, movesLeft 0, stars from the pre-rush ratio', () => {
    const { run, r } = win(10);
    expect(r.run.board.cells.some(isSpecial)).toBe(false);
    expect(countValidMoves(r.run.board.cells)).toBeGreaterThan(0);
    expect(r.run.movesLeft).toBe(0);
    expect(r.run.movesLeftAtWin).toBe(9);
    expect(replayEvents(run.board, r.events)).toEqual(r.run.board);
    const surplus = Object.values(r.run.surplus).reduce((s, v) => s + (v ?? 0), 0);
    expect(surplus + r.run.dewdropsEarned).toBeGreaterThan(0);
    expect(r.run.delivered.carrot).toBe(3);
  });

  it('is deterministic and never runs for tutorial commissions', () => {
    expect(hashBoard(win(10).r.run.board)).toBe(hashBoard(win(10).r.run.board));
    let run = t1Run(cfg);
    for (const m of [mv(6, 5, 6, 6), mv(2, 2, 2, 3), mv(3, 5, 2, 5)]) run = (applyMove(run, m, cfg) as { run: typeof run }).run;
    expect(run.status).toBe('won');
    expect(run.rushConversions).toBe(0);
    expect(run.movesLeft).toBe(7);
  });

  it('respects the iteration cap', () => {
    const { r } = win(12, 0, withTunables({ rush: { maxIterations: 1 } }));
    expect(pick(r.events, 'rushEnd')).toHaveLength(1);
  });
});

describe('resolveRush directly (P2-03 AC1–AC2, 02 §5.5)', () => {
  const ledger = (): Ledger => ({ remaining: { carrot: 5 }, delivered: { carrot: 3 }, surplus: {}, dewdrops: 0 });
  const rush = (board: Board, conversions: number, seed = 5, c = cfg) => {
    const out = resolveRush({ board, rng: createRng(seed), uidCounter: 500, spawnQueue: [], ledger: ledger() }, conversions, c);
    expect(JSON.stringify(replayEvents(board, out.events))).toBe(JSON.stringify(out.board));
    return out;
  };
  /** Rounds of the detonation loop = level-0 'rush' activations. */
  const rounds = (events: BoardEvent[]) => pick(events, 'specialTriggered').filter((t) => t.via === 'rush' && t.level === 0).length;

  it('stops converting when no plain crop is left', () => {
    // Three plain crops; the rest are bees and specials.
    const b = grid(`
      C0 . . . . . .
      . . . T1h . . .
      . . . . . . .
      . . . M2 . . .
      . . . . . . .
      . . . . . E1d .
      . . . . . . B0`);
    const out = rush(b, 12);
    expect(out.conversions).toBe(3);
    expect(pick(out.events, 'rushStart')).toEqual([{ t: 'rushStart', conversions: 3 }]);
    expect(keys(pick(out.events, 'convert')[0]!.items.map((i) => i.pos))).toEqual(['0,0', '3,3', '6,6']);
    // No plain crop at all → nothing converted, no convert event.
    const none = rush(grid(`
      . . . . . . .
      . . . C1h . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`), 12);
    expect(none.conversions).toBe(0);
    expect(pick(none.events, 'rushStart')[0]!.conversions).toBe(0);
    expect(pick(none.events, 'convert').filter((c) => c.cause === 'rush')).toHaveLength(0);
  });

  it('alternates H, V, H, … in the order the conversions are drawn', () => {
    const { board } = scenarioBoard(31, cfg, { specials: 3 });
    const n = 9;
    // Re-draw the candidates exactly as 02 §5.5 specifies to recover the conversion order.
    let rng = createRng(5);
    const plain = board.cells.map((t) => t.kind === 'crop' && t.special === null);
    const order: number[] = [];
    for (let i = 0; i < n; i++) {
      const cands = plain.flatMap((p, c) => (p ? [c] : []));
      const [k, r] = nextInt(rng, 0, cands.length);
      rng = r;
      order.push(cands[k]!);
      plain[cands[k]!] = false;
    }
    const out = rush(board, n);
    const byIdx = new Map(pick(out.events, 'convert')[0]!.items.map((i) => [i.pos.y * 7 + i.pos.x, i]));
    expect(order.map((c) => byIdx.get(c)?.kind)).toEqual(order.map((_, i) => (i % 2 === 0 ? 'sickleH' : 'sickleV')));
    // Converted tiles keep their uid (conversion is in place).
    for (const c of order) expect(byIdx.get(c)!.uid).toBe(board.cells[c]!.uid);
  });

  it('property: no specials left (or the iteration cap), ≥ 1 valid move, every yield to surplus/dewdrops', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 0, max: 20 }), fc.boolean(), (seed, n, tight) => {
        const c = tight ? withTunables({ rush: { maxIterations: 3 } }) : cfg;
        const { board } = scenarioBoard(seed, c, { specials: 4, bees: 2 });
        const out = rush(board, n, seed, c);
        const left = out.board.cells.some(isSpecial);
        expect(!left || rounds(out.events) === c.rush.maxIterations).toBe(true);
        expect(rounds(out.events)).toBeLessThanOrEqual(c.rush.maxIterations);
        expect(countValidMoves(out.board.cells)).toBeGreaterThan(0);
        expect(pick(out.events, 'harvest').every((h) => h.items.every((i) => !i.delivered))).toBe(true);
        expect(out.ledger.delivered).toEqual({ carrot: 3 });
        const ripe = pick(out.events, 'harvest').flatMap((h) => h.items).filter((i) => i.yield === 'crop').length;
        const unripe = pick(out.events, 'harvest').flatMap((h) => h.items).filter((i) => i.yield === 'dewdrop').length;
        expect(Object.values(out.ledger.surplus).reduce((s, v) => s + (v ?? 0), 0)).toBe(ripe);
        expect(out.ledger.dewdrops).toBe(unripe * c.economy.unripeDewdrop);
      }),
      { seed: 20260927, numRuns: 150 },
    );
  });
});
