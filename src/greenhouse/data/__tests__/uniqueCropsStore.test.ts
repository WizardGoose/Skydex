import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The greenhouse-wide `uniqueCrops` timing input.
 *
 * The value used to compete with a per-plot derived count, but Hypixel applies
 * the bonus across any Greenhouse plot. This shared store is now the one timing
 * authority and the old key remains only as a migration seed.
 *
 * What is actually load bearing, and therefore what is pinned here:
 *   - the legacy key is READ, so nobody's slider silently resets to zero
 *   - the legacy key is never WRITTEN again, so it cannot drift back into
 *     being an authority
 *   - the legacy key is never REMOVED, because storage keys in this project
 *     are frozen forever and deleting one destroys data that cannot be got back
 */

const LEGACY_KEY = "skyshards-unique-crops";
const KEY = "skydex.greenhouse.uniqueCrops";

class MemoryStorage {
  private map = new Map<string, string>();
  readonly writes: string[] = [];
  readonly removals: string[] = [];
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.writes.push(key);
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.removals.push(key);
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.map.size;
  }
}

type Listener = (event: { key: string | null }) => void;

class FakeWindow {
  private handlers = new Map<string, Listener[]>();
  addEventListener(type: string, fn: Listener): void {
    const list = this.handlers.get(type) ?? [];
    list.push(fn);
    this.handlers.set(type, list);
  }
  removeEventListener(): void {}
  emit(type: string, event: { key: string | null }): void {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
  }
}

const storage = new MemoryStorage();
const fakeWindow = new FakeWindow();

let store: typeof import("../uniqueCropsStore");

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", fakeWindow);
  // What a returning player's browser looks like: a value written by the build
  // that owned this key, and nothing under the new one.
  storage.setItem(LEGACY_KEY, JSON.stringify(7));
  storage.writes.length = 0;

  store = await import("../uniqueCropsStore");
});

describe("uniqueCrops store", () => {
  it("seeds from the legacy key so a returning player keeps their setting", () => {
    expect(store.getUniqueCrops()).toBe(7);
  });

  it("reads the legacy key without writing it", () => {
    expect(storage.writes).not.toContain(LEGACY_KEY);
    expect(storage.removals).not.toContain(LEGACY_KEY);
  });

  it("persists changes to its own key and leaves the legacy value frozen", () => {
    const seen: number[] = [];
    const unsubscribe = store.subscribeUniqueCrops(() => seen.push(store.getUniqueCrops()));

    store.setUniqueCrops(4);

    expect(seen).toEqual([4]);
    expect(storage.getItem(KEY)).toBe("4");
    // Untouched, exactly as the last build that owned it left it.
    expect(storage.getItem(LEGACY_KEY)).toBe("7");
    expect(storage.writes).not.toContain(LEGACY_KEY);

    unsubscribe();
  });

  it("clamps to the range the in-game slider actually offers", () => {
    store.setUniqueCrops(99);
    expect(store.getUniqueCrops()).toBe(12);
    store.setUniqueCrops(-3);
    expect(store.getUniqueCrops()).toBe(0);
  });

  it("prefers its own key over the legacy one once it has written", () => {
    store.setUniqueCrops(5);
    expect(storage.getItem(LEGACY_KEY)).toBe("7");
    expect(store.getUniqueCrops()).toBe(5);
  });

  it("follows the slider across tabs", () => {
    const seen: number[] = [];
    const unsubscribe = store.subscribeUniqueCrops(() => seen.push(store.getUniqueCrops()));

    storage.setItem(KEY, JSON.stringify(9));
    fakeWindow.emit("storage", { key: KEY });

    expect(seen).toEqual([9]);
    expect(store.getUniqueCrops()).toBe(9);

    // Another key changing is not our business.
    storage.setItem(LEGACY_KEY, JSON.stringify(1));
    fakeWindow.emit("storage", { key: LEGACY_KEY });
    expect(store.getUniqueCrops()).toBe(9);

    unsubscribe();
  });
});
