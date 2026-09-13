import { describe, expect, it } from "vitest";
import {
  buildBestiaryPreviewModel,
  buildCollectionsPreviewModel,
  buildPetsPreviewModel,
  buildProfilePbcPreviewModels,
  hydratePetsPreviewStats,
  parseCollectionsResource,
} from "../petsBestiaryCollections";

describe("buildPetsPreviewModel", () => {
  it("keeps exposed pet facts and reuses the canonical level ladder", () => {
    const model = buildPetsPreviewModel([
      {
        type: "ROCK",
        tier: "LEGENDARY",
        exp: 0,
        active: true,
        uniqueId: "pet-a",
        heldItem: "PET_ITEM_LUCKY_CLOVER",
        candyUsed: 2,
        skin: "ROCK_COOL",
      },
      { type: "BEE", tier: "COMMON", exp: 0, active: false, uuid: "pet-b", candyUsed: 0 },
    ], { itemNameFor: (id) => id === "PET_ITEM_LUCKY_CLOVER" ? "Lucky Clover" : null });

    expect(model).toMatchObject({
      available: true,
      activeId: "pet-a",
      uniqueTypes: 2,
      totalXp: 0,
      totalCandyUsed: 2,
      dropped: 0,
      partial: false,
    });
    expect(model.entries[0]).toMatchObject({
      id: "pet-a",
      name: "Rock Pet",
      iconId: "PET_SKIN_ROCK_COOL",
      level: 1,
      candyUsed: 2,
      petType: "Mining Mount",
      stats: [
        { name: "Defense", value: 2, formatted: "+2" },
        { name: "True Defense", value: 0.1, formatted: "+0.1" },
      ],
      abilities: expect.any(Array),
      skin: { id: "PET_SKIN_ROCK_COOL", name: "Rock Cool", tier: null },
      heldItem: { id: "PET_ITEM_LUCKY_CLOVER", name: "Lucky Clover" },
    });
  });

  it("does not turn a missing list into an empty collection", () => {
    expect(buildPetsPreviewModel(null)).toMatchObject({ available: false, entries: [], partial: false });
    expect(buildPetsPreviewModel([])).toMatchObject({
      available: true,
      entries: [],
      uniqueTypes: 0,
      totalXp: 0,
      totalCandyUsed: 0,
    });
  });

  it("rejoins legacy cached pet entries with the current stat catalogue", () => {
    const current = buildPetsPreviewModel([{ type: "FROG", tier: "MYTHIC", exp: 0 }]);
    const legacy = {
      ...current,
      entries: current.entries.map((entry) => Object.fromEntries(
        Object.entries(entry).filter(([key]) => key !== "petType" && key !== "stats" && key !== "abilities"),
      )),
    } as unknown as typeof current;

    expect(hydratePetsPreviewStats(legacy).entries[0]).toMatchObject({
      petType: "Foraging Pet",
      stats: [
        { name: "Strength", value: 30, formatted: "+30" },
        { name: "Speed", value: 0.5, formatted: "+0.5" },
        { name: "Fishing Speed", value: 0.4, formatted: "+0.4" },
        { name: "Respiration", value: 0.1, formatted: "+0.1" },
        { name: "Trophy Chance", value: 0.05, formatted: "+0.05%" },
      ],
      abilities: [
        { name: "Hunting Enjoyer" },
        { name: "Hop" },
        { name: "Happy Tree Friends" },
        { name: "Home Sweet Home" },
      ],
    });
  });

  it("keeps the known rarity for a public-resource-omitted pet item", () => {
    const model = buildPetsPreviewModel([{
      type: "HEDGEHOG",
      tier: "LEGENDARY",
      exp: 0,
      heldItem: "GREEN_BANDANA",
    }]);

    expect(model.entries[0]?.heldItem).toMatchObject({
      id: "GREEN_BANDANA",
      name: "Green Bandana",
      tier: "epic",
    });
  });

  it("keeps future or malformed pet facts visible but marks the model partial", () => {
    const model = buildPetsPreviewModel([
      { type: "FUTURE_BEAST", tier: "FUTURE", exp: 12, active: true },
      { type: "BEE", tier: "COMMON", active: true },
    ]);
    expect(model.entries.find((entry) => entry.type === "FUTURE_BEAST")).toMatchObject({
      name: "Future Beast Pet",
      level: null,
      xp: 12,
    });
    expect(model.totalXp).toBeNull();
    expect(model.partial).toBe(true);
  });
});

describe("buildBestiaryPreviewModel", () => {
  const definitions = [{
    id: "zombie",
    name: "Zombie",
    category: "Hub",
    iconId: "ROTTEN_FLESH",
    iconSrc: "https://example.test/zombie.png",
    locationIconId: "GRASS_BLOCK",
    locationIconSrc: "https://example.test/hub.png",
    gameColor: "#55ff55",
    rarity: "rare",
    bracket: 2,
    maxKills: 100,
    mobIds: ["zombie", "zombie_villager"],
    tiers: [
      { tier: 1, required: 10 },
      { tier: 2, required: 50 },
      { tier: 3, required: 100 },
    ],
  }];

  it("aggregates raw mob variants only through supplied family definitions", () => {
    const model = buildBestiaryPreviewModel({
      bestiary: { kills: { zombie: 35, zombie_villager: "30" } },
    }, definitions);

    expect(model).toMatchObject({
      available: true,
      totalKills: 65,
      familiesUnlocked: 1,
      familiesCompleted: 0,
      familyTiers: 2,
      maxFamilyTiers: 3,
      partial: false,
    });
    expect(model.entries[0]).toMatchObject({
      name: "Zombie",
      iconId: "ROTTEN_FLESH",
      iconSrc: "https://example.test/zombie.png",
      locationIconId: "GRASS_BLOCK",
      locationIconSrc: "https://example.test/hub.png",
      gameColor: "#55ff55",
      rarity: "rare",
      bracket: 2,
      maxKills: 100,
      category: "Hub",
      kills: 65,
      tier: 2,
      maxTier: 3,
      nextTier: 3,
      nextRequired: 100,
      progressPercent: 30,
    });
  });

  it("uses tier zero before the first supplied threshold", () => {
    const model = buildBestiaryPreviewModel({ bestiary: { kills: { zombie: 4 } } }, definitions);
    expect(model.entries[0]).toMatchObject({ tier: 0, nextTier: 1, nextRequired: 10 });
  });

  it("keeps unmatched real counters without inventing a family or tier", () => {
    const model = buildBestiaryPreviewModel({
      bestiary: { kills: { zombie: 4, future_mob: 7 } },
    }, definitions);
    expect(model.entries.find((entry) => entry.id === "FUTURE_MOB")).toMatchObject({
      kills: 7,
      category: null,
      iconSrc: null,
      locationIconId: null,
      locationIconSrc: null,
      gameColor: null,
      rarity: null,
      bracket: null,
      maxKills: null,
      tier: null,
      maxTier: null,
    });
    expect(model.totalKills).toBe(11);
    expect(model.partial).toBe(true);
  });

  it("prefers the current member-root field and accepts player_data as fallback", () => {
    const root = buildBestiaryPreviewModel({
      bestiary: { kills: { zombie: 2 } },
      player_data: { bestiary: { kills: { zombie: 9 } } },
    }, definitions);
    const fallback = buildBestiaryPreviewModel({
      player_data: { bestiary: { kills: { zombie: 9 } } },
    }, definitions);
    expect(root.entries[0].kills).toBe(2);
    expect(fallback.entries[0].kills).toBe(9);
  });

  it("separates an omitted section, malformed section, and known empty bestiary", () => {
    expect(buildBestiaryPreviewModel({}).available).toBe(false);
    expect(buildBestiaryPreviewModel({ bestiary: {} })).toMatchObject({ available: false, partial: true });
    expect(buildBestiaryPreviewModel({ bestiary: { kills: {} } })).toMatchObject({
      available: true,
      entries: [],
    });
  });
});

describe("buildCollectionsPreviewModel", () => {
  const definitions = [{
    id: "COBBLESTONE",
    name: "Cobblestone",
    category: "Mining",
    maxTier: 3,
    tiers: [
      { tier: 1, required: 50 },
      { tier: 2, required: 100 },
      { tier: 3, required: 250 },
    ],
  }, {
    id: "COAL",
    name: "Coal",
    category: "Mining",
    maxTier: 2,
    tiers: [
      { tier: 1, required: 50 },
      { tier: 2, required: 100 },
    ],
  }];

  it("joins member facts with all official collection definitions", () => {
    const model = buildCollectionsPreviewModel({
      collection: { COBBLESTONE: 125 },
      player_data: { unlocked_coll_tiers: ["COBBLESTONE_1", "COBBLESTONE_2"] },
    }, definitions);

    expect(model).toMatchObject({
      available: true,
      unlockedCollections: 1,
      maxedCollections: 0,
      unlockedTiers: 2,
      maxTiers: 5,
      partial: false,
    });
    expect(model.entries.find((entry) => entry.id === "COBBLESTONE")).toMatchObject({
      amount: 125,
      unlockedTier: 2,
      maxTier: 3,
      isMaxed: false,
      nextTier: 3,
      nextRequired: 250,
      progressPercent: 50,
    });
    expect(model.entries.find((entry) => entry.id === "COAL")).toMatchObject({
      amount: 0,
      unlockedTier: 0,
    });
  });

  it("uses the highest recorded unlock even when lower tier ids have holes", () => {
    const model = buildCollectionsPreviewModel({
      collection: { COBBLESTONE: 300 },
      player_data: { unlocked_coll_tiers: ["COBBLESTONE_1", "COBBLESTONE_3"] },
    }, definitions);
    expect(model.entries.find((entry) => entry.id === "COBBLESTONE")).toMatchObject({
      unlockedTier: 3,
      isMaxed: true,
      nextTier: null,
    });
    expect(model.maxedCollections).toBe(1);
  });

  it("does not replace an unavailable count or tier field with zero", () => {
    const countOnly = buildCollectionsPreviewModel({ collection: { COBBLESTONE: 125 } }, definitions);
    const tierOnly = buildCollectionsPreviewModel({
      player_data: { unlocked_coll_tiers: ["COBBLESTONE_2"] },
    }, definitions);
    expect(countOnly.entries.find((entry) => entry.id === "COBBLESTONE")).toMatchObject({
      amount: 125,
      unlockedTier: null,
      nextTier: null,
    });
    expect(countOnly.unlockedCollections).toBeNull();
    expect(tierOnly.entries.find((entry) => entry.id === "COBBLESTONE")).toMatchObject({
      amount: null,
      unlockedTier: 2,
    });
    expect(countOnly.partial).toBe(true);
    expect(tierOnly.partial).toBe(true);
  });

  it("separates private data from a known empty profile section", () => {
    expect(buildCollectionsPreviewModel({}).available).toBe(false);
    expect(buildCollectionsPreviewModel(
      { collection: {}, player_data: { unlocked_coll_tiers: [] } },
      definitions,
    )).toMatchObject({ available: true, unlockedCollections: 0, unlockedTiers: 0 });
  });

  it("preserves categories, thresholds, and max tiers from the official resource", () => {
    expect(parseCollectionsResource({
      success: true,
      collections: {
        MINING: {
          name: "Mining",
          items: {
            COBBLESTONE: {
              name: "Cobblestone",
              maxTiers: 2,
              tiers: [
                { tier: 1, amountRequired: 50, unlocks: ["Cobblestone Minion I"] },
                { tier: 2, amountRequired: 100 },
              ],
            },
          },
        },
      },
    })).toStrictEqual([{
      id: "COBBLESTONE",
      name: "Cobblestone",
      category: "Mining",
      maxTier: 2,
      tiers: [
        { tier: 1, required: 50 },
        { tier: 2, required: 100 },
      ],
    }]);
    expect(parseCollectionsResource({ collections: {} })).toBeNull();
  });

  it("attaches source progression without retaining the raw Slayer payload", () => {
    const model = buildCollectionsPreviewModel({
      collection: { CHILI_PEPPER: 0 },
      player_data: { unlocked_coll_tiers: [] },
      slayer: { slayer_bosses: { blaze: { claimed_levels: {} } } },
    }, [{
      id: "CHILI_PEPPER",
      name: "Chili Pepper",
      category: "Combat",
      maxTier: 1,
      tiers: [{ tier: 1, required: 10 }],
    }]);

    expect(model.entries[0].sourceGate).toMatchObject({
      sourceName: "Inferno Minion",
      requirementLabel: "Inferno 3",
      requirement: { state: "unmet", have: "0" },
    });
    expect(JSON.stringify(model)).not.toContain("slayer_bosses");
  });
});

describe("buildProfilePbcPreviewModels", () => {
  it("returns sanitized models without retaining the authenticated member", () => {
    const models = buildProfilePbcPreviewModels({
      member: {
        collection: { COBBLESTONE: 12 },
        bestiary: { kills: { zombie: 3 } },
        player_data: { unlocked_coll_tiers: ["COBBLESTONE_1"] },
      },
      pets: [{ type: "BEE", tier: "COMMON", exp: 0 }],
    });
    expect(models.pets.entries).toHaveLength(1);
    expect(models.bestiary.entries[0]).toMatchObject({ id: "ZOMBIE", kills: 3 });
    expect(models.collections.entries[0]).toMatchObject({ id: "COBBLESTONE", amount: 12, unlockedTier: 1 });
    expect("member" in models).toBe(false);
    expect(JSON.stringify(models)).not.toContain("player_data");
  });
});
