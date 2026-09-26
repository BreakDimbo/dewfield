import { describe, expect, it } from 'vitest';
import { printBoard } from '@/core/board/ascii';
import type { BoardEvent } from '@/core/board/events';
import { replayEvents } from '@/core/board/replay';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import { VS_TUNABLES } from '@/core/config/tunables';
import { applyMove, type ApplyResult } from '@/core/run/run';
import { mv, t1Run } from '@/core/testkit/runs';

const norm = (s: string) =>
  s
    .trim()
    .split('\n')
    .map((r) => r.trim().split(/\s+/).join(' '))
    .join('\n');

const AFTER_STEP_2 = `
M2 T2 B2 T2 M2 B2 M2
T2 M2 T2 T2 M2 B2 T2
M2 B2 M2 M2 B2 T2 M2
B2 T2 C2h B2 T2 M2 B2
M2 B2 C2 M2 M2 B2 T2
B2 T2 M2 C2 B2 T2 M2
T2 M2 B2 T2 T2 M2 T2`;

const ok = (r: ApplyResult) => {
  expect(r.ok).toBe(true);
  return r as Extract<ApplyResult, { ok: true }>;
};
const depthOf = (events: BoardEvent[]) =>
  Math.max(0, ...events.filter((e) => e.t === 'cascadeStep').map((e) => (e as { depth: number }).depth));

describe('T1 "第一篮" (02 §11.2)', () => {
  const guided = COMMISSION_BY_ID.T1!.guidedMoves!.map((g) => mv(g.a[0], g.a[1], g.b[0], g.b[1]));

  it.each([1, 2, 3, 42, 9001])('scripted three moves win regardless of seed %i', (seed) => {
    const r0 = t1Run(VS_TUNABLES, seed);
    const s1 = ok(applyMove(r0, guided[0]!, VS_TUNABLES));
    expect(s1.run.delivered.carrot).toBe(3);
    expect(depthOf(s1.events)).toBe(1);
    const spawn1 = s1.events.find((e) => e.t === 'spawn') as Extract<BoardEvent, { t: 'spawn' }>;
    expect(spawn1.items.map((i) => [i.pos.x, i.token])).toEqual([
      [4, 'M2'],
      [5, 'B2'],
      [6, 'M2'],
    ]);

    const s2 = ok(applyMove(s1.run, guided[1]!, VS_TUNABLES));
    expect(s2.run.delivered.carrot).toBe(7);
    expect(depthOf(s2.events)).toBe(1);
    expect(printBoard(s2.run.board)).toBe(norm(AFTER_STEP_2));
    const created = s2.events.find((e) => e.t === 'specialCreated') as Extract<BoardEvent, { t: 'specialCreated' }>;
    expect(created).toMatchObject({ pos: { x: 2, y: 3 }, kind: 'sickleH', crop: 'carrot' });
    expect(s2.run.spawnQueue).toEqual([]);

    const s3 = ok(applyMove(s2.run, guided[2]!, VS_TUNABLES));
    const firstHarvest = s3.events.find((e) => e.t === 'harvest') as Extract<BoardEvent, { t: 'harvest' }>;
    expect(firstHarvest.items).toHaveLength(9);
    expect(s3.events.some((e) => e.t === 'specialTriggered' && e.kind === 'sickleH')).toBe(true);
    expect(depthOf(s3.events)).toBeGreaterThanOrEqual(2);
    const matches = s3.events.filter((e) => e.t === 'match') as Extract<BoardEvent, { t: 'match' }>[];
    const hasCol3 = (m: (typeof matches)[number], crop: string, ys: number[]) =>
      m.groups.some((g) => g.crop === crop && ys.every((y) => g.cells.some((c) => c.x === 3 && c.y === y)));
    expect(hasCol3(matches[1]!, 'corn', [3, 4, 5])).toBe(true);
    expect(s3.run.delivered.carrot).toBe(10);
    expect(s3.run.status).toBe('won');
    expect(s3.events.at(-1)).toEqual({ t: 'runEnded', result: 'won' });
    expect(s3.run.movesLeft).toBe(7);

    for (const [before, step] of [
      [r0, s1],
      [s1.run, s2],
      [s2.run, s3],
    ] as const)
      expect(replayEvents(before.board, step.events)).toEqual(step.run.board);
  });
});
