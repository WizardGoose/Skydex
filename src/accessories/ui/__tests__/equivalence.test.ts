import { describe, expect, it } from "vitest";
import { collapseNonStackingAccessories } from "../equivalence";
import type { AccessoryView } from "../types";

const view = (id: string, name: string, over: Partial<AccessoryView> = {}): AccessoryView => ({
  id,
  name,
  tier: "SPECIAL",
  family: null,
  familyRank: null,
  itemId: null,
  craftable: false,
  recipe: null,
  recipeYields: 1,
  unlocks: null,
  requirements: [],
  checked: [],
  stats: null,
  rift: false,
  riftTransferable: false,
  group: "event",
  attainability: "unknownReach",
  status: "missing",
  source: "event",
  acquisition: { category: "events", detail: null, alternatives: [], evidence: "fallback" },
  readiness: { kind: "unknown", label: "Event availability is unknown." },
  blockedBy: null,
  coveredByFamily: false,
  foldedBehind: null,
  foldedHigher: [],
  ownedPrerequisite: null,
  eventKey: "unknown",
  ...over,
});

describe("collapseNonStackingAccessories", () => {
  it("renders one anniversary Hatcessory with the other variants as alternatives", () => {
    const collapsed = collapseNonStackingAccessories([
      view("PARTY_HAT_CRAB", "Crab Hat of Celebration"),
      view("PARTY_HAT_CRAB_ANIMATED", "Crab Hat of Celebration - 2022 Edition"),
      view("PARTY_HAT_SLOTH", "Sloth Hat of Celebration"),
    ]);

    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].equivalentAlternatives?.map((entry) => entry.id)).toEqual([
      "PARTY_HAT_CRAB_ANIMATED",
      "PARTY_HAT_SLOTH",
    ]);
  });

  it("keeps unrelated accessories separate and prefers the held alternative", () => {
    const collapsed = collapseNonStackingAccessories([
      view("PARTY_HAT_CRAB", "Crab Hat of Celebration"),
      view("PARTY_HAT_SLOTH", "Sloth Hat of Celebration", { status: "owned" }),
      view("POTATO_TALISMAN", "Potato Talisman"),
    ]);

    expect(collapsed.map((entry) => entry.id)).toEqual(["PARTY_HAT_SLOTH", "POTATO_TALISMAN"]);
  });
});
