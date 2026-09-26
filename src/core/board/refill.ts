import { CROP_IDS, type CropId } from '@/core/config/crops';
import type { Tunables } from '@/core/config/tunables';
import { pickWeighted, type RngState } from '@/core/rng/rng';
import { printToken, tileFromToken } from './ascii';
import type { BoardEvent } from './events';
import { H, W, posOf, type Stage } from './model';
import type { Grid } from './specials';

export interface RefillCtx {
  rng: RngState;
  uid: number;
  queue: string[];
  /** Crops the order still needs (02 §1.7 orderBias). */
  needs: (crop: CropId) => boolean;
}

export const toPermille = (w: readonly number[]): number[] => w.map((v) => Math.round(v * 1000));

export function cropWeights(cfg: Tunables, needs: (c: CropId) => boolean): number[] {
  const bias = Math.round(1000 * cfg.spawn.orderBias);
  return CROP_IDS.map((c) => 1000 + (needs(c) ? bias : 0));
}

/** Draw crop then stage. Random refills never carry a special. */
export function randomToken(rng: RngState, cropW: readonly number[], stageW: readonly number[]): [string, RngState] {
  const [ci, r1] = pickWeighted(rng, cropW);
  const [si, r2] = pickWeighted(r1, stageW);
  return [printToken({ kind: 'crop', crop: CROP_IDS[ci]!, stage: si as Stage, special: null }), r2];
}

/** 02 §1.7: columns left→right, each filled from its lowest hole upward. Mutates g and ctx. */
export function refill(g: Grid, ctx: RefillCtx, cfg: Tunables): BoardEvent & { t: 'spawn' } {
  const items: { uid: number; pos: ReturnType<typeof posOf>; token: string; entryOffset: number }[] = [];
  const stageW = toPermille(cfg.spawn.stageWeights);
  for (let x = 0; x < W; x++) {
    let k = 0;
    while (k < H && !g[k * W + x]) k++;
    for (let y = k - 1; y >= 0; y--) {
      let token: string;
      if (ctx.queue.length > 0) token = ctx.queue.shift()!;
      else {
        const [tok, next] = randomToken(ctx.rng, cropWeights(cfg, ctx.needs), stageW);
        token = tok;
        ctx.rng = next;
      }
      const i = y * W + x;
      g[i] = tileFromToken(token, ctx.uid++);
      items.push({ uid: g[i]!.uid, pos: posOf(i), token, entryOffset: k });
    }
  }
  items.sort((p, q) => p.pos.y * W + p.pos.x - (q.pos.y * W + q.pos.x));
  return { t: 'spawn', items };
}
