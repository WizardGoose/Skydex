import { describe, it, expect } from "vitest";
import {
  accessoriesFromIndex,
  buildAccessoryCatalogue,
  buildFamilies,
  isNormalAccessory,
} from "../catalogue";
import type { ItemIndex } from "../../items/useItemData";

/**
 * The catalogue, and the one derivation it is allowed to make.
 *
 * Hypixel does not say that a Bioanalysis Ring is the Bioanalysis Talisman one
 * rung up. There is no family field, no upgrade field, nothing. That
 * relationship is the whole point of a checklist, so it is derived from the id
 * naming convention, and the cross-check below is what stops that derivation
 * from turning a naming coincidence into a wrongly ticked box.
 */

const item = (name: string, id: string, tier: string | null, category = "ACCESSORY") => ({
  name,
  hypixelId: id,
  tier,
  category,
  npcSell: null,
  yields: 1,
  recipe: null,
});

describe("buildFamilies", () => {
  it("forms a family from the ladder suffixes and orders it lowest rung first", () => {
    const families = buildFamilies([
      { id: "BIOANALYSIS_ARTIFACT", tier: "RARE" },
      { id: "BIOANALYSIS_TALISMAN", tier: "COMMON" },
      { id: "BIOANALYSIS_RING", tier: "UNCOMMON" },
    ]);

    expect(families.BIOANALYSIS.members).toStrictEqual([
      "BIOANALYSIS_TALISMAN",
      "BIOANALYSIS_RING",
      "BIOANALYSIS_ARTIFACT",
    ]);
    expect(families.BIOANALYSIS.check).toBe("verified");
    expect(families.BIOANALYSIS.collapsible).toBe(true);
  });

  it("rejects a stem whose rarities run backwards along the ladder", () => {
    // Evidence that the shared stem is a coincidence rather than an upgrade.
    const families = buildFamilies([
      { id: "FAKE_TALISMAN", tier: "LEGENDARY" },
      { id: "FAKE_ARTIFACT", tier: "COMMON" },
    ]);
    expect(families.FAKE.check).toBe("rejected");
    expect(families.FAKE.collapsible).toBe(false);
  });

  it("accepts two rungs sharing a rarity, which proves nothing either way", () => {
    const families = buildFamilies([
      { id: "FLAT_TALISMAN", tier: "RARE" },
      { id: "FLAT_RING", tier: "RARE" },
    ]);
    expect(families.FLAT.check).toBe("verified");
  });

  it("will not collapse a family it could not check", () => {
    // Only one member carries a rarity, so there was nothing to compare.
    const families = buildFamilies([
      { id: "QUIET_TALISMAN", tier: "COMMON" },
      { id: "QUIET_RING", tier: undefined },
    ]);
    expect(families.QUIET.check).toBe("unverified");
    expect(families.QUIET.collapsible).toBe(false);
  });

  it("treats an unfamiliar rarity as unknown rather than as lowest", () => {
    // A rarity Hypixel adds later must make us less certain, not manufacture a
    // contradiction out of a value we simply do not recognise.
    const families = buildFamilies([
      { id: "NEW_TALISMAN", tier: "ULTIMATE" },
      { id: "NEW_RING", tier: "COMMON" },
    ]);
    expect(families.NEW.check).toBe("unverified");
  });

  it("does not invent a family from a single member", () => {
    expect(buildFamilies([{ id: "LONELY_TALISMAN", tier: "COMMON" }])).toStrictEqual({});
  });
});

describe("buildAccessoryCatalogue", () => {
  it("cleans a colour code out of a name Hypixel ships with one", () => {
    /*
     * Real data: WEDDING_RING_0 is literally named "§eShiny Yellow Rock".
     * Two accessories carry this. Left in, it renders on the tile and breaks
     * the icon URL, the wiki link and the index join all at once.
     */
    const index: ItemIndex = { shiny: item("§eShiny Yellow Rock", "WEDDING_RING_0", "COMMON") };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);

    expect(catalogue.entries[0].name).toBe("Shiny Yellow Rock");
  });

  it("keeps the id as a fallback when a name is nothing but a colour code", () => {
    const index: ItemIndex = { odd: item("§e", "ODD_TALISMAN", "COMMON") };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries[0].name).toBe("ODD_TALISMAN");
  });

  it("takes only accessories, and only ones with an id to match against", () => {
    const index: ItemIndex = {
      ring: item("Bioanalysis Ring", "BIOANALYSIS_RING", "UNCOMMON"),
      sword: item("Aspect of the End", "ASPECT_OF_THE_END", "RARE", "SWORD"),
      nameless: { ...item("Ghost", "GHOST", null), hypixelId: null },
    };

    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries.map((e) => e.id)).toStrictEqual(["BIOANALYSIS_RING"]);
  });

  it("removes confirmed category mistakes and explicit test items", () => {
    const index: ItemIndex = {
      boot: item("Old Boot", "OLD_BOOT", "RARE"),
      test: item("Test Bucket Please Ignore", "TEST_BUCKET_PLEASE_IGNORE", "UNCOMMON"),
      adminTalisman: item("Talisman of Space", "TALISMAN_OF_SPACE", "ADMIN"),
      adminPaw: item("Grizzly Paw", "GRIZZLY_PAW", "ADMIN"),
      adminArtifact: item("Artifact of Space", "ARTIFACT_OF_SPACE", "ADMIN"),
      real: item("Wolf Talisman", "WOLF_TALISMAN", "UNCOMMON"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries.map((entry) => entry.id)).toEqual(["WOLF_TALISMAN"]);
  });

  it("keeps Rift-origin transferables on the normal page", () => {
    expect(isNormalAccessory({ rift: true, riftTransferable: false })).toBe(false);
    expect(isNormalAccessory({ rift: true, riftTransferable: true })).toBe(true);
    expect(isNormalAccessory({ rift: false, riftTransferable: false })).toBe(true);
    expect(isNormalAccessory({ rift: false, riftTransferable: false, acquisition: { category: "legacy" } })).toBe(false);
    expect(isNormalAccessory({ rift: false, riftTransferable: false, acquisition: { category: "events" } })).toBe(true);
  });

  it("excludes removed and unreleased accessories even when a legacy recipe remains", () => {
    const ids = ["COMPASS_TALISMAN", "ETERNAL_CRYSTAL", "LUCK_TALISMAN", "BINGO_HEIRLOOM", "RING_OF_SPACE", "MASTER_SKULL_TIER_8", "MASTER_SKULL_TIER_9", "MASTER_SKULL_TIER_10"];
    const index: ItemIndex = Object.fromEntries(ids.map((id) => [id, {
      ...item(id, id, "EPIC"),
      recipe: [{ id: "quartz", name: "Quartz", qty: 1 }],
    }]));
    index.event = item("Crab Hat of Celebration", "PARTY_HAT_CRAB", "SPECIAL");
    index.unknown = item("New Accessory", "NEW_ACCESSORY", null);
    index.skull = item("Master Skull - Tier 7", "MASTER_SKULL_TIER_7", "EPIC");
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries.map((entry) => entry.id)).toEqual(["PARTY_HAT_CRAB", "MASTER_SKULL_TIER_7", "NEW_ACCESSORY"]);
    for (const id of ids) expect(catalogue.byId[id]).toBeUndefined();
  });

  it("rejects explicit unavailable and admin flags without guessing from a missing rarity", () => {
    const catalogue = buildAccessoryCatalogue([
      { id: "FUTURE_ACCESSORY", category: "ACCESSORY", tier: "UNOBTAINABLE" },
      { id: "STAFF_ACCESSORY", category: "ACCESSORY", tier: "ADMIN" },
      { id: "ORDINARY_ACCESSORY", category: "ACCESSORY" },
    ], {});
    expect(catalogue.entries.map((entry) => entry.id)).toEqual(["ORDINARY_ACCESSORY"]);
    const index: ItemIndex = {
      future: { ...item("Future Charm", "FUTURE_CHARM", null), unavailable: true },
      real: item("Real Charm", "REAL_CHARM", null),
    };
    expect(buildAccessoryCatalogue(accessoriesFromIndex(index), index).entries.map((entry) => entry.id)).toEqual(["REAL_CHARM"]);
  });

  it("marks an accessory craftable only when a recipe really exists", () => {
    const index: ItemIndex = {
      made: {
        ...item("Made Talisman", "MADE_TALISMAN", "COMMON"),
        recipe: [{ id: "acacia_log", name: "Acacia Log", qty: 8 }],
      },
      found: item("Found Talisman", "FOUND_TALISMAN", "COMMON"),
    };

    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.byId.MADE_TALISMAN.craftable).toBe(true);
    expect(catalogue.byId.FOUND_TALISMAN.craftable).toBe(false);
  });

  it("keeps one tile per accessory when the wiki has an article per rarity", () => {
    /*
     * Real data: the wiki carries "Beastmaster Crest" plus five rarity variant
     * articles, and every one of them resolves to the same Hypixel id because
     * `buildItemIndex` strips the parenthetical to find the base item. Six
     * tiles for one accessory, five of them permanently unownable.
     */
    const index: ItemIndex = {
      base: item("Beastmaster Crest", "BEASTMASTER_CREST", "COMMON"),
      rare: item("Beastmaster Crest (Rare)", "BEASTMASTER_CREST", "RARE"),
      epic: item("Beastmaster Crest (Epic)", "BEASTMASTER_CREST", "EPIC"),
    };

    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries).toHaveLength(1);
    // The plain name is the one a player would search for.
    expect(catalogue.entries[0].name).toBe("Beastmaster Crest");
  });

  it("still keeps one entry when every article is a variant", () => {
    const index: ItemIndex = {
      rare: item("Odd Crest (Rare)", "ODD_CREST", "RARE"),
      epic: item("Odd Crest (Epic)", "ODD_CREST", "EPIC"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries).toHaveLength(1);
  });

  it("does not merge two genuinely different accessories", () => {
    const index: ItemIndex = {
      a: item("Wolf Talisman", "WOLF_TALISMAN", "UNCOMMON"),
      b: item("Wolf Ring", "WOLF_RING", "RARE"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries).toHaveLength(2);
  });

  it("sorts by name so the page does not have to", () => {
    const index: ItemIndex = {
      z: item("Zebra Talisman", "ZEBRA_TALISMAN", "COMMON"),
      a: item("Apple Talisman", "APPLE_TALISMAN", "COMMON"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
    expect(catalogue.entries.map((e) => e.name)).toStrictEqual(["Apple Talisman", "Zebra Talisman"]);
  });

  it("marks Rift accessories from Hypixel's origin field, and only from it", () => {
    /*
     * The measured reason `origin` is the signal and stat shape is not:
     * Scarf's Studies is Catacombs dungeon loot whose whole stat block is
     * rift stats, and it must NOT land in the Rift band.
     */
    const index: ItemIndex = {
      crux: { ...item("Crux Talisman", "CRUX_TALISMAN_1", "COMMON"), origin: "RIFT" },
      scarf: { ...item("Scarf's Studies", "SCARF_STUDIES", "RARE"), stats: { rift_Time: 10 } },
      wolf: item("Wolf Talisman", "WOLF_TALISMAN", "UNCOMMON"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);

    expect(catalogue.byId.CRUX_TALISMAN_1.rift).toBe(true);
    expect(catalogue.byId.SCARF_STUDIES.rift).toBe(false);
    expect(catalogue.byId.WOLF_TALISMAN.rift).toBe(false);
  });

  it("carries the family onto its members, and nothing onto a rejected one", () => {
    const index: ItemIndex = {
      bt: item("Bioanalysis Talisman", "BIOANALYSIS_TALISMAN", "COMMON"),
      br: item("Bioanalysis Ring", "BIOANALYSIS_RING", "UNCOMMON"),
      ft: item("Fake Talisman", "FAKE_TALISMAN", "LEGENDARY"),
      fa: item("Fake Artifact", "FAKE_ARTIFACT", "COMMON"),
    };
    const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);

    expect(catalogue.byId.BIOANALYSIS_TALISMAN.family).toBe("BIOANALYSIS");
    expect(catalogue.byId.BIOANALYSIS_TALISMAN.familyRank).toBe(1);
    expect(catalogue.byId.BIOANALYSIS_RING.familyRank).toBe(2);

    // A rejected family is not a family: its members carry no stem at all, so
    // nothing downstream has a route to collapse them.
    expect(catalogue.byId.FAKE_TALISMAN.family).toBeNull();
    expect(catalogue.byId.FAKE_ARTIFACT.family).toBeNull();
    expect(catalogue.stats.rejectedFamilies).toBe(1);
  });
});
