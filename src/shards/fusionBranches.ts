import type { InventoryRecipeTree } from "../types/types";

type RouteNode = Exclude<InventoryRecipeTree, InventoryRecipeTree[]>;

export interface FusionBranchItem {
  shardKey: string;
  quantity: number;
  sources: { method: "direct" | "inventory"; quantity: number }[];
}

export interface FusionBranch {
  id: string;
  kind: "inputs" | "recipe" | "cycle" | "goal";
  items: FusionBranchItem[];
  shardKey?: string;
  quantity?: number;
  repeats?: number;
  step?: number;
  children: FusionBranch[];
}

const flatten = (tree: InventoryRecipeTree): RouteNode[] => Array.isArray(tree) ? tree.flatMap(flatten) : [tree];

/** Preserve each consumer's actual dependencies, including split inventory/recipe inputs. */
export function buildFusionBranches(tree: InventoryRecipeTree | null): FusionBranch {
  let nextId = 0;
  let step = 0;
  const branch = (nodes: RouteNode[]): FusionBranch[] => {
    const result: FusionBranch[] = [];
    const leaves = new Map<string, FusionBranchItem>();
    for (const node of nodes) {
      if (node.method === "direct" || node.method === "inventory") {
        const item = leaves.get(node.shard) ?? { shardKey: node.shard, quantity: 0, sources: [] };
        const source = item.sources.find((source) => source.method === node.method);
        if (source) source.quantity += node.quantity;
        else item.sources.push({ method: node.method, quantity: node.quantity });
        item.quantity += node.quantity;
        leaves.set(node.shard, item);
      } else {
        const children = branch((node.method === "recipe" ? node.inputs : [node.inputRecipe, ...node.cycleInputs]).flatMap(flatten));
        result.push({
          id: `branch-${nextId++}`, kind: node.method, items: [], shardKey: node.shard,
          quantity: node.quantity, repeats: node.craftsNeeded, step: ++step, children,
        });
      }
    }
    // Only group sources that feed this same result. Never merge across unrelated branches.
    const items = [...leaves.values()];
    for (let index = 0; index < items.length; index += 2) {
      result.push({ id: `branch-${nextId++}`, kind: "inputs", items: items.slice(index, index + 2), children: [] });
    }
    return result;
  };
  return { id: "goal", kind: "goal", items: [], children: tree ? branch(flatten(tree)) : [] };
}

export interface PlacedFusionBranch {
  branch: FusionBranch;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FusionBranchEdge {
  from: string;
  to: string;
  path: string;
}

export interface FusionBranchLayout {
  nodes: PlacedFusionBranch[];
  edges: FusionBranchEdge[];
  width: number;
  height: number;
}

const widthOf = (branch: FusionBranch) => branch.kind === "inputs" ? branch.items.length * 72 : 104;
const heightOf = (branch: FusionBranch) => branch.kind === "goal" ? 128 : branch.kind === "inputs" ? 114 : 108;
const gap = 14;
const branchGap = 20;
const joinRail = 18;

const minimumWidth = (branch: FusionBranch): number => Math.max(
  widthOf(branch),
  ...branch.children.map((child) => minimumWidth(child) + (branch.children.length > 1 ? joinRail : 0)),
);

/** Place parallel branches across the page and join only at their actual output. */
export function layoutFusionBranches(root: FusionBranch, availableWidth: number): FusionBranchLayout {
  const place = (branch: FusionBranch, available: number): FusionBranchLayout => {
    const width = widthOf(branch);
    const height = heightOf(branch);
    if (!branch.children.length) return { nodes: [{ branch, x: 0, y: 0, width, height }], edges: [], width, height };

    const minimums = branch.children.map(minimumWidth);
    const allFit = minimums.reduce((sum, value) => sum + value, 0) + branchGap * (branch.children.length - 1) <= available;
    const contentBudget = available - (allFit ? 0 : joinRail);
    // A single input needs less room than a complete dependency branch. Pack
    // their actual minimum widths instead of giving every sibling the widest track.
    const groups: { branch: FusionBranch; minimum: number }[][] = [[]];
    let rowMinimum = 0;
    branch.children.forEach((child, index) => {
      const minimum = minimums[index]!;
      let group = groups[groups.length - 1]!;
      if (group.length && rowMinimum + branchGap + minimum > contentBudget) {
        group = [];
        groups.push(group);
        rowMinimum = 0;
      }
      rowMinimum += (group.length ? branchGap : 0) + minimum;
      group.push({ branch: child, minimum });
    });
    const rows: { children: FusionBranchLayout[]; width: number; height: number }[] = [];
    for (const group of groups) {
      const spare = Math.max(0, contentBudget - group.reduce((sum, child) => sum + child.minimum, 0) - branchGap * (group.length - 1));
      const items = group.map((child) => place(child.branch, child.minimum + spare / group.length));
      rows.push({ children: items, width: items.reduce((sum, child) => sum + child.width, 0) + branchGap * (items.length - 1), height: Math.max(...items.map((child) => child.height)) });
    }
    const contentWidth = Math.max(width, ...rows.map((row) => row.width));
    const childHeight = rows.reduce((sum, row) => sum + row.height, 0) + gap * (rows.length - 1);
    const nodeX = (contentWidth - width) / 2;
    const nodeY = childHeight + gap;
    const node: PlacedFusionBranch = { branch, x: nodeX, y: nodeY, width, height };
    const nodes: PlacedFusionBranch[] = [];
    const edges: FusionBranchEdge[] = [];
    let offsetY = 0;
    for (const row of rows) {
      let offsetX = (contentWidth - row.width) / 2;
      for (const child of row.children) {
        const childY = offsetY + row.height - child.height;
        const shifted = child.nodes.map((item) => ({ ...item, x: item.x + offsetX, y: item.y + childY }));
        nodes.push(...shifted);
        edges.push(...child.edges.map((edge) => ({ ...edge, path: translatePath(edge.path, offsetX, childY) })));
        const output = shifted[shifted.length - 1]!;
        const startX = output.x + output.width / 2;
        const startY = output.y + output.height;
        const endX = nodeX + width / 2;
        // Wrapped rows share an outside rail, never a line through another branch.
        const path = rows.length === 1
          ? `M ${startX} ${startY} V ${nodeY - gap / 2} H ${endX} V ${nodeY - 4}`
          : `M ${startX} ${startY} V ${offsetY + row.height + gap / 2} H ${contentWidth + joinRail / 2} V ${nodeY - gap / 2} H ${endX} V ${nodeY - 4}`;
        edges.push({ from: output.branch.id, to: branch.id, path });
        offsetX += child.width + branchGap;
      }
      offsetY += row.height + gap;
    }
    nodes.push(node);
    return { nodes, edges, width: contentWidth + (rows.length > 1 ? joinRail : 0), height: nodeY + height };
  };
  return place(root, Math.max(150, availableWidth));
}

function translatePath(path: string, x: number, y: number): string {
  return path.replace(/M ([\d.]+) ([\d.]+)|H ([\d.]+)|V ([\d.]+)/g, (_, mx, my, hx, vy) => (
    mx !== undefined ? `M ${Number(mx) + x} ${Number(my) + y}` : hx !== undefined ? `H ${Number(hx) + x}` : `V ${Number(vy) + y}`
  ));
}
