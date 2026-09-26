import { describe, expect, it } from 'vitest';
import { cueToSound, musicFor } from './AudioDirector';
import { CASCADE_STEPS, cascadeRate, type AudioEngine, type SfxId } from './AudioEngine';
import { SynthEngine } from './SynthEngine';

function fake() {
  const plays: { id: SfxId; rate?: number }[] = [];
  const e: AudioEngine = {
    unlock: () => {},
    play: (id, o) => plays.push({ id, rate: o?.rate }),
    music: () => {},
    setBus: () => {},
    setMaster: () => {},
    mute: () => {},
  };
  return { e, plays };
}

describe('audio (P2-12)', () => {
  it('cascade depth 1–8 climbs the pentatonic ladder, capped at 8', () => {
    const rates = [1, 2, 3, 4, 5, 6, 7, 8].map((d) => cascadeRate(d));
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeGreaterThan(rates[i - 1]!);
    expect(rates[0]).toBe(1);
    expect(rates[3]).toBeCloseTo(2 ** (7 / 12));
    expect(cascadeRate(12)).toBe(cascadeRate(8));
    expect(CASCADE_STEPS).toEqual([0, 2, 4, 7, 9, 12, 14, 16]);
  });

  it('harvest voices by stage and pitches by depth', () => {
    const { e, plays } = fake();
    cueToSound(e, { t: 'harvest', stage: 2, delivered: true, depth: 3 });
    cueToSound(e, { t: 'harvest', stage: 1, delivered: false, depth: 1 });
    cueToSound(e, { t: 'harvest', stage: 0, delivered: false, depth: 1 });
    cueToSound(e, { t: 'special', kind: 'dewOrb', level: 0 });
    cueToSound(e, { t: 'created', kind: 'combo' });
    cueToSound(e, { t: 'runEnded', result: 'lost' });
    cueToSound(e, { t: 'ui', name: 'rush' });
    expect(plays.map((p) => p.id)).toEqual(['harvest2', 'harvest1', 'harvest0', 'dew', 'combo', 'sigh', 'rush']);
    expect(plays[0]!.rate).toBeCloseTo(2 ** (4 / 12));
  });

  it('music follows app state and phase', () => {
    expect(musicFor('boot', undefined)).toBeNull();
    expect(musicFor('title', undefined)).toBe('morning');
    expect(musicFor('hub', 'dusk')).toBe('dusk');
    expect(musicFor('match', 'morning')).toBe('match');
    expect(musicFor('night', 'morning')).toBe('dusk');
  });

  it('nothing plays before the first interaction unlocks the engine', () => {
    const s = new SynthEngine();
    expect(() => s.play('swap')).not.toThrow();
    expect(() => s.music('morning')).not.toThrow();
  });
});
