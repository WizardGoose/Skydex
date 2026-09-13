import type { InventoryRecipeTree } from "../types/types";

type RouteNode = Exclude<InventoryRecipeTree, InventoryRecipeTree[]>;

export interface FusionSequenceInput {
  shardKey: string;
  quantity: number;
}

export interface FusionSequenceStep {
  id: string;
  kind: "recipe" | "cycle";
  outputShardKey: string;
  outputQuantity: number;
  inputs: FusionSequenceInput[];
  repeats: number;
  depth: number;
}

export interface FusionSequence {
  inputs: FusionSequenceInput[];
  steps: FusionSequenceStep[];
}

const routeNodes = (tree: InventoryRecipeTree): RouteNode[] => (
  Array.isArray(tree) ? tree.flatMap(routeNodes) : [tree]
);

const combineInputs = (inputs: readonly FusionSequenceInput[]): FusionSequenceInput[] => {
  const totals = new Map<string, number>();
  for (const input of inputs) {
    totals.set(input.shardKey, (totals.get(input.shardKey) ?? 0) + input.quantity);
  }
  return [...totals.entries()]
    .map(([shardKey, quantity]) => ({ shardKey, quantity }))
    .sort((left, right) => right.quantity - left.quantity || left.shardKey.localeCompare(right.shardKey));
};

const immediateInputs = (trees: readonly InventoryRecipeTree[]): FusionSequenceInput[] => combineInputs(
  trees.flatMap((tree) => routeNodes(tree).map((node) => ({
    shardKey: node.shard,
    quantity: node.quantity,
  }))),
);

export const buildFusionSequence = (tree: InventoryRecipeTree | null): FusionSequence => {
  if (!tree) return { inputs: [], steps: [] };

  const leaves: FusionSequenceInput[] = [];
  const stages = new Map<string, FusionSequenceStep>();

  const visit = (branch: InventoryRecipeTree): number => {
    if (Array.isArray(branch)) {
      return branch.reduce((depth, child) => Math.max(depth, visit(child)), 0);
    }

    if (branch.method === "direct" || branch.method === "inventory") {
      leaves.push({ shardKey: branch.shard, quantity: branch.quantity });
      return 0;
    }

    const childTrees = branch.method === "recipe"
      ? branch.inputs
      : [branch.inputRecipe, ...branch.cycleInputs];
    const childDepth = childTrees.reduce((depth, child) => Math.max(depth, visit(child)), 0);
    const depth = childDepth + 1;
    const inputs = immediateInputs(childTrees);
    const signature = branch.method === "recipe"
      ? `${branch.shard}:${branch.recipe.inputs.join("+")}:${depth}`
      : `${branch.shard}:cycle:${depth}`;
    const existing = stages.get(signature);

    if (existing) {
      existing.outputQuantity += branch.quantity;
      existing.repeats += branch.craftsNeeded;
      existing.inputs = combineInputs([...existing.inputs, ...inputs]);
    } else {
      stages.set(signature, {
        id: signature,
        kind: branch.method,
        outputShardKey: branch.shard,
        outputQuantity: branch.quantity,
        inputs,
        repeats: branch.craftsNeeded,
        depth,
      });
    }
    return depth;
  };

  visit(tree);
  return {
    inputs: combineInputs(leaves),
    steps: [...stages.values()].sort((left, right) => (
      left.depth - right.depth || left.outputShardKey.localeCompare(right.outputShardKey)
    )),
  };
};
