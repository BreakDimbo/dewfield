import { generateBoard } from '@/core/board/generate';
import { makeBoard, type Board, type CropSpecial, type Move, type Tile } from '@/core/board/model';
import { findValidMoves } from '@/core/board/moves';
import { findGroups } from '@/core/board/match';
import type { Tunables } from '@/core/config/tunables';
import { createRng, nextInt, type RngState } from '@/core/rng/rng';
import { createRun } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import { sandboxCommission } from './runs';

const SPECIALS: CropSpecial[] = ['sickleH', 'sickleV', 'dewOrb'];

/** A quiet generated board, optionally sprinkled with specials and bees (placed only where they keep it quiet). */
export function scenarioBoard(
  seed: number,
  cfg: Tunables,
  opts: { specials?: number; bees?: number; stages?: readonly number[] } = {},
): { board: Board; rng: RngState; nextUid: number } {
  const gen = generateBoard(createRng(seed), opts.stages ?? [0.3, 0.4, 0.3], cfg, 1);
  let r = gen.rng;
  const cells: Tile[] = gen.board.cells.slice();
  for (let k = 0; k < (opts.specials ?? 0); k++) {
    const [i, r1] = nextInt(r, 0, 49);
    const [s, r2] = nextInt(r1, 0, 3);
    r = r2;
    const t = cells[i]!;
    if (t.kind === 'crop') cells[i] = { ...t, special: SPECIALS[s]! };
  }
  for (let k = 0; k < (opts.bees ?? 0); k++) {
    const [i, r1] = nextInt(r, 0, 49);
    r = r1;
    cells[i] = { uid: cells[i]!.uid, kind: 'bee' };
  }
  if (findGroups(cells).length > 0) throw new Error('scenario not quiet');
  return { board: makeBoard(cells), rng: r, nextUid: gen.nextUid };
}

export function scenarioRun(seed: number, cfg: Tunables, opts: Parameters<typeof scenarioBoard>[2] = {}): RunState {
  const { board, nextUid } = scenarioBoard(seed, cfg, opts);
  return createRun(
    {
      commission: sandboxCommission(
        [
          { crop: 'carrot', count: 6 },
          { crop: 'blueberry', count: 6 },
        ],
        30,
      ),
      board,
      seed: seed ^ 0x5eed,
      uidCounter: nextUid,
    },
    cfg,
  );
}

/** Both directions of every legal pair; `pick` chooses deterministically. */
export function legalMoves(board: Board): Move[] {
  return findValidMoves(board.cells).flatMap((m) => [m, { a: m.b, b: m.a }]);
}

export function pickMove(board: Board, k: number): Move | null {
  const ms = legalMoves(board);
  return ms.length === 0 ? null : ms[Math.abs(k) % ms.length]!;
}
