import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, withTunables, type Tunables } from '@/core/config/tunables';
import { createRng } from '@/core/rng/rng';
import { applyMove, createRun } from '@/core/run/run';
import { checker, firstSegment, keys, pick } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import type { Board } from './model';
import { replayEvents } from './replay';
import { settleGrid } from './resolve';
import { beeTarget, effectOf, ring, square } from './specials';

const ledger = () => ({ remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 });
const settle = (board: Board, cfg: Tunables = VS_TUNABLES) => {
  const out = settleGrid({ board, rng: createRng(7), uidCounter: 500, spawnQueue: [], ledger: ledger() }, cfg);
  expect(replayEvents(board, out.events)).toEqual(out.board);
  return { out, seg: firstSegment(out.events) };
};
const play = (board: Board, move: ReturnType<typeof mv>, cfg: Tunables = VS_TUNABLES) => {
  const run = createRun(
    { commission: sandboxCommission([{ crop: 'carrot', count: 30 }]), board, seed: 3, uidCounter: 500 },
    cfg,
  );
  const r = applyMove(run, move, cfg);
  expect(r.ok).toBe(true);
  expect(replayEvents(board, r.events)).toEqual(r.run.board);
  return { r, seg: firstSegment(r.events) };
};
const harvested = (seg: ReturnType<typeof firstSegment>) => keys(pick(seg, 'harvest')[0]!.items.map((i) => i.pos));

describe('sickle (P1-04, 02 §3.1)', () => {
  it('horizontal 4 made by a swap spawns sickleH at b', () => {
    const b = checker({ '0,3': 'C2', '1,3': 'C2', '2,2': 'C2', '3,3': 'C2', '2,3': 'E0' });
    const { seg } = play(b, mv(2, 2, 2, 3));
    expect(pick(seg, 'specialCreated')[0]).toMatchObject({ pos: { x: 2, y: 3 }, kind: 'sickleH', stage: 2 });
  });

  it('vertical 4 spawns sickleV at a when b is outside the group', () => {
    const b = checker({ '5,1': 'B1', '5,2': 'B1', '5,3': 'E0', '6,3': 'B1', '5,4': 'B1' });
    const { seg } = play(b, mv(6, 3, 5, 3));
    expect(pick(seg, 'specialCreated')[0]).toMatchObject({ pos: { x: 5, y: 3 }, kind: 'sickleV' });
  });

  it('perpendicular orientation flips a horizontal 4 to sickleV', () => {
    const b = checker({ '0,3': 'C2', '1,3': 'C2', '2,3': 'C2', '3,3': 'C2' });
    const { seg } = settle(b, withTunables({ special: { beeEnabled: false, sickleOrientation: 'perpendicular' } }));
    expect(pick(seg, 'specialCreated')[0]!.kind).toBe('sickleV');
  });

  it('sickleH in a match harvests its whole row (via match, level 0)', () => {
    const b = checker({ '2,4': 'C2h', '2,5': 'C1', '2,6': 'C0' });
    const { seg } = settle(b);
    const trig = pick(seg, 'specialTriggered');
    expect(trig).toHaveLength(1);
    expect(trig[0]).toMatchObject({ kind: 'sickleH', via: 'match', level: 0, pos: { x: 2, y: 4 } });
    expect(harvested(seg)).toEqual(['0,4', '1,4', '2,4', '3,4', '4,4', '5,4', '6,4', '2,5', '2,6']);
  });

  it('sickleV harvests its column', () => {
    const b = checker({ '0,3': 'E1', '1,3': 'E1v', '2,3': 'E1' });
    const { seg } = settle(b);
    expect(harvested(seg)).toEqual(['1,0', '1,1', '1,2', '0,3', '1,3', '2,3', '1,4', '1,5', '1,6']);
  });

  it('a sickle hit by another special chains (via chain, level 1)', () => {
    const b = checker({ '0,0': 'C2h', '1,0': 'C2', '2,0': 'C2', '5,0': 'B0v' });
    const { seg } = settle(b);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => [t.kind, t.via, t.level])).toEqual([
      ['sickleH', 'match', 0],
      ['sickleV', 'chain', 1],
    ]);
    expect(harvested(seg)).toHaveLength(7 + 6);
  });

  it('chain BFS is FIFO in index order', () => {
    const b = checker({ '3,3': 'C2h', '4,3': 'C2', '5,3': 'C2', '0,3': 'B0v', '6,3': 'E0v', '0,6': 'B0h' });
    const { seg } = settle(b);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => `${t.pos.x},${t.pos.y}@${t.level}`)).toEqual(['3,3@0', '0,3@1', '6,3@1', '0,6@2']);
  });

  it('sickle area does not ripen its surroundings; only the match group neighbours grow', () => {
    const b = checker({ '0,3': 'C2h', '1,3': 'C2', '2,3': 'C2' });
    const { seg } = settle(b);
    const grown = keys(pick(seg, 'grow').flatMap((g) => g.items.map((i) => i.pos)));
    expect(grown.sort()).toEqual(['0,2', '0,4', '1,2', '1,4', '2,2', '2,4'].sort());
  });

  it('yields follow each harvested stage and delivery', () => {
    const { r, seg } = play(checker({ '0,6': 'C2', '1,6': 'C2', '3,6': 'C2h', '2,5': 'C2' }), mv(2, 5, 2, 6));
    const items = pick(seg, 'harvest')[0]!.items;
    const byPos = Object.fromEntries(items.map((i) => [`${i.pos.x},${i.pos.y}`, i]));
    expect(byPos['0,6']).toMatchObject({ yield: 'crop', delivered: true });
    expect(byPos['4,6']).toMatchObject({ yield: 'none', crop: 'tomato' });
    expect(r.run.delivered.carrot).toBeGreaterThanOrEqual(3);
  });

  it('a sickle sweeping a bee activates it (bee targets the most common crop)', () => {
    const b = checker({ '0,2': 'C2h', '1,2': 'C2', '2,2': 'C2', '5,2': '**' });
    const { seg } = settle(b, DEFAULT_TUNABLES);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => t.kind)).toEqual(['sickleH', 'bee']);
    expect(pick(seg, 'pollinate')[0]!.cells.length).toBeGreaterThan(10);
    expect(pick(seg, 'harvest')[0]!.items.every((i) => i.yield !== 'dewdrop')).toBe(true);
  });
});

describe('dew orb (P1-05, 02 §3.2)', () => {
  it('an L made by cascade spawns a dew orb at the corner', () => {
    const b = checker({ '4,0': 'E1', '4,1': 'E1', '4,2': 'E1', '5,2': 'E1', '6,2': 'E1' });
    const { seg } = settle(b);
    expect(pick(seg, 'specialCreated')[0]).toMatchObject({ kind: 'dewOrb', pos: { x: 4, y: 2 } });
  });

  it('harvests 3×3 and ripens the 5×5 outer ring (cause dewRing)', () => {
    const b = checker({ '3,3': 'B2d', '3,4': 'B2', '3,5': 'B2' });
    const { seg } = settle(b);
    expect(harvested(seg)).toEqual(['2,2', '3,2', '4,2', '2,3', '3,3', '4,3', '2,4', '3,4', '4,4', '3,5']);
    const ringGrow = pick(seg, 'grow').find((g) => g.cause === 'dewRing')!;
    expect(ringGrow.items.length).toBeGreaterThanOrEqual(12);
    expect(ringGrow.items.every((i) => Math.max(Math.abs(i.pos.x - 3), Math.abs(i.pos.y - 3)) === 2)).toBe(true);
  });

  it('is clipped at the board edge', () => {
    const b = checker({ '0,0': 'C1d', '1,0': 'C1', '2,0': 'C1' });
    const { seg } = settle(b);
    expect(harvested(seg)).toEqual(['0,0', '1,0', '2,0', '0,1', '1,1']);
    const ringGrow = pick(seg, 'grow').find((g) => g.cause === 'dewRing')!;
    expect(keys(ringGrow.items.map((i) => i.pos))).toEqual(['2,1', '0,2', '1,2', '2,2']);
  });

  it('ring and neighbour ripening never stack on one cell (ring wins attribution)', () => {
    const b = checker({ '2,2': 'E0d', '3,2': 'E0', '4,2': 'E0' });
    const { seg } = settle(b);
    const all = pick(seg, 'grow').flatMap((g) => g.items.map((i) => `${i.pos.x},${i.pos.y}`));
    expect(new Set(all).size).toBe(all.length);
    const ringKeys = keys(pick(seg, 'grow').find((g) => g.cause === 'dewRing')!.items.map((i) => i.pos));
    expect(ringKeys).toContain('4,0');
  });

  it('dew orb and sickle chain into each other', () => {
    const b = checker({ '0,5': 'C2h', '1,5': 'C2', '2,5': 'C2', '5,5': 'B0d', '6,4': 'E0v' });
    const { seg } = settle(b);
    expect(pick(seg, 'specialTriggered').map((t) => t.kind)).toEqual(['sickleH', 'dewOrb', 'sickleV']);
  });

  it('pure helpers: square, ring, effectOf', () => {
    expect(square(0, 0, 1)).toEqual([0, 1, 7, 8]);
    expect(ring(3, 3, 3)).toHaveLength(24);
    const g = checker({}).cells.slice();
    expect(effectOf(g, 0, new Array(49).fill(false))).toEqual({ cells: [], ring: [], pollinated: [] });
    expect(beeTarget(checker({}).cells.slice(), new Array(49).fill(false))).toBe('tomato');
    expect(beeTarget(checker({}, ['**', '**']).cells.slice(), new Array(49).fill(false))).toBeNull();
  });
});
