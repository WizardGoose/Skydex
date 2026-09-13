import type { InventoryRecipeTree } from "../types/types";

/** Hide only this goal's reserved stock, without changing the saved inventory. */
export function inventoryForGoal(inventory: ReadonlyMap<string, number>, gatherInstead: readonly string[] = []) {
  const available = new Map(inventory);
  const reserved = new Map<string, number>();
  for (const key of gatherInstead) {
    if (!available.has(key)) continue;
    reserved.set(key, available.get(key)!);
    available.delete(key);
  }
  return { available, reserved };
}

/** Put reserved stock back for later goals, retaining any newly produced surplus. */
export function restoreGoalInventory(remaining: ReadonlyMap<string, number>, reserved: ReadonlyMap<string, number>) {
  const restored = new Map(remaining);
  for (const [key, quantity] of reserved) restored.set(key, (restored.get(key) ?? 0) + quantity);
  return restored;
}

export function storageInputsForRoute(tree: InventoryRecipeTree | null): string[] {
  const keys = new Set<string>();
  const visit = (node: InventoryRecipeTree) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node.method === "inventory") keys.add(node.shard);
    else if (node.method === "recipe") node.inputs.forEach(visit);
    else if (node.method === "cycle") { visit(node.inputRecipe); node.cycleInputs.forEach(visit); }
  };
  if (tree) visit(tree);
  return [...keys];
}
