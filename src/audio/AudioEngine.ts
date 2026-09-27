/** 03 §11 audio seam. HowlerEngine (sprite assets, P2-12) will implement the same interface. */
export interface AudioEngine {
  unlock(): void;
  play(id: SfxId, opts?: { rate?: number; volume?: number }): void;
  music(track: MusicId | null, opts?: { fadeMs?: number }): void;
  setBus(bus: 'music' | 'sfx', v: number): void;
  setMaster(v: number): void;
  mute(m: boolean): void;
}

/** Sprite ids rendered by tools/audio/render.ts (public/audio/sfx.json). */
export type SfxId =
  | 'swap'
  | 'reject'
  | 'tick'
  | 'harvest0'
  | 'harvest1'
  | 'harvest2'
  | 'sickle'
  | 'dew'
  | 'bee'
  | 'created'
  | 'combo'
  | 'grow'
  | 'land'
  | 'orderDone'
  | 'fanfare'
  | 'sigh'
  | 'tap'
  | 'confirm'
  | 'open'
  | 'close'
  | 'water'
  | 'night'
  | 'purchase'
  | 'levelUp'
  | 'rush';

export type MusicId = 'morning' | 'dusk' | 'match';

/** Pentatonic cascade ladder (01 §14, 03 §11): semitone offsets per depth. */
export const CASCADE_STEPS = [0, 2, 4, 7, 9, 12, 14, 16];
export const cascadeRate = (depth: number, max = 8) => 2 ** (CASCADE_STEPS[Math.min(max, CASCADE_STEPS.length, Math.max(1, depth)) - 1]! / 12);
