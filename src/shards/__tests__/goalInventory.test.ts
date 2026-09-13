import { afterEach, describe, expect, it, vi } from "vitest";
import { CalculationService } from "../../services/calculationService";
import { InvCalculationService } from "../../services/invCalculationService";
import type { CalculationParams, Shard } from "../../types/types";
import { inventoryForGoal, restoreGoalInventory, storageInputsForRoute } from "../goalInventory";

const params: CalculationParams = {
  customRates: {}, hunterFortune: 0, excludeChameleon: false, noWoodenBait: false,
  frogBonus: false, newtLevel: 0, salamanderLevel: 0, lizardKingLevel: 0,
  leviathanLevel: 0, pythonLevel: 0, kingCobraLevel: 0, seaSerpentLevel: 0,
  tiamatLevel: 0, crocodileLevel: 0, kuudraTier: "none", moneyPerHour: Infinity,
  customKuudraTime: false, kuudraTimeSeconds: null, rateAsCoinValue: false, craftPenalty: 0.8,
};

afterEach(() => vi.restoreAllMocks());

describe("gather instead for one shard goal", () => {
  it("gathers the protected input, then makes the original stock available to the next goal", async () => {
    const shards = Object.fromEntries(["GOAL", "GHOST", "LEAF"].map((id) => [id, {
      id, name: id, internal_id: id, family: "", type: "", rarity: "common", fuse_amount: 1, rate: id === "GOAL" ? 0 : 100,
    }])) as Record<string, Shard>;
    const parsed = CalculationService.getInstance().buildData({ shards, recipes: { GOAL: { "1": [["GHOST", "LEAF"]] } } }, { GOAL: 0, GHOST: 100, LEAF: 100 }, params);
    vi.spyOn(CalculationService.prototype, "parseData").mockResolvedValue(parsed);
    const inventory = new Map([["GHOST", 10], ["LEAF", 10]]);
    const first = inventoryForGoal(inventory, ["GHOST"]);
    const result = await InvCalculationService.getInstance().calculateOptimalPath("GOAL", 1, params, first.available);
    expect(result.totalQuantities.get("GHOST")).toBe(1);
    expect(storageInputsForRoute(result.tree)).not.toContain("GHOST");
    const afterFirst = restoreGoalInventory(result.remainingInventory!, first.reserved);
    expect(afterFirst.get("GHOST")).toBe(10);
    const second = await InvCalculationService.getInstance().calculateOptimalPath("GOAL", 1, params, afterFirst);
    expect(storageInputsForRoute(second.tree)).toContain("GHOST");
    expect(second.remainingInventory?.get("GHOST")).toBe(9);
    expect(inventory.get("GHOST")).toBe(10);
  });

  it("restores reserved stock without dropping newly produced surplus", () => {
    const { available, reserved } = inventoryForGoal(new Map([["GHOST", 10], ["LEAF", 2]]), ["GHOST", "GHOST"]);
    expect([...available]).toEqual([["LEAF", 2]]);
    expect([...restoreGoalInventory(new Map([["GHOST", 3], ["LEAF", 1]]), reserved)]).toEqual([["GHOST", 13], ["LEAF", 1]]);
  });

  it("does not invent unknown holdings or restore globally excluded stock", () => {
    const scoped = inventoryForGoal(new Map([["LEAF", 2]]), ["GHOST"]);
    expect(scoped.reserved.size).toBe(0);
    expect(restoreGoalInventory(scoped.available, scoped.reserved).has("GHOST")).toBe(false);
  });
});
