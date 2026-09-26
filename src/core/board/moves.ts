import { hasMatchAt } from './match';
import { H, W, idx, isAdjacent, isSpecial, posOf, type Move, type Tile } from './model';

export type SwapKind = 'match' | 'combo' | 'bee';

type Grid = readonly (Tile | null)[];

/** 02 §1.3 on raw indices; restores the grid before returning. */
export function classifyIdx(g: (Tile | null)[], a: number, b: number): SwapKind | null {
  const ta = g[a]!;
  const tb = g[b]!;
  if (isSpecial(ta) && isSpecial(tb)) return 'combo';
  if (ta.kind === 'bee' || tb.kind === 'bee') return 'bee';
  if (ta.kind === 'crop' && tb.kind === 'crop' && ta.crop === tb.crop) return null;
  g[a] = tb;
  g[b] = ta;
  const ok = hasMatchAt(g, a) || hasMatchAt(g, b);
  g[a] = ta;
  g[b] = tb;
  return ok ? 'match' : null;
}

export function classifySwap(cells: Grid, move: Move): SwapKind | null {
  if (!isAdjacent(move.a, move.b)) return null;
  return classifyIdx(cells.slice(), idx(move.a), idx(move.b));
}

/** Unordered legal pairs (a has the smaller index), in index order: right neighbour before down neighbour. */
export function findValidMoves(cells: Grid): Move[] {
  const g = cells.slice();
  const out: Move[] = [];
  for (let i = 0; i < W * H; i++) {
    const x = i % W;
    if (x < W - 1 && classifyIdx(g, i, i + 1)) out.push({ a: posOf(i), b: posOf(i + 1) });
    if (i + W < W * H && classifyIdx(g, i, i + W)) out.push({ a: posOf(i), b: posOf(i + W) });
  }
  return out;
}

export function countValidMoves(cells: Grid): number {
  const g = cells.slice();
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (i % W < W - 1 && classifyIdx(g, i, i + 1)) n++;
    if (i + W < W * H && classifyIdx(g, i, i + W)) n++;
  }
  return n;
}
