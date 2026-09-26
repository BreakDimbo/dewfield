import { create } from 'zustand';
import type { CropId } from '@/core/config/crops';
import type { RunState } from '@/core/run/state';

export interface Hud {
  delivered: Partial<Record<CropId, number>>;
  movesLeft: number;
  dewdrops: number;
  undoLeft: number;
}

export interface PresentationStore {
  /** Only choreographer cues advance these numbers (03 §9.4). */
  hud: Hud;
  busy: boolean;
  timeScale: number;
  banner: { id: number; text: string; tone: 'cascade' | 'order' | 'special' } | null;
  /** Last HUD item that ticked, for the basket bounce. */
  pulse: { crop: CropId | 'dew' | 'moves'; n: number } | null;
  mismatches: number;
  cascadeDepth: number;
  /** Decorative yield icons flying from a tile (screen px) into the basket. */
  flyers: { id: number; crop: CropId; x: number; y: number }[];
}

export const hudFromRun = (run: RunState): Hud => ({
  delivered: { ...run.delivered },
  movesLeft: run.movesLeft,
  dewdrops: run.dewdropsEarned,
  undoLeft: run.undoLeft,
});

export const usePresentationStore = create<PresentationStore>(() => ({
  hud: { delivered: {}, movesLeft: 0, dewdrops: 0, undoLeft: 0 },
  busy: false,
  timeScale: 1,
  banner: null,
  pulse: null,
  mismatches: 0,
  cascadeDepth: 0,
  flyers: [],
}));

let bannerId = 0;
export function showBanner(text: string, tone: 'cascade' | 'order' | 'special'): void {
  usePresentationStore.setState({ banner: { id: ++bannerId, text, tone } });
}

let flyerId = 0;
export function launchFlyer(crop: CropId, x: number, y: number): void {
  const f = { id: ++flyerId, crop, x, y };
  usePresentationStore.setState((s) => ({ flyers: [...s.flyers.slice(-11), f] }));
}
/** Landing is bookkeeping only; pruning happens lazily on the next launch (no extra React commit). */
export function landFlyer(id: number): void {
  void id;
}

let pulseN = 0;
export function pulseHud(crop: CropId | 'dew' | 'moves'): void {
  usePresentationStore.setState({ pulse: { crop, n: ++pulseN } });
}
