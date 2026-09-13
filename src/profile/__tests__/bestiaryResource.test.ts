import { describe, expect, it } from "vitest";
import {
  parseBestiaryResource,
  parseBestiaryTextureHash,
} from "../bestiaryResource";

const TEXTURE_HASH = "382fc3f71b41769376a9e92fe3adbaac3772b999b219c9d6b4680ba9983e527";
const TEXTURE =
  "eyJ0ZXh0dXJlcyI6eyJTS0lOIjp7InVybCI6Imh0dHA6Ly90ZXh0dXJlcy5taW5lY3JhZnQubmV0L3RleHR1cmUvMzgyZmMzZjcxYjQxNzY5Mzc2YTllOTJmZTNhZGJhYWMzNzcyYjk5OWIyMTljOWQ2YjQ2ODBiYTk5ODNlNTI3In19fQ";

describe("parseBestiaryResource", () => {
  it("keeps exact families, game colours, heads, brackets, and custom caps", () => {
    const parsed = parseBestiaryResource({
      brackets: {
        2: [5, 10, 15, 25, 50],
        4: [2, 4, 6, 10, 15],
      },
      bracketSets: {
        CRITTERS: { 1: [1, 3, 6, 10, 20] },
      },
      hub: {
        name: "Hub",
        icon: { texture: TEXTURE },
        mobs: [{
          name: "§6Golden Zombie",
          texture: `${TEXTURE}", "ignored-signature`,
          cap: 25,
          mobs: ["zombie_1", "zombie_2"],
          bracket: 2,
        }, {
          name: "§aCustom Cap",
          item: "stone",
          cap: 12,
          mobs: ["custom_cap_1"],
          bracket: 2,
        }],
      },
      safari: {
        name: "Safari",
        hasSubcategories: true,
        cavern: {
          name: "Cavern",
          icon: { item: "rabbit_foot" },
          mobs: [{
            name: "§bCave Critter",
            item: "rabbit_spawn_egg",
            cap: 10,
            mobs: ["cave_critter_1"],
            bracketType: "CRITTERS",
            bracket: 1,
          }],
        },
      },
    });

    expect(parsed).toHaveLength(3);
    expect(parsed?.[0]).toMatchObject({
      id: "ZOMBIE_1",
      name: "Golden Zombie",
      category: "Hub",
      mobIds: ["ZOMBIE_1", "ZOMBIE_2"],
      iconSrc: `https://mc-heads.net/head/${TEXTURE_HASH}/64`,
      locationIconSrc: `https://mc-heads.net/head/${TEXTURE_HASH}/64`,
      gameColor: "#ffaa00",
      bracket: 2,
      maxKills: 25,
      tiers: [
        { tier: 1, required: 5 },
        { tier: 2, required: 10 },
        { tier: 3, required: 15 },
        { tier: 4, required: 25 },
      ],
    });
    expect(parsed?.[1]).toMatchObject({
      iconId: "STONE",
      maxKills: 12,
      tiers: [
        { tier: 1, required: 5 },
        { tier: 2, required: 10 },
        { tier: 3, required: 12 },
      ],
    });
    expect(parsed?.[2]).toMatchObject({
      category: "Cavern",
      locationIconId: "RABBIT_FOOT",
      bracket: 1,
      bracketType: "CRITTERS",
      gameColor: "#55ffff",
      tiers: [
        { tier: 1, required: 1 },
        { tier: 2, required: 3 },
        { tier: 3, required: 6 },
        { tier: 4, required: 10 },
      ],
    });
  });

  it("adds only the confirmed Hypixel counter aliases to their real families", () => {
    const family = (name: string, mobs: string[]) => ({
      name,
      cap: 10,
      mobs,
      bracket: 1,
    });
    const parsed = parseBestiaryResource({
      brackets: { 1: [1, 5, 10] },
      deep_caverns: {
        name: "Deep Caverns",
        mobs: [family("Emerald Slime", ["emerald_slime_5", "emerald_slime_10"])],
      },
      end: {
        name: "The End",
        mobs: [family("Zealot", ["zealot_bruiser_100", "zealot_enderman_55"])],
      },
      farming: {
        name: "The Farming Islands",
        mobs: [family("Cow", ["farming_cow_1"])],
      },
    });

    expect(parsed?.find((entry) => entry.name === "Emerald Slime")?.mobIds)
      .toContain("EMERALD_SLIME_15");
    expect(parsed?.find((entry) => entry.name === "Zealot")?.mobIds)
      .toContain("ZEALOT_SPECIAL_ENDERMAN_55");
    expect(parsed?.find((entry) => entry.name === "Cow")?.mobIds)
      .toContain("COW_1");
  });

  it("rejects malformed resources and texture properties without inventing data", () => {
    expect(parseBestiaryResource({ brackets: {}, hub: { mobs: [{}] } })).toBeNull();
    expect(parseBestiaryResource({})).toBeNull();
    expect(parseBestiaryTextureHash("not a texture property")).toBeNull();
  });

  it("normalizes the malformed base64 padding used by current Bestiary heads", () => {
    expect(parseBestiaryTextureHash(`${TEXTURE}===`)).toBe(TEXTURE_HASH);
  });
});
