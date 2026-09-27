// Game data — species, tools, clock and match-3 constants (docs/DESIGN.md §3–§6).
// Pure data: imported by the logic in src/game/*, the world modules and the UI.

/** Plot stages. 0 = grass, 1 = tilled, 2 = seed in the ground, 3..6 = sprout, sapling, young tree, mature. */
export const STAGE = { EMPTY: 0, TILLED: 1, SEED: 2, SPROUT: 3, SAPLING: 4, YOUNG: 5, MATURE: 6 };
export const STAGE_NAMES = ['空地', '松过的土', '种子', '芽', '苗木', '小树', '成树'];

/**
 * days[i] = watered nights needed to go from stage (SEED + i) to (SEED + i + 1).
 * weight = match-3 tile frequency; seedPoints = cleared tiles per seed.
 */
export const SPECIES = [
  { id: 'sakura', name: '樱', kana: 'さくら', produce: '樱花瓣', days: [1, 2, 2, 3], weight: 4, seedPoints: 6, color: '#f2b5c8' },
  { id: 'ume', name: '梅', kana: 'うめ', produce: '青梅', days: [1, 2, 2, 2], weight: 4, seedPoints: 6, color: '#f6f1f2' },
  { id: 'momiji', name: '红叶', kana: 'もみじ', produce: '红叶', days: [1, 2, 3, 3], weight: 4, seedPoints: 6, color: '#d9485a' },
  { id: 'kaki', name: '柿', kana: 'かき', produce: '柿', days: [1, 2, 3, 3], weight: 3, seedPoints: 8, color: '#f29a5c' },
  { id: 'mikan', name: '蜜柑', kana: 'みかん', produce: '蜜柑', days: [1, 2, 3, 4], weight: 3, seedPoints: 8, color: '#f2c230' },
  { id: 'matsu', name: '松', kana: 'まつ', produce: '松果', days: [1, 3, 3, 4], weight: 2, seedPoints: 10, color: '#5f8a58', needsPruning: true },
];
export const SPECIES_IDS = SPECIES.map((s) => s.id);
export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/** Hotbar (1–6). `consumes` names the inventory counter a use spends. */
export const TOOLS = [
  { id: 'hoe', name: '锄头', slot: 1 },
  { id: 'seeds', name: '种子袋', slot: 2 },
  { id: 'can', name: '水壶', slot: 3, consumes: 'water' },
  { id: 'fert', name: '肥料', slot: 4, consumes: 'fert' },
  { id: 'shears', name: '剪刀', slot: 5, consumes: 'shears' },
  { id: 'basket', name: '篮子', slot: 6 },
];

export const FARM_RULES = {
  plots: 8,
  /** A mature tree bears produce every `produceEvery` days (the night before must be watered). */
  produceEvery: 2,
  /** Chance that a morning is rainy (waters every planted plot). */
  rainChance: 0.2,
  ticketsPerDay: 3,
  /** Produce traded at the seed stall for one extra match-3 ticket. */
  producePerTicket: 3,
};

export const CLOCK = {
  dayStart: 6 * 60, // 06:00
  dayEnd: 24 * 60, // 24:00 → forced sleep
  sleepFrom: 17 * 60, // the shed lets you sleep from 17:00
  /** Game minutes per real second (≈ 12 real minutes per day). */
  minutesPerSecond: 1.5,
};

export const MATCH3 = {
  size: 7,
  moves: 15,
  /** Tools granted when a special tile fires. */
  toolYield: { can: { water: 2 }, fert: { fert: 1 }, shears: { shears: 1 } },
};

export const START_INVENTORY = {
  seeds: { sakura: 2, ume: 1, momiji: 0, kaki: 0, mikan: 0, matsu: 0 },
  water: 4,
  fert: 0,
  shears: 0,
  produce: { sakura: 0, ume: 0, momiji: 0, kaki: 0, mikan: 0, matsu: 0 },
};
