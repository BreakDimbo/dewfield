// Game controller: owns the live state, persists it, and notifies listeners. DOM-free except for the optional
// `storage` (localStorage-like) passed in, so it runs in node checks too. Published as ctx.services.game.
import { act, nextDay, tradeForTicket, useTicket, addRewards } from './farm.js';
import { newGame, parse, serialize, SAVE_KEY } from './state.js';
import { CLOCK, STAGE, SPECIES_IDS } from './data.js';

export function createGame({ storage = null, seed = 20260927, demo = null } = {}) {
  let loadError = null;
  let state = null;
  if (demo) state = demoState(demo);
  else if (storage) {
    const raw = safe(() => storage.getItem(SAVE_KEY));
    const r = parse(raw);
    if (r.state) state = r.state;
    else if (raw) {
      loadError = r.error;
      safe(() => storage.setItem(`${SAVE_KEY}.corrupt.${Date.now()}`, raw));
    }
  }
  state ??= newGame(seed);
  const listeners = new Set();
  const game = {
    state,
    version: 1,
    loadError,
    reducedMotion: false,
    /** Selected seed in the seed bag. */
    seed: SPECIES_IDS.find((id) => state.inventory.seeds[id] > 0) ?? 'sakura',
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Apply a pure result `{ ok, state, events }`; returns it. */
    commit(r, { save = true } = {}) {
      if (!r.ok) return r;
      game.state = r.state;
      game.version++;
      if (save) game.save();
      for (const fn of listeners) fn(r.events ?? [], game.state);
      return r;
    },
    act(plot, tool) {
      return game.commit(act(game.state, plot, tool, game.seed));
    },
    sleep() {
      return game.commit({ ok: true, ...nextDay(game.state) });
    },
    trade() {
      return game.commit(tradeForTicket(game.state));
    },
    useTicket() {
      return game.commit(useTicket(game.state));
    },
    reward(rewards) {
      return game.commit({ ok: true, state: addRewards(game.state, rewards), events: [{ t: 'rewards', rewards }] });
    },
    /** Advance the clock (not saved every frame; saved on the next action or sleep). */
    tick(minutes) {
      if (minutes <= 0) return;
      game.state = { ...game.state, minute: Math.min(CLOCK.dayEnd, game.state.minute + minutes) };
    },
    save() {
      if (storage && !demo) safe(() => storage.setItem(SAVE_KEY, serialize(game.state)));
    },
    reset() {
      game.state = newGame(seed);
      game.version++;
      game.save();
      for (const fn of listeners) fn([{ t: 'reset' }], game.state);
    },
  };
  return game;
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return null;
  }
}

/** Screenshot / showcase states (`?demo=trees`, `?demo=stages`) — never saved. */
export function demoState(kind) {
  const s = newGame(1);
  const put = (i, species, stage, extra = {}) => Object.assign(s.plots[i], { species, stage, ...extra });
  if (kind === 'stages') {
    s.plots[0].stage = STAGE.TILLED;
    put(1, 'sakura', STAGE.SEED);
    put(2, 'sakura', STAGE.SPROUT, { watered: true });
    put(3, 'sakura', STAGE.SAPLING);
    put(4, 'sakura', STAGE.YOUNG, { watered: true });
    put(5, 'sakura', STAGE.MATURE);
    put(6, 'matsu', STAGE.YOUNG);
    put(7, 'kaki', STAGE.YOUNG);
  } else {
    put(0, 'sakura', STAGE.MATURE, { produce: 1 });
    put(1, 'ume', STAGE.MATURE);
    put(2, 'momiji', STAGE.MATURE);
    put(3, 'kaki', STAGE.MATURE, { produce: 2 });
    put(4, 'mikan', STAGE.MATURE, { produce: 1 });
    put(5, 'matsu', STAGE.MATURE, { pruned: true });
    put(6, 'ume', STAGE.YOUNG, { watered: true });
    put(7, 'mikan', STAGE.SAPLING);
  }
  for (const id of SPECIES_IDS) s.inventory.seeds[id] = 2;
  s.inventory.water = 6;
  s.inventory.fert = 2;
  s.inventory.shears = 1;
  return s;
}
