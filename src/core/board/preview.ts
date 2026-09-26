import type { CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { ledgerOf } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import type { GrowItem, Yield } from './events';
import { isAdjacent, posOf, type Move, type Pos, type SpecialKind } from './model';
import { classifySwap, type SwapKind } from './moves';
import { resolveFirstSegment } from './resolve';

export interface PreviewResult {
  valid: boolean;
  reason?: 'notAdjacent' | 'noMatch';
  kind?: SwapKind;
  harvest: { pos: Pos; uid: number; yield: Yield; crop: CropId | null; delivered: boolean }[];
  growth: (GrowItem & { cause: 'neighbor' | 'dewRing' })[];
  created: { pos: Pos; kind: SpecialKind }[];
  triggered: { pos: Pos; kind: SpecialKind; area: Pos[] }[];
  pollinated: Pos[];
  delta: { delivered: Partial<Record<CropId, number>>; surplus: Partial<Record<CropId, number>>; dewdrop: number };
}

const EMPTY = (reason: 'notAdjacent' | 'noMatch'): PreviewResult => ({
  valid: false,
  reason,
  harvest: [],
  growth: [],
  created: [],
  triggered: [],
  pollinated: [],
  delta: { delivered: {}, surplus: {}, dewdrop: 0 },
});

function diff(after: Partial<Record<CropId, number>>, before: Partial<Record<CropId, number>>) {
  const out: Partial<Record<CropId, number>> = {};
  for (const k of Object.keys(after) as CropId[]) {
    const d = (after[k] ?? 0) - (before[k] ?? 0);
    if (d > 0) out[k] = d;
  }
  return out;
}

/**
 * 02 §4.1. First segment only (step 0 if the move has one, otherwise step 1), up to gravity.
 * Pure: never advances RNG or mutates the run.
 */
export function previewMove(run: RunState, move: Move, cfg: Tunables): PreviewResult {
  if (!isAdjacent(move.a, move.b)) return EMPTY('notAdjacent');
  const kind = classifySwap(run.board.cells, move);
  if (!kind) return EMPTY('noMatch');
  const before = ledgerOf(run);
  const { segment, ledger } = resolveFirstSegment(
    { board: run.board, rng: run.rng, uidCounter: run.uidCounter, spawnQueue: run.spawnQueue, ledger: before },
    move,
    cfg,
  );
  return {
    valid: true,
    kind,
    harvest: segment.harvest.map((h) => ({ pos: h.pos, uid: h.uid, yield: h.yield, crop: h.crop, delivered: h.delivered })),
    growth: segment.growth,
    created: segment.created.map((c) => ({ pos: posOf(c.i), kind: c.kind })),
    triggered: segment.triggered.map((t) => ({ pos: posOf(t.i), kind: t.kind, area: t.area.map(posOf) })),
    pollinated: segment.pollinated.map(posOf),
    delta: {
      delivered: diff(ledger.delivered, before.delivered),
      surplus: diff(ledger.surplus, before.surplus),
      dewdrop: ledger.dewdrops - before.dewdrops,
    },
  };
}
