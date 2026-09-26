export const CURRENT_SCHEMA_VERSION = 1;

type Obj = Record<string, unknown>;

/**
 * 02 §12.7: entry n upgrades version n → n+1. Shipped migrations are never removed.
 * v0 was the pre-release prototype format: `wallet` was a bare number and the field was one ASCII string.
 */
export const migrations: Record<number, (s: Obj) => Obj> = {
  0: (s) => {
    const h = { ...(s.homestead as Obj) };
    if (typeof h.wallet === 'number') h.wallet = { dewdrop: h.wallet };
    const f = h.field as Obj | undefined;
    if (f && typeof f.ascii === 'string') h.field = { rows: f.ascii.split('\n').map((r) => r.trim()).filter(Boolean), uids: f.uids };
    if (!h.decor) h.decor = { owned: [] };
    return { ...s, build: typeof s.build === 'string' ? s.build : 'v0', homestead: h };
  },
};

export function migrate(
  obj: unknown,
  table: typeof migrations = migrations,
  target = CURRENT_SCHEMA_VERSION,
): { ok: true; value: unknown } | { ok: false } {
  if (typeof obj !== 'object' || obj === null) return { ok: false };
  let cur = obj as Record<string, unknown>;
  const v0 = cur.schemaVersion;
  if (typeof v0 !== 'number' || !Number.isInteger(v0) || v0 < 0 || v0 > target) return { ok: false };
  let v = v0;
  while (v < target) {
    const step = table[v];
    if (!step) return { ok: false };
    cur = step(cur);
    v = v + 1;
    cur = { ...cur, schemaVersion: v };
  }
  return { ok: true, value: cur };
}
