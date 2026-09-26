import { create } from 'zustand';
import type { PreviewResult } from '@/core/board/preview';
import type { Move, Pos } from '@/core/board/model';
import type { RunPhase } from '@/core/flow/runFsm';
import type { RunState } from '@/core/run/state';

export interface RunStore {
  /** Logical run: committed immediately, ahead of what the player sees. */
  run: RunState | null;
  phase: RunPhase;
  paused: boolean;
  selected: Pos | null;
  preview: { move: Move; result: PreviewResult } | null;
  /** Tutorial suggestion (T1 guided moves) drawn as a soft hint, never a hard lock in this build. */
  guide: Move | null;
}

export const useRunStore = create<RunStore>(() => ({
  run: null,
  phase: 'ended',
  paused: false,
  selected: null,
  preview: null,
  guide: null,
}));
