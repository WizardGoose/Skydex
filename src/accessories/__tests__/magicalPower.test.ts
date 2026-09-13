import { describe, expect, it } from "vitest";
import { activeAccessories, computeMagicalPower, MP_BY_RARITY, NO_MP_INPUTS } from "../magicalPower";
import { buildChainIndex } from "../chains";
import { buildAccessoryCatalogue, accessoriesFromIndex } from "../catalogue";
import type { ItemIndex } from "../../items/useItemData";

/**
 * Magical Power over the ACTIVE accessories: highest held rung per line,
 * duplicates never counted, and every modifier the wiki's Accessory Power
 * article states, each detected from profile data rather than typed in:
 * recombed rarities, the Hegemony double, a consumed Rift Prism, the Abicase
 * contact bonus.
 */

const item = (
  name: string,
  id: string,
  tier: string | null,
  stats: Record<string, unknown> | null = null
) => ({
  name,
  hypixelId: id,
  tier,
  category: "ACCESSORY",
  npcSell: null,
  yields: 1,
  recipe: null,
  stats,
});

const index: ItemIndex = {
  shady: item("Shady Ring", "SHADY_RING", "UNCOMMON"),
  crooked: item("Crooked Artifact", "CROOKED_ARTIFACT", "RARE"),
  seal: item("Seal of the Family", "SEAL_OF_THE_FAMILY", "EPIC"),
  wolf: item("Wolf Paw", "WOLF_PAW", "COMMON"),
  abicase: item("Abicase", "ABICASE", "RARE"),
  hegemony: item("Hegemony Artifact", "HEGEMONY_ARTIFACT", "LEGENDARY"),
  prism: item("Rift Prism", "RIFT_PRISM", "RARE"),
  // A dungeon accessory whose modern effect is Rift Time. It counts like
  // anything else in the bag; the old all-rift-stats skip mispriced exactly
  // this shape and this case pins the fix.
  scarf: item("Scarf's Studies", "SCARF_STUDIES", "RARE", { rift_Time: 10 }),
  mythic: item("Century Cake", "CENTURY_CAKE", "MYTHIC"),
  special: item("Party Hat", "PARTY_HAT", "SPECIAL"),
  bland: item("Blank Rock", "BLANK_ROCK", null),
};

const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
const chains = buildChainIndex([], catalogue, [
  { fromId: "SHADY_RING", toId: "CROOKED_ARTIFACT" },
  { fromId: "CROOKED_ARTIFACT", toId: "SEAL_OF_THE_FAMILY" },
]);

const inputs = (over: Partial<typeof NO_MP_INPUTS> = {}) => ({ ...NO_MP_INPUTS, ...over });

describe("activeAccessories", () => {
  it("keeps only the highest held rung of a line", () => {
    const active = activeAccessories(new Set(["SHADY_RING", "CROOKED_ARTIFACT", "WOLF_PAW"]), chains);
    expect(active).toStrictEqual(new Set(["CROOKED_ARTIFACT", "WOLF_PAW"]));
  });

  it("treats every held accessory as active when no chains are known", () => {
    // The honest fallback: with no line data we cannot collapse, so we do not.
    const active = activeAccessories(new Set(["SHADY_RING", "CROOKED_ARTIFACT"]), {});
    expect(active.size).toBe(2);
  });
});

describe("computeMagicalPower", () => {
  it("sums rarity values over the active set only", () => {
    // Whole line held: only the Seal (epic, 12) counts, plus the Paw (common, 3).
    const figure = computeMagicalPower(
      new Set(["SHADY_RING", "CROOKED_ARTIFACT", "SEAL_OF_THE_FAMILY", "WOLF_PAW"]),
      catalogue,
      chains
    );
    expect(figure.total).toBe(MP_BY_RARITY.EPIC + MP_BY_RARITY.COMMON);
    expect(figure.counted).toBe(2);
    expect(figure.breakdown).toStrictEqual([
      { tier: "COMMON", count: 1, mpEach: 3, subtotal: 3 },
      { tier: "EPIC", count: 1, mpEach: 12, subtotal: 12 },
    ]);
  });

  it("a duplicate can never count twice, because held ids are a set", () => {
    const once = computeMagicalPower(new Set(["WOLF_PAW"]), catalogue, chains);
    expect(once.total).toBe(3);
    expect(once.counted).toBe(1);
  });

  it("counts a bag accessory whose stats are all rift stats", () => {
    // Scarf's Studies is Catacombs loot in an overworld bag; the game pays 8
    // for it and so does this. The old stat-shape skip is the bug this pins.
    const figure = computeMagicalPower(new Set(["SCARF_STUDIES"]), catalogue, chains);
    expect(figure.total).toBe(MP_BY_RARITY.RARE);
    expect(figure.skipped).toBe(0);
  });

  it("counts an unstated rarity as nothing, and says how many it did that to", () => {
    const figure = computeMagicalPower(new Set(["BLANK_ROCK", "WOLF_PAW"]), catalogue, chains);
    expect(figure.total).toBe(3);
    expect(figure.unknownTier).toBe(1);
  });

  it("carries the game's per-rarity table, stated as data", () => {
    expect(MP_BY_RARITY).toStrictEqual({
      COMMON: 3,
      UNCOMMON: 5,
      RARE: 8,
      EPIC: 12,
      LEGENDARY: 16,
      MYTHIC: 22,
      SPECIAL: 3,
      VERY_SPECIAL: 5,
    });
  });
});

describe("recombobulators", () => {
  it("prices a recombed accessory one tier up, and reports the delta", () => {
    // Common 3 becomes uncommon 5; rare 8 becomes epic 12.
    const figure = computeMagicalPower(
      new Set(["WOLF_PAW", "CROOKED_ARTIFACT"]),
      catalogue,
      chains,
      inputs({ recombobulated: new Set(["WOLF_PAW", "CROOKED_ARTIFACT"]) })
    );
    expect(figure.total).toBe(5 + 12);
    expect(figure.recombobulated).toBe(2);
    expect(figure.recombBonus).toBe(2 + 4);
    expect(figure.breakdown).toStrictEqual([
      { tier: "UNCOMMON", count: 1, mpEach: 5, subtotal: 5 },
      { tier: "EPIC", count: 1, mpEach: 12, subtotal: 12 },
    ]);
  });

  it("bumps nothing above mythic", () => {
    const figure = computeMagicalPower(
      new Set(["CENTURY_CAKE"]),
      catalogue,
      chains,
      inputs({ recombobulated: new Set(["CENTURY_CAKE"]) })
    );
    expect(figure.total).toBe(22);
    expect(figure.recombobulated).toBe(0);
    expect(figure.recombBonus).toBe(0);
  });

  it("leaves SPECIAL alone: it is not on the recomb ladder", () => {
    const figure = computeMagicalPower(
      new Set(["PARTY_HAT"]),
      catalogue,
      chains,
      inputs({ recombobulated: new Set(["PARTY_HAT"]) })
    );
    expect(figure.total).toBe(3);
    expect(figure.recombBonus).toBe(0);
  });

  it("a recomb on an id that is not active changes nothing", () => {
    // The Shady Ring is folded under the Seal, recombed or not.
    const figure = computeMagicalPower(
      new Set(["SHADY_RING", "SEAL_OF_THE_FAMILY"]),
      catalogue,
      chains,
      inputs({ recombobulated: new Set(["SHADY_RING"]) })
    );
    expect(figure.total).toBe(MP_BY_RARITY.EPIC);
    expect(figure.recombobulated).toBe(0);
  });
});

describe("the accessories the game prices specially", () => {
  it("doubles the Hegemony Artifact: legendary 16 counts as 32", () => {
    const figure = computeMagicalPower(new Set(["HEGEMONY_ARTIFACT"]), catalogue, chains);
    expect(figure.total).toBe(32);
    expect(figure.hegemonyBonus).toBe(16);
  });

  it("doubles Hegemony AFTER the recomb bump: mythic counts as 44", () => {
    // The wiki's own worked example: "when recombobulated to Mythic, it
    // grants 44 Accessory Power instead of 22".
    const figure = computeMagicalPower(
      new Set(["HEGEMONY_ARTIFACT"]),
      catalogue,
      chains,
      inputs({ recombobulated: new Set(["HEGEMONY_ARTIFACT"]) })
    );
    expect(figure.total).toBe(44);
    expect(figure.hegemonyBonus).toBe(22);
    expect(figure.recombBonus).toBe(6);
  });

  it("adds a consumed Rift Prism's flat 11 with no bag item at all", () => {
    const figure = computeMagicalPower(
      new Set(["WOLF_PAW"]),
      catalogue,
      chains,
      inputs({ consumedPrism: true })
    );
    expect(figure.total).toBe(3 + 11);
    expect(figure.riftPrism).toBe(11);
  });

  it("prices a bag-held Rift Prism at the wiki's 11, not its listed rare 8", () => {
    const figure = computeMagicalPower(new Set(["RIFT_PRISM"]), catalogue, chains);
    expect(figure.total).toBe(11);
    expect(figure.riftPrism).toBe(11);
    expect(figure.breakdown).toStrictEqual([]);
  });

  it("prices the Abicase by rarity plus one MP per two contacts, floored", () => {
    const figure = computeMagicalPower(
      new Set(["ABICASE"]),
      catalogue,
      chains,
      inputs({ abiphoneContacts: 45 })
    );
    expect(figure.total).toBe(8 + 22);
    expect(figure.abicaseBonus).toBe(22);
    expect(figure.counted).toBe(1);
  });

  it("skips the Abicase when the contact count is unknown, and says so", () => {
    // Pricing it at bare rarity would understate a number we know is higher.
    const figure = computeMagicalPower(new Set(["ABICASE", "WOLF_PAW"]), catalogue, chains);
    expect(figure.total).toBe(3);
    expect(figure.skipped).toBe(1);
  });
});

describe("the rarity the bag item itself states", () => {
  it("prices an accessory the resource gives no tier by its own lore line", () => {
    // Runebook, King Talisman and their generation: `tier` is absent from
    // the item resource, and the player's actual item is the only thing
    // that says what it is. Eleven of these sat in one sampled live bag.
    const figure = computeMagicalPower(
      new Set(["BLANK_ROCK"]),
      catalogue,
      chains,
      inputs({ bagTiers: new Map([["BLANK_ROCK", "UNCOMMON"]]) })
    );
    expect(figure.total).toBe(5);
    expect(figure.unknownTier).toBe(0);
  });

  it("prefers the stated rarity outright, recomb already inside it", () => {
    // A recombed item's lore states the RAISED rarity, so the stated value
    // is used as-is and the recomb delta is still reported against base.
    const figure = computeMagicalPower(
      new Set(["WOLF_PAW"]),
      catalogue,
      chains,
      inputs({ bagTiers: new Map([["WOLF_PAW", "UNCOMMON"]]), recombobulated: new Set(["WOLF_PAW"]) })
    );
    expect(figure.total).toBe(5);
    expect(figure.recombobulated).toBe(1);
    expect(figure.recombBonus).toBe(2);
  });

  it("counts a bag id the catalogue lacks, at its stated rarity", () => {
    // BEASTMASTER_CREST_EPIC in a real bag: a variant id the wiki join
    // collapses away. The game pays for it, so this does too.
    const figure = computeMagicalPower(
      new Set(["WOLF_PAW"]),
      catalogue,
      chains,
      inputs({
        uncatalogued: new Set(["BEASTMASTER_CREST_EPIC"]),
        bagTiers: new Map([["BEASTMASTER_CREST_EPIC", "EPIC"]]),
      })
    );
    expect(figure.total).toBe(3 + 12);
    expect(figure.uncatalogued).toBe(1);
    expect(figure.counted).toBe(2);
  });

  it("still refuses to price an uncatalogued id that states nothing", () => {
    const figure = computeMagicalPower(
      new Set(),
      catalogue,
      chains,
      inputs({ uncatalogued: new Set(["MYSTERY_HAT"]) })
    );
    expect(figure.total).toBe(0);
    expect(figure.unknownTier).toBe(1);
  });
});
