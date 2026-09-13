import type { FusionBranch, FusionBranchItem } from "../fusionBranches";

export interface CompactInput extends FusionBranchItem {
  producers: { id: string; step?: number; quantity: number }[];
}
export interface CompactNode {
  branch: FusionBranch;
  inputs: CompactInput[];
  x: number;
  y: number;
  width: number;
  height: number;
  goal: boolean;
  input?: CompactInput;
  level: number;
}
export interface CompactEdge { from: string; to: string; path: string }
export interface CompactLayout { nodes: CompactNode[]; edges: CompactEdge[]; width: number; height: number }

export function compactBranches(root: FusionBranch): FusionBranch {
  let step = 0;
  const visit = (branch: FusionBranch): FusionBranch => {
    const children: FusionBranch[] = [];
    const terminalSignature = (item: FusionBranch) => item.kind === "recipe" && item.children.every(child => child.kind === "inputs")
      ? JSON.stringify([item.shardKey, item.children.flatMap(child => child.items.map(input => [input.shardKey, input.sources.map(source => source.method)]))]) : null;
    for (const original of branch.children) {
      const child = structuredClone(original);
      const signature = terminalSignature(child);
      const same = signature ? children.find(item => terminalSignature(item) === signature) : undefined;
      if (!same) children.push(child);
      else {
        same.quantity = (same.quantity ?? 0) + (child.quantity ?? 0);
        same.repeats = (same.repeats ?? 0) + (child.repeats ?? 0);
        same.children.forEach((inputs, index) => inputs.items.forEach((input, itemIndex) => {
          const extra = child.children[index].items[itemIndex];
          input.quantity += extra.quantity;
          input.sources.forEach((source, sourceIndex) => { source.quantity += extra.sources[sourceIndex].quantity; });
        }));
      }
    }
    const copy = { ...branch, children: children.map(visit) };
    if (copy.kind === "recipe" || copy.kind === "cycle") copy.step = ++step;
    return copy;
  };
  return visit(root);
}

export function inputsFor(branch: FusionBranch): CompactInput[] {
  const inputs = new Map<string, CompactInput>();
  const add = (key: string, quantity: number) => {
    const input = inputs.get(key) ?? { shardKey: key, quantity: 0, sources: [], producers: [] };
    input.quantity += quantity;
    inputs.set(key, input);
    return input;
  };
  for (const child of branch.children) {
    if (child.kind === "inputs") {
      for (const item of child.items) {
        const input = add(item.shardKey, item.quantity);
        input.sources.push(...item.sources);
      }
    } else if (child.shardKey) {
      add(child.shardKey, child.quantity ?? 0).producers.push({ id: child.id, step: child.step, quantity: child.quantity ?? 0 });
    }
  }
  return [...inputs.values()];
}

// A fusion output is pictured once, then flows directly into its consumer.
export function compactLayout(root: FusionBranch, availableWidth: number, measuredHeights: Readonly<Record<string, number>> = {}): CompactLayout {
  const compactRoot = compactBranches(root);
  const single = compactRoot.children.length === 1 && compactRoot.children[0].kind !== "inputs";
  const final = single ? compactRoot.children[0] : compactRoot;
  const nodeWidth = 70;
  type Tree = { node: CompactNode; children: Tree[] };
  const build = (branch: FusionBranch, goal = false, input?: CompactInput): Tree => {
    const inputs = inputsFor(branch);
    const children = input ? [] : branch.children.flatMap(child => child.kind === "inputs"
      ? child.items.map((item, index) => build({ ...child, id: `${child.id}:${index}`, shardKey: item.shardKey, quantity: item.quantity, children: [] }, false, { ...item, producers: [] }))
      : [build(child)]);
    return { node: { branch, inputs, input, goal, level: 0, x: 0, y: 0, width: nodeWidth,
      height: measuredHeights[branch.id] ?? (input ? 90 + Math.max(1, input.sources.length) * 13 + (input.sources.length > 1 ? 13 : 0) : goal ? 104 : 88) }, children };
  };
  const tree = build(final, true);
  const depth = (item: Tree): number => item.children.length ? 1 + Math.max(...item.children.map(depth)) : 0;
  const assignLevel = (item: Tree, level: number) => { item.node.level = level; item.children.forEach(child => assignLevel(child, level - 1)); };
  assignLevel(tree, depth(tree));
  // Pack by occupied rows, so a newly gathered ingredient can sit beside the
  // previous fusion's output without reserving an empty full-height column.
  const pack = (item: Tree, gap: number): CompactNode[] => {
    const nodes: CompactNode[] = [];
    const roots: CompactNode[] = [];
    for (const [index, child] of item.children.entries()) {
      const branchNodes = pack(child, gap);
      if (item.node.goal && index % 2 === 1) {
        const right = Math.max(...branchNodes.map(node => node.x + node.width));
        branchNodes.forEach(node => { node.x = right - node.width - node.x; });
      }
      const offset = nodes.length ? Math.max(0, ...branchNodes.flatMap(node => nodes.filter(peer => peer.level === node.level).map(peer => peer.x + peer.width + gap - node.x))) : 0;
      branchNodes.forEach(node => { node.x += offset; });
      nodes.push(...branchNodes);
      roots.push(child.node);
    }
    if (!roots.length) item.node.x = 0;
    else if (item.node.goal) item.node.x = (roots[0].x + roots.at(-1)!.x) / 2;
    else {
      // Keep the output in an input lane, alternating sides at each fusion.
      // The spare lane is then available for the next gathered ingredient.
      const left = Math.min(...nodes.map(node => node.x));
      const right = Math.max(...nodes.map(node => node.x));
      item.node.x = item.node.level % 2 === 1 ? left : right;
    }
    nodes.push(item.node);
    return nodes;
  };
  let nodes = pack(tree, 22);
  let width = Math.max(...nodes.map(node => node.x + node.width));
  if (width > availableWidth) {
    nodes = pack(tree, Math.max(3, 22 - (width - availableWidth) / Math.max(1, nodes.filter(node => node.level === 0).length - 1)));
    width = Math.max(...nodes.map(node => node.x + node.width));
  }
  const rowHeights = Array.from({ length: depth(tree) + 1 }, (_, level) => Math.max(...nodes.filter(node => node.level === level).map(node => node.height)));
  nodes.forEach(node => { node.y = rowHeights.slice(0, node.level).reduce((sum, height) => sum + height + 28, 0); });
  const edges: CompactEdge[] = [];
  const connect = (item: Tree) => {
    item.children.forEach(child => {
      const start = child.node;
      const end = item.node;
      edges.push({ from: start.branch.id, to: end.branch.id,
        path: `M ${start.x + 35} ${start.y + start.height} V ${end.y - 14} H ${end.x + 35} V ${end.y - 4}` });
      connect(child);
    });
  };
  connect(tree);
  return { nodes, edges, width, height: tree.node.y + tree.node.height };
}
