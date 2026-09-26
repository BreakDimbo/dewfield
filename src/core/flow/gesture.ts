import { isAdjacent, samePos, type Pos } from '@/core/board/model';

/** 03 §7.3 — pure gesture reducer over abstract pointer input. */
export interface Px {
  x: number;
  y: number;
}

export type GestureState =
  | { t: 'idle' }
  | { t: 'pressing'; a: Pos; p0: Px }
  | { t: 'dragging'; a: Pos; b: Pos | null; p0: Px }
  | { t: 'selected'; a: Pos; hover: Pos | null };

export type GestureInput =
  | { t: 'down'; cell: Pos | null; px: Px }
  | { t: 'move'; cell: Pos | null; px: Px }
  | { t: 'up'; cell: Pos | null; px: Px }
  | { t: 'cancel' };

export type Intent =
  | { t: 'select'; a: Pos }
  | { t: 'preview'; a: Pos; b: Pos }
  | { t: 'clearPreview' }
  | { t: 'commit'; a: Pos; b: Pos }
  | { t: 'deselect' };

export interface GestureCfg {
  /** Screen-space drag threshold already resolved to min(dragThresholdPx, dragThresholdCell × cellPx). */
  thresholdPx: number;
  width: number;
  height: number;
}

export const IDLE: GestureState = { t: 'idle' };

/** Neighbour of a along the dominant axis of the drag; null if it would leave the board. */
export function dragTarget(a: Pos, p0: Px, p: Px, cfg: GestureCfg): Pos | null {
  const dx = p.x - p0.x;
  const dy = p.y - p0.y;
  const b = Math.abs(dx) >= Math.abs(dy) ? { x: a.x + Math.sign(dx), y: a.y } : { x: a.x, y: a.y + Math.sign(dy) };
  return b.x >= 0 && b.x < cfg.width && b.y >= 0 && b.y < cfg.height ? b : null;
}

const dist = (p: Px, q: Px) => Math.hypot(p.x - q.x, p.y - q.y);
const eq = (p: Pos | null, q: Pos | null) => (p === null || q === null ? p === q : samePos(p, q));

export function gestureReduce(
  s: GestureState,
  input: GestureInput,
  cfg: GestureCfg,
): { state: GestureState; intents: Intent[] } {
  if (input.t === 'cancel') return { state: IDLE, intents: s.t === 'idle' ? [] : [{ t: 'clearPreview' }] };
  switch (s.t) {
    case 'idle':
      if (input.t === 'down' && input.cell) return { state: { t: 'pressing', a: input.cell, p0: input.px }, intents: [] };
      return { state: s, intents: [] };

    case 'pressing':
      if (input.t === 'move' && dist(input.px, s.p0) >= cfg.thresholdPx) {
        const b = dragTarget(s.a, s.p0, input.px, cfg);
        return { state: { t: 'dragging', a: s.a, b, p0: s.p0 }, intents: b ? [{ t: 'preview', a: s.a, b }] : [] };
      }
      if (input.t === 'up') return { state: { t: 'selected', a: s.a, hover: null }, intents: [{ t: 'select', a: s.a }] };
      return { state: s, intents: [] };

    case 'dragging':
      if (input.t === 'move') {
        if (dist(input.px, s.p0) < cfg.thresholdPx)
          return { state: { t: 'pressing', a: s.a, p0: s.p0 }, intents: [{ t: 'clearPreview' }] };
        const b = dragTarget(s.a, s.p0, input.px, cfg);
        if (eq(b, s.b)) return { state: s, intents: [] };
        return { state: { ...s, b }, intents: [b ? { t: 'preview', a: s.a, b } : { t: 'clearPreview' }] };
      }
      if (input.t === 'up')
        return { state: IDLE, intents: s.b ? [{ t: 'commit', a: s.a, b: s.b }] : [{ t: 'clearPreview' }] };
      return { state: s, intents: [] };

    case 'selected': {
      const c = input.cell;
      if (input.t === 'move') {
        const hover = c && isAdjacent(s.a, c) ? c : null;
        if (eq(hover, s.hover)) return { state: s, intents: [] };
        return {
          state: { ...s, hover },
          intents: [hover ? { t: 'preview', a: s.a, b: hover } : { t: 'clearPreview' }],
        };
      }
      if (input.t === 'down') {
        if (!c) return { state: IDLE, intents: [{ t: 'deselect' }] };
        if (samePos(c, s.a)) return { state: IDLE, intents: [{ t: 'deselect' }] };
        if (isAdjacent(s.a, c)) return { state: IDLE, intents: [{ t: 'commit', a: s.a, b: c }] };
        return { state: { t: 'pressing', a: c, p0: input.px }, intents: [{ t: 'select', a: c }] };
      }
      return { state: s, intents: [] };
    }
  }
}
