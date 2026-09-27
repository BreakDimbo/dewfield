// Match-3 results → seeds and tools (docs/DESIGN.md §6). Seed points carry over between rounds.
import { MATCH3, SPECIES } from '../data.js';

/** Fold one move's `gained` into a running round tally. */
export function addGained(tally, gained) {
  return {
    tiles: tally.tiles.map((n, k) => n + gained.tiles[k]),
    specials: {
      can: tally.specials.can + gained.specials.can,
      fert: tally.specials.fert + gained.specials.fert,
      shears: tally.specials.shears + gained.specials.shears,
    },
  };
}

export const emptyTally = () => ({ tiles: SPECIES.map(() => 0), specials: { can: 0, fert: 0, shears: 0 } });

/**
 * Convert a round tally plus carried `seedPoints` into rewards for `addRewards` (farm.js):
 * { seeds: {id: n}, water, fert, shears, seedPoints: {id: carried remainder} }.
 */
export function roundRewards(tally, seedPoints) {
  const seeds = {};
  const carried = {};
  SPECIES.forEach((sp, k) => {
    const pts = (seedPoints[sp.id] ?? 0) + tally.tiles[k];
    seeds[sp.id] = Math.floor(pts / sp.seedPoints);
    carried[sp.id] = pts % sp.seedPoints;
  });
  const y = MATCH3.toolYield;
  return {
    seeds,
    water: tally.specials.can * y.can.water,
    fert: tally.specials.fert * y.fert.fert,
    shears: tally.specials.shears * y.shears.shears,
    seedPoints: carried,
  };
}
