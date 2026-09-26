import type { GrowItem } from '@/core/board/events';
import { N, isCrop, neighborIdx, posOf, type Tile } from '@/core/board/model';
import type { Tunables } from '@/core/config/tunables';
import { grown } from './stage';

export interface GrowthPlan {
  dewRing: GrowItem[];
  neighbor: GrowItem[];
}

/**
 * 02 §1.6 step 4.8 / §2.3. Candidates = neighbours of match-group cells ∪ dew rings,
 * minus harvested cells and new special positions. Each cell grows at most +1; ring wins attribution.
 * Mutates g.
 */
export function applyStepGrowth(
  g: (Tile | null)[],
  groupCells: readonly number[],
  ringMask: readonly boolean[],
  inH: readonly boolean[],
  created: readonly number[],
  cfg: Tunables,
): GrowthPlan {
  const nb = new Array<boolean>(N).fill(false);
  for (const c of groupCells) for (const n of neighborIdx(c)) nb[n] = true;
  const dewRing: GrowItem[] = [];
  const neighbor: GrowItem[] = [];
  const mode = cfg.growth.neighborRipen;
  for (let i = 0; i < N; i++) {
    if (inH[i] || created.includes(i)) continue;
    const t = g[i];
    if (!isCrop(t) || t.stage >= 2) continue;
    let list: GrowItem[] | null = null;
    if (ringMask[i]) list = dewRing;
    else if (nb[i] && (mode === 'all' || (mode === 'sproutOnly' && t.stage === 0))) list = neighbor;
    if (!list) continue;
    const to = grown(t.stage);
    list.push({ pos: posOf(i), uid: t.uid, from: t.stage, to });
    g[i] = { ...t, stage: to };
  }
  return { dewRing, neighbor };
}
