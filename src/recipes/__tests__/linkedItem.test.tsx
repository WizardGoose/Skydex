import { RecipeCollection } from "../RecipeBook";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { recipeItemHref } from "../itemLink";
import { includeLinkedItem, resolveLinkedItem } from "../linkedItem";
import { includeMinionItems } from "../minionItems";
import { LinkedItemAcquisition } from "../LinkedItemAcquisition";
import { ItemTooltipContent } from "../../ui/ItemTooltip";
import { buildAccessoryCatalogue } from "../../accessories/catalogue";
import { buildRecipeBook } from "../progressionModel";
import type { Item, ItemIndex } from "../../items/useItemData";

const item = (name: string, hypixelId: string): Item => ({ name, hypixelId, tier: "RARE", category: "ACCESSORY", npcSell: null, yields: 1, recipe: null });
const params = (id: string, name: string, quantity?: number) => new URL(recipeItemHref({ id, name, quantity }), "https://skydex.ca").searchParams;

describe("item details to Recipes", () => {
  it("carries exact identity, formatting-safe names and quantity without confusing equal names", () => {
    const items = { rare: item("Beastmaster Crest", "CREST_RARE"), epic: item("Beastmaster Crest", "CREST_EPIC") };
    const link = params("CREST_EPIC", "§5Beastmaster Crest", 12);
    expect(link.get("q")).toBe("Beastmaster Crest");
    expect(link.get("qty")).toBe("12");
    expect(resolveLinkedItem(items, link)).toBe("epic");
    expect(resolveLinkedItem(items, params("CREST_MYTHIC", "Beastmaster Crest"))).toBeNull();
    expect(resolveLinkedItem(items, new URLSearchParams({ q: "Beastmaster Crest" }))).toBeNull();
  });

  it("keeps name links and noncraftable targets usable", () => {
    const items = { artifact: item("Campfire God Badge", "CAMPFIRE_TALISMAN_29") };
    expect(resolveLinkedItem(items, new URLSearchParams({ q: "campfire god badge" }))).toBe("artifact");
    const target = params("UNCATALOGUED_REWARD", "Uncatalogued Reward");
    const included = includeLinkedItem(items, target);
    const id = resolveLinkedItem(included, target)!;
    expect(included[id].recipe).toBeNull();
    const html = renderToStaticMarkup(<LinkedItemAcquisition id={id} item={included[id]} routes={[]} />);
    expect(html).toContain("Uncatalogued Reward");
    expect(html).toContain("No crafting or Forge recipe is listed");
    expect(html).not.toContain("Choose a recipe");
    const shelf = renderToStaticMarkup(<RecipeCollection entries={[]} linkedItem={included[id]} selectedId={id} initialQuery={included[id].name} loading={false} onSelect={() => {}} />);
    expect(shelf).toContain("recipes-shelf-entry is-selected");
    expect(shelf).toContain("Uncatalogued Reward");
    expect(shelf).not.toContain("No recipes match");
  });

  it("adds an explicit action only to pinned real item details", () => {
    const props = { id: "PARTY_HAT_CRAB", name: "Crab Hat of Celebration", lore: ["A party hat."] };
    expect(renderToStaticMarkup(<ItemTooltipContent {...props} />)).not.toContain("View in Recipes");
    const pinned = renderToStaticMarkup(<ItemTooltipContent {...props} surfacePinned />);
    expect(pinned).toContain("View in Recipes");
    expect(pinned).toContain("item=PARTY_HAT_CRAB");
    expect(pinned).toContain("on the wiki");
    expect(renderToStaticMarkup(<ItemTooltipContent {...props} identityColor="#fff" surfacePinned />)).not.toContain("View in Recipes");
  });

  it("opens the exact minion tier with its previous tier and complete crafting inputs", () => {
    const items = includeMinionItems({});
    const id = resolveLinkedItem(items, params("cobblestone_minion_ii", "Cobblestone Minion II"))!;
    expect(items[id].name).toBe("Cobblestone Minion II");
    expect(items[id].recipe).toEqual([
      { id: "cobblestone", name: "Cobblestone", qty: 160 },
      { id: "cobblestone_minion_i", name: "Cobblestone Minion I", qty: 1 },
    ]);
    expect(items.cobblestone_minion_i.recipe).toContainEqual({ id: "wooden_pickaxe", name: "Wooden Pickaxe", qty: 1 });
    expect(items.flower_minion_i.recipe).toBeNull();
    expect(items.cobblestone_minion_xii.recipe).toBeNull();
    const html = renderToStaticMarkup(<LinkedItemAcquisition id="cobblestone_minion_xii" item={items.cobblestone_minion_xii} routes={[]} />);
    expect(html).toContain("NPC exchange · Bulvar");
    expect(html).toContain("2,000,000");
    expect(html).toContain("Cobblestone Minion XI");
  });

  it("filters confirmed and refreshed admin entries without hiding ordinary legacy items", () => {
    const items: ItemIndex = {
      bingo: item("Bingo Heirloom", "BINGO_HEIRLOOM"),
      space: item("Artifact of Space", "ARTIFACT_OF_SPACE"),
      remote: item("Admin Example", "ADMIN_EXAMPLE"),
      legacy: item("Eternal Crystal", "ETERNAL_CRYSTAL"),
    };
    const adminNames = new Set(["adminexample"]);
    const catalogue = buildAccessoryCatalogue(Object.values(items).map(it => ({ id: it.hypixelId!, name: it.name, category: "ACCESSORY", tier: it.tier! })), items, adminNames);
    expect(Object.keys(catalogue.byId)).toEqual(["ETERNAL_CRYSTAL"]);
    expect(resolveLinkedItem(items, params("BINGO_HEIRLOOM", "Bingo Heirloom"), adminNames)).toBeNull();
    expect(includeLinkedItem({}, params("BINGO_HEIRLOOM", "Bingo Heirloom"))).toEqual({});
    const crafting = Object.fromEntries(Object.entries(items).map(([id, it]) => [id, { ...it, recipe: [{ id: "stone", name: "Stone", qty: 1 }] }]));
    const book = buildRecipeBook({ items: crafting, sourceItems: crafting, forgeRecipes: [], collections: null, adminNames,
      owned: { has: false, get: () => undefined, count: () => undefined, auto: () => undefined, entries: () => [], keys: () => [], sources: [] },
      playerProgress: { slayerLevels: null, trophyFish: null, skillLevels: null },
    });
    expect(book.map(entry => entry.id)).toEqual(["legacy"]);
  });
});
