import { describe, expect, it } from "vitest";
import { RARITY_UNKNOWN, blockingLine, matchesQuery, openRequirementLines, rarityClass, readinessSummary, roman } from "../display";
import {
  ACTIONABLE_ORDER,
  ACTIONABLE_TILE,
  NEUTRAL_TILE,
  SOURCE_CHIP,
  SOURCE_HINT,
  SOURCE_LABEL,
  SOURCE_ORDER,
} from "../sourceMeta";
import type { AccessoryView } from "../types";

const view = (over: Partial<AccessoryView> & { id: string }): AccessoryView => ({
  name: over.id,
  tier: null,
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
  group: "other",
  attainability: "unknownReach",
  status: "missing",
  source: "wiki",
  acquisition: { category: "needsReview", detail: null, alternatives: [], evidence: "fallback" },
  readiness: { kind: "unknown", label: "Acquisition route still needs review." },
  blockedBy: null,
  coveredByFamily: false,
  foldedBehind: null,
  foldedHigher: [],
  ownedPrerequisite: null,
  eventKey: null,
  ...over,
});

describe("roman", () => {
  it("covers the tiers collections actually reach", () => {
    expect(roman(1)).toBe("I");
    expect(roman(4)).toBe("IV");
    expect(roman(6)).toBe("VI");
    expect(roman(9)).toBe("IX");
    expect(roman(12)).toBe("XII");
  });

  /** Better a plain number than a confident piece of nonsense. */
  it("falls back to the digits for anything it cannot express", () => {
    expect(roman(0)).toBe("0");
    expect(roman(-3)).toBe("-3");
    expect(roman(2.5)).toBe("2.5");
    expect(roman(99999)).toBe("99999");
  });
});

describe("rarityClass", () => {
  it("uses the kit's colours for the tiers the kit defines", () => {
    expect(rarityClass("LEGENDARY")).toBe("text-rarity-legendary");
    expect(rarityClass("common")).toBe("text-rarity-common");
  });

  it("covers the tiers the kit map omits, on the same rarity tokens", () => {
    expect(rarityClass("MYTHIC")).toBe("text-rarity-mythic");
    expect(rarityClass("VERY_SPECIAL")).toBe("text-rarity-very-special");
  });

  it("never invents a rarity", () => {
    expect(rarityClass(null)).toBe(RARITY_UNKNOWN);
    expect(rarityClass("")).toBe(RARITY_UNKNOWN);
    expect(rarityClass("ULTRA")).toBe(RARITY_UNKNOWN);
  });
});

describe("blockingLine", () => {
  it("writes the collection tier the way the game does", () => {
    const entry = view({
      id: "x",
      status: "locked",
      blockedBy: {
        kind: "collection",
        target: "Acacia Log collection",
        threshold: "tier 6",
        how: "Collect 250 Acacia Log.",
        raw: "COLLECTION",
        state: "unmet",
        have: "40",
        gap: 210,
      },
    });
    expect(blockingLine(entry)).toEqual({
      label: "Acacia Log collection tier 6",
      have: "40",
      how: "Collect 250 Acacia Log.",
      state: "unmet",
    });
  });

  it("says nothing when nothing is blocking", () => {
    expect(blockingLine(view({ id: "x" }))).toBeNull();
  });
});

describe("openRequirementLines", () => {
  const req = (state: "met" | "unmet" | "unknown") => ({
    kind: "slayer" as const,
    target: "Revenant Horror Slayer",
    threshold: "7",
    how: "Level Revenant Horror slayer to 7.",
    raw: "SLAYER",
    state,
    have: state === "unknown" ? null : "5",
    gap: state === "unmet" ? 2 : null,
  });

  it("keeps only the requirements nobody could measure", () => {
    /*
     * A met requirement is noise on a tile about what stands in your way, and
     * an unmet one is already shown as the blocking line. The unknown one is
     * the whole point: it is what a visitor with no key still learns.
     */
    const entry = view({ id: "x", checked: [req("met"), req("unknown"), req("unmet")] });
    const lines = openRequirementLines(entry);

    expect(lines).toHaveLength(1);
    expect(lines[0].label).toBe("Revenant Horror Slayer 7");
    expect(lines[0].have).toBeNull();
  });

  it("drops the threshold from the label when there is not one", () => {
    const entry = view({
      id: "x",
      checked: [{ ...req("unknown"), target: "Melody Hair", threshold: "" }],
    });
    // No trailing space, which a naive join would leave behind.
    expect(openRequirementLines(entry)[0].label).toBe("Melody Hair");
  });
});

describe("readinessSummary", () => {
  it("keeps an owned upgrade base without the unmeasured-material disclaimer", () => {
    expect(readinessSummary(view({
      id: "blood-donor-ring",
      readiness: { kind: "nextUpgrade", label: "Owns Blood Donor Talisman; remaining materials are not measured." },
      ownedPrerequisite: { id: "BLOOD_DONOR_TALISMAN", name: "Blood Donor Talisman", tier: "COMMON" },
    }))).toBe("Owns Blood Donor Talisman");
  });

  it("states the missing measurement in three words", () => {
    expect(readinessSummary(view({
      id: "craftable",
      readiness: { kind: "materialsUnknown", label: "Recipe known; complete material holdings are not measured." },
    }))).toBe("Materials not checked");
  });
});

describe("matchesQuery", () => {
  const entry = view({ id: "x", name: "Red Claw Talisman", family: "Wolf" });

  it("is a no-op on an empty needle", () => {
    expect(matchesQuery(entry, "")).toBe(true);
  });

  it("matches name or family", () => {
    expect(matchesQuery(entry, "claw")).toBe(true);
    expect(matchesQuery(entry, "wolf")).toBe(true);
    expect(matchesQuery(entry, "ring")).toBe(false);
  });

  it("survives a null family", () => {
    expect(matchesQuery(view({ id: "x", name: "Zombie Talisman" }), "wolf")).toBe(false);
  });
});

describe("source metadata", () => {
  it("covers every category exactly once, in one order", () => {
    expect(new Set(SOURCE_ORDER).size).toBe(SOURCE_ORDER.length);
    for (const source of SOURCE_ORDER) {
      expect(SOURCE_LABEL[source]).toBeTruthy();
      expect(SOURCE_HINT[source]).toBeTruthy();
      expect(SOURCE_CHIP[source]).toBeTruthy();
    }
    expect(SOURCE_ORDER.length).toBe(Object.keys(SOURCE_LABEL).length);
  });

  /**
   * The colour lock, enforced rather than merely documented. Emerald is the
   * interactive accent and red means destructive, so neither may ever appear on
   * a chip that is only describing where an item comes from. `orange`,
   * `purple`, `violet`, `fuchsia` and `sky` are folded into the emerald ramp in
   * index.css, so they are the accent too. Arcane is surface material and, per
   * its own token block, never text.
   */
  it("keeps the reserved ramps off the chips", () => {
    const reserved = ["emerald", "red", "orange", "purple", "violet", "fuchsia", "sky", "indigo", "arcane"];
    for (const [source, classes] of Object.entries(SOURCE_CHIP)) {
      for (const ramp of reserved) {
        expect(classes, `${source} must not use ${ramp}`).not.toContain(`-${ramp}-`);
      }
    }
  });

  it("gives every chip a colour on all three of border, fill and text", () => {
    for (const classes of Object.values(SOURCE_CHIP)) {
      expect(classes).toMatch(/(^|\s)border-/);
      expect(classes).toMatch(/(^|\s)bg-/);
      expect(classes).toMatch(/(^|\s)text-/);
    }
  });

  /** The unclassified case must never look like a confident category. */
  it("leaves the wiki chip uncoloured", () => {
    expect(SOURCE_CHIP.wiki).toContain("text-slate-300");
    expect(SOURCE_LABEL.wiki).toBe("See wiki");
  });

  /**
   * The actionable borders and the legend chips must share hues, because the
   * legend is still the decoder ring: the craft border is the Craftable
   * chip's green, the shop border the Shop chip's blue, the event border the
   * Event chip's yellow. The chip string carries the hue as `border-<hue>/30`;
   * the border must carry the same hue.
   */
  it("keeps every actionable border on the hue of its matching legend chip", () => {
    const chipFor = { craft: "craftable", shop: "shop", event: "event" } as const;
    for (const path of ACTIONABLE_ORDER) {
      expect(ACTIONABLE_TILE[path]).toBeTruthy();
      const hue = SOURCE_CHIP[chipFor[path]].match(/border-([a-z0-9-]+)\//)?.[1];
      expect(hue, `${chipFor[path]} chip must declare a border hue`).toBeTruthy();
      expect(ACTIONABLE_TILE[path], `${path} border must share the chip's hue`).toContain(
        `border-${hue}/`
      );
    }
  });

  it("keeps the no-path tile neutral, and the reserved ramps off every border", () => {
    // The neutral cell is the whole point of the new rule: no live path, no
    // colour, whatever the source category is.
    expect(NEUTRAL_TILE).toContain("border-slate-800");
    const reserved = ["emerald", "red", "orange", "purple", "violet", "fuchsia", "sky", "indigo", "arcane"];
    for (const [path, classes] of Object.entries(ACTIONABLE_TILE)) {
      for (const ramp of reserved) {
        expect(classes, `${path} must not use ${ramp}`).not.toContain(`-${ramp}-`);
      }
    }
  });
});
