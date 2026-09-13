import { describe, expect, it } from "vitest";
import type { InventoryRecipeTree } from "../../types/types";
import { buildFusionSequence } from "../fusionSequence";

const nestedRoute: InventoryRecipeTree = {
  shard: "GOAL",
  method: "recipe",
  quantity: 4,
  craftsNeeded: 2,
  recipe: { inputs: ["START", "MID"], outputQuantity: 2, isReptile: false },
  inputs: [
    { shard: "START", method: "direct", quantity: 10 },
    {
      shard: "MID",
      method: "recipe",
      quantity: 10,
      craftsNeeded: 5,
      recipe: { inputs: ["LEFT", "RIGHT"], outputQuantity: 2, isReptile: false },
      inputs: [
        { shard: "LEFT", method: "inventory", quantity: 25 },
        { shard: "RIGHT", method: "direct", quantity: 25 },
      ],
    },
  ],
};

describe("buildFusionSequence", () => {
  it("orders real combination stages from deepest input to final goal", () => {
    const sequence = buildFusionSequence(nestedRoute);

    expect(sequence.steps.map((step) => step.outputShardKey)).toEqual(["MID", "GOAL"]);
    expect(sequence.steps.map((step) => step.repeats)).toEqual([5, 2]);
    expect(sequence.steps[0]?.inputs).toEqual([
      { shardKey: "LEFT", quantity: 25 },
      { shardKey: "RIGHT", quantity: 25 },
    ]);
    expect(sequence.steps[1]?.inputs).toEqual([
      { shardKey: "MID", quantity: 10 },
      { shardKey: "START", quantity: 10 },
    ]);
  });

  it("collects both held and direct leaves as starting inputs", () => {
    const sequence = buildFusionSequence(nestedRoute);

    expect(sequence.inputs).toEqual([
      { shardKey: "LEFT", quantity: 25 },
      { shardKey: "RIGHT", quantity: 25 },
      { shardKey: "START", quantity: 10 },
    ]);
  });
});
