import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import { __setHeadsForTests } from "../../headHashes";
import { AccessoryTile } from "../AccessoryTile";
import type { AccessoryView } from "../types";

const bloodDonorRing: AccessoryView = {
  id: "BLOOD_DONOR_RING",
  name: "Blood Donor Ring",
  tier: "UNCOMMON",
  family: "BLOOD_DONOR",
  familyRank: 2,
  itemId: "blood_donor_ring",
  craftable: true,
  recipe: [
    { id: "hemoglass", name: "Hemoglass", qty: 96 },
    { id: "blood_donor_talisman", name: "Blood Donor Talisman", qty: 1 },
  ],
  recipeYields: 1,
  unlocks: null,
  requirements: [],
  checked: [],
  stats: null,
  rift: true,
  riftTransferable: true,
  status: "missing",
  source: "craftable",
  acquisition: { category: "collections", detail: "Hemovibe collection, tier 6.", alternatives: [], evidence: "structured" },
  readiness: { kind: "nextUpgrade", label: "Owns Blood Donor Talisman; remaining materials are not measured." },
  blockedBy: null,
  coveredByFamily: false,
  foldedBehind: null,
  foldedHigher: [],
  ownedPrerequisite: { id: "BLOOD_DONOR_TALISMAN", name: "Blood Donor Talisman", tier: "COMMON" },
  group: "rift",
  attainability: "now",
  eventKey: null,
};

describe("AccessoryTile", () => {
  beforeEach(() => __setHeadsForTests({}, Date.now()));

  it("uses the item square as a tooltip toggle instead of a direct outbound link", () => {
    const html = renderToStaticMarkup(<AccessoryTile entry={bloodDonorRing} />);
    expect(html).toContain('<button type="button" aria-label="Blood Donor Ring: toggle item details"');
    expect(html).not.toContain("open the wiki article");
    expect(html).not.toContain("/crafting?q=");
  });
});
