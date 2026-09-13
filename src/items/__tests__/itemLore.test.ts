import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const record = (id = "TWO_IQ_POINT") => ({
  internalname: id, displayname: "§a2 IQ Points",
  lore: ["§7Accessory Power: §6+5", "", "§7Increases your total §bIntelligence", "§7by §a2%§7.", "§a§lUNCOMMON ACCESSORY"],
});

beforeEach(() => {
  vi.resetModules();
  const saved = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("base game item lore", () => {
  it("resolves pet records at the requested rarity and substitutes level-one game values", async () => {
    const pet = { internalname: "AMMONITE;4", displayname: "§7[Lvl {LVL}] §6Ammonite", lore: ["§8Fishing Pet", "§7Sea Creature Chance: §3+{SEA_CREATURE_CHANCE}", "§7Bonus: §3+{0}", "§6§lLEGENDARY"] };
    const numbers = { AMMONITE: { LEGENDARY: { "1": { statNums: { SEA_CREATURE_CHANCE: 0.06 }, otherNums: [0.01] }, "100": { statNums: { SEA_CREATURE_CHANCE: 6 }, otherNums: [1] } } } };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(pet)))
      .mockResolvedValueOnce(new Response(JSON.stringify(numbers)));
    vi.stubGlobal("fetch", fetcher);
    const { loadItemLore, cachedItemLore, levelOnePetLore } = await import("../itemLore");
    const item = await loadItemLore("AMMONITE", "LEGENDARY");
    expect(item).toMatchObject({ id: "AMMONITE;4", name: "[Lvl 1] Ammonite" });
    expect(item?.lore).toContain("§7Sea Creature Chance: §3+0.06");
    expect(item?.lore).toContain("§7Bonus: §3+0.01");
    expect(cachedItemLore("AMMONITE", "EPIC")).toBeNull();
    expect(levelOnePetLore(pet, {}, "AMMONITE;4", "LEGENDARY")).toBeNull();
    expect(levelOnePetLore({ ...pet, lore: ["{UNKNOWN}"] }, numbers, "AMMONITE;4", "LEGENDARY")).toBeNull();
    vi.resetModules();
    expect(await (await import("../itemLore")).loadItemLore("AMMONITE", "LEGENDARY")).toEqual(item);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("resolves wiki identity to the real item ID without confusing variants", async () => {
    const resource = await import("../itemResource");
    resource.__setItemResourceForTests({ TWO_IQ_POINT: { n: "2 IQ Points" }, FRAGRANCED_BROWN_MUSHROOM_PASTE: {}, VARIANT_A: { n: "Same name" }, VARIANT_B: { n: "Same name" } });
    const { itemLoreId } = await import("../itemLore");
    expect(itemLoreId("2_iq_points", "2 IQ Points")).toBe("TWO_IQ_POINT");
    expect(itemLoreId("fragranced_brown_mushroom_paste", '"Fragranced" Brown Mushroom "Paste"')).toBe("FRAGRANCED_BROWN_MUSHROOM_PASTE");
    expect(resource.resourceIdFor("Same name")).toBeNull();
    expect(resource.resourceIdFor("VARIANT_B")).toBe("VARIANT_B");
  });

  it("preserves the game formatting and rejects mismatched or malformed records", async () => {
    const { parseGameItemLore } = await import("../itemLore");
    expect(parseGameItemLore(record(), "TWO_IQ_POINT")).toEqual({ id: "TWO_IQ_POINT", name: "2 IQ Points", lore: record().lore });
    expect(parseGameItemLore(record(), "OTHER_ITEM")).toBeNull();
    expect(parseGameItemLore({ ...record(), lore: [42] }, "TWO_IQ_POINT")).toBeNull();
    expect(parseGameItemLore({ ...record(), lore: [] }, "TWO_IQ_POINT")).toBeNull();
  });

  it("deduplicates requests and reuses a validated persistent cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(record())));
    vi.stubGlobal("fetch", fetcher);
    const { loadItemLore, ITEM_LORE_CACHE_KEY } = await import("../itemLore");
    const first = loadItemLore("TWO_IQ_POINT");
    expect(loadItemLore("TWO_IQ_POINT")).toBe(first);
    expect(await first).toMatchObject({ name: "2 IQ Points" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(ITEM_LORE_CACHE_KEY)).toContain("UNCOMMON ACCESSORY");
    vi.resetModules();
    const reloaded = await import("../itemLore");
    expect(await reloaded.loadItemLore("TWO_IQ_POINT")).toMatchObject({ name: "2 IQ Points" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not turn a failed request into permanent missing lore", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify(record())));
    vi.stubGlobal("fetch", fetcher);
    const { loadItemLore, cachedItemLore } = await import("../itemLore");
    expect(await loadItemLore("TWO_IQ_POINT")).toBeNull();
    expect(cachedItemLore("TWO_IQ_POINT")).toBeNull();
    expect(await loadItemLore("TWO_IQ_POINT")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_001);
    expect(await loadItemLore("TWO_IQ_POINT")).toMatchObject({ name: "2 IQ Points" });
  });

  it("ignores stale or invalid saved records and keeps only the requested identity", async () => {
    const { ITEM_LORE_CACHE_KEY, loadItemLore, cachedItemLore } = await import("../itemLore");
    localStorage.setItem(ITEM_LORE_CACHE_KEY, JSON.stringify([
      { fetchedAt: Date.now() - 86_400_001, item: { id: "TWO_IQ_POINT", name: "Old name", lore: ["old"] } },
      { fetchedAt: Date.now(), item: { id: "OTHER_ITEM", name: "Bad lore", lore: [42] } },
    ]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(record("WRONG_ITEM")))));
    expect(cachedItemLore("TWO_IQ_POINT")).toBeNull();
    expect(cachedItemLore("OTHER_ITEM")).toBeNull();
    expect(await loadItemLore("TWO_IQ_POINT")).toBeNull();
    expect(cachedItemLore("TWO_IQ_POINT")).toBeNull();
  });

  it("never sends an arbitrary URL or path as an item request", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { loadItemLore } = await import("../itemLore");
    expect(await loadItemLore("../../private")).toBeNull();
    expect(await loadItemLore("https://example.com")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("works when browser storage is unavailable", async () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(record())));
    vi.stubGlobal("fetch", fetcher);
    const { loadItemLore } = await import("../itemLore");
    expect(await loadItemLore("TWO_IQ_POINT")).toMatchObject({ name: "2 IQ Points" });
    expect(await loadItemLore("TWO_IQ_POINT")).toMatchObject({ name: "2 IQ Points" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
