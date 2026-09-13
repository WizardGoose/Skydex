import { describe, expect, it } from "vitest";
import { stageSeconds, totalSeconds } from "../../planner/time";
import { estimate, maxHarvestWindow } from "../adapter";
import { combineCycles, estimateTime, expectedCyclesToFill, fillCycleEstimate, optimalHarvestWindow, plantingOutcome, probabilityDoneWithin, roundsForConfidence, sustainedThroughput } from "../model";
import { atLeastOnce, binomialAtLeast } from "../probability";
import type { PlantingSpec } from "../types";

/**
 * Fixtures are real numbers, not invented ones.
 *
 * Requirements, growth stages and decay come from `public/greenhouse/data.json`.
 * Spot counts are what the greenhouse solver returns for one optimal 10x10
 * plot, captured from `npx tsx tools/solver-plan.ts` on the Rose Dragon plan.
 * Weights come from the staff leak quoted in `constants.ts`.
 */

const STAGE = stageSeconds({ cropGrowth: 0, speedTier: 0, uniqueCrops: 1 });

const spec = (over: Partial<PlantingSpec> = {}): PlantingSpec => ({
  id: "fixture",
  spots: 16,
  spawnChance: 0.25,
  inputStages: 8,
  mutationStages: 0,
  stageSeconds: STAGE,
  attemptsPerPlanting: 1,
  attemptIntervalSeconds: STAGE,
  ...over,
});

describe("the deterministic reduction", () => {
  /**
   * The load-bearing check. With a guaranteed spawn on the first roll there is
   * nothing probabilistic left, so the new model must agree with the shipped
   * one to the second, not approximately but exactly.
   */
  it("reproduces planner/time.ts exactly at p=1 on a single plot", () => {
    for (const [spots, need, inputStages, mutationStages] of [
      [72, 470, 6, 0],
      [16, 552, 8, 8],
      [4, 39, 8, 20],
      [9, 78, 8, 4],
    ]) {
      const s = spec({ spots, inputStages, mutationStages, spawnChance: 1, attemptsPerPlanting: 1 });
      const result = estimateTime(s, { need, plots: 1 });

      const oldPlantings = Math.ceil(need / spots);
      const oldSeconds = totalSeconds(oldPlantings, (inputStages + mutationStages) * STAGE, 1);

      expect(result.expectedRounds).toBe(oldPlantings);
      expect(result.expectedSeconds).toBeCloseTo(oldSeconds, 6);
      expect(result.deterministicPlantings).toBe(oldPlantings);
      expect(result.deterministicSeconds).toBeCloseTo(oldSeconds, 6);
      // With no randomness the distribution collapses to a point.
      expect(result.p50Rounds).toBe(oldPlantings);
      expect(result.p90Rounds).toBe(oldPlantings);
    }
  });

  /**
   * Across several plots the two models legitimately part company, and the new
   * one is the correct of the two. `totalSeconds` divides plantings by plots
   * as a plain fraction, so 10 plantings across 3 plots reads as 3.33 rounds.
   * You cannot run a third of a round: it takes 4, with two plots idle at the
   * end. The new model counts whole rounds and is therefore never optimistic.
   */
  it("discretises parallel plots instead of dividing fractionally", () => {
    const s = spec({ spots: 4, inputStages: 8, mutationStages: 20, spawnChance: 1, attemptsPerPlanting: 1 });
    const result = estimateTime(s, { need: 39, plots: 3 });

    expect(result.deterministicPlantings).toBe(10);
    expect(result.expectedRounds).toBe(4); // ceil(39 / (4 spots x 3 plots))
    expect(result.expectedSeconds).toBeGreaterThan(result.deterministicSeconds);
  });

  /**
   * The eleven zero-stage mutations are the one case where this model refuses
   * to agree with the old one. `plantingSeconds` there is 0 x stage = 0, so
   * the old model calls them instant. A spawn roll only happens on a cycle
   * tick, so the true floor is one cycle.
   */
  it("charges one cycle for a zero-stage mutation the old model calls instant", () => {
    const s = spec({ spots: 100, inputStages: 0, mutationStages: 0, spawnChance: 1, attemptsPerPlanting: 1 });
    const result = estimateTime(s, { need: 280, plots: 1 });

    expect(totalSeconds(Math.ceil(280 / 100), 0 * STAGE, 1)).toBe(0); // the old model
    expect(result.plantingSeconds).toBeCloseTo(STAGE, 6);
    expect(result.expectedSeconds).toBeCloseTo(3 * STAGE, 6);
  });

  it("gives a certain plot no spread at all", () => {
    const result = estimateTime(spec({ spawnChance: 1 }), { need: 100, plots: 1 });
    expect(result.p50Seconds).toBe(result.p90Seconds);
    expect(result.expectedSeconds).toBeCloseTo(result.p90Seconds, 6);
  });
});

describe("small-p behaviour", () => {
  /**
   * One spot, one wanted, one roll per planting: the number of plantings is
   * geometric, so the expectation must converge on 1/p.
   */
  it("converges on 1/p for a single spot and a single unit", () => {
    for (const p of [0.5, 0.25, 0.1, 0.01, 0.001]) {
      const result = estimateTime(spec({ spots: 1, spawnChance: p }), { need: 1, plots: 1 });
      // Rounds are whole, so the sum sits within one round of 1/p.
      expect(result.expectedRounds).toBeGreaterThan(1 / p - 1);
      expect(result.expectedRounds).toBeLessThan(1 / p + 1);
    }
  });

  it("scales inversely: halving the chance roughly doubles the time", () => {
    const fast = estimateTime(spec({ spots: 1, spawnChance: 0.2 }), { need: 1, plots: 1 });
    const slow = estimateTime(spec({ spots: 1, spawnChance: 0.1 }), { need: 1, plots: 1 });
    expect(slow.expectedRounds / fast.expectedRounds).toBeGreaterThan(1.8);
    expect(slow.expectedRounds / fast.expectedRounds).toBeLessThan(2.2);
  });

  it("never claims to be faster than the deterministic model", () => {
    for (const p of [0.05, 0.15, 0.3, 0.6, 0.99]) {
      const result = estimateTime(spec({ spawnChance: p }), { need: 200, plots: 1 });
      expect(result.expectedSeconds).toBeGreaterThanOrEqual(result.deterministicSeconds - 1e-6);
    }
  });
});

describe("the spread", () => {
  it("orders the percentiles", () => {
    const result = estimateTime(spec({ spawnChance: 0.25 }), { need: 300, plots: 1 });
    expect(result.p50Rounds).toBeLessThanOrEqual(result.p90Rounds);
    expect(result.p50Seconds).toBeLessThanOrEqual(result.p90Seconds);
    // A skewed count distribution keeps the mean at or above the median.
    expect(result.expectedRounds).toBeGreaterThan(result.p50Rounds - 1);
  });

  it("actually delivers the confidence it claims", () => {
    const s = spec({ spawnChance: 0.25, spots: 8 });
    const demand = { need: 60, plots: 1 };
    for (const target of [0.5, 0.9, 0.99]) {
      const rounds = roundsForConfidence(s, demand, target);
      expect(probabilityDoneWithin(s, demand, rounds)).toBeGreaterThanOrEqual(target);
      // ...and is the *smallest* such round count.
      if (rounds > 0) expect(probabilityDoneWithin(s, demand, rounds - 1)).toBeLessThan(target);
    }
  });

  it("widens the gap between p50 and p90 as the chance drops", () => {
    const tight = estimateTime(spec({ spawnChance: 0.9 }), { need: 100, plots: 1 });
    const loose = estimateTime(spec({ spawnChance: 0.06 }), { need: 100, plots: 1 });
    expect(loose.p90Rounds - loose.p50Rounds).toBeGreaterThan(tight.p90Rounds - tight.p50Rounds);
  });

  it("is monotone in rounds", () => {
    const s = spec({ spawnChance: 0.2 });
    const demand = { need: 100, plots: 1 };
    let previous = -1;
    for (let r = 0; r < 60; r++) {
      const p = probabilityDoneWithin(s, demand, r);
      expect(p).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = p;
    }
  });
});

describe("the harvest window", () => {
  it("raises yield per planting but saturates", () => {
    const yields = [1, 2, 4, 8, 20].map((w) => plantingOutcome(spec({ spawnChance: 0.3, attemptsPerPlanting: w })).expectedYield);
    for (let i = 1; i < yields.length; i++) expect(yields[i]).toBeGreaterThan(yields[i - 1]);
    // Diminishing returns: the last step gains less than the first.
    expect(yields[4] - yields[3]).toBeLessThan(yields[1] - yields[0]);
  });

  it("finds an interior optimum rather than the extremes", () => {
    const best = optimalHarvestWindow(spec({ spawnChance: 0.3, spots: 72, inputStages: 6 }), { need: 470, plots: 1 }, 18);
    expect(best.window).toBeGreaterThan(1);
    expect(best.window).toBeLessThan(18);
    // Waiting the optimal number of cycles beats harvesting every cycle.
    const eager = estimateTime(spec({ spawnChance: 0.3, spots: 72, inputStages: 6, attemptsPerPlanting: 1 }), { need: 470, plots: 1 });
    expect(best.estimate.expectedSeconds).toBeLessThan(eager.expectedSeconds);
  });

  it("respects the decay ceiling", () => {
    const capped = optimalHarvestWindow(spec({ spawnChance: 0.01 }), { need: 500, plots: 1 }, 5);
    expect(capped.window).toBeLessThanOrEqual(5);
  });
});

describe("decay to window conversion", () => {
  it("turns decay days into cycles and takes the tighter clock", () => {
    // 3 days at a 4h stage is 18 cycles.
    const window = maxHarvestWindow({ id: "choconut", requirements: [], growth_stages: 0, decay: 3 }, [{ growth_stages: 6 }], 14400);
    expect(window).toBe(18);
  });

  it("lets a non-decaying mutation with non-decaying inputs run forever", () => {
    const window = maxHarvestWindow({ id: "all_in_aloe", requirements: [], growth_stages: 27, decay: 0 }, [{ growth_stages: 8 }], 14400);
    expect(window).toBe(Number.POSITIVE_INFINITY);
  });

  it("is bounded by a decaying input, not just the mutation", () => {
    const window = maxHarvestWindow(
      { id: "x", requirements: [], growth_stages: 0, decay: 0 },
      [{ growth_stages: 8, decay: 3 }],
      14400
    );
    expect(window).toBe(18);
  });
});

describe("fixtures from the real dataset", () => {
  /** Choconut: 1x1, weight 30, 2x Cocoa Beans (6 stages), 0 stages, decay 3. */
  it("Choconut is slower than the deterministic model but not absurdly so", () => {
    const result = estimate({
      mutation: { id: "choconut", requirements: [{ crop: "cocoa_beans", count: 2 }], growth_stages: 0, decay: 3 },
      inputs: [{ growth_stages: 6 }],
      spots: 72,
      stageSeconds: STAGE,
      demand: { need: 470, plots: 1 },
    });

    expect(result.spawnChance).toBeCloseTo(0.3, 12);
    expect(result.mechanicOnly).toBe(false);
    expect(result.expectedSeconds).toBeGreaterThan(result.deterministicSeconds);
    // Within a factor of three: the plot fills over several cycles, it does
    // not take ten times as long.
    expect(result.expectedSeconds).toBeLessThan(result.deterministicSeconds * 3);
    expect(result.p90Seconds).toBeGreaterThanOrEqual(result.p50Seconds);
  });

  /** Noctilume: 2x2, weight 25, 9 spots on a full plot, 4 stages, decay 6. */
  it("handles a 2x2 mutation", () => {
    const result = estimate({
      mutation: {
        id: "noctilume",
        requirements: [
          { crop: "duskbloom", count: 6 },
          { crop: "lonelily", count: 6 },
        ],
        growth_stages: 4,
        decay: 6,
      },
      // Duskbloom is itself a mutation: 8 stages and a 3-day decay clock.
      inputs: [{ growth_stages: 8, decay: 3 }, { growth_stages: 0, decay: 3 }],
      spots: 9,
      stageSeconds: STAGE,
      demand: { need: 78, plots: 1 },
    });

    expect(result.spawnChance).toBeCloseTo(0.25, 12);
    // The 3-day Duskbloom clock binds before Noctilume's own 6-day one.
    expect(result.maxWindow).toBe(Math.floor((3 * 86400) / STAGE));
    expect(result.harvestWindow).toBeLessThanOrEqual(result.maxWindow);
    expect(result.expectedSeconds).toBeGreaterThan(result.deterministicSeconds);
  });

  /** Snoozling: 3x3, weight 25, only 4 spots fit a plot, 20 stages, decay 6. */
  it("handles a 3x3 mutation with few spots", () => {
    const result = estimate({
      mutation: {
        id: "snoozling",
        requirements: [
          { crop: "creambloom", count: 4 },
          { crop: "dustgrain", count: 3 },
          { crop: "witherbloom", count: 3 },
          { crop: "duskbloom", count: 3 },
          { crop: "thornshade", count: 3 },
        ],
        growth_stages: 20,
        decay: 6,
      },
      inputs: [
        { growth_stages: 6, decay: 3 },
        { growth_stages: 0, decay: 3 },
        { growth_stages: 0, decay: 3 },
        { growth_stages: 8, decay: 3 },
        { growth_stages: 8, decay: 3 },
      ],
      spots: 4,
      stageSeconds: STAGE,
      demand: { need: 39, plots: 1 },
    });

    expect(result.spawnChance).toBeCloseTo(0.25, 12);
    expect(result.expectedRounds).toBeGreaterThan(Math.ceil(39 / 4));
    // 20 growth stages dominate, so the planting is long whatever the window.
    expect(result.plantingSeconds).toBeGreaterThan(20 * STAGE);
  });

  /** Lonelily: bare soil, no inputs, weight 6, 100 spots on an empty plot. */
  it("handles Lonelily's zero-adjacent, low-chance case", () => {
    const result = estimate({
      mutation: { id: "lonelily", requirements: [], growth_stages: 0, decay: 3 },
      inputs: [],
      spots: 100,
      stageSeconds: STAGE,
      demand: { need: 280, plots: 1 },
    });

    // No requirements means no crop-support scaling: the 6 weight stands.
    expect(result.spawnChance).toBeCloseTo(0.06, 12);
    // Nothing to grow at either end, so time is pure waiting for rolls.
    expect(result.expectedSeconds).toBeGreaterThan(0);
    expect(result.expectedSeconds).toBeGreaterThan(result.deterministicSeconds);
  });

  it("refuses to invent a time for mechanic-only mutations", () => {
    for (const id of ["shellfruit", "jerryflower"]) {
      const result = estimate({
        mutation: { id, requirements: [], growth_stages: 0, decay: 3 },
        inputs: [],
        spots: 1,
        stageSeconds: STAGE,
        demand: { need: 66, plots: 1 },
      });
      expect(result.mechanicOnly).toBe(true);
      expect(result.spawnChance).toBe(0);
    }
  });
});

/**
 * The wait a minimal plot buys, which is what makes it defensible.
 *
 * Sizing a plot to exactly the units wanted is the cheapest possible answer in
 * crops and in placements, and the honest cost of it is cycles. So the cycles
 * have to be a real number out of this model rather than a rule of thumb, and
 * they have to come out of the SAME survival sum `expectedRounds` already uses:
 * a second derivation of the same quantity is the drift this project has paid
 * for before.
 */
describe("expected cycles to fill a plot", () => {
  it("is the survival sum of the model's own two probabilities", () => {
    /*
     * Recomputed here from `atLeastOnce` and `binomialAtLeast` directly, so
     * this fails if the implementation ever grows a distribution of its own
     * rather than extending the one the estimates are priced with.
     */
    const spots = 6;
    const p = 0.25;
    const need = 3;

    let expected = 0;
    for (let w = 0; w < 4000; w++) expected += 1 - binomialAtLeast(spots, atLeastOnce(p, w), need);

    expect(expectedCyclesToFill(spots, p, need)).toBeCloseTo(expected, 6);
  });

  it("agrees with the geometric mean wait when one spot must fill", () => {
    // A single spot is a plain geometric: E[cycles] = 1/p, exactly.
    for (const p of [0.06, 0.2, 0.25, 0.3]) {
      expect(expectedCyclesToFill(1, p, 1)).toBeCloseTo(1 / p, 6);
    }
  });

  it("keeps the exact spread of a one-spot geometric wait", () => {
    const fill = fillCycleEstimate(1, 0.3, 1);

    expect(fill.expectedCycles).toBeCloseTo(1 / 0.3, 8);
    expect(fill.varianceCycles2).toBeCloseTo((1 - 0.3) / (0.3 * 0.3), 8);
    expect(fill.p50Cycles).toBe(2);
    expect(fill.p90Cycles).toBe(7);
    expect(fill.truncated).toBe(false);
  });

  it("gives the reported case about six cycles on two spots, and under two on eight", () => {
    /*
     * THE REPORTED CASE. Two Soggybud at a 25% per spot chance. Two spots is
     * the minimal plot and it fills in about six cycles; the 90% sizing's eight
     * spots fills in under two. Both true, and the difference is the whole
     * content of the choice the page now hands the player.
     */
    expect(expectedCyclesToFill(2, 0.25, 2)).toBeCloseTo(5.714285714, 6);
    expect(expectedCyclesToFill(8, 0.25, 2)).toBeLessThan(2);
  });

  it("falls as spots are added, and never below the last spot's own wait", () => {
    let previous = Number.POSITIVE_INFINITY;
    for (const spots of [2, 3, 5, 8, 16, 40]) {
      const cycles = expectedCyclesToFill(spots, 0.25, 2);
      expect(cycles).toBeLessThan(previous);
      previous = cycles;
      // Even an enormous plot waits for a roll to land at all.
      expect(cycles).toBeGreaterThan(1);
    }
  });

  it("declines rather than guesses when there is nothing to sum", () => {
    // More wanted than the plot can hold: one sowing cannot do it and the
    // re-sow question belongs to the caller, so this says so.
    expect(expectedCyclesToFill(2, 0.25, 3)).toBe(Number.POSITIVE_INFINITY);
    // No roll at all. A mechanic-only mutation has no distribution here.
    expect(expectedCyclesToFill(4, 0, 2)).toBe(Number.POSITIVE_INFINITY);
    // Nothing wanted is no wait, not an infinite one.
    expect(expectedCyclesToFill(4, 0.25, 0)).toBe(0);
  });
});

describe("sustained throughput", () => {
  it("beats the re-sow model, since the crops stay in the ground", () => {
    const s = spec({ spawnChance: 0.3, spots: 72, inputStages: 6, mutationStages: 0 });
    const demand = { need: 470, plots: 1 };
    const pump = sustainedThroughput(s, demand);
    const resow = optimalHarvestWindow(s, demand, 18);
    expect(pump.expectedSeconds).toBeLessThan(resow.estimate.expectedSeconds);
  });

  it("prices a spot at 1/p cycles plus its growth", () => {
    const pump = sustainedThroughput(spec({ spawnChance: 0.25, mutationStages: 4 }), { need: 10, plots: 1 });
    expect(pump.cyclesPerMutationPerSpot).toBeCloseTo(1 / 0.25 + 4, 12);
  });
});

describe("combining cycles", () => {
  const build = (id: string, need: number, spots: number, chance: number) =>
    estimateTime(spec({ id, spots, spawnChance: chance }), { need, plots: 1 });

  it("costs a cycle at its slowest member, not the sum of its members", () => {
    const fast = build("fast", 10, 72, 0.3);
    const slow = build("slow", 900, 4, 0.25);
    const combined = combineCycles([{ index: 0, estimates: [fast, slow] }]);

    expect(combined.expectedSeconds).toBeCloseTo(slow.expectedSeconds, 6);
    expect(combined.expectedSeconds).toBeLessThan(fast.expectedSeconds + slow.expectedSeconds);
    expect(combined.perCycle[0].slowest).toBe("slow");
  });

  it("adds sequential cycles together", () => {
    const a = build("a", 100, 16, 0.25);
    const b = build("b", 100, 16, 0.25);
    const combined = combineCycles([
      { index: 0, estimates: [a] },
      { index: 1, estimates: [b] },
    ]);
    expect(combined.expectedSeconds).toBeCloseTo(a.expectedSeconds + b.expectedSeconds, 6);
  });

  it("keeps the p90 roll-up above the expectation, as an upper bound", () => {
    const combined = combineCycles([{ index: 0, estimates: [build("x", 300, 8, 0.15), build("y", 40, 4, 0.2)] }]);
    // Summing per-mutation p90s assumes everything runs unlucky at once, so it
    // must never come in under the expected case.
    expect(combined.p90SecondsUpperBound).toBeGreaterThanOrEqual(combined.expectedSeconds);
    expect(combined.p90SecondsUpperBound).toBeGreaterThanOrEqual(combined.p50SecondsUpperBound);
  });

  it("handles an empty plan without dividing by anything", () => {
    const combined = combineCycles([]);
    expect(combined.expectedSeconds).toBe(0);
    expect(combined.perCycle).toHaveLength(0);
  });
});

describe("parallel plots", () => {
  it("cuts wall clock roughly in proportion", () => {
    const one = estimateTime(spec({ spawnChance: 0.25 }), { need: 480, plots: 1 });
    const three = estimateTime(spec({ spawnChance: 0.25 }), { need: 480, plots: 3 });
    const ratio = one.expectedSeconds / three.expectedSeconds;
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.5);
  });
});
