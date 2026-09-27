import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE, SPECIES_BY_ID, FARM_RULES } from '../src/game/data.js';
import { newGame, parse, serialize, validate } from '../src/game/state.js';
import { act, nextDay, tradeForTicket, useTicket, addRewards, daysToNext, complete } from '../src/game/farm.js';

const ok = (r) => {
  assert.equal(r.ok, true, r.reason);
  return r.state;
};
const sunny = (s) => ({ ...s, rng: 0 }); // rng 0 → first roll is not rain (checked below)
/** Sleep until the next sunny morning (so rain never waters for us). */
function sleep(s) {
  const events = [];
  for (;;) {
    const r = nextDay(s);
    events.push(...r.events);
    if (r.state.weather === 'sunny') return { state: r.state, events };
    s = { ...r.state, plots: r.state.plots.map((p) => ({ ...p, watered: false })) };
  }
}

test('hoe → seed → water: a watered night grows the seed into a sprout', () => {
  let s = newGame(7);
  s = ok(act(s, 0, 'hoe'));
  assert.equal(s.plots[0].stage, STAGE.TILLED);
  s = ok(act(s, 0, 'seeds', 'sakura'));
  assert.equal(s.plots[0].stage, STAGE.SEED);
  assert.equal(s.inventory.seeds.sakura, 1);
  s = ok(act(s, 0, 'can'));
  assert.equal(s.inventory.water, 3);
  const r = sleep(s);
  assert.equal(r.state.plots[0].stage, STAGE.SPROUT);
  assert.ok(r.events.some((e) => e.t === 'grow' && e.to === STAGE.SPROUT));
});

test('actions explain why they cannot happen', () => {
  const s = newGame(1);
  assert.match(act(s, 0, 'seeds', 'sakura').reason, /耕/);
  assert.match(act(s, 0, 'can').reason, /耕/);
  const t = ok(act(s, 0, 'hoe'));
  assert.match(act(t, 0, 'hoe').reason, /もう耕/);
  assert.match(act(t, 0, 'seeds', 'kaki').reason, /柿の種がありません/);
  const w = ok(act(ok(act(t, 0, 'seeds', 'sakura')), 0, 'can'));
  assert.match(act(w, 0, 'can').reason, /もう水/);
  assert.equal(act(s, 99, 'hoe').ok, false);
});

test('unwatered nights do not grow and never kill; fertilizer counts a night twice', () => {
  let s = ok(act(ok(act(newGame(3), 0, 'hoe')), 0, 'seeds', 'sakura'));
  s = sleep(s).state;
  assert.equal(s.plots[0].stage, STAGE.SEED);
  // sprout → sapling needs 2 nights for sakura; fertilizer makes it 1.
  s = { ...s, plots: s.plots.map((p, i) => (i === 0 ? { ...p, stage: STAGE.SPROUT, growth: 0 } : p)), inventory: { ...s.inventory, fert: 1 } };
  s = ok(act(ok(act(s, 0, 'can')), 0, 'fert'));
  s = sleep(s).state;
  assert.equal(s.plots[0].stage, STAGE.SAPLING);
  assert.equal(s.plots[0].fert, false);
});

test('each species reaches maturity after exactly sum(days) watered nights', () => {
  for (const id of ['sakura', 'ume', 'momiji', 'kaki', 'mikan']) {
    let s = newGame(11);
    s.inventory.seeds[id] = 1;
    s.inventory.water = 99;
    s = ok(act(ok(act(s, 0, 'hoe')), 0, 'seeds', id));
    const total = SPECIES_BY_ID[id].days.reduce((a, b) => a + b, 0);
    for (let n = 0; n < total; n++) {
      assert.notEqual(s.plots[0].stage, STAGE.MATURE, `${id} matured early at night ${n}`);
      if (!s.plots[0].watered) s = ok(act(s, 0, 'can'));
      s = nextDay(s).state;
    }
    assert.equal(s.plots[0].stage, STAGE.MATURE, id);
    assert.equal(s.dex.matured[id], true);
  }
});

test('the pine waits as a young tree until pruned', () => {
  let s = newGame(5);
  s.inventory.seeds.matsu = 1;
  s.inventory.water = 99;
  s.inventory.shears = 1;
  s = ok(act(ok(act(s, 0, 'hoe')), 0, 'seeds', 'matsu'));
  for (let n = 0; n < 30; n++) {
    if (!s.plots[0].watered) s = ok(act(s, 0, 'can'));
    s = nextDay(s).state;
  }
  assert.equal(s.plots[0].stage, STAGE.YOUNG);
  assert.equal(daysToNext(s.plots[0]), 0);
  s = ok(act(s, 0, 'shears'));
  if (!s.plots[0].watered) s = ok(act(s, 0, 'can'));
  s = nextDay(s).state;
  assert.equal(s.plots[0].stage, STAGE.MATURE);
});

test('mature trees bear produce every 2 watered days; pruning doubles one harvest', () => {
  let s = newGame(9);
  s.inventory.water = 99;
  s.inventory.shears = 1;
  s.plots[0] = { ...s.plots[0], stage: STAGE.MATURE, species: 'kaki' };
  for (let n = 0; n < FARM_RULES.produceEvery; n++) {
    if (!s.plots[0].watered) s = ok(act(s, 0, 'can'));
    s = nextDay(s).state;
  }
  assert.equal(s.plots[0].produce, 1);
  const h = act(s, 0, 'basket');
  s = ok(h);
  assert.equal(s.inventory.produce.kaki, 1);
  assert.equal(s.dex.harvested.kaki, 1);
  s = ok(act(s, 0, 'shears'));
  for (let n = 0; n < FARM_RULES.produceEvery; n++) {
    if (!s.plots[0].watered) s = ok(act(s, 0, 'can'));
    s = nextDay(s).state;
  }
  assert.equal(s.plots[0].produce, 2);
});

test('rain waters every planted plot in the morning; tickets refill; trading produce buys a ticket', () => {
  let s = ok(act(ok(act(newGame(1), 0, 'hoe')), 0, 'seeds', 'sakura'));
  s.tickets = 0;
  let rained = false;
  for (let n = 0; n < 40 && !rained; n++) {
    const r = nextDay(s);
    if (r.state.weather === 'rain') {
      rained = true;
      assert.equal(r.state.plots[0].watered, true);
      assert.equal(r.state.plots[1].watered, false); // grass plots stay dry
    }
    s = r.state;
  }
  assert.ok(rained, 'no rain in 40 days');
  assert.equal(s.tickets, FARM_RULES.ticketsPerDay);
  s = ok(useTicket(s));
  assert.equal(s.tickets, FARM_RULES.ticketsPerDay - 1);
  assert.equal(tradeForTicket(s).ok, false);
  s.inventory.produce.ume = 2;
  s.inventory.produce.kaki = 1;
  s = ok(tradeForTicket(s));
  assert.equal(s.tickets, FARM_RULES.ticketsPerDay);
  assert.equal(s.inventory.produce.ume + s.inventory.produce.kaki, 0);
});

test('rewards add seeds and tools; completion needs every species', () => {
  let s = addRewards(newGame(1), { seeds: { kaki: 2 }, water: 3, fert: 1, shears: 1, seedPoints: { sakura: 4, ume: 0, momiji: 0, kaki: 0, mikan: 0, matsu: 0 } });
  assert.equal(s.inventory.seeds.kaki, 2);
  assert.equal(s.inventory.water, 7);
  assert.equal(s.seedPoints.sakura, 4);
  assert.equal(complete(s), false);
  for (const id of Object.keys(s.dex.harvested).concat(['sakura', 'ume', 'momiji', 'kaki', 'mikan', 'matsu'])) s.dex.matured[id] = true;
  assert.equal(complete(s), true);
});

test('save round-trips and rejects corrupt data', () => {
  const s = ok(act(newGame(2), 3, 'hoe'));
  assert.deepEqual(validate(s), []);
  assert.deepEqual(parse(serialize(s)).state, s);
  assert.equal(parse('{nope').error, 'json');
  const broken = JSON.parse(serialize(s));
  broken.plots[0].stage = 4; // a tree without a species
  assert.match(parse(JSON.stringify(broken)).error, /plot 0/);
  assert.equal(parse(null).error, 'empty');
});

test('the same seed gives the same weather sequence', () => {
  const run = () => {
    let s = sunny(newGame(42));
    const w = [];
    for (let n = 0; n < 20; n++) {
      s = nextDay(s).state;
      w.push(s.weather);
    }
    return w.join();
  };
  assert.equal(run(), run());
});
