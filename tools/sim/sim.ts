import { fieldFromBoard } from '../../src/core/board/ascii';
import { generateBoard } from '../../src/core/board/generate';
import { COMMISSION_BY_ID } from '../../src/core/config/commissions';
import { DECOR, DECOR_BY_ID } from '../../src/core/config/decor';
import type { Tunables } from '../../src/core/config/tunables';
import { purchaseDecor, terraceLevel } from '../../src/core/homestead/decor';
import { currentGate, tutorialGate } from '../../src/core/flow/gates';
import { activeFrom, careWaterRow, fieldBoard, newHomestead, pickWaterRowHint, settleRun, sleep, startRun } from '../../src/core/homestead/homestead';
import type { HomesteadState } from '../../src/core/homestead/state';
import { createRng, deriveSeed } from '../../src/core/rng/rng';
import { applyMove } from '../../src/core/run/run';
import type { RunState } from '../../src/core/run/state';
import { chooseMove, type BotId } from './bots';
import { BoardMetrics } from './metrics';
import { applyCare, type CarePolicy } from './policies';

export interface PlayResult {
  run: RunState;
}

/** Plays one run to the end with a bot; feeds board metrics. */
export function playRun(run0: RunState, bot: BotId, cfg: Tunables, botSeed: number, metrics?: BoardMetrics): RunState {
  let run = run0;
  let rng = createRng(botSeed);
  metrics?.startRun();
  const guided = COMMISSION_BY_ID[run.commission.id]?.guidedMoves;
  while (run.status === 'playing') {
    let move;
    if (guided && run.commission.attempts === 0 && run.moveIndex < guided.length) {
      const g = guided[run.moveIndex]!;
      move = { a: { x: g.a[0], y: g.a[1] }, b: { x: g.b[0], y: g.b[1] } };
    } else {
      const [m, next] = chooseMove(bot, run, cfg, rng);
      rng = next;
      move = m;
    }
    if (!move) break;
    const r = applyMove(run, move, cfg);
    if (!r.ok) break;
    run = r.run;
    metrics?.afterMove(run, r.events);
  }
  metrics?.endRun(run);
  return run;
}

export interface SingleOpts {
  commission: string;
  runs: number;
  seed: number;
  bot: BotId;
  care: CarePolicy;
  fieldStages: [number, number, number];
}

/** 02 §15.4 single mode: generated field per seed, optional care before the run. */
export function simulateSingle(o: SingleOpts, cfg: Tunables) {
  const metrics = new BoardMetrics();
  const def = COMMISSION_BY_ID[o.commission];
  if (!def) throw new Error(`unknown commission ${o.commission}`);
  for (let i = 0; i < o.runs; i++) {
    const gen = generateBoard(createRng(deriveSeed(o.seed, 'field', i)), o.fieldStages, cfg, 1);
    let home: HomesteadState = {
      ...newHomestead(deriveSeed(o.seed, 'home', i), cfg),
      field: fieldFromBoard(gen.board),
      uidCounter: gen.nextUid,
      commissions: { cursor: 99, generatedCount: 0, active: activeFrom(def), completed: [] },
    };
    home = applyCare(home, o.care, cfg).home;
    const { run } = startRun(home, cfg);
    playRun(run, o.bot, cfg, deriveSeed(o.seed, 'bot', i), metrics);
  }
  return metrics.summary();
}

export interface CampaignOpts {
  runs: number;
  seed: number;
  bot: BotId;
  care: CarePolicy;
  extra: number;
}

export interface CampaignRow {
  id: string;
  attempts: number[];
  wins: number;
  income: number[];
}

/** 02 §15.4 campaign mode: new game → T1…C12 (+extra), retries ≤ 3 then sleep, cheapest-affordable decor. */
export function simulateCampaign(o: CampaignOpts, cfg: Tunables) {
  const rows = new Map<string, CampaignRow>();
  const purchaseDays: Record<string, number[]> = {};
  const purchaseAfterCommission: Record<string, number[]> = {};
  const dewByDay: number[][] = [];
  const metrics = new BoardMetrics();
  const levelDays: Record<number, number[]> = { 2: [], 3: [] };
  /** earnedAfter[run][k] = cumulative dewdrops earned (never minus spending) once k regular commissions are won. */
  const earnedAfter: number[][] = [];
  for (let i = 0; i < o.runs; i++) {
    let earned = 0;
    const cum: number[] = [];
    let home = newHomestead(deriveSeed(o.seed, 'campaign', i), cfg);
    let regularDone = 0;
    const target = 14 + o.extra;
    let guard = 0;
    while (regularDone < target && guard++ < 400) {
      const active = home.commissions.active;
      if (!active || home.phase === 'dusk') {
        home = shop(home, cfg, purchaseDays, purchaseAfterCommission, regularDone, levelDays);
        dewByDay[home.day - 1] = [...(dewByDay[home.day - 1] ?? []), home.wallet.dewdrop];
        home = night(home, cfg);
        continue;
      }
      home = forcedWater(home, cfg);
      if (tutorialGate(home).allow.includes('water')) home = applyCare(home, o.care, cfg).home;
      const s = startRun(home, cfg);
      const run = playRun(s.run, o.bot, cfg, deriveSeed(o.seed, 'bot', i, s.home.runCounter), metrics);
      const before = s.home.wallet.dewdrop;
      const out = settleRun(s.home, run, cfg);
      home = out.home;
      const row = rows.get(active.id) ?? { id: active.id, attempts: [], wins: 0, income: [] };
      rows.set(active.id, row);
      row.income.push(home.wallet.dewdrop - before);
      earned += home.wallet.dewdrop - before;
      if (out.settlement.result === 'won') {
        row.wins++;
        row.attempts.push(active.attempts + 1);
        if (!active.isTutorial) regularDone++;
        cum[regularDone] = earned;
      } else if (active.attempts + 1 >= 3) {
        home = shop(home, cfg, purchaseDays, purchaseAfterCommission, regularDone, levelDays);
        home = night(home, cfg);
      }
    }
    earnedAfter.push(cum);
  }
  return {
    rows: [...rows.values()],
    purchaseDays,
    purchaseAfterCommission,
    dewByDay,
    board: metrics.summary(),
    levelDays,
    affordability: affordability(earnedAfter),
  };
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]! : NaN);

/**
 * 01 §12 / 04 P2-23 AC2 evidence: how many regular commissions until cumulative earnings cover a price.
 * `alone` = that decor by itself (saving for it); `inOrder` = it plus every cheaper decor (the cheapest-first path);
 * `all` = all eight. Level gates (§9) are ignored — this is purely the income curve. k = 0 means the tutorials paid it.
 */
function affordability(earnedAfter: number[][]) {
  const firstK = (cum: number[], price: number) => {
    const k = cum.findIndex((e) => e !== undefined && e >= price);
    return k < 0 ? cum.length : k; // not reached within the horizon → reported as "> horizon" (length)
  };
  const byPrice = [...DECOR].sort((a, b) => a.price - b.price);
  const chime = DECOR_BY_ID.windChime;
  const total = DECOR.reduce((s, d) => s + d.price, 0);
  const maxK = Math.max(0, ...earnedAfter.map((c) => c.length - 1));
  return {
    cumEarned: Array.from({ length: maxK + 1 }, (_, k) => median(earnedAfter.map((c) => c[k]).filter((x): x is number => x !== undefined))),
    decor: byPrice.map((d, j) => {
      const inOrderPrice = byPrice.slice(0, j + 1).reduce((s, x) => s + x.price, 0);
      return {
        id: d.id,
        price: d.price,
        alone: median(earnedAfter.map((c) => firstK(c, d.price))),
        inOrderPrice,
        inOrder: median(earnedAfter.map((c) => firstK(c, inOrderPrice))),
        /** windChime first (the 01 §12 path: chime after C01, then save for the next one). */
        afterChime: median(earnedAfter.map((c) => firstK(c, d.id === chime.id ? d.price : d.price + chime.price))),
      };
    }),
    all: { price: total, k: median(earnedAfter.map((c) => firstK(c, total))) },
  };
}

/** G3 forces one guided watering before C01 (02 §11.1); the sim follows the game. */
function forcedWater(home: HomesteadState, cfg: Tunables): HomesteadState {
  if (currentGate(home) !== 'G3' || !home.commissions.active) return home;
  const r = careWaterRow(home, pickWaterRowHint(fieldBoard(home), home.commissions.active.items[0]!.crop), cfg);
  return r.ok ? r.home : home;
}

function night(home: HomesteadState, cfg: Tunables): HomesteadState {
  const r = sleep(forcedWater(home, cfg), cfg);
  return r.ok ? r.home : home;
}

function shop(
  home: HomesteadState,
  cfg: Tunables,
  days: Record<string, number[]>,
  after: Record<string, number[]>,
  regularDone: number,
  levelDays: Record<number, number[]>,
): HomesteadState {
  let h = home;
  for (;;) {
    const lvl = terraceLevel(h, cfg);
    const options = DECOR.filter((d) => !h.decor.owned.includes(d.id) && d.level <= lvl && d.price <= h.wallet.dewdrop).sort(
      (a, b) => a.price - b.price,
    );
    if (!options.length) return h;
    const r = purchaseDecor(h, options[0]!.id, cfg);
    if (!r.ok) return h;
    h = r.home;
    (days[options[0]!.id] ??= []).push(h.day);
    (after[options[0]!.id] ??= []).push(regularDone);
    for (const e of r.events) if (e.t === 'terraceLevelUp') levelDays[e.level]!.push(h.day);
  }
}
