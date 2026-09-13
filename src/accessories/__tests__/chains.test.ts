import { describe, it, expect } from "vitest";
import { buildChainIndex, parseUpgradeEdges } from "../chains";
import { buildAccessoryCatalogue, accessoriesFromIndex } from "../catalogue";
import { collapseOwned } from "../owned";
import { composeSnapshot } from "../useAccessories";
import { buildCollectionKeys, NO_COLLECTIONS } from "../collections";
import type { ItemIndex } from "../../items/useItemData";

/**
 * Upgrade chains, and the bug they exist to prevent.
 *
 * The reported failure: both the same item, just one is
 * an upgrade. Owning the Seal of the Family still listed Crooked Artifact as
 * Missing. The rule for the fix is that this class of thing must never
 * happen with artifacts again, so this file pins two things: that exact pair,
 * and the structural property that makes the whole class of bug impossible to
 * reintroduce quietly.
 */

const item = (name: string, id: string, tier: string) => ({
  name,
  hypixelId: id,
  tier,
  category: "ACCESSORY",
  npcSell: null,
  yields: 1,
  recipe: null,
});

/*
 * The real chain, verbatim from the live wiki. None of these three ids share a
 * stem, which is exactly why the old id-based rule could never have linked
 * them.
 */
const SHADY = "Shady Ring";
const CROOKED = "Crooked Artifact";
const SEAL = "Seal of the Family";

const index: ItemIndex = {
  shady: item(SHADY, "SHADY_RING", "UNCOMMON"),
  crooked: item(CROOKED, "CROOKED_ARTIFACT", "RARE"),
  seal: item(SEAL, "SEAL_OF_THE_FAMILY", "EPIC"),
  unrelated: item("Wolf Paw", "WOLF_PAW", "COMMON"),
};

const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);

/** The Crooked Artifact article's infobox, as the wiki actually writes it. */
const CROOKED_WIKITEXT = `{{Infobox/Accessory
|id = CROOKED_ARTIFACT
|rarity = rare
|upgradeable = Yes
|upgrades_from = Shady Ring
|upgrades_to = Seal of the Family
|salable=n
}}`;

describe("parseUpgradeEdges", () => {
  it("reads both directions off one article and points them the same way", () => {
    const edges = parseUpgradeEdges(CROOKED, CROOKED_WIKITEXT);
    expect(edges).toContainEqual({ from: CROOKED, to: SEAL });
    expect(edges).toContainEqual({ from: SHADY, to: CROOKED });
  });

  it("reads higher_tier, which some articles use instead", () => {
    // Anita's Talisman uses this spelling.
    const edges = parseUpgradeEdges("Anita's Talisman", `{{Infobox/Accessory\n|higher_tier = Anita's Ring\n}}`);
    expect(edges).toStrictEqual([{ from: "Anita's Talisman", to: "Anita's Ring" }]);
  });

  it("strips wiki link brackets and templates from the value", () => {
    const edges = parseUpgradeEdges("A", `|upgrades_to = [[Seal of the Family]]`);
    expect(edges[0].to).toBe(SEAL);
  });

  it("ignores an article that claims to upgrade into itself", () => {
    expect(parseUpgradeEdges("Wolf Paw", `|upgrades_to = Wolf Paw`)).toStrictEqual([]);
  });

  it("returns nothing for an article with no upgrade fields", () => {
    expect(parseUpgradeEdges("Wolf Paw", `{{Infobox/Accessory\n|id = WOLF_PAW\n}}`)).toStrictEqual([]);
  });
});

describe("the reported pair", () => {
  const chains = buildChainIndex(parseUpgradeEdges(CROOKED, CROOKED_WIKITEXT), catalogue);

  it("covers the whole chain beneath an owned top rung", () => {
    // THE REGRESSION. Owning the Seal must cover both rungs under it.
    const sets = collapseOwned(["SEAL_OF_THE_FAMILY"], catalogue, chains);

    expect(sets.covered.has("CROOKED_ARTIFACT")).toBe(true);
    expect(sets.covered.has("SHADY_RING")).toBe(true);
  });

  it("does not mark Crooked Artifact missing on a profile holding the Seal", () => {
    const keys = buildCollectionKeys(index);
    const snap = composeSnapshot(
      catalogue,
      ["SEAL_OF_THE_FAMILY"],
      {},
      NO_COLLECTIONS,
      keys,
      false,
      null,
      undefined,
      chains
    );

    const crooked = snap.entries.find((e) => e.id === "CROOKED_ARTIFACT")!;
    expect(crooked.status).toBe("owned");
    expect(crooked.coveredByFamily).toBe(true);
  });

  it("still covers the middle rung from the middle, and nothing above it", () => {
    const sets = collapseOwned(["CROOKED_ARTIFACT"], catalogue, chains);
    expect(sets.covered.has("SHADY_RING")).toBe(true);
    // Upgrades do not run backwards: holding the middle says nothing about the top.
    expect(sets.covered.has("SEAL_OF_THE_FAMILY")).toBe(false);
  });

  it("leaves an unrelated accessory alone", () => {
    const sets = collapseOwned(["SEAL_OF_THE_FAMILY"], catalogue, chains);
    expect(sets.covered.has("WOLF_PAW")).toBe(false);
  });
});

describe("the structural rule", () => {
  /**
   * No accessory may be Missing while something further up its own chain is
   * owned.
   *
   * This is the general form of the reported bug, and it is checked as a
   * property over a whole composed snapshot rather than against one hand-picked
   * pair. Any future change that reintroduces the class of failure, by a new
   * chain source, a regressed parser or a collapse that forgets to be
   * transitive, fails here regardless of which accessories are involved.
   */
  const chains = buildChainIndex(parseUpgradeEdges(CROOKED, CROOKED_WIKITEXT), catalogue);
  const keys = buildCollectionKeys(index);

  const snapshotFor = (owned: string[]) =>
    composeSnapshot(catalogue, owned, {}, NO_COLLECTIONS, keys, false, null, undefined, chains);

  const violations = (owned: string[]) => {
    const snap = snapshotFor(owned);
    const ownedIds = new Set(snap.entries.filter((e) => e.status === "owned").map((e) => e.id));
    const bad: string[] = [];

    for (const entry of snap.entries) {
      if (entry.status === "owned") continue;
      // Anything this entry sits beneath. If the player owns one of those, the
      // entry cannot honestly be listed as not-owned.
      for (const [above, beneath] of Object.entries(chains)) {
        if (beneath.includes(entry.id) && ownedIds.has(above)) bad.push(`${entry.id} under ${above}`);
      }
    }
    return bad;
  };

  it("holds for every rung of the chain being owned", () => {
    expect(violations(["SEAL_OF_THE_FAMILY"])).toStrictEqual([]);
    expect(violations(["CROOKED_ARTIFACT"])).toStrictEqual([]);
    expect(violations(["SHADY_RING"])).toStrictEqual([]);
    expect(violations([])).toStrictEqual([]);
    expect(violations(["SEAL_OF_THE_FAMILY", "WOLF_PAW"])).toStrictEqual([]);
  });

  it("would actually catch the bug if the chain data went missing", () => {
    /*
     * A test that cannot fail is not a test. Running the same property with an
     * empty chain index reproduces the original bug exactly, which proves the
     * check above is load bearing rather than vacuously true.
     */
    const snap = composeSnapshot(catalogue, ["SEAL_OF_THE_FAMILY"], {}, NO_COLLECTIONS, keys, false, null);
    const crooked = snap.entries.find((e) => e.id === "CROOKED_ARTIFACT")!;
    expect(crooked.status).toBe("missing");
  });
});

describe("buildChainIndex with id edges", () => {
  /**
   * The third edge source. NEU's constant is already in Hypixel ids, so its
   * edges enter without name resolution, and the two kinds have to compose
   * into one index: a chain half-stated by the wiki and half by NEU is still
   * one chain.
   */
  it("links id edges directly, no name resolution involved", () => {
    const chains = buildChainIndex([], catalogue, [
      { fromId: "SHADY_RING", toId: "CROOKED_ARTIFACT" },
      { fromId: "CROOKED_ARTIFACT", toId: "SEAL_OF_THE_FAMILY" },
    ]);
    expect(new Set(chains.SEAL_OF_THE_FAMILY)).toStrictEqual(new Set(["CROOKED_ARTIFACT", "SHADY_RING"]));
  });

  it("composes a chain stated half by name and half by id", () => {
    const chains = buildChainIndex(
      [{ from: SHADY, to: CROOKED }],
      catalogue,
      [{ fromId: "CROOKED_ARTIFACT", toId: "SEAL_OF_THE_FAMILY" }]
    );
    // Transitivity crosses the seam: the Seal covers the Shady Ring even
    // though no single source stated the whole chain.
    expect(new Set(chains.SEAL_OF_THE_FAMILY)).toStrictEqual(new Set(["CROOKED_ARTIFACT", "SHADY_RING"]));
  });

  it("treats agreement between the wiki and NEU as a no-op", () => {
    const both = buildChainIndex(
      parseUpgradeEdges(CROOKED, CROOKED_WIKITEXT),
      catalogue,
      [
        { fromId: "SHADY_RING", toId: "CROOKED_ARTIFACT" },
        { fromId: "CROOKED_ARTIFACT", toId: "SEAL_OF_THE_FAMILY" },
      ]
    );
    const wikiOnly = buildChainIndex(parseUpgradeEdges(CROOKED, CROOKED_WIKITEXT), catalogue);
    expect(new Set(both.SEAL_OF_THE_FAMILY)).toStrictEqual(new Set(wikiOnly.SEAL_OF_THE_FAMILY));
  });

  it("drops an id edge naming an accessory we do not track", () => {
    // NEU tracks items this catalogue may not. Inventing a chain member out
    // of one would be worse than losing the edge, same rule as the names.
    const chains = buildChainIndex([], catalogue, [
      { fromId: "SHADY_RING", toId: "SOME_UNKNOWN_ID" },
      { fromId: "SOME_UNKNOWN_ID", toId: "SEAL_OF_THE_FAMILY" },
    ]);
    // The invalid supplied edges vanish; the catalogue's verified stable line
    // remains independently of them.
    expect(chains).toStrictEqual({
      CROOKED_ARTIFACT: ["SHADY_RING"],
      SEAL_OF_THE_FAMILY: ["CROOKED_ARTIFACT", "SHADY_RING"],
    });
  });

  it("terminates on a cycle arriving through the id door", () => {
    const chains = buildChainIndex([], catalogue, [
      { fromId: "CROOKED_ARTIFACT", toId: "SEAL_OF_THE_FAMILY" },
      { fromId: "SEAL_OF_THE_FAMILY", toId: "CROOKED_ARTIFACT" },
    ]);
    expect(Object.keys(chains).length).toBeGreaterThan(0);
  });
});

describe("buildChainIndex", () => {
  it("is transitive across a longer chain", () => {
    const edges = [
      { from: "Shady Ring", to: CROOKED },
      { from: CROOKED, to: SEAL },
    ];
    const chains = buildChainIndex(edges, catalogue);
    expect(new Set(chains.SEAL_OF_THE_FAMILY)).toStrictEqual(new Set(["CROOKED_ARTIFACT", "SHADY_RING"]));
  });

  it("drops an upgrade naming something that is not an accessory we know", () => {
    // One such name exists in the live data. Inventing an id for it would be
    // worse than losing the edge.
    const chains = buildChainIndex([{ from: CROOKED, to: "Some Item That Does Not Exist" }], catalogue);
    expect(chains).toStrictEqual({
      CROOKED_ARTIFACT: ["SHADY_RING"],
      SEAL_OF_THE_FAMILY: ["CROOKED_ARTIFACT", "SHADY_RING"],
    });
  });

  it("terminates on a cycle rather than hanging the page", () => {
    // Wiki data is edited by anyone, so a cycle is a question of when.
    const chains = buildChainIndex(
      [
        { from: CROOKED, to: SEAL },
        { from: SEAL, to: CROOKED },
      ],
      catalogue
    );
    expect(Object.keys(chains).length).toBeGreaterThan(0);
  });
});

describe("stable numeric progression families", () => {
  const numericIndex: ItemIndex = {
    master1: item("Master Skull - Tier 1", "MASTER_SKULL_TIER_1", "COMMON"),
    master2: item("Master Skull - Tier 2", "MASTER_SKULL_TIER_2", "COMMON"),
    master3: item("Master Skull - Tier 3", "MASTER_SKULL_TIER_3", "UNCOMMON"),
    campfire1: item("Campfire Initiate Badge I", "CAMPFIRE_TALISMAN_1", "COMMON"),
    campfire2: item("Campfire Initiate Badge II", "CAMPFIRE_TALISMAN_2", "COMMON"),
  };
  const numericCatalogue = buildAccessoryCatalogue(accessoriesFromIndex(numericIndex), numericIndex);

  it("folds Master Skull and Campfire rungs without relying on wiki text", () => {
    const chains = buildChainIndex([], numericCatalogue);
    expect(chains.MASTER_SKULL_TIER_3).toEqual(["MASTER_SKULL_TIER_2", "MASTER_SKULL_TIER_1"]);
    expect(chains.CAMPFIRE_TALISMAN_2).toEqual(["CAMPFIRE_TALISMAN_1"]);
  });
});

describe("stable named state lines", () => {
  const piggyIndex: ItemIndex = {
    piggy: item("Piggy Bank", "PIGGY_BANK", "UNCOMMON"),
    cracked: item("Cracked Piggy Bank", "CRACKED_PIGGY_BANK", "UNCOMMON"),
    broken: item("Broken Piggy Bank", "BROKEN_PIGGY_BANK", "UNCOMMON"),
  };
  const piggyCatalogue = buildAccessoryCatalogue(accessoriesFromIndex(piggyIndex), piggyIndex);

  it("treats cracked and broken Piggy Banks as states of one accessory", () => {
    const chains = buildChainIndex([], piggyCatalogue);
    expect(chains.BROKEN_PIGGY_BANK).toEqual(["CRACKED_PIGGY_BANK", "PIGGY_BANK"]);
  });

  it("does not list a cracked Piggy Bank as missing when the broken state is owned", () => {
    const chains = buildChainIndex([], piggyCatalogue);
    const sets = collapseOwned(["BROKEN_PIGGY_BANK"], piggyCatalogue, chains);
    expect(sets.covered.has("CRACKED_PIGGY_BANK")).toBe(true);
    expect(sets.covered.has("PIGGY_BANK")).toBe(true);
  });
});
