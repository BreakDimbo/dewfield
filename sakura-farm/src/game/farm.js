// Farm rules (docs/DESIGN.md §4–§5). Every action is pure: (state, …) → { ok, state, reason?, events }.
import { FARM_RULES, SPECIES_BY_ID, SPECIES_IDS, STAGE, STAGE_NAMES, CLOCK } from './data.js';
import { nextRandom } from './rng.js';

const fail = (state, reason) => ({ ok: false, state, reason, events: [] });
const clone = (s) => structuredClone(s);

/** Watered nights still needed before `plot` reaches its next stage (0 when it is waiting on pruning or mature). */
export function daysToNext(plot) {
  if (plot.stage < STAGE.SEED || plot.stage >= STAGE.MATURE) return 0;
  const need = SPECIES_BY_ID[plot.species].days[plot.stage - STAGE.SEED];
  return Math.max(0, need - plot.growth);
}

/** The pine stops at a young tree until it has been pruned once. */
export function waitsForPruning(plot) {
  const sp = plot.species && SPECIES_BY_ID[plot.species];
  return !!sp?.needsPruning && plot.stage === STAGE.YOUNG && !plot.pruned;
}

/**
 * What the held tool would do to plot `i` — `{ ok, label }` or `{ ok: false, reason }`. Used for the on-screen
 * prompt; `act` performs the same check, so prompt and action never disagree.
 */
export function preview(state, i, tool, speciesId) {
  const r = act(state, i, tool, speciesId);
  return r.ok ? { ok: true, label: r.label } : { ok: false, reason: r.reason };
}

/** Apply `tool` to plot `i`. `speciesId` is the seed chosen in the seed bag. */
export function act(state, i, tool, speciesId) {
  const plot = state.plots[i];
  if (!plot) return fail(state, 'ここには畑がありません');
  const inv = state.inventory;
  const sp = plot.species && SPECIES_BY_ID[plot.species];
  const done = (label, mutate, events = []) => {
    const next = clone(state);
    mutate(next, next.plots[i], next.inventory);
    return { ok: true, state: next, label, events: [{ t: tool, plot: i }, ...events] };
  };
  switch (tool) {
    case 'hoe':
      if (plot.stage !== STAGE.EMPTY) return fail(state, plot.stage === STAGE.TILLED ? 'もう耕してあります' : '木が育っています');
      return done('耕す', (_, p) => (p.stage = STAGE.TILLED));
    case 'seeds': {
      if (plot.stage === STAGE.EMPTY) return fail(state, 'まず鍬で耕しましょう');
      if (plot.stage !== STAGE.TILLED) return fail(state, 'もう植えてあります');
      const s = SPECIES_BY_ID[speciesId];
      if (!s) return fail(state, '種を選んでください');
      if (!inv.seeds[speciesId]) return fail(state, `${s.name}の種がありません`);
      return done(`${s.name}の種をまく`, (_, p, v) => {
        p.stage = STAGE.SEED;
        p.species = speciesId;
        p.growth = 0;
        v.seeds[speciesId] -= 1;
      });
    }
    case 'can':
      if (plot.stage < STAGE.SEED) return fail(state, plot.stage === STAGE.TILLED ? 'まだ何も植えていません' : '耕して種をまきましょう');
      if (plot.watered) return fail(state, '今日はもう水をやりました');
      if (!inv.water) return fail(state, 'じょうろの水がありません（屋台で手に入ります）');
      return done('水をやる', (_, p, v) => {
        p.watered = true;
        v.water -= 1;
      });
    case 'fert':
      if (plot.stage < STAGE.SEED) return fail(state, '植えてある畑に使います');
      if (plot.stage === STAGE.MATURE) return fail(state, 'もう大きく育っています');
      if (plot.fert) return fail(state, '肥料はもう効いています');
      if (!inv.fert) return fail(state, '肥料がありません');
      return done('肥料をやる', (_, p, v) => {
        p.fert = true;
        v.fert -= 1;
      });
    case 'shears':
      if (waitsForPruning(plot)) {
        if (!inv.shears) return fail(state, '剪定ばさみがありません');
        return done('枝を整える', (_, p, v) => {
          p.pruned = true;
          v.shears -= 1;
        });
      }
      if (plot.stage !== STAGE.MATURE) return fail(state, sp?.needsPruning ? '若木になったら整えます' : '成木になったら剪定できます');
      if (plot.pruned) return fail(state, 'もう剪定してあります');
      if (!inv.shears) return fail(state, '剪定ばさみがありません');
      return done('剪定する', (_, p, v) => {
        p.pruned = true;
        v.shears -= 1;
      });
    case 'basket': {
      if (plot.stage !== STAGE.MATURE) return fail(state, plot.stage >= STAGE.SEED ? `まだ${STAGE_NAMES[plot.stage]}です` : '収穫するものがありません');
      if (!plot.produce) return fail(state, `${sp.produce}はまだです`);
      const n = plot.produce;
      return done(`${sp.produce}を収穫（${n}）`, (s, p, v) => {
        v.produce[p.species] += n;
        s.dex.harvested[p.species] = (s.dex.harvested[p.species] ?? 0) + n;
        p.produce = 0;
      }, [{ t: 'harvest', plot: i, species: plot.species, n }]);
    }
    default:
      return fail(state, '');
  }
}

/** Sleep: settle the night, then start the next morning (rain roll, tickets refilled). */
export function nextDay(state) {
  const s = clone(state);
  const events = [];
  s.plots.forEach((p, i) => {
    if (p.stage < STAGE.SEED) {
      p.watered = false;
      return;
    }
    const sp = SPECIES_BY_ID[p.species];
    if (p.watered) {
      if (p.stage < STAGE.MATURE) {
        p.growth += p.fert ? 2 : 1;
        while (p.stage < STAGE.MATURE) {
          const need = sp.days[p.stage - STAGE.SEED];
          if (p.growth < need) break;
          if (waitsForPruning(p)) {
            p.growth = need;
            break;
          }
          const from = p.stage;
          p.stage += 1;
          p.growth -= need;
          events.push({ t: 'grow', plot: i, from, to: p.stage, species: p.species });
          if (p.stage === STAGE.MATURE) {
            p.growth = 0;
            p.pruned = false;
            if (!s.dex.matured[p.species]) events.push({ t: 'firstMature', plot: i, species: p.species });
            s.dex.matured[p.species] = true;
          }
        }
      } else {
        p.sinceProduce += 1;
        if (p.sinceProduce >= FARM_RULES.produceEvery) {
          const n = p.pruned ? 2 : 1;
          p.produce = Math.min(3, p.produce + n);
          p.pruned = false;
          p.sinceProduce = 0;
          events.push({ t: 'produce', plot: i, species: p.species, n });
        }
      }
    }
    p.fert = false;
    p.watered = false;
  });
  const [roll, rng] = nextRandom(s.rng);
  s.rng = rng;
  s.weather = roll < FARM_RULES.rainChance ? 'rain' : 'sunny';
  if (s.weather === 'rain') {
    for (const p of s.plots) if (p.stage >= STAGE.SEED) p.watered = true;
    events.push({ t: 'rain' });
  }
  s.day += 1;
  s.minute = CLOCK.dayStart;
  s.tickets = Math.max(s.tickets, FARM_RULES.ticketsPerDay);
  return { state: s, events };
}

/** Trade `producePerTicket` produce (most plentiful kinds first) for one extra match-3 ticket. */
export function tradeForTicket(state) {
  const total = SPECIES_IDS.reduce((a, id) => a + state.inventory.produce[id], 0);
  if (total < FARM_RULES.producePerTicket) return fail(state, `収穫物が${FARM_RULES.producePerTicket}つ必要です`);
  const s = clone(state);
  let left = FARM_RULES.producePerTicket;
  const order = [...SPECIES_IDS].sort((a, b) => s.inventory.produce[b] - s.inventory.produce[a]);
  for (const id of order) {
    const take = Math.min(left, s.inventory.produce[id]);
    s.inventory.produce[id] -= take;
    left -= take;
  }
  s.tickets += 1;
  return { ok: true, state: s, events: [{ t: 'ticket' }] };
}

export function useTicket(state) {
  if (state.tickets <= 0) return fail(state, '今日の券はもうありません');
  const s = clone(state);
  s.tickets -= 1;
  return { ok: true, state: s, events: [] };
}

/** Add a finished match-3 round's rewards (`{ seeds: {id: n}, water, fert, shears, seedPoints }`). */
export function addRewards(state, rewards) {
  const s = clone(state);
  for (const id of SPECIES_IDS) s.inventory.seeds[id] += rewards.seeds?.[id] ?? 0;
  s.inventory.water += rewards.water ?? 0;
  s.inventory.fert += rewards.fert ?? 0;
  s.inventory.shears += rewards.shears ?? 0;
  if (rewards.seedPoints) s.seedPoints = { ...rewards.seedPoints };
  return s;
}

/** Every species has reached maturity at least once. */
export const complete = (state) => SPECIES_IDS.every((id) => state.dex.matured[id]);
