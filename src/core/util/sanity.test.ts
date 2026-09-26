import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

describe('test infrastructure', () => {
  it('fast-check runs reproducibly with a fixed seed', () => {
    const sample = () => fc.sample(fc.integer({ min: 0, max: 1000 }), { seed: 42, numRuns: 5 });
    expect(sample()).toEqual(sample());
  });

  it('property: integer addition commutes', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { seed: 20260926, numRuns: 200 },
    );
  });
});
