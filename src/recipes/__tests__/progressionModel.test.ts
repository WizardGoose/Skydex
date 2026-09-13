import { describe, expect, it } from "vitest";
import type { OwnedIndex } from "../../inventory";
import type { CollectionPreviewEntry } from "../../profile/petsBestiaryCollections";
import { collectionSourceGateFor } from "../../profile/collectionSourceGate";
import type { Item } from "../../items/useItemData";
import type { ForgeRecipe } from "../../items/wikiForge";
import {
  buildCollectionProgressIndex,
  buildRecipeBook,
  summarizeRecipeBook,
} from "../progressionModel";

const item = (name: string, overrides: Partial<Item> = {}): Item => ({
  name,
  hypixelId: name.toUpperCase().replace(/\W+/g, "_"),
  tier: "RARE",
  category: "ITEM",
  npcSell: null,
  yields: 1,
  recipe: [{ id: "material", name: "Material", qty: 8 }],
  ...overrides,
});

const collection = (overrides: Partial<CollectionPreviewEntry> = {}): CollectionPreviewEntry => ({
  id: "INK_SACK:3",
  name: "Cocoa Beans",
  category: "Farming",
  amount: 2_500,
  unlockedTier: 4,
  maxTier: 9,
  isMaxed: false,
  nextTier: 5,
  nextRequired: 5_000,
  progressPercent: 50,
  ...overrides,
});

const owned = (counts: Record<string, number> | null): OwnedIndex => ({
  has: counts !== null,
  get: () => undefined,
  count: (key) => counts?.[key],
  auto: (key) => counts?.[key],
  sources: counts === null ? [] : ["island.inventory"],
  entries: () => [],
  keys: () => Object.keys(counts ?? {}),
});

const forgeRecipe = (overrides: Partial<ForgeRecipe> = {}): ForgeRecipe => ({
  name: "Forged Result",
  wikiTitle: null,
  section: "Refining",
  ingredients: [{ name: "Material", qty: 4 }],
  coins: 10_000,
  seconds: 60,
  duration: "1m",
  hotm: null,
  requirement: null,
  ...overrides,
});

const noProgress = { slayerLevels: null, trophyFish: null, skillLevels: null };

describe("recipe collection progression", () => {
  it("separates unlocked, locked, and unverifiable collection recipes", () => {
    const recipeItem = item("Collection Recipe", {
      unlocks: [{ collection: "Cocoa Beans", tier: 5, required: 5_000, type: "Recipe" }],
    });
    const base = { collection_recipe: recipeItem };

    const locked = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection()]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(locked.accessStatus).toBe("locked");
    expect(locked.preferredMethod.accessGates[0]).toMatchObject({
      state: "unmet",
      current: 2_500,
      target: 5_000,
      progressPercent: 50,
    });

    const unlocked = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection({ amount: 6_000, unlockedTier: 5 })]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(unlocked.accessStatus).toBe("unlocked");

    const unknown = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: null,
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(unknown.accessStatus).toBe("unknown");

    const countOnly = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection({ unlockedTier: null })]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(countOnly.accessStatus).toBe("unknown");
  });

  it("accepts a collection total when Hypixel's evaluated tier list is lagging", () => {
    const recipeItem = item("Lagging Tier Recipe", {
      unlocks: [{ collection: "Cocoa Beans", tier: 5, required: 5_000, type: "Recipe" }],
    });
    const base = { lagging_tier_recipe: recipeItem };
    const entry = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection({ amount: 6_000, unlockedTier: 4 })]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(entry.accessStatus).toBe("unlocked");
    expect(entry.preferredMethod.accessGates[0]).toMatchObject({
      state: "met",
      current: 6_000,
      target: 5_000,
      progressPercent: 100,
      progressLabel: "6,000 / 5,000",
    });
    expect(entry.preferredMethod.accessGates[0].detail).toContain("evaluated tier list has not caught up");
  });

  it("does not assert a lock above an evaluated tier list proven to be stale", () => {
    const recipeItem = item("Grandfathered Recipe", {
      unlocks: [{ collection: "Ruby Veilshroom", tier: 5, required: 1_000, type: "Recipe" }],
    });
    const base = { grandfathered_recipe: recipeItem };
    const entry = buildRecipeBook({
      items: base,
      sourceItems: base,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection({
        id: "RUBY_VEILSHROOM",
        name: "Ruby Veilshroom",
        amount: 972,
        unlockedTier: 1,
        nextTier: 2,
        nextRequired: 100,
      })]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    })[0];
    expect(entry.accessStatus).toBe("unknown");
    expect(entry.preferredMethod.accessGates[0]).toMatchObject({
      state: "unknown",
      current: 972,
      target: 1_000,
      progressLabel: "972 / 1,000",
    });
    expect(entry.preferredMethod.accessGates[0].detail).toContain("cannot safely call the recipe locked");
  });

  it("treats multiple collection unlocks as alternative paths", () => {
    const recipeItem = item("Alternative Unlock", {
      unlocks: [
        { collection: "Cocoa Beans", tier: 5, required: 5_000, type: "Recipe" },
        { collection: "Potato", tier: 2, required: 100, type: "Recipe" },
      ],
    });
    const entries = buildRecipeBook({
      items: { alternative_unlock: recipeItem },
      sourceItems: { alternative_unlock: recipeItem },
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([
        collection(),
        collection({ id: "POTATO_ITEM", name: "Potato", amount: 120, unlockedTier: 2 }),
      ]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    });
    expect(entries[0].accessStatus).toBe("unlocked");
    expect(entries[0].preferredMethod.accessGates.every((gate) => gate.alternative)).toBe(true);
  });

  it("carries a collection's source route into recipe guidance", () => {
    const sourceGate = collectionSourceGateFor("CHILI_PEPPER", {
      slayerLevels: { blaze: 0 },
      trophyFish: null,
      skillLevels: null,
    });
    const chili = collection({
      id: "CHILI_PEPPER",
      name: "Chili Pepper",
      amount: 0,
      unlockedTier: 0,
      nextTier: 1,
      nextRequired: 10,
      progressPercent: 0,
      sourceGate,
    });
    const recipeItem = item("Pepper Recipe", {
      unlocks: [{ collection: "Chili Pepper", tier: 1, required: 10, type: "Recipe" }],
    });
    const input = {
      items: { pepper_recipe: recipeItem },
      sourceItems: { pepper_recipe: recipeItem },
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([chili]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    };

    const normalGate = buildRecipeBook({ ...input, tradingAllowed: true })[0].preferredMethod.accessGates[0];
    const restrictedGate = buildRecipeBook({ ...input, tradingAllowed: false })[0].preferredMethod.accessGates[0];
    expect(normalGate.sourceAccess).toMatchObject({ state: "available", route: "trade", label: "Inferno 3 or trade" });
    expect(normalGate.how).toContain("Trade for an Inferno Minion");
    expect(restrictedGate.sourceAccess).toMatchObject({ state: "locked", route: null, label: "Requires Inferno 3" });
    expect(restrictedGate.how).toContain("Level Inferno Demonlord slayer to 3");
  });

  it("keeps ungated recipes unlocked and distinguishes tracked shortages from unknown holdings", () => {
    const recipeItem = item("Plain Recipe");
    const base = { plain_recipe: recipeItem };
    const ready = buildRecipeBook({ items: base, sourceItems: base, forgeRecipes: [], collections: null, owned: owned({ material: 8 }), playerProgress: noProgress })[0];
    const missing = buildRecipeBook({ items: base, sourceItems: base, forgeRecipes: [], collections: null, owned: owned({}), playerProgress: noProgress })[0];
    const unknown = buildRecipeBook({ items: base, sourceItems: base, forgeRecipes: [], collections: null, owned: owned(null), playerProgress: noProgress })[0];
    expect(ready).toMatchObject({ accessStatus: "unlocked", materialStatus: "ready" });
    expect(missing).toMatchObject({ materialStatus: "missing" });
    expect(missing.preferredMethod).toMatchObject({ missingItems: 8, missingTypes: 1 });
    expect(unknown).toMatchObject({ materialStatus: "unknown" });
  });

  it("includes Forge recipes and leaves unverified Forge gates unknown", () => {
    const forged = item("Forged Result", { recipe: null });
    const entries = buildRecipeBook({
      items: { forged_result: forged },
      sourceItems: { forged_result: forged },
      forgeRecipes: [forgeRecipe({ hotm: 4 })],
      collections: null,
      owned: owned({ material: 4 }),
      playerProgress: noProgress,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0].preferredMethod).toMatchObject({ kind: "forge", accessStatus: "unknown", materialStatus: "ready" });
    expect(entries[0].preferredMethod.accessGates[0].label).toBe("Heart of the Mountain 4");
  });

  it("summarizes the whole recipe book without counting arbitrary non-recipes", () => {
    const plain = item("Plain");
    const gated = item("Gated", { unlocks: [{ collection: "Cocoa Beans", tier: 5, required: 5_000, type: "Recipe" }] });
    const notARecipe = item("Not a recipe", { recipe: null });
    const all = { plain, gated, not_a_recipe: notARecipe };
    const entries = buildRecipeBook({
      items: all,
      sourceItems: all,
      forgeRecipes: [],
      collections: buildCollectionProgressIndex([collection()]),
      owned: owned({ material: 8 }),
      playerProgress: noProgress,
    });
    expect(summarizeRecipeBook(entries)).toEqual({
      total: 2,
      unlocked: 1,
      locked: 1,
      unknown: 0,
      ready: 1,
      missing: 0,
      holdingsUnknown: 0,
    });
  });
});
