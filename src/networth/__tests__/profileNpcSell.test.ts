import { describe, expect, it } from "vitest";
import type { Item, ItemIndex } from "../../items/useItemData";
import { profileNpcSellSummary } from "../profileNpcSell";
import type { ParsedItems } from "../profileNetworth";

const item = (name: string, hypixelId: string, npcSell: number | null): Item => ({
  name,
  hypixelId,
  tier: null,
  category: null,
  npcSell,
  yields: 1,
  recipe: null,
});

const index: ItemIndex = {
  enchanted_mithril: item("Enchanted Mithril", "ENCHANTED_MITHRIL", 1_600),
  diamond: item("Diamond", "DIAMOND", 8),
  unknown: item("Unpriced Relic", "UNPRICED_RELIC", null),
};

describe("profileNpcSellSummary", () => {
  it("aggregates raw profile containers and sacks without counting non-item profile data", () => {
    const parsed: ParsedItems = {
      inventory: [
        { Count: 3, tag: { display: { Name: "§bEnchanted Mithril" }, ExtraAttributes: { id: "ENCHANTED_MITHRIL" } } },
        {},
      ],
      enderchest: [
        { Count: 5, tag: { display: { Name: "§aDiamond" }, ExtraAttributes: { id: "DIAMOND" } } },
      ],
      sacks: [
        { id: "ENCHANTED_MITHRIL", amount: 7 },
      ],
      pets: [{ type: "SHEEP", tier: "LEGENDARY", exp: 1_000_000 }],
      essence: [{ id: "WITHER", amount: 400 }],
    };

    const summary = profileNpcSellSummary(parsed, index);

    expect(summary?.total).toBe(16_040);
    expect(summary?.rows).toEqual([
      expect.objectContaining({
        id: "ENCHANTED_MITHRIL",
        name: "Enchanted Mithril",
        count: 10,
        unit: 1_600,
        total: 16_000,
        sources: [
          { label: "Inventory", count: 3 },
          { label: "Sacks", count: 7 },
        ],
      }),
      expect.objectContaining({ id: "DIAMOND", count: 5, total: 40 }),
    ]);
  });

  it("reports held but unpriced item ids instead of treating them as zero", () => {
    const summary = profileNpcSellSummary({
      storage: [
        { Count: 2, tag: { ExtraAttributes: { id: "UNPRICED_RELIC" } } },
        { Count: 4, tag: { ExtraAttributes: { id: "NOT_IN_RESOURCE" } } },
      ],
    }, index);

    expect(summary).toMatchObject({ total: 0, rows: [], unpricedIds: 2, unpricedCount: 6 });
  });

  it("joins captured island chests without dropping the Profile API containers", () => {
    const summary = profileNpcSellSummary({
      inventory: [
        { Count: 2, tag: { ExtraAttributes: { id: "DIAMOND" } } },
      ],
      sacks: [{ id: "ENCHANTED_MITHRIL", amount: 3 }],
    }, index, [{
      label: "Island Chests",
      items: [
        { id: "DIAMOND", name: "Diamond", count: 4 },
        { id: "ENCHANTED_MITHRIL", name: "Enchanted Mithril", count: 5 },
      ],
    }]);

    expect(summary?.total).toBe(12_848);
    expect(summary?.rows).toEqual([
      expect.objectContaining({
        id: "ENCHANTED_MITHRIL",
        count: 8,
        sources: [
          { label: "Sacks", count: 3 },
          { label: "Island Chests", count: 5 },
        ],
      }),
      expect.objectContaining({
        id: "DIAMOND",
        count: 6,
        sources: [
          { label: "Inventory", count: 2 },
          { label: "Island Chests", count: 4 },
        ],
      }),
    ]);
  });

  it("can value captured containers when the Profile API snapshot is unavailable", () => {
    const summary = profileNpcSellSummary(null, index, [{
      label: "Inventory",
      items: [{ id: "DIAMOND", name: "Diamond", count: 7 }],
    }]);

    expect(summary?.total).toBe(56);
    expect(summary?.rows[0]).toMatchObject({ id: "DIAMOND", count: 7 });
  });

  it("stays unavailable until there is an item source and an item resource", () => {
    expect(profileNpcSellSummary(null, index)).toBeNull();
    expect(profileNpcSellSummary({ inventory: [] }, {})).toBeNull();
  });
});
