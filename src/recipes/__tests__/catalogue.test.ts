import { describe, expect, it } from "vitest";
import type { Item, ItemIndex } from "../../items/useItemData";
import { buildSkyBlockPlanningIndex, isSkyBlockCatalogueItem } from "../catalogue";

const makeItem = (name: string, overrides: Partial<Item> = {}): Item => ({
  name,
  hypixelId: name.toUpperCase().replaceAll(" ", "_"),
  tier: null,
  category: null,
  npcSell: null,
  yields: 1,
  recipe: null,
  ...overrides,
});

describe("SkyBlock recipe boundary", () => {
  it("keeps vanilla recipes out of the catalogue", () => {
    expect(isSkyBlockCatalogueItem(makeItem("SkyBlock item"))).toBe(true);
    expect(isSkyBlockCatalogueItem(makeItem("Chest", { vanilla: true }))).toBe(false);
    expect(isSkyBlockCatalogueItem(makeItem("?Slab", { hypixelId: null }))).toBe(false);
  });

  it("keeps vanilla items as materials without expanding their crafting grids", () => {
    const skyBlock = makeItem("Storage Upgrade", {
      recipe: [{ id: "chest", name: "Chest", qty: 1 }],
    });
    const vanilla = makeItem("Chest", {
      vanilla: true,
      recipe: [{ id: "oak_planks", name: "Oak Planks", qty: 8 }],
    });
    const items: ItemIndex = { storage_upgrade: skyBlock, chest: vanilla };

    const planning = buildSkyBlockPlanningIndex(items);

    expect(planning.storage_upgrade).toBe(skyBlock);
    expect(planning.chest.recipe).toBeNull();
    expect(planning.chest.name).toBe("Chest");
    expect(items.chest.recipe).toHaveLength(1);
  });
});
