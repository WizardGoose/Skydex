import { describe, expect, it } from "vitest";
import { allocateCostTree, allocateCraftingTree, allocateCraftingQueue } from "../craftingAllocation";
import { buildCostTree } from "../useItemData";
import type { Item, ItemIndex } from "../useItemData";

const item = (name: string, over: Partial<Item> = {}): Item => ({
  name,
  hypixelId: name.toUpperCase().replace(/ /g, "_"),
  tier: null,
  category: null,
  npcSell: null,
  yields: 1,
  recipe: null,
  ...over,
});

const INDEX: ItemIndex = {
  enchanted_mithril: item("Enchanted Mithril", {
    recipe: [{ id: "mithril", name: "Mithril", qty: 160 }],
  }),
  mithril: item("Mithril"),
};

describe("crafting list allocation", () => {
  const items: ItemIndex = {
    leggings: item("Leggings", { recipe: [{ id: "component", name: "Component", qty: 7 }] }),
    boots: item("Boots", { recipe: [{ id: "component", name: "Component", qty: 4 }] }),
    component: item("Component", { recipe: [{ id: "raw", name: "Raw", qty: 10 }] }),
    raw: item("Raw"),
  };

  it("shares exact components and raw holdings across all goals without double spending", () => {
    const result = allocateCraftingQueue([{ id: "leggings", quantity: 1 }, { id: "boots", quantity: 1 }], items,
      { component: 3, raw: 50 }, { useRootInventory: false });
    expect(result.roots[0].children[0]).toMatchObject({ allocated: 3, remaining: 4 });
    expect(result.roots[1].children[0]).toMatchObject({ allocated: 0, remaining: 4 });
    expect(result.remaining).toEqual([{ id: "raw", name: "Raw", required: 80, allocated: 50, remaining: 30, known: true }]);
    expect([...result.reservations]).toEqual([["component", 3], ["raw", 50]]);
  });

  it("makes the requested output even if one is owned, while still using held ingredients", () => {
    const result = allocateCraftingQueue([{ id: "leggings", quantity: 1 }], items,
      { leggings: 1, component: 2 }, { useRootInventory: false });
    expect(result.roots[0]).toMatchObject({ requested: 1, allocated: 0, craftCount: 1 });
    expect(result.roots[0].children[0]).toMatchObject({ allocated: 2, craftCount: 5 });
    expect(result.remaining[0].remaining).toBe(50);
    expect(result.reservations.has("leggings")).toBe(false);
  });

  it("reuses batch surplus without calling it owned inventory", () => {
    const batchItems = { ...items, component: { ...items.component, yields: 8 } };
    const result = allocateCraftingQueue([{ id: "leggings", quantity: 1 }, { id: "boots", quantity: 1 }], batchItems,
      {}, { useRootInventory: false });
    expect(result.roots[1].children[0]).toMatchObject({ allocated: 0, fromCrafting: 1, remaining: 3, craftCount: 1 });
    expect(result.remaining[0].remaining).toBe(20);
    expect(result.reservations.size).toBe(0);
  });

  it("does not consume the reserved final output of an earlier goal as a later ingredient", () => {
    const result = allocateCraftingQueue([{ id: "component", quantity: 1 }, { id: "boots", quantity: 1 }], items,
      {}, { useRootInventory: false });
    expect(result.remaining[0].remaining).toBe(50);
  });

  it("keeps recipe-method overrides at the requested root and unknown stock unknown", () => {
    const result = allocateCraftingQueue([{ id: "boots", quantity: 2,
      item: { ...items.boots, yields: 2, recipe: [{ id: "raw", name: "Raw", qty: 3 }] } }], items,
      { count: () => undefined }, { useRootInventory: false });
    expect(result.roots[0]).toMatchObject({ craftCount: 1, craftOutput: 2 });
    expect(result.remaining).toEqual([{ id: "raw", name: "Raw", required: 3, allocated: 0, remaining: 3, known: false }]);
    expect(items.boots.recipe?.[0].id).toBe("component");
  });
});

describe("crafting inventory allocation", () => {
  it("uses 480 held Enchanted Mithril before expanding its recipe", () => {
    const result = allocateCraftingTree("enchanted_mithril", 480, INDEX, { enchanted_mithril: 480 });

    expect(result.root).toMatchObject({ requested: 480, allocated: 480, remaining: 0, craftCount: 0 });
    expect(result.root.children).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect([...result.reservations.entries()]).toEqual([["enchanted_mithril", 480]]);
  });

  it("expands only the uncovered remainder when enchanted stock is partial", () => {
    const result = allocateCraftingTree("enchanted_mithril", 480, INDEX, {
      enchanted_mithril: 200,
      mithril: 10_000,
    });

    expect(result.root).toMatchObject({ requested: 480, allocated: 200, remaining: 280, craftCount: 280 });
    expect(result.root.children[0]).toMatchObject({ requested: 44_800, allocated: 10_000, remaining: 34_800 });
    expect(result.remaining).toEqual([
      {
        id: "mithril",
        name: "Mithril",
        required: 44_800,
        allocated: 10_000,
        remaining: 34_800,
        known: true,
      },
    ]);
  });

  it("shares one reservation ledger across sibling branches", () => {
    const items: ItemIndex = {
      root: item("Root", {
        recipe: [
          { id: "left", name: "Left", qty: 1 },
          { id: "right", name: "Right", qty: 1 },
        ],
      }),
      left: item("Left", { recipe: [{ id: "common", name: "Common", qty: 10 }] }),
      right: item("Right", { recipe: [{ id: "common", name: "Common", qty: 10 }] }),
      common: item("Common"),
    };

    const result = allocateCraftingTree("root", 1, items, { common: 15 });
    const leftCommon = result.root.children[0].children[0];
    const rightCommon = result.root.children[1].children[0];

    expect(leftCommon).toMatchObject({ requested: 10, allocated: 10, remaining: 0 });
    expect(rightCommon).toMatchObject({ requested: 10, allocated: 5, remaining: 5 });
    expect([...result.reservations.entries()]).toEqual([["common", 15]]);
    expect(result.remaining).toEqual([
      {
        id: "common",
        name: "Common",
        required: 20,
        allocated: 15,
        remaining: 5,
        known: true,
      },
    ]);
  });

  it("reports exact component coverage without a second inventory subtraction", () => {
    const items: ItemIndex = {
      product: item("Product", {
        recipe: [
          { id: "component_a", name: "Component A", qty: 2 },
          { id: "component_b", name: "Component B", qty: 3 },
        ],
      }),
      component_a: item("Component A"),
      component_b: item("Component B"),
    };

    const result = allocateCraftingTree("product", 1, items, { component_a: 2, component_b: 3 });

    expect(result.root.children).toHaveLength(2);
    expect(result.root.children[0]).toMatchObject({ requested: 2, allocated: 2, remaining: 0 });
    expect(result.root.children[1]).toMatchObject({ requested: 3, allocated: 3, remaining: 0 });
    expect(result.remaining).toEqual([]);
  });

  it("preserves unknown counts for a count-source caller", () => {
    const result = allocateCraftingTree("mithril", 12, INDEX, { count: () => undefined });

    expect(result.root).toMatchObject({ allocated: 0, remaining: 12, inventoryKnown: false });
    expect(result.remaining).toEqual([
      {
        id: "mithril",
        name: "Mithril",
        required: 12,
        allocated: 0,
        remaining: 12,
        known: false,
      },
    ]);
  });

  it("applies the same exact and partial allocation to a costed Bazaar/Ironman tree", () => {
    const fullTree = buildCostTree("enchanted_mithril", 480, INDEX, {}, true);
    const full = allocateCostTree(fullTree, INDEX, { enchanted_mithril: 480 });
    expect(full.root.children).toEqual([]);
    expect(full.remaining).toEqual([]);

    const partialTree = buildCostTree("enchanted_mithril", 480, INDEX, {}, true);
    const partial = allocateCostTree(partialTree, INDEX, {
      enchanted_mithril: 200,
      mithril: 10_000,
    });
    expect(partial.root).toMatchObject({ requested: 480, allocated: 200, remaining: 280, craftCount: 280 });
    expect(partial.root.children[0]).toMatchObject({ requested: 44_800, allocated: 10_000, remaining: 34_800 });
    expect(partial.remaining).toEqual([
      {
        id: "mithril",
        name: "Mithril",
        required: 44_800,
        allocated: 10_000,
        remaining: 34_800,
        known: true,
      },
    ]);
  });});


const alternativeTestItems: ItemIndex = {
  product: item("Product", {
    recipe: [{ id: "oak_planks", name: "Oak Planks", qty: 4, alternatives: [{ id: "birch_planks", name: "Birch Planks" }] }],
  }),
  oak_planks: item("Oak Planks"),
  birch_planks: item("Birch Planks"),
};

describe("interchangeable recipe alternatives", () => {
  it("fills a requirement from one held variant", () => {
    const result = allocateCraftingTree("product", 1, alternativeTestItems, { oak_planks: 4 });
    const planks = result.root.children[0];

    expect(planks).toMatchObject({ requested: 4, allocated: 4, remaining: 0, inventoryKnown: true });
    expect(planks.selectedAlternative).toEqual({ id: "oak_planks", name: "Oak Planks" });
    expect(result.remaining).toEqual([]);
    expect([...result.reservations.entries()]).toEqual([["oak_planks", 4]]);
  });

  it("splits a requirement across valid variants", () => {
    const result = allocateCraftingTree("product", 1, alternativeTestItems, { oak_planks: 2, birch_planks: 2 });
    const planks = result.root.children[0];

    expect(planks).toMatchObject({ requested: 4, allocated: 4, remaining: 0 });
    expect(planks.allocatedByAlternative).toEqual([
      { id: "oak_planks", name: "Oak Planks", allocated: 2 },
      { id: "birch_planks", name: "Birch Planks", allocated: 2 },
    ]);
    expect(result.remaining).toEqual([]);
    expect([...result.reservations.entries()]).toEqual([
      ["birch_planks", 2],
      ["oak_planks", 2],
    ]);
  });

  it("reports only the residual interchangeable quantity", () => {
    const result = allocateCraftingTree("product", 1, alternativeTestItems, { oak_planks: 1, birch_planks: 1 });
    const planks = result.root.children[0];

    expect(planks).toMatchObject({ requested: 4, allocated: 2, remaining: 2 });
    expect(result.remaining).toEqual([
      {
        id: "oak_planks",
        name: "Oak Planks",
        required: 4,
        allocated: 2,
        remaining: 2,
        known: true,
      },
    ]);
  });

  it("does not multiply one grouped quantity by the number of variants", () => {
    const result = allocateCraftingTree("product", 1, alternativeTestItems, { oak_planks: 4, birch_planks: 4 });
    const planks = result.root.children[0];

    expect(planks.requested).toBe(4);
    expect(planks.allocated).toBe(4);
    expect([...result.reservations.values()].reduce((sum, quantity) => sum + quantity, 0)).toBe(4);
    expect(result.remaining).toEqual([]);
  });
});

describe("alternative cost decisions", () => {
  it("selects the cheapest valid variant without multiplying the requirement", () => {
    const items: ItemIndex = {
      product: item("Product", {
        recipe: [{ id: "oak_planks", name: "Oak Planks", qty: 4, alternatives: [{ id: "birch_planks", name: "Birch Planks" }] }],
      }),
      oak_planks: item("Oak Planks"),
      birch_planks: item("Birch Planks"),
    };
    const tree = buildCostTree(
      "product",
      1,
      items,
      {
        OAK_PLANKS: { buy: 10, sell: 1 },
        BIRCH_PLANKS: { buy: 2, sell: 1 },
      },
      false
    );
    const group = tree.children[0];
    expect(group.id).toBe("birch_planks");
    expect(group.qty).toBe(4);
    expect(group.cost).toBe(8);
    expect(group.alternatives).toEqual([{ id: "oak_planks", name: "Oak Planks" }]);
    expect(tree.craftCost).toBe(8);
  });
});
