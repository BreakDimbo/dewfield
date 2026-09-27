import type { AppState } from '@/core/flow/appFsm';
import { bus, type Cue } from '@/state/bus';
import { gameCfg } from '@/state/config';
import { cascadeRate, type AudioEngine, type MusicId } from './AudioEngine';

/** cue → sprite (03 §11 cueMap). Harvest voices by stage; cascade depth climbs the pentatonic ladder. */
export function cueToSound(engine: AudioEngine, c: Cue, maxSteps = 8): void {
  const rate = (depth: number) => cascadeRate(depth, maxSteps);
  switch (c.t) {
    case 'swap':
      return engine.play('swap');
    case 'reject':
      return engine.play('reject');
    case 'match':
      return engine.play('tick', { rate: rate(c.depth) });
    case 'harvest':
      if (c.stage === 2) return engine.play('harvest2', { rate: rate(c.depth), volume: c.delivered ? 1 : 0.7 });
      if (c.stage === 1) return engine.play('harvest1', { rate: rate(c.depth) });
      return engine.play('harvest0', { volume: 0.6 });
    case 'special':
      return engine.play(c.kind === 'dewOrb' ? 'dew' : c.kind === 'bee' ? 'bee' : 'sickle');
    case 'created':
      return engine.play(c.kind === 'combo' ? 'combo' : 'created');
    case 'grow':
      return engine.play('grow');
    case 'land':
      return engine.play('land', { volume: 0.6 });
    case 'orderDone':
      return engine.play('orderDone');
    case 'runEnded':
      return engine.play(c.result === 'won' ? 'fanfare' : 'sigh');
    case 'ui':
      return engine.play(c.name === 'water' ? 'water' : c.name === 'confirm' ? 'purchase' : c.name === 'night' ? 'night' : c.name === 'rush' ? 'rush' : c.name === 'levelUp' ? 'levelUp' : c.name === 'open' ? 'open' : c.name === 'close' ? 'close' : 'tap');
  }
}

/** 03 §11: music follows the app state and the time of day, crossfading 800 ms. */
export function musicFor(app: AppState, phase: 'morning' | 'dusk' | undefined): MusicId | null {
  if (app === 'boot') return null;
  if (app === 'match' || app === 'toMatch' || app === 'settlement') return 'match';
  if (app === 'night') return 'dusk';
  return phase === 'dusk' ? 'dusk' : 'morning';
}

export function startAudioDirector(engine: AudioEngine): () => void {
  return bus.on('cue', (c) => cueToSound(engine, c, gameCfg().audio.cascadeMaxSteps));
}
