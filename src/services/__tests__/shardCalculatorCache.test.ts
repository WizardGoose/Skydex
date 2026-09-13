import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculationService } from "../calculationService";
import { InvCalculationService } from "../invCalculationService";
import { DataService } from "../dataService";
import { inventoryForGoal, restoreGoalInventory } from "../../shards/goalInventory";
import type { CalculationParams, InventoryRecipeTree, RecipeOverride } from "../../types/types";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const rates = JSON.parse(readFileSync("public/rates.json", "utf8"));
const params: CalculationParams = {
  customRates: {}, hunterFortune: 122, excludeChameleon: true, noWoodenBait: true,
  frogBonus: false, newtLevel: 0, salamanderLevel: 0, lizardKingLevel: 0,
  leviathanLevel: 0, pythonLevel: 0, kingCobraLevel: 0, seaSerpentLevel: 0,
  tiamatLevel: 0, crocodileLevel: 10, kuudraTier: "none", moneyPerHour: Infinity,
  customKuudraTime: false, kuudraTimeSeconds: null, rateAsCoinValue: false, craftPenalty: 0.8,
};
beforeEach(() => {
  vi.spyOn(DataService.getInstance(), "loadFusionData").mockResolvedValue(fusion);
  vi.spyOn(DataService.getInstance(), "loadDefaultRates").mockResolvedValue(rates);
});
afterEach(() => vi.restoreAllMocks());

describe("prepared inventory graph", () => {
  it("excludes an ingredient throughout a plan without spending its stock or changing other target graphs", async () => {
    const solver = new InvCalculationService();
    const target = Object.keys(fusion.shards).find(key => fusion.shards[key].name === "Abyssal Miner")!;
    const stock = new Map([["R8", 200], ["E33", 200]]);
    const inputKeys = (tree: InventoryRecipeTree | null): string[] => {
      if (!tree) return [];
      if (Array.isArray(tree)) return tree.flatMap(inputKeys);
      if (tree.method === "recipe") return [...tree.recipe.inputs, ...tree.inputs.flatMap(inputKeys)];
      if (tree.method === "cycle") return [...tree.steps.flatMap(step => step.recipe.inputs), ...inputKeys(tree.inputRecipe), ...tree.cycleInputs.flatMap(inputKeys)];
      return [];
    };
    const original = await solver.calculateOptimalPath(target, 32, params, stock);
    expect(inputKeys(original.tree)).toContain("R8");
    const excluded = await solver.calculateOptimalPath(target, 32, { ...params, excludedFusionInputs: ["R8"] }, stock);
    expect(inputKeys(excluded.tree)).not.toContain("R8");
    expect(excluded.remainingInventory?.get("R8")).toBe(200);
    expect(await solver.calculateOptimalPath(target, 32, params, stock)).toEqual(original);
    expect(stock.get("R8")).toBe(200);
  });
  it("reuses catalogue work across targets and quantities, but recomputes for changed economics", async () => {
    const costs = vi.spyOn(CalculationService.prototype, "computeMinCosts");
    const solver = new InvCalculationService();
    await solver.calculateOptimalPath("C1", 12, params, new Map());
    const firstCalls = costs.mock.calls.length;
    await solver.calculateOptimalPath("C1", 24, params, new Map());
    await solver.calculateOptimalPath("R1", 1, params, new Map());
    expect(costs).toHaveBeenCalledTimes(firstCalls);
    await solver.calculateOptimalPath("C1", 12, { ...params, craftPenalty: 1.6 }, new Map());
    expect(costs.mock.calls.length).toBeGreaterThan(firstCalls);
  });

  it("matches uncached results after stock, reserves, progression, bonuses, overrides and prices change", async () => {
    const solver = new InvCalculationService();
    const stock = new Map([["C25", 10], ["R6", 59], ["U20", 7], ["U41", 40], ["E33", 92]]);
    const stockBefore = new Map(stock);
    const owned = new Map([["C1", 96], ["R6", 48]]);
    const replacement: RecipeOverride[] = [{ shardId: "C1", recipe: null }];
    const variants = [
      { params, stock, owned: new Map<string, number>(), overrides: [] },
      { params, stock: new Map(stock).set("R6", 4), owned, overrides: [] },
      { params, stock, owned, overrides: replacement },
      { params: { ...params, crocodileLevel: 0, craftPenalty: 1.6 }, stock, owned, overrides: [] },
      { params: { ...params, customRates: { C1: 500, C25: 1, R6: 2 }, rateAsCoinValue: true }, stock, owned, overrides: [] },
      { params: { ...params, customRates: { C1: 1, C25: 500, R6: 200 }, rateAsCoinValue: true }, stock, owned, overrides: [] },
      { params, stock, owned: new Map<string, number>(), overrides: [] },
    ];
    for (const variant of variants) {
      const reserved = inventoryForGoal(variant.stock, ["E33"]);
      const args = ["C1", 24, variant.params, reserved.available, variant.overrides, variant.owned] as const;
      const actual = await solver.calculateOptimalPath(...args);
      const uncached = await new InvCalculationService().calculateOptimalPath(...args);
      expect(actual).toEqual(uncached);
      expect(restoreGoalInventory(actual.remainingInventory!, reserved.reserved).get("E33")).toBe(92);
      if (variant.overrides.length) expect(actual.tree).toEqual({ shard: "C1", method: "direct", quantity: 24 });
    }
    expect(stock).toEqual(stockBefore);
  });
});
