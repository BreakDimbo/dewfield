// Match-3 rules for the seed stall (docs/DESIGN.md §6). Pure and deterministic: every function takes the
// board and a mutable RNG (rng.js makeRng) and returns new data; nothing here touches the DOM.
//
// Board: array of size*size cells (row-major, y down). A tile is { id, kind, special }:
//   kind    0..5 = species index (SPECIES order); shears tiles have kind -1 (they match nothing)
//   special null | 'canH' | 'canV' | 'fert' | 'shears'
import { MATCH3, SPECIES } from '../data.js';

export const N = MATCH3.size;
export const KINDS = SPECIES.length;
const WEIGHTS = SPECIES.map((s) => s.weight);

export const idx = (x, y) => y * N + x;
export const pos = (i) => ({ x: i % N, y: Math.floor(i / N) });
const inBounds = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

let nextId = 1;
const tile = (kind, special = null) => ({ id: nextId++, kind, special });

/** Random plain tile avoiding `banned` kinds. */
function randomTile(rng, banned = []) {
  const w = WEIGHTS.map((v, k) => (banned.includes(k) ? 0 : v));
  return tile(rng.weighted(w));
}

/** A fresh board with no ready-made matches and at least one valid move. */
export function generate(rng) {
  for (;;) {
    const b = new Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const banned = [];
        if (x >= 2 && b[idx(x - 1, y)].kind === b[idx(x - 2, y)].kind) banned.push(b[idx(x - 1, y)].kind);
        if (y >= 2 && b[idx(x, y - 1)].kind === b[idx(x, y - 2)].kind) banned.push(b[idx(x, y - 1)].kind);
        b[idx(x, y)] = randomTile(rng, banned);
      }
    if (validMoves(b).length) return b;
  }
}

/** Horizontal and vertical runs of ≥ 3 equal kinds. */
export function findRuns(b) {
  const runs = [];
  for (const horiz of [true, false])
    for (let a = 0; a < N; a++) {
      let start = 0;
      for (let k = 1; k <= N; k++) {
        const cell = (t) => (horiz ? b[idx(t, a)] : b[idx(a, t)]);
        const same = k < N && cell(k).kind >= 0 && cell(k).kind === cell(start).kind;
        if (same) continue;
        if (k - start >= 3 && cell(start).kind >= 0)
          runs.push({ horiz, kind: cell(start).kind, cells: Array.from({ length: k - start }, (_, t) => (horiz ? idx(start + t, a) : idx(a, start + t))) });
        start = k;
      }
    }
  return runs;
}

/**
 * Merge runs that share cells into groups and classify each (docs §6): any run ≥ 5 → shears; horizontal and
 * vertical runs crossing → fert (L/T); a run of 4 → can (row for horizontal, column for vertical); else plain.
 */
export function findGroups(b) {
  const runs = findRuns(b);
  const parent = runs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < runs.length; i++)
    for (let j = i + 1; j < runs.length; j++) if (runs[i].cells.some((c) => runs[j].cells.includes(c))) parent[find(i)] = find(j);
  const byRoot = new Map();
  runs.forEach((r, i) => {
    const k = find(i);
    if (!byRoot.has(k)) byRoot.set(k, []);
    byRoot.get(k).push(r);
  });
  return [...byRoot.values()].map((rs) => {
    const cells = [...new Set(rs.flatMap((r) => r.cells))];
    const longest = Math.max(...rs.map((r) => r.cells.length));
    const crossed = rs.some((r) => r.horiz) && rs.some((r) => !r.horiz);
    let special = null;
    if (longest >= 5) special = 'shears';
    else if (crossed) special = 'fert';
    else if (longest === 4) special = rs[0].horiz ? 'canH' : 'canV';
    const crossing = crossed ? cells.find((c) => rs.filter((r) => r.cells.includes(c)).length > 1) : null;
    return { kind: rs[0].kind, cells, special, crossing };
  });
}

const swapped = (b, a, c) => {
  const n = b.slice();
  [n[a], n[c]] = [n[c], n[a]];
  return n;
};
const adjacent = (a, c) => {
  const p = pos(a), q = pos(c);
  return Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1;
};

/** A swap is legal when it creates a match, or when it involves a shears tile (which fires on any swap). */
export function isValidSwap(b, a, c) {
  if (!adjacent(a, c)) return false;
  if (b[a].special === 'shears' || b[c].special === 'shears') return true;
  return findRuns(swapped(b, a, c)).length > 0;
}

export function validMoves(b) {
  const out = [];
  for (let i = 0; i < N * N; i++) {
    const p = pos(i);
    if (p.x + 1 < N && isValidSwap(b, i, i + 1)) out.push([i, i + 1]);
    if (p.y + 1 < N && isValidSwap(b, i, i + N)) out.push([i, i + N]);
  }
  return out;
}

/** Cells a special clears when it fires at `at`. `targetKind` is the kind a shears tile wipes. */
function areaOf(b, at, special, targetKind) {
  const { x, y } = pos(at);
  if (special === 'canH') return Array.from({ length: N }, (_, t) => idx(t, y));
  if (special === 'canV') return Array.from({ length: N }, (_, t) => idx(x, t));
  if (special === 'fert') {
    const out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inBounds(x + dx, y + dy)) out.push(idx(x + dx, y + dy));
    return out;
  }
  if (special === 'shears') return b.map((t, i) => (t && t.kind === targetKind ? i : -1)).filter((i) => i >= 0).concat(at);
  return [at];
}

/** Most common plain kind on the board (shears fired by a blast or a special swap target it). */
function commonestKind(b) {
  const n = new Array(KINDS).fill(0);
  for (const t of b) if (t && t.kind >= 0) n[t.kind]++;
  return n.indexOf(Math.max(...n));
}

/**
 * Clear `cleared` (a Set of indices), firing any specials inside it (chain reactions, FIFO). Returns the fired
 * specials and the final cleared set. `keep` cells (freshly created specials) are never cleared.
 */
function clearWithChains(b, cleared, keep, firstTarget) {
  const fired = [];
  const queue = [...cleared].filter((i) => b[i]?.special && !keep.has(i));
  const seen = new Set();
  while (queue.length) {
    const at = queue.shift();
    if (seen.has(at)) continue;
    seen.add(at);
    const t = b[at];
    const target = t.special === 'shears' ? (firstTarget.get(at) ?? commonestKind(b)) : null;
    fired.push({ at, special: t.special, kind: t.kind, target });
    for (const c of areaOf(b, at, t.special, target)) {
      if (keep.has(c) || cleared.has(c)) continue;
      cleared.add(c);
      if (b[c]?.special) queue.push(c);
    }
  }
  return fired;
}

/**
 * Play the swap a↔c and settle the board. Returns null for an illegal swap, else
 * { board, steps, gained } where steps are per-cascade animation records
 *   { cleared: [{ at, tile }], created: [{ at, tile }], fired: [...], fall: [{ id, from, to }], spawn: [{ at, tile }] }
 * and gained = { tiles: number[KINDS] cleared per kind, specials: { can, fert, shears } fired count }.
 */
export function play(board, a, c, rng) {
  if (!isValidSwap(board, a, c)) return null;
  let b = swapped(board, a, c);
  const steps = [];
  const gained = { tiles: new Array(KINDS).fill(0), specials: { can: 0, fert: 0, shears: 0 } };
  let first = true;
  for (let guard = 0; guard < 50; guard++) {
    const groups = findGroups(b);
    const cleared = new Set();
    const keep = new Set();
    const created = [];
    const firstTarget = new Map();
    if (first) {
      // Swapping a shears tile fires it on the other tile's kind (or the commonest kind for shears ↔ shears).
      for (const [s, o] of [[c, a], [a, c]]) {
        if (b[s].special !== 'shears') continue;
        firstTarget.set(s, b[o].kind >= 0 ? b[o].kind : commonestKind(b));
        cleared.add(s);
      }
    }
    for (const g of groups) {
      for (const cell of g.cells) cleared.add(cell);
      if (!g.special) continue;
      // New special sits where the player moved a tile (on the first step), else at the crossing / run middle.
      let at = g.crossing ?? g.cells[Math.floor(g.cells.length / 2)];
      if (first && g.cells.includes(c)) at = c;
      else if (first && g.cells.includes(a)) at = a;
      keep.add(at);
      const t = tile(g.special === 'shears' ? -1 : g.kind, g.special);
      created.push({ at, tile: t });
    }
    if (!cleared.size) break;
    const fired = clearWithChains(b, cleared, keep, firstTarget);
    const clearedTiles = [...cleared].filter((i) => !keep.has(i)).map((at) => ({ at, tile: b[at] }));
    for (const { tile: t } of clearedTiles) if (t.kind >= 0) gained.tiles[t.kind]++;
    for (const f of fired) gained.specials[f.special.startsWith('can') ? 'can' : f.special]++;
    for (const { at } of clearedTiles) b[at] = null;
    for (const { at, tile: t } of created) b[at] = t;
    const { fall, spawn } = gravity(b, rng);
    steps.push({ cleared: clearedTiles, created, fired, fall, spawn });
    first = false;
  }
  let shuffled = null;
  if (!validMoves(b).length) {
    b = shuffle(b, rng);
    shuffled = b.map((t) => t.id);
  }
  return { board: b, steps, gained, shuffled };
}

/** Drop tiles into holes (in place) and refill from the top. */
function gravity(b, rng) {
  const fall = [];
  const spawn = [];
  for (let x = 0; x < N; x++) {
    let write = N - 1;
    for (let y = N - 1; y >= 0; y--) {
      const t = b[idx(x, y)];
      if (!t) continue;
      if (write !== y) {
        b[idx(x, write)] = t;
        b[idx(x, y)] = null;
        fall.push({ id: t.id, from: idx(x, y), to: idx(x, write) });
      }
      write--;
    }
    for (let y = write; y >= 0; y--) {
      const t = randomTile(rng);
      b[idx(x, y)] = t;
      spawn.push({ at: idx(x, y), tile: t, above: write - y + 1 });
    }
  }
  return { fall, spawn };
}

/** Reshuffle tiles (keeping specials) until the board has no matches and at least one move. */
export function shuffle(b, rng) {
  for (let tries = 0; tries < 200; tries++) {
    const n = b.slice();
    for (let i = n.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [n[i], n[j]] = [n[j], n[i]];
    }
    if (!findRuns(n).length && validMoves(n).length) return n;
  }
  return generate(rng);
}

/** Best-scoring legal move (for the hint): prefers specials, then larger clears. */
export function hint(b) {
  let best = null;
  for (const [a, c] of validMoves(b)) {
    const s = swapped(b, a, c);
    const groups = findGroups(s);
    const score = groups.reduce((acc, g) => acc + g.cells.length + (g.special ? 10 : 0), 0) + (b[a].special || b[c].special ? 20 : 0);
    if (!best || score > best.score) best = { a, c, score };
  }
  return best && [best.a, best.c];
}
