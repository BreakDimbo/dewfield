import { describe, expect, it } from 'vitest';
import { nudgeDistance } from './nudge';

describe('camera nudge (P2-13)', () => {
  it('pulls back to its full amount, then settles to rest within its duration', () => {
    expect(nudgeDistance(0, 1, 1.4)).toBe(0);
    const peak = Math.max(...Array.from({ length: 140 }, (_, k) => nudgeDistance(k / 100, 1, 1.4)));
    expect(peak).toBeCloseTo(1, 2);
    expect(nudgeDistance(1.39, 1, 1.4)).toBeLessThan(0.05);
    expect(nudgeDistance(1.4, 1, 1.4)).toBe(0);
    expect(nudgeDistance(5, 1, 1.4)).toBe(0);
  });
});
