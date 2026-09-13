import type { Data, InventoryRecipeTree, Recipe } from "../../types/types";
import { CalculationService } from "../../services/calculationService";

type TreeNode = Exclude<InventoryRecipeTree, InventoryRecipeTree[]>;
type RecipeNode = Extract<TreeNode, { method: "recipe" }>;
type CycleNode = Extract<TreeNode, { method: "cycle" }>;
const flatten = (tree: InventoryRecipeTree): TreeNode[] => Array.isArray(tree) ? tree.flatMap(flatten) : [tree];
const terminal = (node: RecipeNode) => node.inputs.flatMap(flatten).every(input => input.method === "direct" || input.method === "inventory");

export interface FusionEquation {
  id: string;
  output: string;
  recipe: Recipe;
  inputs: [number, number];
  yield: number;
  repeats: number;
  needed: number;
  producers: [string[], string[]];
  cycle?: boolean;
}

/** Recipe totals keep loop throughput separate from the recipes that seed it. */
export function groupFusionEquations(rows: FusionEquation[]) {
  const groups = new Map<string, FusionEquation[]>();
  rows.forEach(row => {
    const group = groups.get(row.output) ?? [];
    const same = group.find(candidate => Boolean(candidate.cycle) === Boolean(row.cycle) && candidate.yield === row.yield
      && candidate.recipe.outputQuantity === row.recipe.outputQuantity && candidate.recipe.isReptile === row.recipe.isReptile
      && candidate.recipe.inputs.every((id, slot) => id === row.recipe.inputs[slot] && candidate.inputs[slot] === row.inputs[slot]));
    if (same) { same.repeats += row.repeats; same.needed += row.needed; }
    else group.push({ ...row });
    groups.set(row.output, group);
  });
  return groups;
}

/** Removing a split batch keeps the output target and reallocates to its other recipe. */
export function remainingRecipeFor(rows: FusionEquation[], removed: FusionEquation): Recipe | undefined {
  return rows.find(row => row.output === removed.output
    && !CalculationService.getInstance().areRecipesEqual(row.recipe, removed.recipe))?.recipe;
}

/** Retain recipe units, rather than dividing a rounded batch's demand by its repeats. */
export function equationsFor(tree: InventoryRecipeTree | null, data: Data, crocodileMultiplier = 1, includeCycles = false) {
  const rows: FusionEquation[] = [];
  let hasCycle = false;
  let incompleteCycle = false;
  const visit = (nodes: TreeNode[]): { id: string; output: string }[] => {
    const groups: (RecipeNode[] | CycleNode)[] = [];
    const results: { id: string; output: string }[] = [];
    for (const node of nodes) {
      if (node.method === "cycle") {
        hasCycle = true;
        if (includeCycles) groups.push(node);
        continue;
      }
      if (node.method !== "recipe") continue;
      const group = terminal(node) ? groups.find((group): group is RecipeNode[] => Array.isArray(group) && terminal(group[0]) && group[0].shard === node.shard
        && CalculationService.getInstance().areRecipesEqual(group[0].recipe, node.recipe)) : undefined;
      if (group) group.push(node); else groups.push([node]);
    }
    for (const group of groups) {
      if (!Array.isArray(group)) {
        const children = visit([group.inputRecipe, ...group.cycleInputs].flatMap(flatten));
        if (!group.steps.length) { incompleteCycle = true; continue; }
        // The solver records total crafts across the loop, shared equally by its steps.
        // These are throughput quantities, not additional gathering requirements.
        const repeats = group.craftsNeeded / group.steps.length;
        const first = rows.length;
        for (const step of group.steps) {
          const yieldQuantity = CalculationService.getInstance().getEffectiveOutputQuantity(step.recipe, group.multiplier);
          rows.push({
            id: `equation-${rows.length}`, output: step.outputShard, recipe: step.recipe,
            inputs: step.recipe.inputs.map(id => data.shards[id].fuse_amount) as [number, number],
            yield: yieldQuantity, repeats, needed: yieldQuantity * repeats, cycle: true,
            producers: step.recipe.inputs.map(input => children.filter(child => child.output === input).map(child => child.id)) as [string[], string[]],
          });
        }
        const output = rows.slice(first).find(row => row.output === group.shard);
        if (output) results.push({ id: output.id, output: output.output });
        else incompleteCycle = true;
        continue;
      }
      const children = visit(group.flatMap(node => node.inputs.flatMap(flatten)));
      const node = group[0];
      const id = `equation-${rows.length}`;
      rows.push({
        id, output: node.shard, recipe: node.recipe,
        inputs: node.recipe.inputs.map(id => data.shards[id].fuse_amount) as [number, number],
        yield: CalculationService.getInstance().getEffectiveOutputQuantity(node.recipe, crocodileMultiplier),
        repeats: group.reduce((sum, item) => sum + item.craftsNeeded, 0),
        needed: group.reduce((sum, item) => sum + item.quantity, 0),
        producers: node.recipe.inputs.map(input => children.filter(child => child.output === input).map(child => child.id)) as [string[], string[]],
      });
      results.push({ id, output: node.shard });
    }
    return results;
  };
  const roots = tree ? visit(flatten(tree)).map(row => row.id) : [];
  return { rows, hasCycle, incompleteCycle, roots };
}

/** A replacement preserves the other ingredient and still produces the same shard. */
export function replacementsFor(row: FusionEquation, slot: 0 | 1, data: Data) {
  const partner = row.recipe.inputs[1 - slot];
  const seen = new Set<string>();
  return (data.recipes[row.output] ?? []).flatMap(recipe => {
    const partnerIndex = recipe.inputs.indexOf(partner);
    if (partnerIndex < 0 || recipe.inputs.includes(row.output)) return [];
    const itemId = recipe.inputs[1 - partnerIndex];
    const key = `${itemId}:${recipe.outputQuantity}:${recipe.isReptile}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ itemId, recipe }];
  });
}
