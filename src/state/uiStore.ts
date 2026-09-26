import { create } from 'zustand';
import type { Move, Pos } from '@/core/board/model';
import type { TipId } from '@/core/config/tips';

export type Panel = 'none' | 'shop' | 'settings';

export interface UiStore {
  careMode: 'none' | 'water' | 'bee';
  hoverRow: number | null;
  hoverCell: Pos | null;
  /** G3 forced watering: only this row is accepted (02 §11.4). */
  guideRow: number | null;
  tooltip: { x: number; y: number; text: string } | null;
  debugOpen: boolean;
  /** Night sequence: veil falls (dark) → morning reveal plays the growth wave (dawn). */
  nightPhase: 'dark' | 'dawn' | null;
  tips: { id: TipId; text: string }[];
  panel: Panel;
  briefReadOnly: boolean;
  /** Idle hint (02 §4.3): the two tiles wiggle. */
  hint: Move | null;
  /** Hold-to-preview tomorrow's stages (P2-19). */
  tomorrow: boolean;
  photoPose: 0 | 1 | 2;
  locked: boolean;
  contextLost: boolean;
  /** Harvest rush is playing: show the skip button. */
  rush: boolean;
  lastPurchase: { id: string; n: number } | null;
}

export const useUiStore = create<UiStore>(() => ({
  careMode: 'none',
  hoverRow: null,
  hoverCell: null,
  guideRow: null,
  tooltip: null,
  debugOpen: false,
  nightPhase: null,
  tips: [],
  panel: 'none',
  briefReadOnly: false,
  hint: null,
  tomorrow: false,
  photoPose: 0,
  locked: false,
  contextLost: false,
  rush: false,
  lastPurchase: null,
}));
