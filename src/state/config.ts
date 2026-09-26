import { DEFAULT_TUNABLES, withTunables, type DeepPartial, type Tunables } from '@/core/config/tunables';

/** MVP profile (04 §5): bees on. */
let current: Tunables = DEFAULT_TUNABLES;

/** Tunables for the running build. Debug overrides apply from the next run on. */
export const gameCfg = (): Tunables => current;

export function overrideTunables(over: DeepPartial<Tunables>): void {
  current = withTunables(over, current);
}
