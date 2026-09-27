import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES } from '../../src/core/config/tunables';
import { TARGETS } from './report';
import { simulateCampaign, simulateSingle } from './sim';

const cfg = DEFAULT_TUNABLES;
const base = { runs: 200, seed: 20260926, fieldStages: [0.3, 0.4, 0.3] as [number, number, number] };

/** 02 §15.1 guard column on 200 fixed seeds (P1-25 #3), raised to the MVP thresholds by P2-23 (docs/balance/MVP-report.md). */
describe('balance guards (MVP profile)', () => {
  const greedy = simulateSingle({ ...base, commission: 'C01', bot: 'greedy', care: 'none' }, cfg);

  it('board health', () => {
    expect(greedy.avgValidMoves).toBeGreaterThanOrEqual(TARGETS.avgValidMoves[1]);
    expect(greedy.lowValidShare).toBeLessThanOrEqual(TARGETS.lowValidShare[1]);
    expect(greedy.shufflesPer25).toBeLessThanOrEqual(TARGETS.shufflesPer25[1]);
  });

  it('specials and cascades; a special within 10 moves ≥ 90% (MVP G2)', () => {
    expect(greedy.specialsPerMove).toBeGreaterThanOrEqual(TARGETS.specialsPerMove[1]);
    expect(greedy.specialWithin10).toBeGreaterThanOrEqual(TARGETS.specialWithin10[0]);
    expect(greedy.avgDepth).toBeGreaterThanOrEqual(TARGETS.avgDepth[1]);
    expect(greedy.deepShare).toBeGreaterThanOrEqual(TARGETS.deepShare[1]);
  });

  it('tier 1 win rates: greedy ≥ 90%, random ≥ 40%', () => {
    expect(greedy.winRate).toBeGreaterThanOrEqual(0.9);
    const random = simulateSingle({ ...base, commission: 'C01', bot: 'random', care: 'none' }, cfg);
    expect(random.winRate).toBeGreaterThanOrEqual(0.4);
  });

  it('care uplift on tiers 2–3 averages ≥ +8 pp', () => {
    const ids = ['C04', 'C06', 'C08', 'C11', 'C12'];
    let uplift = 0;
    for (const commission of ids) {
      const none = simulateSingle({ ...base, commission, bot: 'greedy', care: 'none' }, cfg).winRate;
      const care = simulateSingle({ ...base, commission, bot: 'greedy', care: 'waterOrdered' }, cfg).winRate;
      uplift += care - none;
    }
    expect(uplift / ids.length).toBeGreaterThanOrEqual(0.08);
  }, 120_000); // many sims: ~10 s alone, can exceed the 30 s default under `--coverage` with all workers busy

  it('campaign reaches the procedural commissions, is deterministic, and reports affordability', () => {
    const a = simulateCampaign({ runs: 3, seed: 5, bot: 'greedy', care: 'waterOrdered', extra: 1 }, cfg);
    const b = simulateCampaign({ runs: 3, seed: 5, bot: 'greedy', care: 'waterOrdered', extra: 1 }, cfg);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.rows.map((r) => r.id)).toContain('C12');
    expect(a.rows.some((r) => r.id.startsWith('P'))).toBe(true);
    expect(a.affordability.decor).toHaveLength(8);
    expect(a.affordability.decor.find((d) => d.id === 'windChime')!.alone).toBeLessThanOrEqual(1);
  });
});

/** P1-26 (VS profile: bees off). */
describe('balance guards (VS profile)', () => {
  const t2 = simulateSingle({ ...base, commission: 'T2', bot: 'greedy', care: 'none' }, VS_TUNABLES);
  const c01 = simulateSingle({ ...base, commission: 'C01', bot: 'greedy', care: 'none' }, VS_TUNABLES);

  it('T2 greedy ≥ 95%, C01 greedy ≥ 90%', () => {
    expect(t2.winRate).toBeGreaterThanOrEqual(0.95);
    expect(c01.winRate).toBeGreaterThanOrEqual(0.9);
  });

  it('board health and specials hold without bees', () => {
    expect(c01.avgValidMoves).toBeGreaterThanOrEqual(TARGETS.avgValidMoves[1]);
    expect(c01.lowValidShare).toBeLessThanOrEqual(TARGETS.lowValidShare[1]);
    expect(c01.specialsPerMove).toBeGreaterThanOrEqual(TARGETS.specialsPerMove[1]);
    expect(c01.specialWithin10).toBeGreaterThanOrEqual(TARGETS.specialWithin10[0]);
    expect(c01.avgDepth).toBeGreaterThanOrEqual(TARGETS.avgDepth[1]);
  });
});
