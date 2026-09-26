import type { HomesteadState } from '@/core/homestead/state';
import { deserialize, serialize } from '@/core/save/serialize';
import { now } from '@/platform/clock';
import { parseSettings, SettingsSchema, type SettingsV1 } from '@/core/save/settings';
import { LocalStorageAdapter, MemoryAdapter, type StorageAdapter } from '@/platform/storage';

export const KEYS = {
  main: 'dewfield:save:v1',
  backup: 'dewfield:save:v1:bak',
  corrupt: (ts: number) => `dewfield:save:corrupt:${ts}`,
  settings: 'dewfield:settings',
} as const;

export type LoadOutcome =
  | { kind: 'none' }
  | { kind: 'loaded'; home: HomesteadState; from: 'main' | 'backup' }
  | { kind: 'corrupt'; corruptKey: string };

let storage: StorageAdapter | null = null;
let memoryFallback = false;
let writes = 0;
let build = 'dev';
let locked = false;

export const persistence = {
  /** Tests inject a MemoryAdapter; the app lazily picks localStorage. */
  use(adapter: StorageAdapter, buildId = build): void {
    storage = adapter;
    memoryFallback = false;
    build = buildId;
    writes = 0;
    locked = false;
  },
  setBuild(id: string): void {
    build = id;
  },
  /** Another tab owns the save (02 §12.8): stop every write. */
  lock(): void {
    locked = true;
  },
  get locked(): boolean {
    return locked;
  },
  get adapter(): StorageAdapter {
    if (!storage) {
      const ls = new LocalStorageAdapter();
      storage = ls.available ? ls : new MemoryAdapter();
      memoryFallback = !ls.available;
    }
    return storage;
  },
  get usingMemory(): boolean {
    return memoryFallback;
  },
  get writeCount(): number {
    return writes;
  },
  mainIsCorrupt(): boolean {
    const raw = persistence.adapter.get(KEYS.main);
    return raw !== null && !deserialize(raw).ok;
  },
  hasSave(): boolean {
    const a = persistence.adapter;
    return deserialize(a.get(KEYS.main)).ok || deserialize(a.get(KEYS.backup)).ok;
  },

  /** 02 §12.5 */
  load(): LoadOutcome {
    const a = persistence.adapter;
    const rawMain = a.get(KEYS.main);
    const main = deserialize(rawMain);
    if (main.ok) return { kind: 'loaded', home: main.save.homestead as HomesteadState, from: 'main' };
    const bak = deserialize(a.get(KEYS.backup));
    if (bak.ok) return { kind: 'loaded', home: bak.save.homestead as HomesteadState, from: 'backup' };
    if (rawMain === null) return { kind: 'none' };
    const key = KEYS.corrupt(now());
    a.set(key, rawMain);
    a.remove(KEYS.main);
    return { kind: 'corrupt', corruptKey: key };
  },

  /** 02 §12.6: validate → copy main to backup → write main; fall back to memory on failure. */
  save(home: HomesteadState): { ok: boolean; fellBack: boolean } {
    if (locked) return { ok: false, fellBack: false };
    const text = serialize(home, { nowMs: now(), build });
    const a = persistence.adapter;
    const prev = a.get(KEYS.main);
    if (prev !== null) a.set(KEYS.backup, prev);
    writes++;
    if (a.set(KEYS.main, text)) return { ok: true, fellBack: false };
    const mem = new MemoryAdapter();
    if (prev !== null) mem.set(KEYS.backup, prev);
    mem.set(KEYS.main, text);
    storage = mem;
    memoryFallback = true;
    return { ok: false, fellBack: true };
  },

  /** Reset save (P2-08): settings and corrupt copies survive. */
  clear(): void {
    const a = persistence.adapter;
    a.remove(KEYS.main);
    a.remove(KEYS.backup);
  },

  loadSettings(): SettingsV1 {
    return parseSettings(persistence.adapter.get(KEYS.settings));
  },
  saveSettings(s: SettingsV1): void {
    if (locked) return;
    persistence.adapter.set(KEYS.settings, JSON.stringify(SettingsSchema.parse(s)));
  },

  /** Raw strings of every save that could not be read, for export from the settings panel. */
  corruptSaves(): { key: string; raw: string }[] {
    const a = persistence.adapter;
    return a
      .keys()
      .filter((k) => k.startsWith('dewfield:save:corrupt:'))
      .sort()
      .map((key) => ({ key, raw: a.get(key) ?? '' }));
  },
};
