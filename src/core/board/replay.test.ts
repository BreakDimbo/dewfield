import { describe, expect, it } from 'vitest';
import type { OrderItem } from '@/core/commission/types';
import { DEFAULT_TUNABLES } from '@/core/config/tunables';
import { applyMove } from '@/core/run/run';
import { checker, pick } from '@/core/testkit/checker';
import { mv, runFromAscii } from '@/core/testkit/runs';
import beeReplay from '../../../tests/fixtures/replays/bee-line5-swap.json';
import { hashBoard } from './model';
import { applyEventToBoard, applyEventToGrid, replayEvents } from './replay';

describe('replay (03 §5.4 render contract)', () => {
  const b = checker({ '0,0': 'C1' });

  it('recolor, convert and beePlaced update tiles in place', () => {
    const uid = b.cells[0]!.uid;
    let out = applyEventToBoard(b, { t: 'recolor', items: [{ uid, pos: { x: 0, y: 0 }, crop: 'eggplant' }] });
    expect(out.cells[0]).toMatchObject({ crop: 'eggplant', stage: 1 });
    out = applyEventToBoard(out, { t: 'convert', items: [{ uid, pos: { x: 0, y: 0 }, kind: 'sickleV' }], cause: 'rush' });
    expect(out.cells[0]).toMatchObject({ special: 'sickleV' });
    out = applyEventToBoard(out, { t: 'beePlaced', pos: { x: 0, y: 0 }, uid: 999, replacedUid: uid });
    expect(out.cells[0]).toEqual({ uid: 999, kind: 'bee' });
    expect(applyEventToBoard(out, { t: 'rushEnd' })).toEqual(out);
  });

  it('rejects events that disagree with the board', () => {
    expect(() => applyEventToBoard(b, { t: 'beePlaced', pos: { x: 0, y: 0 }, uid: 1, replacedUid: 12345 })).toThrow();
    expect(() => applyEventToGrid(b.cells.slice(), { t: 'fall', items: [{ uid: 12345, from: { x: 0, y: 0 }, to: { x: 0, y: 1 } }] })).toThrow();
    expect(() => applyEventToBoard(b, { t: 'harvest', items: [{ pos: { x: 0, y: 0 }, uid: b.cells[0]!.uid, crop: 'carrot', stage: 1, yield: 'dewdrop', delivered: false }] })).toThrow(/holes/);
    expect(() => replayEvents(b, [{ t: 'harvest', items: [{ pos: { x: 0, y: 0 }, uid: b.cells[0]!.uid, crop: 'carrot', stage: 1, yield: 'dewdrop', delivered: false }] }])).toThrow(/holes/);
  });
});

describe('golden replay fixtures (tests/fixtures/replays)', () => {
  it('bee-line5-swap: events replay byte-identically and match the stored hash', () => {
    const fx = beeReplay;
    const cfg = DEFAULT_TUNABLES;
    const items = fx.commission.items as OrderItem[];
    let run = runFromAscii(fx.fieldAscii.join('\n'), cfg, { items, moves: fx.commission.moves, seed: fx.seed, queue: fx.spawnQueue });
    let events = 0;
    const kinds: string[] = [];
    for (const [ax, ay, bx, by] of fx.moves) {
      const before = run.board;
      const r = applyMove(run, mv(ax!, ay!, bx!, by!), cfg);
      if (!r.ok) throw new Error(r.reason);
      expect(JSON.stringify(replayEvents(before, r.events))).toBe(JSON.stringify(r.run.board));
      events += r.events.length;
      kinds.push(...pick(r.events, 'specialCreated').map((e) => e.kind), ...pick(r.events, 'pollinate').map(() => 'pollinate'));
      run = r.run;
    }
    expect(run.spawnQueue.length).toBeGreaterThan(0); // every refill came from the queue
    expect(kinds[0]).toBe('bee');
    expect(kinds).toContain('pollinate');
    expect({ events, hash: hashBoard(run.board) }).toEqual(fx.expect);
  });
});
