import { describe, expect, it } from "vitest";
import { isNpcPage, mutationIngredientsFor, parseInfoboxIngredients } from "../useTargetCatalogue";

/**
 * The Ludleth mechanism: Ludleth is an NPC, not an item; he merely sells
 * the Rose Dragon.
 *
 * A vendor's article carries the same `{{RD|...}}` price rows as the item it
 * sells, so the ingredient gate alone offered a person as a grind target. The
 * fix reads the article's own classification, the infobox template family,
 * rather than a list of names to exclude, and these tests pin exactly that:
 * character-family infoboxes are rejected, item-family ones pass, and a page
 * the wiki does not classify is left for the ingredient gate to judge.
 *
 * Fixtures are minimal synthetic wikitext shaped like the real articles. Wiki
 * content is CC BY-NC-SA and runtime-loaded, so nothing real is bundled here.
 */

const NPC_PAGE = `{{Infobox/Character
|shop = Yes
|location=[[Somewhere]]
}}
'''Testman''' is an [[NPC]] that sells the {{ID|Test Pet}} for {{Coins|1m}}, {{RD|5 Testleaf}}, and {{RD|1 Teststalk}}.`;

const PET_PAGE = `{{Infobox/Pet
|type = [[Farming]] [[Pets|Pet]]
|rarity = L
}}
{{Infobox/Item
|title = Test Egg
|buy= *{{c|1m}}
*{{RD|5 Testleaf}}
*{{RD|1 Teststalk}}
}}
A '''Test Pet''' is bought with {{RD|5 Testleaf}} and {{RD|1 Teststalk}}.`;

const BARE_PAGE = `A page with no infobox at all, listing {{RD|3 Testleaf}}.`;

const CURRENT_PET_PAGE = `{{Infobox/Pet
|type = [[Farming]] [[Pets|Pet]]
}}
{{Infobox/Item
|title = Current Egg
|buy= *{{c|500m}}
*{{Copper|20k}}
*{{Item|Condensed Helianthus|amount=5}}
*{{Item|Glasscorn|amount=1}}
*{{Item|Devourer|amount=1}}
}}
The article later mentions {{Item|Old Boot}}, which is not part of the price.`;

describe("isNpcPage", () => {
  it("rejects a character-infobox article, whatever its price rows say", () => {
    expect(isNpcPage(NPC_PAGE)).toBe(true);
  });

  it("passes an item-family article", () => {
    expect(isNpcPage(PET_PAGE)).toBe(false);
  });

  it("does not treat an unclassified page as a person", () => {
    // Absence of an infobox says "could not classify", not "NPC". The
    // mutation-ingredient gate in the fetch still stands behind this.
    expect(isNpcPage(BARE_PAGE)).toBe(false);
  });

  it("tolerates whitespace and case in the template name", () => {
    expect(isNpcPage("{{ Infobox/character\n|shop=Yes\n}}")).toBe(true);
    expect(isNpcPage("{{Infobox/NPC|x=1}}")).toBe(true);
  });
});

describe("parseInfoboxIngredients", () => {
  it("reads RD rows and merges duplicates by the larger quantity", () => {
    const rows = parseInfoboxIngredients(PET_PAGE);
    expect(rows).toContainEqual({ name: "Testleaf", qty: 5 });
    expect(rows).toContainEqual({ name: "Teststalk", qty: 1 });
    expect(rows).toHaveLength(2);
  });

  it("reads thousands separators as one number", () => {
    expect(parseInfoboxIngredients("{{RD|1,024 Testleaf}}")).toEqual([{ name: "Testleaf", qty: 1024 }]);
  });

  it("reads current Item templates only from the buy field", () => {
    expect(parseInfoboxIngredients(CURRENT_PET_PAGE)).toEqual([
      { name: "Condensed Helianthus", qty: 5 },
      { name: "Glasscorn", qty: 1 },
      { name: "Devourer", qty: 1 },
    ]);
  });
});

describe("mutationIngredientsFor", () => {
  const item = (name: string, yields: number, recipe: { id: string; name: string; qty: number }[] | null) => ({
    name,
    hypixelId: name.toUpperCase().replace(/ /g, "_"),
    tier: null,
    category: null,
    npcSell: null,
    yields,
    recipe,
  });

  it("finds mutations through crafted intermediates and respects their yields", () => {
    const items = {
      glasscorn: item("Glasscorn", 1, null),
      mutation_core: item("Mutation Core", 4, [{ id: "glasscorn", name: "Glasscorn", qty: 8 }]),
      greenhouse_relic: item("Greenhouse Relic", 1, [{ id: "mutation_core", name: "Mutation Core", qty: 5 }]),
    };

    expect(mutationIngredientsFor(items, "greenhouse_relic", new Set(["glasscorn"]))).toEqual([
      { name: "Glasscorn", qty: 16, mutation: "glasscorn", crop: null },
    ]);
  });

  it("does not loop forever when malformed recipes cycle", () => {
    const items = {
      first: item("First", 1, [{ id: "second", name: "Second", qty: 1 }]),
      second: item("Second", 1, [{ id: "first", name: "First", qty: 1 }]),
    };
    expect(mutationIngredientsFor(items, "first", new Set(["glasscorn"]))).toEqual([]);
  });
});
