/**
 * Small per-process TTL cache for expensive per-user reads.
 *
 * Deliberately not a stale-while-revalidate: a cached day view that hides a
 * booking the user just made is worse than a slow one, so writers invalidate
 * their user's entries explicitly.
 */

export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  /** Drop one key. */
  delete(key: string): void;
  /** Drop every key starting with the prefix, e.g. a user id. */
  invalidatePrefix(prefix: string): void;
  clear(): void;
  size(): number;
};

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const store = new Map<string, { at: number; value: T }>();
  const fresh = (entry: { at: number } | undefined): boolean =>
    Boolean(entry) && Date.now() - entry!.at < ttlMs;

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (!fresh(entry)) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      store.set(key, { at: Date.now(), value });
      // Opportunistic sweep: these caches are keyed per user and day, so
      // yesterday's entries would otherwise sit around until restart.
      if (store.size > 64) {
        for (const [k, entry] of store) {
          if (!fresh(entry)) store.delete(k);
        }
      }
    },
    delete(key) {
      store.delete(key);
    },
    invalidatePrefix(prefix) {
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) store.delete(key);
      }
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
