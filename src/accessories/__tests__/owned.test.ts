import { describe, it, expect } from "vitest";
import { nbt } from "../../nbt/tags";
import { writeNbtBlob } from "../../nbt/blob";
import {
  bagFromItems,
  bagFromParsedItems,
  bioanalysisRank,
  collapseOwned,
  findTalismanBag,
  readAbiphoneContacts,
  readConsumedPrism,
  readOwnedFromMember,
  tierFromLore,
} from "../owned";
import { buildAccessoryCatalogue } from "../catalogue";
import type { ItemIndex } from "../../items/useItemData";

/**
 * Ownership: what is in the bag, and what owning it implies.
 *
 * The bag half is tested end to end through the real writer rather than against
 * a hand-built tree, so a passing test proves the whole transport: compound to
 * bytes to gzip to base64, and all the way back out through the projection. A
 * fixture built any other way would only prove the reader agrees with itself.
 */

/** One slot of a bag, in the shape Hypixel actually writes. */
const slot = (id: string, recombed = false) =>
  nbt.compound({
    Count: nbt.byte(1),
    id: nbt.short(397),
    Damage: nbt.short(3),
    tag: nbt.compound({
      ExtraAttributes: nbt.compound({
        id: nbt.string(id),
        // The recomb flag as live data carries it: an int, and only ever 1.
        ...(recombed ? { rarity_upgrades: nbt.int(1) } : {}),
      }),
    }),
  });

/** A bag blob, exactly as `talisman_bag.data` carries it. */
const bagBlob = (ids: string[], extras: ReturnType<typeof nbt.compound>[] = []) =>
  writeNbtBlob(
    "",
    nbt.compound({
      i: nbt.list("compound", [...ids.map((id) => slot(id)), ...extras]),
    })
  );

/** A minimal item index carrying the accessories a case needs. */
const indexOf = (entries: { key: string; name: string; id: string; tier?: string }[]): ItemIndex => {
  const items: ItemIndex = {};
  for (const e of entries) {
    items[e.key] = {
      name: e.name,
      hypixelId: e.id,
      tier: e.tier ?? null,
      category: "ACCESSORY",
      npcSell: null,
      yields: 1,
      recipe: null,
    };
  }
  return items;
};

const BIO = indexOf([
  { key: "bioanalysis_talisman", name: "Bioanalysis Talisman", id: "BIOANALYSIS_TALISMAN", tier: "COMMON" },
  { key: "bioanalysis_ring", name: "Bioanalysis Ring", id: "BIOANALYSIS_RING", tier: "UNCOMMON" },
  { key: "bioanalysis_artifact", name: "Bioanalysis Artifact", id: "BIOANALYSIS_ARTIFACT", tier: "RARE" },
]);

const bioCatalogue = () =>
  buildAccessoryCatalogue(
    [
      { id: "BIOANALYSIS_TALISMAN", name: "Bioanalysis Talisman", tier: "COMMON", category: "ACCESSORY" },
      { id: "BIOANALYSIS_RING", name: "Bioanalysis Ring", tier: "UNCOMMON", category: "ACCESSORY" },
      { id: "BIOANALYSIS_ARTIFACT", name: "Bioanalysis Artifact", tier: "RARE", category: "ACCESSORY" },
    ],
    BIO
  );

describe("findTalismanBag", () => {
  it("finds the bag where the modern API puts it", () => {
    const member = { inventory: { bag_contents: { talisman_bag: { type: 0, data: "BLOB" } } } };
    expect(findTalismanBag(member)).toBe("BLOB");
  });

  it("falls back to the older flat position", () => {
    expect(findTalismanBag({ talisman_bag: { type: 0, data: "OLD" } })).toBe("OLD");
  });

  it("prefers the nested one when a profile somehow carries both", () => {
    const member = {
      talisman_bag: { data: "OLD" },
      inventory: { bag_contents: { talisman_bag: { data: "NEW" } } },
    };
    expect(findTalismanBag(member)).toBe("NEW");
  });

  it("answers null for a member with no bag at all", () => {
    expect(findTalismanBag({ inventory: {} })).toBeNull();
    expect(findTalismanBag({})).toBeNull();
    expect(findTalismanBag(null)).toBeNull();
    // Present but empty is nothing to read, not an empty bag.
    expect(findTalismanBag({ talisman_bag: { data: "" } })).toBeNull();
  });
});

describe("readOwnedFromMember", () => {
  it("decodes a real gzipped bag end to end", async () => {
    const data = await bagBlob(["BIOANALYSIS_RING", "SPEED_TALISMAN"]);
    const member = { inventory: { bag_contents: { talisman_bag: { type: 0, data } } } };

    const bag = await readOwnedFromMember(member);
    expect(bag?.ids).toStrictEqual(["BIOANALYSIS_RING", "SPEED_TALISMAN"]);
    expect(bag?.recombobulated.size).toBe(0);
  });

  it("reads the recomb flag off the same stacks, end to end", async () => {
    // Through the real writer, so a passing test proves `rarity_upgrades`
    // survives the whole transport and not just the projection.
    const data = await writeNbtBlob(
      "",
      nbt.compound({ i: nbt.list("compound", [slot("WOLF_TALISMAN", true), slot("SPEED_TALISMAN")]) })
    );
    const member = { inventory: { bag_contents: { talisman_bag: { data } } } };

    const bag = await readOwnedFromMember(member);
    expect(bag?.ids).toStrictEqual(["WOLF_TALISMAN", "SPEED_TALISMAN"]);
    expect(bag?.recombobulated).toStrictEqual(new Set(["WOLF_TALISMAN"]));
  });

  it("skips the empty slots a real bag is full of", async () => {
    // A bag is a fixed-size container, so most slots are empty compounds.
    const data = await bagBlob(["BIOANALYSIS_ARTIFACT"], [nbt.compound({}), nbt.compound({})]);
    const member = { inventory: { bag_contents: { talisman_bag: { data } } } };

    expect((await readOwnedFromMember(member))?.ids).toStrictEqual(["BIOANALYSIS_ARTIFACT"]);
  });

  it("answers null, not an empty bag, when there is no bag", async () => {
    // The distinction the whole page hangs on.
    expect(await readOwnedFromMember({})).toBeNull();
  });

  it("answers null rather than throwing when the blob is damaged", async () => {
    const member = { inventory: { bag_contents: { talisman_bag: { data: "bm90IG5idCBhdCBhbGw=" } } } };
    expect(await readOwnedFromMember(member)).toBeNull();
  });

  it("reads a genuinely empty bag as an empty bag", async () => {
    const data = await bagBlob([]);
    const member = { inventory: { bag_contents: { talisman_bag: { data } } } };
    // Read successfully and holds nothing: a real claim, unlike null.
    const bag = await readOwnedFromMember(member);
    expect(bag?.ids).toStrictEqual([]);
    expect(bag?.recombobulated.size).toBe(0);
  });
});

describe("tierFromLore", () => {
  it("reads the rarity line, in the resource's own spelling", () => {
    expect(tierFromLore(["Grants stuff.", "", "EPIC ACCESSORY"])).toBe("EPIC");
    expect(tierFromLore(["VERY SPECIAL ACCESSORY"])).toBe("VERY_SPECIAL");
    expect(tierFromLore(["LEGENDARY DUNGEON ACCESSORY"])).toBe("LEGENDARY");
    // A recombed line keeps its obfuscated wrapper glyphs after colour
    // stripping; nothing here is anchored, so it still reads.
    expect(tierFromLore(["a LEGENDARY ACCESSORY a"])).toBe("LEGENDARY");
  });

  it("does not read a rarity word out of prose", () => {
    // "a RARE drop from..." is a sentence, not a rarity line; the category
    // noun is what makes the line a statement about the item.
    expect(tierFromLore(["A RARE drop from Spooky Festival mobs."])).toBeNull();
    expect(tierFromLore(null)).toBeNull();
    expect(tierFromLore([])).toBeNull();
  });
});

describe("bagFromItems", () => {
  const item = (
    id: string | null,
    rarityUpgrades: number | null,
    lore: string[] | null = null,
    enrichment: string | null = null,
  ) => ({
    slot: 0,
    id,
    count: 1,
    name: null,
    lore,
    enchantments: null,
    reforge: null,
    rarityUpgrades,
    enrichment,
    uuid: null,
  });

  it("marks an id recombed when any of its stacks is", () => {
    // A duplicate where only one copy is recombed still means the player owns
    // a recombed one, and that copy is the one the game treats as active.
    const bag = bagFromItems([item("WOLF_TALISMAN", null), item("WOLF_TALISMAN", 1)]);
    expect(bag.recombobulated).toStrictEqual(new Set(["WOLF_TALISMAN"]));
  });

  it("does not read a zero as a recomb", () => {
    const bag = bagFromItems([item("WOLF_TALISMAN", 0)]);
    expect(bag.recombobulated.size).toBe(0);
  });

  it("drops idless slots from both lists", () => {
    const bag = bagFromItems([item(null, 1)]);
    expect(bag.ids).toStrictEqual([]);
    expect(bag.recombobulated.size).toBe(0);
  });

  it("keeps the stated rarity per id, higher rarity winning a duplicate", () => {
    const bag = bagFromItems([
      item("KING_TALISMAN", null, ["Hail to the king.", "COMMON ACCESSORY"]),
      item("WOLF_RING", 1, ["a RARE ACCESSORY a"]),
      item("WOLF_RING", null, ["UNCOMMON ACCESSORY"]),
    ]);
    expect(bag.tiers.get("KING_TALISMAN")).toBe("COMMON");
    // The recombed copy states RARE and outranks its plain twin.
    expect(bag.tiers.get("WOLF_RING")).toBe("RARE");
  });

  it("keeps a proven enrichment and refuses conflicting duplicate values", () => {
    const bag = bagFromItems([
      item("WOLF_RING", null, null, "magic_find"),
      item("WOLF_RING", null),
      item("SEAL_OF_THE_FAMILY", null, null, "strength"),
      item("SEAL_OF_THE_FAMILY", null, null, "critical_damage"),
    ]);

    expect(bag.enrichments.get("WOLF_RING")).toBe("magic_find");
    expect(bag.enrichments.has("SEAL_OF_THE_FAMILY")).toBe(false);
    expect(bag.ambiguousEnrichments).toStrictEqual(new Set(["SEAL_OF_THE_FAMILY"]));
  });
});

describe("bagFromParsedItems", () => {
  it("recovers ownership, rarity, recomb and enrichment from the shared parsed profile", () => {
    const bag = bagFromParsedItems([
      {
        tag: {
          display: { Lore: ["§7A useful thing.", "§d§lMYTHIC ACCESSORY"] },
          ExtraAttributes: {
            id: "WOLF_RING",
            rarity_upgrades: 1,
            talisman_enrichment: "magic_find",
          },
        },
      },
      { tag: { ExtraAttributes: { id: "SPEED_TALISMAN" } } },
      {},
    ]);

    expect(bag.ids).toStrictEqual(["WOLF_RING", "SPEED_TALISMAN"]);
    expect(bag.recombobulated).toStrictEqual(new Set(["WOLF_RING"]));
    expect(bag.tiers.get("WOLF_RING")).toBe("MYTHIC");
    expect(bag.enrichments.get("WOLF_RING")).toBe("magic_find");
  });

  it("keeps a decoded empty bag distinct from an unavailable bag", () => {
    expect(bagFromParsedItems([]).ids).toStrictEqual([]);
  });
});

describe("profile fields for the Magical Power model", () => {
  it("reads a consumed Rift Prism only from a literal true", () => {
    expect(readConsumedPrism({ rift: { access: { consumed_prism: true } } })).toBe(true);
    // Consuming a prism is what creates the field, so absence means not
    // consumed rather than unknown; and nothing truthy-but-not-true counts.
    expect(readConsumedPrism({ rift: { access: { consumed_prism: 1 } } })).toBe(false);
    expect(readConsumedPrism({ rift: { access: {} } })).toBe(false);
    expect(readConsumedPrism({ rift: {} })).toBe(false);
    expect(readConsumedPrism({})).toBe(false);
    expect(readConsumedPrism(null)).toBe(false);
  });

  it("counts Abiphone contacts, and answers null when the profile is silent", () => {
    const member = {
      nether_island_player_data: { abiphone: { active_contacts: ["odawa", "elle", "plumber_joe"] } },
    };
    expect(readAbiphoneContacts(member)).toBe(3);
    expect(readAbiphoneContacts({ nether_island_player_data: { abiphone: { active_contacts: [] } } })).toBe(0);
    // No Crimson Isle data is not zero contacts: an Abicase from the Auction
    // House would still carry MP we cannot see, so this must stay unknown.
    expect(readAbiphoneContacts({ nether_island_player_data: {} })).toBeNull();
    expect(readAbiphoneContacts({})).toBeNull();
    expect(readAbiphoneContacts(null)).toBeNull();
  });
});

describe("collapseOwned", () => {
  it("counts the lower rungs as covered when a higher one is held", () => {
    const sets = collapseOwned(["BIOANALYSIS_ARTIFACT"], bioCatalogue());

    expect(sets.held).toStrictEqual(new Set(["BIOANALYSIS_ARTIFACT"]));
    // The talisman and ring were consumed to make it, so they are not missing.
    expect(sets.covered).toStrictEqual(
      new Set(["BIOANALYSIS_ARTIFACT", "BIOANALYSIS_RING", "BIOANALYSIS_TALISMAN"])
    );
  });

  it("does not promote upward", () => {
    const sets = collapseOwned(["BIOANALYSIS_TALISMAN"], bioCatalogue());
    // Holding the bottom rung says nothing about the top ones.
    expect(sets.covered).toStrictEqual(new Set(["BIOANALYSIS_TALISMAN"]));
  });

  it("ignores ids that are not accessories at all", () => {
    const sets = collapseOwned(["ENCHANTED_BREAD"], bioCatalogue());
    expect(sets.held.size).toBe(0);
    expect(sets.covered.size).toBe(0);
  });

  it("refuses to collapse a family whose rarities contradict the ladder", () => {
    // A naming coincidence, not an upgrade chain: the "ring" is rarer than the
    // "artifact", so the stem is rejected and neither covers the other.
    const items = indexOf([
      { key: "fake_talisman", name: "Fake Talisman", id: "FAKE_TALISMAN", tier: "LEGENDARY" },
      { key: "fake_artifact", name: "Fake Artifact", id: "FAKE_ARTIFACT", tier: "COMMON" },
    ]);
    const catalogue = buildAccessoryCatalogue(
      [
        { id: "FAKE_TALISMAN", name: "Fake Talisman", tier: "LEGENDARY", category: "ACCESSORY" },
        { id: "FAKE_ARTIFACT", name: "Fake Artifact", tier: "COMMON", category: "ACCESSORY" },
      ],
      items
    );

    expect(catalogue.stats.rejectedFamilies).toBe(1);
    const sets = collapseOwned(["FAKE_ARTIFACT"], catalogue);
    expect(sets.covered).toStrictEqual(new Set(["FAKE_ARTIFACT"]));
  });
});

describe("bioanalysisRank", () => {
  it("takes the best rung held", () => {
    expect(bioanalysisRank(["BIOANALYSIS_TALISMAN"])).toBe(1);
    expect(bioanalysisRank(["BIOANALYSIS_RING"])).toBe(2);
    expect(bioanalysisRank(["BIOANALYSIS_ARTIFACT"])).toBe(3);
    expect(bioanalysisRank(["BIOANALYSIS_TALISMAN", "BIOANALYSIS_ARTIFACT", "BIOANALYSIS_RING"])).toBe(3);
  });

  it("separates a read bag holding none from a bag we could not read", () => {
    // This is the whole reason the signature takes a nullable.
    expect(bioanalysisRank([])).toBe(0);
    expect(bioanalysisRank(["SPEED_TALISMAN"])).toBe(0);
    expect(bioanalysisRank(null)).toBeNull();
  });

  it("is not fooled by an id that merely starts the same way", () => {
    expect(bioanalysisRank(["BIOANALYSIS_TALISMAN_REPLICA"])).toBe(0);
  });
});
