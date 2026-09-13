import type { SolveResponse } from "../types/greenhouse";

/**
 * The solve cache: memory in front, localStorage behind.
 *
 * A greenhouse solve costs on the order of a second, and the player spends
 * that second staring at a spinner for a layout the app may well have worked
 * out five minutes ago. Both layers exist to make the repeat instant: the map
 * for this page life, the stored copy so that a reload, a tab, or tomorrow
 * still counts as a repeat.
 *
 * ---------------------------------------------------------------------------
 * What this file is allowed to do to localStorage
 * ---------------------------------------------------------------------------
 *
 * `localStorage` is shared, and almost everything in it belongs to somebody
 * else. `skyshards-*` is the calculator and the designer, `skydex.greenhouse.*`
 * is the greenhouse's own settings, `wizardsky.planner.*` is the planner's saved
 * progress, and there are unprefixed legacy keys older than any of it. A
 * "Reset Everything" button in this project once reached for `localStorage.clear()`
 * and destroyed real work that had nothing to do with the button (see
 * `utilities/localStorage.ts` and `planner/usePlannerState.ts`).
 *
 * So this module never calls `clear()`, never enumerates keys, and never removes
 * anything it did not write. That is not left to discipline: the `Storage`
 * interface below is narrowed to the three methods this file legitimately needs,
 * so `clear()` and `key()` are not reachable from here even by accident, and a
 * test pins that they are never called.
 *
 * Everything stored is DERIVED - a layout the solver can produce again from
 * inputs the player still has. Nothing the player typed lives under this key,
 * which is what makes every "just drop it" branch below safe.
 */

/**
 * The three methods a derived cache is entitled to.
 *
 * Deliberately narrower than the DOM `Storage` type. `clear` and `key` are
 * absent because reaching for either from a cache is the bug this project has
 * already paid for once.
 */
export interface NarrowStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CacheEntry {
  /** The canonical request string, re-checked on read so a hash collision reads as a miss. */
  request: string;
  /** What the dataset said when this was solved. */
  fingerprint: string;
  response: SolveResponse;
  /** When this entry was last useful. Ordering only; never shown to anyone. */
  at: number;
}

interface Persisted {
  entries: [string, CacheEntry][];
}

/**
 * The key carries the version, and a bump is a drop.
 *
 * Same shape as `items/materialChain.ts`. When the stored form changes, or when
 * a solver change makes old layouts untrustworthy, bump `.v1` to `.v2` and move
 * the old name into `STALE_KEYS`. Readers of the new key find nothing, solve
 * once, and refill it. That is safe precisely because only this derived cache is
 * dropped; nothing the user entered lives under it.
 *
 * `STALE_KEYS` is empty because v1 is the first version - there has never been a
 * client side solve cache before this one. It is listed explicitly rather than
 * discovered, because discovering it would mean enumerating keys, and this file
 * does not do that.
 */
/*
 * v3: the solver's ANSWERS changed for identical requests three
 * times in short order - multi-cell-support targets went from refused to solved,
 * Lonelily went from 100 packed spawns (illegal in game) to the spaced 25,
 * and CAPPED lonelily requests stopped routing through the compact-cluster
 * economy (v2 lived just long enough to cache packed capped layouts from
 * that last bug, which is why it is retired alongside v1). A cache keyed
 * only by the request would keep serving the old answers, so the version is
 * part of the key and dead keys are removed on init.
 */
export const CACHE_KEY = "skydex.greenhouse.solver.v3";
export const STALE_KEYS: string[] = [
  "skydex.greenhouse.solver.v1",
  "skydex.greenhouse.solver.v2",
];

/** Entry count ceiling. Twenty four distinct grids is far more than a session explores. */
const MAX_ENTRIES = 24;

/**
 * Serialised size ceiling.
 *
 * localStorage is a few megabytes for the whole origin, and this cache is the
 * least important thing in it. Half a megabyte is a generous share for derived
 * data and leaves the player's own saves plenty of room.
 */
const MAX_BYTES = 512 * 1024;

/** How many times to shed the oldest entry and retry after a rejected write. */
const WRITE_ATTEMPTS = 4;

/**
 * Reach for storage at call time, never at import time.
 *
 * Server side rendering has no `localStorage`, and tests install a fake one
 * after this module has already loaded. Both work only if the lookup is late.
 */
const getStorage = (): NarrowStorage | null => {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    // Private mode in some browsers throws on the property access itself.
    return null;
  }
};

export interface SolverCacheOptions {
  cacheKey?: string;
  staleKeys?: string[];
  maxEntries?: number;
  maxBytes?: number;
  /** Injected only by tests. Production always reads the global at call time. */
  storage?: () => NarrowStorage | null;
}

export interface SolverCache {
  get(key: string, request: string, fingerprint: string): SolveResponse | null;
  set(key: string, request: string, fingerprint: string, response: SolveResponse): void;
  /** Drops both layers. Used by tests, and safe to call at any time. */
  reset(): void;
  /** Oldest first. Test seam for asserting eviction order. */
  keys(): string[];
}

export const createSolverCache = (options: SolverCacheOptions = {}): SolverCache => {
  const cacheKey = options.cacheKey ?? CACHE_KEY;
  const staleKeys = options.staleKeys ?? STALE_KEYS;
  const maxEntries = options.maxEntries ?? MAX_ENTRIES;
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  const storageOf = options.storage ?? getStorage;

  /** Insertion order is the LRU order: oldest first, newest last. */
  let entries = new Map<string, CacheEntry>();
  let hydrated = false;

  /**
   * Remove the versions this cache has superseded.
   *
   * Only names from `STALE_KEYS`, which are only ever previous versions of this
   * module's own key. Anything not on that list belongs to someone else and is
   * none of our business.
   */
  const purgeStale = (storage: NarrowStorage) => {
    for (const key of staleKeys) {
      try {
        storage.removeItem(key);
      } catch {
        // A failed removal of a dead key costs nothing and must not stop the read.
      }
    }
  };

  /** Read the stored copy once per page life. Any problem at all degrades to empty. */
  const hydrate = () => {
    if (hydrated) return;
    hydrated = true;

    const storage = storageOf();
    if (!storage) return;

    try {
      purgeStale(storage);
      const raw = storage.getItem(cacheKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { entries?: unknown };
      if (!parsed || !Array.isArray(parsed.entries)) return;

      for (const item of parsed.entries as unknown[]) {
        /*
         * Validated rather than trusted.
         *
         * This came out of shared browser storage, which means it could have
         * been written by an older build, a newer one, or something else
         * entirely. A shape we do not recognise reads as "no entry", never as a
         * cast that explodes three call sites later.
         */
        if (!Array.isArray(item) || item.length !== 2) continue;
        const [key, value] = item as [unknown, unknown];
        if (typeof key !== "string" || !value || typeof value !== "object") continue;

        const entry = value as Partial<CacheEntry>;
        if (typeof entry.request !== "string") continue;
        if (typeof entry.fingerprint !== "string") continue;
        if (!entry.response || typeof entry.response !== "object") continue;

        entries.set(key, {
          request: entry.request,
          fingerprint: entry.fingerprint,
          response: entry.response,
          at: typeof entry.at === "number" ? entry.at : Date.now(),
        });
      }
      // A payload written when the ceiling was higher must not raise it now.
      trim();
    } catch {
      // Corrupt, truncated, or written by a future version. Solving again is
      // always available, so an unreadable cache is an inconvenience, not a fault.
      entries = new Map();
    }
  };

  /**
   * Enforce the LRU capacity on the live map.
   *
   * This is the one place entries are dropped for being old, and it is a
   * memory concern only. Insertion order is LRU order, so the front of the map
   * is the least recently used.
   */
  const trim = () => {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  };

  /**
   * Mirror memory into storage.
   *
   * The whole cache is rewritten rather than patched. It is at most a few dozen
   * entries and this only ever runs after a solve that cost about a second, so
   * the simplicity is free.
   *
   * Every shrink below happens on a COPY, never on the live map. That
   * separation is the point: how much this browser is willing to persist is a
   * storage problem, and letting it reach back into memory would mean a
   * localStorage filled up by some other feature quietly shrinking the cache
   * that is working perfectly well in this tab. Memory is allowed to hold more
   * than storage does.
   *
   * A rejected write is answered by offering less and trying again, because a
   * full quota is usually someone else's data arriving rather than ours
   * growing. After a few attempts we stop, and the cache is simply memory only
   * for the rest of the session. A cache is never worth an exception on a path
   * the player is waiting on.
   */
  const persist = () => {
    const storage = storageOf();
    if (!storage) return;

    let payload = [...entries];
    const encode = () => JSON.stringify({ entries: payload } satisfies Persisted);

    let text = encode();
    while (text.length > maxBytes && payload.length > 0) {
      payload = payload.slice(1);
      text = encode();
    }

    for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt++) {
      try {
        storage.setItem(cacheKey, text);
        return;
      } catch {
        if (payload.length === 0) return;
        payload = payload.slice(1);
        text = encode();
      }
    }
    // Still refused after shedding. Nothing further to try, and nothing to
    // report: every read still works, it just will not survive a reload.
  };

  return {
    get(key, request, fingerprint) {
      hydrate();
      const entry = entries.get(key);
      if (!entry) return null;

      // A hash collision, or an entry from a build whose canonical form differed.
      // Either way this is not the request that was asked.
      if (entry.request !== request) return null;

      /*
       * The dataset moved under us.
       *
       * Mutation data is overlaid from the wiki and does update in the
       * background. A layout solved against the old requirements can be
       * flatly invalid against the new ones, and handing it back instantly
       * would be a more convincing wrong answer than any error. Drop it and
       * let the solver earn a fresh one.
       */
      if (entry.fingerprint !== fingerprint) {
        entries.delete(key);
        return null;
      }

      // Touch: re-inserting moves this key to the newest end of the LRU order.
      entries.delete(key);
      entry.at = Date.now();
      entries.set(key, entry);
      return entry.response;
    },

    set(key, request, fingerprint, response) {
      hydrate();
      entries.delete(key);
      entries.set(key, { request, fingerprint, response, at: Date.now() });
      trim();
      persist();
    },

    reset() {
      entries = new Map();
      hydrated = true;
      const storage = storageOf();
      if (!storage) return;
      try {
        // Our own key, by exact name. Never `clear()`.
        storage.removeItem(cacheKey);
      } catch {
        // Nothing depends on this succeeding.
      }
    },

    keys() {
      hydrate();
      return [...entries.keys()];
    },
  };
};

/** The cache the app uses. Lazily hydrated, so importing this costs nothing. */
export const solverCache = createSolverCache();
