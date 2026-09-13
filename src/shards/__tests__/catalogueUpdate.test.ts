import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CALCULATION_PARAMS } from "../../constants";
import { CalculationService } from "../../services/calculationService";
import { InvCalculationService } from "../../services/invCalculationService";
import descriptions from "../../desc.json";
import revision from "../catalogueRevision.generated.json";
import { acquisitionFor, acquisitionMethods } from "../acquisition";
import { estimateAcquisition } from "../huntingModel";

const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
const rates = JSON.parse(readFileSync("public/rates.json", "utf8"));
afterEach(() => vi.restoreAllMocks());

describe("coordinated shard catalogue", () => {
  it.each(["C44", "E44", "L60"])("calculates a Normal-mode purchase plan for new target %s", async key => {
    const params = { ...DEFAULT_CALCULATION_PARAMS, rateAsCoinValue: true, customRates: Object.fromEntries(Object.keys(fusion.shards).map(id => [id, 100])) };
    const data = CalculationService.getInstance().buildData(fusion, rates, params);
    vi.spyOn(CalculationService.prototype, "parseData").mockResolvedValue(data);
    vi.spyOn(CalculationService.prototype, "getDefaultRates").mockReturnValue(rates);
    const result = await InvCalculationService.getInstance().calculateOptimalPath(key, 10, params, new Map());
    expect(result.tree).not.toBeNull();
    expect(result.totalShardsProduced).toBeGreaterThanOrEqual(10);
    expect(result.totalQuantities.size).toBeGreaterThan(0);
    expect(Number.isFinite(result.totalTime)).toBe(true);
  });
  it("keeps every recipe, icon and attribute attached to a valid shard", () => {
    const keys = Object.keys(fusion.shards);
    expect(keys).toHaveLength(322);
    expect(Object.keys(descriptions).sort()).toEqual([...keys].sort());
    expect(new Set(Object.values(revision.upstreamKeyToLocalKey)).size).toBe(keys.length);
    for (const key of keys) {
      expect(readFileSync(`public/shardIcons/${key}.png`).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    for (const [output, groups] of Object.entries(fusion.recipes)) {
      expect(keys).toContain(output);
      for (const [quantity, pairs] of Object.entries(groups as Record<string, string[][]>)) {
        expect(Number(quantity)).toBeGreaterThan(0);
        for (const pair of pairs) {
          expect(pair).toHaveLength(2);
          for (const key of pair) expect(keys).toContain(key);
        }
      }
    }
  });

  it("preserves existing saved attribute keys through upstream ID moves", () => {
    expect(descriptions.R64.id).toBe("chop");
    expect(descriptions.R46.id).toBe("berry_enjoyer");
    expect(descriptions.E29.id).toBe("attack_speed");
    expect(descriptions.E45.id).toBe("freezing_spread");
    expect(descriptions.L48.id).toBe("dominance");
    expect(descriptions.L51.id).toBe("catacombs_graduate");
    expect(fusion.shards.L48.rarity).toBe("epic");
  });

  it("builds calculator data for the new Huntrap shards and Safari critters", () => {
    const data = CalculationService.getInstance().buildData(fusion, rates, DEFAULT_CALCULATION_PARAMS);
    for (const [key, name] of Object.entries({ C44: "Haggard", C47: "Brineling", U71: "Sprawl", R95: "Torrid", E44: "Silkbreeze", E47: "Giant Isopod" })) {
      expect(data.shards[key].name).toBe(name);
      expect(acquisitionMethods(key)).toContain("Traps");
      expect(acquisitionFor(key).join(" ")).toMatch(/Spring (Shallows|Depths)/);
    }
    expect(acquisitionMethods("L60")).toContain("Critter Capsule");
    const wumpa = { ...fusion.shards.L60, id: "L60" };
    const low = estimateAcquisition(wumpa, rates.L60, DEFAULT_CALCULATION_PARAMS);
    const high = estimateAcquisition(wumpa, rates.L60, { ...DEFAULT_CALCULATION_PARAMS, hunterFortune: 1000 });
    expect(high.rate).toBe(low.rate);
    expect(rates.C48).toBeUndefined();
  });
});
