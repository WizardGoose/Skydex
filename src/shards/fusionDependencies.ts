import type { InventoryRecipeTree, Recipe } from "../types/types";
import { CalculationService } from "../services/calculationService";

type Node = Exclude<InventoryRecipeTree, InventoryRecipeTree[]>;
type FusionNode = Extract<Node, { method: "recipe" }>;

export interface FusionDependency {
  shard: string;
  quantity: number;
  stored: number;
  direct: number;
  recipes: { recipe: Recipe; quantity: number; crafts: number; inputs: [InventoryRecipeTree[], InventoryRecipeTree[]] }[];
  cycles: Extract<Node, { method: "cycle" }>[];
}

/** External supplies only: circulated cycle output is not another acquisition. */
export function dependencyInputs(node: FusionDependency): InventoryRecipeTree[] {
  return [...node.recipes.flatMap(batch => batch.inputs.flat()), ...node.cycles.flatMap(cycle => [cycle.inputRecipe, ...cycle.cycleInputs])];
}

export interface FusionFocus { target: string; path: string[]; revision: number }

/** Group one dependency level, retaining the solver's allocation to each branch.
 * Do not infer held quantities from the unallocated inventory or expand loop throughput.
 */
export function fusionDependencies(tree: InventoryRecipeTree | null): FusionDependency[] {
  const groups = new Map<string, FusionDependency>();
  const addRecipe = (group: FusionDependency, node: FusionNode) => {
    let batch = group.recipes.find(batch => CalculationService.getInstance().areRecipesEqual(batch.recipe, node.recipe));
    if (!batch) {
      batch = { recipe: node.recipe, quantity: 0, crafts: 0, inputs: [[], []] };
      group.recipes.push(batch);
    }
    batch.quantity += node.quantity;
    batch.crafts += node.craftsNeeded;
    const firstSlot = node.recipe.inputs[0] === batch.recipe.inputs[0] ? 0 : 1;
    batch.inputs[0].push(node.inputs[firstSlot]);
    batch.inputs[1].push(node.inputs[1 - firstSlot]);
  };
  const visit = (node: InventoryRecipeTree) => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    let group = groups.get(node.shard);
    if (!group) {
      group = { shard: node.shard, quantity: 0, stored: 0, direct: 0, recipes: [], cycles: [] };
      groups.set(node.shard, group);
    }
    group.quantity += node.quantity;
    if (node.method === "inventory") group.stored += node.quantity;
    else if (node.method === "direct") group.direct += node.quantity;
    else if (node.method === "recipe") addRecipe(group, node);
    else group.cycles.push(node);
  };
  if (tree) visit(tree);
  return [...groups.values()];
}
