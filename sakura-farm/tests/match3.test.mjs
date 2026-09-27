import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../src/game/match3/engine.js';
import { roundRewards, addGained, emptyTally } from '../src/game/match3/rewards.js';
import { makeRng } from '../src/game/rng.js';
import { SPECIES } from '../src/game/data.js';

const { N, idx } = E;
let id = 1;
/** Board from rows of digits (kind) with optional suffix h/v/f/s for specials; '*' = shears. */
function board(rows) {
  const cells = rows.trim().split('\n').map((r) => r.trim().split(/\s+/));
  assert.equal(cells.length, N);
  return cells.flat().map((t) => {
    if (t === '*') return { id: id++, kind: -1, special: 'shears' };
    const special = { h: 'canH', v: 'canV', f: 'fert' }[t[1]] ?? null;
    return { id: id++, kind: Number(t[0]), special };
  });
}

test('generated boards have no matches and at least one move', () => {
  const r = makeRng(3);
  for (let k = 0; k < 50; k++) {
    const b = E.generate(r);
    assert.equal(E.findRuns(b).length, 0);
    assert.ok(E.validMoves(b).length > 0);
  }
});

test('rare species appear less often (weights 4/4/4/3/3/2)', () => {
  const r = makeRng(9);
  const n = new Array(SPECIES.length).fill(0);
  for (let k = 0; k < 300; k++) for (const t of E.generate(r)) n[t.kind]++;
  assert.ok(n[0] > n[5] * 1.5, `sakura ${n[0]} vs matsu ${n[5]}`);
});

const B4 = `
0 0 1 0 2 3 4
1 2 3 4 5 1 2
2 3 4 5 1 2 3
3 4 5 1 2 3 4
4 5 1 2 3 4 5
5 1 2 3 4 5 1
1 2 3 4 5 1 2`;

test('illegal swaps are rejected without changing anything', () => {
  const b = board(B4);
  assert.equal(E.play(b, idx(0, 1), idx(1, 1), makeRng(1)), null);
  assert.equal(E.isValidSwap(b, idx(0, 0), idx(2, 2)), false); // not adjacent
});

test('a 4-in-a-row makes a watering-can tile at the moved cell', () => {
  // Moving the 0 at (2,1) up completes row 0 = 0 0 0 0.
  const b = board(`
0 0 1 0 2 3 4
1 2 0 4 5 1 2
2 3 4 5 1 2 3
3 4 5 1 2 3 4
4 5 1 2 3 4 5
5 1 2 3 4 5 1
1 2 3 4 5 1 2`);
  const r = E.play(b, idx(2, 1), idx(2, 0), makeRng(1));
  assert.ok(r);
  const made = r.steps[0].created;
  assert.equal(made.length, 1);
  assert.equal(made[0].tile.special, 'canH');
  assert.equal(made[0].at, idx(2, 0));
  assert.equal(r.gained.tiles[0] >= 3, true);
});

test('L/T shapes make a fertilizer tile; a run of five makes shears', () => {
  const lb = board(`
0 1 2 3 4 5 1
0 2 3 4 5 1 2
3 0 0 5 1 2 3
0 4 5 1 2 3 4
4 5 1 2 3 4 5
5 1 2 3 4 5 1
1 2 3 4 5 1 2`);
  // Moving the 0 at (0,3) up to (0,2) joins column x=0 (rows 0–2) with row 2 (x 0–2): an L.
  const r1 = E.play(lb, idx(0, 2), idx(0, 3), makeRng(1));
  assert.ok(r1);
  assert.equal(r1.steps[0].created[0].tile.special, 'fert');
  const fb = board(`
0 0 1 0 0 3 4
1 2 0 4 5 1 2
2 3 4 5 1 2 3
3 4 5 1 2 3 4
4 5 1 2 3 4 5
5 1 2 3 4 5 1
1 2 3 4 5 1 2`);
  const r2 = E.play(fb, idx(2, 1), idx(2, 0), makeRng(1));
  assert.equal(r2.steps[0].created[0].tile.special, 'shears');
  assert.equal(r2.steps[0].created[0].tile.kind, -1);
});

test('specials fire when cleared, chain, and are counted as tools', () => {
  // Moving the 1 at (0,2) right makes column x=1 = 1 1 1h 1 (four) → a canV is created at (1,2) and the canH at
  // (1,3), cleared by that match, fires and wipes row 3.
  const b = board(`
2 3 4 5 2 3 4
3 1 5 2 3 4 5
1 2 2 3 4 5 2
5 1h 3 4 5 2 3
2 1 4 5 2 3 4
3 4 5 2 3 4 5
4 5 2 3 4 5 2`);
  const r = E.play(b, idx(0, 2), idx(1, 2), makeRng(1));
  assert.ok(r, 'expected a legal move');
  const s0 = r.steps[0];
  assert.deepEqual(s0.created.map((c) => [c.at, c.tile.special]), [[idx(1, 2), 'canV']]);
  assert.deepEqual(s0.fired.map((f) => f.special), ['canH']);
  const row3 = s0.cleared.filter((c) => Math.floor(c.at / N) === 3).map((c) => c.at % N).sort();
  assert.deepEqual(row3, [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(r.gained.specials.can >= 1, true);
});

test('swapping shears clears every tile of the other kind', () => {
  const b = board(`
* 0 1 2 3 4 5
0 1 2 3 4 5 0
1 2 3 4 5 0 1
2 3 4 5 0 1 2
3 4 5 0 1 2 3
4 5 0 1 2 3 4
5 0 1 2 3 4 5`);
  const zeros = b.filter((t) => t.kind === 0).length;
  const r = E.play(b, idx(0, 0), idx(1, 0), makeRng(1));
  assert.ok(r);
  const first = r.steps[0];
  assert.equal(first.fired[0].special, 'shears');
  assert.equal(first.fired[0].target, 0);
  assert.equal(first.cleared.filter((c) => c.tile.kind === 0).length, zeros);
  assert.equal(r.gained.specials.shears, 1);
});

test('every move settles: full board, no runs, a move available, replayable with the same rng', () => {
  const playout = () => {
    const rng = makeRng(77);
    let b = E.generate(rng);
    const trace = [];
    for (let k = 0; k < 150; k++) {
      const [a, c] = E.hint(b);
      const r = E.play(b, a, c, rng);
      b = r.board;
      assert.equal(b.length, N * N);
      assert.ok(b.every(Boolean));
      assert.equal(E.findRuns(b).length, 0);
      assert.ok(E.validMoves(b).length > 0);
      trace.push(b.map((t) => `${t.kind}${t.special ?? ''}`).join());
    }
    return trace.join('|');
  };
  assert.equal(playout(), playout());
});

test('round rewards: seeds per seedPoints, remainder carried, tools per fired special', () => {
  let t = emptyTally();
  t = addGained(t, { tiles: [13, 6, 0, 8, 7, 10], specials: { can: 2, fert: 1, shears: 1 } });
  const r = roundRewards(t, { sakura: 5, ume: 0, momiji: 0, kaki: 0, mikan: 0, matsu: 0 });
  assert.deepEqual(r.seeds, { sakura: 3, ume: 1, momiji: 0, kaki: 1, mikan: 0, matsu: 1 });
  assert.deepEqual(r.seedPoints, { sakura: 0, ume: 0, momiji: 0, kaki: 0, mikan: 7, matsu: 0 });
  assert.equal(r.water, 4);
  assert.equal(r.fert, 1);
  assert.equal(r.shears, 1);
});
