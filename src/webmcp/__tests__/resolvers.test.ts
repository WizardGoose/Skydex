import { describe, expect, it } from "vitest";
import type { ItemIndex } from "../../items/useItemData";
import type { OwnedIndex } from "../../inventory/types";
import type { FusionData, Recipe } from "../../utilities/recipeUtils";
import type { CropDefinition, MutationDefinition } from "../../greenhouse/types/greenhouse";
import type { SectionKey, SectionProvenance } from "../../island/merge";
import type { IslandSnapshot } from "../../island/types";
import { resolveMutation } from "../greenhouse";
import { completeKnownSackRows, connectedSourceCoverage, holdingsCoverage, resolveItem } from "../inventory";
import { dedupeFusionRecipes, resolveShardKey } from "../shards";

describe("WebMCP exact-name resolvers", () => {
  it("resolves item names, Skydex keys, and Hypixel IDs without fuzzy guessing", () => {
    const items: ItemIndex = {
      aspect_of_the_end: {
        name: "Aspect of the End",
        hypixelId: "ASPECT_OF_THE_END",
        tier: "rare",
        category: "sword",
        npcSell: null,
        yields: 1,
        recipe: null,
      },
    };

    expect(resolveItem(items, "Aspect of the End").match?.key).toBe("aspect_of_the_end");
    expect(resolveItem(items, "aspect_of_the_end").match?.key).toBe("aspect_of_the_end");
    expect(resolveItem(items, "ASPECT_OF_THE_END").match?.key).toBe("aspect_of_the_end");
    expect(resolveItem(items, "Aspect")).toMatchObject({
      match: null,
      suggestions: [{ key: "aspect_of_the_end" }],
    });
  });

  it("prefers the current exact key or name when historical items share its Hypixel ID", () => {
    const base = {
      tier: "legendary",
      category: "bow",
      npcSell: null,
      yields: 1,
      recipe: null,
    } as const;
    const items: ItemIndex = {
      terminator: { ...base, name: "Terminator", hypixelId: "TERMINATOR" },
      terminator_before_0_16_1: { ...base, name: "Terminator (Before 0.16.1)", hypixelId: "TERMINATOR" },
      terminator_old: { ...base, name: "Terminator (Old)", hypixelId: "TERMINATOR" },
    };

    expect(resolveItem(items, "Terminator").match?.key).toBe("terminator");
    expect(resolveItem(items, "TERMINATOR").match?.key).toBe("terminator");
    expect(resolveItem(items, "Terminator (Old)").match?.key).toBe("terminator_old");
  });

  it("resolves shard names, keys, and internal IDs", () => {
    const data: FusionData = {
      shards: {
        L1: {
          name: "Sea Archer",
          family: "Aqua",
          type: "Combat",
          rarity: "common",
          fuse_amount: 1,
          internal_id: "ATTRIBUTE_SHARD_SEA_ARCHER",
        },
      },
      recipes: {},
    };

    expect(resolveShardKey(data, "Sea Archer")).toBe("L1");
    expect(resolveShardKey(data, "L1")).toBe("L1");
    expect(resolveShardKey(data, "ATTRIBUTE_SHARD_SEA_ARCHER")).toBe("L1");
  });

  it("explains that a base crop is not a mutation and supplies valid examples", () => {
    const mutations: MutationDefinition[] = [
      {
        id: "gloomgourd",
        name: "Gloomgourd",
        size: 1,
        ground: "farmland",
        requirements: [],
        rarity: "common",
        growth_stages: 1,
        positive_buffs: [],
        negative_buffs: [],
        drops: {},
      },
      {
        id: "soggybud",
        name: "Soggybud",
        size: 1,
        ground: "farmland",
        requirements: [],
        rarity: "common",
        growth_stages: 1,
        positive_buffs: [],
        negative_buffs: [],
        drops: {},
      },
    ];
    const crops: CropDefinition[] = [{
      id: "sunflower",
      name: "Sunflower",
      size: 1,
      priority: 0,
      ground: "farmland",
      growth_stages: 1,
      positive_buffs: [],
      negative_buffs: [],
    }];

    expect(() => resolveMutation(mutations, "Sunflower", crops)).toThrow(
      "Sunflower is a base crop, not a mutation target. Valid mutation examples: Gloomgourd (gloomgourd), Soggybud (soggybud).",
    );
  });
});

describe("WebMCP bounded result helpers", () => {
  const owned = (known: readonly string[]): Pick<OwnedIndex, "get" | "has"> => ({
    has: known.length > 0,
    get: (key) => known.includes(key) ? {
      key,
      hypixelId: key.toUpperCase(),
      auto: 0,
      sources: [],
      manual: 0,
      total: 0,
      overridden: true,
    } : undefined,
  });

  it("describes holdings coverage for the exact requested rows", () => {
    expect(holdingsCoverage(null, ["one"])).toBe("not_requested");
    expect(holdingsCoverage(owned([]), ["one"])).toBe("unavailable");
    expect(holdingsCoverage(owned(["one"]), ["one", "two"])).toBe("partial");
    expect(holdingsCoverage(owned(["one", "two"]), ["one", "two"])).toBe("available");
  });

  it("fills omitted valid sack items as known zeroes without replacing reported rows", () => {
    const rows = completeKnownSackRows(
      [
        { id: "MAGMA_CREAM", amount: 12 },
        { id: "FUTURE_API_ITEM", amount: 3 },
      ],
      {
        blaze_powder: { name: "Blaze Powder", hypixelId: "BLAZE_POWDER" },
        magma_cream: { name: "Magma Cream", hypixelId: "MAGMA_CREAM" },
        unrelated: { name: "Hyperion", hypixelId: "HYPERION" },
      },
      [{ sack: "Lava Fishing Sack", icon: null, items: ["Blaze Powder", "Magma Cream"] }],
    );

    expect(rows).toEqual([
      { id: "MAGMA_CREAM", amount: 12 },
      { id: "FUTURE_API_ITEM", amount: 3 },
      { id: "BLAZE_POWDER", amount: 0 },
    ]);
  });

  it("does not invent sack zeroes when the membership catalogue is unavailable", () => {
    const rows = [{ id: "MAGMA_CREAM", amount: 12 }];
    expect(completeKnownSackRows(
      rows,
      { blaze_powder: { name: "Blaze Powder", hypixelId: "BLAZE_POWDER" } },
      [],
    )).toEqual(rows);
  });

  it("reports cached Hypixel containers when the route-local island store has not loaded them", () => {
    const sections = Object.fromEntries(
      (["sacks", "chests", "inventory", "enderChest", "storage"] as const)
        .map((key) => [key, { state: "absent", source: null, at: null }]),
    ) as Record<SectionKey, SectionProvenance>;
    const coverage = connectedSourceCoverage(
      { snapshot: null, sections },
      {
        parsed: {
          sacks: [{ id: "WHEAT", amount: 0 }],
          inventory: [{ Count: 1 }],
          enderchest: [],
          storage: [{ Count: 1 }],
        },
        inventoryShared: true,
        sacksShared: true,
        vaultShared: false,
        museumShared: false,
        fetchedAt: 2_000,
      },
    );

    expect(coverage).toMatchObject({
      sacks: { state: "captured", source: "api" },
      chests: { state: "absent", source: null },
      inventory: { state: "captured", source: "api" },
      enderChest: { state: "empty", source: "api" },
      storage: { state: "captured", source: "api" },
    });
  });

  it("does not use a shared inventory blob as proof that sacks were shared", () => {
    const sections = Object.fromEntries(
      (["sacks", "chests", "inventory", "enderChest", "storage"] as const)
        .map((key) => [key, { state: "absent", source: null, at: null }]),
    ) as Record<SectionKey, SectionProvenance>;
    const coverage = connectedSourceCoverage(
      { snapshot: null, sections },
      {
        parsed: { sacks: [], inventory: [] },
        inventoryShared: true,
        sacksShared: false,
        vaultShared: false,
        museumShared: false,
        fetchedAt: 2_000,
      },
    );

    expect(coverage.sacks).toEqual({ state: "absent", source: null, fetched_at: null });
    expect(coverage.inventory).toMatchObject({ state: "empty", source: "api" });
  });

  it("keeps cached mod chests while reporting API-backed inventory coverage", () => {
    const at = 1_000;
    const snapshot: IslandSnapshot = {
      schema: 1,
      exportedAt: at,
      player: { uuid: "u", name: "Wizard" },
      profile: { name: "Pomegranate", gameMode: null },
      sacks: {},
      chests: [{ pos: [0, 0, 0], name: "Chest", lastSeen: at, items: [] }],
    };
    const sections: Record<SectionKey, SectionProvenance> = {
      sacks: { state: "empty", source: "mod", at },
      chests: { state: "captured", source: "mod", at },
      inventory: { state: "absent", source: null, at: null },
      enderChest: { state: "absent", source: null, at: null },
      storage: { state: "absent", source: null, at: null },
    };
    const coverage = connectedSourceCoverage(
      { snapshot, sections },
      {
        parsed: { sacks: [{ id: "WHEAT", amount: 0 }], inventory: [], enderchest: [], storage: [] },
        inventoryShared: true,
        sacksShared: true,
        vaultShared: false,
        museumShared: false,
        fetchedAt: 2_000,
      },
    );

    expect(coverage.chests).toMatchObject({ state: "captured", source: "mod" });
    expect(coverage.inventory).toMatchObject({ state: "empty", source: "api" });
    expect(coverage.sacks).toMatchObject({ state: "captured", source: "mod+api" });
  });

  it("deduplicates commutative fusion inputs without merging different outputs", () => {
    const recipes: Recipe[] = [
      { input1: "C10", input2: "R30", output: "C1", quantity: 2 },
      { input1: "R30", input2: "C10", output: "C1", quantity: 2 },
      { input1: "C10", input2: "R30", output: "C2", quantity: 2 },
    ];

    expect(dedupeFusionRecipes(recipes)).toEqual([recipes[0], recipes[2]]);
  });
});
