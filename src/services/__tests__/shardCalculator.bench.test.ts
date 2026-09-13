import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { CalculationService } from "../calculationService";
import { InvCalculationService } from "../invCalculationService";
import { DataService } from "../dataService";
import type { CalculationParams } from "../../types/types";

afterEach(() => vi.restoreAllMocks());

// Opt-in, public catalogue + synthetic stock only. No account data or network.
it.skipIf(!process.env.SHARD_BENCH)("benchmarks repeated shard plans and fingerprints their complete results", async () => {
  const fusion = JSON.parse(readFileSync("public/fusion-data.json", "utf8"));
  const rates = JSON.parse(readFileSync("public/rates.json", "utf8"));
  vi.spyOn(DataService.getInstance(), "loadFusionData").mockResolvedValue(fusion);
  vi.spyOn(DataService.getInstance(), "loadDefaultRates").mockResolvedValue(rates);
  const params: CalculationParams = {
    customRates: {}, hunterFortune: 122, excludeChameleon: true, noWoodenBait: true,
    frogBonus: false, newtLevel: 0, salamanderLevel: 0, lizardKingLevel: 0,
    leviathanLevel: 0, pythonLevel: 0, kingCobraLevel: 0, seaSerpentLevel: 0,
    tiamatLevel: 0, crocodileLevel: 10, kuudraTier: "none", moneyPerHour: Infinity,
    customKuudraTime: false, kuudraTimeSeconds: null, rateAsCoinValue: false, craftPenalty: 0.8,
  };
  const stages: Record<string, { calls: number; ms: number }> = {};
  for (const method of ["computeMinCosts", "computeExclusivityScores", "buildData"] as const) {
    const original = CalculationService.prototype[method];
    // The wrapper preserves each method's argument/result tuple at runtime.
    vi.spyOn(CalculationService.prototype, method).mockImplementation(function (this: CalculationService, ...args: unknown[]) {
      const start = performance.now();
      try { return Reflect.apply(original, this, args); }
      finally {
        const stage = stages[method] ??= { calls: 0, ms: 0 };
        stage.calls++;
        stage.ms += performance.now() - start;
      }
    });
  }
  const solver = new InvCalculationService();
  const ids = Object.keys(fusion.shards);
  const stock = new Map<string, number>(ids.filter((_, index) => index % 3 === 0).map((id, index) => [id, 7 + index % 6 * 11]));
  const owned = new Map<string, number>(ids.map((id, index) => [id, index % 2 ? 96 : 2]));
  const targets = ["Ananke", "Cascade", "Nessie", "Abyssal Lanternfish"].map(name => ids.find(id => fusion.shards[id].name === name)!);
  const timings: number[] = [];
  const fingerprints: string[] = [];
  for (let run = 0; run < 4; run++) {
    const start = performance.now();
    let inventory = new Map(stock);
    const results = [];
    for (const [index, id] of targets.entries()) {
      const result = await solver.calculateOptimalPath(id, index === 0 ? 22 : 1, params, inventory, [], owned);
      inventory = result.remainingInventory ?? inventory;
      results.push(result);
    }
    timings.push(Math.round(performance.now() - start));
    fingerprints.push(createHash("sha256").update(JSON.stringify(results, (_, value) => value instanceof Map ? [...value] : value)).digest("hex"));
  }
  expect(new Set(fingerprints).size).toBe(1);
  console.log(JSON.stringify({ timings, stages, fingerprints }));
}, 120_000);
