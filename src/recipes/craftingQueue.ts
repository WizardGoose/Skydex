import { normaliseItemQuantity } from "../utilities/itemQuantity";
import type { RecipeMethodKind } from "./progressionModel";

export interface CraftingListGoal {
  id: string;
  quantity: number;
  method: RecipeMethodKind;
}

export const CRAFTING_LIST_KEY = "skydex:recipes:crafting-list:v1";
export const craftingGoalKey = (goal: Pick<CraftingListGoal, "id" | "method">): string => `${goal.id}:${goal.method}`;

export function addCraftingGoal(goals: readonly CraftingListGoal[], goal: CraftingListGoal): CraftingListGoal[] {
  const key = craftingGoalKey(goal);
  const existing = goals.find((entry) => craftingGoalKey(entry) === key);
  return existing
    ? goals.map((entry) => craftingGoalKey(entry) === key
      ? { ...entry, quantity: normaliseItemQuantity(entry.quantity + goal.quantity) } : entry)
    : [...goals, { ...goal, quantity: normaliseItemQuantity(goal.quantity) }];
}

export function readCraftingList(): CraftingListGoal[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CRAFTING_LIST_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.reduce<CraftingListGoal[]>((goals, entry: unknown) => {
      if (!entry || typeof entry !== "object") return goals;
      const value = entry as Partial<CraftingListGoal>;
      if (typeof value.id !== "string" || !/^[a-z0-9_-]+$/i.test(value.id)
        || (value.method !== "craft" && value.method !== "forge")) return goals;
      return addCraftingGoal(goals, { id: value.id, method: value.method, quantity: normaliseItemQuantity(value.quantity) });
    }, []);
  } catch {
    return [];
  }
}
