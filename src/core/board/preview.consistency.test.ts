import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, type Tunables } from '@/core/config/tunables';
import { applyMove } from '@/core/run/run';
import { checker, firstSegment, pick } from '@/core/testkit/checker';
import { bestRoundQuantile, perfBudget, timeMs } from '@/core/testkit/perf';
import { mv, runFromAscii } from '@/core/testkit/runs';
import { pickMove, scenarioRun } from '@/core/testkit/scenario';
import { printBoard } from './ascii';
import { previewMove } from './preview';

function assertConsistent(cfg: Tunables, opts: Parameters<typeof scenarioRun>[2]) {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 0, max: 999 }), (seed, k) => {
      const run = scenarioRun(seed, cfg, opts);
      const move = pickMove(run.board, k);
      if (!move) return;
      const frozen = JSON.stringify(run);
      const p = previewMove(run, move, cfg);
      expect(JSON.stringify(run)).toBe(frozen);
      expect(p.valid).toBe(true);
      const r = applyMove(run, move, cfg);
      if (!r.ok) throw new Error('move should be legal');
      const seg = firstSegment(r.events);
      const harvest = pick(seg, 'harvest')[0]!.items;
      expect(p.harvest).toEqual(harvest.map((h) => ({ pos: h.pos, uid: h.uid, yield: h.yield, crop: h.crop, delivered: h.delivered })));
      expect(p.growth.map(({ cause: _c, ...g }) => g)).toEqual(pick(seg, 'grow').flatMap((g) => g.items));
      expect(p.created).toEqual(pick(seg, 'specialCreated').map((c) => ({ pos: c.pos, kind: c.kind })));
      expect(p.triggered).toEqual(pick(seg, 'specialTriggered').map((t) => ({ pos: t.pos, kind: t.kind, area: t.area })));
      expect(p.pollinated).toEqual(pick(seg, 'pollinate').flatMap((e) => e.cells));
      const delivered = harvest.filter((h) => h.delivered).length;
      expect(Object.values(p.delta.delivered).reduce((s, v) => s + (v ?? 0), 0)).toBe(delivered);
    }),
    { seed: 424242, numRuns: 500 },
  );
}

describe('previewMove ≡ first segment of applyMove (P1-08)', () => {
  it('plain boards (VS)', () => assertConsistent(VS_TUNABLES, {}));
  it('boards with specials (VS)', () => assertConsistent(VS_TUNABLES, { specials: 6 }));
  it('boards with specials and bees (MVP)', () => assertConsistent(DEFAULT_TUNABLES, { specials: 5, bees: 3 }));

  it('reports invalid moves without work', () => {
    const run = runFromAscii(printBoard(checker({ '3,3': 'C2h', '4,3': 'E0' })), VS_TUNABLES);
    expect(previewMove(run, mv(3, 3, 5, 3), VS_TUNABLES)).toMatchObject({ valid: false, reason: 'notAdjacent' });
    expect(previewMove(run, mv(3, 3, 4, 3), VS_TUNABLES)).toMatchObject({ valid: false, reason: 'noMatch', harvest: [] });
  });

  it('p99 ≤ 0.5 ms in Node', () => {
    const runs = Array.from({ length: 40 }, (_, s) => scenarioRun(s + 1, VS_TUNABLES, { specials: 2 }));
    const moves = runs.map((run) => Array.from({ length: 25 }, (_, rep) => pickMove(run.board, rep)!));
    // Warm-up: one untimed pass over every (run, move) pair.
    runs.forEach((run, s) => moves[s]!.forEach((m) => previewMove(run, m, VS_TUNABLES)));
    const times: number[] = [];
    for (let round = 0; round < 4; round++)
      for (let rep = 0; rep < 25; rep++)
        runs.forEach((run, s) => times.push(timeMs(() => previewMove(run, moves[s]![rep]!, VS_TUNABLES))));
    // p99 ≤ 0.5 ms from the best of 4 rounds of 1000 previews (robust to parallel-worker contention);
    // relaxed by COVERAGE_FACTOR under V8 coverage (see testkit/perf.ts).
    expect(bestRoundQuantile(times, 4, 0.99)).toBeLessThan(perfBudget(0.5));
  });
});
