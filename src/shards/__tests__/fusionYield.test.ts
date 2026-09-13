import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fusionYield } from "../fusionYield";

const recipe = { inputs: ["lizard", "ghost"] as [string, string], outputQuantity: 2, isReptile: true };

describe("physical fusion yield", () => {
  it("preserves the one-output Nessie ID recipe separately from two-output special recipes", () => {
    const catalogue = JSON.parse(readFileSync(new URL("../../../public/fusion-data.json", import.meta.url), "utf8"));
    const route = Object.entries(catalogue.recipes.L5 as Record<string, string[][]>)
      .find(([, pairs]) => pairs.some(inputs => inputs.includes("R8") && inputs.includes("L2")));
    expect(route?.[0]).toBe("1");
    const output = fusionYield({ inputs: ["R8", "L2"], outputQuantity: Number(route![0]), isReptile: true }, 3, 1.2);
    expect(output.baseTotal).toBe(3);
    expect(output.doubled).toBe(2);
    expect(output.expectedTotal).toBeCloseTo(3.6);
  });
  it("keeps a single Cascade fusion at two, with four as the possible bonus outcome", () => {
    const output = fusionYield(recipe, 1, 1.2);
    expect(output).toMatchObject({ perFusion: 2, baseTotal: 2, doubled: 4 });
    expect(output.doubleChance).toBeCloseTo(0.2);
    expect(output.expectedTotal).toBeCloseTo(2.4);
  });
  it("does not round expected bonuses into guaranteed batch quantities", () => {
    expect(fusionYield(recipe, 3, 1.2).baseTotal).toBe(6);
    expect(fusionYield(recipe, 10, 1.2).baseTotal).toBe(20);
  });
  it("does not give non-reptiles or unboosted recipes a doubling chance", () => {
    expect(fusionYield({ ...recipe, isReptile: false }, 1, 1.2).doubleChance).toBe(0);
    expect(fusionYield(recipe, 1, 1).doubleChance).toBe(0);
  });
});
