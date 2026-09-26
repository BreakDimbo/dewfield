import { describe, expect, it } from 'vitest';
import { effectiveTier, LADDER, MAX_FLIPS, QUALITY_START, qualityStep } from './quality';

describe('quality ladder (P2-21)', () => {
  it('declines DPR first, then particles, and recovers when stable', () => {
    let s = QUALITY_START;
    const seen = [LADDER[s.level]];
    for (let k = 0; k < 3; k++) seen.push(LADDER[(s = qualityStep(s, 'decline')).level]);
    expect(seen.map((t) => `${t!.dpr}/${t!.particleScale}`)).toEqual(['2/1', '1.5/1', '1/1', '1/0.5']);
    expect(qualityStep(s, 'decline')).toBe(s);
    s = qualityStep(s, 'incline');
    expect(s.level).toBe(2);
  });

  it('stops flip-flopping after MAX_FLIPS changes', () => {
    let s = QUALITY_START;
    for (let k = 0; k < 10; k++) s = qualityStep(s, k % 2 ? 'incline' : 'decline');
    expect(s.flips).toBe(MAX_FLIPS);
    expect(s.locked).toBe(true);
    expect(qualityStep(s, 'decline')).toBe(s);
    expect(qualityStep(QUALITY_START, 'incline')).toBe(QUALITY_START);
  });

  it('settings override the monitor and respect render.dprMax', () => {
    const mid = { level: 2, flips: 2, locked: false };
    expect(effectiveTier('auto', mid, 2)).toEqual({ dpr: 1, particleScale: 1 });
    expect(effectiveTier('high', mid, 1.5)).toEqual({ dpr: 1.5, particleScale: 1 });
    expect(effectiveTier('low', QUALITY_START, 2)).toEqual({ dpr: 1, particleScale: 0.5 });
  });
});
