import type { Data, InventoryRecipeTree } from "../../types/types";
import { equationsFor, type FusionEquation } from "./equations";

export interface PlanTarget { id: string; amount: number; tree: InventoryRecipeTree | null }
export interface PlanOperation {
  id: string; target: string; item: string; amount: number; equation?: FusionEquation;
  parents: string[]; final: boolean; x: number; y: number; column: number; row: number;
}
export interface PlanEdge { from: string; to: string; slot: number; path: string }

/** One dependency schedule for all visible targets; no invented join between targets. */
export function sharedPlan(targets: PlanTarget[], data: Data, available: number) {
  const operations: PlanOperation[] = [];
  for (const target of targets) {
    const { rows, roots, hasCycle } = equationsFor(target.tree, data);
    if (hasCycle) throw new Error("A cyclic plan cannot be shown as a simple fusion schedule.");
    const key = (id: string) => `${target.id}:${id}`;
    for (const equation of rows) {
      const producers = equation.producers.map(inputs => inputs.map(key)) as [string[], string[]];
      operations.push({ id: key(equation.id), target: target.id, item: equation.output,
        amount: roots.length === 1 && roots[0] === equation.id ? target.amount : equation.needed,
        equation: { ...equation, id: key(equation.id), producers }, parents: [...new Set(producers.flat())],
        final: roots.length === 1 && roots[0] === equation.id, x: 0, y: 0, column: 0, row: 0 });
    }
    if (roots.length !== 1) operations.push({ id: `${target.id}:total`, target: target.id, item: target.id, amount: target.amount,
      parents: roots.map(key), final: true, x: 0, y: 0, column: 0, row: 0 });
  }
  const cardWidth = 236, pitch = 128;
  const columns = Math.max(1, Math.min(4, Math.floor(available / (cardWidth + 40))));
  const gutter = Math.min(40, Math.max(8, available - cardWidth));
  const width = columns * (cardWidth + gutter);
  const inset = Math.min(8, gutter / 4);
  const byId = new Map(operations.map(op => [op.id, op]));
  const depth = (op: PlanOperation): number => op.parents.length ? 1 + Math.max(...op.parents.map(id => depth(byId.get(id)!))) : 0;
  const remaining = (op: PlanOperation): number => {
    const consumers = operations.filter(candidate => candidate.parents.includes(op.id));
    return consumers.length ? 1 + Math.max(...consumers.map(remaining)) : 0;
  };
  // Schedule sources first, then each consumer as soon as its inputs are ready.
  const ordered = [...operations].sort((a, b) => depth(a) - depth(b) || remaining(b) - remaining(a) || Number(a.final) - Number(b.final));
  const occupied = new Set<string>();
  for (const op of ordered) {
    const parents = op.parents.map(id => byId.get(id)!);
    let row = parents.length ? Math.max(...parents.map(parent => parent.row)) + 1 : 0;
    const preferred = parents.length ? parents.reduce((sum, parent) => sum + parent.column, 0) / parents.length : 0;
    const candidates = Array.from({ length: columns }, (_, column) => column).sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred));
    while (candidates.every(column => occupied.has(`${row}:${column}`))) row++;
    op.column = candidates.find(column => !occupied.has(`${row}:${column}`))!;
    op.row = row;
    op.x = op.column * (cardWidth + gutter) + inset;
    op.y = row * pitch + 10;
    occupied.add(`${row}:${op.column}`);
  }
  const edges: PlanEdge[] = [];
  const rails = new Map<string, number>();
  for (let column = 0; column < columns; column++) {
    const ends: number[] = [];
    const lanes = new Map<string, number>();
    const sources = operations.filter(op => op.column === column && operations.some(consumer => consumer.parents.includes(op.id))).sort((a, b) => a.row - b.row);
    for (const op of sources) {
      const free = ends.findIndex(end => end <= op.row);
      const lane = free < 0 ? ends.length : free;
      ends[lane] = Math.max(...operations.filter(consumer => consumer.parents.includes(op.id)).map(consumer => consumer.row));
      lanes.set(op.id, lane);
    }
    const spacing = Math.min(5, (gutter - 2 * inset - 4) / Math.max(1, ends.length - 1));
    sources.forEach(op => rails.set(op.id, op.x + cardWidth + 2 + lanes.get(op.id)! * spacing));
  }
  for (const op of operations) {
    const slots = op.equation?.producers ?? [op.parents];
    slots.forEach((parents, slot) => parents.forEach(id => {
      const from = byId.get(id)!;
      const sx = from.x + 210, sy = from.y + 56;
      const ex = op.x + (op.equation ? 26 + slot * 92 : 118), ey = op.y - 4;
      const rail = rails.get(from.id)!;
      const landing = op.y - 12 - op.column * 8 - slot * 4;
      edges.push({ from: id, to: op.id, slot,
        path: `M ${sx} ${sy} V ${sy + 8} H ${rail} V ${landing} H ${ex} V ${ey}` });
    }));
  }
  return { operations: operations.sort((a, b) => a.row - b.row || a.column - b.column), edges, width, height: operations.length ? (Math.max(...operations.map(op => op.row)) + 1) * pitch : 0 };
}
