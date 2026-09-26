import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { hashBoard } from '@/core/board/model';
import { VS_TUNABLES } from '@/core/config/tunables';
import { hashValue } from '@/core/util/hash';
import { checker } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import { pickMove, scenarioRun } from '@/core/testkit/scenario';
import { applyMove, canUndo, createRun, runResult, undo } from './run';

const cfg = VS_TUNABLES;
const ok = (r: ReturnType<typeof applyMove>) => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r;
};

describe('createRun / applyMove (P1-07)', () => {
  it('only legal swaps cost a move; illegal ones keep the same reference', () => {
    const run = scenarioRun(1, cfg);
    const illegal = applyMove(run, mv(0, 0, 2, 0), cfg);
    expect(illegal).toMatchObject({ ok: false, reason: 'notAdjacent' });
    expect(illegal.run).toBe(run);
    const r = ok(applyMove(run, pickMove(run.board, 0)!, cfg));
    expect(r.run.movesLeft).toBe(run.movesLeft - 1);
    expect(r.run.moveIndex).toBe(1);
    expect(r.run.stats.moves).toBe(1);
  });

  it('extraMoves counts toward movesTotal', () => {
    const run = createRun(
      {
        commission: sandboxCommission([{ crop: 'carrot', count: 3 }], 20),
        board: checker({}),
        seed: 1,
        uidCounter: 60,
        modifiers: { extraMoves: 2, rushBonus: 0 },
      },
      cfg,
    );
    expect(run.movesTotal).toBe(22);
    expect(run.movesLeft).toBe(22);
  });

  it('delivered accumulates across attempts; surplus and dewdrops are tallied', () => {
    const board = checker({ '0,6': 'C2', '1,6': 'C1', '2,5': 'C2', '3,6': 'C2' });
    const commission = { ...sandboxCommission([{ crop: 'carrot', count: 4 }], 5), delivered: { carrot: 3 } };
    const run = createRun({ commission, board, seed: 1, uidCounter: 60 }, cfg);
    const r = ok(applyMove(run, mv(2, 5, 2, 6), cfg));
    expect(r.run.delivered.carrot).toBe(4);
    expect(r.run.surplus.carrot).toBeGreaterThanOrEqual(1);
    expect(r.run.dewdropsEarned).toBeGreaterThanOrEqual(1);
    expect(r.run.status).toBe('won');
    expect(runResult(r.run)).toBe('won');
    expect(r.events.at(-1)).toEqual({ t: 'runEnded', result: 'won' });
    expect(applyMove(r.run, mv(0, 0, 1, 0), cfg)).toMatchObject({ ok: false, reason: 'ended' });
  });

  it('losing: movesLeft hits 0 without completing the order', () => {
    const board = checker({ '0,6': 'C2', '1,6': 'C1', '2,5': 'C2' });
    const run = createRun(
      { commission: sandboxCommission([{ crop: 'eggplant', count: 40 }], 1), board, seed: 1, uidCounter: 60 },
      cfg,
    );
    const r = ok(applyMove(run, mv(2, 5, 2, 6), cfg));
    expect(r.run.status).toBe('lost');
    expect(r.events.at(-1)).toEqual({ t: 'runEnded', result: 'lost' });
  });

  it('is deterministic: same seed and inputs → same hash; different seeds diverge', () => {
    const play = (seed: number) => {
      let run = scenarioRun(77, cfg);
      run = { ...run, rng: createRun({ ...run, seed, board: run.board }, cfg).rng };
      for (let k = 0; k < 8 && run.status === 'playing'; k++) run = ok(applyMove(run, pickMove(run.board, k * 7)!, cfg)).run;
      return hashValue({ ...run, undoSnapshot: null });
    };
    expect(play(1)).toBe(play(1));
    expect(play(1)).not.toBe(play(2));
  });
});

describe('undo (P1-09)', () => {
  it('restores the pre-move state (including rng), only undoLeft changes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), (seed) => {
        const run = scenarioRun(seed, cfg);
        const move = pickMove(run.board, seed);
        if (!move) return;
        const after = ok(applyMove(run, move, cfg)).run;
        if (after.status !== 'playing') return;
        expect(canUndo(after)).toBe(true);
        const back = undo(after)!;
        const { undoLeft, undoSnapshot, ...rest } = back;
        const { undoLeft: u0, undoSnapshot: _s0, ...orig } = run;
        expect(rest).toEqual(orig);
        expect(undoLeft).toBe(u0 - 1);
        expect(undoSnapshot).toBeNull();
        const replayed = ok(applyMove(back, move, cfg)).run;
        expect(hashBoard(replayed.board)).toBe(hashBoard(after.board));
      }),
      { seed: 7, numRuns: 100 },
    );
  });

  it('returns null past the limit, without a snapshot, or after the run ended', () => {
    const run = scenarioRun(2, cfg);
    expect(undo(run)).toBeNull();
    const after = ok(applyMove(run, pickMove(run.board, 1)!, cfg)).run;
    const back = undo(after)!;
    const again = ok(applyMove(back, pickMove(back.board, 1)!, cfg)).run;
    expect(undo(again)).toBeNull();
    expect(undo({ ...after, status: 'lost' })).toBeNull();
  });
});
