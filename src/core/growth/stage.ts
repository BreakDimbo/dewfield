import type { Yield } from '@/core/board/events';
import type { Stage } from '@/core/board/model';

export const STAGE_MAX: Stage = 2;

/** 02 §2.1 */
export function yieldOf(stage: Stage): Yield {
  return stage === 2 ? 'crop' : stage === 1 ? 'dewdrop' : 'none';
}

export const grown = (s: Stage, by = 1): Stage => Math.min(STAGE_MAX, s + by) as Stage;
