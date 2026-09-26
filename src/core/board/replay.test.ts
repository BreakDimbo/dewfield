import { describe, expect, it } from 'vitest';
import { checker } from '@/core/testkit/checker';
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
