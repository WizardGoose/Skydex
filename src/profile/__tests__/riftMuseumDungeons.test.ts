import { describe, expect, it } from "vitest";
import { nbt, writeNbtBlob } from "../../nbt";
import type { Catalogue, NetworthResult, ValuedItem } from "../../networth/types";
import {
  buildMuseumApiProjection,
  buildDungeonsPreviewModel,
  buildMuseumPreviewModel,
  buildRiftPreviewModel,
  buildRiftItemProjection,
  resolveProfileSectionState,
} from "../riftMuseumDungeons";
import { profileStatusView } from "../profileStatus";

const valued = (id: string, name: string, price: number): ValuedItem => ({
  id,
  customId: id,
  name,
  price,
  basePrice: price,
  count: 1,
  soulbound: true,
  cosmetic: false,
  soulboundPortion: 0,
  calculation: [],
});

const museumResult = (items: readonly ValuedItem[], total: number): NetworthResult => ({
  networth: total,
  unsoulboundNetworth: 0,
  noInventory: false,
  purse: 0,
  bank: 0,
  personalBank: 0,
  types: {
    museum: { total, unsoulboundTotal: 0, items: [...items] },
  },
});

describe("Rift, Museum, and Dungeons profile section models", () => {
  it("keeps a cached section visible across refresh, error, and missing-key states", () => {
    expect(resolveProfileSectionState(profileStatusView("loading", true), "partial")).toBe("partial");
    expect(resolveProfileSectionState(profileStatusView("error", true), "populated")).toBe("populated");
    expect(resolveProfileSectionState(profileStatusView("needsKey", true), "empty")).toBe("empty");
  });

  it("does not paint uncached requests as successful sections", () => {
    expect(resolveProfileSectionState(profileStatusView("loading", false), "populated")).toBe("loading");
    expect(resolveProfileSectionState(profileStatusView("needsKey", false), "populated")).toBe("private");
    expect(resolveProfileSectionState(profileStatusView("error", false), "empty")).toBe("unavailable");
  });

  it("keeps Rift fields unavailable when the API only exposed the gallery", () => {
    const model = buildRiftPreviewModel({
      rift: {
        access: { consumed_prism: true },
        gallery: {
          secured_trophies: [{ type: "RIFT_TROPHY_TEST", timestamp: 10, visits: 2 }],
        },
      },
    });

    expect(model.state).toBe("partial");
    expect(model.consumedPrism).toBe(true);
    expect(model.timecharms).toHaveLength(1);
    expect(model.currencies).toEqual([]);
    expect(model.missingFields).toEqual(["currencies", "stats", "quests", "inventory", "pet"]);
  });

  it("decodes exact Rift slot geometry, Montezuma, currencies, and proven progression", async () => {
    const container = {
      type: 0,
      data: await writeNbtBlob("", nbt.compound({
        i: nbt.list("compound", [
          nbt.compound({
            Count: nbt.byte(2),
            tag: nbt.compound({
              ExtraAttributes: nbt.compound({ id: nbt.string("RIFT_ITEM") }),
              display: nbt.compound({ Name: nbt.string("§5Rift Item"), Lore: nbt.list("string", [nbt.string("§5§lEPIC")]) }),
            }),
          }),
          nbt.compound(),
          nbt.compound({
            Count: nbt.byte(1),
            tag: nbt.compound({ ExtraAttributes: nbt.compound({ id: nbt.string("SECOND_RIFT_ITEM") }) }),
          }),
        ]),
      })),
    };
    const member = {
      currencies: { motes_purse: 4_321 },
      player_stats: { rift: { lifetime_motes_earned: 9_876 } },
      rift: {
        inventory: {
          inv_armor: container,
          equipment_contents: container,
          inv_contents: container,
          ender_chest_contents: container,
        },
        dead_cats: {
          found_cats: ["one", "two"],
          montezuma: { type: "MONTEZUMA", tier: "EPIC", exp: 123, candyUsed: 0 },
        },
        gallery: { secured_trophies: [] },
        castle: { grubber_stacks: 3 },
      },
    };
    const items = await buildRiftItemProjection(member, (id) => id === "SECOND_RIFT_ITEM" ? "Second Rift Item" : null);
    const model = buildRiftPreviewModel(member, {
      itemSurfaces: items.itemSurfaces,
      activePet: items.activePet,
      inventoryAvailable: items.inventoryPresent,
      petAvailable: items.petPresent,
    });

    expect(items.itemSurfaces.map((surface) => surface.key)).toEqual(["armor", "equipment", "inventory", "ender_chest"]);
    expect(items.itemSurfaces[2].slots).toHaveLength(3);
    expect(items.itemSurfaces[2].slots[1]).toBeNull();
    expect(items.itemSurfaces[2].slots[0]).toMatchObject({ id: "RIFT_ITEM", count: 2, tier: "epic" });
    expect(model.activePet).toMatchObject({ type: "MONTEZUMA", tier: "epic", foundSoulPieces: 2 });
    expect(model.currencies).toEqual([{ key: "motes_purse", label: "Motes", value: 4_321 }]);
    expect(model.stats).toEqual(expect.arrayContaining([
      { key: "lifetime_motes_earned", label: "Lifetime Motes earned", value: 9_876 },
      { key: "grubber_stacks", label: "McGrubber Burger stacks", value: 3 },
      { key: "found_cats", label: "Soul Pieces found", value: 2 },
    ]));
    expect(model.missingFields).toEqual(["quests"]);
  });

  it("distinguishes Museum empty and populated data without inventing completion", () => {
    const empty = buildMuseumPreviewModel({
      parsed: { museum: [] },
      result: museumResult([], 0),
      coverage: { museumShared: true },
    });
    expect(empty.state).toBe("empty");
    expect(empty.completion).toBeNull();

    const populated = buildMuseumPreviewModel({
      parsed: {
        museum: [{
          Count: 1,
          tag: { ExtraAttributes: { id: "TEST_ITEM" }, display: { Name: "§aTest Item" } },
        }],
      },
      result: museumResult([valued("TEST_ITEM", "Test Item", 420)], 420),
      coverage: { museumShared: true },
      completion: { completed: 1, total: 2 },
      itemCategoryFor: (id) => id === "TEST_ITEM" ? "SWORD" : null,
    });

    expect(populated.state).toBe("populated");
    expect(populated.donations).toEqual([
      expect.objectContaining({ id: "TEST_ITEM", name: "Test Item", category: "SWORD", count: 1, value: 420 }),
    ]);
    expect(populated.value).toBe(420);
    expect(populated.completion).toEqual({ completed: 1, total: 2 });
  });

  it("keeps API value, appraisal, groups, special donations, and borrowing metadata", () => {
    const encoded = { type: 0, data: "encoded-nbt" };
    const api = buildMuseumApiProjection({
      profile: {
        value: 987_654,
        appraisal: true,
        items: {
          HYPERION: { donated_time: 11, items: encoded },
          NECRON_HELMET: { donated_time: 12, borrowing: true, items: encoded },
        },
        special: [{ donated_time: 13, items: encoded }],
      },
    });

    expect(api).toMatchObject({ present: true, value: 987_654, appraisal: true });
    expect(api.itemGroups).toEqual([
      expect.objectContaining({ key: "HYPERION", kind: "standard", borrowed: null, donatedAt: 11, payload: "encoded" }),
      expect.objectContaining({ key: "NECRON_HELMET", kind: "standard", borrowed: true, donatedAt: 12, payload: "encoded" }),
    ]);
    expect(api.specialDonations).toEqual([
      expect.objectContaining({ key: "special-1", kind: "special", donatedAt: 13, payload: "encoded" }),
    ]);
    expect(api.missingFields).toEqual([]);

    const model = buildMuseumPreviewModel({
      museum: {
        value: 987_654,
        appraisal: true,
        items: { HYPERION: { donated_time: 11, items: encoded } },
        special: [{ donated_time: 13, items: encoded }],
      },
      parsed: { museum: [] },
      result: museumResult([], 0),
      coverage: { museumShared: true },
    });
    expect(model.value).toBe(987_654);
    expect(model.api?.appraisal).toBe(true);
    expect(model.api?.itemGroups).toHaveLength(1);
    expect(model.state).toBe("partial");
  });

  it("uses canonical Museum bundles and only marks absent API units missing", () => {
    const catalogue: Catalogue = {
      TEST_HELMET: {
        id: "TEST_HELMET",
        name: "Test Helmet",
        category: "HELMET",
        tier: "RARE",
        museum_data: { armor_set_donation_xp: { TEST_SET: 2 } },
      },
      TEST_BOOTS: {
        id: "TEST_BOOTS",
        name: "Test Boots",
        category: "BOOTS",
        tier: "RARE",
        museum_data: { armor_set_donation_xp: { TEST_SET: 2 } },
      },
      OWNED_SWORD: {
        id: "OWNED_SWORD",
        name: "Owned Sword",
        category: "SWORD",
        tier: "EPIC",
        museum_data: { donation_xp: 4 },
      },
      BORROWED_WAND: {
        id: "BORROWED_WAND",
        name: "Borrowed Wand",
        category: "WAND",
        tier: "LEGENDARY",
        stats: { INTELLIGENCE: 125 },
        museum_data: { donation_xp: 5 },
      },
      MISSING_TOOL: {
        id: "MISSING_TOOL",
        name: "Missing Tool",
        category: "TOOL",
        tier: "UNCOMMON",
        museum_data: { donation_xp: 2 },
      },
    };
    const encoded = { type: 0, data: "encoded-nbt" };
    const model = buildMuseumPreviewModel({
      parsed: {
        museum: [
          { Count: 1, tag: { ExtraAttributes: { id: "TEST_HELMET" }, display: { Name: "Test Helmet" } } },
          { Count: 1, tag: { ExtraAttributes: { id: "TEST_BOOTS" }, display: { Name: "Test Boots" } } },
          { Count: 1, tag: { ExtraAttributes: { id: "OWNED_SWORD" }, display: { Name: "Owned Sword" } } },
        ],
      },
      result: museumResult([], 1_000),
      coverage: { museumShared: true },
      museum: {
        value: 1_000,
        appraisal: true,
        items: {
          TEST_SET: { items: encoded },
          OWNED_SWORD: { items: encoded },
          BORROWED_WAND: { borrowing: true, items: encoded },
        },
        special: [],
      },
      catalogue,
    });

    expect(model.collectionUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "TEST_SET",
        kind: "set",
        state: "donated",
        items: [
          expect.objectContaining({ id: "TEST_HELMET" }),
          expect.objectContaining({ id: "TEST_BOOTS" }),
        ],
      }),
      expect.objectContaining({ key: "OWNED_SWORD", state: "donated" }),
      expect.objectContaining({
        key: "BORROWED_WAND",
        state: "borrowed",
        items: [expect.objectContaining({ stats: { INTELLIGENCE: 125 } })],
      }),
      expect.objectContaining({ key: "MISSING_TOOL", state: "missing" }),
    ]));
    expect(model.completion).toEqual({ completed: 3, total: 4 });
  });

  it("marks only proven alternate items and higher tier sets as accepted substitutions", () => {
    const catalogue: Catalogue = {
      PERFECT_HELMET_12: {
        id: "PERFECT_HELMET_12",
        name: "Perfect Helmet - Tier XII",
        category: "HELMET",
        tier: "LEGENDARY",
        museum_data: { armor_set_donation_xp: { PERFECT_TIER_12: 10 } },
      },
      PERFECT_HELMET_13: {
        id: "PERFECT_HELMET_13",
        name: "Perfect Helmet - Tier XIII",
        category: "HELMET",
        tier: "LEGENDARY",
        museum_data: { armor_set_donation_xp: { PERFECT_TIER_13: 11 } },
      },
      BASE_MASK: {
        id: "BASE_MASK",
        name: "Base Mask",
        category: "HELMET",
        tier: "EPIC",
        museum_data: { donation_xp: 5, mapped_item_ids: ["UPGRADED_MASK"] },
      },
    };
    const encoded = { type: 0, data: "encoded-nbt" };
    const model = buildMuseumPreviewModel({
      parsed: {
        museum: [{
          Count: 1,
          tag: {
            ExtraAttributes: { id: "UPGRADED_MASK" },
            display: { Name: "Upgraded Mask" },
          },
        }],
      },
      result: museumResult([], 1_000),
      coverage: { museumShared: true },
      museum: {
        value: 1_000,
        appraisal: true,
        items: {
          PERFECT_TIER_13: { items: encoded },
          UPGRADED_MASK: { items: encoded },
        },
        special: [],
      },
      catalogue,
    });

    expect(model.collectionUnits).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "PERFECT_TIER_12",
        state: "donated",
        acceptedBy: "Perfect Tier 13",
      }),
      expect.objectContaining({ key: "PERFECT_TIER_13", state: "donated", acceptedBy: null }),
      expect.objectContaining({
        key: "BASE_MASK",
        state: "donated",
        acceptedBy: "Upgraded Mask",
        items: [expect.objectContaining({ acceptedBy: "Upgraded Mask" })],
      }),
    ]));
    expect(model.completion).toEqual({ completed: 3, total: 3 });
  });

  it("reads Catacombs records and does not turn XP into an invented class level", () => {
    const model = buildDungeonsPreviewModel({
      dungeons: {
        dungeon_types: {
          catacombs: {
            experience: 12_345,
            highest_tier_completed: 3,
            times_played: { floor_1: 4 },
            tier_completions: { floor_1: 3 },
            fastest_time: { floor_1: 98_765 },
            best_score: { floor_1: { value: 300, score: "S" } },
            mobs_killed: { floor_1: 500 },
            best_runs: { floor_1: { time: 98_765, score: 300 } },
          },
          master_catacombs: {
            experience: 456,
            highest_tier_completed: 1,
            times_played: { floor_1: 2 },
            tier_completions: { floor_1: 1 },
          },
        },
        player_classes: { healer: { experience: 987 } },
      },
    });

    expect(model.state).toBe("populated");
    expect(model.catacombsExperience).toBe(12_345);
    expect(model.highestFloor).toBe(3);
    expect(model.floors[0]).toMatchObject({ attempts: 4, completions: 3, bestTimeMs: 98_765, bestScore: 300, mobsKilled: 500 });
    expect(model.classes[0]).toMatchObject({ level: null, experience: 987 });
    expect(model.floorGroups).toEqual([
      expect.objectContaining({ key: "catacombs", label: "Normal", highestFloor: 3 }),
      expect.objectContaining({ key: "master_catacombs", label: "Master", highestFloor: 1 }),
    ]);
  });

  it("keeps a missing Master Catacombs projection partial instead of displaying zero", () => {
    const model = buildDungeonsPreviewModel({
      dungeons: {
        dungeon_types: {
          catacombs: {
            experience: 12_345,
            tier_completions: { floor_1: 3 },
          },
        },
      },
    });

    expect(model.state).toBe("partial");
    expect(model.partial).toBe(true);
    expect(model.floorGroups?.map((group) => group.key)).toEqual(["catacombs"]);
  });
});
