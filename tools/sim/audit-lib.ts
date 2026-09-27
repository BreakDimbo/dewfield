import { COMMISSIONS } from '../../src/core/config/commissions';
import type { DeepPartial, Tunables } from '../../src/core/config/tunables';

/** `a.b=1,c.d=[1,2]` → nested partial (values parsed as JSON, else string). */
export function parseSet(s: string): DeepPartial<Tunables> {
  const out: Record<string, unknown> = {};
  for (const pair of s.split(/;/).filter(Boolean)) {
    const [path, raw] = pair.split('=') as [string, string];
    const keys = path.split('.');
    let o = out;
    keys.slice(0, -1).forEach((k) => (o = (o[k] ??= {}) as Record<string, unknown>));
    let v: unknown = raw;
    try {
      v = JSON.parse(raw);
    } catch {
      /* string */
    }
    o[keys[keys.length - 1]!] = v;
  }
  return out as DeepPartial<Tunables>;
}

/** 02 §5.7 bands: [no-care lo, hi], [care lo, hi]. */
export const BANDS: Record<1 | 2 | 3, { none: [number, number]; care: [number, number] }> = {
  1: { none: [0.9, 1], care: [0.95, 1] },
  2: { none: [0.75, 0.85], care: [0.85, 0.95] },
  3: { none: [0.6, 0.75], care: [0.75, 0.9] },
};

/** `--def T2=15,C06=22:blueberry*20,C05=:eggplant*11+tomato*8` overrides moves and/or items in memory (tuning only). */
export function applyDefs(spec: string): void {
  for (const entry of spec.split(',').filter(Boolean)) {
    const [id, rest] = entry.split('=') as [string, string];
    const def = COMMISSIONS.find((d) => d.id === id) as { moves: number; items: { crop: string; count: number }[] } | undefined;
    if (!def) throw new Error(`unknown commission ${id}`);
    const [moves, items] = rest.split(':');
    if (moves) def.moves = Number(moves);
    if (items)
      def.items = items.split('+').map((it) => {
        const [crop, n] = it.split('*') as [string, string];
        return { crop, count: Number(n) };
      });
  }
}
