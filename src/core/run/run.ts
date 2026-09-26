import type { BoardEvent } from '@/core/board/events';
import { idx, isAdjacent, type Board, type Move } from '@/core/board/model';
import { classifySwap } from '@/core/board/moves';
import { resolveMove, resolveRush, type Ledger } from '@/core/board/resolve';
import { isOrderComplete, remainingOf } from '@/core/commission/order';
import type { ActiveCommission } from '@/core/commission/types';
import type { Tunables } from '@/core/config/tunables';
import { createRng } from '@/core/rng/rng';
import { emptySpecialCounts, type RunState } from './state';

export interface CreateRunInput {
  commission: ActiveCommission;
  board: Board;
  seed: number;
  uidCounter: number;
  modifiers?: { extraMoves: number; rushBonus: number };
  spawnQueue?: readonly string[];
}

export function createRun(input: CreateRunInput, cfg: Tunables): RunState {
  const modifiers = input.modifiers ?? { extraMoves: 0, rushBonus: 0 };
  const movesTotal = input.commission.moves + modifiers.extraMoves;
  return {
    commission: input.commission,
    board: input.board,
    rng: createRng(input.seed),
    movesTotal,
    movesLeft: movesTotal,
    delivered: { ...input.commission.delivered },
    surplus: {},
    dewdropsEarned: 0,
    undoLeft: cfg.undo.perRun,
    undoSnapshot: null,
    spawnQueue: [...(input.spawnQueue ?? [])],
    status: 'playing',
    modifiers,
    stats: { moves: 0, maxCascadeDepth: 0, specialsCreated: emptySpecialCounts(), combos: 0 },
    uidCounter: input.uidCounter,
    moveIndex: 0,
    movesLeftAtWin: null,
    rushConversions: 0,
  };
}

export type RejectReason = 'notAdjacent' | 'noMatch' | 'ended';

export type ApplyResult =
  | { ok: true; run: RunState; events: BoardEvent[] }
  | { ok: false; reason: RejectReason; run: RunState; events: BoardEvent[] };

export function ledgerOf(run: RunState): Ledger {
  return {
    remaining: remainingOf(run.commission.items, run.delivered),
    delivered: { ...run.delivered },
    surplus: { ...run.surplus },
    dewdrops: run.dewdropsEarned,
  };
}

/** 02 §1.6. Illegal swaps return the same run reference and cost nothing. */
export function applyMove(run: RunState, move: Move, cfg: Tunables): ApplyResult {
  if (run.status !== 'playing') return { ok: false, reason: 'ended', run, events: [] };
  if (!isAdjacent(move.a, move.b)) return { ok: false, reason: 'notAdjacent', run, events: [] };
  if (!classifySwap(run.board.cells, move))
    return { ok: false, reason: 'noMatch', run, events: [{ t: 'swapRejected', a: move.a, b: move.b }] };

  const { undoSnapshot: _s, undoLeft: _u, ...snapshot } = run;
  const out = resolveMove(
    { board: run.board, rng: run.rng, uidCounter: run.uidCounter, spawnQueue: run.spawnQueue, ledger: ledgerOf(run) },
    move,
    cfg,
  );
  const specialsCreated = { ...run.stats.specialsCreated };
  for (const k of out.stats.created) specialsCreated[k] += 1;
  const movesLeft = run.movesLeft - 1;
  const won = isOrderComplete(run.commission.items, out.ledger.delivered);
  const status: RunState['status'] = won ? 'won' : movesLeft <= 0 ? 'lost' : 'playing';
  let final = out;
  let rushConversions = 0;
  if (won && !run.commission.isTutorial) {
    const n = Math.min(movesLeft, cfg.rush.maxConversions) + run.modifiers.rushBonus;
    const rush = resolveRush(
      { board: out.board, rng: out.rng, uidCounter: out.uidCounter, spawnQueue: out.spawnQueue, ledger: out.ledger },
      n,
      cfg,
    );
    rushConversions = rush.conversions;
    final = { ...rush, events: [...out.events, ...rush.events], ledger: { ...rush.ledger, delivered: out.ledger.delivered } };
  }
  const next: RunState = {
    ...run,
    board: final.board,
    rng: final.rng,
    movesLeft: won && !run.commission.isTutorial ? 0 : movesLeft,
    movesLeftAtWin: won ? movesLeft : null,
    rushConversions,
    delivered: final.ledger.delivered,
    surplus: final.ledger.surplus,
    dewdropsEarned: final.ledger.dewdrops,
    undoSnapshot: snapshot,
    spawnQueue: final.spawnQueue,
    status,
    stats: {
      moves: run.stats.moves + 1,
      maxCascadeDepth: Math.max(run.stats.maxCascadeDepth, out.stats.depth),
      specialsCreated,
      combos: run.stats.combos + (out.stats.combo ? 1 : 0),
    },
    uidCounter: final.uidCounter,
    moveIndex: run.moveIndex + 1,
  };
  const events = final.events;
  if (status !== 'playing') events.push({ t: 'runEnded', result: status });
  return { ok: true, run: next, events };
}

/** 02 §4.2 */
export function canUndo(run: RunState): boolean {
  return run.status === 'playing' && run.undoLeft > 0 && run.undoSnapshot !== null;
}

export function undo(run: RunState): RunState | null {
  if (!canUndo(run)) return null;
  return { ...run.undoSnapshot!, undoLeft: run.undoLeft - 1, undoSnapshot: null };
}

export function runResult(run: RunState): RunState['status'] {
  return run.status;
}

export const cellIndex = idx;
