import { buildFusionBranches, type FusionBranch } from "../fusionBranches";
import type { InventoryRecipeTree } from "../../types/types";
import { compactBranches } from "./layout";

// Presentation-only input/output tree. The views do not need shard-specific rules.
export interface BreakdownNode {
  id: string;
  itemId: string;
  quantity: number;
  kind: "input" | "recipe" | "cycle" | "total";
  step?: number;
  repeats?: number;
  children: BreakdownNode[];
}

export function breakdownFor(tree: InventoryRecipeTree | null, targetId: string, quantity: number): BreakdownNode {
  const root = compactBranches(buildFusionBranches(tree));
  const childrenFor = (branch: FusionBranch): BreakdownNode[] => branch.children.flatMap<BreakdownNode>(child => child.kind === "inputs"
    ? child.items.map((item, index) => ({ id: `${child.id}:${index}`, itemId: item.shardKey, quantity: item.quantity, kind: "input" as const, children: [] }))
    : [{ id: child.id, itemId: child.shardKey!, quantity: child.quantity ?? 0, kind: child.kind as "recipe" | "cycle", step: child.step, repeats: child.repeats, children: childrenFor(child) }]);
  const children = childrenFor(root);
  return children.length === 1 && children[0].kind !== "input" ? children[0]
    : { id: "total", itemId: targetId, quantity, kind: "total", children };
}

export function orderedOperations(root: BreakdownNode): BreakdownNode[] {
  return [...root.children.flatMap(orderedOperations), ...(root.kind === "recipe" || root.kind === "cycle" ? [root] : [])];
}
