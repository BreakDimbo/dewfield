import { describe, expect, it } from 'vitest';
import type { BoardEvent } from '@/core/board/events';
import { isSpecial } from '@/core/board/model';
import { countValidMoves } from '@/core/board/moves';
import { hashBoard } from '@/core/board/model';
import { replayEvents } from '@/core/board/replay';
import { DEFAULT_TUNABLES, withTunables } from '@/core/config/tunables';
import { checker } from '@/core/testkit/checker';
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
