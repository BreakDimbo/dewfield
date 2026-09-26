import { fnv1a, mix32 } from '@/core/util/hash';
import { invariant } from '@/core/util/invariant';

/** sfc32 state: four uint32. Plain array so it survives JSON round-trips. */
export type RngState = readonly [number, number, number, number];

export function createRng(seed: number): RngState {
  let s: RngState = [0x9e3779b9, 0x243f6a88, 0xb7e15162, seed >>> 0];
  for (let i = 0; i < 12; i++) s = nextU32(s)[1];
  return s;
}

export function nextU32(s: RngState): [number, RngState] {
  let [a, b, c, d] = s;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return [t >>> 0, [a >>> 0, b >>> 0, c >>> 0, d >>> 0]];
}

const U32 = 0x1_0000_0000;

/** Uniform integer in [min, maxExclusive) by rejection sampling (no modulo bias). */
export function nextInt(s: RngState, min: number, maxExclusive: number): [number, RngState] {
  const range = maxExclusive - min;
  invariant(Number.isInteger(min) && Number.isInteger(range) && range > 0 && range <= U32, 'nextInt: bad range');
  const limit = U32 - (U32 % range);
  let state = s;
  for (;;) {
    const [u, next] = nextU32(state);
    state = next;
    if (u < limit) return [min + (u % range), state];
  }
}

/** Index drawn proportionally to non-negative integer weights. */
export function pickWeighted(s: RngState, weights: readonly number[]): [number, RngState] {
  let total = 0;
  for (const w of weights) {
    invariant(Number.isInteger(w) && w >= 0, 'pickWeighted: weights must be non-negative integers');
    total += w;
  }
  invariant(total > 0, 'pickWeighted: total weight must be positive');
  const [r, next] = nextInt(s, 0, total);
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (r < acc) return [i, next];
  }
  /* c8 ignore next */
  throw new Error('unreachable');
}

export function shuffle<T>(s: RngState, arr: readonly T[]): [T[], RngState] {
  const out = arr.slice();
  let state = s;
  for (let i = out.length - 1; i > 0; i--) {
    const [j, next] = nextInt(state, 0, i + 1);
    state = next;
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return [out, state];
}

export function deriveSeed(...parts: (number | string)[]): number {
  return mix32(fnv1a(parts.map((p) => `${typeof p === 'number' ? 'n' : 's'}${p}`).join('\u001f')));
}
