import type { Tunables } from '@/core/config/tunables';
import type { RunState } from '@/core/run/state';
import { idx, type Move } from './model';
import { findValidMoves } from './moves';
import { previewMove, type PreviewResult } from './preview';

/** 02 §4.3 score of one legal swap, from its exact first-segment preview. */
export function hintScore(p: PreviewResult): number {
  if (!p.valid) return -1;
  const created = (k: string) => (p.created.some((c) => c.kind === k) ? 1 : 0);
  const sickle = p.created.some((c) => c.kind === 'sickleH' || c.kind === 'sickleV') ? 1 : 0;
  const delivered = p.harvest.filter((h) => h.delivered).length;
  return (
    100 * created('bee') +
    60 * created('dewOrb') +
    40 * sickle +
    30 * (p.kind === 'combo' ? 1 : 0) +
    10 * delivered +
    3 * p.growth.length +
    p.harvest.length
  );
}

/** Both directions of every legal pair, in (a.index, b.index) order. */
export function directedMoves(run: RunState): Move[] {
  return findValidMoves(run.board.cells)
    .flatMap((m) => [m, { a: m.b, b: m.a }])
    .sort((p, q) => idx(p.a) - idx(q.a) || idx(p.b) - idx(q.b));
}

/** 02 §4.3: highest score; ties → smaller a.index, then smaller b.index. */
export function pickHint(run: RunState, cfg: Tunables): { move: Move; score: number; preview: PreviewResult } | null {
  let best: { move: Move; score: number; preview: PreviewResult } | null = null;
  for (const move of directedMoves(run)) {
    const preview = previewMove(run, move, cfg);
    const score = hintScore(preview);
    if (!best || score > best.score) best = { move, score, preview };
  }
  return best;
}
