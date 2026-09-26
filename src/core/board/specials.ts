import { CROP_IDS, type CropId } from '@/core/config/crops';
import type { Via } from './events';
import { H, N, W, isCrop, isSpecial, type SpecialKind, type Tile } from './model';

export type Grid = (Tile | null)[];

export interface Effect {
  cells: number[];
  ring: number[];
  pollinated: number[];
}

export interface Activation {
  i: number;
  uid: number;
  kind: SpecialKind;
  via: Via;
  area: number[];
  level: number;
}

export const kindOf = (t: Tile | null | undefined): SpecialKind | null =>
  !t ? null : t.kind === 'bee' ? 'bee' : t.special;

export const rowCells = (y: number): number[] => Array.from({ length: W }, (_, x) => y * W + x);
export const colCells = (x: number): number[] => Array.from({ length: H }, (_, y) => y * W + x);

/** Cells within Chebyshev distance r of (cx, cy), clipped, index order. */
export function square(cx: number, cy: number, r: number): number[] {
  const out: number[] = [];
  for (let y = Math.max(0, cy - r); y <= Math.min(H - 1, cy + r); y++)
    for (let x = Math.max(0, cx - r); x <= Math.min(W - 1, cx + r); x++) out.push(y * W + x);
  return out;
}

/** Cells at Chebyshev distance exactly r, clipped, index order. */
export function ring(cx: number, cy: number, r: number): number[] {
  return square(cx, cy, r).filter((i) => Math.max(Math.abs((i % W) - cx), Math.abs(Math.floor(i / W) - cy)) === r);
}

/** Crop with the most cells outside H; ties → crop order (02 §3.3). */
export function beeTarget(g: Grid, inH: readonly boolean[]): CropId | null {
  const counts = new Map<CropId, number>();
  for (let i = 0; i < N; i++) {
    const t = g[i];
    if (isCrop(t) && !inH[i]) counts.set(t.crop, (counts.get(t.crop) ?? 0) + 1);
  }
  let best: CropId | null = null;
  let bestN = 0;
  for (const c of CROP_IDS) {
    const n = counts.get(c) ?? 0;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return best;
}

export function cropCells(g: Grid, crop: CropId, exclude?: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = g[i];
    if (isCrop(t) && t.crop === crop && !exclude?.[i]) out.push(i);
  }
  return out;
}

/** 02 §3.1–3.3: the effect of a single activated special at i, given the current harvest set. */
export function effectOf(g: Grid, i: number, inH: readonly boolean[]): Effect {
  const t = g[i];
  const x = i % W;
  const y = Math.floor(i / W);
  switch (kindOf(t)) {
    case 'sickleH':
      return { cells: rowCells(y), ring: [], pollinated: [] };
    case 'sickleV':
      return { cells: colCells(x), ring: [], pollinated: [] };
    case 'dewOrb':
      return { cells: square(x, y, 1), ring: ring(x, y, 2), pollinated: [] };
    case 'bee': {
      const target = beeTarget(g, inH);
      const p = target ? cropCells(g, target, inH) : [];
      return { cells: p, ring: [], pollinated: p };
    }
    default:
      return { cells: [], ring: [], pollinated: [] };
  }
}

export interface ChainResult {
  activations: Activation[];
  ring: boolean[];
  pollinated: boolean[];
}

/**
 * 02 §3.4 chain closure: FIFO queue seeded with `triggers` (index order). Mutates `inH`, `ringOut`, `pOut`.
 * `activated` marks specials that are consumed without firing (combo/bee-swap sources).
 */
export function closeChain(
  g: Grid,
  inH: boolean[],
  triggers: readonly number[],
  opts: { via: Via; baseLevel: number; activated?: readonly number[]; ring?: boolean[]; pollinated?: boolean[] },
): ChainResult {
  const activated = new Array<boolean>(N).fill(false);
  for (const i of opts.activated ?? []) activated[i] = true;
  const ringOut = opts.ring ?? new Array<boolean>(N).fill(false);
  const pOut = opts.pollinated ?? new Array<boolean>(N).fill(false);
  const activations: Activation[] = [];
  const queue: { i: number; level: number }[] = triggers.map((i) => ({ i, level: opts.baseLevel }));
  for (const i of triggers) inH[i] = true;
  while (queue.length > 0) {
    const s = queue.shift()!;
    if (activated[s.i]) continue;
    activated[s.i] = true;
    const t = g[s.i]!;
    const eff = effectOf(g, s.i, inH);
    activations.push({
      i: s.i,
      uid: t.uid,
      kind: kindOf(t)!,
      via: s.level === opts.baseLevel ? opts.via : 'chain',
      area: eff.cells,
      level: s.level,
    });
    for (const c of eff.cells) {
      if (inH[c]) continue;
      inH[c] = true;
      if (isSpecial(g[c]) && !activated[c]) queue.push({ i: c, level: s.level + 1 });
    }
    for (const c of eff.ring) ringOut[c] = true;
    for (const c of eff.pollinated) pOut[c] = true;
  }
  return { activations, ring: ringOut, pollinated: pOut };
}
