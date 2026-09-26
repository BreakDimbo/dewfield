import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { VS_TUNABLES } from '@/core/config/tunables';
import { careWaterRow, newHomestead, settleRun, sleep, startRun } from '@/core/homestead/homestead';
import type { HomesteadState } from '@/core/homestead/state';
import { applyMove } from '@/core/run/run';
import { pickMove } from '@/core/testkit/scenario';
import { migrate } from './migrations';
import { fieldHasMatches } from './schema';
import { deserialize, serialize } from './serialize';

const cfg = VS_TUNABLES;

/** A random but reachable campaign state: runs, care and nights interleaved. */
function campaign(seed: number, steps: number): HomesteadState {
  let home = newHomestead(seed, cfg);
  for (let k = 0; k < steps; k++) {
    const op = (seed + k * 7) % 4;
    if (op === 0 && home.commissions.active && home.phase === 'morning') {
      const s = startRun(home, cfg);
      let run = s.run;
      for (let m = 0; m < 3 && run.status === 'playing'; m++) {
        const r = applyMove(run, pickMove(run.board, seed + m)!, cfg);
        if (r.ok) run = r.run;
      }
      home = settleRun(s.home, run, cfg, run.status === 'playing').home;
    } else if (op === 1) {
      const r = careWaterRow(home, (seed + k) % 7, cfg);
      if (r.ok) home = r.home;
    } else if (op === 2) {
      const r = sleep({ ...home, tutorial: { ...home.tutorial, done: k > 2 } }, cfg);
      if (r.ok) home = r.home;
    }
  }
  return home;
}

describe('save v1 (P1-13)', () => {
  it('round-trips random campaign states exactly', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1e6 }), fc.integer({ min: 0, max: 8 }), (seed, steps) => {
        const home = campaign(seed, steps);
        const loaded = deserialize(serialize(home, { nowMs: 1_700_000_000_000, build: 'test' }));
        expect(loaded.ok).toBe(true);
        if (loaded.ok) {
          expect(loaded.save.homestead).toEqual(home);
          expect(loaded.save).toMatchObject({ schemaVersion: 1, build: 'test', savedAt: 1_700_000_000_000 });
          expect(fieldHasMatches(home.field.rows, home.field.uids)).toBe(false);
        }
      }),
      { seed: 99, numRuns: 60 },
    );
  });

  it('rejects empty, broken JSON, wrong versions and invariant violations', () => {
    const home = newHomestead(1, cfg);
    const good = JSON.parse(serialize(home, { nowMs: 1, build: 'x' }));
    expect(deserialize(null)).toEqual({ ok: false, reason: 'empty' });
    expect(deserialize('{nope')).toEqual({ ok: false, reason: 'json' });
    expect(deserialize(JSON.stringify({ ...good, schemaVersion: 9 }))).toEqual({ ok: false, reason: 'version' });
    const badRow = structuredClone(good);
    badRow.homestead.field.rows[0] = 'C2 C2 X9 C2 C2 C2 C2';
    expect(deserialize(JSON.stringify(badRow))).toEqual({ ok: false, reason: 'schema' });
    const dupUid = structuredClone(good);
    dupUid.homestead.field.uids[1] = dupUid.homestead.field.uids[0];
    expect(deserialize(JSON.stringify(dupUid)).ok).toBe(false);
    const bigUid = structuredClone(good);
    bigUid.homestead.uidCounter = 10;
    expect(deserialize(JSON.stringify(bigUid)).ok).toBe(false);
    const over = structuredClone(good);
    over.homestead.commissions.active.delivered = { carrot: 99 };
    expect(deserialize(JSON.stringify(over)).ok).toBe(false);
    expect(() => serialize({ ...home, day: 0 }, { nowMs: 1, build: 'x' })).toThrow();
  });

  it('migration framework upgrades step by step and refuses gaps', () => {
    const table = { 0: (s: Record<string, unknown>) => ({ ...s, added: true }) };
    expect(migrate({ schemaVersion: 0, a: 1 }, table, 1)).toEqual({ ok: true, value: { schemaVersion: 1, a: 1, added: true } });
    expect(migrate({ schemaVersion: 0 }, {}, 1)).toEqual({ ok: false });
    expect(migrate('x')).toEqual({ ok: false });
    expect(migrate({ schemaVersion: 1.5 })).toEqual({ ok: false });
    expect(migrate({ schemaVersion: 1 })).toEqual({ ok: true, value: { schemaVersion: 1 } });
  });
});
