import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES } from '../../src/core/config/tunables';
import { TARGETS } from './report';
import { simulateCampaign, simulateSingle } from './sim';

const cfg = DEFAULT_TUNABLES;
const base = { runs: 200, seed: 20260926, fieldStages: [0.3, 0.4, 0.3] as [number, number, number] };

/** 02 §15.1 guard column on 200 fixed seeds (P1-25 #3). */
describe('balance guards', () => {
  const greedy = simulateSingle({ ...base, commission: 'C01', bot: 'greedy', care: 'none' }, cfg);

  it('board health', () => {
    expect(greedy.avgValidMoves).toBeGreaterThanOrEqual(TARGETS.avgValidMoves[1]);
    expect(greedy.lowValidShare).toBeLessThanOrEqual(TARGETS.lowValidShare[1]);
    expect(greedy.shufflesPer25).toBeLessThanOrEqual(TARGETS.shufflesPer25[1]);
  });

  it('specials and cascades', () => {
    expect(greedy.specialsPerMove).toBeGreaterThanOrEqual(TARGETS.specialsPerMove[1]);
    expect(greedy.specialWithin10).toBeGreaterThanOrEqual(TARGETS.specialWithin10[1]);
    expect(greedy.avgDepth).toBeGreaterThanOrEqual(TARGETS.avgDepth[1]);
    expect(greedy.deepShare).toBeGreaterThanOrEqual(TARGETS.deepShare[1]);
  });

  it('tier 1 win rates: greedy ≥ 85%, random ≥ 40%', () => {
    expect(greedy.winRate).toBeGreaterThanOrEqual(0.85);
    const random = simulateSingle({ ...base, commission: 'C01', bot: 'random', care: 'none' }, cfg);
    expect(random.winRate).toBeGreaterThanOrEqual(0.4);
  });

  it('care uplift on tiers 2–3 averages ≥ +5 pp', () => {
    const ids = ['C06', 'C11'];
    let uplift = 0;
    for (const commission of ids) {
      const none = simulateSingle({ ...base, commission, bot: 'greedy', care: 'none' }, cfg).winRate;
      const care = simulateSingle({ ...base, commission, bot: 'greedy', care: 'waterOrdered' }, cfg).winRate;
      uplift += care - none;
    }
    expect(uplift / ids.length).toBeGreaterThanOrEqual(0.05);
  });

  it('campaign reaches the procedural commissions and is deterministic', () => {
    const a = simulateCampaign({ runs: 3, seed: 5, bot: 'greedy', care: 'waterOrdered', extra: 1 }, cfg);
    const b = simulateCampaign({ runs: 3, seed: 5, bot: 'greedy', care: 'waterOrdered', extra: 1 }, cfg);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rows.map((r) => r.id)).toContain('C12');
    expect(a.rows.some((r) => r.id.startsWith('P'))).toBe(true);
  });
});
