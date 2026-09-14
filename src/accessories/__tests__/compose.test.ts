import { describe, it, expect } from "vitest";
import { composeSnapshot } from "../useAccessories";
import { accessoriesFromIndex, buildAccessoryCatalogue } from "../catalogue";
import { buildCollectionKeys, readCollections, NO_COLLECTIONS } from "../collections";
import { readProgress, NO_PROGRESS } from "../requirements";
import { buildChainIndex, EMPTY_CHAINS } from "../chains";
import { NO_MP_INPUTS } from "../magicalPower";
import type { OwnedBag } from "../owned";
import type { CollectionProgress } from "../collections";
import type { ItemIndex } from "../../items/useItemData";

/**
 * How the four halves become one page.
 *
 * The status rule is the thing worth pinning: owned beats gated beats missing,
 * gating is only asked about for craftable items, and an unreadable bag never
 * turns into a claim that the player owns nothing.
 */

const items: ItemIndex = {
  acacia_log: {
    name: "Acacia Log",
    hypixelId: "LOG_2",
    tier: null,
    category: null,
    npcSell: null,
    yields: 1,
    recipe: null,
  },
  bioanalysis_talisman: {
    name: "Bioanalysis Talisman",
    hypixelId: "BIOANALYSIS_TALISMAN",
    tier: "COMMON",
    category: "ACCESSORY",
    npcSell: null,
    yields: 1,
    // Craftable, and gated behind a collection tier.
    recipe: [{ id: "acacia_log", name: "Acacia Log", qty: 8 }],
    unlocks: [{ collection: "Acacia Log", tier: 6, required: 250, type: "Recipe" }],
  },
  bioanalysis_ring: {
    name: "Bioanalysis Ring",
    hypixelId: "BIOANALYSIS_RING",
    tier: "UNCOMMON",
    category: "ACCESSORY",
    npcSell: null,
    yields: 1,
    recipe: null,
  },
  wolf_talisman: {
    name: "Wolf Talisman",
    hypixelId: "WOLF_TALISMAN",
    tier: "UNCOMMON",
    category: "ACCESSORY",
    npcSell: null,
    yields: 1,
    recipe: null,
    // Verbatim shape from Hypixel's item resource (Tarantula Ring carries this).
    requirements: [{ type: "SLAYER", slayer_boss_type: "spider", level: 7 }],
  },
};

const catalogue = buildAccessoryCatalogue(
  [
    { id: "BIOANALYSIS_TALISMAN", name: "Bioanalysis Talisman", tier: "COMMON", category: "ACCESSORY" },
    { id: "BIOANALYSIS_RING", name: "Bioanalysis Ring", tier: "UNCOMMON", category: "ACCESSORY" },
    {
      id: "WOLF_TALISMAN",
      name: "Wolf Talisman",
      tier: "UNCOMMON",
      category: "ACCESSORY",
      requirements: [{ type: "SLAYER", slayer_boss_type: "spider", level: 7 }],
    },
  ],
  items
);

const keys = buildCollectionKeys(items);

const unlockedNothing: CollectionProgress = readCollections({
  player_data: { unlocked_coll_tiers: ["LOG_2_1"] },
  collection: { LOG_2: 40 },
});

const find = (snap: ReturnType<typeof composeSnapshot>, id: string) =>
  snap.entries.find((e) => e.id === id)!;

describe("composeSnapshot", () => {
  it("hides retired variants from progression counts without changing owned Magical Power", () => {
    const legacyItems: ItemIndex = {
      crab: { ...items.wolf_talisman, name: "Crab Hat of Celebration", hypixelId: "PARTY_HAT_CRAB", tier: "SPECIAL", requirements: null },
      wolf: { ...items.wolf_talisman, requirements: null },
    };
    const legacyCatalogue = buildAccessoryCatalogue(accessoriesFromIndex(legacyItems), legacyItems);
    const snap = composeSnapshot(legacyCatalogue, ["PARTY_HAT_CRAB"], {}, NO_COLLECTIONS, new Map(), false, null);
    expect(snap.normalCounts).toEqual({ total: 1, owned: 0, missing: 1, locked: 0 });
    expect(Object.values(snap.normalSourceCounts).reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(snap.magicalPower).toMatchObject({ total: 3, counted: 1 });
    expect(find(snap, "PARTY_HAT_CRAB").status).toBe("owned");
  });
  it("does not claim anything about ownership when the bag was not read", () => {
    const snap = composeSnapshot(catalogue, null, {}, NO_COLLECTIONS, keys, false, null);

    expect(snap.ownedKnown).toBe(false);
    expect(snap.counts.owned).toBe(0);
    // Every entry is simply not owned, and the page renders one ungrouped
    // catalogue rather than splitting on a fact nobody established.
    expect(snap.entries.every((e) => e.status !== "owned")).toBe(true);
    expect(snap.counts.total).toBe(3);
  });

  it("reads an empty bag as genuinely owning nothing", () => {
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null);

    // Same counts as above, but a completely different claim behind them.
    expect(snap.ownedKnown).toBe(true);
    expect(snap.counts.owned).toBe(0);
  });

  it("marks a held accessory owned", () => {
    const snap = composeSnapshot(catalogue, ["WOLF_TALISMAN"], {}, NO_COLLECTIONS, keys, false, null);

    expect(find(snap, "WOLF_TALISMAN").status).toBe("owned");
    expect(find(snap, "WOLF_TALISMAN").coveredByFamily).toBe(false);
    expect(snap.counts.owned).toBe(1);
  });

  it("aggregates stats and enrichments over only the active accessory rungs", () => {
    const statItems: ItemIndex = {
      lower: {
        name: "Lower Talisman", hypixelId: "LOWER_TALISMAN", tier: "COMMON", category: "ACCESSORY",
        npcSell: null, yields: 1, recipe: null, stats: { STRENGTH: 99 },
      },
      higher: {
        name: "Higher Ring", hypixelId: "HIGHER_RING", tier: "UNCOMMON", category: "ACCESSORY",
        npcSell: null, yields: 1, recipe: null, stats: { STRENGTH: 2, MAGIC_FIND: 1, HEALTH: 2, rift_Time: 4 },
      },
      separate: {
        name: "Separate Artifact", hypixelId: "SEPARATE_ARTIFACT", tier: "RARE", category: "ACCESSORY",
        npcSell: null, yields: 1, recipe: null, stats: { STRENGTH: 3, health: 5, RIFT_TIME: 6 },
      },
    };
    const statCatalogue = buildAccessoryCatalogue(accessoriesFromIndex(statItems), statItems);
    const statChains = buildChainIndex([], statCatalogue, [
      { fromId: "LOWER_TALISMAN", toId: "HIGHER_RING" },
    ]);
    const bag: OwnedBag = {
      ids: ["LOWER_TALISMAN", "HIGHER_RING", "SEPARATE_ARTIFACT"],
      recombobulated: new Set(["HIGHER_RING"]),
      tiers: new Map(),
      enrichments: new Map([
        ["LOWER_TALISMAN", "health"],
        ["HIGHER_RING", "magic_find"],
        ["SEPARATE_ARTIFACT", "magic_find"],
      ]),
      ambiguousEnrichments: new Set(),
    };
    const snap = composeSnapshot(
      statCatalogue,
      bag.ids,
      {},
      NO_COLLECTIONS,
      buildCollectionKeys(statItems),
      false,
      null,
      NO_PROGRESS,
      statChains,
      {},
      {},
      {},
      { ...NO_MP_INPUTS, recombobulated: bag.recombobulated },
      bag,
    );

    expect(snap.activeCount).toBe(2);
    expect(snap.activeRecombobulated).toBe(1);
    expect(snap.statContributions).toStrictEqual([
      { key: "health", value: 7 },
      { key: "magic_find", value: 1 },
      { key: "rift_time", value: 10 },
      { key: "strength", value: 5 },
    ]);
    expect(snap.enrichments).toStrictEqual([{ key: "magic_find", count: 2 }]);
  });

  it("marks a lower rung owned through its family, and says so", () => {
    const snap = composeSnapshot(catalogue, ["BIOANALYSIS_RING"], {}, NO_COLLECTIONS, keys, false, null);

    const talisman = find(snap, "BIOANALYSIS_TALISMAN");
    expect(talisman.status).toBe("owned");
    // The flag exists so the tile can explain why it is ticked off.
    expect(talisman.coveredByFamily).toBe(true);
    expect(find(snap, "BIOANALYSIS_RING").coveredByFamily).toBe(false);
  });

  it("files a craftable-but-locked accessory under locked", () => {
    const snap = composeSnapshot(catalogue, [], {}, unlockedNothing, keys, false, null);

    const talisman = find(snap, "BIOANALYSIS_TALISMAN");
    expect(talisman.status).toBe("locked");
    expect(talisman.blockedBy).toMatchObject({
      kind: "collection",
      target: "Acacia Log collection",
      threshold: "tier 6",
      state: "unmet",
      have: "40",
    });
    expect(snap.counts.locked).toBe(1);
  });

  it("never gates something the player already has", () => {
    // Owning it outranks the recipe being locked: the lock is irrelevant now.
    const snap = composeSnapshot(
      catalogue,
      ["BIOANALYSIS_TALISMAN"],
      {},
      unlockedNothing,
      keys,
      false,
      null
    );
    expect(find(snap, "BIOANALYSIS_TALISMAN").status).toBe("owned");
    expect(snap.counts.locked).toBe(0);
  });

  it("does not gate an accessory that has no recipe", () => {
    // A Dark Auction item is missing, not gated. There is nothing to unlock.
    const snap = composeSnapshot(catalogue, [], {}, unlockedNothing, keys, false, null);
    expect(find(snap, "WOLF_TALISMAN").status).toBe("missing");
  });

  it("counts every entry into exactly one status", () => {
    const snap = composeSnapshot(catalogue, ["BIOANALYSIS_RING"], {}, unlockedNothing, keys, false, null);
    const { owned, missing, locked, total } = snap.counts;
    expect(owned + missing + locked).toBe(total);
  });

  it("labels sources, with craftable winning and unknowns reading as see-wiki", () => {
    const snap = composeSnapshot(
      catalogue,
      [],
      { "Wolf Talisman": "mobDrop" },
      NO_COLLECTIONS,
      keys,
      false,
      null
    );

    expect(find(snap, "BIOANALYSIS_TALISMAN").source).toBe("craftable");
    expect(find(snap, "WOLF_TALISMAN").source).toBe("mobDrop");
    // Never classified, so it is honestly unknown rather than guessed.
    expect(find(snap, "BIOANALYSIS_RING").source).toBe("wiki");

    expect(snap.sourceCounts.craftable).toBe(1);
    expect(snap.sourceCounts.mobDrop).toBe(1);
    expect(snap.sourceCounts.wiki).toBe(1);
  });

  it("reports how many accessories it could not gate honestly", () => {
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null);
    // The one craftable entry could not be gated, so it stayed in Missing and
    // the page has an honest number to show for it.
    expect(snap.unresolvedCollections).toBe(1);
    expect(find(snap, "BIOANALYSIS_TALISMAN").status).toBe("missing");
  });

  it("recognises the physically held lower rung as the next upgrade context", () => {
    const anguishItems: ItemIndex = {
      anguish_talisman: {
        name: "Anguish Talisman",
        hypixelId: "ANGUISH_TALISMAN",
        tier: "RARE",
        category: "ACCESSORY",
        npcSell: null,
        yields: 1,
        recipe: null,
      },
      anguish_ring: {
        name: "Anguish Ring",
        hypixelId: "ANGUISH_RING",
        tier: "EPIC",
        category: "ACCESSORY",
        npcSell: null,
        yields: 1,
        recipe: null,
      },
      anguish_artifact: {
        name: "Anguish Artifact",
        hypixelId: "ANGUISH_ARTIFACT",
        tier: "LEGENDARY",
        category: "ACCESSORY",
        npcSell: null,
        yields: 1,
        recipe: null,
      },
    };
    const anguishCatalogue = buildAccessoryCatalogue(
      [
        { id: "ANGUISH_TALISMAN", name: "Anguish Talisman", tier: "RARE", category: "ACCESSORY" },
        { id: "ANGUISH_RING", name: "Anguish Ring", tier: "EPIC", category: "ACCESSORY" },
        { id: "ANGUISH_ARTIFACT", name: "Anguish Artifact", tier: "LEGENDARY", category: "ACCESSORY" },
      ],
      anguishItems,
    );

    const snap = composeSnapshot(
      anguishCatalogue,
      ["ANGUISH_RING"],
      {},
      NO_COLLECTIONS,
      buildCollectionKeys(anguishItems),
      false,
      null,
    );
    const artifact = find(snap, "ANGUISH_ARTIFACT");

    expect(artifact.status).toBe("missing");
    expect(artifact.acquisition.category).toBe("upgradePaths");
    expect(artifact.ownedPrerequisite).toMatchObject({ id: "ANGUISH_RING", name: "Anguish Ring" });
    expect(artifact.readiness).toEqual({
      kind: "nextUpgrade",
      label: "Owns Anguish Ring; remaining materials are not measured.",
    });
  });
});

describe("requirement gating", () => {
  const lowSlayer = readProgress({
    slayer: { slayer_bosses: { spider: { claimed_levels: { level_1: true, level_2: true } } } },
  });
  const highSlayer = readProgress({
    slayer: {
      slayer_bosses: {
        spider: {
          claimed_levels: {
            level_1: true, level_2: true, level_3: true, level_4: true,
            level_5: true, level_6: true, level_7: true,
          },
        },
      },
    },
  });

  it("locks an accessory whose slayer level the player has not reached", () => {
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null, lowSlayer);
    const wolf = find(snap, "WOLF_TALISMAN");

    expect(wolf.status).toBe("locked");
    expect(wolf.blockedBy?.target).toBe("Tarantula Broodfather Slayer");
    expect(wolf.blockedBy?.threshold).toBe("7");
    expect(wolf.blockedBy?.have).toBe("2");
    expect(snap.counts.locked).toBe(1);
  });

  it("leaves it merely missing once the level is reached", () => {
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null, highSlayer);
    expect(find(snap, "WOLF_TALISMAN").status).toBe("missing");
    expect(find(snap, "WOLF_TALISMAN").blockedBy).toBeNull();
  });

  it("never locks on a requirement nobody measured", () => {
    /*
     * The whole safety property. With no profile the slayer level is unknown,
     * and an unknown requirement must leave the item in Missing with its
     * requirement shown rather than sending the player off to grind.
     */
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null, NO_PROGRESS);
    const wolf = find(snap, "WOLF_TALISMAN");

    expect(wolf.status).toBe("missing");
    expect(wolf.blockedBy).toBeNull();
    // Still told what it asks of them.
    expect(wolf.checked).toHaveLength(1);
    expect(wolf.checked[0].state).toBe("unknown");
    expect(wolf.checked[0].target).toBe("Tarantula Broodfather Slayer");
  });

  it("shows requirements on an owned accessory too, without locking it", () => {
    const snap = composeSnapshot(catalogue, ["WOLF_TALISMAN"], {}, NO_COLLECTIONS, keys, false, null, lowSlayer);
    const wolf = find(snap, "WOLF_TALISMAN");
    expect(wolf.status).toBe("owned");
    expect(wolf.checked).toHaveLength(1);
  });

  it("counts requirements by kind for the page header", () => {
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, keys, false, null, lowSlayer);
    expect(snap.requirementCounts.slayer).toBe(1);
  });

  /*
   * The acquisition-location layer, end to end.
   *
   * This is here rather than only in `locations.test.ts` because the layer was
   * once complete, correct and entirely UNREACHED: `groupOf` accepted a
   * location index, nothing ever passed one, and every unit test still passed.
   * These two cases fail if the wiring is ever unplugged again.
   */
  it("groups an accessory by where it is acquired when its stats say nothing", () => {
    const snap = composeSnapshot(
      catalogue, [], {}, NO_COLLECTIONS, keys, false, null, NO_PROGRESS, EMPTY_CHAINS,
      { "Bioanalysis Ring": ["npc:Anita"] },
      { "npc:Anita": "farming" }
    );

    expect(find(snap, "BIOANALYSIS_RING").group).toBe("farming");
    expect(snap.groupCounts.farming).toBe(1);
  });

  it("leaves an accessory in Other when its name resolved to nothing", () => {
    const snap = composeSnapshot(
      catalogue, [], {}, NO_COLLECTIONS, keys, false, null, NO_PROGRESS, EMPTY_CHAINS,
      { "Bioanalysis Ring": ["npc:Nobody In Particular"] },
      { "npc:Anita": "farming" }
    );

    expect(find(snap, "BIOANALYSIS_RING").group).toBe("other");
    expect(snap.groupCounts.farming).toBe(0);
  });
});

describe("the Rift split and the event key", () => {
  const riftItems: ItemIndex = {
    crux: {
      name: "Crux Talisman",
      hypixelId: "CRUX_TALISMAN_1",
      tier: "COMMON",
      category: "ACCESSORY",
      npcSell: null,
      yields: 1,
      recipe: null,
      origin: "RIFT",
    },
    candy: {
      name: "Candy Talisman",
      hypixelId: "CANDY_TALISMAN",
      tier: "COMMON",
      category: "ACCESSORY",
      npcSell: null,
      yields: 1,
      recipe: null,
    },
  };
  const riftCatalogue = buildAccessoryCatalogue(
    [
      { id: "CRUX_TALISMAN_1", name: "Crux Talisman", tier: "COMMON", category: "ACCESSORY", origin: "RIFT" },
      { id: "CANDY_TALISMAN", name: "Candy Talisman", tier: "COMMON", category: "ACCESSORY" },
    ],
    riftItems
  );
  const riftKeys = buildCollectionKeys(riftItems);

  it("tallies Rift accessories separately and keeps them out of the reach tiers", () => {
    const snap = composeSnapshot(riftCatalogue, [], {}, NO_COLLECTIONS, riftKeys, false, null);

    expect(find(snap, "CRUX_TALISMAN_1").rift).toBe(true);
    expect(snap.riftCounts).toEqual({ total: 1, owned: 0, missing: 1, locked: 0 });
    // Whole-catalogue counts keep the whole truth; the tiers hold only the
    // normal accessory, because the Rift band is its own section.
    expect(snap.counts.total).toBe(2);
    expect(snap.normalCounts).toEqual({ total: 1, owned: 0, missing: 1, locked: 0 });
    const tierTotal = Object.values(snap.reachCounts).reduce((a, b) => a + b, 0);
    expect(tierTotal).toBe(1);
  });

  it("counts an owned Rift accessory under the Rift label, not the tiers", () => {
    const snap = composeSnapshot(riftCatalogue, ["CRUX_TALISMAN_1"], {}, NO_COLLECTIONS, riftKeys, false, null);
    expect(snap.riftCounts.owned).toBe(1);
    expect(snap.counts.owned).toBe(1);
    expect(snap.normalCounts.owned).toBe(0);
  });

  it("includes a Rift-origin transferable in normal counts and reach", () => {
    const items: ItemIndex = {
      ...riftItems,
      iq: {
        name: "IQ Point",
        hypixelId: "IQ_POINT",
        tier: "COMMON",
        category: "ACCESSORY",
        origin: "RIFT",
        riftTransferable: true,
        npcSell: null,
        yields: 1,
        recipe: null,
      },
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(items), items);
    const snap = composeSnapshot(catalogue, [], {}, NO_COLLECTIONS, buildCollectionKeys(items), false, null);

    expect(snap.riftCounts.total).toBe(2);
    expect(snap.normalCounts.total).toBe(2);
    expect(snap.normalCounts.missing).toBe(2);
    expect(Object.values(snap.reachCounts).reduce((sum, count) => sum + count, 0)).toBe(2);
  });

  it("carries an event key only on event accessories, and unknown when unnamed", () => {
    const snap = composeSnapshot(
      riftCatalogue,
      [],
      { "Candy Talisman": "event", "Crux Talisman": "mobDrop" },
      NO_COLLECTIONS,
      riftKeys,
      false,
      null,
      NO_PROGRESS,
      EMPTY_CHAINS,
      {},
      {},
      { "Candy Talisman": "spookyFestival" }
    );
    expect(find(snap, "CANDY_TALISMAN").eventKey).toBe("spookyFestival");
    expect(find(snap, "CRUX_TALISMAN_1").eventKey).toBeNull();

    // The same event item with no learned key is honestly unknown.
    const bare = composeSnapshot(
      riftCatalogue, [], { "Candy Talisman": "event" }, NO_COLLECTIONS, riftKeys, false, null
    );
    expect(find(bare, "CANDY_TALISMAN").eventKey).toBe("unknown");
  });
});
