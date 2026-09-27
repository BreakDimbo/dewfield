import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed, nextInt, nextU32, pickWeighted, shuffle, type RngState } from './rng';

function take(s: RngState, n: number): number[] {
  const out: number[] = [];
  let st = s;
  for (let i = 0; i < n; i++) {
    const [v, next] = nextU32(st);
    out.push(v);
    st = next;
  }
  return out;
}

describe('core/rng', () => {
  it('matches golden sfc32 output for seed 1', () => {
    expect(take(createRng(1), 10)).toMatchInlineSnapshot(`
      [
        24724473,
        838574162,
        2522700496,
        473542192,
        3964317691,
        2295682031,
        2113742504,
        3256742822,
        2257891190,
        1798902692,
      ]
    `);
  });

  it('does not mutate input and round-trips through JSON', () => {
    const s = createRng(99);
    const copy = [...s];
    nextU32(s);
    nextInt(s, 0, 10);
    expect([...s]).toEqual(copy);
    const revived = JSON.parse(JSON.stringify(s)) as RngState;
    expect(take(revived, 5)).toEqual(take(s, 5));
    expect(s.every((v) => Number.isInteger(v) && v >= 0 && v < 2 ** 32)).toBe(true);
  });

  it('nextInt(0,5) is uniform within 1% over 100k draws', () => {
    const buckets = [0, 0, 0, 0, 0];
    let s = createRng(7);
    const N = 100_000;
    for (let i = 0; i < N; i++) {
      const [v, next] = nextInt(s, 0, 5);
      buckets[v]!++;
      s = next;
    }
    for (const b of buckets) expect(Math.abs(b / N - 0.2)).toBeLessThan(0.01);
  });

  it('nextInt respects min offset and rejects bad ranges', () => {
    const [v] = nextInt(createRng(3), 10, 11);
    expect(v).toBe(10);
    expect(() => nextInt(createRng(3), 5, 5)).toThrow();
    expect(() => nextInt(createRng(3), 0, 1.5)).toThrow();
  });

  it('pickWeighted follows weights and validates input', () => {
    let s = createRng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) {
      const [v, next] = pickWeighted(s, [1, 0, 3]);
      counts[v]!++;
      s = next;
    }
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[2]! / 30_000 - 0.75)).toBeLessThan(0.01);
    expect(() => pickWeighted(s, [1, -1])).toThrow();
    expect(() => pickWeighted(s, [0.5, 1])).toThrow();
    expect(() => pickWeighted(s, [0, 0])).toThrow();
  });

  it('shuffle is a deterministic permutation', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const [a] = shuffle(createRng(5), arr);
    const [b] = shuffle(createRng(5), arr);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(arr);
    expect(arr).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('deriveSeed is stable and sensitive to every part', () => {
    expect(deriveSeed(123, 'day', 4)).toBe(deriveSeed(123, 'day', 4));
    expect(deriveSeed(123, 'day', 4)).not.toBe(deriveSeed(123, 'day', 5));
    expect(deriveSeed(1, '2')).not.toBe(deriveSeed('1', 2));
    expect(deriveSeed(0)).toBeGreaterThanOrEqual(0);
  });
});
