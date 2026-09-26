import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, VS_TUNABLES, type Tunables } from '@/core/config/tunables';
import { applyMove, createRun } from '@/core/run/run';
import { checker, firstSegment, keys, pick } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import type { Board } from './model';
import { classifySwap } from './moves';
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

  it('a board with no crops leaves a triggered bee without effect', () => {
    const b = checker({ '0,0': 'C2h', '1,0': 'C2', '2,0': 'C2' }, ['**', '**']);
    const { seg } = play(b, mv(0, 1, 0, 0));
    expect(pick(seg, 'pollinate').length).toBeLessThanOrEqual(1);
  });
});
