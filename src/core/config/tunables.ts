/** 02 §14 — the single source of every tunable default. Keep in sync with the doc table. */
export interface Tunables {
  board: { width: 7; height: 7; minValidMoves: number; shuffleMaxAttempts: number };
  spawn: { stageWeights: readonly [number, number, number]; orderBias: number };
  growth: {
    neighborRipen: 'all' | 'sproutOnly' | 'off';
    maxPerStep: 1;
    createdSpecialStage: 1 | 2;
  };
  special: {
    sickleOrientation: 'parallel' | 'perpendicular';
    beeEnabled: boolean;
    dewOrbRadius: 1;
    dewOrbRingRadius: 2;
  };
  commission: { movesByTier: { 1: number; 2: number; 3: number }; maxItems: 1 | 2 };
  stars: { thresholds: readonly [number, number] };
  undo: { perRun: number };
  hint: { idleMs: number };
  rush: { maxConversions: number; maxIterations: number };
  economy: {
    unripeDewdrop: number;
    surplusPrice: number;
    baseReward: { 1: number; 2: number; 3: number };
    starBonus: number;
    tutorialMoveBonus: number;
  };
  care: { pointsBase: number; waterOncePerRowPerDay: boolean; beePerDay: number };
  overnight: { growth: number };
  terrace: { levelThresholds: readonly [number, number] };
  tutorial: { autoCompleteAfterFails: number };
  input: { dragThresholdCell: number; dragThresholdPx: number };
  anim: {
    swap: number;
    swapRejected: number;
    matchFlash: number;
    harvestPop: number;
    yieldFly: number;
    grow: number;
    growStagger: number;
    fallPerCell: number;
    fallColumnStagger: number;
    spawnPop: number;
    cascadeGap: number;
    specialTelegraph: number;
    chainDelay: number;
    sickleSweep: number;
    dewBurst: number;
    beeFlight: number;
    rushConvertStagger: number;
    cameraTransition: number;
    hudCrossfade: number;
    nightFade: number;
    morningReveal: number;
    undoRewind: number;
    fastForwardScale: number;
    rushTimeScale: number;
    reducedMotionScale: number;
  };
  render: { dprMax: number; particlesMax: number };
  audio: { cascadeMaxSteps: number };
}

export const DEFAULT_TUNABLES: Tunables = {
  board: { width: 7, height: 7, minValidMoves: 3, shuffleMaxAttempts: 50 },
  spawn: { stageWeights: [0.7, 0.3, 0.0], orderBias: 0.1 },
  growth: { neighborRipen: 'all', maxPerStep: 1, createdSpecialStage: 2 },
  special: { sickleOrientation: 'parallel', beeEnabled: true, dewOrbRadius: 1, dewOrbRingRadius: 2 },
  commission: { movesByTier: { 1: 24, 2: 22, 3: 20 }, maxItems: 2 },
  stars: { thresholds: [0.2, 0.4] },
  undo: { perRun: 1 },
  hint: { idleMs: 8000 },
  rush: { maxConversions: 12, maxIterations: 30 },
  economy: {
    unripeDewdrop: 1,
    surplusPrice: 2,
    baseReward: { 1: 40, 2: 50, 3: 60 },
    starBonus: 10,
    tutorialMoveBonus: 5,
  },
  care: { pointsBase: 5, waterOncePerRowPerDay: true, beePerDay: 1 },
  overnight: { growth: 1 },
  terrace: { levelThresholds: [3, 6] },
  tutorial: { autoCompleteAfterFails: 2 },
  input: { dragThresholdCell: 0.35, dragThresholdPx: 12 },
  anim: {
    swap: 140,
    swapRejected: 180,
    matchFlash: 80,
    harvestPop: 180,
    yieldFly: 400,
    grow: 160,
    growStagger: 20,
    fallPerCell: 55,
    fallColumnStagger: 15,
    spawnPop: 160,
    cascadeGap: 70,
    specialTelegraph: 120,
    chainDelay: 90,
    sickleSweep: 320,
    dewBurst: 380,
    beeFlight: 600,
    rushConvertStagger: 80,
    cameraTransition: 1200,
    hudCrossfade: 300,
    nightFade: 1500,
    morningReveal: 2500,
    undoRewind: 300,
    fastForwardScale: 3,
    rushTimeScale: 1.5,
    reducedMotionScale: 1.5,
  },
  render: { dprMax: 2, particlesMax: 300 },
  audio: { cascadeMaxSteps: 8 },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function merge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(over)) out[k] = merge(base[k], over[k]);
  return out;
}

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const child of Object.values(v)) deepFreeze(child);
  }
  return v;
}

/** Deep-merged, deep-frozen copy; arrays are replaced wholesale. */
export function withTunables(overrides: DeepPartial<Tunables> = {}, base: Tunables = DEFAULT_TUNABLES): Tunables {
  return deepFreeze(merge(structuredClone(base), structuredClone(overrides)) as Tunables);
}

/** Tunables used by the build for the current milestone (04 §4: VS runs with bees off). */
export const VS_TUNABLES: Tunables = withTunables({ special: { beeEnabled: false } });
