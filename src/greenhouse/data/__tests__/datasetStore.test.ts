import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * One dataset, however many consumers.
 *
 * The bug these tests exist for: the mutation list used to be assembled in
 * three places, only one of which applied the wiki overlay, so the page that
 * built its own copy could disagree with the page that read the overlaid one -
 * different rarities, different requirements, and in the case that started
 * this, different owned counts for the same mutation.
 *
 * So the assertions here are deliberately about IDENTITY and AGREEMENT rather
 * than about any particular value. Two consumers reading the same store must
 * see the same object, and one refresh must move both of them at once. A test
 * that only checked "the store returns a rarity" would have passed just as
 * happily before the consolidation.
 *
 * Node environment, no DOM, so `window` and `localStorage` are stood up by
 * hand. Both have to exist BEFORE the store is imported, because the store
 * reads the wiki cache and registers its cross-tab listener at module load -
 * that ordering is exactly what makes a cache written by a previous session
 * safe to adopt before anything can overwrite it.
 */

/** The wiki cache, as `wikiSync` writes it. Kept in sync by importing the key. */
type StoredMutation = {
  name: string;
  size: number;
  ground: string;
  grounds: string[];
  rarity: string;
  growth_stages: number | null;
  requirements: { crop: string; count: number }[];
};

const ASHWREATH: StoredMutation = {
  name: "Ashwreath",
  size: 1,
  ground: "soul_sand",
  grounds: ["soul_sand"],
  rarity: "legendary",
  growth_stages: 4,
  requirements: [
    { crop: "nether_wart", count: 2 },
    { crop: "fire", count: 2 },
  ],
};

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
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
  removeEventListener(type: string, fn: Listener): void {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== fn));
  }
  emit(type: string, event: { key: string | null }): void {
    for (const fn of this.handlers.get(type) ?? []) fn(event);
  }
}

const storage = new MemoryStorage();
const fakeWindow = new FakeWindow();

/** Write a wiki snapshot the way another tab would have left it. */
const writeWikiCache = (key: string, rarity: string) => {
  storage.setItem(key, JSON.stringify({ fetchedAt: Date.now(), mutations: { ashwreath: { ...ASHWREATH, rarity } } }));
};

type DatasetStore = typeof import("../datasetStore");
type DataService = typeof import("../../services/greenhouseDataService");
type WikiSync = typeof import("../wikiSync");

let store: DatasetStore;
let service: DataService;
let wikiCacheKey: string;
let getDataset: DatasetStore["getDataset"];
let publishWikiSnapshot: DatasetStore["publishWikiSnapshot"];

beforeAll(async () => {
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("window", fakeWindow);
  // Nothing here may reach the network. A fresh cache makes the store's own
  // staleness check short-circuit, so this is a guard rather than a fixture:
  // if the check ever regressed, the test would fail loudly instead of
  // quietly fetching the real wiki.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in tests")))
  );

  const sync: WikiSync = await import("../wikiSync");
  wikiCacheKey = sync.CACHE_KEY;
  writeWikiCache(wikiCacheKey, "legendary");

  store = await import("../datasetStore");
  getDataset = store.getDataset;
  publishWikiSnapshot = store.publishWikiSnapshot;
  service = await import("../../services/greenhouseDataService");
});

describe("greenhouse dataset store", () => {
  it("adopts the cached wiki overlay before any consumer reads it", () => {
    const ashwreath = store.getDataset().mutations.find((m) => m.id === "ashwreath");
    expect(ashwreath?.rarity).toBe("legendary");
    expect(store.getDataset().wiki.fetchedAt).not.toBeNull();
  });

  it("serves the context list and the service lookups off one object", () => {
    // The service is the non-component consumer (site search, info modal) and
    // the dataset is what the provider hands the greenhouse pages. Same object,
    // not merely equal contents.
    expect(service.getRawData()).toBe(store.getDataset().raw);

    const fromStore = store.getDataset().mutations.find((m) => m.id === "ashwreath");
    const fromService = service.getMutationData("ashwreath");
    expect(fromService?.rarity).toBe(fromStore?.rarity);

    // Every mutation the service lists is a mutation the store lists.
    const storeIds = new Set(store.getDataset().mutations.map((m) => m.id));
    for (const m of service.getAllMutations()) expect(storeIds.has(m.id)).toBe(true);
    expect(service.getAllMutations()).toHaveLength(storeIds.size);
  });

  it("carries a hypixel id for every mutation, so no page needs its own bridge", () => {
    const { bridge, mutations } = store.getDataset();
    for (const m of mutations) expect(bridge[m.id]?.hypixelId).toBeTruthy();
    expect(bridge.ashwreath.hypixelId).toBe("ASHWREATH");
  });

  it("keeps the crop list carrying mutations as plantable options", () => {
    const { crops } = store.getDataset();
    const asCrop = crops.find((c) => c.id === "ashwreath");
    expect(asCrop?.isMutation).toBe(true);
    expect(crops.some((c) => c.id === "pumpkin" && c.isMutation === false)).toBe(true);
  });

  it("moves both consumers together when another tab refreshes the wiki", () => {
    const seen: number[] = [];
    const unsubscribe = store.subscribeDataset(() => seen.push(1));

    writeWikiCache(wikiCacheKey, "uncommon");
    fakeWindow.emit("storage", { key: wikiCacheKey });

    expect(seen).toHaveLength(1);
    expect(store.getDataset().mutations.find((m) => m.id === "ashwreath")?.rarity).toBe("uncommon");
    // The second consumer was never told anything directly and still agrees.
    expect(service.getMutationData("ashwreath")?.rarity).toBe("uncommon");
    expect(service.getRawData()).toBe(store.getDataset().raw);

    unsubscribe();
  });

  it("ignores storage events for keys it does not own", () => {
    const before = store.getDataset();
    const seen: number[] = [];
    const unsubscribe = store.subscribeDataset(() => seen.push(1));

    writeWikiCache(wikiCacheKey, "epic");
    fakeWindow.emit("storage", { key: "some.other.key" });

    expect(seen).toHaveLength(0);
    expect(store.getDataset()).toBe(before);

    unsubscribe();
  });

  it("hands non-component callers the same data without a fetch", async () => {
    const raw = await service.loadGreenhouseData();
    expect(raw).toBe(store.getDataset().raw);
    expect(service.isDataLoaded()).toBe(true);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
describe("datasetStore wiki publishing", () => {
  it("adopts a Settings refresh in the same tab", () => {
    const before = getDataset();
    const id = before.mutations[0]?.id;
    expect(id).toBeTruthy();
    const base = before.raw.mutations[id!];

    publishWikiSnapshot({
      fetchedAt: 123456789,
      mutations: {
        [id!]: {
          name: base.name,
          size: base.size,
          ground: base.ground,
          grounds: base.grounds ?? [base.ground],
          rarity: base.rarity,
          growth_stages: base.growth_stages,
          requirements: base.requirements,
        },
      },
    });

    const after = getDataset();
    expect(after.wiki.fetchedAt).toBe(123456789);
    expect(after.wiki.syncing).toBe(false);
    expect(after.wiki.error).toBeNull();
    expect(after.raw.mutations[id!].name).toBe(base.name);
  });
});
