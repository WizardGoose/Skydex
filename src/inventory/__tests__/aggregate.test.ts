import { describe, it, expect } from "vitest";
import { buildOwned, describeSources, dominantSource } from "../aggregate";
import type { OwnedInput } from "../aggregate";
import { getInventoryManagement, MANAGED_HOLDING_SOURCES } from "../managementStore";
import type { SectionKey, SectionProvenance } from "../../island/merge";
import type { IslandChest, IslandItem, IslandSnapshot } from "../../island/types";

/**
 * The unified owned view.
 *
 * Two things here are worth more than the rest and both are about not lying to
 * the player: a source that never looked must contribute nothing rather than a
 * confident zero, and a number the player typed must survive every sync.
 */

const item = (id: string, count: number, name = id): IslandItem => ({ id, name, count });

const chest = (items: IslandItem[]): IslandChest => ({ pos: [0, 0, 0], name: "Chest", lastSeen: 0, items });

const snapshotWith = (over: Partial<IslandSnapshot> = {}): IslandSnapshot => ({
  schema: 1,
  exportedAt: 0,
  player: { uuid: "u", name: "Steve" },
  profile: { name: "Blueberry", gameMode: "ironman" },
  sacks: {},
  chests: [],
  ...over,
});

/** Section provenance, defaulting every section to "nobody looked". */
const sectionsWith = (over: Partial<Record<SectionKey, SectionProvenance>> = {}): Record<SectionKey, SectionProvenance> => ({
  sacks: { state: "absent", source: null, at: null },
  chests: { state: "absent", source: null, at: null },
  inventory: { state: "absent", source: null, at: null },
  enderChest: { state: "absent", source: null, at: null },
  storage: { state: "absent", source: null, at: null },
  ...over,
});

const captured = (source: "mod" | "api", at = 1_000): SectionProvenance => ({ state: "captured", source, at });

const raw = (id: string, count: number) => ({ Count: count, tag: { ExtraAttributes: { id } } });

const profileWith = (
  parsed: Record<string, unknown[]>,
  over: Partial<NonNullable<OwnedInput["profile"]>> = {},
): NonNullable<OwnedInput["profile"]> => ({
  parsed,
  inventoryShared: true,
  vaultShared: true,
  museumShared: true,
  fetchedAt: 2_000,
  ...over,
});

const ITEMS = {
  ashwreath: { hypixelId: "ASHWREATH" },
  choconut: { hypixelId: "CHOCONUT" },
  "oak-log": { hypixelId: "OAK_LOG" },
  "wiki-only": { hypixelId: null },
};

const build = (over: Partial<OwnedInput> = {}) => buildOwned({ items: ITEMS, ...over });

describe("aggregation across sources", () => {
  it("sums the same item across every island section it appears in", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({
          sacks: { ASHWREATH: 100 },
          chests: [chest([item("ASHWREATH", 20), item("ASHWREATH", 5)]), chest([item("ASHWREATH", 3)])],
          inventory: [item("ASHWREATH", 2)],
        }),
        sections: sectionsWith({ sacks: captured("mod"), chests: captured("mod"), inventory: captured("mod") }),
      },
    });

    // 100 in sacks, 28 across two chests (three stacks), 2 carried.
    expect(owned.get("ashwreath")?.auto).toBe(130);
    expect(owned.count("ashwreath")).toBe(130);
  });

  it("adds the shard tally in, bridged through internal_id", () => {
    const owned = buildOwned({
      items: { grove: { hypixelId: "SHARD_GROVE" } },
      island: {
        snapshot: snapshotWith({ sacks: { SHARD_GROVE: 4 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
      shards: { counts: { C1: 96, C2: 3 }, ids: { C1: "SHARD_GROVE", C2: "SHARD_OTHER" } },
    });

    expect(owned.count("grove")).toBe(100);
    expect(owned.get("grove")?.sources.map((s) => s.source)).toEqual(["island.sacks", "shards"]);
  });

  it("includes every physical item surface exposed by the cached Hypixel profile", () => {
    const categories = {
      inventory: [raw("ASHWREATH", 1)],
      armor: [raw("ASHWREATH", 2)],
      equipment: [raw("ASHWREATH", 3)],
      wardrobe: [raw("ASHWREATH", 4)],
      accessories: [raw("ASHWREATH", 5)],
      enderchest: [raw("ASHWREATH", 6)],
      storage: [raw("ASHWREATH", 7)],
      personal_vault: [raw("ASHWREATH", 8)],
      fishing_bag: [raw("ASHWREATH", 9)],
      potion_bag: [raw("ASHWREATH", 10)],
      sacks_bag: [raw("ASHWREATH", 11)],
      quiver: [raw("ASHWREATH", 12)],
      candy_inventory: [raw("ASHWREATH", 13)],
      carnival_mask_inventory: [raw("ASHWREATH", 14)],
      farming_toolkit: [raw("ASHWREATH", 15)],
      hunting_toolkit: [raw("ASHWREATH", 16)],
      museum: [raw("ASHWREATH", 17)],
      sacks: [{ id: "ASHWREATH", amount: 18 }],
    };
    const owned = build({ profile: profileWith(categories) });

    expect(owned.count("ashwreath")).toBe(171);
    expect(owned.get("ashwreath")?.sources.map((source) => source.source)).toEqual([
      "island.sacks",
      "island.inventory",
      "island.enderChest",
      "island.storage",
      "profile.armor",
      "profile.equipment",
      "profile.wardrobe",
      "profile.accessories",
      "profile.personalVault",
      "profile.fishingBag",
      "profile.potionBag",
      "profile.sacksBag",
      "profile.quiver",
      "profile.candy",
      "profile.carnivalMasks",
      "profile.farmingToolkit",
      "profile.huntingToolkit",
      "profile.museum",
    ]);
  });

  it("selects one overlapping API or mod container instead of double counting it", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ inventory: [item("ASHWREATH", 9)] }),
        sections: sectionsWith({ inventory: captured("mod", 3_000) }),
      },
      profile: profileWith({ inventory: [raw("ASHWREATH", 40)] }, { fetchedAt: 2_000 }),
    });

    expect(owned.count("ashwreath")).toBe(9);
    expect(owned.get("ashwreath")?.sources).toEqual([
      { source: "island.inventory", feed: "mod", count: 9, at: 3_000 },
    ]);
  });

  it("unions cached API sacks with the mod view and replaces collisions", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 7 } }),
        sections: sectionsWith({ sacks: captured("mod", 3_000) }),
      },
      profile: profileWith({
        sacks: [
          { id: "ASHWREATH", amount: 100 },
          { id: "CHOCONUT", amount: 5 },
        ],
      }),
    });

    expect(owned.count("ashwreath")).toBe(7);
    expect(owned.count("choconut")).toBe(5);
  });

  it("keeps an API sack counter at zero as known rather than unknown", () => {
    const owned = build({
      profile: profileWith({
        sacks: [
          { id: "ASHWREATH", amount: 0 },
          { id: "CHOCONUT", amount: 5 },
        ],
      }),
    });

    expect(owned.get("ashwreath")).toMatchObject({ auto: 0, total: 0 });
    expect(owned.get("ashwreath")?.sources).toEqual([
      { source: "island.sacks", feed: "api", count: 0, at: 2_000 },
    ]);
    expect(owned.count("wiki-only")).toBeUndefined();
  });

  it("does not turn private API surfaces into empty holdings", () => {
    const owned = build({
      profile: profileWith(
        {
          inventory: [raw("ASHWREATH", 4)],
          personal_vault: [raw("ASHWREATH", 8)],
          museum: [raw("ASHWREATH", 16)],
        },
        { inventoryShared: false, vaultShared: false, museumShared: false },
      ),
    });

    expect(owned.has).toBe(false);
    expect(owned.count("ashwreath")).toBeUndefined();
  });

  it("contributes nothing for a shard with no id bridge", () => {
    const owned = buildOwned({
      items: { grove: { hypixelId: "SHARD_GROVE" } },
      shards: { counts: { C1: 96 }, ids: { C1: null } },
    });
    expect(owned.has).toBe(false);
  });
});

describe("provenance", () => {
  it("keeps one entry per source, with the feed that won that section", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 100 }, chests: [chest([item("ASHWREATH", 7)])] }),
        // Sacks came from Hypixel, chests can only ever come from the mod.
        sections: sectionsWith({ sacks: captured("api", 500), chests: captured("mod", 900) }),
      },
    });

    expect(owned.get("ashwreath")?.sources).toEqual([
      { source: "island.sacks", feed: "api", count: 100, at: 500 },
      { source: "island.chests", feed: "mod", count: 7, at: 900 },
    ]);
    expect(describeSources(owned.get("ashwreath"))).toBe("sacks 100 (api), chests 7 (mod)");
  });

  it("names the biggest contributor for the chip", () => {
    const owned = build({
      island: {
        // A real profile's shape: a few in the ender chest, the bulk in backpacks.
        snapshot: snapshotWith({ enderChest: [item("ASHWREATH", 3)], storage: [item("ASHWREATH", 64), item("ASHWREATH", 39)] }),
        sections: sectionsWith({ enderChest: captured("mod"), storage: captured("mod") }),
      },
    });
    expect(dominantSource(owned.get("ashwreath"))?.source).toBe("island.storage");
    expect(dominantSource(owned.get("ashwreath"))?.count).toBe(103);
  });

  it("breaks a tie by section order rather than by iteration luck", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ chests: [chest([item("ASHWREATH", 5)])], storage: [item("ASHWREATH", 5)] }),
        sections: sectionsWith({ chests: captured("mod"), storage: captured("mod") }),
      },
    });
    expect(dominantSource(owned.get("ashwreath"))?.source).toBe("island.chests");
  });

  it("has no dominant source for an entry nothing automatic touched", () => {
    const owned = build({ manual: { ashwreath: 4 } });
    expect(dominantSource(owned.get("ashwreath"))).toBeUndefined();
    expect(dominantSource(undefined)).toBeUndefined();
  });

  it("reports which sources contributed anywhere", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 1 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
      manual: { choconut: 5 },
    });
    expect(owned.sources.sort()).toEqual(["island.sacks", "manual"]);
  });

  it("records a captured-but-empty section as a real zero, not an absence", () => {
    const owned = build({
      island: {
        // The mod looked in the ender chest and it was genuinely empty, while
        // sacks hold some. The zero is information: it is not "unknown".
        snapshot: snapshotWith({ sacks: { ASHWREATH: 4 }, enderChest: [] }),
        sections: sectionsWith({ sacks: captured("mod"), enderChest: { state: "empty", source: "mod", at: 1 } }),
      },
    });
    expect(owned.get("ashwreath")?.sources.map((s) => s.source)).toEqual(["island.sacks"]);
    expect(owned.get("ashwreath")?.auto).toBe(4);
  });
});

describe("manual override precedence", () => {
  it("beats every automatic source combined", () => {
    const owned = buildOwned({
      items: { grove: { hypixelId: "SHARD_GROVE" } },
      island: {
        snapshot: snapshotWith({
          sacks: { SHARD_GROVE: 1_000 },
          chests: [chest([item("SHARD_GROVE", 500)])],
          storage: [item("SHARD_GROVE", 250)],
        }),
        sections: sectionsWith({ sacks: captured("mod"), chests: captured("mod"), storage: captured("mod") }),
      },
      shards: { counts: { C1: 40 }, ids: { C1: "SHARD_GROVE" } },
      manual: { grove: 7 },
    });

    const entry = owned.get("grove");
    expect(entry?.auto).toBe(1_790);
    expect(entry?.manual).toBe(7);
    expect(entry?.total).toBe(7);
    expect(entry?.overridden).toBe(true);
    // The automatic total survives underneath, so the UI can offer it back.
    expect(owned.auto("grove")).toBe(1_790);
  });

  it("lets a typed zero win, because spending a stockpile is a thing that happens", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 512 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
      manual: { ashwreath: 0 },
    });

    expect(owned.count("ashwreath")).toBe(0);
    expect(owned.get("ashwreath")?.overridden).toBe(true);
    expect(owned.get("ashwreath")?.auto).toBe(512);
  });

  it("falls back to the automatic value once the override is cleared", () => {
    const island = {
      snapshot: snapshotWith({ sacks: { ASHWREATH: 512 } }),
      sections: sectionsWith({ sacks: captured("mod") }),
    };

    const overridden = build({ island, manual: { ashwreath: 3 } });
    expect(overridden.count("ashwreath")).toBe(3);

    // Clearing an override is the removal of the key, which is exactly what the
    // planner does. Nothing else about the input changes.
    const cleared = build({ island, manual: {} });
    expect(cleared.count("ashwreath")).toBe(512);
    expect(cleared.get("ashwreath")?.overridden).toBe(false);
  });

  it("keeps a typed number for an item the index has never heard of", () => {
    const owned = build({ manual: { "some-uncrafted-mutation": 12 } });
    const entry = owned.get("some-uncrafted-mutation");
    expect(entry?.total).toBe(12);
    expect(entry?.hypixelId).toBeNull();
    expect(entry?.sources).toEqual([]);
  });
});

describe("an absent source contributes nothing, not zero", () => {
  it("has no entry at all when nothing has ever looked", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 5 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });

    expect(owned.get("choconut")).toBeUndefined();
    expect(owned.count("choconut")).toBeUndefined();
    expect(owned.auto("choconut")).toBeUndefined();
  });

  it("ignores a section Hypixel hid rather than reading it as empty", () => {
    const owned = build({
      island: {
        // A healthy profile that simply did not include sacks: the player's API
        // settings do not share them. Emphatically not "you own none".
        snapshot: snapshotWith({ sacks: {} }),
        sections: sectionsWith({ sacks: { state: "hidden", source: "api", at: 10 } }),
      },
    });
    expect(owned.has).toBe(false);
    expect(owned.count("ashwreath")).toBeUndefined();
  });

  it("says nothing at all with no island, no shards and no manual entries", () => {
    const owned = build();
    expect(owned.has).toBe(false);
    expect(owned.entries()).toEqual([]);
    expect(owned.keys()).toEqual([]);
    expect(owned.sources).toEqual([]);
  });

  it("stays quiet when the island has never reported", () => {
    const owned = build({ island: { snapshot: null, sections: sectionsWith() } });
    expect(owned.has).toBe(false);
  });
});

describe("hypixelId bridging", () => {
  it("matches on hypixelId rather than on the site's key", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { OAK_LOG: 4_096 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });
    expect(owned.count("oak-log")).toBe(4_096);
    expect(owned.get("oak-log")?.hypixelId).toBe("OAK_LOG");
  });

  it("falls back to a case-insensitive match, the way sackLookup does", () => {
    const owned = buildOwned({
      items: { "oak-log": { hypixelId: "Oak_Log" } },
      island: {
        snapshot: snapshotWith({ sacks: { OAK_LOG: 4_096 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });
    expect(owned.count("oak-log")).toBe(4_096);
  });

  it("prefers the exact match when both cases exist", () => {
    const owned = buildOwned({
      items: { lower: { hypixelId: "oak_log" }, upper: { hypixelId: "OAK_LOG" } },
      island: {
        snapshot: snapshotWith({ sacks: { oak_log: 7, OAK_LOG: 4_096 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });
    expect(owned.count("lower")).toBe(7);
    expect(owned.count("upper")).toBe(4_096);
  });

  it("never matches an item the site knows by name only", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 5, "": 99 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });
    expect(owned.get("wiki-only")).toBeUndefined();
  });

  it("does not read an inherited property as a count", () => {
    const owned = buildOwned({
      items: { odd: { hypixelId: "constructor" } },
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 5 } }),
        sections: sectionsWith({ sacks: captured("mod") }),
      },
    });
    expect(owned.get("odd")).toBeUndefined();
  });
});

describe("shared source visibility", () => {
  it("includes the legacy shard tally by default alongside the island source toggles", () => {
    const defaultSources = getInventoryManagement().enabledSources;
    expect([...defaultSources]).toEqual([...MANAGED_HOLDING_SOURCES]);
    expect(defaultSources.has("shards")).toBe(false);

    const owned = build({
      items: { grove: { hypixelId: "SHARD_GROVE" } },
      island: {
        snapshot: snapshotWith({ inventory: [item("SHARD_GROVE", 2)] }),
        sections: sectionsWith({ inventory: captured("mod") }),
      },
      shards: { counts: { C1: 96 }, ids: { C1: "SHARD_GROVE" } },
      // This is the default set supplied by useInventoryManagement/useOwned.
      enabledSources: defaultSources,
    });

    expect(owned.count("grove")).toBe(98);
    expect(owned.get("grove")?.sources.map((source) => source.source)).toEqual(["island.inventory", "shards"]);
    expect(describeSources(owned.get("grove"))).toBe("inventory 2 (mod), shard inventory 96");
  });

  it("filters planner holdings by the shared source switches without changing the snapshot", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 5 }, inventory: [item("ASHWREATH", 2)] }),
        sections: sectionsWith({ sacks: captured("api"), inventory: captured("mod") }),
      },
      enabledSources: new Set(["island.sacks"]),
    });
    expect(owned.count("ashwreath")).toBe(5);
    expect(owned.get("ashwreath")?.sources.map((source) => source.source)).toEqual(["island.sacks"]);
  });

  it("keeps a manual override available even when every automatic source is disabled", () => {
    const owned = build({
      island: {
        snapshot: snapshotWith({ sacks: { ASHWREATH: 5 } }),
        sections: sectionsWith({ sacks: captured("api") }),
      },
      manual: { ashwreath: 7 },
      enabledSources: new Set(),
    });
    expect(owned.count("ashwreath")).toBe(7);
    expect(owned.get("ashwreath")?.overridden).toBe(true);
    expect(owned.get("ashwreath")?.sources).toEqual([]);
  });

  it("keeps the separate shard source when every island container is disabled", () => {
    const owned = buildOwned({
      items: { grove: { hypixelId: "SHARD_GROVE" } },
      shards: { counts: { C1: 96 }, ids: { C1: "SHARD_GROVE" } },
      enabledSources: new Set(),
    });

    expect(owned.count("grove")).toBe(96);
    expect(owned.get("grove")?.sources.map((source) => source.source)).toEqual(["shards"]);
  });
});
