import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trimCatalogue } from "../catalogue";
import { PRICES_KEY, PRICES_TTL_MS, pricesAreStale, readCachedPrices } from "../prices";
import { readCoinBalances } from "../parseItems";

/**
 * The two runtime feeds, and the coin read.
 *
 * Nothing here touches the network. What is worth pinning is the guards: a
 * truncated download and an error page that happens to parse JSON must both be
 * refused, because either one accepted silently would value a whole profile at
 * zero and look exactly like a player who owns nothing.
 */

/** A localStorage stand-in. Node has none by default and the module guards for that. */
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  key(index: number): string | null {
    return [...this.store.keys()][index] ?? null;
  }
  get length(): number {
    return this.store.size;
  }
}

describe("the item catalogue", () => {
  it("keeps only the fields the valuation and Museum collection read", () => {
    const trimmed = trimCatalogue({
      items: Array.from({ length: 200 }, (_, i) => ({
        id: `ITEM_${i}`,
        name: `Item ${i}`,
        category: "SWORD",
        tier: "LEGENDARY",
        upgrade_costs: [[{ type: "ESSENCE", essence_type: "WITHER", amount: 1 }]],
        gemstone_slots: [{ slot_type: "COMBAT" }],
        prestige: { item_id: "OTHER" },
        soulbound: "COOP",
        museum: true,
        museum_data: {
          donation_xp: 4,
          category: "COMBAT",
          armor_set_donation_xp: { TEST_SET: 2, INVALID_SET: "nope" },
          mapped_item_ids: [`STARRED_ITEM_${i}`, null],
          game_stage: "INTERMEDIATE",
          ignored: "drop me",
        },
        stats: { DAMAGE: 260 },
        // Everything below is dropped.
        npc_sell_price: 1,
        description: "a long string nobody needs",
        recipes: [{ a: 1 }],
      })),
    });

    expect(trimmed).not.toBeNull();
    expect(Object.keys(trimmed!)).toHaveLength(200);
    expect(Object.keys(trimmed!.ITEM_0).sort()).toEqual([
      "category",
      "gemstone_slots",
      "id",
      "museum",
      "museum_data",
      "name",
      "prestige",
      "soulbound",
      "stats",
      "tier",
      "upgrade_costs",
    ]);
    expect(trimmed!.ITEM_0.museum_data).toEqual({
      donation_xp: 4,
      category: "COMBAT",
      armor_set_donation_xp: { TEST_SET: 2 },
      mapped_item_ids: ["STARRED_ITEM_0"],
      game_stage: "INTERMEDIATE",
    });
    expect(trimmed!.ITEM_0.stats).toEqual({ DAMAGE: 260 });
  });

  it("keeps an entry that has nothing but an id", () => {
    // "Hypixel knows this item and it has no upgrade costs" is a different
    // fact from "Hypixel has never heard of it", and the recombobulator rule
    // reads the difference.
    const trimmed = trimCatalogue({ items: Array.from({ length: 200 }, (_, i) => ({ id: `ITEM_${i}` })) });
    expect(trimmed!.ITEM_5).toEqual({ id: "ITEM_5" });
  });

  it("refuses a truncated download", () => {
    expect(trimCatalogue({ items: [{ id: "ONLY_ONE" }] })).toBeNull();
  });

  it("refuses something that is not a catalogue at all", () => {
    expect(trimCatalogue(null)).toBeNull();
    expect(trimCatalogue({ success: false, cause: "no" })).toBeNull();
    expect(trimCatalogue({ items: "nope" })).toBeNull();
  });
});

describe("the price cache", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    (globalThis as unknown as { localStorage: MemoryStorage }).localStorage = storage;
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: MemoryStorage }).localStorage;
  });

  const write = (value: unknown) => storage.setItem(PRICES_KEY, JSON.stringify(value));

  const bigMap = (): Record<string, number> =>
    Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`ITEM_${i}`, i + 1]));

  it("reads back a copy it wrote", () => {
    write({ prices: bigMap(), fetchedAt: 1_700_000_000_000 });
    const snapshot = readCachedPrices();
    expect(snapshot?.fetchedAt).toBe(1_700_000_000_000);
    expect(snapshot?.from).toBe("storage");
    expect(snapshot?.prices.ITEM_0).toBe(1);
  });

  it("uses its own key and no other", () => {
    expect(PRICES_KEY).toBe("skydex.networth.prices.v1");
  });

  it("drops a negative or non-finite price rather than letting it into a sum", () => {
    write({ prices: { ...bigMap(), BROKEN: -5, ALSO_BROKEN: "12", NAN: Number.NaN }, fetchedAt: 1 });
    const prices = readCachedPrices()!.prices;
    expect(prices.BROKEN).toBeUndefined();
    expect(prices.ALSO_BROKEN).toBeUndefined();
    expect(prices.NAN).toBeUndefined();
    expect(prices.ITEM_1).toBe(2);
  });

  it("refuses a cached blob that is too small to be a price file", () => {
    write({ prices: { HYPERION: 1 }, fetchedAt: 1 });
    expect(readCachedPrices()).toBeNull();
  });

  it("refuses a blob with no timestamp, because an undateable price is not usable", () => {
    write({ prices: bigMap() });
    expect(readCachedPrices()).toBeNull();
  });

  it("survives a corrupt blob without throwing", () => {
    storage.setItem(PRICES_KEY, "{not json");
    expect(readCachedPrices()).toBeNull();
  });

  it("returns nothing when there is nothing", () => {
    expect(readCachedPrices()).toBeNull();
  });
});

describe("price staleness", () => {
  it("calls no copy at all stale", () => {
    expect(pricesAreStale(null)).toBe(true);
  });

  it("holds a fresh copy for the whole window", () => {
    const now = 1_700_000_000_000;
    const snapshot = { prices: {}, fetchedAt: now, from: "network" as const };
    expect(pricesAreStale(snapshot, now)).toBe(false);
    expect(pricesAreStale(snapshot, now + PRICES_TTL_MS - 1)).toBe(false);
    expect(pricesAreStale(snapshot, now + PRICES_TTL_MS)).toBe(true);
  });
});

describe("coin balances", () => {
  it("reads the purse and the personal bank off the member", () => {
    const member = { currencies: { coin_purse: 10_763_000 }, profile: { bank_account: 12_500_000 } };
    expect(readCoinBalances(member, 189_827_987)).toEqual({
      purse: 10_763_000,
      bank: 189_827_987,
      personalBank: 12_500_000,
    });
  });

  it("reads a hidden bank as zero, and the caller is told separately that it was hidden", () => {
    expect(readCoinBalances({ currencies: { coin_purse: 1 } }, null)).toEqual({
      purse: 1,
      bank: 0,
      personalBank: 0,
    });
  });

  it("does not invent numbers out of a member it cannot read", () => {
    expect(readCoinBalances(null, null)).toEqual({ purse: 0, bank: 0, personalBank: 0 });
    expect(readCoinBalances({ currencies: { coin_purse: "lots" } }, "loads")).toEqual({
      purse: 0,
      bank: 0,
      personalBank: 0,
    });
  });
});
