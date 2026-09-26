import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables } from '@/core/config/tunables';
import { creationIndex, findGroups, hasAnyMatch, hasMatchAt, specialForGroup } from './match';
import { at, grid } from './testkit';

const one = (s: string) => {
  const gs = findGroups(grid(s).cells);
  expect(gs).toHaveLength(1);
  return gs[0]!;
};

describe('findGroups — shapes (02 §1.4)', () => {
  it('horizontal 3 → line3, no special', () => {
    const g = one(`
      C2 C1 C0 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('line3');
    expect(g.cells).toEqual([0, 1, 2]);
    expect(specialForGroup(g, DEFAULT_TUNABLES)).toBeNull();
    expect(creationIndex(g, null)).toBeNull();
  });

  it('vertical 3 → line3', () => {
    const g = one(`
      . . . . . . T2
      . . . . . . T2
      . . . . . . T2
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('line3');
    expect(g.runs[0]!.dir).toBe('v');
  });

  it('horizontal 4 → sickleH (parallel)', () => {
    const g = one(`
      . . . . . . .
      . . . . . . .
      . . . . . . .
      M2 M2 M2 M2 . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('line4');
    expect(specialForGroup(g, DEFAULT_TUNABLES)).toBe('sickleH');
  });

  it('vertical 4 → sickleV; perpendicular flips it', () => {
    const g = one(`
      . . . . . . .
      . . . E2 . . .
      . . . E2 . . .
      . . . E2 . . .
      . . . E2 . . .
      . . . . . . .
      . . . . . . .`);
    expect(specialForGroup(g, DEFAULT_TUNABLES)).toBe('sickleV');
    expect(specialForGroup(g, withTunables({ special: { sickleOrientation: 'perpendicular' } }))).toBe('sickleH');
  });

  it('horizontal 5 → bee; with bees disabled → sickle along the run', () => {
    const g = one(`
      . . . . . . .
      . B2 B2 B2 B2 B2 .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('line5');
    expect(specialForGroup(g, DEFAULT_TUNABLES)).toBe('bee');
    expect(specialForGroup(g, VS_TUNABLES)).toBe('sickleH');
  });

  it('vertical 5 with bees disabled → sickleV', () => {
    const g = one(`
      C1 . . . . . .
      C1 . . . . . .
      C1 . . . . . .
      C1 . . . . . .
      C1 . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(specialForGroup(g, VS_TUNABLES)).toBe('sickleV');
  });

  it('6 and 7 long runs are line5', () => {
    const g = one(`
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      T0 T0 T0 T0 T0 T0 T0`);
    expect(g.shape).toBe('line5');
    expect(creationIndex(g, null)).toBe(at(3, 6));
  });

  it('L shape → cross → dewOrb at the corner', () => {
    const g = one(`
      C2 . . . . . .
      C2 . . . . . .
      C2 C2 C2 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('cross');
    expect(g.cells).toHaveLength(5);
    expect(specialForGroup(g, DEFAULT_TUNABLES)).toBe('dewOrb');
    expect(creationIndex(g, null)).toBe(at(0, 2));
  });

  it('T shape → cross at the junction', () => {
    const g = one(`
      . . . . . . .
      . M1 M1 M1 . . .
      . . M1 . . . .
      . . M1 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('cross');
    expect(creationIndex(g, null)).toBe(at(2, 1));
  });

  it('plus shape → cross at the centre', () => {
    const g = one(`
      . . . . . . .
      . . . B2 . . .
      . . B2 B2 B2 . .
      . . . B2 . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('cross');
    expect(creationIndex(g, null)).toBe(at(3, 2));
  });

  it('H shape → one cross group, smallest-index intersection', () => {
    const g = one(`
      . . . . . . .
      . E2 . E2 . . .
      . E2 E2 E2 . . .
      . E2 . E2 . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('cross');
    expect(g.runs).toHaveLength(3);
    expect(g.cells).toHaveLength(7);
    expect(creationIndex(g, null)).toBe(at(1, 2));
  });

  it('T with a 4-long arm is still cross (cross > line4)', () => {
    const g = one(`
      . . . . . . .
      . C2 C2 C2 C2 . .
      . . C2 . . . .
      . . C2 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('cross');
  });

  it('L with a 5-long arm is line5 (line5 > cross)', () => {
    const g = one(`
      T2 T2 T2 T2 T2 . .
      T2 . . . . . .
      T2 . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    expect(g.shape).toBe('line5');
    expect(creationIndex(g, null)).toBe(at(2, 0));
  });

  it('two ≥5 runs: the first in scan order (rows before columns) positions the special', () => {
    const g = one(`
      . . . . . . M2
      . . . . . . M2
      . . . . . . M2
      . . . . . . M2
      . . M2 M2 M2 M2 M2
      . . . . . . .
      . . . . . . .`);
    expect(g.runs[0]!.dir).toBe('h');
    expect(creationIndex(g, null)).toBe(at(4, 4));
  });

  it('parallel adjacent runs that share no cell stay separate groups', () => {
    const gs = findGroups(
      grid(`
      . . . . . . .
      C2 C2 C2 . . . .
      C2 C2 C2 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells,
    );
    expect(gs).toHaveLength(2);
    expect(gs.map((g) => g.shape)).toEqual(['line3', 'line3']);
    expect(gs[0]!.cells[0]).toBeLessThan(gs[1]!.cells[0]!);
  });

  it('bees truncate runs', () => {
    expect(
      findGroups(
        grid(`
      C2 C2 . C2 C2 . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells,
      ),
    ).toEqual([]);
  });

  it('specials match by crop; stages do not matter', () => {
    const g = one(`
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . T0 T1h T2d . .
      . . . . . . .
      . . . . . . .`);
    expect(g.crop).toBe('tomato');
    expect(g.cells).toEqual([at(2, 4), at(3, 4), at(4, 4)]);
  });

  it('different crops never match', () => {
    expect(
      findGroups(
        grid(`
      C2 T2 C2 T2 . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells,
      ),
    ).toEqual([]);
  });

  it('several groups of different crops are sorted by first cell', () => {
    const gs = findGroups(
      grid(`
      . . . . . . .
      . . . . B2 B2 B2
      . . . . . . .
      M1 M1 M1 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells,
    );
    expect(gs.map((g) => g.crop)).toEqual(['blueberry', 'corn']);
  });

  it('a run through a gap of empty cells is broken', () => {
    const cells = grid(`
      C2 C2 C2 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells.map((t, i) => (i === 1 ? null : t));
    expect(findGroups(cells)).toEqual([]);
  });
});

describe('creationIndex (02 §1.5)', () => {
  const g4 = () =>
    one(`
      . . . . . . .
      . . . . . . .
      C2 C2 C2 C2 . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);

  it('step 1: b wins', () => {
    expect(creationIndex(g4(), { a: at(1, 1), b: at(1, 2) })).toBe(at(1, 2));
  });

  it('step 1: a when b is not in the group', () => {
    expect(creationIndex(g4(), { a: at(3, 2), b: at(3, 1) })).toBe(at(3, 2));
  });

  it('step 1 with neither a nor b in the group falls back to the offset rule', () => {
    expect(creationIndex(g4(), { a: at(6, 6), b: at(5, 6) })).toBe(at(1, 2));
  });

  it('cascade: line4 at floor((len-1)/2)', () => {
    expect(creationIndex(g4(), null)).toBe(at(1, 2));
  });

  it('cascade: vertical line5 at offset 2', () => {
    const g = one(`
      . . . . . E0 .
      . . . . . E0 .
      . . . . . E0 .
      . . . . . E0 .
      . . . . . E0 .
      . . . . . . .
      . . . . . . .`);
    expect(creationIndex(g, null)).toBe(at(5, 2));
  });
});

describe('hasMatchAt / hasAnyMatch', () => {
  const b = grid(`
      . . . . . . .
      . . . . . . .
      . . B2 . . . .
      . . B2 . . . .
      . . B2 C1 C1 . .
      . . . . . . .
      . . . . . . .`);
  it('detects vertical runs through a cell and ignores bees', () => {
    expect(hasMatchAt(b.cells, at(2, 3))).toBe(true);
    expect(hasMatchAt(b.cells, at(3, 4))).toBe(false);
    expect(hasMatchAt(b.cells, at(0, 0))).toBe(false);
    expect(hasAnyMatch(b.cells)).toBe(true);
    expect(hasAnyMatch(b.cells.map((t, i) => (i === at(2, 2) ? { uid: 0, kind: 'bee' as const } : t)))).toBe(false);
  });
  it('detects horizontal runs', () => {
    const h = grid(`
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . T2 T2 T2
      . . . . . . .
      . . . . . . .`);
    expect(hasMatchAt(h.cells, at(6, 4))).toBe(true);
  });
});
