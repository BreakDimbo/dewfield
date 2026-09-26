import { directedMoves, pickHint } from '../../src/core/board/hint';
import type { Move } from '../../src/core/board/model';
import type { Tunables } from '../../src/core/config/tunables';
import { nextInt, type RngState } from '../../src/core/rng/rng';
import type { RunState } from '../../src/core/run/state';

export type BotId = 'random' | 'greedy';

/** 02 §15.2. The random bot owns its RNG so the game RNG stays untouched. */
export function chooseMove(bot: BotId, run: RunState, cfg: Tunables, rng: RngState): [Move | null, RngState] {
  if (bot === 'greedy') return [pickHint(run, cfg)?.move ?? null, rng];
  const moves = directedMoves(run);
  if (moves.length === 0) return [null, rng];
  const [k, next] = nextInt(rng, 0, moves.length);
  return [moves[k]!, next];
}
