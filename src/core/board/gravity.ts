import type { BoardEvent } from './events';
import { H, W, posOf } from './model';
import type { Grid } from './specials';

/** 02 §1.7: compact each column toward +y, keeping order. Mutates g. */
export function applyGravity(g: Grid): BoardEvent & { t: 'fall' } {
  const items: { uid: number; from: ReturnType<typeof posOf>; to: ReturnType<typeof posOf> }[] = [];
  for (let x = 0; x < W; x++) {
    let write = H - 1;
    for (let y = H - 1; y >= 0; y--) {
      const i = y * W + x;
      const t = g[i];
      if (!t) continue;
      if (y !== write) {
        const j = write * W + x;
        g[j] = t;
        g[i] = null;
        items.push({ uid: t.uid, from: posOf(i), to: posOf(j) });
      }
      write--;
    }
  }
  items.sort((p, q) => p.to.y * W + p.to.x - (q.to.y * W + q.to.x));
  return { t: 'fall', items };
}
