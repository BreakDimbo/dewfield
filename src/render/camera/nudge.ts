import { hump } from '@/render/choreo/easing';

/**
 * P2-13: a transient pull-back layered on top of the current pose (terrace level-up showcase).
 * Callers request one; CameraRig stamps it with its own clock. It never blocks input.
 */
export const cameraNudge: { pending: number; start: number; amount: number; dur: number } = { pending: 0, start: -Infinity, amount: 0, dur: 1.4 };

export function nudgeCamera(amount: number, dur = 1.4): void {
  cameraNudge.pending = amount;
  cameraNudge.dur = dur;
}

/** Distance to pull back `elapsed` seconds into a nudge: quick lift-off, slow settle back to 0. */
export function nudgeDistance(elapsed: number, amount: number, dur: number): number {
  if (elapsed <= 0 || elapsed >= dur) return 0;
  const u = elapsed / dur;
  return amount * hump(u < 0.35 ? u / 0.7 : 0.5 + (u - 0.35) / 1.3);
}
