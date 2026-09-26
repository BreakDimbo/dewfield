/** 02 §12.8 multi-tab lock: the newest tab owns the save; others lock themselves and stop writing. */
export const LOCK_KEY = 'dewfield:lock';
export const SAVE_KEY = 'dewfield:save:v1';

export interface TabLockDeps {
  now(): number;
  write(key: string, value: string): void;
  listen(fn: (e: { key: string | null; newValue: string | null }) => void): () => void;
}

export function createTabLock(tabId: string, deps: TabLockDeps, onLocked: () => void) {
  let locked = false;
  deps.write(LOCK_KEY, JSON.stringify({ tabId, ts: deps.now() }));
  const off = deps.listen((e) => {
    if (locked) return;
    if (e.key === SAVE_KEY || (e.key === LOCK_KEY && e.newValue && !e.newValue.includes(`"tabId":"${tabId}"`))) {
      locked = true;
      onLocked();
    }
  });
  return {
    get locked() {
      return locked;
    },
    dispose: off,
  };
}

export function browserTabLockDeps(now: () => number): TabLockDeps {
  return {
    now,
    write: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage unavailable: nothing to protect */
      }
    },
    listen: (fn) => {
      const h = (e: StorageEvent) => fn({ key: e.key, newValue: e.newValue });
      window.addEventListener('storage', h);
      return () => window.removeEventListener('storage', h);
    },
  };
}
