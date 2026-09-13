import { describe, expect, it } from "vitest";
import type { InventoryRecipeTree } from "../../types/types";
import { buildFusionBranches, layoutFusionBranches, type FusionBranch } from "../fusionBranches";

const recipe = (shard: string, left: InventoryRecipeTree, right: InventoryRecipeTree, quantity = 2, craftsNeeded = 1): InventoryRecipeTree => ({
  method: "recipe", shard, quantity, craftsNeeded,
  recipe: { inputs: ["A", "B"], outputQuantity: 2, isReptile: false }, inputs: [left, right],
});
const source = (shard: string, quantity = 5): InventoryRecipeTree => ({ method: "direct", shard, quantity });
const all = (root: FusionBranch): FusionBranch[] => [...root.children.flatMap(all), root];

describe("fusion dependency presentation", () => {
  it("places the four parallel Grove combinations in one horizontal row", () => {
    const root = buildFusionBranches(Array.from({ length: 4 }, (_, index) => recipe("GROVE", source(`A${index}`), source(`B${index}`))));
    const layout = layoutFusionBranches(root, 640);
    const outputs = layout.nodes.filter((node) => root.children.some((child) => child.id === node.branch.id));
    expect(new Set(outputs.map((node) => node.y)).size).toBe(1);
    expect(new Set(outputs.map((node) => node.x)).size).toBe(4);
    expect(layout.nodes.at(-1)!.y).toBeGreaterThan(outputs[0]!.y + outputs[0]!.height);
    expect(layout.width).toBeLessThanOrEqual(640);
  });

  it("joins parallel recipes at the goal without connecting them to one another", () => {
    const root = buildFusionBranches([
      recipe("GROVE", source("PHANPYRE", 185), { method: "inventory", shard: "OBSIDIAN", quantity: 185 }, 74, 37),
      recipe("GROVE", source("PHANPYRE", 55), source("SALMON", 55), 22, 11),
    ]);
    expect(root.children.map((node) => [node.quantity, node.repeats])).toEqual([[74, 37], [22, 11]]);
    const { edges } = layoutFusionBranches(root, 640);
    expect(edges.filter((edge) => edge.to === "goal").map((edge) => edge.from)).toEqual(root.children.map((child) => child.id));
    expect(edges.some((edge) => edge.from === root.children[0]!.id && edge.to === root.children[1]!.id)).toBe(false);
  });

  it("keeps a split held-and-crafted input attached to its actual consumer", () => {
    const root = buildFusionBranches(recipe("GOAL", [
      { method: "inventory", shard: "MID", quantity: 3 },
      recipe("MID", source("LEFT"), source("RIGHT")),
    ], source("OTHER")));
    const consumer = root.children[0]!;
    expect(consumer.children[0]).toMatchObject({ kind: "recipe", shardKey: "MID", quantity: 2 });
    expect(consumer.children[1]!.items).toEqual([
      { shardKey: "MID", quantity: 3, sources: [{ method: "inventory", quantity: 3 }] },
      { shardKey: "OTHER", quantity: 5, sources: [{ method: "direct", quantity: 5 }] },
    ]);
    expect(all(root).filter((node) => node.kind === "recipe").map((node) => node.repeats)).toEqual([1, 1]);
  });

  it("keeps stored and gathered portions of one ingredient in the same input pair", () => {
    const root = buildFusionBranches(recipe("GROVE", source("PHANPYRE", 195), [
      { method: "inventory", shard: "SALMON", quantity: 2 },
      source("SALMON", 193),
    ], 78, 39));
    const inputs = root.children[0]!.children;
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.items[1]).toEqual({ shardKey: "SALMON", quantity: 195, sources: [
      { method: "inventory", quantity: 2 }, { method: "direct", quantity: 193 },
    ] });
    const layout = layoutFusionBranches(root, 280);
    expect(layout.nodes).toHaveLength(3);
    expect(layout.height).toBeLessThan(400);
  });

  it("keeps cycle seeds, additional inputs and repeat counts", () => {
    const root = buildFusionBranches({
      method: "cycle", shard: "CYCLE", quantity: 12, craftsNeeded: 3, multiplier: 2, steps: [],
      inputRecipe: recipe("SEED", source("A"), source("B")), cycleInputs: [source("EXTRA", 10)],
    });
    expect(root.children[0]).toMatchObject({ kind: "cycle", quantity: 12, repeats: 3 });
    expect(root.children[0]!.children).toHaveLength(2);
  });

  it("fits a single input beside a wider crafted branch without an unnecessary row", () => {
    const root = buildFusionBranches(recipe("GOAL", recipe("MID", source("A"), source("B")), source("C")));
    const consumer = root.children[0]!;
    const layout = layoutFusionBranches(root, 260);
    const children = layout.nodes.filter((node) => consumer.children.some((child) => child.id === node.branch.id));
    expect(children[0]!.y + children[0]!.height).toBe(children[1]!.y + children[1]!.height);
    expect(layout.width).toBeLessThanOrEqual(260);
  });

  it.each([280, 360, 480, 680])("folds deep joins within %ipx without dropping or overlapping nodes", (width) => {
    const root = buildFusionBranches(recipe("GOAL",
      recipe("LEFT", recipe("DEEP", source("A"), source("B")), source("C")),
      recipe("RIGHT", source("D"), source("E")),
    ));
    const layout = layoutFusionBranches(root, width);
    expect(layout.width).toBeLessThanOrEqual(width);
    expect(layout.nodes).toHaveLength(all(root).length);
    expect(layout.edges).toHaveLength(layout.nodes.length - 1);
    for (const [index, node] of layout.nodes.entries()) {
      expect(node.x + node.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + node.height).toBeLessThanOrEqual(layout.height);
      for (const peer of layout.nodes.slice(index + 1)) {
        expect(node.x < peer.x + peer.width && node.x + node.width > peer.x && node.y < peer.y + peer.height && node.y + node.height > peer.y).toBe(false);
      }
    }
  });

  it("leaves unavailable or complete routes with just their goal", () => {
    expect(buildFusionBranches(null).children).toEqual([]);
    expect(layoutFusionBranches(buildFusionBranches(null), 280).nodes).toHaveLength(1);
  });
});
