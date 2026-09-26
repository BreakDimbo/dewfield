import { CROP_IDS, type CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { nextInt, pickWeighted, shuffle as shuffleArr, type RngState } from '@/core/rng/rng';
import { invariant } from '@/core/util/invariant';
import type { BoardEvent } from './events';
import { findGroups } from './match';
import { H, N, W, isCrop, makeBoard, posOf, type Board, type Stage, type Tile } from './model';
import { countValidMoves } from './moves';
import { toPermille } from './refill';

type Grid = (Tile | null)[];

const cropAt = (g: Grid, x: number, y: number): CropId | null => {
  if (x < 0 || x >= W || y < 0 || y >= H) return null;
  const t = g[y * W + x];
  return isCrop(t) ? t.crop : null;
};

/** Would placing `crop` at i complete a run of ≥3 with the tiles already present (nulls = unassigned)? */
export function wouldMatch(g: Grid, i: number, crop: CropId): boolean {
  const x = i % W;
  const y = Math.floor(i / W);
  const line = (dx: number, dy: number) => {
    let n = 1;
    for (let k = 1; cropAt(g, x + dx * k, y + dy * k) === crop; k++) n++;
    for (let k = 1; cropAt(g, x - dx * k, y - dy * k) === crop; k++) n++;
    return n >= 3;
  };
  return line(1, 0) || line(0, 1);
}

/** Assign crops to `slots` in index order, avoiding runs; other cells are fixed. Mutates g. */
function assignCrops(g: Grid, slots: readonly number[], rng: RngState, make: (i: number, crop: CropId) => Tile) {
  let r = rng;
  for (const i of slots) g[i] = null;
  for (const i of slots) {
    const options = CROP_IDS.filter((c) => !wouldMatch(g, i, c));
    const pool = options.length > 0 ? options : CROP_IDS;
    const [k, next] = nextInt(r, 0, pool.length);
    r = next;
    g[i] = make(i, pool[k]!);
  }
  return r;
}

/** 02 §1.9 generation (tests, sim, fallback). */
export function generateBoard(
  rng: RngState,
  stageWeights: readonly number[],
  cfg: Tunables,
  uidStart = 1,
): { board: Board; rng: RngState; nextUid: number } {
  const sw = toPermille(stageWeights);
  let r = rng;
  for (let attempt = 0; attempt < 100; attempt++) {
    const g: Grid = new Array<Tile | null>(N).fill(null);
    const stages: Stage[] = [];
    for (let i = 0; i < N; i++) {
      const [s, next] = pickWeighted(r, sw);
      r = next;
      stages.push(s as Stage);
    }
    r = assignCrops(
      g,
      Array.from({ length: N }, (_, i) => i),
      r,
      (i, crop) => ({ uid: uidStart + i, kind: 'crop', crop, stage: stages[i]!, special: null }),
    );
    if (countValidMoves(g) >= cfg.board.minValidMoves && findGroups(g).length === 0)
      return { board: makeBoard(g as Tile[]), rng: r, nextUid: uidStart + N };
  }
  /* c8 ignore next */
  invariant(false, 'generateBoard: could not reach minValidMoves in 100 attempts');
}

export interface ShuffleResult {
  board: Board;
  rng: RngState;
  events: BoardEvent[];
}

/** 02 §1.8: permute positions until quiet with ≥ minValidMoves; otherwise recolor plain crops. */
export function shuffleBoard(board: Board, rng: RngState, cfg: Tunables): ShuffleResult {
  let r = rng;
  let perm: Tile[] = board.cells.slice();
  const accept = (g: readonly (Tile | null)[]) =>
    findGroups(g).length === 0 && countValidMoves(g) >= cfg.board.minValidMoves;
  const moved = (after: readonly Tile[]): BoardEvent => {
    const from = new Map(board.cells.map((t, i) => [t.uid, i]));
    return {
      t: 'shuffle',
      items: after.map((t, i) => ({ uid: t.uid, from: posOf(from.get(t.uid)!), to: posOf(i) })),
    };
  };
  for (let attempt = 0; attempt < cfg.board.shuffleMaxAttempts; attempt++) {
    const [p, next] = shuffleArr(r, board.cells);
    r = next;
    perm = p;
    if (accept(perm)) return { board: makeBoard(perm), rng: r, events: [moved(perm)] };
  }
  const events: BoardEvent[] = [moved(perm)];
  const slots = perm.flatMap((t, i) => (isCrop(t) && t.special === null ? [i] : []));
  for (let attempt = 0; attempt < 100; attempt++) {
    const g: Grid = perm.slice();
    r = assignCrops(g, slots, r, (i, crop) => ({ ...(perm[i] as Tile & { kind: 'crop' }), crop }));
    if (accept(g)) {
      const items = slots.flatMap((i) => {
        const before = perm[i] as Tile & { kind: 'crop' };
        const after = g[i] as Tile & { kind: 'crop' };
        return before.crop === after.crop ? [] : [{ uid: after.uid, pos: posOf(i), crop: after.crop }];
      });
      events.push({ t: 'recolor', items });
      return { board: makeBoard(g as Tile[]), rng: r, events };
    }
  }
  /* c8 ignore next */
  invariant(false, 'shuffleBoard: recolor fallback failed');
}

export interface LegalizeResult extends ShuffleResult {
  fixes: number;
}

/** 02 §1.9 start-of-run safety net. Returns the same board reference when nothing needs fixing. */
export function legalizeBoard(board: Board, rng: RngState, cfg: Tunables): LegalizeResult {
  const g: Grid = board.cells.slice();
  let fixes = 0;
  for (;;) {
    const groups = findGroups(g);
    if (groups.length === 0) break;
    const before = fixes;
    for (const grp of groups) {
      const candidates = grp.cells.filter((i) => {
        const t = g[i];
        return isCrop(t) && t.special === null;
      });
      if (candidates.length === 0) continue;
      const pick = candidates.reduce((best, i) => {
        const tb = g[best] as Tile & { kind: 'crop' };
        const ti = g[i] as Tile & { kind: 'crop' };
        return ti.stage < tb.stage || (ti.stage === tb.stage && i > best) ? i : best;
      });
      const t = g[pick] as Tile & { kind: 'crop' };
      g[pick] = null;
      const crop = CROP_IDS.find((c) => !wouldMatch(g, pick, c)) ?? t.crop;
      g[pick] = { ...t, crop };
      fixes++;
    }
    invariant(fixes > before, 'legalizeBoard: a match made only of specials cannot be fixed');
  }
  const fixed = fixes > 0 ? makeBoard(g as Tile[]) : board;
  if (countValidMoves(fixed.cells) > 0) return { board: fixed, rng, events: [], fixes };
  const sh = shuffleBoard(fixed, rng, cfg);
  return { ...sh, fixes };
}
