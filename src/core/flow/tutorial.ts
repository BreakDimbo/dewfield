import { samePos, type Move, type Pos } from '@/core/board/model';
import { COMMISSION_BY_ID } from '@/core/config/commissions';
import type { RunState } from '@/core/run/state';

/** 02 §11.1 G0: the guided move the run is currently locked to, or null when input is free. */
export function guidedMove(run: RunState): Move | null {
  const guided = COMMISSION_BY_ID[run.commission.id]?.guidedMoves;
  if (!guided || run.commission.attempts > 0 || run.moveIndex >= guided.length) return null;
  const g = guided[run.moveIndex]!;
  return { a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } };
}

export type GuideVerdict = { t: 'free' } | { t: 'accept'; move: Move } | { t: 'ignore' };

/**
 * 04 P1-23 #2: during a guided step only the highlighted pair is accepted; everything else is ignored
 * (not an illegal swap). Tapping or dragging the pair in reverse is normalised to the scripted a → b,
 * because b decides where the special is created (02 §1.5).
 */
export function filterGuided(run: RunState, move: Move): GuideVerdict {
  const g = guidedMove(run);
  if (!g) return { t: 'free' };
  const same = samePos(move.a, g.a) && samePos(move.b, g.b);
  const reversed = samePos(move.a, g.b) && samePos(move.b, g.a);
  return same || reversed ? { t: 'accept', move: g } : { t: 'ignore' };
}

/** A cell may be selected during a guided step only if it belongs to the highlighted pair. */
export function guidedSelectable(run: RunState, p: Pos): boolean {
  const g = guidedMove(run);
  return !g || samePos(p, g.a) || samePos(p, g.b);
}
