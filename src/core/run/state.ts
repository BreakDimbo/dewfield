import type { Board, SpecialKind } from '@/core/board/model';
import type { ActiveCommission } from '@/core/commission/types';
import type { CropId } from '@/core/config/crops';
import type { RngState } from '@/core/rng/rng';

export interface RunStats {
  moves: number;
  maxCascadeDepth: number;
  specialsCreated: Record<SpecialKind, number>;
  combos: number;
}

/** 02 §12.9 — session state, never persisted. */
export interface RunState {
  commission: ActiveCommission;
  board: Board;
  rng: RngState;
  movesTotal: number;
  movesLeft: number;
  delivered: Partial<Record<CropId, number>>;
  surplus: Partial<Record<CropId, number>>;
  dewdropsEarned: number;
  undoLeft: number;
  undoSnapshot: Omit<RunState, 'undoSnapshot' | 'undoLeft'> | null;
  spawnQueue: string[];
  status: 'playing' | 'won' | 'lost';
  modifiers: { extraMoves: number; rushBonus: number };
  stats: RunStats;
  uidCounter: number;
  moveIndex: number;
  /** movesLeft at the moment of winning, before harvest rush spends it (02 §5.4 star ratio). */
  movesLeftAtWin: number | null;
  /** Harvest-rush conversions actually made (0 when the run had no rush). */
  rushConversions: number;
}

export const emptySpecialCounts = (): Record<SpecialKind, number> => ({ sickleH: 0, sickleV: 0, dewOrb: 0, bee: 0 });
