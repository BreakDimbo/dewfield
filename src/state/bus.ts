import type { BoardEvent } from '@/core/board/events';
import type { AppState } from '@/core/flow/appFsm';
import type { RunState } from '@/core/run/state';

/** Presentation cue fired by the choreographer when an animation beat lands (audio listens to these). */
export type Cue =
  | { t: 'swap' }
  | { t: 'reject' }
  | { t: 'match'; depth: number; size: number }
  | { t: 'harvest'; stage: 0 | 1 | 2 | null; delivered: boolean; depth: number }
  | { t: 'special'; kind: string; level: number }
  | { t: 'created'; kind: string }
  | { t: 'grow'; count: number }
  | { t: 'land' }
  | { t: 'orderDone' }
  | { t: 'runEnded'; result: 'won' | 'lost' }
  | { t: 'ui'; name: 'tap' | 'open' | 'close' | 'confirm' | 'water' | 'night' | 'rush' | 'levelUp' };

export interface BusChannels {
  /** Logic has committed; the choreographer should play `events` and land on `run.board`. */
  boardEvents: { events: BoardEvent[]; run: RunState; kind: 'move' | 'reject' | 'care' | 'overnight' };
  /** Presented board must snap (undo, new run) without animation. */
  boardSnap: { run: RunState | null };
  cue: Cue;
  appTransition: { from: AppState; to: AppState };
}

type Handler<T> = (payload: T) => void;

export function createBus<C extends object>() {
  const handlers = new Map<keyof C, Set<Handler<never>>>();
  return {
    on<K extends keyof C>(ch: K, fn: Handler<C[K]>): () => void {
      let set = handlers.get(ch);
      if (!set) handlers.set(ch, (set = new Set()));
      set.add(fn as Handler<never>);
      return () => set.delete(fn as Handler<never>);
    },
    off<K extends keyof C>(ch: K, fn: Handler<C[K]>): void {
      handlers.get(ch)?.delete(fn as Handler<never>);
    },
    emit<K extends keyof C>(ch: K, payload: C[K]): void {
      for (const fn of [...(handlers.get(ch) ?? [])]) (fn as Handler<C[K]>)(payload);
    },
    clear(): void {
      handlers.clear();
    },
  };
}

export const bus = createBus<BusChannels>();
