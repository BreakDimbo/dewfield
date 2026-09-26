import type { CropId } from '@/core/config/crops';
import { hashValue } from '@/core/util/hash';

export type Stage = 0 | 1 | 2;
export type CropSpecial = 'sickleH' | 'sickleV' | 'dewOrb';
export type SpecialKind = CropSpecial | 'bee';

export interface CropTile {
  readonly uid: number;
  readonly kind: 'crop';
  readonly crop: CropId;
  readonly stage: Stage;
  readonly special: CropSpecial | null;
}
export interface BeeTile {
  readonly uid: number;
  readonly kind: 'bee';
}
export type Tile = CropTile | BeeTile;

export interface Pos {
  readonly x: number;
  readonly y: number;
}
/** a = the dragged tile. */
export interface Move {
  readonly a: Pos;
  readonly b: Pos;
}
export interface Board {
  readonly width: 7;
  readonly height: 7;
  readonly cells: readonly Tile[];
}

export const W = 7;
export const H = 7;
export const N = W * H;

export const idx = (p: Pos): number => p.y * W + p.x;
export const posOf = (i: number): Pos => ({ x: i % W, y: Math.floor(i / W) });
export const inBounds = (x: number, y: number): boolean => x >= 0 && x < W && y >= 0 && y < H;
export const isAdjacent = (a: Pos, b: Pos): boolean => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

/** Orthogonal in-bounds neighbours in index order (up, left, right, down). */
export function neighbors4(p: Pos): Pos[] {
  const out: Pos[] = [];
  if (p.y > 0) out.push({ x: p.x, y: p.y - 1 });
  if (p.x > 0) out.push({ x: p.x - 1, y: p.y });
  if (p.x < W - 1) out.push({ x: p.x + 1, y: p.y });
  if (p.y < H - 1) out.push({ x: p.x, y: p.y + 1 });
  return out;
}

export function neighborIdx(i: number): number[] {
  return neighbors4(posOf(i)).map(idx);
}

export function makeBoard(cells: readonly Tile[]): Board {
  if (cells.length !== N) throw new Error(`board must have ${N} cells, got ${cells.length}`);
  return { width: 7, height: 7, cells };
}

export const isCrop = (t: Tile | null | undefined): t is CropTile => !!t && t.kind === 'crop';
export const isSpecial = (t: Tile | null | undefined): boolean => !!t && (t.kind === 'bee' || t.special !== null);

export function hashBoard(b: Board): string {
  return hashValue(b.cells);
}

export function tileAt(b: Board, p: Pos): Tile {
  return b.cells[idx(p)]!;
}
