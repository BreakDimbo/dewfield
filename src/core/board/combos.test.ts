import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, type Tunables } from '@/core/config/tunables';
import { applyMove, createRun } from '@/core/run/run';
import { checker, firstSegment, keys, pick } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import type { Board } from './model';
import { createRng } from '@/core/rng/rng';
import { classifySwap } from './moves';
import { settleGrid } from './resolve';
import { grid } from './testkit';
import { replayEvents } from './replay';

const play = (board: Board, move: ReturnType<typeof mv>, cfg: Tunables = DEFAULT_TUNABLES) => {
  const run = createRun(
    { commission: sandboxCommission([{ crop: 'tomato', count: 99 }]), board, seed: 11, uidCounter: 500 },
    cfg,
  );
  const r = applyMove(run, move, cfg);
  expect(r.ok).toBe(true);
  expect(replayEvents(board, r.events)).toEqual(r.run.board);
  const seg = firstSegment(r.events);
  return { r, seg, harvest: pick(seg, 'harvest')[0]!.items };
};

describe('swap legality with specials (02 §1.3)', () => {
  it('two specials are always legal (combo), even with no match', () => {
    const b = checker({ '3,3': 'C2h', '4,3': 'E2d' });
    expect(classifySwap(b.cells, mv(3, 3, 4, 3))).toBe('combo');
  });
  it('a bee with any tile is legal', () => {
    expect(classifySwap(checker({ '3,3': '**' }).cells, mv(3, 3, 3, 4))).toBe('bee');
  });
  it('sickle or dew orb with a plain crop and no match is illegal', () => {
    const b = checker({ '3,3': 'C2h', '4,3': 'E0' });
    expect(classifySwap(b.cells, mv(3, 3, 4, 3))).toBeNull();
    const run = createRun(
      { commission: sandboxCommission([{ crop: 'carrot', count: 1 }]), board: b, seed: 1, uidCounter: 60 },
      VS_TUNABLES,
    );
    const r = applyMove(run, mv(3, 3, 4, 3), VS_TUNABLES);
    expect(r).toMatchObject({ ok: false, reason: 'noMatch' });
    expect(r.run).toBe(run);
    expect(r.events).toEqual([{ t: 'swapRejected', a: { x: 3, y: 3 }, b: { x: 4, y: 3 } }]);
  });
  it('non-adjacent and same-crop swaps are illegal', () => {
    const b = checker({});
    expect(classifySwap(b.cells, mv(0, 0, 2, 0))).toBeNull();
    expect(classifySwap(checker({ '0,0': 'C1', '1,0': 'C2' }).cells, mv(0, 0, 1, 0))).toBeNull();
  });
});

describe('VS combos (P1-06, 02 §3.5)', () => {
  it('sickle + sickle: row and column through b', () => {
    const { harvest, seg } = play(checker({ '2,3': 'C2h', '3,3': 'E2v' }), mv(2, 3, 3, 3), VS_TUNABLES);
    expect(harvest).toHaveLength(13);
    expect(keys(harvest.map((h) => h.pos)).every((k) => k.endsWith(',3') || k.startsWith('3,'))).toBe(true);
    expect(pick(seg, 'specialTriggered').every((t) => t.via === 'combo' && t.level === 0)).toBe(true);
    expect(pick(seg, 'cascadeStep')).toHaveLength(0);
  });
  it('sickle + sickle at a corner', () => {
    const { harvest } = play(checker({ '0,1': 'C2v', '0,0': 'E2v' }), mv(0, 1, 0, 0), VS_TUNABLES);
    expect(harvest).toHaveLength(13);
  });
  it('sickle + dew orb: three rows and three columns', () => {
    const { harvest } = play(checker({ '3,2': 'C2h', '3,3': 'B2d' }), mv(3, 2, 3, 3), VS_TUNABLES);
    expect(harvest).toHaveLength(33);
  });
  it('sickle + dew orb at the edge is clipped', () => {
    const { harvest } = play(checker({ '1,6': 'B2d', '0,6': 'C2h' }), mv(1, 6, 0, 6), VS_TUNABLES);
    expect(harvest).toHaveLength(24);
  });
  it('dew + dew: 5×5 and the 7×7 ring grows', () => {
    const { harvest, seg } = play(checker({ '3,2': 'C2d', '3,3': 'B2d' }), mv(3, 2, 3, 3), VS_TUNABLES);
    expect(harvest).toHaveLength(25);
    const ring = pick(seg, 'grow').find((g) => g.cause === 'dewRing')!;
    expect(ring.items).toHaveLength(24);
  });
  it('dew + dew at a corner', () => {
    const { harvest, seg } = play(checker({ '1,0': 'C2d', '0,0': 'B2d' }), mv(1, 0, 0, 0), VS_TUNABLES);
    expect(harvest).toHaveLength(9);
    expect(pick(seg, 'grow').find((g) => g.cause === 'dewRing')!.items).toHaveLength(7);
  });
  it('specials inside a combo area chain', () => {
    const { seg } = play(checker({ '2,3': 'C2h', '3,3': 'E2v', '6,3': 'B0v' }), mv(2, 3, 3, 3), VS_TUNABLES);
    const chained = pick(seg, 'specialTriggered').find((t) => t.pos.x === 6)!;
    expect(chained).toMatchObject({ via: 'chain', level: 1 });
  });
});

describe('bee (P2-01) and bee combos (P2-02)', () => {
  it('bee + crop pollinates every tile of that crop, all ripe', () => {
    const b = checker({ '3,3': '**', '0,0': 'C0', '6,6': 'C1', '2,5': 'C0v', '3,4': 'C0' });
    const { harvest, seg } = play(b, mv(3, 3, 3, 4));
    const carrots = harvest.filter((h) => h.crop === 'carrot');
    expect(carrots.length).toBeGreaterThanOrEqual(4);
    expect(carrots.every((h) => h.yield === 'crop' && h.stage === 2)).toBe(true);
    expect(harvest.find((h) => h.crop === null)?.yield).toBe('none');
    expect(pick(seg, 'pollinate')).toHaveLength(1);
    const trig = pick(seg, 'specialTriggered');
    expect(trig[0]).toMatchObject({ kind: 'bee', via: 'swap' });
    expect(trig.some((t) => t.kind === 'sickleV')).toBe(true);
  });

  it('bee + sickle converts the crop to alternating sickles and fires them all', () => {
    const b = checker({ '3,3': '**', '3,4': 'C2h', '0,0': 'C1', '1,0': 'E0', '6,5': 'C0' });
    const { seg } = play(b, mv(3, 3, 3, 4));
    const conv = pick(seg, 'convert')[0]!;
    expect(conv.cause).toBe('bee');
    expect(conv.items.map((i) => [i.pos.x, i.pos.y, i.kind])).toEqual([
      [0, 0, 'sickleH'],
      [6, 5, 'sickleV'],
    ]);
    const fired = pick(seg, 'specialTriggered').filter((t) => t.via === 'combo' && t.kind !== 'bee');
    expect(fired.length).toBe(3);
    expect(pick(seg, 'harvest')[0]!.items.find((i) => i.pos.x === 0 && i.pos.y === 0)!.stage).toBe(1);
  });

  it('bee + dew orb converts to dew orbs that keep their stage', () => {
    const b = checker({ '3,3': '**', '3,4': 'B2d', '0,0': 'B0' });
    const { seg } = play(b, mv(3, 3, 3, 4));
    expect(pick(seg, 'convert')[0]!.items.map((i) => i.kind)).toEqual(['dewOrb']);
    expect(pick(seg, 'specialTriggered').filter((t) => t.kind === 'dewOrb')).toHaveLength(2);
  });

  it('bee + bee harvests the whole board, crops ripe', () => {
    const { harvest } = play(checker({ '3,3': '**', '3,4': '**' }), mv(3, 3, 3, 4));
    expect(harvest).toHaveLength(49);
    expect(harvest.filter((h) => h.crop).every((h) => h.yield === 'crop')).toBe(true);
  });

  it('bee + crop at a corner with no other tile of that crop: only that crop and the bee', () => {
    const { harvest, seg } = play(checker({ '0,0': '**', '1,0': 'C1' }), mv(0, 0, 1, 0));
    expect(keys(pick(seg, 'pollinate')[0]!.cells)).toEqual(['0,0']);
    expect(harvest.map((h) => [h.pos.x, h.pos.y, h.crop, h.stage, h.yield])).toEqual([
      [0, 0, 'carrot', 2, 'crop'],
      [1, 0, null, null, 'none'],
    ]);
  });

  it('bee + sickle at the edge with no other tile of that crop: nothing converts, the sickle still fires', () => {
    const { harvest, seg } = play(checker({ '0,0': '**', '1,0': 'C1v' }), mv(0, 0, 1, 0));
    expect(pick(seg, 'convert')).toHaveLength(0);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => [t.kind, t.via, t.pos.x, t.pos.y])).toEqual([
      ['bee', 'combo', 1, 0],
      ['sickleV', 'combo', 0, 0],
    ]);
    expect(keys(harvest.map((h) => h.pos))).toEqual(['0,0', '1,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6']);
    expect(pick(seg, 'pollinate')).toHaveLength(0);
    expect(harvest.find((h) => h.pos.x === 0 && h.pos.y === 0)).toMatchObject({ stage: 1, yield: 'dewdrop' });
  });

  it('bee + dew orb: converted orbs keep their stage, each fires 3×3 and grows its outer ring', () => {
    const b = checker({ '3,3': '**', '3,4': 'B2d', '0,6': 'B0', '6,0': 'B1' });
    const { harvest, seg } = play(b, mv(3, 3, 3, 4));
    expect(pick(seg, 'convert')[0]!.items.map((i) => [i.pos.x, i.pos.y, i.kind])).toEqual([
      [6, 0, 'dewOrb'],
      [0, 6, 'dewOrb'],
    ]);
    const orbs = pick(seg, 'specialTriggered').filter((t) => t.kind === 'dewOrb');
    expect(orbs.map((t) => [t.pos.x, t.pos.y, t.area.length])).toEqual([
      [6, 0, 4],
      [3, 3, 9],
      [0, 6, 4],
    ]);
    expect(harvest.find((h) => h.pos.x === 0 && h.pos.y === 6)).toMatchObject({ crop: 'blueberry', stage: 0, yield: 'none' });
    expect(harvest.find((h) => h.pos.x === 6 && h.pos.y === 0)).toMatchObject({ stage: 1, yield: 'dewdrop' });
    expect(pick(seg, 'pollinate')).toHaveLength(0);
    const ring = keys(pick(seg, 'grow').find((g) => g.cause === 'dewRing')!.items.map((i) => i.pos));
    for (const k of ['0,4', '1,4', '2,5', '2,6', '4,0', '4,1', '5,2', '6,2', '1,1', '5,5']) expect(ring).toContain(k);
    const inH = new Set(keys(harvest.map((h) => h.pos)));
    expect(ring.some((k) => inH.has(k))).toBe(false);
  });

  it('bee + bee at a corner: whole board, every crop ripe, other specials consumed without growth', () => {
    const b = checker({ '0,0': '**', '1,0': '**', '6,6': '**', '3,3': 'B0d', '5,1': 'C0h' });
    const { harvest, seg } = play(b, mv(1, 0, 0, 0));
    expect(harvest).toHaveLength(49);
    expect(pick(seg, 'pollinate')[0]!.cells).toHaveLength(46);
    expect(harvest.filter((h) => h.crop).every((h) => h.stage === 2 && h.yield === 'crop')).toBe(true);
    expect(harvest.filter((h) => !h.crop).map((h) => keys([h.pos])[0])).toEqual(['0,0', '1,0', '6,6']);
    expect(pick(seg, 'grow')).toHaveLength(0);
  });

  it('a swept bee with no crops left outside H has no effect (02 §3.3)', () => {
    // Only row 0 holds crops; the sickle sweeps all of it, so the four swept bees find no target.
    const b = grid(`
      C2h C2 C2 . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .
      . . . . . . .`);
    const out = settleGrid({ board: b, rng: createRng(7), uidCounter: 500, spawnQueue: [], ledger: { remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 } }, DEFAULT_TUNABLES);
    expect(replayEvents(b, out.events)).toEqual(out.board);
    const seg = firstSegment(out.events);
    const bees = pick(seg, 'specialTriggered').filter((t) => t.kind === 'bee');
    expect(bees.map((t) => t.pos.x)).toEqual([3, 4, 5, 6]);
    expect(bees.every((t) => t.area.length === 0 && t.via === 'chain')).toBe(true);
    expect(pick(seg, 'pollinate')).toHaveLength(0);
    expect(keys(pick(seg, 'harvest')[0]!.items.map((h) => h.pos))).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0', '5,0', '6,0']);
  });
});
