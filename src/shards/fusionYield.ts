import type { Recipe } from "../types/types";

/** Physical recipe output is distinct from the solver's long-run expected yield. */
export function fusionYield(recipe: Recipe, repeats: number, crocodileMultiplier: number) {
  const doubleChance = recipe.isReptile ? Math.max(0, Math.min(1, crocodileMultiplier - 1)) : 0;
  return {
    perFusion: recipe.outputQuantity,
    baseTotal: recipe.outputQuantity * repeats,
    expectedTotal: recipe.outputQuantity * repeats * (1 + doubleChance),
    doubled: recipe.outputQuantity * 2,
    doubleChance,
  };
}
