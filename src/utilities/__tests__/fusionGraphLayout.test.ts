import { describe, expect, it } from "vitest";
import type { Data } from "../../types/types";
import { buildGraphElements } from "../fusionGraphLayout";
import type { FusionGraph } from "../fusionLines";

describe("fusion graph layout", () => {
  it("uses React Flow's registered default edge instead of a missing custom bezier type", () => {
    const data = {
      recipes: {},
      shards: {
        A: { name: "A" },
        B: { name: "B" },
      },
    } as unknown as Data;
    const graph: FusionGraph = {
      special: new Map([["A", new Set(["B"])]]),
      id: new Map(),
      specialRev: new Map([["B", new Set(["A"])]]),
      idRev: new Map(),
    };

    expect(buildGraphElements(data, graph).edges).toEqual([
      expect.objectContaining({ source: "A", target: "B", type: "default" }),
    ]);
  });
});
