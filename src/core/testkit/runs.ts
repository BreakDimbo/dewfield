import { parseBoard } from '@/core/board/ascii';
import type { Move } from '@/core/board/model';
import type { ActiveCommission, OrderItem } from '@/core/commission/types';
import { COMMISSION_BY_ID, type CommissionDef } from '@/core/config/commissions';
import { createRun } from '@/core/run/run';
import type { RunState } from '@/core/run/state';
import type { Tunables } from '@/core/config/tunables';

export function activeFrom(def: CommissionDef, delivered: ActiveCommission['delivered'] = {}): ActiveCommission {
  return {
    id: def.id,
    clientId: def.clientId,
    tier: def.tier,
    items: def.items.map((i) => ({ ...i })),
    moves: def.moves,
    isTutorial: def.isTutorial,
    dayExempt: def.dayExempt,
    text: def.text,
    delivered,
    attempts: 0,
  };
}

export function sandboxCommission(items: OrderItem[], moves = 20): ActiveCommission {
  return {
    id: 'SANDBOX',
    clientId: 'amai',
    tier: 1,
    items,
    moves,
    isTutorial: false,
    dayExempt: false,
    text: '',
    delivered: {},
    attempts: 0,
  };
}

export function runFromAscii(
  ascii: string,
  cfg: Tunables,
  opts: { items?: OrderItem[]; moves?: number; queue?: string; seed?: number } = {},
): RunState {
  const { board, nextUid } = parseBoard(ascii);
  return createRun(
    {
      commission: sandboxCommission(opts.items ?? [{ crop: 'carrot', count: 99 }], opts.moves ?? 20),
      board,
      seed: opts.seed ?? 1,
      uidCounter: nextUid,
      spawnQueue: opts.queue ? opts.queue.split(/\s+/).filter(Boolean) : [],
    },
    cfg,
  );
}

export function t1Run(cfg: Tunables, seed = 1): RunState {
  const def = COMMISSION_BY_ID.T1!;
  const { board, nextUid } = parseBoard(def.fixture!);
  return createRun(
    { commission: activeFrom(def), board, seed, uidCounter: nextUid, spawnQueue: def.spawnQueue!.split(' ') },
    cfg,
  );
}

export const mv = (ax: number, ay: number, bx: number, by: number): Move => ({ a: { x: ax, y: ay }, b: { x: bx, y: by } });
