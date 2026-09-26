import type { SpecialKind } from '@/core/board/model';
import type { ActiveCommission } from '@/core/commission/types';
import type { CropId } from '@/core/config/crops';

export type DecorId =
  | 'windChime'
  | 'planters'
  | 'awning'
  | 'beehive'
  | 'bench'
  | 'irrigation'
  | 'glassMobile'
  | 'dewLanterns';
export type DayPhase = 'morning' | 'dusk';

export interface FieldState {
  rows: string[];
  uids: number[];
}
export interface CareState {
  pointsLeft: number;
  wateredRows: number[];
  beeUsed: boolean;
}
export interface CompletedCommission {
  id: string;
  day: number;
  stars: 1 | 2 | 3;
  attempts: number;
}
export interface CommissionBook {
  cursor: number;
  generatedCount: number;
  active: ActiveCommission | null;
  completed: CompletedCommission[];
}
export interface TutorialState {
  done: boolean;
  completedSteps: string[];
  seenTips: string[];
}
export interface LifetimeStats {
  harvested: Record<CropId, number>;
  specialsCreated: Record<SpecialKind, number>;
  combos: number;
  commissionsCompleted: number;
  maxCascadeDepth: number;
  playMs: number;
}

/** 02 §12.2 */
export interface HomesteadState {
  seed: number;
  day: number;
  phase: DayPhase;
  field: FieldState;
  care: CareState;
  wallet: { dewdrop: number };
  decor: { owned: DecorId[] };
  commissions: CommissionBook;
  tutorial: TutorialState;
  stats: LifetimeStats;
  runCounter: number;
  uidCounter: number;
}
