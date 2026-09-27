// Game state: new game, save format, validation. Pure (no DOM); the UI layer does localStorage.
import { CLOCK, FARM_RULES, SPECIES_IDS, STAGE, START_INVENTORY } from './data.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'sakurafarm.save.v1';

export function newPlot() {
  return { stage: STAGE.EMPTY, species: null, growth: 0, watered: false, fert: false, pruned: false, produce: 0, sinceProduce: 0 };
}

export function newGame(seed = 20260927) {
  return {
    version: SAVE_VERSION,
    day: 1,
    minute: CLOCK.dayStart,
    weather: 'sunny',
    tickets: FARM_RULES.ticketsPerDay,
    rng: seed >>> 0,
    inventory: structuredClone(START_INVENTORY),
    plots: Array.from({ length: FARM_RULES.plots }, newPlot),
    dex: { matured: {}, harvested: {} },
    /** Match-3 seed points carried between rounds (partial seeds are never lost). */
    seedPoints: Object.fromEntries(SPECIES_IDS.map((id) => [id, 0])),
  };
}

const isInt = (v, lo = 0, hi = Number.MAX_SAFE_INTEGER) => Number.isInteger(v) && v >= lo && v <= hi;
const isCounts = (o) => o && typeof o === 'object' && SPECIES_IDS.every((id) => isInt(o[id] ?? 0));

/** Structural check of a parsed save. Returns a list of problems (empty = valid). */
export function validate(s) {
  const bad = [];
  if (!s || typeof s !== 'object') return ['not an object'];
  if (s.version !== SAVE_VERSION) bad.push('version');
  if (!isInt(s.day, 1)) bad.push('day');
  if (!isInt(s.minute, 0, 24 * 60)) bad.push('minute');
  if (!isInt(s.tickets, 0, 99)) bad.push('tickets');
  if (!isInt(s.rng, 0, 0xffffffff)) bad.push('rng');
  const inv = s.inventory;
  if (!inv || !isCounts(inv.seeds) || !isCounts(inv.produce) || !isInt(inv.water) || !isInt(inv.fert) || !isInt(inv.shears)) bad.push('inventory');
  if (!Array.isArray(s.plots) || s.plots.length !== FARM_RULES.plots) bad.push('plots');
  else
    s.plots.forEach((p, i) => {
      const ok =
        p && isInt(p.stage, 0, STAGE.MATURE) && (p.species === null || SPECIES_IDS.includes(p.species)) &&
        (p.stage >= STAGE.SEED) === (p.species !== null) && isInt(p.growth) && isInt(p.produce, 0, 9) && isInt(p.sinceProduce) &&
        typeof p.watered === 'boolean' && typeof p.fert === 'boolean' && typeof p.pruned === 'boolean';
      if (!ok) bad.push(`plot ${i}`);
    });
  if (!s.dex || typeof s.dex.matured !== 'object' || typeof s.dex.harvested !== 'object') bad.push('dex');
  if (!isCounts(s.seedPoints)) bad.push('seedPoints');
  return bad;
}

export function serialize(state) {
  return JSON.stringify(state);
}

/** Parse a save string. Corrupt or foreign data yields `{ state: null, error }` so the caller can keep a copy. */
export function parse(raw) {
  if (!raw) return { state: null, error: 'empty' };
  let s;
  try {
    s = JSON.parse(raw);
  } catch {
    return { state: null, error: 'json' };
  }
  const bad = validate(s);
  return bad.length ? { state: null, error: bad.join(', ') } : { state: s, error: null };
}
