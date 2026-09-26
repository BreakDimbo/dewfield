import { describe, expect, it } from 'vitest';
import { VS_TUNABLES } from '@/core/config/tunables';
import { applyMove } from '@/core/run/run';
import { mv, runFromAscii, t1Run } from '@/core/testkit/runs';
import { printBoard } from '@/core/board/ascii';
import { filterGuided, guidedMove, guidedSelectable } from './tutorial';

describe('T1 guided lock (P1-23)', () => {
  it('locks each of the three steps to the highlighted pair', () => {
    let run = t1Run(VS_TUNABLES);
    for (const [ax, ay, bx, by] of [
      [6, 5, 6, 6],
      [2, 2, 2, 3],
      [3, 5, 2, 5],
    ] as const) {
      expect(guidedMove(run)).toEqual(mv(ax, ay, bx, by));
      expect(filterGuided(run, mv(0, 0, 1, 0))).toEqual({ t: 'ignore' });
      expect(filterGuided(run, mv(ax, ay, bx, by))).toEqual({ t: 'accept', move: mv(ax, ay, bx, by) });
      expect(filterGuided(run, mv(bx, by, ax, ay))).toEqual({ t: 'accept', move: mv(ax, ay, bx, by) });
      expect(guidedSelectable(run, { x: ax, y: ay })).toBe(true);
      expect(guidedSelectable(run, { x: bx, y: by })).toBe(true);
      expect(guidedSelectable(run, { x: 0, y: 0 })).toBe(false);
      const r = applyMove(run, mv(ax, ay, bx, by), VS_TUNABLES);
      if (!r.ok) throw new Error('guided move rejected');
      run = r.run;
    }
    expect(run.status).toBe('won');
    expect(guidedMove(run)).toBeNull();
  });

  it('reverse drag on step 2 still spawns the sickle at (2,3) because it is normalised', () => {
    let run = t1Run(VS_TUNABLES);
    run = (applyMove(run, mv(6, 5, 6, 6), VS_TUNABLES) as { run: typeof run }).run;
    const v = filterGuided(run, mv(2, 3, 2, 2));
    if (v.t !== 'accept') throw new Error();
    const r = applyMove(run, v.move, VS_TUNABLES);
    if (!r.ok) throw new Error();
    expect(printBoard(r.run.board).split('\n')[3]).toBe('B2 T2 C2h B2 T2 M2 B2');
  });

  it('is free outside T1 or after a failed attempt', () => {
    const free = runFromAscii(printBoard(t1Run(VS_TUNABLES).board), VS_TUNABLES);
    expect(filterGuided(free, mv(0, 0, 1, 0))).toEqual({ t: 'free' });
    const retry = { ...t1Run(VS_TUNABLES), commission: { ...t1Run(VS_TUNABLES).commission, attempts: 1 } };
    expect(guidedMove(retry)).toBeNull();
    expect(guidedSelectable(retry, { x: 0, y: 0 })).toBe(true);
  });
});
