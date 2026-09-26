import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES } from '@/core/config/tunables';
import { newHomestead } from '@/core/homestead/homestead';
import type { HomesteadState } from '@/core/homestead/state';
import { C01_FAIL_FLAG, currentGate, tutorialGate, tutorialOnEvent } from './gates';

const h0 = () => newHomestead(1, DEFAULT_TUNABLES);
const at = (steps: string[]): HomesteadState => ({ ...h0(), tutorial: { done: false, completedSteps: steps, seenTips: [] } });
const step = (h: HomesteadState, e: Parameters<typeof tutorialOnEvent>[1]) => tutorialOnEvent(h, e, 2);

describe('day-1 gates (P1-27, 02 §11.1)', () => {
  it('allowed actions per gate', () => {
    expect(tutorialGate(at([]))).toEqual({ step: 'G0', allow: [] });
    expect(tutorialGate(at(['G0'])).allow).toEqual(['openCommission']);
    expect(tutorialGate(at(['G0', 'G1'])).allow).toEqual(['openCommission']);
    expect(tutorialGate(at(['G0', 'G1', 'G2'])).allow).toEqual(['water']);
    expect(tutorialGate(at(['G0', 'G1', 'G2', 'G3'])).allow).toEqual(['openCommission', 'water', 'bee']);
    expect(tutorialGate(at(['G0', 'G1', 'G2', 'G3', C01_FAIL_FLAG])).allow).toContain('sleep');
    expect(tutorialGate(at(['G0', 'G1', 'G2', 'G3', 'G4'])).allow).toEqual(['shop', 'sleep', 'water', 'bee']);
    expect(tutorialGate({ tutorial: { done: true, completedSteps: [], seenTips: [] } }).allow).toHaveLength(6);
  });

  it('walks G0 → done on the happy path', () => {
    let h = at([]);
    h = step(h, { t: 'runWon', id: 'T1' });
    expect(currentGate(h)).toBe('G1');
    h = step(h, { t: 'runStarted', id: 'T2' });
    expect(currentGate(h)).toBe('G2');
    h = step(h, { t: 'runWon', id: 'T2' });
    expect(currentGate(h)).toBe('G3');
    h = step(h, { t: 'watered' });
    expect(currentGate(h)).toBe('G4');
    h = step(h, { t: 'runWon', id: 'C01' });
    expect(currentGate(h)).toBe('G5');
    h = step(h, { t: 'slept' });
    expect(currentGate(h)).toBe('done');
    expect(h.tutorial.done).toBe(true);
  });

  it('T2 failing twice passes G2; C01 failing twice unlocks sleep and sleeping finishes day 1', () => {
    let h = at(['G0', 'G1']);
    h = step(h, { t: 'runLost', id: 'T2', attempts: 1 });
    expect(currentGate(h)).toBe('G2');
    h = step(h, { t: 'runLost', id: 'T2', attempts: 2 });
    expect(currentGate(h)).toBe('G3');
    h = step(step(h, { t: 'watered' }), { t: 'runLost', id: 'C01', attempts: 2 });
    expect(tutorialGate(h).allow).toContain('sleep');
    h = step(h, { t: 'slept' });
    expect(h.tutorial.done).toBe(true);
  });

  it('ignores unrelated events and returns the same reference', () => {
    const h = at(['G0']);
    expect(step(h, { t: 'watered' })).toBe(h);
    expect(step(at([]), { t: 'runWon', id: 'C01' }).tutorial.completedSteps).toEqual([]);
    const done = { ...h, tutorial: { done: true, completedSteps: [], seenTips: [] } };
    expect(step(done, { t: 'slept' })).toBe(done);
    const g4 = at(['G0', 'G1', 'G2', 'G3']);
    expect(step(g4, { t: 'slept' })).toBe(g4);
    expect(step(at(['G0', 'G1', 'G2']), { t: 'runWon', id: 'C01' }).tutorial.completedSteps).toEqual(['G0', 'G1', 'G2']);
    expect(step(at(['G0', 'G1', 'G2', 'G3', 'G4']), { t: 'watered' }).tutorial.done).toBe(false);
  });
});
