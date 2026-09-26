import { describe, expect, it } from 'vitest';
import { CROP_IDS } from '@/core/config/crops';
import { cropColor, luminance } from './palette';

describe('RD-2 greyscale stage ladder (P1-15)', () => {
  it.each(CROP_IDS)('%s: sprout > unripe > ripe in luminance, each step clearly visible', (crop) => {
    const [s, u, r] = ([0, 1, 2] as const).map((st) => luminance(cropColor(crop, st)));
    expect(s! - u!).toBeGreaterThan(0.05);
    expect(u! - r!).toBeGreaterThan(0.05);
  });

  it('unripe keeps roughly 65% of the ripe saturation (01 §13.3)', () => {
    const hsl = { h: 0, s: 0, l: 0 };
    const ripe = cropColor('tomato', 2).getHSL({ ...hsl }).s;
    const unripe = cropColor('tomato', 1).getHSL({ ...hsl }).s;
    expect(unripe / ripe).toBeGreaterThan(0.55);
    expect(unripe / ripe).toBeLessThan(0.75);
  });
});
