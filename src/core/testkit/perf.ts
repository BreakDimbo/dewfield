/**
 * Timing helpers for the perf-intent tests (P0-05 board generation, P1-08 preview).
 *
 * Wall-clock budgets are fragile when the suite runs in parallel workers or under V8 coverage, so:
 * - samples are process CPU time (`process.cpuUsage`, µs resolution), not wall time: a worker that is
 *   descheduled because the other workers (or the balance sims) saturate the cores is not charged for it;
 * - samples are split into rounds and the *best* round's quantile is asserted (a contended round is
 *   discarded, a genuinely slow implementation still fails every round);
 * - a short warm-up lets the JIT settle before anything is recorded;
 * - under coverage instrumentation the budget is scaled by COVERAGE_FACTOR (V8 block counters make
 *   hot loops several times slower; the budget still catches order-of-magnitude regressions).
 */

/** Documented slack for `vitest --coverage` (V8 instrumentation + all workers busy). */
export const COVERAGE_FACTOR = 5;

type WorkerState = { config?: { coverage?: { enabled?: boolean } } };

export function coverageActive(): boolean {
  if (process.env.VITEST_COVERAGE === '1' || process.env.VITEST_COVERAGE === 'true') return true;
  const w = (globalThis as { __vitest_worker__?: WorkerState }).__vitest_worker__;
  return w?.config?.coverage?.enabled === true;
}

/** Budget in ms, relaxed by COVERAGE_FACTOR when coverage is being collected. */
export function perfBudget(ms: number): number {
  return coverageActive() ? ms * COVERAGE_FACTOR : ms;
}

export function quantile(samples: readonly number[], q: number): number {
  const s = samples.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))]!;
}

/** Best (lowest) q-quantile over `rounds` equal slices of `samples`, in recording order. */
export function bestRoundQuantile(samples: readonly number[], rounds: number, q: number): number {
  const size = Math.floor(samples.length / rounds);
  let best = Infinity;
  for (let r = 0; r < rounds; r++) best = Math.min(best, quantile(samples.slice(r * size, (r + 1) * size), q));
  return best;
}

/** CPU time (user + system) spent in `fn`, in ms. */
export function timeMs(fn: () => void): number {
  const t0 = process.cpuUsage();
  fn();
  const d = process.cpuUsage(t0);
  return (d.user + d.system) / 1000;
}
