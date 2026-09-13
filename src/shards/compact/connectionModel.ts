import type { BreakdownNode } from "./breakdown";

export type Connection = { from: string; to: string; quantity: number };
export type ConnectionGraph = { nodes: BreakdownNode[]; edges: Connection[]; rootId: string };

/** Only raw ingredients are shared. Separate production batches retain their identities. */
export function connectionGraph(root: BreakdownNode): ConnectionGraph {
  const nodes = new Map<string, BreakdownNode>();
  const edges: Connection[] = [];
  const visit = (node: BreakdownNode): string => {
    const id = node.kind === "input" ? `input-${node.itemId}` : node.id;
    node.children.forEach(child => {
      const from = visit(child);
      const existing = edges.find(edge => edge.from === from && edge.to === id);
      if (existing) existing.quantity += child.quantity;
      else edges.push({ from, to: id, quantity: child.quantity });
    });
    const existing = nodes.get(id);
    if (existing) existing.quantity += node.quantity;
    else nodes.set(id, { ...node, id });
    return id;
  };
  return { rootId: visit(root), nodes: [...nodes.values()], edges };
}

export function traceGraph(graph: ConnectionGraph, id: string): Set<string> {
  const result = new Set([id]);
  const walk = (key: string, upstream: boolean) => graph.edges.filter(edge => (upstream ? edge.to : edge.from) === key).forEach(edge => {
    const next = upstream ? edge.from : edge.to;
    if (!result.has(next)) { result.add(next); walk(next, upstream); }
  });
  walk(id, true);
  walk(id, false);
  return result;
}

export function circuitLayout(graph: ConnectionGraph, availableWidth: number) {
  const columns = Math.max(2, Math.min(5, Math.ceil(Math.sqrt(graph.nodes.length * 1.4)), Math.floor((availableWidth - 32) / 84)));
  const width = columns * 84 + 16;
  const rows = Math.ceil(graph.nodes.length / columns);
  const nodes = graph.nodes.map((node, index) => {
    const row = Math.floor(index / columns);
    const count = Math.min(columns, graph.nodes.length - row * columns);
    const col = row % 2 ? count - 1 - index % columns : index % columns;
    return { ...node, x: 24 + col * 84 + (columns - count) * 42, y: 36 + row * 104 };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = graph.edges.map((edge, index) => {
    const from = byId.get(edge.from)!;
    const to = byId.get(edge.to)!;
    const sx = from.x + 26, ex = to.x + 26;
    const sameRow = from.y === to.y;
    const sy = sameRow ? from.y - 4 : from.y + (from.repeats == null ? 56 : 76);
    const ey = to.y - 5;
    const arcY = sy - 24 - Math.abs(ex - sx) * .025;
    const gutter = to.y - 20;
    const rail = index % 2 ? 7 : width - 7;
    const path = sameRow ? `M ${sx} ${sy} C ${sx} ${arcY}, ${ex} ${arcY}, ${ex} ${ey}`
      : to.y - from.y <= 104 ? `M ${sx} ${sy} C ${sx} ${gutter}, ${ex} ${gutter}, ${ex} ${ey}`
        : `M ${sx} ${sy} V ${from.y + 88} H ${rail} V ${gutter} H ${ex} V ${ey}`;
    return { ...edge, path, split: graph.edges.filter(peer => peer.from === edge.from).length > 1,
      labelX: sameRow ? (sx + ex) / 2 : ex, labelY: sameRow ? arcY + 3 : gutter - 4 };
  });
  return { nodes, edges, width, height: rows * 104 + 8 };
}

export function lensLayout(graph: ConnectionGraph, activeId: string, availableWidth: number) {
  const active = graph.nodes.find(node => node.id === activeId) ?? graph.nodes.find(node => node.id === graph.rootId)!;
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  const incoming = graph.edges.filter(edge => edge.to === active.id);
  const outgoing = graph.edges.filter(edge => edge.from === active.id);
  const width = Math.min(availableWidth, 420);
  const columns = Math.max(1, Math.floor((width - 32) / 76));
  const inputRows = Math.ceil(incoming.length / columns);
  const outputRows = Math.ceil(outgoing.length / columns);
  const centerY = incoming.length ? 12 + inputRows * 86 : 12;
  const place = (index: number, count: number) => {
    const row = Math.floor(index / columns);
    const rowCount = Math.min(columns, count - row * columns);
    return { x: width / 2 - 26 + (index % columns - (rowCount - 1) / 2) * 76, y: row * 86 };
  };
  const positioned = [
    ...incoming.map((edge, index) => ({ node: { ...byId.get(edge.from)!, quantity: edge.quantity }, ...place(index, incoming.length), kind: "input" as const })),
    { node: active, x: width / 2 - 26, y: centerY, kind: "focus" as const },
    ...outgoing.map((edge, index) => ({ node: byId.get(edge.to)!, x: place(index, outgoing.length).x, y: centerY + 96 + place(index, outgoing.length).y, kind: "consumer" as const })),
  ];
  return { active, positioned, width, centerY, height: centerY + (outgoing.length ? 96 + outputRows * 86 : 90) };
}
