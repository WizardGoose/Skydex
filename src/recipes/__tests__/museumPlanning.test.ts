import { describe, expect, it } from "vitest";
import { buildOwned } from "../../inventory/aggregate";
import { allocateCraftingQueue } from "../../items/craftingAllocation";
import type { Item } from "../../items/useItemData";
import type { MuseumCollectionUnit } from "../../profile/riftMuseumDungeons";
import { buildRecipeBook } from "../progressionModel";
import { includeMuseumGoals, museumRecipeRows } from "../museumPlanning";
import { holdingLocations } from "../holdings";

const raw = (id: string) => ({ Count: 1, tag: { ExtraAttributes: { id } } });
const item = (name: string, hypixelId: string, recipe: Item["recipe"] = null): Item => ({
  name, hypixelId, recipe, tier: "RARE", category: null, npcSell: null, yields: 1,
});
const items = {
  accessory: item("Accessory", "ACCESSORY"),
  helmet: item("Helmet", "HELMET"),
  boots: item("Boots", "BOOTS", [{ id: "accessory", name: "Accessory", qty: 1 }, { id: "helmet", name: "Helmet", qty: 1 }]),
};
const owned = buildOwned({ items, profile: {
  parsed: { accessories: [raw("ACCESSORY")], museum: [raw("HELMET")] },
  inventoryShared: true, vaultShared: true, museumShared: true, fetchedAt: 100,
} });
const recipes = buildRecipeBook({ items, sourceItems: items, forgeRecipes: [], collections: null,
  owned, playerProgress: { slayerLevels: null, trophyFish: null, skillLevels: null }, tradingAllowed: false });
const unit: MuseumCollectionUnit = { key: "SET", label: "Set", kind: "set", museumCategory: "ARMOR_SETS", state: "missing", donatedAt: null,
  items: ["helmet", "boots"].map(key => ({ id: items[key as "helmet" | "boots"].hypixelId!, name: key, aliases: [key.toUpperCase()], category: null, tier: "RARE", donation: null })) };

describe("Museum recipe planning", () => {
  it("consumes accessory bag and museum prerequisites without crafting them again", () => {
    const plan = allocateCraftingQueue([{ id: "boots", quantity: 1 }], items, owned, { useRootInventory: false });
    expect(plan.roots[0].children.map(child => [child.id, child.allocated, child.remaining])).toEqual([["accessory", 1, 0], ["helmet", 1, 0]]);
    expect(holdingLocations(owned.get("accessory"))).toBe("accessory bag 1");
    expect(holdingLocations(owned.get("helmet"))).toBe("museum 1");
  });
  it("plans only the missing pieces of an exact donation set", () => {
    const [row] = museumRecipeRows([unit], recipes, owned);
    expect(row.heldPieces).toBe(1);
    expect(row.goals).toEqual([{ id: "boots", quantity: 1, method: "craft" }]);
    expect(includeMuseumGoals(row.goals, row.goals)).toEqual(row.goals);
  });
  it("preserves donation credit when a set is withdrawn or satisfied by a higher tier", () => {
    for (const state of ["donated", "borrowed"] as const) {
      expect(museumRecipeRows([{ ...unit, state, acceptedBy: "Higher set" }], recipes, owned)[0].goals).toEqual([]);
    }
  });
  it("accepts an explicitly mapped Museum variant without substituting its recipe", () => {
    const mapped = { ...unit, items: [{ ...unit.items[1], aliases: ["BOOTS", "HELMET"] }] };
    const [row] = museumRecipeRows([mapped], recipes, owned);
    expect(row.heldPieces).toBe(1);
    expect(row.goals).toEqual([]);
  });
  it("keeps absent profile holdings unknown", () => {
    const unavailable = buildOwned({ items });
    expect(unavailable.has).toBe(false);
    expect(holdingLocations(unavailable.get("helmet"))).toBe("");
    expect(museumRecipeRows([], recipes, unavailable)).toEqual([]);
  });
});
