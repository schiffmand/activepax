import { unparseable } from './migrations';

/**
 * Storage adapters. Sync or async — the store awaits either.
 * load() returns null when nothing is stored, and `unparseable(rawText)` when something is stored
 * but can't be decoded (so it is backed up rather than silently overwritten).
 */
export interface PersistenceAdapter {
  load(key: string): unknown | Promise<unknown>;
  save(key: string, value: unknown): void | Promise<void>;
  remove?(key: string): void | Promise<void>;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory adapter (tests, previews, private mode fallback). */
export function memoryAdapter(initial: Record<string, unknown> = {}): PersistenceAdapter & { dump(): Record<string, unknown> } {
  const data = new Map<string, string>(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    load: (key) => {
      const v = data.get(key);
      if (v === undefined) return null;
      try {
        return JSON.parse(v);
      } catch {
        return unparseable(v);
      }
    },
    save: (key, value) => {
      data.set(key, JSON.stringify(value));
    },
    remove: (key) => {
      data.delete(key);
    },
    dump: () => Object.fromEntries([...data].map(([k, v]) => [k, JSON.parse(v)])),
  };
}

/**
 * localStorage adapter. Every access is guarded: storage can throw in private windows,
 * when quota is exceeded, or when site data is blocked — the app must keep working.
 */
export function localStorageAdapter(storage?: StorageLike): PersistenceAdapter {
  const get = (): StorageLike | null => {
    try {
      return storage ?? (globalThis as { localStorage?: StorageLike }).localStorage ?? null;
    } catch {
      return null;
    }
  };
  return {
    load(key) {
      let raw: string | null | undefined;
      try {
        raw = get()?.getItem(key);
      } catch {
        return null; // storage unavailable: behave as empty
      }
      if (raw === null || raw === undefined) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return unparseable(raw); // truncated/garbled write: report as corrupt, never as empty
      }
    },
    save(key, value) {
      try {
        get()?.setItem(key, JSON.stringify(value));
      } catch {
        /* quota / blocked: ignore */
      }
    },
    remove(key) {
      try {
        get()?.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
