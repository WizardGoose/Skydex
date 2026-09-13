import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculationService } from "../../services/calculationService";
import { InvCalculationService } from "../../services/invCalculationService";
import type { CalculationParams, InventoryRecipeTree } from "../../types/types";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const rates = JSON.parse(readFileSync("public/rates.json", "utf8"));
const params: CalculationParams = {
  customRates: {}, hunterFortune: 0, excludeChameleon: false, noWoodenBait: false,
  frogBonus: false, newtLevel: 0, salamanderLevel: 0, lizardKingLevel: 0,
  leviathanLevel: 0, pythonLevel: 0, kingCobraLevel: 0, seaSerpentLevel: 0,
  tiamatLevel: 0, crocodileLevel: 0, kuudraTier: "none", moneyPerHour: Infinity,
  customKuudraTime: false, kuudraTimeSeconds: null, rateAsCoinValue: false, craftPenalty: 0.8,
};
const used = (tree: InventoryRecipeTree | null): Record<string, number> => {
  if (!tree) throw new Error("Expected a calculated recipe tree");
  const counts: Record<string, number> = {};
  const visit = (node: InventoryRecipeTree) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node.method === "inventory") counts[node.shard] = (counts[node.shard] ?? 0) + node.quantity;
    else if (node.method === "recipe") node.inputs.forEach(visit);
    else if (node.method === "cycle") { visit(node.inputRecipe); node.cycleInputs.forEach(visit); }
  };
  visit(tree);
  return counts;
};
afterEach(() => vi.restoreAllMocks());

describe("inventory recipe choice", () => {
  beforeEach(() => {
    const service = CalculationService.getInstance();
    const data = service.buildData(fusion, rates, params);
    vi.spyOn(CalculationService.prototype, "parseData").mockResolvedValue(data);
    vi.spyOn(CalculationService.prototype, "getDefaultRates").mockReturnValue(rates);
  });

  it("uses stored substitutes beyond the first covered craft", async () => {
    const inventory = new Map([["C25", 10], ["R6", 59], ["U20", 7], ["U41", 40], ["E33", 92]]);
    const result = await InvCalculationService.getInstance().calculateOptimalPath("C1", 96, params, inventory);
    // New recipes can replace the old Phanpyre branch; retain stock accounting.
    expect(used(result.tree).R6).toBeGreaterThan(5);
    expect(used(result.tree).R6).toBeLessThanOrEqual(59);
    expect(inventory.get("R6")).toBe(59);
    expect(result.remainingInventory?.get("R6")).toBe(59 - used(result.tree).R6);
    expect(result.totalShardsProduced).toBe(96);
  });

  it("prefers cheaper-to-replace stored catalysts over recipe ordering", async () => {
    // Isolate replacement economics from live recipe additions and rate updates.
    const fixture = { ...fusion, recipes: { C1: { 2: [["C25", "E33"], ["C25", "R6"]] } } };
    const data = CalculationService.getInstance().buildData(fixture, rates, params);
    data.shards.R6.rate = 1000;
    data.shards.E33.rate = 1;
    vi.mocked(CalculationService.prototype.parseData).mockResolvedValue(data);
    const result = await InvCalculationService.getInstance().calculateOptimalPath("C1", 4, params, new Map([["C25", 10], ["R6", 59], ["E33", 92]]));
    expect(used(result.tree).E33 ?? 0).toBe(0);
    expect(used(result.tree).R6).toBe(10);
    expect(result.totalQuantities.size).toBe(0);
  });

  it.each(["Grove", "Starborn", "Sphinx", "King Minos", "Ananke", "Galaxy Fish"])("keeps %s inventory allocation balanced and no slower than gathering", async (name) => {
    const data = CalculationService.getInstance().buildData(fusion, rates, params);
    const target = Object.values(data.shards).find(shard => shard.name === name)!;
    expect(target).toBeDefined();
    const inventory = new Map(Object.keys(data.shards).filter((_, index) => index % 3 === 0).map((key, index) => [key, 7 + index % 6 * 11]));
    inventory.delete(target.id);
    const solver = InvCalculationService.getInstance();
    const result = await solver.calculateOptimalPath(target.id, 12, params, inventory);
    const gathered = await solver.calculateOptimalPath(target.id, 12, params, new Map());
    expect(result.totalTime).toBeLessThanOrEqual(gathered.totalTime + 1e-9);
    const consumed = used(result.tree);
    for (const [key, quantity] of inventory) {
      expect(consumed[key] ?? 0, key).toBeLessThanOrEqual(quantity);
      expect(result.remainingInventory?.get(key), key).toBeCloseTo(quantity - (consumed[key] ?? 0));
    }
    expect(Object.keys(consumed).every(key => inventory.has(key))).toBe(true);
  });
});
