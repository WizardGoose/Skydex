import { describe, expect, it } from "vitest";
import { armorItems, buildWardrobeRows, gearItems, petTiles, rawToGearItem, recombTier, stackTextureHash, tierFromGearLore } from "../gear";
import type { PetData, RawItem } from "../types";

/**
 * The profile-viewer mapping: decoded containers to drawable slots.
 *
 * These are the honesty seams of the Island page's gear sections. What matters
 * is not the happy path but the refusals: an entry with nothing to say must
 * come out as nothing rather than as a tile making a claim.
 */

const item = (id: string, name?: string, count?: number): RawItem => ({
  Count: count,
  tag: {
    ExtraAttributes: { id },
    display: name !== undefined ? { Name: name } : undefined,
  },
});

describe("rawToGearItem", () => {
  it("strips the game's colour codes off the display name", () => {
    const mapped = rawToGearItem(item("HYPERION", "§6Heroic Hyperion §6✪✪✪✪✪"));
    expect(mapped).not.toBeNull();
    expect(mapped!.name).toBe("Heroic Hyperion ✪✪✪✪✪");
    expect(mapped!.name).not.toContain("§");
  });

  it("falls back to the id in title case when there is no display name", () => {
    expect(rawToGearItem(item("ENCHANTED_BROWN_MUSHROOM"))!.name).toBe("Enchanted Brown Mushroom");
  });

  it("refuses an entry with neither id nor name, rather than drawing a mystery tile", () => {
    expect(rawToGearItem({} as RawItem)).toBeNull();
    expect(rawToGearItem({ Count: 3, tag: {} } as RawItem)).toBeNull();
  });

  it("treats a missing or broken count as one, never zero", () => {
    expect(rawToGearItem(item("DIAMOND"))!.count).toBe(1);
    expect(rawToGearItem(item("DIAMOND", undefined, Number.NaN))!.count).toBe(1);
    expect(rawToGearItem(item("DIAMOND", undefined, 42))!.count).toBe(42);
  });

  it("carries enchantments through for the shared tooltip, numbers only", () => {
    const raw = item("ASPECT_OF_THE_END");
    raw.tag!.ExtraAttributes!.enchantments = { sharpness: 5, telekinesis: "bogus" };
    const mapped = rawToGearItem(raw)!;
    expect(mapped.extra?.ench).toEqual({ sharpness: 5 });
  });

  it("reads the recomb flag off rarity_upgrades, as the bag reader does", () => {
    const raw = item("HYPERION");
    raw.tag!.ExtraAttributes!.rarity_upgrades = 1;
    expect(rawToGearItem(raw)!.extra?.recomb).toBe(true);
    expect(rawToGearItem(item("HYPERION"))!.extra?.recomb).toBeUndefined();
  });

  it("keeps the exact custom-head texture carried by the stack", () => {
    const hash = "a074a7bd976fe6aba1624161793be547d54c835cf422243a851ba09d1e650553";
    const value = btoa(JSON.stringify({ textures: { SKIN: { url: `https://textures.minecraft.net/texture/${hash}` } } }));
    const raw = item("BLOSSOM_NECKLACE");
    raw.tag!.SkullOwner = { Properties: { textures: [{ Value: value }] } };

    expect(stackTextureHash(raw)).toBe(hash);
    expect(rawToGearItem(raw)?.extra?.skin).toBe(hash);
  });

});

describe("recombTier", () => {
  it("bumps one rung up the ladder, common through divine", () => {
    expect(recombTier("COMMON", true)).toBe("uncommon");
    expect(recombTier("legendary", true)).toBe("mythic");
    expect(recombTier("MYTHIC", true)).toBe("divine");
  });

  it("stops at divine", () => {
    expect(recombTier("DIVINE", true)).toBe("divine");
  });

  it("never bumps the tiers outside the ladder", () => {
    expect(recombTier("SPECIAL", true)).toBe("special");
    expect(recombTier("VERY_SPECIAL", true)).toBe("very special");
  });

  it("passes an unrecombed or unknown tier through untouched", () => {
    expect(recombTier("EPIC", false)).toBe("epic");
    expect(recombTier(null, true)).toBeNull();
  });
});

describe("tierFromGearLore", () => {
  it("uses the item's displayed rarity regardless of its gear category", () => {
    expect(tierFromGearLore([
      "§7Rarity upgrades with Rift milestones.",
      "",
      "§d§lMYTHIC NECKLACE",
    ])).toBe("MYTHIC");
    expect(tierFromGearLore(["§6§lLEGENDARY BOOTS"])).toBe("LEGENDARY");
  });

  it("keeps scanning past footer lines that follow the rarity", () => {
    expect(tierFromGearLore([
      "§5§lEPIC DRILL",
      "",
      "§8* Co-op Soulbound *",
    ])).toBe("EPIC");
  });

  it("does not infer a rarity from descriptive prose", () => {
    expect(tierFromGearLore(["§7A rare drop from an enemy."])).toBeNull();
    expect(tierFromGearLore(null)).toBeNull();
  });
});

describe("gearItems and armorItems", () => {
  it("drops entries that cannot be drawn and keeps blob order", () => {
    const list = [item("BOOTS"), {}, item("HELMET")];
    expect(gearItems(list).map((i) => i.id)).toEqual(["BOOTS", "HELMET"]);
  });

  it("reverses armor so it reads helmet first, the way SkyCrypt draws it", () => {
    const blobOrder = [item("SORROW_BOOTS"), item("SORROW_LEGGINGS"), item("SORROW_CHESTPLATE"), item("SORROW_HELMET")];
    expect(armorItems(blobOrder).map((i) => i.id)).toEqual([
      "SORROW_HELMET",
      "SORROW_CHESTPLATE",
      "SORROW_LEGGINGS",
      "SORROW_BOOTS",
    ]);
  });

  it("returns nothing for an absent section rather than throwing", () => {
    expect(gearItems(undefined)).toEqual([]);
    expect(armorItems(undefined)).toEqual([]);
  });
});

describe("wardrobe grouping", () => {
  const piece = (id: string) => ({ id, name: id, count: 1 });

  it("keeps nine-set structural rows for 27 exposed sets", () => {
    const sets = Array.from({ length: 27 }, (_, index) => ({
      id: index + 1,
      pieces: [piece("SET_" + (index + 1)), null, null, null],
    }));
    const rows = buildWardrobeRows(sets);
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.slots.length)).toEqual([9, 9, 9]);
    expect(rows[1].slots[0].id).toBe(10);
  });

  it("distinguishes occupied, unlocked-empty, locked, and private slots", () => {
    const rows = buildWardrobeRows([
      { id: 1, pieces: [piece("HELMET"), null, null, null] },
      { id: 2, pieces: [null, null, null, null] },
      { id: 4, pieces: [piece("BOOTS"), null, null, null] },
    ], { capacity: 4 });
    expect(rows[0].slots.map((slot) => slot.state)).toEqual([
      "occupied",
      "unlocked-empty",
      "locked",
      "occupied",
    ]);
    expect(rows[0].slots[1].pieces).toEqual([null, null, null, null]);
    expect(buildWardrobeRows([], { available: false })[0].slots[0].state).toBe("private");
  });
});

describe("petTiles", () => {
  const pet = (type: string, tier: string, exp: number, active = false): PetData => ({ type, tier, exp, active });

  it("puts the summoned pet first, then sorts by level", () => {
    const tiles = petTiles([pet("BAT", "EPIC", 0), pet("ENDER_DRAGON", "LEGENDARY", 30_000_000), pet("ROCK", "COMMON", 100, true)]);
    expect(tiles[0].name).toBe("Rock");
    expect(tiles[0].active).toBe(true);
    expect(tiles[1].name).toBe("Ender Dragon");
  });

  it("computes a real level from experience rather than guessing", () => {
    const [tile] = petTiles([pet("BAT", "EPIC", 0)]);
    expect(tile.level).toBe(1);
  });

  it("skips entries that are not pets", () => {
    expect(petTiles([{ nonsense: true } as unknown as PetData])).toEqual([]);
  });

  it("lowercases the tier for the kit's rarity map", () => {
    expect(petTiles([pet("BAT", "EPIC", 0)])[0].tier).toBe("epic");
  });

  it("carries the PET_<TYPE> id the texture pack lookup keys by", () => {
    // The wiki icon resolves under "<Kind> Pet"; catharsis packs state pet
    // textures under PET_<TYPE>. Both spellings ride the tile, each for its
    // own consumer.
    const [tile] = petTiles([pet("ENDER_DRAGON", "LEGENDARY", 0)]);
    expect(tile.iconName).toBe("Ender Dragon Pet");
    expect(tile.packId).toBe("PET_ENDER_DRAGON");
  });
});
