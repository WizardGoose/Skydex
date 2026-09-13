import type { OwnedIndex } from "../inventory";
import type { MuseumCollectionUnit } from "../profile/riftMuseumDungeons";
import type { RecipeBookEntry } from "./progressionModel";
import type { CraftingListGoal } from "./craftingQueue";
import { holdingLocations } from "./holdings";

export function museumRecipeRows(units: readonly MuseumCollectionUnit[], recipes: readonly RecipeBookEntry[], owned: OwnedIndex) {
  const byHypixelId = new Map(recipes.filter(recipe => recipe.item.hypixelId)
    .map(recipe => [recipe.item.hypixelId!.toUpperCase(), recipe]));
  const holdings = new Map(owned.entries().filter(entry => entry.hypixelId)
    .map(entry => [entry.hypixelId!.toUpperCase(), entry]));
  return units.map(unit => {
    const pieces = unit.items.map(item => {
      // Aliases are accepted Museum variants, not additional required pieces.
      const held = item.aliases.map(id => holdings.get(id.toUpperCase())).find(entry => entry && entry.total > 0);
      return { item, held: Boolean(held), location: holdingLocations(held), recipe: byHypixelId.get(item.id.toUpperCase()) };
    });
    return { unit, pieces, heldPieces: pieces.filter(piece => piece.held).length,
      goals: unit.state !== "missing" ? [] : pieces.flatMap<CraftingListGoal>(piece => piece.held || !piece.recipe ? []
        : [{ id: piece.recipe.id, quantity: 1, method: piece.recipe.preferredMethod.kind }]) };
  });
}

/** Reopening a missing set must not silently queue duplicate copies. */
export function includeMuseumGoals(current: readonly CraftingListGoal[], additions: readonly CraftingListGoal[]): CraftingListGoal[] {
  return additions.reduce<CraftingListGoal[]>((goals, goal) => goals.some(existing => existing.id === goal.id)
    ? goals : [...goals, goal], [...current]);
}
