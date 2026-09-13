import { describe, expect, it } from "vitest";
import type { Item, ItemIndex } from "../../items/useItemData";
import type { OwnedIndex } from "../../inventory";
import {
  MINION_CATALOGUE,
  minionProgress,
  minionProgressSummary,
  parseCraftedGenerators,
  planMinionFamily,
  buildMinionHoldings,
} from "../minions";
import type { MinionCatalogueEntry } from "../minionsCatalogue";

const item = (name: string, recipe: Item["recipe"] = null): Item => ({
  name,
  hypixelId: name.toUpperCase().replace(/ /g, "_"),
  tier: null,
  category: null,
  npcSell: null,
  yields: 1,
  recipe,
});

const owned = (counts: Record<string, number | undefined>): OwnedIndex => ({
  get: () => undefined,
  count: (id) => counts[id],
  auto: (id) => counts[id],
  has: true,
  sources: ["manual"],
  entries: () => [],
  keys: () => Object.keys(counts),
});

const FAMILY: MinionCatalogueEntry = {
  id: "mithril",
  name: "Mithril",
  type: "Mining",
  collection: "Mithril I",
  wikiTitle: "Mithril Minion",
  tiers: [
    { tba: 80, storage: 64, materials: [{ name: "Mithril", amount: 10 }], npc: null },
    { tba: 75, storage: 192, materials: [{ name: "Enchanted Mithril", amount: 480 }], npc: null },
    { tba: 70, storage: 384, materials: [{ name: "Enchanted Mithril", amount: 480 }], npc: null },
  ],
  recipes: {},
};

const ITEMS: ItemIndex = {
  mithril: item("Mithril"),
  enchanted_mithril: item("Enchanted Mithril", [{ id: "mithril", name: "Mithril", qty: 160 }]),
};

describe("profile Minions", () => {
  it("reads highest crafted tiers from the selected member and keeps missing data unavailable", () => {
    expect(parseCraftedGenerators({ player_data: { crafted_generators: ["MITHRIL_1", "MITHRIL_4", "COBBLESTONE_2", "NEW_FAMILY_1"] } })).toMatchObject({
      available: true,
      highestByFamily: { mithril: 4, cobblestone: 2 },
      unmapped: ["NEW_FAMILY_1"],
    });
    expect(parseCraftedGenerators({ player_data: {} }).available).toBe(false);
  });

  it("keeps the complete shipped family catalogue and aggregate unique progress honest", () => {
    expect(MINION_CATALOGUE).toHaveLength(61);
    expect(new Set(MINION_CATALOGUE.map((entry) => entry.id)).size).toBe(61);
    expect(MINION_CATALOGUE.every((entry) => entry.tiers.length >= 11 && entry.tiers.every((tier) => tier.materials))).toBe(true);
    const inferno = MINION_CATALOGUE.find((entry) => entry.id === "inferno");
    const totalMaterial = (tier: number, name: string) =>
      inferno?.tiers[tier].materials.filter((material) => material.name === name).reduce((sum, material) => sum + material.amount, 0);
    expect(totalMaterial(8, "Inferno Vertex")).toBe(16);
    expect(totalMaterial(9, "Inferno Vertex")).toBe(48);
    const progress = minionProgress({ available: true, highestByFamily: { mithril: 2 }, raw: [], unmapped: [] }, [FAMILY]);
    expect(progress[0]).toMatchObject({ currentTier: 2, maxTier: 3, tiersRemaining: 1, completion: "incomplete" });
    expect(minionProgressSummary(progress)).toMatchObject({ totalFamilies: 1, craftedFamilies: 1, completedFamilies: 0, available: true });
  });

  it("uses held intermediate material before expanding the selected path", () => {
    const progress = minionProgress({ available: true, highestByFamily: { mithril: 2 }, raw: [], unmapped: [] }, [FAMILY])[0];
    const plan = planMinionFamily(progress, ITEMS, owned({ enchanted_mithril: 480, mithril: 10_000 }));
    expect(plan?.shortages).toEqual([]);
    expect(plan?.allocation.root.children[0]).toMatchObject({ id: "enchanted_mithril", allocated: 480, remaining: 0, children: [] });
  });

  it("breaks down only the uncovered intermediate remainder", () => {
    const progress = minionProgress({ available: true, highestByFamily: { mithril: 2 }, raw: [], unmapped: [] }, [FAMILY])[0];
    const plan = planMinionFamily(progress, ITEMS, owned({ enchanted_mithril: 200, mithril: 10_000 }));
    expect(plan?.shortages).toEqual([
      { id: "mithril", name: "Mithril", required: 44_800, allocated: 10_000, remaining: 34_800, known: true },
    ]);
  });

  it("merges API-visible holdings with mod storage without double-counting overlaps", () => {
    const holdings = buildMinionHoldings(
      ITEMS,
      owned({ mithril: 1_000 }),
      {
        inventory: [{ tag: { ExtraAttributes: { id: "ENCHANTED_MITHRIL" } }, Count: 200 }],
        enderchest: [],
        storage: [],
        sacks: [{ id: "MITHRIL", amount: 500 }],
      },
      true
    );
    expect(holdings.inventory.count("enchanted_mithril")).toBe(200);
    expect(holdings.inventory.count("mithril")).toBe(1_000);
    expect(holdings.known).toBe(true);
    expect(holdings.apiVisible).toBe(true);
  });

  it("reserves shared material once across every selected upgrade tier", () => {
    const sharedFamily: MinionCatalogueEntry = {
      ...FAMILY,
      tiers: [
        FAMILY.tiers[0],
        { tba: 75, storage: 192, materials: [{ name: "Mithril", amount: 10 }], npc: null },
        { tba: 70, storage: 384, materials: [{ name: "Mithril", amount: 10 }], npc: null },
      ],
    };
    const progress = minionProgress({ available: true, highestByFamily: { mithril: 1 }, raw: [], unmapped: [] }, [sharedFamily])[0];
    const plan = planMinionFamily(progress, ITEMS, owned({ mithril: 15 }));
    expect(plan?.allocation.reservations.get("mithril")).toBe(15);
    expect(plan?.shortages).toEqual([{ id: "mithril", name: "Mithril", required: 20, allocated: 15, remaining: 5, known: true }]);
  });
});