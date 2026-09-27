// Serializable seeded RNG (mulberry32). The state is one uint32, so it lives in the save file.

/** Next float in [0, 1) and the next state. */
export function nextRandom(state) {
  let a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a >>> 0];
}

/** Mutable wrapper for code that draws many numbers; read `.state` back when done. */
export function makeRng(seed) {
  const r = {
    state: seed >>> 0,
    next() {
      const [v, s] = nextRandom(r.state);
      r.state = s;
      return v;
    },
    int(n) {
      return Math.floor(r.next() * n);
    },
    /** Index picked with integer weights. */
    weighted(weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let x = r.next() * total;
      for (let i = 0; i < weights.length; i++) {
        x -= weights[i];
        if (x < 0) return i;
      }
      return weights.length - 1;
    },
  };
  return r;
}
