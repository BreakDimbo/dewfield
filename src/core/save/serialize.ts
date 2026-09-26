import type { HomesteadState } from '@/core/homestead/state';
import { migrate, CURRENT_SCHEMA_VERSION } from './migrations';
import { SaveFileSchema, type SaveFileV1 } from './schema';

export { CURRENT_SCHEMA_VERSION };

export type LoadResult = { ok: true; save: SaveFileV1 } | { ok: false; reason: 'empty' | 'json' | 'schema' | 'version' };

/** 02 §12.6 step 1–2: serialize and validate. Throws if the state itself violates the schema (a bug). */
export function serialize(home: HomesteadState, meta: { nowMs: number; build: string }): string {
  const file: SaveFileV1 = { schemaVersion: 1, savedAt: Math.max(0, Math.floor(meta.nowMs)), build: meta.build, homestead: home };
  return JSON.stringify(SaveFileSchema.parse(file));
}

/** 02 §12.5: parse → migrate → validate. */
export function deserialize(raw: string | null): LoadResult {
  if (raw === null || raw === '') return { ok: false, reason: 'empty' };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'json' };
  }
  const migrated = migrate(obj);
  if (!migrated.ok) return { ok: false, reason: 'version' };
  const parsed = SaveFileSchema.safeParse(migrated.value);
  return parsed.success ? { ok: true, save: parsed.data as SaveFileV1 } : { ok: false, reason: 'schema' };
}
