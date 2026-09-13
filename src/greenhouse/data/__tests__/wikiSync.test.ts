import { describe, expect, it } from "vitest";
import { applyWikiMutations, parseWikiMutations } from "../wikiSync";

/**
 * The multi-surface regression.
 *
 * The wiki has used both `{{ID|...}}` and `{{Item|...}}` for growth surfaces.
 * The old parser captured exactly one identity template, so everything
 * after the comma was silently dropped and the site said "farmland only" while
 * the wiki said both. The fix captures every template on the line; these tests
 * pin that mechanism, not the one mutation. Lonelily is merely today's only
 * instance (measured against the live page, 2026-08-03).
 */

/** One synthetic table row in the wiki's own markup, from the real page shape. */
const row = (name: string, rarity: string, surface: string) => `
{{Slot|${name}}} | [[${name}]] | {{${rarity}}} | 25 | A description.
{{Plainlist|
* '''Size:''' 1x1
* '''Growth Surface:''' ${surface}
* '''Spreading Conditions:''' {{RD|4x Wild Rose}}
* '''Effects:''' {{Green|Something}}
}} | {{RL|190x Brown Mushroom}}
`;

const page = (rows: string) => `Intro prose.\n{| class="wikitable"\n${rows}\n|}\nTrailing prose.`;

const names = new Map<string, string>();

describe("parseWikiMutations, growth surfaces", () => {
  it("captures every {{ID|...}} on the Growth Surface line, not just the first", () => {
    const parsed = parseWikiMutations(page(row("Lonelily", "Common", "{{ID|Farmland}}, {{ID|Dirt}}")), names);

    expect(parsed.lonelily.ground).toBe("farmland"); // primary stays the first listed
    expect(parsed.lonelily.grounds).toEqual(["farmland", "dirt"]);
  });

  it("a single-surface row keeps one primary and a one-entry list", () => {
    const parsed = parseWikiMutations(page(row("Thornshade", "Uncommon", "{{ID|Farmland}}")), names);

    expect(parsed.thornshade.ground).toBe("farmland");
    expect(parsed.thornshade.grounds).toEqual(["farmland"]);
  });

  it("parses the current {{Item|...}} growth and amount markup", () => {
    const current = row(
      "Ashwreath",
      "Common",
      "{{Item|Soul Sand}}",
    ).replace(
      "{{RD|4x Wild Rose}}",
      "{{Item|Nether Wart|amount=2}} / {{Item|Fire|amount=2}}",
    );
    const parsed = parseWikiMutations(page(current), names);

    expect(parsed.ashwreath.grounds).toEqual(["soul_sand"]);
    expect(parsed.ashwreath.requirements).toEqual([
      { crop: "nether_wart", count: 2 },
      { crop: "fire", count: 2 },
    ]);
  });
});

describe("applyWikiMutations, growth surfaces", () => {
  const bundled = (over: Record<string, unknown> = {}) => ({
    lonelily: {
      name: "Lonelily",
      size: 1,
      ground: "farmland",
      requirements: [],
      rarity: "common",
      growth_stages: 0,
      ...over,
    },
  });

  it("overlays the full surface list onto a bundled record that lacked it", () => {
    const wiki = parseWikiMutations(page(row("Lonelily", "Common", "{{ID|Farmland}}, {{ID|Dirt}}")), names);
    const { merged, changes } = applyWikiMutations(bundled(), wiki);

    expect((merged.lonelily as Record<string, unknown>).grounds).toEqual(["farmland", "dirt"]);
    expect(changes).toContainEqual({
      id: "lonelily",
      name: "Lonelily",
      field: "grounds",
      from: "farmland",
      to: "farmland, dirt",
    });
  });

  it("reports no grounds change when the bundled copy already carries the list", () => {
    // This is the shipped state after the data.json regeneration: the overlay
    // must not announce a difference that is not one, or the WikiStatus badge
    // would cry wolf on every visit.
    const wiki = parseWikiMutations(page(row("Lonelily", "Common", "{{ID|Farmland}}, {{ID|Dirt}}")), names);
    const { changes } = applyWikiMutations(bundled({ grounds: ["farmland", "dirt"] }), wiki);

    expect(changes.filter((c) => c.field === "grounds")).toEqual([]);
  });

  it("survives a wiki record without a grounds list at all", () => {
    // The parser always emits `grounds` now, but a hand-built snapshot (a
    // test fixture, a tool) that states only `ground` must read as that one
    // surface rather than throw. The cache key bump retired the real-world
    // instance of this shape; this pins the tolerant read that backs it up.
    const bare = {
      lonelily: {
        name: "Lonelily",
        size: 1,
        ground: "farmland",
        rarity: "common",
        growth_stages: null,
        requirements: [],
      },
    };
    const { changes } = applyWikiMutations(bundled(), bare as never);

    expect(changes.filter((c) => c.field === "grounds")).toEqual([]);
  });

  it("reports no grounds change for a single-surface mutation without the field", () => {
    // The other 39 mutations ship without `grounds` at all; a bundled record's
    // one `ground` must read as its whole list.
    const wiki = parseWikiMutations(page(row("Lonelily", "Common", "{{ID|Farmland}}")), names);
    const { changes } = applyWikiMutations(bundled(), wiki);

    expect(changes.filter((c) => c.field === "grounds")).toEqual([]);
  });
});
