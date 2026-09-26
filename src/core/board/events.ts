import type { CropId } from '@/core/config/crops';
import type { Shape } from './match';
import type { CropSpecial, Pos, SpecialKind, Stage } from './model';

export type Yield = 'crop' | 'dewdrop' | 'none';
export type Via = 'match' | 'chain' | 'combo' | 'swap' | 'rush';
export type GrowCause = 'neighbor' | 'dewRing' | 'water' | 'overnight';

export interface HarvestItem {
  pos: Pos;
  uid: number;
  crop: CropId | null;
  /** Stage the yield was computed from (2 when pollinated). */
  stage: Stage | null;
  yield: Yield;
  delivered: boolean;
}
export interface GrowItem {
  pos: Pos;
  uid: number;
  from: Stage;
  to: Stage;
}

/** Render contract (03 §5.4). Replaying these onto the initial board must reproduce the final board. */
export type BoardEvent =
  | { t: 'swap'; a: Pos; b: Pos; uidA: number; uidB: number }
  | { t: 'swapRejected'; a: Pos; b: Pos }
  | { t: 'cascadeStep'; depth: number }
  | { t: 'match'; groups: { crop: CropId; cells: Pos[]; shape: Shape }[] }
  | { t: 'specialTriggered'; pos: Pos; uid: number; kind: SpecialKind; via: Via; area: Pos[]; level: number }
  | { t: 'pollinate'; cells: Pos[] }
  | { t: 'harvest'; items: HarvestItem[] }
  | { t: 'specialCreated'; pos: Pos; uid: number; kind: SpecialKind; crop: CropId | null; stage: Stage | null }
  | { t: 'convert'; items: { pos: Pos; uid: number; kind: CropSpecial }[]; cause: 'bee' | 'rush' }
  | { t: 'grow'; items: GrowItem[]; cause: GrowCause }
  | { t: 'fall'; items: { uid: number; from: Pos; to: Pos }[] }
  | { t: 'spawn'; items: { uid: number; pos: Pos; token: string; entryOffset: number }[] }
  | { t: 'shuffle'; items: { uid: number; from: Pos; to: Pos }[] }
  | { t: 'recolor'; items: { uid: number; pos: Pos; crop: CropId }[] }
  | { t: 'beePlaced'; pos: Pos; uid: number; replacedUid: number }
  | { t: 'rushStart'; conversions: number }
  | { t: 'rushEnd' }
  | { t: 'runEnded'; result: 'won' | 'lost' };

export type BoardEventOf<T extends BoardEvent['t']> = Extract<BoardEvent, { t: T }>;
