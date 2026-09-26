export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInQuad = (t: number) => t * t;
export const easeOutQuad = (t: number) => 1 - (1 - t) * (1 - t);

/** Overshooting ease — the "spring" feel; `k` ≈ overshoot. */
export const easeOutBack = (t: number, k = 1.70158) => 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2;

/** Damped spring settle from 0 to 1 (critically-ish damped, one soft overshoot). */
export const springOut = (t: number, zeta = 0.48, omega = 11) => {
  if (t >= 1) return 1;
  const wd = omega * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + ((zeta * omega) / wd) * Math.sin(wd * t));
};

/** Falls with gravity, then a small landing hop. */
export const fallBounce = (t: number) => {
  const land = 0.82;
  if (t < land) return easeInQuad(t / land);
  const u = (t - land) / (1 - land);
  return 1 - 0.06 * Math.sin(Math.PI * u);
};

/** 0 → peak → 0 hump. */
export const hump = (t: number) => Math.sin(Math.PI * clamp01(t));
