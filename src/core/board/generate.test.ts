import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, withTunables } from '@/core/config/tunables';
import { createRng, deriveSeed } from '@/core/rng/rng';
import { grid } from '@/core/testkit/grid';
import { scenarioBoard } from '@/core/testkit/scenario';
import { parseBoard } from './ascii';
import { generateBoard, legalizeBoard, shuffleBoard, wouldMatch } from './generate';
import { findGroups, hasMatchAt } from './match';
import { makeBoard, posOf, type Move, type Tile } from './model';
import { classifySwap, countValidMoves, findValidMoves } from './moves';

const cfg = DEFAULT_TUNABLES;

function bruteForce(cells: readonly Tile[]): Move[] {
  const out: Move[] = [];
  for (let i = 0; i < 49; i++) {
    for (const j of [i + 1, i + 7]) {
      if (j >= 49 || (j === i + 1 && i % 7 === 6)) continue;
      const a = cells[i]!;
      const b = cells[j]!;
      const special = (t: Tile) => t.kind === 'bee' || t.special !== null;
      let legal: boolean;
      if ((special(a) && special(b)) || a.kind === 'bee' || b.kind === 'bee') legal = true;
      else {
        const g = cells.slice();
        g[i] = b;
        g[j] = a;
        legal = findGroups(g).some((grp) => grp.cells.includes(i) || grp.cells.includes(j));
      }
      if (legal) out.push({ a: posOf(i), b: posOf(j) });
    }
  }
  return out;
}

describe('findValidMoves (02 §1.3, §1.8)', () => {
  it('agrees with brute force on 500 random boards', () => {
    for (let s = 1; s <= 500; s++) {
      const { board } = scenarioBoard(s, cfg, { specials: s % 4, bees: s % 3 });
      expect(findValidMoves(board.cells)).toEqual(bruteForce(board.cells));
      expect(countValidMoves(board.cells)).toBe(findValidMoves(board.cells).length);
    }
  });

  it('classifySwap matches both directions', () => {
    const { board } = scenarioBoard(9, cfg);
    for (const m of findValidMoves(board.cells)) {
      expect(classifySwap(board.cells, m)).not.toBeNull();
      expect(classifySwap(board.cells, { a: m.b, b: m.a })).not.toBeNull();
    }
  });
});

describe('generateBoard (02 §1.9)', () => {
  it('10k boards: never a match, always ≥ minValidMoves, fast', () => {
    let rng = createRng(deriveSeed('gen'));
    const times: number[] = [];
    for (let k = 0; k < 10_000; k++) {
      const t0 = process.hrtime.bigint();
      const out = generateBoard(rng, [0.3, 0.4, 0.3], cfg, 1);
      times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      rng = out.rng;
      expect(findGroups(out.board.cells).length).toBe(0);
      expect(countValidMoves(out.board.cells)).toBeGreaterThanOrEqual(cfg.board.minValidMoves);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length * 0.99)]!).toBeLessThan(2);
  });

  it('is deterministic and assigns uids from uidStart', () => {
    const a = generateBoard(createRng(1), [1, 0, 0], cfg, 100);
    const b = generateBoard(createRng(1), [1, 0, 0], cfg, 100);
    expect(a.board).toEqual(b.board);
    expect(a.board.cells[0]!.uid).toBe(100);
    expect(a.nextUid).toBe(149);
    expect(a.board.cells.every((t) => t.kind === 'crop' && t.stage === 0)).toBe(true);
  });

  it('wouldMatch sees runs through the candidate in both axes', () => {
    const g = grid(`
      C2 C2 . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells.slice() as (Tile | null)[];
    g[2] = null;
    expect(wouldMatch(g, 2, 'carrot')).toBe(true);
    expect(wouldMatch(g, 2, 'tomato')).toBe(false);
  });
});

describe('shuffleBoard (02 §1.8)', () => {
  it('only permutes, and the result is quiet with enough moves', () => {
    const { board } = scenarioBoard(3, cfg, { specials: 3 });
    const out = shuffleBoard(board, createRng(5), cfg);
    const uids = (b: typeof board) => b.cells.map((t) => t.uid).sort((x, y) => x - y);
    expect(uids(out.board)).toEqual(uids(board));
    expect(findGroups(out.board.cells)).toEqual([]);
    expect(countValidMoves(out.board.cells)).toBeGreaterThanOrEqual(cfg.board.minValidMoves);
    expect(out.events.map((e) => e.t)).toEqual(['shuffle']);
    const byUid = new Map(board.cells.map((t) => [t.uid, t]));
    for (const t of out.board.cells) expect(t).toEqual(byUid.get(t.uid));
  });

  it('falls back to recolouring when permutations cannot succeed', () => {
    const allCarrot = makeBoard(
      Array.from({ length: 49 }, (_, i): Tile => ({
        uid: i + 1,
        kind: 'crop',
        crop: 'carrot',
        stage: (i % 3) as 0 | 1 | 2,
        special: i === 10 ? 'dewOrb' : null,
      })),
    );
    const out = shuffleBoard(allCarrot, createRng(1), withTunables({ board: { shuffleMaxAttempts: 10 } }));
    expect(out.events.map((e) => e.t)).toEqual(['shuffle', 'recolor']);
    expect(findGroups(out.board.cells)).toEqual([]);
    expect(countValidMoves(out.board.cells)).toBeGreaterThanOrEqual(3);
    const special = out.board.cells.find((t) => t.kind === 'crop' && t.special === 'dewOrb')!;
    expect(special).toMatchObject({ crop: 'carrot', uid: 11 });
  });
});

describe('legalizeBoard (02 §1.9)', () => {
  it('leaves a legal board untouched (same reference)', () => {
    const { board } = scenarioBoard(4, cfg);
    const out = legalizeBoard(board, createRng(1), cfg);
    expect(out.board).toBe(board);
    expect(out.fixes).toBe(0);
  });

  it('fixes the lowest-stage (then highest-index) non-special cell per group', () => {
    const base = scenarioBoard(12, cfg).board;
    const stages = [2, 1, 1] as const;
    const board = makeBoard(
      base.cells.map((t, i): Tile => (i < 3 ? { uid: t.uid, kind: 'crop', crop: 'carrot', stage: stages[i]!, special: null } : t)),
    );
    const out = legalizeBoard(board, createRng(1), cfg);
    expect(out.events).toEqual([]);
    expect(out.fixes).toBe(1);
    expect(findGroups(out.board.cells)).toEqual([]);
    const changed = out.board.cells.flatMap((t, i) => (JSON.stringify(t) !== JSON.stringify(board.cells[i]) ? [i] : []));
    expect(changed).toEqual([2]);
    expect(hasMatchAt(out.board.cells, 2)).toBe(false);
  });

  it('refuses matches made only of specials', () => {
    const b = parseBoard(
      `C2h C2v C2d T0 M1 E2 B0
      T1 M2 E0 B1 C0 T2 M0
      E1 B2 C0 M1 T2 E0 B1
      M0 T2 B1 E0 M2 C1 T0
      B2 E1 M0 T1 C2 B0 E1
      T0 C2 E1 B2 M0 T1 C0
      M1 B0 T2 C1 E1 M2 B2`,
    ).board;
    expect(() => legalizeBoard(b, createRng(1), cfg)).toThrow(/only of specials/);
  });

  it('shuffles a quiet board with no valid moves', () => {
    const rows = Array.from({ length: 7 }, (_, y) =>
      Array.from({ length: 7 }, (_, x) => ['C0', 'T0', 'M0', 'E0', 'B0'][(x + 2 * y) % 5]).join(' '),
    );
    const { board } = parseBoard(rows.join('\n'));
    expect(countValidMoves(board.cells)).toBe(0);
    const out = legalizeBoard(board, createRng(2), cfg);
    expect(out.events.length).toBeGreaterThan(0);
    expect(countValidMoves(out.board.cells)).toBeGreaterThanOrEqual(3);
  });
});
