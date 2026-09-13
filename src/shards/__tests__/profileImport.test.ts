import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  normaliseShardId,
  readAttributesOwned,
  readShardsOwned,
  toProfileData,
  type ShardCatalogueEntry,
} from "../profileImport";

/**
 * Reading shards and fused counts from a Hypixel member payload.
 *
 * These assertions pin down the two wire-format details that are easy to get
 * quietly wrong:
 *
 *   - the wire spells a shard `SPHINX` and our dataset spells it
 *     `SHARD_SPHINX`. A matcher that compares them raw finds nothing and
 *     returns an empty inventory, which looks exactly like "you own nothing".
 *   - an absent `attributes.stacks` must be distinguishable from an empty one,
 *     because one of them is allowed to overwrite the player's own numbers and
 *     the other is not.
 */

const CATALOGUE: ShardCatalogueEntry[] = [
  { key: "C1", name: "Grove", rarity: "common", internal_id: "SHARD_GROVE" },
  { key: "E39", name: "Sphinx", rarity: "epic", internal_id: "SHARD_SPHINX" },
  { key: "R21", name: "Star Sentry", rarity: "rare", internal_id: "SHARD_STAR_SENTRY" },
];

describe("normaliseShardId", () => {
  it("collapses both spellings of a shard id onto one", () => {
    expect(normaliseShardId("SHARD_SPHINX")).toBe("SPHINX");
    expect(normaliseShardId("SPHINX")).toBe("SPHINX");
    expect(normaliseShardId(" shard_sphinx ")).toBe("SPHINX");
  });

  /**
   * The collapse is only safe if it cannot merge two different shards, so this
   * checks the shipped dataset rather than a fixture. If a future shard is ever
   * added whose id collides with another once the prefix is gone, this fails
   * here rather than silently adding two players' counts together.
   */
  it("is collision-free across the whole shipped dataset", () => {
    const data = JSON.parse(readFileSync("public/fusion-data.json", "utf8")) as {
      shards: Record<string, { internal_id: string }>;
    };
    const ids = Object.values(data.shards).map((s) => normaliseShardId(s.internal_id));
    expect(ids.length).toBe(322);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("readShardsOwned", () => {
  it("reads the wire form Hypixel actually sends", () => {
    const member = {
      shards: {
        fused: 139,
        owned: [
          { type: "SPHINX", amount_owned: 7, captured: 1770365615925 },
          { type: "GROVE", amount_owned: 96 },
        ],
      },
    };

    const { shards, unmapped, available } = readShardsOwned(member, CATALOGUE);
    expect(unmapped).toBe(0);
    expect(available).toBe(true);
    expect(shards).toStrictEqual([
      { id: "E39", name: "Sphinx", amount: 7, rarity: "epic" },
      { id: "C1", name: "Grove", amount: 96, rarity: "common" },
    ]);
  });

  it("also accepts the prefixed form, in case Hypixel ever sends it", () => {
    const member = { shards: { owned: [{ type: "SHARD_STAR_SENTRY", amount_owned: 3 }] } };
    expect(readShardsOwned(member, CATALOGUE).shards).toStrictEqual([
      { id: "R21", name: "Star Sentry", amount: 3, rarity: "rare" },
    ]);
  });

  it("counts shards it does not recognise instead of swallowing them", () => {
    const member = { shards: { owned: [{ type: "SOME_NEW_SHARD", amount_owned: 4 }] } };
    const { shards, unmapped } = readShardsOwned(member, CATALOGUE);
    expect(shards).toStrictEqual([]);
    expect(unmapped).toBe(1);
  });

  it("skips a broken row rather than failing the whole read", () => {
    const member = {
      shards: {
        owned: [
          { type: "GROVE", amount_owned: null },
          { type: "", amount_owned: 5 },
          { amount_owned: 5 },
          "not an object",
          { type: "GROVE", amount_owned: -3 },
          { type: "SPHINX", amount_owned: 7 },
        ],
      },
    };
    // Only the one good row survives, and a negative count never becomes an
    // inventory entry - a negative shard would poison every fusion sum after it.
    expect(readShardsOwned(member, CATALOGUE).shards).toStrictEqual([
      { id: "E39", name: "Sphinx", amount: 7, rarity: "epic" },
    ]);
  });

  it("says nothing at all when the section is absent", () => {
    expect(readShardsOwned({}, CATALOGUE)).toStrictEqual({ shards: [], unmapped: 0, available: false });
    expect(readShardsOwned(null, CATALOGUE)).toStrictEqual({ shards: [], unmapped: 0, available: false });
    expect(readShardsOwned({ shards: {} }, CATALOGUE)).toStrictEqual({ shards: [], unmapped: 0, available: false });
    expect(readShardsOwned({ shards: { owned: [] } }, CATALOGUE)).toStrictEqual({ shards: [], unmapped: 0, available: true });
  });
});

describe("readAttributesOwned", () => {
  it("maps an attribute id back to the shard key it belongs to", () => {
    // Real ids and real values, lifted from the recorded dump. `arachno` is
    // U33's attribute and `atomized_mithril` is R21's; 48 is exactly the rare
    // cap, which is what makes these counts rather than tier levels.
    const member = { attributes: { stacks: { arachno: 3, atomized_mithril: 48 } } };
    const read = readAttributesOwned(member);
    expect(read).not.toBeNull();
    expect(read).toStrictEqual([
      { id: "U33", name: "Arthropod Ruler", level: 3 },
      { id: "R21", name: "Atomized Mithril", level: 48 },
    ]);
  });

  /**
   * The distinction the whole honest-degradation path rests on. Null means
   * Hypixel told us nothing; an empty array means it told us the player has
   * fused nothing. Only the second one may be written over the player's data.
   */
  it("returns null when the section is absent and [] when it is empty", () => {
    expect(readAttributesOwned({})).toBeNull();
    expect(readAttributesOwned({ attributes: {} })).toBeNull();
    expect(readAttributesOwned(null)).toBeNull();
    expect(readAttributesOwned({ attributes: { stacks: {} } })).toStrictEqual([]);
  });

  it("drops attribute ids the dataset does not know, and broken values", () => {
    const member = { attributes: { stacks: { not_a_real_attribute: 5, arachno: "nope" } } };
    expect(readAttributesOwned(member)).toStrictEqual([]);
  });
});

describe("toProfileData", () => {
  const entry = {
    profileId: "b829eb0d-1516-4c0f-9312-a9c9152130cb",
    cuteName: "Pomegranate",
    gameMode: "ironman",
    selected: true,
    member: {
      shards: { owned: [{ type: "SPHINX", amount_owned: 7 }] },
      attributes: { stacks: { arachno: 3 } },
    },
  };

  it("carries the profile identity through unchanged", () => {
    const data = toProfileData(entry, CATALOGUE);
    expect(data.profile.profile_id).toBe("b829eb0d-1516-4c0f-9312-a9c9152130cb");
    expect(data.profile.cute_name).toBe("Pomegranate");
    expect(data.profile.game_mode).toBe("ironman");
    expect(data.profile.selected).toBe(true);
    expect(data.shardsRead).toBe(true);
    expect(data.attributesRead).toBe(true);
  });

  /**
   * Not an oversight. The v2 profiles payload carries no save timestamp at all
   * - the only `last_save` in the whole dump belongs to the garden endpoint -
   * so this is the honest value, and the modal renders 0 as "Unknown".
   */
  it("reports last_save as unknown rather than inventing one", () => {
    expect(toProfileData(entry, CATALOGUE).profile.last_save).toBe(0);
  });

  it("flags a member whose fused counts could not be read", () => {
    const blind = { ...entry, member: { shards: { owned: [{ type: "SPHINX", amount_owned: 7 }] } } };
    const data = toProfileData(blind, CATALOGUE);
    expect(data.attributesRead).toBe(false);
    expect(data.attributes).toStrictEqual([]);
    // The shards still came through; only the fused counts are missing.
    expect(data.shards).toHaveLength(1);
  });
});
