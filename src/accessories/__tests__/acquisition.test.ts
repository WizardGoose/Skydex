import { describe, expect, it } from "vitest";
import type { CollectionUnlock } from "../../items/useItemData";
import { acquisitionOf, readinessOf } from "../acquisition";
import type { CheckedRequirement } from "../requirements";

interface EntryOverrides {
  craftable?: boolean;
  familyRank?: number | null;
  unlocks?: CollectionUnlock[] | null;
}

const classify = (id: string, overrides: EntryOverrides = {}) => acquisitionOf({
  entry: {
    id,
    craftable: false,
    familyRank: null,
    unlocks: null,
    ...overrides,
  },
  source: "wiki",
  learnedSource: "wiki",
  checked: [],
  group: "other",
  locations: [],
});

describe("accessory acquisition routes", () => {
  it("puts the named Ironman examples in their real source groups", () => {
    expect(classify("ACCRETION_TALISMAN")).toMatchObject({
      category: "collections",
      detail: "Ruby Veilshroom III recipe.",
    });
    expect(classify("ANGUISH_ARTIFACT")).toMatchObject({
      category: "upgradePaths",
      detail: "Upgrade from Anguish Ring.",
    });
    expect(classify("ARTIFACT_OF_CONTROL")).toMatchObject({
      category: "shensAuction",
      alternatives: ["Raffle of the Century reward"],
    });
    expect(classify("DRACONIC_TALISMAN")).toMatchObject({
      category: "dragons",
    });
  });

  it("keeps researched activity, event, and legacy routes out of review", () => {
    expect(classify("AUTO_RECOMBOBULATOR")).toMatchObject({ category: "dungeons" });
    expect(classify("BURNING_KUUDRA_CORE")).toMatchObject({ category: "kuudra" });
    expect(classify("DWARVEN_METAL")).toMatchObject({ category: "mining" });
    expect(classify("VOTER_BADGE_ELITE")).toMatchObject({ category: "garden" });
    expect(classify("BEASTMASTER_CREST_LEGENDARY")).toMatchObject({ category: "events" });
    expect(classify("CAMPFIRE_TALISMAN_30")).toMatchObject({ category: "quests" });
    expect(classify("SOUL_CAMPFIRE_TALISMAN_25")).toMatchObject({ category: "quests" });
    expect(classify("MASTER_SKULL_TIER_1")).toMatchObject({ category: "dungeons" });
    expect(classify("PARTY_HAT_CRAB_RED_ANIMATED")).toMatchObject({ category: "legacy" });
    expect(classify("ETERNAL_CRYSTAL")).toMatchObject({ category: "legacy" });
    expect(classify("COMPASS_TALISMAN")).toMatchObject({ category: "legacy" });
    expect(classify("LUCK_TALISMAN")).toMatchObject({ category: "legacy" });
    expect(classify("BINGO_HEIRLOOM")).toMatchObject({
      category: "legacy",
      detail: "Admin-only Museum item; it has no normal player acquisition route.",
    });
    expect(classify("CRACKED_PIGGY_BANK")).toMatchObject({ category: "collections" });
    expect(classify("JERRY_TALISMAN_PURPLE")).toMatchObject({ category: "events" });
  });

  it("keeps Rift-transferable accessories in their real acquisition route", () => {
    expect(classify("FUTURE_CALORIES")).toMatchObject({ category: "generalCrafting" });
    expect(classify("RIFT_PRISM")).toMatchObject({
      category: "shensAuction",
      alternatives: ["Raffle of the Century major reward"],
    });
  });

  it("prefers a structured collection unlock over the generic craft label", () => {
    const route = classify("COLLECTION_EXAMPLE", {
      craftable: true,
      unlocks: [{ collection: "Ruby Veilshroom", tier: 3, required: 1000, type: "Recipe" }],
    });

    expect(route).toMatchObject({
      category: "collections",
      detail: "Ruby Veilshroom collection, tier 3.",
      evidence: "structured",
    });
  });

  it("keeps unsupported routes in review instead of inventing availability", () => {
    expect(classify("UNCLASSIFIED_ACCESSORY")).toMatchObject({
      category: "needsReview",
      detail: null,
      evidence: "fallback",
    });
  });
});

describe("accessory readiness", () => {
  it("describes an owned lower rung without claiming the upgrade materials are ready", () => {
    const readiness = readinessOf({
      ownedKnown: true,
      status: "missing",
      blockedBy: null,
      acquisition: classify("ANGUISH_ARTIFACT"),
      craftable: true,
      ownedPrerequisite: { name: "Anguish Ring" },
    });

    expect(readiness).toEqual({
      kind: "nextUpgrade",
      label: "Owns Anguish Ring; remaining materials are not measured.",
    });
  });

  it("reports a measured collection lock separately from the acquisition route", () => {
    const blockedBy: CheckedRequirement = {
      kind: "collection",
      target: "Ruby Veilshroom collection",
      threshold: "tier 3",
      how: "Collect 1,000 Ruby Veilshroom.",
      raw: "COLLECTION",
      state: "unmet",
      have: "250",
      gap: 750,
    };

    expect(readinessOf({
      ownedKnown: true,
      status: "locked",
      blockedBy,
      acquisition: classify("ACCRETION_TALISMAN"),
      craftable: true,
      ownedPrerequisite: null,
    })).toEqual({
      kind: "collectionLocked",
      label: "Missing Ruby Veilshroom collection tier 3.",
    });
  });

  it("does not equate a known recipe with having its materials", () => {
    const acquisition = classify("CRAFTED_EXAMPLE", { craftable: true });
    expect(readinessOf({
      ownedKnown: true,
      status: "missing",
      blockedBy: null,
      acquisition,
      craftable: true,
      ownedPrerequisite: null,
    })).toEqual({
      kind: "materialsUnknown",
      label: "Recipe known; complete material holdings are not measured.",
    });
  });
});
