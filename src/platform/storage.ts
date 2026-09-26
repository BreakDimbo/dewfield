/** 03 §12 storage seam. Every localStorage call is guarded; failures surface as `false`/`null`. */
export interface StorageAdapter {
  readonly available: boolean;
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  keys(): string[];
}

export class MemoryAdapter implements StorageAdapter {
  readonly available = true;
  private m = new Map<string, string>();
  constructor(private readonly quota = Infinity) {}
  get(k: string) {
    return this.m.get(k) ?? null;
  }
  set(k: string, v: string) {
    if (v.length > this.quota) return false;
    this.m.set(k, v);
    return true;
  }
  remove(k: string) {
    this.m.delete(k);
  }
  keys() {
    return [...this.m.keys()];
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  readonly available: boolean;
  constructor() {
    this.available = (() => {
      try {
        const k = '__dewfield_probe__';
        localStorage.setItem(k, '1');
        localStorage.removeItem(k);
        return true;
      } catch {
        return false;
      }
    })();
  }
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  }
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  }
  remove(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* storage unavailable */
    }
  }
  keys() {
    try {
      return Object.keys(localStorage);
    } catch {
      return [];
    }
  }
}
