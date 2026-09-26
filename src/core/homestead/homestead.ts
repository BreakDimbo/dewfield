import { boardFromField, fieldFromBoard, parseBoard } from '@/core/board/ascii';
import type { BoardEvent, GrowItem } from '@/core/board/events';
import { legalizeBoard } from '@/core/board/generate';
import { W, isCrop, makeBoard, posOf, type Board, type Tile } from '@/core/board/model';
import { isOrderComplete, sumValues } from '@/core/commission/order';
import type { ActiveCommission } from '@/core/commission/types';
import { CLIENTS } from '@/core/config/clients';
import { COMMISSIONS, COMMISSION_BY_ID, T1_FIXTURE, type CommissionDef } from '@/core/config/commissions';
import { CROP_BY_ID, CROP_IDS, type CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { grown } from '@/core/growth/stage';
import { createRng, deriveSeed, nextInt, pickWeighted } from '@/core/rng/rng';
import { createRun } from '@/core/run/run';
import { emptySpecialCounts, type RunState } from '@/core/run/state';
import { tutorialGate, tutorialOnEvent } from '@/core/flow/gates';
import { carePointsMax, effectiveModifiers } from './decor';
import type { HomesteadState } from './state';

export function activeFrom(def: CommissionDef): ActiveCommission {
  return {
    id: def.id,
    clientId: def.clientId,
    tier: def.tier,
    items: def.items.map((i) => ({ ...i })),
    moves: def.moves,
    isTutorial: def.isTutorial,
    dayExempt: def.dayExempt,
    text: def.text,
    delivered: {},
    attempts: 0,
  };
}

/** 02 §5.6 procedural commissions once the hand-made list is exhausted. */
export function generateCommission(home: HomesteadState, n: number, cfg: Tunables): ActiveCommission {
  let rng = createRng(deriveSeed(home.seed, 'commission', n));
  const board = boardFromField(home.field.rows, home.field.uids);
  const nonSprout = (c: CropId) => board.cells.filter((t) => isCrop(t) && t.crop === c && t.stage > 0).length;
  const [two, r1] = nextInt(rng, 0, 2);
  rng = r1;
  const count = Math.min(cfg.commission.maxItems, two === 1 ? 2 : 1);
  const pool = [...CROP_IDS];
  const items: { crop: CropId; count: number }[] = [];
  for (let k = 0; k < count; k++) {
    const [ci, r2] = pickWeighted(rng, pool.map((c) => 1000 + 100 * nonSprout(c)));
    const [q, r3] = count === 1 ? nextInt(r2, 20, 27) : nextInt(r2, 12, 19);
    rng = r3;
    items.push({ crop: pool[ci]!, count: q });
    pool.splice(ci, 1);
  }
  const clientId = (['amai', 'meiyi', 'laotao', 'xiaotang'] as const)[n % 4]!;
  const tpl = CLIENTS[clientId].templates[count === 1 ? 0 : 1];
  const text = tpl
    .replace('{a}', CROP_BY_ID[items[0]!.crop].name)
    .replace('{n}', String(items[0]!.count))
    .replace('{b}', items[1] ? CROP_BY_ID[items[1].crop].name : '')
    .replace('{m}', items[1] ? String(items[1].count) : '');
  return {
    id: `P${String(n + 1).padStart(4, '0')}`,
    clientId,
    tier: 3,
    items,
    moves: cfg.commission.movesByTier[3],
    isTutorial: false,
    dayExempt: false,
    text,
    delivered: {},
    attempts: 0,
  };
}

export function activateNext(home: HomesteadState, cfg: Tunables): HomesteadState {
  const book = home.commissions;
  if (book.cursor < COMMISSIONS.length)
    return { ...home, commissions: { ...book, active: activeFrom(COMMISSIONS[book.cursor]!), cursor: book.cursor + 1 } };
  return {
    ...home,
    commissions: {
      ...book,
      active: generateCommission(home, book.generatedCount, cfg),
      generatedCount: book.generatedCount + 1,
    },
  };
}

/** 02 §6 new game: the field is the T1 fixture (uids 1..49). */
export function newHomestead(seed: number, cfg: Tunables): HomesteadState {
  const { board, nextUid } = parseBoard(T1_FIXTURE, 1);
  return {
    seed: seed >>> 0,
    day: 1,
    phase: 'morning',
    field: fieldFromBoard(board),
    care: { pointsLeft: cfg.care.pointsBase, wateredRows: [], beeUsed: false },
    wallet: { dewdrop: 0 },
    decor: { owned: [] },
    commissions: { cursor: 1, generatedCount: 0, active: activeFrom(COMMISSIONS[0]!), completed: [] },
    tutorial: { done: false, completedSteps: [], seenTips: [] },
    stats: {
      harvested: { carrot: 0, tomato: 0, corn: 0, eggplant: 0, blueberry: 0 },
      specialsCreated: emptySpecialCounts(),
      combos: 0,
      commissionsCompleted: 0,
      maxCascadeDepth: 0,
      playMs: 0,
    },
    runCounter: 0,
    uidCounter: nextUid,
  };
}

export const fieldBoard = (home: HomesteadState): Board => boardFromField(home.field.rows, home.field.uids);

/** 02 §6 / §1.9: copy the field, legalize, derive the run seed, bump runCounter. */
export function startRun(
  home: HomesteadState,
  cfg: Tunables,
): { home: HomesteadState; run: RunState; legalizeFixes: number } {
  const active = home.commissions.active;
  if (!active) throw new Error('startRun: no active commission');
  const runSeed = deriveSeed(home.seed, 'run', home.runCounter);
  const legal = legalizeBoard(fieldBoard(home), createRng(deriveSeed(runSeed, 'legalize')), cfg);
  const def = COMMISSION_BY_ID[active.id];
  const firstT1 = active.id === 'T1' && active.attempts === 0 && sumValues(active.delivered) === 0;
  const run = createRun(
    {
      commission: active,
      board: legal.board,
      seed: runSeed,
      uidCounter: home.uidCounter,
      modifiers: { extraMoves: effectiveModifiers(home).extraMoves, rushBonus: effectiveModifiers(home).rushBonus },
      spawnQueue: firstT1 && def?.spawnQueue ? def.spawnQueue.split(/\s+/) : [],
    },
    cfg,
  );
  const next = tutorialOnEvent({ ...home, runCounter: home.runCounter + 1 }, { t: 'runStarted', id: active.id }, cfg.tutorial.autoCompleteAfterFails);
  return { home: next, run, legalizeFixes: legal.fixes };
}

/** 02 §5.4 */
export function computeStars(run: RunState, cfg: Tunables): 1 | 2 | 3 {
  if (run.commission.attempts > 0) return 1;
  const ratio = (run.movesLeftAtWin ?? run.movesLeft) / run.movesTotal;
  if (ratio >= cfg.stars.thresholds[1]) return 3;
  if (ratio >= cfg.stars.thresholds[0]) return 2;
  return 1;
}

export interface Settlement {
  result: 'won' | 'lost' | 'abandoned';
  items: { crop: CropId; delivered: number; count: number }[];
  surplus: Partial<Record<CropId, number>>;
  surplusValue: number;
  unripeDewdrops: number;
  baseReward: number;
  starBonus: number;
  tutorialBonus: number;
  total: number;
  stars: 1 | 2 | 3 | null;
  /** Tutorial commission auto-completed after repeated failures (02 §11.1 G2). */
  autoCompleted: boolean;
}

/** 02 §5.2–5.3: write the final board back to the field, pay out, advance the commission book. */
export function settleRun(
  home: HomesteadState,
  run: RunState,
  cfg: Tunables,
  abandoned = false,
): { home: HomesteadState; settlement: Settlement } {
  const won = !abandoned && isOrderComplete(run.commission.items, run.delivered);
  const surplusCount = sumValues(run.surplus);
  const surplusValue = surplusCount * cfg.economy.surplusPrice;
  const stars = won ? computeStars(run, cfg) : null;
  const tutorialBonus = won && run.commission.isTutorial ? (run.movesLeftAtWin ?? run.movesLeft) * cfg.economy.tutorialMoveBonus : 0;
  const baseReward = won ? cfg.economy.baseReward[run.commission.tier] : 0;
  const starBonus = won && !run.commission.isTutorial ? cfg.economy.starBonus * ((stars ?? 1) - 1) : 0;
  const total = run.dewdropsEarned + surplusValue + baseReward + starBonus + tutorialBonus;

  const harvested = { ...home.stats.harvested };
  for (const it of run.commission.items) harvested[it.crop] += (run.delivered[it.crop] ?? 0) - (run.commission.delivered[it.crop] ?? 0);
  for (const c of CROP_IDS) harvested[c] += run.surplus[c] ?? 0;
  const specialsCreated = { ...home.stats.specialsCreated };
  for (const k of Object.keys(specialsCreated) as (keyof typeof specialsCreated)[]) specialsCreated[k] += run.stats.specialsCreated[k];

  let next: HomesteadState = {
    ...home,
    field: fieldFromBoard(run.board),
    uidCounter: run.uidCounter,
    wallet: { dewdrop: home.wallet.dewdrop + total },
    stats: {
      ...home.stats,
      harvested,
      specialsCreated,
      combos: home.stats.combos + run.stats.combos,
      maxCascadeDepth: Math.max(home.stats.maxCascadeDepth, run.stats.maxCascadeDepth),
      commissionsCompleted: home.stats.commissionsCompleted + (won ? 1 : 0),
    },
  };
  const active = run.commission;
  const attemptsAfter = active.attempts + 1;
  const autoComplete = !won && active.id === 'T2' && attemptsAfter >= cfg.tutorial.autoCompleteAfterFails;
  if (won || autoComplete) {
    const completed = [
      ...next.commissions.completed,
      { id: active.id, day: home.day, stars: stars ?? 1, attempts: attemptsAfter },
    ].slice(-100);
    next = { ...next, commissions: { ...next.commissions, active: null, completed } };
    next = active.dayExempt ? activateNext(next, cfg) : { ...next, phase: 'dusk' };
    next = tutorialOnEvent(next, won ? { t: 'runWon', id: active.id } : { t: 'runLost', id: active.id, attempts: attemptsAfter }, cfg.tutorial.autoCompleteAfterFails);
  } else {
    const delivered: Partial<Record<CropId, number>> = {};
    for (const it of active.items) delivered[it.crop] = Math.min(it.count, run.delivered[it.crop] ?? 0);
    next = {
      ...next,
      commissions: { ...next.commissions, active: { ...active, delivered, attempts: attemptsAfter } },
    };
    next = tutorialOnEvent(next, { t: 'runLost', id: active.id, attempts: attemptsAfter }, cfg.tutorial.autoCompleteAfterFails);
  }
  return {
    home: next,
    settlement: {
      result: won ? 'won' : abandoned ? 'abandoned' : 'lost',
      items: active.items.map((it) => ({ crop: it.crop, count: it.count, delivered: Math.min(it.count, run.delivered[it.crop] ?? 0) })),
      surplus: { ...run.surplus },
      surplusValue,
      unripeDewdrops: run.dewdropsEarned,
      baseReward,
      starBonus,
      tutorialBonus,
      total,
      stars: active.isTutorial ? null : stars,
      autoCompleted: autoComplete,
    },
  };
}

function growCells(board: Board, cells: readonly number[], by: number): { board: Board; items: GrowItem[] } {
  const next: Tile[] = board.cells.slice();
  const items: GrowItem[] = [];
  for (const i of cells) {
    const t = next[i]!;
    if (!isCrop(t) || t.stage >= 2) continue;
    const to = grown(t.stage, by);
    next[i] = { ...t, stage: to };
    items.push({ pos: posOf(i), uid: t.uid, from: t.stage, to });
  }
  return { board: makeBoard(next), items };
}

export type CareReject = 'noPoints' | 'rowWatered' | 'badTarget';

/** 02 §8 water a row. */
export function careWaterRow(
  home: HomesteadState,
  y: number,
  cfg: Tunables,
): { ok: true; home: HomesteadState; events: BoardEvent[]; allRipe: boolean } | { ok: false; reason: CareReject } {
  if (!Number.isInteger(y) || y < 0 || y >= 7) return { ok: false, reason: 'badTarget' };
  if (home.care.pointsLeft <= 0) return { ok: false, reason: 'noPoints' };
  if (cfg.care.waterOncePerRowPerDay && home.care.wateredRows.includes(y)) return { ok: false, reason: 'rowWatered' };
  const row = Array.from({ length: W }, (_, x) => y * W + x);
  const { board, items } = growCells(fieldBoard(home), row, 1);
  return {
    ok: true,
    allRipe: items.length === 0,
    events: items.length ? [{ t: 'grow', items, cause: 'water' }] : [],
    home: tutorialOnEvent(
      {
        ...home,
        field: fieldFromBoard(board),
        care: { ...home.care, pointsLeft: home.care.pointsLeft - 1, wateredRows: [...home.care.wateredRows, y].sort() },
      },
      { t: 'watered' },
      cfg.tutorial.autoCompleteAfterFails,
    ),
  };
}

/** 02 §7 sleep: whole field grows, care refills, next day. Refused while a tutorial gate forbids it. */
export function sleep(
  home: HomesteadState,
  cfg: Tunables,
): { ok: true; home: HomesteadState; events: BoardEvent[] } | { ok: false; reason: 'gate' } {
  if (!tutorialGate(home).allow.includes('sleep')) return { ok: false, reason: 'gate' };
  const all = Array.from({ length: 49 }, (_, i) => i);
  const { board, items } = growCells(fieldBoard(home), all, cfg.overnight.growth);
  let next: HomesteadState = {
    ...home,
    field: fieldFromBoard(board),
    care: { pointsLeft: carePointsMax(home, cfg), wateredRows: [], beeUsed: false },
    day: home.day + 1,
    phase: 'morning',
  };
  if (!next.commissions.active) next = activateNext(next, cfg);
  next = tutorialOnEvent(next, { t: 'slept' }, cfg.tutorial.autoCompleteAfterFails);
  return { ok: true, home: next, events: items.length ? [{ t: 'grow', items, cause: 'overnight' }] : [] };
}

/** 02 §11.4: the row with the most non-ripe tiles of `crop`; ties → larger y. */
export function pickWaterRowHint(field: Board, crop: CropId): number {
  let best = 6;
  let bestN = -1;
  for (let y = 0; y < 7; y++) {
    let n = 0;
    for (let x = 0; x < W; x++) {
      const t = field.cells[y * W + x]!;
      if (isCrop(t) && t.crop === crop && t.stage < 2) n++;
    }
    if (n >= bestN) {
      best = y;
      bestN = n;
    }
  }
  return best;
}
