import { afterEach, describe, expect, it, vi } from "vitest";
import { CACHE_KEY, STALE_KEYS, createSolverCache } from "../cache";
import type { NarrowStorage } from "../cache";
import type { SolveResponse } from "../../types/greenhouse";

/**
 * The solve cache, and the storage it is allowed to touch.
 *
 * Half of these tests are about caching. The other half are about NOT doing
 * things: not calling `clear()`, not enumerating keys, not removing anything we
 * did not write, and not throwing when the browser refuses a write. That second
 * half is the half that protects the player. A "Reset Everything" button in this
 * project once reached for `localStorage.clear()` and destroyed real work, and
 * the storage double below is built so that the same mistake here fails loudly
 * in CI instead of quietly in somebody's browser.
 */

/**
 * A localStorage that screams if you touch the dangerous parts.
 *
 * `clear`, `key` and `length` all throw. Nothing in the cache has any business
 * calling them, so any test that finishes without an exception has proved that
 * the module stayed inside `getItem` / `setItem` / `removeItem`.
 */
class GuardedStorage {
  private map = new Map<string, string>();
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  /** Set to a thrower to simulate a full quota. */
  onWrite: ((key: string, value: string) => void) | null = null;

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.onWrite?.(key, value);
    this.writes.push(key);
    this.map.set(key, String(value));
  }

  removeItem(key: string): void {
    this.removals.push(key);
    this.map.delete(key);
  }

  clear(): never {
    throw new Error("cache called localStorage.clear(), which destroys other features' data");
  }

  key(): never {
    throw new Error("cache enumerated localStorage keys");
  }

  get length(): never {
    throw new Error("cache enumerated localStorage keys");
  }

  /** Test-only inspection that does not go through the guarded surface. */
  peek(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  seed(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const quotaExceeded = () => {
  const err = new Error("The quota has been exceeded.");
  err.name = "QuotaExceededError";
  throw err;
};

const response = (id: string): SolveResponse => ({
  status: "OPTIMAL",
  total_cells_used: 4,
  placements: [{ crop: id, position: [0, 0], size: 2 }],
  mutations: [{ mutation: id, position: [0, 0], size: 2 }],
});

const FINGERPRINT = "abc123";

/** A cache wired to a given storage, with small ceilings so eviction is testable. */
const cacheOn = (storage: GuardedStorage, over: Partial<Parameters<typeof createSolverCache>[0]> = {}) =>
  createSolverCache({
    cacheKey: "skydex.greenhouse.solver.vTest",
    staleKeys: [],
    maxEntries: 3,
    storage: () => storage as NarrowStorage,
    ...over,
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("solve cache basics", () => {
  it("returns a stored response for the same request and fingerprint", () => {
    const cache = cacheOn(new GuardedStorage());
    cache.set("k1", "canonical-1", FINGERPRINT, response("gloomgourd"));
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("gloomgourd"));
  });

  it("misses on an unknown key", () => {
    const cache = cacheOn(new GuardedStorage());
    expect(cache.get("nope", "canonical-1", FINGERPRINT)).toBeNull();
  });

  it("misses when the canonical request differs, so a hash collision cannot be served", () => {
    const cache = cacheOn(new GuardedStorage());
    cache.set("shared", "canonical-1", FINGERPRINT, response("gloomgourd"));
    // Same key, different question. This is the guard that makes a 64 bit hash
    // safe to key on at all.
    expect(cache.get("shared", "canonical-2", FINGERPRINT)).toBeNull();
  });
});

describe("dataset fingerprint", () => {
  it("treats a changed dataset as a miss", () => {
    const cache = cacheOn(new GuardedStorage());
    cache.set("k1", "canonical-1", "fingerprint-monday", response("gloomgourd"));
    expect(cache.get("k1", "canonical-1", "fingerprint-tuesday")).toBeNull();
  });

  it("drops the stale entry rather than leaving it to be re-checked forever", () => {
    const cache = cacheOn(new GuardedStorage());
    cache.set("k1", "canonical-1", "fingerprint-monday", response("gloomgourd"));
    cache.get("k1", "canonical-1", "fingerprint-tuesday");
    expect(cache.keys()).toEqual([]);
    // And the old data is gone even if the old dataset somehow comes back.
    expect(cache.get("k1", "canonical-1", "fingerprint-monday")).toBeNull();
  });
});

describe("LRU behaviour", () => {
  it("evicts oldest first when the entry ceiling is passed", () => {
    const cache = cacheOn(new GuardedStorage());
    for (const id of ["a", "b", "c", "d"]) cache.set(id, `canonical-${id}`, FINGERPRINT, response(id));

    expect(cache.keys()).toEqual(["b", "c", "d"]);
    expect(cache.get("a", "canonical-a", FINGERPRINT)).toBeNull();
    expect(cache.get("d", "canonical-d", FINGERPRINT)).toEqual(response("d"));
  });

  it("a read counts as use, so the entry stops being the oldest", () => {
    const cache = cacheOn(new GuardedStorage());
    for (const id of ["a", "b", "c"]) cache.set(id, `canonical-${id}`, FINGERPRINT, response(id));

    // Touch "a". It should now outlive "b".
    expect(cache.get("a", "canonical-a", FINGERPRINT)).toEqual(response("a"));
    expect(cache.keys()).toEqual(["b", "c", "a"]);

    cache.set("d", "canonical-d", FINGERPRINT, response("d"));
    expect(cache.keys()).toEqual(["c", "a", "d"]);
    expect(cache.get("b", "canonical-b", FINGERPRINT)).toBeNull();
  });

  it("re-writing a key moves it to newest rather than duplicating it", () => {
    const cache = cacheOn(new GuardedStorage());
    cache.set("a", "canonical-a", FINGERPRINT, response("a"));
    cache.set("b", "canonical-b", FINGERPRINT, response("b"));
    cache.set("a", "canonical-a", FINGERPRINT, response("a2"));

    expect(cache.keys()).toEqual(["b", "a"]);
    expect(cache.get("a", "canonical-a", FINGERPRINT)).toEqual(response("a2"));
  });
});

describe("persistence", () => {
  it("survives a reload: a fresh cache reads what the last one wrote", () => {
    const storage = new GuardedStorage();
    cacheOn(storage).set("k1", "canonical-1", FINGERPRINT, response("gloomgourd"));

    // A new page life, same browser.
    const reloaded = cacheOn(storage);
    expect(reloaded.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("gloomgourd"));
  });

  it("carries the fingerprint across the round trip, so stale data cannot survive a reload", () => {
    const storage = new GuardedStorage();
    cacheOn(storage).set("k1", "canonical-1", "fingerprint-monday", response("gloomgourd"));

    const reloaded = cacheOn(storage);
    expect(reloaded.get("k1", "canonical-1", "fingerprint-tuesday")).toBeNull();
  });

  it("degrades to empty on a corrupt payload instead of throwing", () => {
    const storage = new GuardedStorage();
    storage.seed("skydex.greenhouse.solver.vTest", "{not json at all");

    const cache = cacheOn(storage);
    expect(() => cache.get("k1", "canonical-1", FINGERPRINT)).not.toThrow();
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toBeNull();
    // Still usable afterwards.
    cache.set("k1", "canonical-1", FINGERPRINT, response("gloomgourd"));
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("gloomgourd"));
  });

  it("skips entries whose shape it does not recognise", () => {
    const storage = new GuardedStorage();
    storage.seed(
      "skydex.greenhouse.solver.vTest",
      JSON.stringify({
        entries: [
          ["good", { request: "canonical-1", fingerprint: FINGERPRINT, response: response("a"), at: 1 }],
          ["missing-fingerprint", { request: "canonical-2", response: response("b"), at: 1 }],
          ["not-a-pair"],
        ],
      })
    );

    const cache = cacheOn(storage);
    expect(cache.keys()).toEqual(["good"]);
  });

  it("works with no storage at all, as on the server", () => {
    const cache = createSolverCache({ storage: () => null });
    expect(() => cache.set("k1", "canonical-1", FINGERPRINT, response("a"))).not.toThrow();
    // Memory still works; only the persistence is absent.
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("a"));
  });
});

describe("quota", () => {
  it("swallows a refused write and keeps serving from memory", () => {
    const storage = new GuardedStorage();
    storage.onWrite = quotaExceeded;

    const cache = cacheOn(storage);
    expect(() => cache.set("k1", "canonical-1", FINGERPRINT, response("gloomgourd"))).not.toThrow();
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("gloomgourd"));
  });

  it("does not let a full disk shrink the in-memory cache", () => {
    /*
     * The bug this pins: shedding entries to make a write fit must happen on a
     * copy. If it reached into the live map, another feature filling up
     * localStorage would silently shrink a cache that is working perfectly well
     * in this tab.
     */
    const storage = new GuardedStorage();
    storage.onWrite = quotaExceeded;

    const cache = cacheOn(storage);
    for (const id of ["a", "b", "c"]) cache.set(id, `canonical-${id}`, FINGERPRINT, response(id));

    expect(cache.keys()).toEqual(["a", "b", "c"]);
    expect(cache.get("a", "canonical-a", FINGERPRINT)).toEqual(response("a"));
  });

  it("recovers once the browser accepts writes again", () => {
    const storage = new GuardedStorage();
    storage.onWrite = quotaExceeded;

    const cache = cacheOn(storage);
    cache.set("k1", "canonical-1", FINGERPRINT, response("a"));
    expect(storage.peek("skydex.greenhouse.solver.vTest")).toBeNull();

    storage.onWrite = null;
    cache.set("k2", "canonical-2", FINGERPRINT, response("b"));
    expect(storage.peek("skydex.greenhouse.solver.vTest")).not.toBeNull();
  });

  it("keeps the payload under the byte ceiling by dropping the oldest", () => {
    const storage = new GuardedStorage();
    const cache = cacheOn(storage, { maxEntries: 10, maxBytes: 400 });

    for (const id of ["a", "b", "c", "d", "e", "f"]) {
      cache.set(id, `canonical-${id}`, FINGERPRINT, response(id));
    }

    const stored = storage.peek("skydex.greenhouse.solver.vTest");
    expect(stored).not.toBeNull();
    expect(stored!.length).toBeLessThanOrEqual(400);
    // The newest survived the trim, the oldest did not.
    expect(stored).toContain("\"f\"");
    expect(stored).not.toContain("\"a\"");
  });
});

describe("the storage rules this project has already paid for", () => {
  it("never calls clear() or enumerates keys, across a full lifecycle", () => {
    // GuardedStorage throws on clear(), key() and length. Getting to the end of
    // this test without an exception is the assertion.
    const storage = new GuardedStorage();
    const cache = cacheOn(storage, { staleKeys: ["skydex.greenhouse.solver.v0"] });

    expect(() => {
      for (const id of ["a", "b", "c", "d"]) cache.set(id, `canonical-${id}`, FINGERPRINT, response(id));
      cache.get("d", "canonical-d", FINGERPRINT);
      cache.get("a", "canonical-a", FINGERPRINT);
      cache.get("d", "canonical-d", "a-different-dataset");
      cache.keys();
      cache.reset();
    }).not.toThrow();
  });

  it("removes only its own superseded versions, and leaves everyone else alone", () => {
    const storage = new GuardedStorage();
    // A believable browser: the player's saved work, plus one dead version of ours.
    storage.seed("skyshards-designer-designs", "the player's saved layouts");
    storage.seed("skydex.greenhouse.uniqueCrops", "7");
    storage.seed("wizardsky.planner.state", "the player's grind progress");
    storage.seed("customRates", "a legacy unprefixed key");
    storage.seed("skydex.greenhouse.solver.v0", "our own dead cache");

    const cache = cacheOn(storage, { staleKeys: ["skydex.greenhouse.solver.v0"] });
    cache.get("k1", "canonical-1", FINGERPRINT);

    expect(storage.removals).toEqual(["skydex.greenhouse.solver.v0"]);
    expect(storage.peek("skyshards-designer-designs")).toBe("the player's saved layouts");
    expect(storage.peek("skydex.greenhouse.uniqueCrops")).toBe("7");
    expect(storage.peek("wizardsky.planner.state")).toBe("the player's grind progress");
    expect(storage.peek("customRates")).toBe("a legacy unprefixed key");
  });

  it("removes exactly the superseded keys and nothing else, in production config", () => {
    const storage = new GuardedStorage();
    storage.seed("skyshards-grid-config", "the player's grid");
    storage.seed("skydex.greenhouse.solver.v1", "answers the solver no longer gives");
    storage.seed("skydex.greenhouse.solver.v2", "cached the capped-lonelily bug for half an hour");

    // Exactly the production configuration: v1 and v2 are retired because the
    // solver's answers changed for identical requests (multi-cell targets
    // went from refused to solved, lonelily from packed to spaced, capped
    // lonelily out of the compact-cluster economy), and a cache that outlives
    // its answers serves confident lies.
    const cache = cacheOn(storage, { staleKeys: STALE_KEYS });
    cache.get("k1", "canonical-1", FINGERPRINT);
    cache.set("k1", "canonical-1", FINGERPRINT, response("a"));

    expect(storage.removals).toEqual(["skydex.greenhouse.solver.v1", "skydex.greenhouse.solver.v2"]);
    expect(storage.peek("skyshards-grid-config")).toBe("the player's grid");
  });

  it("writes only its own key", () => {
    const storage = new GuardedStorage();
    const cache = cacheOn(storage);
    cache.set("k1", "canonical-1", FINGERPRINT, response("a"));
    cache.set("k2", "canonical-2", FINGERPRINT, response("b"));

    expect(new Set(storage.writes)).toEqual(new Set(["skydex.greenhouse.solver.vTest"]));
  });

  it("reset() removes its own key by name and nothing else", () => {
    const storage = new GuardedStorage();
    storage.seed("skyshards-priorities", "the player's priorities");

    const cache = cacheOn(storage);
    cache.set("k1", "canonical-1", FINGERPRINT, response("a"));
    cache.reset();

    expect(storage.removals).toEqual(["skydex.greenhouse.solver.vTest"]);
    expect(storage.peek("skyshards-priorities")).toBe("the player's priorities");
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toBeNull();
  });

  it("owns a key inside its own namespace and carries a version suffix", () => {
    // A bump is only safe while the key stays derived-data-only. Pinning the
    // name here means renaming it into somebody else's namespace is a test failure.
    expect(CACHE_KEY).toBe("skydex.greenhouse.solver.v3");
    expect(CACHE_KEY).toMatch(/\.v\d+$/);
    expect(STALE_KEYS.every((k) => k.startsWith("skydex.greenhouse.solver."))).toBe(true);
  });
});

describe("the default cache against a stubbed global", () => {
  it("reads the global localStorage lazily, so a stub installed later still works", async () => {
    const storage = new GuardedStorage();
    vi.stubGlobal("localStorage", storage);

    // Imported fresh so the module's own singleton is exercised, not a factory.
    const { createSolverCache: create, CACHE_KEY: key } = await import("../cache");
    const cache = create();
    cache.set("k1", "canonical-1", FINGERPRINT, response("a"));

    expect(storage.peek(key)).not.toBeNull();
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("a"));
  });

  it("does not throw when localStorage is absent entirely", async () => {
    vi.stubGlobal("localStorage", undefined);

    const { createSolverCache: create } = await import("../cache");
    const cache = create();
    expect(() => cache.set("k1", "canonical-1", FINGERPRINT, response("a"))).not.toThrow();
    expect(cache.get("k1", "canonical-1", FINGERPRINT)).toEqual(response("a"));
  });
});
