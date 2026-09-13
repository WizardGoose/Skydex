import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalculationService } from "../../services/calculationService";
import type { CalculationParams, Shard } from "../../types/types";
import { ShardRouteToggles } from "../ShardRouteToggles";

const params: CalculationParams = {
  customRates: {}, hunterFortune: 0, excludeChameleon: false, noWoodenBait: false,
  frogBonus: false, newtLevel: 0, salamanderLevel: 0, lizardKingLevel: 0,
  leviathanLevel: 0, pythonLevel: 0, kingCobraLevel: 0, seaSerpentLevel: 0,
  tiamatLevel: 0, crocodileLevel: 0, kuudraTier: "none", moneyPerHour: Infinity,
  customKuudraTime: false, kuudraTimeSeconds: null, rateAsCoinValue: false, craftPenalty: 0.8,
};
const shards = Object.fromEntries(["L4", "L23", "R29", "C1"].map((id) => [id, {
  id, name: id, internal_id: id, family: "", type: "", rarity: "common", fuse_amount: 1, rate: 100,
}])) as Record<string, Shard>;
const fusion = { shards, recipes: { C1: { "2": [["L4", "L23"] as [string, string]] } } };
const rates = Object.fromEntries(Object.keys(shards).map((id) => [id, 100]));

describe("legacy Shards route rules", () => {
  it("disables direct Chameleon acquisition without deleting its fusion recipes", () => {
    const data = CalculationService.getInstance().buildData(fusion, rates, { ...params, excludeChameleon: true });
    expect(data.shards.L4.rate).toBe(0);
    const baseline = CalculationService.getInstance().buildData(fusion, rates, params);
    expect(data.shards.L23.rate).toBe(baseline.shards.L23.rate);
    expect(data.recipes.C1[0].inputs).toEqual(["L4", "L23"]);
  });

  it("preserves the legacy wooden-bait rate reductions instead of banning the shards", () => {
    const data = CalculationService.getInstance().buildData(fusion, rates, { ...params, noWoodenBait: true });
    const baseline = CalculationService.getInstance().buildData(fusion, rates, params);
    expect(data.shards.L23.rate).toBeCloseTo(baseline.shards.L23.rate * 0.1);
    expect(data.shards.R29.rate).toBeCloseTo(baseline.shards.R29.rate * 0.05);
    expect(data.shards.C1.rate).toBe(baseline.shards.C1.rate);
  });

  it("keeps hunting restrictions separate from market prices", () => {
    const data = CalculationService.getInstance().buildData(fusion, rates, {
      ...params, rateAsCoinValue: true, customRates: rates, excludeChameleon: true, noWoodenBait: true,
    });
    expect(data.shards.L4.rate).toBe(100);
    expect(data.shards.L23.rate).toBe(100);
  });

  it.each([true, false])("exposes only the controls that affect the selected mode (Ironman: %s)", (ironman) => {
    const html = renderToStaticMarkup(<ShardRouteToggles ironman={ironman} form={{ ...params, instantBuyPrices: false }} onChange={() => {}} />);
    expect(html.includes("Exclude Chameleon")).toBe(ironman);
    expect(html.includes("Exclude Wooden Bait")).toBe(ironman);
    expect(html.includes("Use instant-buy prices")).toBe(!ironman);
  });
});
