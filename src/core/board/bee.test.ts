import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, type Tunables } from '@/core/config/tunables';
import { createRng } from '@/core/rng/rng';
import { applyMove, createRun } from '@/core/run/run';
import { checker, firstSegment, keys, pick } from '@/core/testkit/checker';
import { mv, sandboxCommission } from '@/core/testkit/runs';
import type { OrderItem } from '@/core/commission/types';
import { CROP_BY_ASCII } from '@/core/config/crops';
import { parseBoard } from './ascii';
import type { Board } from './model';
import { replayEvents } from './replay';
import { resolveRush, settleGrid } from './resolve';

/*
 * P2-01 AC1 — bee fixtures (02 §3.3). Every case runs the real pipeline on DEFAULT_TUNABLES (bees on)
 * and checks the event replay reproduces the final board (AC2).
 *
 *  1. generation: a swap making a horizontal 5 creates a bee at b
 *  2. generation: a cascade vertical 6 creates a bee at offset floor((len-1)/2)
 *  3. swap with a crop: every tile of that crop is pollinated and harvested ripe; nothing else is
 *  4. pollinated crops count toward the order (sprouts delivered as ripe)
 *  5. swept by a sickle: target = crop with most cells outside H (not the most on the whole board)
 *  6. swept by a sickle: exact tie → earlier crop order wins (even if the later crop comes first in index order)
 *  7. chain-activated at level 2 (sickle → dew orb → bee)
 *  8. specials inside the target crop chain-activate
 *  9. two bees in one chain: the second picks its target at dequeue time, after the first took its crop
 * 10. no crops left outside H → the bee has no effect (empty area, no pollinate event)
 * 11. harvest rush detonates a bee "as affected" (via rush), targeting the most common crop
 *  (+ combos.test.ts: bee + crop / sickle / dew / bee; specials.test.ts: sickle sweeping a bee;
 *     match.test.ts: line5 → bee, bees truncate runs; resolve.test.ts: bees never grow)
 */

const cfg = DEFAULT_TUNABLES;
const ledger = () => ({ remaining: {}, delivered: {}, surplus: {}, dewdrops: 0 });

const settle = (board: Board, c: Tunables = cfg) => {
  const out = settleGrid({ board, rng: createRng(7), uidCounter: 500, spawnQueue: [], ledger: ledger() }, c);
  expect(JSON.stringify(replayEvents(board, out.events))).toBe(JSON.stringify(out.board));
  return { out, seg: firstSegment(out.events) };
};

const play = (board: Board, move: ReturnType<typeof mv>, items: OrderItem[] = [{ crop: 'blueberry', count: 99 }]) => {
  const run = createRun({ commission: sandboxCommission(items), board, seed: 3, uidCounter: 500 }, cfg);
  const r = applyMove(run, move, cfg);
  if (!r.ok) throw new Error(r.reason);
  expect(JSON.stringify(replayEvents(board, r.events))).toBe(JSON.stringify(r.run.board));
  return { r, seg: firstSegment(r.events) };
};

const board = (ascii: string) => parseBoard(ascii).board;
const cellsOf = (b: Board, ascii: string) =>
  keys(b.cells.flatMap((t, i) => (t.kind === 'crop' && t.crop === CROP_BY_ASCII[ascii]!.id ? [{ x: i % 7, y: Math.floor(i / 7) }] : [])));

describe('bee swarm fixtures (P2-01 AC1, 02 §3.3)', () => {
  it('1. a swap making a horizontal 5 creates a bee at b', () => {
    const b = checker({ '0,3': 'C2', '1,3': 'C2', '2,2': 'C2', '3,3': 'C2', '4,3': 'C2', '2,3': 'E0' });
    const { seg } = play(b, mv(2, 2, 2, 3));
    expect(pick(seg, 'match')[0]!.groups).toMatchObject([{ crop: 'carrot', shape: 'line5' }]);
    expect(pick(seg, 'specialCreated')).toEqual([
      { t: 'specialCreated', pos: { x: 2, y: 3 }, uid: expect.any(Number), kind: 'bee', crop: null, stage: null },
    ]);
    expect(pick(seg, 'harvest')[0]!.items.filter((h) => h.crop === 'carrot')).toHaveLength(5);
  });

  it('2. a cascade vertical 6 creates a bee at offset floor((6-1)/2) = 2', () => {
    const b = checker({ '4,0': 'E1', '4,1': 'E1', '4,2': 'E1', '4,3': 'E1', '4,4': 'E1', '4,5': 'E1' });
    const { seg } = settle(b);
    expect(pick(seg, 'specialCreated')).toMatchObject([{ pos: { x: 4, y: 2 }, kind: 'bee', crop: null }]);
  });

  it('3. swapped with a crop: exactly that crop is pollinated and harvested ripe', () => {
    const b = checker({ '3,3': '**', '3,4': 'B0', '0,0': 'B1', '6,6': 'B2', '5,1': 'B0' });
    const { seg } = play(b, mv(3, 3, 3, 4));
    const pollinated = keys(pick(seg, 'pollinate')[0]!.cells);
    expect(pollinated).toEqual(['0,0', '5,1', '3,3', '6,6']);
    const harvest = pick(seg, 'harvest')[0]!.items;
    expect(keys(harvest.map((h) => h.pos))).toEqual(['0,0', '5,1', '3,3', '3,4', '6,6']);
    expect(harvest.filter((h) => h.crop === 'blueberry').every((h) => h.stage === 2 && h.yield === 'crop')).toBe(true);
    expect(harvest.find((h) => h.pos.x === 3 && h.pos.y === 4)).toMatchObject({ crop: null, yield: 'none' });
    expect(pick(seg, 'specialTriggered')).toMatchObject([{ kind: 'bee', via: 'swap', pos: { x: 3, y: 4 } }]);
  });

  it('4. pollinated crops count toward the order, sprouts included', () => {
    const b = checker({ '3,3': '**', '3,4': 'B0', '0,0': 'B0', '6,6': 'B1', '5,1': 'B0' });
    const { r, seg } = play(b, mv(3, 3, 3, 4), [{ crop: 'blueberry', count: 10 }]);
    const harvest = pick(seg, 'harvest')[0]!.items;
    expect(harvest.filter((h) => h.delivered)).toHaveLength(4);
    expect(r.run.delivered.blueberry).toBeGreaterThanOrEqual(4);
    expect(harvest.some((h) => h.yield === 'dewdrop')).toBe(false);
    // Ordering tomatoes instead: the 25 tomato sprouts of the checker all deliver as ripe.
    const t = play(checker({ '4,3': '**' }), mv(4, 3, 3, 3), [{ crop: 'tomato', count: 40 }]);
    expect(pick(t.seg, 'harvest')[0]!.items.filter((h) => h.delivered && h.crop === 'tomato')).toHaveLength(25);
    expect(t.r.run.delivered.tomato).toBeGreaterThanOrEqual(25);
  });

  it('5. swept by a sickle: target = crop with the most cells outside H', () => {
    // Rows 0–5: eggplant 21, corn 20. Row 6 (swept) is corn-heavy, so counting H would pick corn.
    const b = board(`
      E0 T0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      E0 M0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      E0 M0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      C2h C2 C2 M0 ** M0 M0`);
    const { seg } = settle(b);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => [t.kind, t.via, t.level])).toEqual([
      ['sickleH', 'match', 0],
      ['bee', 'chain', 1],
    ]);
    expect(keys(pick(seg, 'pollinate')[0]!.cells)).toEqual(cellsOf(b, 'E'));
    expect(keys(trig[1]!.area)).toHaveLength(21);
  });

  it('6. swept by a sickle: exact tie → earlier crop order wins', () => {
    // Rows 0–5: eggplant 21 and corn 21, eggplant first in index order; corn (order 2) beats eggplant (3).
    const b = board(`
      E0 M0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      E0 M0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      E0 M0 E0 M0 E0 M0 E0
      M0 E0 M0 E0 M0 E0 M0
      C2h C2 C2 E0 ** E0 M0`);
    const { seg } = settle(b);
    const bee = pick(seg, 'specialTriggered').find((t) => t.kind === 'bee')!;
    const corn = cellsOf(b, 'M').filter((k) => !k.endsWith(',6'));
    expect(corn).toHaveLength(21);
    expect(keys(bee.area)).toEqual(corn);
    expect(keys(pick(seg, 'pollinate')[0]!.cells)).toEqual(corn);
  });

  it('7. chain-activated at level 2: sickle → dew orb → bee', () => {
    const b = checker({ '0,5': 'C2h', '1,5': 'C2', '2,5': 'C2', '5,5': 'B0d', '6,4': '**' });
    const { seg } = settle(b);
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => [t.kind, t.via, t.level])).toEqual([
      ['sickleH', 'match', 0],
      ['dewOrb', 'chain', 1],
      ['bee', 'chain', 2],
    ]);
    // Outside H the checker has more tomatoes than corn → tomatoes pollinated.
    expect(pick(seg, 'pollinate')[0]!.cells.length).toBeGreaterThan(15);
  });

  it('8. an X special inside the target crop chain-activates', () => {
    const b = checker({ '3,3': '**', '3,4': 'B1', '0,1': 'B0v', '6,0': 'B2' });
    const { seg } = play(b, mv(3, 3, 3, 4));
    const trig = pick(seg, 'specialTriggered');
    expect(trig.map((t) => [t.kind, t.pos.x, t.pos.y])).toEqual([
      ['bee', 3, 4],
      ['sickleV', 0, 1],
    ]);
    const harvested = keys(pick(seg, 'harvest')[0]!.items.map((h) => h.pos));
    for (let y = 0; y < 7; y++) expect(harvested).toContain(`0,${y}`);
    // Column 0 tiles swept by the sickle (not pollinated) yield at their own stage.
    expect(pick(seg, 'harvest')[0]!.items.find((h) => h.pos.x === 0 && h.pos.y === 2)).toMatchObject({ stage: 0, yield: 'none' });
  });

  it('9. two bees in one sweep: the second picks its target at dequeue, after the first took its crop', () => {
    const b = checker({ '0,3': 'C2h', '1,3': 'C2', '2,3': 'C2', '4,3': '**', '6,3': '**' });
    const { seg } = settle(b);
    const bees = pick(seg, 'specialTriggered').filter((t) => t.kind === 'bee');
    expect(bees.map((t) => [t.pos.x, t.level])).toEqual([
      [4, 1],
      [6, 1],
    ]);
    const tomatoes = cellsOf(b, 'T').filter((k) => !k.endsWith(',3'));
    const corn = cellsOf(b, 'M').filter((k) => !k.endsWith(',3'));
    expect(keys(bees[0]!.area)).toEqual(tomatoes);
    expect(keys(bees[1]!.area)).toEqual(corn);
    const all = keys(pick(seg, 'pollinate')[0]!.cells);
    expect(all).toHaveLength(tomatoes.length + corn.length);
  });

  it('11. harvest rush detonates a bee as affected (via rush) → most common crop', () => {
    const b = checker({ '0,0': '**' });
    const out = resolveRush(
      { board: b, rng: createRng(5), uidCounter: 500, spawnQueue: [], ledger: ledger() },
      0,
      cfg,
    );
    expect(JSON.stringify(replayEvents(b, out.events))).toBe(JSON.stringify(out.board));
    const first = pick(out.events, 'specialTriggered')[0]!;
    expect(first).toMatchObject({ kind: 'bee', via: 'rush', level: 0, pos: { x: 0, y: 0 } });
    // (0,0) was a tomato in the checker, so corn and tomato tie at 24 → tomato (earlier order).
    expect(keys(first.area)).toEqual(cellsOf(b, 'T'));
    const firstHarvest = pick(out.events, 'harvest')[0]!.items.filter((h) => h.crop === 'tomato');
    expect(firstHarvest).toHaveLength(24);
    expect(firstHarvest.every((h) => h.yield === 'crop' && !h.delivered)).toBe(true);
    expect(out.ledger.surplus.tomato).toBeGreaterThanOrEqual(24);
  });
});
