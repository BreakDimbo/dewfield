import { parseBoard } from '@/core/board/ascii';
import type { BoardEvent } from '@/core/board/events';
import type { Board } from '@/core/board/model';

/** T0/M0 checkerboard (never matches) with C/E/B/specials overlaid: `{ '1,3': 'C2h' }`. */
export function checker(overlay: Record<string, string>, bg: [string, string] = ['T0', 'M0']): Board {
  const rows: string[] = [];
  for (let y = 0; y < 7; y++) {
    const r: string[] = [];
    for (let x = 0; x < 7; x++) r.push(overlay[`${x},${y}`] ?? bg[(x + y) % 2]!);
    rows.push(r.join(' '));
  }
  return parseBoard(rows.join('\n'), 1).board;
}

/** Events before the first gravity of the move. */
export function firstSegment(events: readonly BoardEvent[]): BoardEvent[] {
  const k = events.findIndex((e) => e.t === 'fall' || e.t === 'spawn');
  return k < 0 ? events.slice() : events.slice(0, k);
}

export const pick = <T extends BoardEvent['t']>(events: readonly BoardEvent[], t: T) =>
  events.filter((e): e is Extract<BoardEvent, { t: T }> => e.t === t);

export const keys = (cells: readonly { x: number; y: number }[]) => cells.map((c) => `${c.x},${c.y}`);
