import type { CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { nextInt, type RngState } from '@/core/rng/rng';
import { invariant } from '@/core/util/invariant';
import { applyStepGrowth } from '@/core/growth/ripen';
import { yieldOf } from '@/core/growth/stage';
import { planBeeSwap, planCombo, type Step0Plan } from './combos';
import type { BoardEvent, GrowItem, HarvestItem } from './events';
import { applyGravity } from './gravity';
import { creationIndex, findGroups, specialForGroup, type MatchGroup } from './match';
import { N, idx, isCrop, isSpecial, makeBoard, posOf, type Board, type Move, type Pos, type SpecialKind, type Tile } from './model';
import { classifyIdx, countValidMoves } from './moves';
import { refill } from './refill';
import { closeChain, kindOf, type Activation, type Grid } from './specials';
import { shuffleBoard } from './generate';

/** Mutable order bookkeeping threaded through a move (02 §5.2). */
export interface Ledger {
  remaining: Partial<Record<CropId, number>>;
  delivered: Partial<Record<CropId, number>>;
  surplus: Partial<Record<CropId, number>>;
  dewdrops: number;
}

export interface ResolveInput {
  board: Board;
  rng: RngState;
  uidCounter: number;
  spawnQueue: readonly string[];
  ledger: Ledger;
}

export interface MoveStats {
  depth: number;
  created: SpecialKind[];
  combo: boolean;
  harvested: number;
  ripe: number;
  unripe: number;
  sprout: number;
}

export interface ResolveOutput {
  board: Board;
  rng: RngState;
  uidCounter: number;
  spawnQueue: string[];
  events: BoardEvent[];
  ledger: Ledger;
  stats: MoveStats;
}

/** First segment before gravity: what the preview must reproduce exactly (02 §4.1). */
export interface Segment {
  triggered: Activation[];
  pollinated: number[];
  harvest: HarvestItem[];
  created: { i: number; kind: SpecialKind; crop: CropId | null }[];
  growth: (GrowItem & { cause: 'neighbor' | 'dewRing' })[];
}

interface Work {
  g: Grid;
  rng: RngState;
  uid: number;
  queue: string[];
  events: BoardEvent[];
  ledger: Ledger;
  cfg: Tunables;
  stats: MoveStats;
}

interface StepPlan {
  inH: boolean[];
  triggers: number[];
  activated: number[];
  pre: Activation[];
  via: 'match' | 'chain' | 'combo' | 'rush';
  baseLevel: number;
  ring: boolean[];
  pollinated: boolean[];
  groups: MatchGroup[];
  creations: { i: number; kind: SpecialKind; crop: CropId }[];
}

const toPos = (cells: readonly number[]): Pos[] => cells.map(posOf);

export function cloneLedger(l: Ledger): Ledger {
  return { remaining: { ...l.remaining }, delivered: { ...l.delivered }, surplus: { ...l.surplus }, dewdrops: l.dewdrops };
}

function harvestCell(w: Work, i: number, pollinated: boolean): HarvestItem {
  const t = w.g[i]!;
  if (!isCrop(t)) return { pos: posOf(i), uid: t.uid, crop: null, stage: null, yield: 'none', delivered: false };
  const stage = pollinated ? 2 : t.stage;
  const y = yieldOf(stage);
  let delivered = false;
  w.stats.harvested++;
  if (y === 'crop') {
    w.stats.ripe++;
    const need = w.ledger.remaining[t.crop] ?? 0;
    if (need > 0) {
      w.ledger.remaining[t.crop] = need - 1;
      w.ledger.delivered[t.crop] = (w.ledger.delivered[t.crop] ?? 0) + 1;
      delivered = true;
    } else w.ledger.surplus[t.crop] = (w.ledger.surplus[t.crop] ?? 0) + 1;
  } else if (y === 'dewdrop') {
    w.stats.unripe++;
    w.ledger.dewdrops += w.cfg.economy.unripeDewdrop;
  } else w.stats.sprout++;
  return { pos: posOf(i), uid: t.uid, crop: t.crop, stage, yield: y, delivered };
}

/** Shared pipeline for step 0 and cascade steps: chain → yields → remove → create → grow [→ gravity → refill]. */
function runStep(w: Work, plan: StepPlan, stopBeforeGravity: boolean): Segment {
  const chain = closeChain(w.g, plan.inH, plan.triggers, {
    via: plan.via,
    baseLevel: plan.baseLevel,
    activated: plan.activated,
    ring: plan.ring,
    pollinated: plan.pollinated,
  });
  const triggered = [...plan.pre, ...chain.activations];
  for (const a of triggered)
    w.events.push({
      t: 'specialTriggered',
      pos: posOf(a.i),
      uid: a.uid,
      kind: a.kind,
      via: a.via,
      area: toPos(a.area),
      level: a.level,
    });
  const pollinated: number[] = [];
  for (let i = 0; i < N; i++) if (chain.pollinated[i]) pollinated.push(i);
  if (pollinated.length > 0) w.events.push({ t: 'pollinate', cells: toPos(pollinated) });

  const harvest: HarvestItem[] = [];
  for (let i = 0; i < N; i++) if (plan.inH[i]) harvest.push(harvestCell(w, i, chain.pollinated[i]!));
  w.events.push({ t: 'harvest', items: harvest });
  for (let i = 0; i < N; i++) if (plan.inH[i]) w.g[i] = null;

  const created: Segment['created'] = [];
  for (const c of plan.creations) {
    const tile: Tile =
      c.kind === 'bee'
        ? { uid: w.uid++, kind: 'bee' }
        : { uid: w.uid++, kind: 'crop', crop: c.crop, stage: w.cfg.growth.createdSpecialStage, special: c.kind };
    w.g[c.i] = tile;
    w.stats.created.push(c.kind);
    created.push({ i: c.i, kind: c.kind, crop: c.kind === 'bee' ? null : c.crop });
    w.events.push({
      t: 'specialCreated',
      pos: posOf(c.i),
      uid: tile.uid,
      kind: c.kind,
      crop: tile.kind === 'crop' ? tile.crop : null,
      stage: tile.kind === 'crop' ? tile.stage : null,
    });
  }

  const groupCells = plan.groups.flatMap((g) => g.cells);
  const growth = applyStepGrowth(w.g, groupCells, chain.ring, plan.inH, plan.creations.map((c) => c.i), w.cfg);
  if (growth.dewRing.length > 0) w.events.push({ t: 'grow', items: growth.dewRing, cause: 'dewRing' });
  if (growth.neighbor.length > 0) w.events.push({ t: 'grow', items: growth.neighbor, cause: 'neighbor' });
  const segment: Segment = {
    triggered,
    pollinated,
    harvest,
    created,
    growth: [
      ...growth.dewRing.map((g) => ({ ...g, cause: 'dewRing' as const })),
      ...growth.neighbor.map((g) => ({ ...g, cause: 'neighbor' as const })),
    ],
  };
  if (stopBeforeGravity) return segment;

  const fall = applyGravity(w.g);
  if (fall.items.length > 0) w.events.push(fall);
  const ctx = {
    rng: w.rng,
    uid: w.uid,
    queue: w.queue,
    needs: (c: CropId) => (w.ledger.remaining[c] ?? 0) > 0,
  };
  const spawn = refill(w.g, ctx, w.cfg);
  w.rng = ctx.rng;
  w.uid = ctx.uid;
  if (spawn.items.length > 0) w.events.push(spawn);
  return segment;
}

function matchPlan(w: Work, groups: MatchGroup[], swap: { a: number; b: number } | null): StepPlan {
  const inH = new Array<boolean>(N).fill(false);
  for (const g of groups) for (const c of g.cells) inH[c] = true;
  const creations: StepPlan['creations'] = [];
  for (const g of groups) {
    const kind = specialForGroup(g, w.cfg);
    const i = creationIndex(g, swap);
    if (kind && i !== null) creations.push({ i, kind, crop: g.crop });
  }
  const triggers: number[] = [];
  for (let i = 0; i < N; i++) if (inH[i] && isSpecial(w.g[i])) triggers.push(i);
  return {
    inH,
    triggers,
    activated: [],
    pre: [],
    via: 'match',
    baseLevel: 0,
    ring: new Array<boolean>(N).fill(false),
    pollinated: new Array<boolean>(N).fill(false),
    groups,
    creations,
  };
}

function step0Plan(p: Step0Plan): StepPlan {
  return {
    inH: p.inH,
    triggers: p.triggers,
    activated: p.activated,
    pre: p.pre,
    via: p.via === 'combo' ? 'combo' : 'chain',
    baseLevel: 1,
    ring: p.ring,
    pollinated: p.pollinated,
    groups: [],
    creations: [],
  };
}

function newWork(input: ResolveInput, cfg: Tunables, cells: Grid): Work {
  return {
    g: cells,
    rng: input.rng,
    uid: input.uidCounter,
    queue: input.spawnQueue.slice(),
    events: [],
    ledger: cloneLedger(input.ledger),
    cfg,
    stats: { depth: 0, created: [], combo: false, harvested: 0, ripe: 0, unripe: 0, sprout: 0 },
  };
}

/** Swap + step 0 (if any) + first cascade step, stopping at the first gravity. Shared by apply and preview. */
function firstSegment(w: Work, a: number, b: number, previewOnly: boolean): { segment: Segment; hadStep0: boolean } {
  const kind = classifyIdx(w.g, a, b);
  invariant(kind, 'firstSegment: illegal move');
  const ta = w.g[a]!;
  const tb = w.g[b]!;
  w.g[a] = tb;
  w.g[b] = ta;
  w.events.push({ t: 'swap', a: posOf(a), b: posOf(b), uidA: ta.uid, uidB: tb.uid });
  if (kind !== 'match') {
    const p = kind === 'combo' ? planCombo(w.g, a, b) : planBeeSwap(w.g, a, b);
    w.stats.combo = p.isCombo;
    if (p.convert) w.events.push(p.convert);
    return { segment: runStep(w, step0Plan(p), previewOnly), hadStep0: true };
  }
  const groups = findGroups(w.g);
  w.stats.depth = 1;
  w.events.push({ t: 'cascadeStep', depth: 1 });
  w.events.push({ t: 'match', groups: groups.map((g) => ({ crop: g.crop, cells: toPos(g.cells), shape: g.shape })) });
  return { segment: runStep(w, matchPlan(w, groups, { a, b }), previewOnly), hadStep0: false };
}

/** Cascade until quiet, then shuffle if stuck (02 §1.6 steps 4–5). */
function settle(w: Work) {
  for (;;) {
    const groups = findGroups(w.g);
    if (groups.length === 0) break;
    w.stats.depth += 1;
    w.events.push({ t: 'cascadeStep', depth: w.stats.depth });
    w.events.push({ t: 'match', groups: groups.map((g) => ({ crop: g.crop, cells: toPos(g.cells), shape: g.shape })) });
    runStep(w, matchPlan(w, groups, null), false);
  }
  if (countValidMoves(w.g) === 0) {
    const sh = shuffleBoard(makeBoard(w.g as Tile[]), w.rng, w.cfg);
    w.g = sh.board.cells.slice();
    w.rng = sh.rng;
    w.events.push(...sh.events);
  }
}

function output(w: Work): ResolveOutput {
  return {
    board: makeBoard(w.g as Tile[]),
    rng: w.rng,
    uidCounter: w.uid,
    spawnQueue: w.queue,
    events: w.events,
    ledger: w.ledger,
    stats: w.stats,
  };
}

/** Full resolution of a legal move. Caller must have validated legality. */
export function resolveMove(input: ResolveInput, move: Move, cfg: Tunables): ResolveOutput {
  const w = newWork(input, cfg, input.board.cells.slice());
  firstSegment(w, idx(move.a), idx(move.b), false);
  settle(w);
  return output(w);
}

/** Pre-gravity first segment only; never touches RNG (02 §4.1). */
export function resolveFirstSegment(input: ResolveInput, move: Move, cfg: Tunables): { segment: Segment; ledger: Ledger } {
  const w = newWork(input, cfg, input.board.cells.slice());
  const { segment } = firstSegment(w, idx(move.a), idx(move.b), true);
  return { segment, ledger: w.ledger };
}

/** Resolve an already-disturbed grid (holes/specials to fire) — used by harvest rush and tests. */
export function settleGrid(input: ResolveInput, cfg: Tunables): ResolveOutput {
  const w = newWork(input, cfg, input.board.cells.slice());
  settle(w);
  return output(w);
}

/**
 * 02 §5.5 harvest rush on a won board: convert up to `conversions` plain crops into alternating sickles,
 * then detonate specials one at a time (index order, as "affected") with full cascades between rounds.
 * Every yield goes to surplus / dewdrops because the order is already complete.
 */
export function resolveRush(input: ResolveInput, conversions: number, cfg: Tunables): ResolveOutput & { conversions: number } {
  const w = newWork(input, cfg, input.board.cells.slice());
  w.ledger.remaining = {};
  const items: { pos: Pos; uid: number; kind: 'sickleH' | 'sickleV' }[] = [];
  for (let i = 0; i < conversions; i++) {
    const cands: number[] = [];
    for (let c = 0; c < N; c++) {
      const t = w.g[c];
      if (isCrop(t) && t.special === null) cands.push(c);
    }
    if (cands.length === 0) break;
    const [k, r] = nextInt(w.rng, 0, cands.length);
    w.rng = r;
    const c = cands[k]!;
    const t = w.g[c] as Tile & { kind: 'crop' };
    const kind = i % 2 === 0 ? 'sickleH' : 'sickleV';
    w.g[c] = { ...t, special: kind };
    items.push({ pos: posOf(c), uid: t.uid, kind });
  }
  w.events.push({ t: 'rushStart', conversions: items.length });
  if (items.length) w.events.push({ t: 'convert', items: items.slice().sort((p, q) => idx(p.pos) - idx(q.pos)), cause: 'rush' });
  for (let round = 0; round < cfg.rush.maxIterations; round++) {
    let first = -1;
    for (let c = 0; c < N && first < 0; c++) if (isSpecial(w.g[c])) first = c;
    if (first < 0) break;
    const inH = new Array<boolean>(N).fill(false);
    inH[first] = true;
    w.stats.depth = 0;
    runStep(
      w,
      {
        inH,
        triggers: [first],
        activated: [],
        pre: [],
        via: 'rush',
        baseLevel: 0,
        ring: new Array<boolean>(N).fill(false),
        pollinated: new Array<boolean>(N).fill(false),
        groups: [],
        creations: [],
      },
      false,
    );
    settle(w);
  }
  settle(w);
  w.events.push({ t: 'rushEnd' });
  return { ...output(w), conversions: items.length };
}

export { kindOf };
