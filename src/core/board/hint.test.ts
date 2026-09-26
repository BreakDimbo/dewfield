import { describe, expect, it } from 'vitest';
import { VS_TUNABLES } from '@/core/config/tunables';
import { checker } from '@/core/testkit/checker';
import { sandboxCommission, t1Run } from '@/core/testkit/runs';
import { createRun } from '@/core/run/run';
import { directedMoves, hintScore, pickHint } from './hint';
import { previewMove } from './preview';

const cfg = VS_TUNABLES;

describe('hint (P2-18, 02 §4.3)', () => {
  it('prefers creating a sickle over a plain triple', () => {
    const board = checker({ '0,3': 'C2', '1,3': 'C2', '2,2': 'C2', '3,3': 'C2', '2,3': 'E0', '6,6': 'B1', '5,5': 'B1', '4,6': 'B1' });
    const run = createRun({ commission: sandboxCommission([{ crop: 'carrot', count: 5 }]), board, seed: 1, uidCounter: 60 }, cfg);
    const h = pickHint(run, cfg)!;
    expect(h.preview.created.map((c) => c.kind)).toEqual(['sickleH']);
    expect(h.move).toEqual({ a: { x: 2, y: 2 }, b: { x: 2, y: 3 } });
  });

  it('scores are the documented weighted sum', () => {
    const run = t1Run(cfg);
    const p = previewMove(run, { a: { x: 6, y: 5 }, b: { x: 6, y: 6 } }, cfg);
    expect(hintScore(p)).toBe(10 * 3 + 3 * p.growth.length + 3);
    expect(hintScore({ ...p, valid: false })).toBe(-1);
  });

  it('breaks ties by a.index then b.index', () => {
    const board = checker({ '0,0': 'C2', '1,0': 'C2', '3,0': 'C2', '0,6': 'E2', '1,6': 'E2', '3,6': 'E2' });
    const run = createRun({ commission: sandboxCommission([{ crop: 'tomato', count: 1 }]), board, seed: 1, uidCounter: 60 }, cfg);
    const moves = directedMoves(run);
    for (let i = 1; i < moves.length; i++) {
      const a = moves[i - 1]!;
      const b = moves[i]!;
      expect(a.a.y * 7 + a.a.x <= b.a.y * 7 + b.a.x).toBe(true);
    }
    const h = pickHint(run, cfg)!;
    const top = moves.filter((m) => hintScore(previewMove(run, m, cfg)) === h.score);
    expect(h.move).toEqual(top[0]);
  });
});
