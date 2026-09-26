/** 03 §13 degradation ladder: DPR 2 → 1.5 → 1, then halve particles. Pure so the flip-flop limit is testable. */
export interface QualityState {
  level: number;
  flips: number;
  locked: boolean;
}
export interface QualityTier {
  dpr: number;
  particleScale: number;
}

export const LADDER: readonly QualityTier[] = [
  { dpr: 2, particleScale: 1 },
  { dpr: 1.5, particleScale: 1 },
  { dpr: 1, particleScale: 1 },
  { dpr: 1, particleScale: 0.5 },
];

export const QUALITY_START: QualityState = { level: 0, flips: 0, locked: false };
export const MAX_FLIPS = 4;

export function qualityStep(s: QualityState, e: 'decline' | 'incline'): QualityState {
  if (s.locked) return s;
  const level = e === 'decline' ? Math.min(LADDER.length - 1, s.level + 1) : Math.max(0, s.level - 1);
  if (level === s.level) return s;
  const flips = s.flips + 1;
  return { level, flips, locked: flips >= MAX_FLIPS };
}

/** Settings override (P2-16): high = top tier, low = bottom tier, auto = the monitor's current step. */
export function effectiveTier(setting: 'auto' | 'high' | 'low', s: QualityState, dprMax: number): QualityTier {
  const t = setting === 'high' ? LADDER[0]! : setting === 'low' ? LADDER[LADDER.length - 1]! : LADDER[s.level]!;
  return { dpr: Math.min(dprMax, t.dpr), particleScale: t.particleScale };
}
