import { describe, expect, it } from 'vitest';
import v0 from '../../tests/fixtures/saves/v0.json';
import { deserialize } from '@/core/save/serialize';
import { DEFAULT_SETTINGS_V1 } from '@/core/save/settings';
import { DEFAULT_TUNABLES } from '@/core/config/tunables';
import { newHomestead } from '@/core/homestead/homestead';
import { MemoryAdapter } from '@/platform/storage';
import { createTabLock, LOCK_KEY, SAVE_KEY } from '@/platform/tabLock';
import { KEYS, persistence } from './persistence';

describe('save robustness (P2-08)', () => {
  it('migrates the v0 fixture step by step and passes zod', () => {
    const r = deserialize(JSON.stringify(v0));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.save.schemaVersion).toBe(1);
      expect(r.save.homestead.wallet).toEqual({ dewdrop: 180 });
      expect(r.save.homestead.field.rows).toHaveLength(7);
      expect(r.save.homestead.commissions.active?.delivered.blueberry).toBe(5);
    }
  });

  it('another tab writing locks this one and stops writes', () => {
    const listeners: ((e: { key: string | null; newValue: string | null }) => void)[] = [];
    const store = new Map<string, string>();
    let lockedCalls = 0;
    const lock = createTabLock('me', { now: () => 1, write: (k, v) => store.set(k, v), listen: (fn) => (listeners.push(fn), () => {}) }, () => lockedCalls++);
    expect(JSON.parse(store.get(LOCK_KEY)!)).toEqual({ tabId: 'me', ts: 1 });
    listeners[0]!({ key: LOCK_KEY, newValue: JSON.stringify({ tabId: 'me', ts: 2 }) });
    expect(lock.locked).toBe(false);
    listeners[0]!({ key: SAVE_KEY, newValue: '{}' });
    expect(lock.locked).toBe(true);
    listeners[0]!({ key: SAVE_KEY, newValue: '{}' });
    expect(lockedCalls).toBe(1);

    persistence.use(new MemoryAdapter(), 't');
    persistence.lock();
    expect(persistence.save(newHomestead(1, DEFAULT_TUNABLES))).toEqual({ ok: false, fellBack: false });
    expect(persistence.hasSave()).toBe(false);
  });

  it('reset keeps settings; corrupt saves stay exportable', () => {
    const mem = new MemoryAdapter();
    persistence.use(mem, 't');
    persistence.saveSettings({ ...DEFAULT_SETTINGS_V1, reducedMotion: true });
    persistence.save(newHomestead(1, DEFAULT_TUNABLES));
    mem.set(KEYS.main, 'garbage');
    mem.set(KEYS.backup, 'garbage');
    expect(persistence.load().kind).toBe('corrupt');
    persistence.clear();
    expect(persistence.hasSave()).toBe(false);
    expect(persistence.loadSettings().reducedMotion).toBe(true);
    expect(persistence.corruptSaves().map((c) => c.raw)).toEqual(['garbage']);
    mem.set(KEYS.settings, '{"bad":1}');
    expect(persistence.loadSettings()).toEqual(DEFAULT_SETTINGS_V1);
  });
});
