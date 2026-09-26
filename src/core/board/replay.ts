import { invariant } from '@/core/util/invariant';
import { tileFromToken } from './ascii';
import type { BoardEvent } from './events';
import { N, idx, makeBoard, type Board, type Tile } from './model';

export type PresentedGrid = (Tile | null)[];

function moveMany(g: PresentedGrid, items: readonly { uid: number; from: { x: number; y: number }; to: { x: number; y: number } }[]) {
  const picked = items.map((m) => {
    const t = g[idx(m.from)];
    invariant(t && t.uid === m.uid, `replay: uid ${m.uid} not at from`);
    return t;
  });
  for (const m of items) g[idx(m.from)] = null;
  items.forEach((m, k) => (g[idx(m.to)] = picked[k]!));
}

function mustAt(g: PresentedGrid, pos: { x: number; y: number }, uid: number): Tile {
  const t = g[idx(pos)];
  invariant(t && t.uid === uid, `replay: uid ${uid} not at (${pos.x},${pos.y})`);
  return t;
}

/** Applies one event to a presented grid in place. Presentation-only events are no-ops. */
export function applyEventToGrid(g: PresentedGrid, e: BoardEvent): void {
  switch (e.t) {
    case 'swap': {
      const i = idx(e.a);
      const j = idx(e.b);
      const t = g[i]!;
      g[i] = g[j]!;
      g[j] = t;
      return;
    }
    case 'harvest':
      for (const it of e.items) {
        mustAt(g, it.pos, it.uid);
        g[idx(it.pos)] = null;
      }
      return;
    case 'specialCreated':
      g[idx(e.pos)] =
        e.kind === 'bee'
          ? { uid: e.uid, kind: 'bee' }
          : { uid: e.uid, kind: 'crop', crop: e.crop!, stage: e.stage!, special: e.kind };
      return;
    case 'grow':
      for (const it of e.items) {
        const t = mustAt(g, it.pos, it.uid);
        if (t.kind === 'crop') g[idx(it.pos)] = { ...t, stage: it.to };
      }
      return;
    case 'convert':
      for (const it of e.items) {
        const t = mustAt(g, it.pos, it.uid);
        if (t.kind === 'crop') g[idx(it.pos)] = { ...t, special: it.kind };
      }
      return;
    case 'recolor':
      for (const it of e.items) {
        const t = mustAt(g, it.pos, it.uid);
        if (t.kind === 'crop') g[idx(it.pos)] = { ...t, crop: it.crop };
      }
      return;
    case 'fall':
    case 'shuffle':
      moveMany(g, e.items);
      return;
    case 'spawn':
      for (const it of e.items) g[idx(it.pos)] = tileFromToken(it.token, it.uid);
      return;
    case 'beePlaced':
      mustAt(g, e.pos, e.replacedUid);
      g[idx(e.pos)] = { uid: e.uid, kind: 'bee' };
      return;
    default:
      return;
  }
}

export function applyEventToBoard(board: Board, e: BoardEvent): Board {
  const g: PresentedGrid = board.cells.slice();
  applyEventToGrid(g, e);
  invariant(g.every(Boolean) && g.length === N, 'applyEventToBoard: result has holes (use applyEventToGrid)');
  return makeBoard(g as Tile[]);
}

export function replayEvents(board: Board, events: readonly BoardEvent[]): Board {
  const g: PresentedGrid = board.cells.slice();
  for (const e of events) applyEventToGrid(g, e);
  invariant(g.every(Boolean), 'replayEvents: final board has holes');
  return makeBoard(g as Tile[]);
}
