import type { CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { H, W, type SpecialKind, type Tile } from './model';

export type Shape = 'line3' | 'line4' | 'line5' | 'cross';

export interface Run {
  readonly dir: 'h' | 'v';
  readonly crop: CropId;
  /** Indices, ascending (top/left first). */
  readonly cells: readonly number[];
}

export interface MatchGroup {
  readonly crop: CropId;
  /** Indices, ascending. */
  readonly cells: readonly number[];
  /** In scan order: all rows first, then all columns. */
  readonly runs: readonly Run[];
  readonly shape: Shape;
}

type Grid = readonly (Tile | null | undefined)[];

const cropAt = (g: Grid, i: number): CropId | null => {
  const t = g[i];
  return t && t.kind === 'crop' ? t.crop : null;
};

/** Maximal runs of ≥3 same-crop tiles. Bees and empty cells break runs; stage/special are ignored (02 §1.4). */
export function findRuns(g: Grid): Run[] {
  const runs: Run[] = [];
  const scan = (dir: 'h' | 'v', lines: number, len: number, at: (line: number, k: number) => number) => {
    for (let line = 0; line < lines; line++) {
      let k = 0;
      while (k < len) {
        const c = cropAt(g, at(line, k));
        let end = k + 1;
        if (c !== null) while (end < len && cropAt(g, at(line, end)) === c) end++;
        if (c !== null && end - k >= 3) {
          const cells: number[] = [];
          for (let j = k; j < end; j++) cells.push(at(line, j));
          runs.push({ dir, crop: c, cells });
        }
        k = end;
      }
    }
  };
  scan('h', H, W, (y, x) => y * W + x);
  scan('v', W, H, (x, y) => y * W + x);
  return runs;
}

function shapeOf(runs: readonly Run[]): Shape {
  if (runs.some((r) => r.cells.length >= 5)) return 'line5';
  if (runs.some((r) => r.dir === 'h') && runs.some((r) => r.dir === 'v')) return 'cross';
  if (runs.some((r) => r.cells.length === 4)) return 'line4';
  return 'line3';
}

/** Runs sharing a cell merge into one group (connected components). Sorted by smallest cell index. */
export function findGroups(g: Grid): MatchGroup[] {
  const runs = findRuns(g);
  if (runs.length === 0) return [];
  const parent = runs.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const owner = new Map<number, number>();
  runs.forEach((r, ri) => {
    for (const c of r.cells) {
      const o = owner.get(c);
      if (o === undefined) owner.set(c, ri);
      else parent[find(ri)] = find(o);
    }
  });
  const byRoot = new Map<number, number[]>();
  runs.forEach((_, ri) => {
    const root = find(ri);
    const list = byRoot.get(root);
    if (list) list.push(ri);
    else byRoot.set(root, [ri]);
  });
  const groups: MatchGroup[] = [];
  for (const members of byRoot.values()) {
    const groupRuns = members.map((ri) => runs[ri]!);
    const cells = [...new Set(groupRuns.flatMap((r) => r.cells))].sort((a, b) => a - b);
    groups.push({ crop: groupRuns[0]!.crop, cells, runs: groupRuns, shape: shapeOf(groupRuns) });
  }
  return groups.sort((a, b) => a.cells[0]! - b.cells[0]!);
}

const sickleFor = (dir: 'h' | 'v', cfg: Tunables): SpecialKind => {
  const parallel = cfg.special.sickleOrientation === 'parallel';
  return (dir === 'h') === parallel ? 'sickleH' : 'sickleV';
};

const firstLongRun = (g: MatchGroup, min: number): Run => g.runs.find((r) => r.cells.length >= min)!;

/** 02 §1.4 shape → special. `line5` falls back to a sickle along the ≥5 run while bees are disabled. */
export function specialForGroup(group: MatchGroup, cfg: Tunables): SpecialKind | null {
  switch (group.shape) {
    case 'line5':
      return cfg.special.beeEnabled ? 'bee' : sickleFor(firstLongRun(group, 5).dir, cfg);
    case 'cross':
      return 'dewOrb';
    case 'line4':
      return sickleFor(firstLongRun(group, 4).dir, cfg);
    default:
      return null;
  }
}

/**
 * 02 §1.5. `swap` is only given for step 1 of a move that had no step 0: b wins over a.
 * Otherwise: cross → smallest-index intersection; lines → offset floor((len-1)/2) from the top/left.
 */
export function creationIndex(group: MatchGroup, swap: { a: number; b: number } | null): number | null {
  if (group.shape === 'line3') return null;
  if (swap) {
    if (group.cells.includes(swap.b)) return swap.b;
    if (group.cells.includes(swap.a)) return swap.a;
  }
  if (group.shape === 'cross') {
    const inH = new Set(group.runs.filter((r) => r.dir === 'h').flatMap((r) => r.cells));
    const inV = new Set(group.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells));
    const hits = group.cells.filter((c) => inH.has(c) && inV.has(c));
    return hits[0]!;
  }
  const run = firstLongRun(group, group.shape === 'line5' ? 5 : 4);
  return run.cells[Math.floor((run.cells.length - 1) / 2)]!;
}

/** True if a run of ≥3 passes through i. */
export function hasMatchAt(g: Grid, i: number): boolean {
  const c = cropAt(g, i);
  if (c === null) return false;
  const x = i % W;
  const y = (i - x) / W;
  let n = 1;
  for (let k = x - 1; k >= 0 && cropAt(g, y * W + k) === c; k--) n++;
  for (let k = x + 1; k < W && cropAt(g, y * W + k) === c; k++) n++;
  if (n >= 3) return true;
  n = 1;
  for (let k = y - 1; k >= 0 && cropAt(g, k * W + x) === c; k--) n++;
  for (let k = y + 1; k < H && cropAt(g, k * W + x) === c; k++) n++;
  return n >= 3;
}

export function hasAnyMatch(g: Grid): boolean {
  for (let i = 0; i < g.length; i++) if (hasMatchAt(g, i)) return true;
  return false;
}
