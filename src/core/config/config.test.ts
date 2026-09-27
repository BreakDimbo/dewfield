import { describe, expect, it } from 'vitest';
import { CROP_BY_ASCII, CROP_BY_ID, CROP_IDS, CROPS, cropOrder } from './crops';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables } from './tunables';

describe('core/config tunables (02 §14)', () => {
  it('defaults match the 02 §14 table', () => {
    expect(DEFAULT_TUNABLES).toMatchSnapshot();
  });

  it('spot-checks the load-bearing defaults', () => {
    const t = DEFAULT_TUNABLES;
    expect(t.board).toEqual({ width: 7, height: 7, minValidMoves: 3, shuffleMaxAttempts: 50 });
    expect(t.spawn.stageWeights).toEqual([0.7, 0.3, 0.0]);
    expect(t.anim.specialTelegraph).toBeGreaterThanOrEqual(120);
    expect(t.commission.movesByTier).toEqual({ 1: 24, 2: 22, 3: 20 });
    expect(t.economy.baseReward).toEqual({ 1: 40, 2: 50, 3: 60 });
  });

  it('withTunables deep-merges, deep-freezes, and leaves defaults untouched', () => {
    const t = withTunables({ spawn: { orderBias: 0.5 }, anim: { swap: 99 } });
    expect(t.spawn.orderBias).toBe(0.5);
    expect(t.spawn.stageWeights).toEqual([0.7, 0.3, 0.0]);
    expect(t.anim.swap).toBe(99);
    expect(t.anim.grow).toBe(160);
    expect(DEFAULT_TUNABLES.spawn.orderBias).toBe(0.1);
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.isFrozen(t.spawn)).toBe(true);
    expect(Object.isFrozen(t.spawn.stageWeights)).toBe(true);
    expect(() => {
      (t.anim as { swap: number }).swap = 1;
    }).toThrow();
  });

  it('arrays are replaced wholesale', () => {
    expect(withTunables({ spawn: { stageWeights: [0, 0, 1] } }).spawn.stageWeights).toEqual([0, 0, 1]);
  });

  it('VS profile turns bees off', () => {
    expect(VS_TUNABLES.special.beeEnabled).toBe(false);
    expect(DEFAULT_TUNABLES.special.beeEnabled).toBe(true);
  });
});

describe('core/config crops (02 §16.1)', () => {
  it('has 5 crops in fixed order with ASCII letters and colours', () => {
    expect(CROPS.map((c) => [c.id, c.ascii, c.order, c.color])).toEqual([
      ['carrot', 'C', 0, '#E8894A'],
      ['tomato', 'T', 1, '#D2553F'],
      ['corn', 'M', 2, '#E3BE4F'],
      ['eggplant', 'E', 3, '#7B5BA6'],
      ['blueberry', 'B', 4, '#4E78C4'],
    ]);
    expect(CROPS.map((c) => c.young)).toEqual(['#E6C47E', '#9DBF5E', '#CFD67E', '#A58CC4', '#8DBF8A']);
    expect(CROP_IDS).toHaveLength(5);
    expect(CROP_BY_ASCII.M?.id).toBe('corn');
    expect(CROP_BY_ID.blueberry.name).toBe('蓝莓');
    expect(cropOrder('eggplant')).toBe(3);
  });
});
