import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables } from '@/core/config/tunables';
import { createRng } from '@/core/rng/rng';
import { applyMove } from '@/core/run/run';
import { grid } from './testkit';
import { mv, runFromAscii } from '@/core/testkit/runs';
import { pickMove, scenarioRun } from '@/core/testkit/scenario';
import { printBoard } from './ascii';
import type { BoardEvent } from './events';
import { applyGravity } from './gravity';
import { findGroups } from './match';
import { hashBoard, type Tile } from './model';
import { cropWeights, refill, toPermille } from './refill';
import { settleGrid } from './resolve';
import { replayEvents } from './replay';

const PROP = { seed: 20260926, numRuns: 200 };
const ev = <T extends BoardEvent['t']>(events: BoardEvent[], t: T) =>
  events.filter((e): e is Extract<BoardEvent, { t: T }> => e.t === t);

describe('gravity (02 §1.7)', () => {
  it('compacts a column with several holes, keeping order', () => {
    const g: (Tile | null)[] = grid(`
      C0 . . . . . .
      T1 . . . . . .
      M2 . . . . . .
      E0 . . . . . .
      B1 . . . . . .
      C1 . . . . . .
      T2 . . . . . .`).cells.slice();
    const uids = [0, 1, 2, 3, 4, 5, 6].map((y) => g[y * 7]!.uid);
    g[1 * 7] = null;
    g[3 * 7] = null;
    g[6 * 7] = null;
    const fall = applyGravity(g);
    expect([0, 1, 2, 3, 4, 5, 6].map((y) => g[y * 7]?.uid ?? null)).toEqual([
      null,
      null,
      null,
      uids[0],
      uids[2],
      uids[4],
      uids[5],
    ]);
    expect(fall.items.map((f) => [f.from.y, f.to.y])).toEqual([
      [0, 3],
      [2, 4],
      [4, 5],
      [5, 6],
    ]);
  });

  it('handles a fully cleared column and multiple columns', () => {
    const g: (Tile | null)[] = grid(`
      C0 T0 . . . . .
      . T1 . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells.slice();
    for (let y = 0; y < 7; y++) g[y * 7 + 2] = null;
    g[7] = null;
    g[6 * 7 + 1] = null;
    const fall = applyGravity(g);
    for (let y = 0; y < 7; y++) expect(g[y * 7 + 2]).toBeNull();
    expect(g[6 * 7 + 1]).not.toBeNull();
    expect(fall.items.every((f) => f.from.x === f.to.x && f.to.y > f.from.y)).toBe(true);
  });
});

describe('refill (02 §1.7)', () => {
  it('fills columns left→right, bottom-most hole first, queue before RNG', () => {
    const g: (Tile | null)[] = grid(`
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`).cells.slice();
    g[0] = null;
    g[7] = null;
    g[3] = null;
    const ctx = { rng: createRng(1), uid: 100, queue: ['M2', 'B1', 'T0'], needs: () => false };
    const spawn = refill(g, ctx, DEFAULT_TUNABLES);
    const order = [...spawn.items].sort((a, b) => a.uid - b.uid).map((i) => [i.pos.x, i.pos.y, i.token, i.entryOffset]);
    expect(order).toEqual([
      [0, 1, 'M2', 2],
      [0, 0, 'B1', 2],
      [3, 0, 'T0', 1],
    ]);
    expect(ctx.queue).toEqual([]);
    expect(ctx.uid).toBe(103);
  });

  it('random refills follow stage weights and order bias within ±1% (P1-03)', () => {
    const cfg = DEFAULT_TUNABLES;
    const cw = cropWeights(cfg, (c) => c === 'carrot');
    expect(cw).toEqual([1250, 1000, 1000, 1000, 1000]);
    const stage = [0, 0, 0];
    const crop: Record<string, number> = {};
    let rng = createRng(3);
    const N = 100_000;
    for (let k = 0; k < N; k++) {
      const g: (Tile | null)[] = new Array(49).fill({ uid: 0, kind: 'bee' });
      g[0] = null;
      const ctx = { rng, uid: 1, queue: [], needs: (c: string) => c === 'carrot' };
      const s = refill(g, ctx, cfg);
      rng = ctx.rng;
      const t = s.items[0]!.token;
      stage[Number(t[1])]!++;
      crop[t[0]!] = (crop[t[0]!] ?? 0) + 1;
    }
    expect(Math.abs(stage[0]! / N - 0.7)).toBeLessThan(0.01);
    expect(Math.abs(stage[1]! / N - 0.3)).toBeLessThan(0.01);
    expect(stage[2]).toBe(0);
    expect(Math.abs(crop.C! / N - 1250 / 5250)).toBeLessThan(0.01);
    expect(Math.abs(crop.B! / N - 1000 / 5250)).toBeLessThan(0.01);
    expect(toPermille([0.7, 0.3, 0])).toEqual([700, 300, 0]);
  });

  it('bias disappears once an order item is complete', () => {
    expect(cropWeights(DEFAULT_TUNABLES, () => false)).toEqual([1000, 1000, 1000, 1000, 1000]);
  });
});

describe('resolve properties (P0-09)', () => {
  for (const [name, cfg, opts] of [
    ['plain', VS_TUNABLES, {}],
    ['with specials', VS_TUNABLES, { specials: 6 }],
    ['with specials and bees', DEFAULT_TUNABLES, { specials: 5, bees: 2 }],
  ] as const) {
    it(`${name}: full, quiet, unique uids, stages in range, replayable, deterministic`, () => {
      fc.assert(
        fc.property(fc.integer({ min: 1, max: 1e9 }), fc.integer({ min: 0, max: 500 }), (seed, k) => {
          const run = scenarioRun(seed, cfg, opts);
          const move = pickMove(run.board, k);
          if (!move) return;
          const r = applyMove(run, move, cfg);
          expect(r.ok).toBe(true);
          const b = r.run.board;
          expect(b.cells).toHaveLength(49);
          expect(findGroups(b.cells)).toEqual([]);
          expect(new Set(b.cells.map((t) => t.uid)).size).toBe(49);
          expect(b.cells.every((t) => t.kind === 'bee' || (t.stage >= 0 && t.stage <= 2))).toBe(true);
          expect(b.cells.every((t) => t.uid < r.run.uidCounter)).toBe(true);
          expect(replayEvents(run.board, r.events)).toEqual(b);
          const again = applyMove(run, move, cfg);
          expect(hashBoard(again.run.board)).toBe(hashBoard(b));
        }),
        PROP,
      );
    });
  }
});

describe('neighbour ripening (P1-02, 02 §2.3)', () => {
  const EXAMPLE = `
    T1 E0 B1 M2 T0 E2 M1
    B0 C2 C0 E1 C1 M0 T2
    M1 T0 E2 B0 M0 C2 E0
    E2 M1 T1 E0 B2 T0 B1
    B0 E1 M2 T1 C0 B1 T0
    T2 C1 B0 M1 E2 C1 M2
    M0 B2 C0 E1 T1 M0 B2`;

  it('reproduces the 02 §2.3 example', () => {
    const run = runFromAscii(EXAMPLE, VS_TUNABLES, {
      items: [{ crop: 'carrot', count: 5 }],
      queue: 'M0 E0 C0',
    });
    // Swap (3,1)↔(4,1) turns the row into the example's C2 C0 C1 triple.
    expect(findGroups(run.board.cells)).toEqual([]);
    const r = applyMove(run, mv(4, 1, 3, 1), VS_TUNABLES);
    expect(r.ok).toBe(true);
    const harvest = ev(r.events, 'harvest')[0]!;
    expect(harvest.items.map((h) => [h.pos.x, h.yield])).toEqual([
      [1, 'crop'],
      [2, 'none'],
      [3, 'dewdrop'],
    ]);
    const grow = ev(r.events, 'grow')[0]!;
    expect(grow.cause).toBe('neighbor');
    expect(grow.items.map((g) => `${g.pos.x},${g.pos.y}:${g.from}→${g.to}`)).toEqual([
      '1,0:0→1',
      '2,0:1→2',
      '0,1:0→1',
      '4,1:1→2',
      '1,2:0→1',
      '3,2:0→1',
    ]);
    expect(r.run.delivered.carrot).toBe(1);
    expect(r.run.dewdropsEarned).toBe(1);
  });

  const LINE = `
    T0 E0 B0 M0 T0 E2 M1
    B0 C2 C2 C2 E1 M0 T2
    M1 T0 E2 B0 M0 C2 E0
    E2 M1 T1 E0 B2 T0 B1
    B0 E1 M2 T1 C0 B1 T0
    T2 C1 B0 M1 E2 C1 M2
    M0 B2 C0 E1 T1 M0 B2`;

  it('excludes harvested cells, grows each cell at most once, ignores ripe cells', () => {
    const board = grid(LINE);
    const out = settleGrid(
      {
        board,
        rng: createRng(1),
        uidCounter: 100,
        spawnQueue: ['T1', 'E1', 'B1'],
        ledger: { remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 },
      },
      VS_TUNABLES,
    );
    const grow = ev(out.events, 'grow')[0]!;
    const cells = grow.items.map((g) => `${g.pos.x},${g.pos.y}`);
    expect(cells).toEqual(['1,0', '2,0', '3,0', '0,1', '4,1', '1,2', '3,2']);
    expect(new Set(cells).size).toBe(cells.length);
    expect(cells).not.toContain('2,2');
  });

  it('sproutOnly only turns sprouts green; off disables it', () => {
    const input = {
      board: grid(LINE),
      rng: createRng(1),
      uidCounter: 100,
      spawnQueue: ['T1', 'E1', 'B1'],
      ledger: { remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 },
    };
    const sprout = settleGrid(input, withTunables({ growth: { neighborRipen: 'sproutOnly' } }));
    const g1 = ev(sprout.events, 'grow')[0]!;
    expect(g1.items.every((g) => g.from === 0 && g.to === 1)).toBe(true);
    const off = settleGrid(input, withTunables({ growth: { neighborRipen: 'off' } }));
    expect(g1.items.map((g) => `${g.pos.x},${g.pos.y}`)).not.toContain('4,1');
    expect(ev(off.events, 'grow')).toHaveLength(0);
  });

  it('new special positions do not ripen and bees are never grown', () => {
    const out = settleGrid(
      {
        board: grid(`
          . C0 . . . . .
          C2 C2 C2 C2 . . .
          . . . . . . .
          . . . . . . .
          . . . . . . .
          . . . . . . .
          . . . . . . .`),
        rng: createRng(1),
        uidCounter: 100,
        spawnQueue: ['T1', 'E1', 'B1', 'M1'],
        ledger: { remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 },
      },
      VS_TUNABLES,
    );
    const created = ev(out.events, 'specialCreated')[0]!;
    expect(created).toMatchObject({ kind: 'sickleH', pos: { x: 1, y: 1 }, stage: 2 });
    const grow = ev(out.events, 'grow')[0]!;
    expect(grow.items.map((g) => `${g.pos.x},${g.pos.y}`)).toEqual(['1,0']);
  });

  it('every cascade step ripens its own neighbours', () => {
    let saw = false;
    for (let seed = 1; seed < 400 && !saw; seed++) {
      const run = scenarioRun(seed, VS_TUNABLES, { stages: [0.6, 0.4, 0] });
      const move = pickMove(run.board, seed);
      if (!move) continue;
      const r = applyMove(run, move, VS_TUNABLES);
      const steps = ev(r.events, 'cascadeStep').length;
      const growSteps = ev(r.events, 'grow').filter((g) => g.cause === 'neighbor').length;
      if (steps >= 2 && growSteps >= 2) saw = true;
    }
    expect(saw).toBe(true);
  });
});

describe('determinism', () => {
  it('different seeds diverge', () => {
    const a = scenarioRun(5, VS_TUNABLES);
    const move = pickMove(a.board, 0)!;
    const b = { ...a, rng: createRng(999) };
    const ra = applyMove(a, move, VS_TUNABLES);
    const rb = applyMove(b, move, VS_TUNABLES);
    expect(printBoard(ra.run.board)).not.toBe(printBoard(rb.run.board));
  });
});
