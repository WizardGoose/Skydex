import { describe, expect, it } from "vitest";
import {
  groupMinionFamilies,
  MINION_DETAIL_SHEET_CLASS,
  MINION_FAMILY_ROW_CLASS,
} from "../minionCategoryModel";
import type { MinionFamilyProgress } from "../minions";

const entry = (id: string, type: string): MinionFamilyProgress => ({
  family: { id, name: id, type, collection: null, wikiTitle: `${id} Minion`, tiers: [], recipes: {} },
  currentTier: 1,
  maxTier: 1,
  tiersRemaining: 0,
  completion: "complete",
  remainingTiers: [],
});

describe("Profile Inventory-style Minions category layout", () => {
  it("orders categories like the Sacks board while preserving catalogue order", () => {
    const groups = groupMinionFamilies([
      entry("oak", "Foraging"),
      entry("wheat", "Farming"),
      entry("zombie", "Combat"),
      entry("carrot", "Farming"),
    ]);
    expect(groups.map((group) => group.id)).toEqual(["Farming", "Combat", "Foraging"]);
    expect(groups[0].entries.map((item) => item.family.id)).toEqual(["wheat", "carrot"]);
  });

  it("keeps family rows dense and the selected detail as a separate sheet", () => {
    expect(MINION_FAMILY_ROW_CLASS).toContain("grid-cols");
    expect(MINION_DETAIL_SHEET_CLASS).toContain("overflow-hidden");
    expect(MINION_DETAIL_SHEET_CLASS).not.toContain("grid-cols-[11rem");
  });
});
