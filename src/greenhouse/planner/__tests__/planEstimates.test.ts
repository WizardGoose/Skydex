import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CropDefinition, MutationDefinition } from "../../types/greenhouse";
import {
  buildPlanEstimates,
  expectedGrowthCyclesLeft,
  fillLabel,
  gateStock,
  harvestWindowLabel,
  hasSpread,
  nodeEstimate,
  planProgress,
  planUnitMaps,
  plantingCount,
  plantingTotals,
  progressPctLabel,
  progressRow,
  rawPlots,
  snapshotRows,
  type EstimateSettings,
  type PlanProgressRow,
} from "../planEstimates";
import type { PlotEconomy, SolverPlan, SolverPlanNode } from "../solverPlan";
import { BASE_CROP_DECAY_DAYS, expectedCyclesToFill } from "../../timeModel";
import { formatDuration, plantingSeconds, stageSeconds, totalSeconds } from "../time";

/**
 * The seam the UI actually reads.
 *
 * `timeModel/__tests__` pins the mathematics. These pin the wiring: that a
 * plan row picks up the right spot count, the right growth stages and the
 * right spawn chance on its way into the model, and that the numbers the
 * Planner and `pnpm check` display come out the far end.
 *
 * The dataset is the real bundled one rather than a fixture, so a dataset
 * change that would move a displayed number fails here instead of silently
 * shipping. Spot counts are what the greenhouse solver returns for one optimal
 * 10x10 plot, captured from `npx tsx tools/solver-plan.ts`.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const raw = JSON.parse(readFileSync(join(ROOT, "public/greenhouse/data.json"), "utf8")) as {
  crops: Record<string, Omit<CropDefinition, "id">>;
  mutations: Record<string, Omit<MutationDefinition, "id">>;
};
const withIds = <T,>(rec: Record<string, T>): Record<string, T & { id: string }> =>
  Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, { ...v, id }]));
const data = { crops: withIds(raw.crops), mutations: withIds(raw.mutations) } as {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
};

/** Solver answers for one full plot, captured from the live solver. */
const ECONOMIES: Record<string, PlotEconomy | null> = {
  choconut: { yield: 72, crops: { cocoa_beans: 26 } },
  snoozling: { yield: 4, crops: { duskbloom: 5, thornshade: 6, dustgrain: 12, witherbloom: 12, creambloom: 10 } },
  lonelily: { yield: 100, crops: {} },
};

const BARE: EstimateSettings = { cropGrowth: 0, speedTier: 0, uniqueCrops: 0, plots: 1 };

const node = (id: string, need: number, plots: number, cycle = 0): SolverPlanNode => ({
  id,
  name: data.mutations[id]?.name ?? id,
  kind: "mutation",
  need,
  have: 0,
  cycle,
  perPlot: ECONOMIES[id]?.yield,
  plots,
});

const est = (id: string, need: number, plots: number, settings: EstimateSettings = BARE) => {
  const result = nodeEstimate(node(id, need, plots), data, ECONOMIES, settings);
  if (!result) throw new Error(`no estimate for ${id}`);
  return result;
};

/** The stage clock the UI would use for this mutation's plot. */
const stageFor = (settings: EstimateSettings = BARE) => stageSeconds(settings);

describe("Choconut, a 1x1 on a 72 spot plot", () => {
  /**
   * Two Cocoa Beans, both of them crops, so the layout supports the whole
   * weight and the chance is the raw 30%. This is the mutation the crop
   * support ambiguity turns on, so it is worth pinning exactly.
   */
  it("carries the full weight through as a 30% per spot chance", () => {
    expect(est("choconut", 470, 7).spawnChance).toBeCloseTo(0.3, 12);
  });

  it("reads the spot count off the solver economy, not the plan row", () => {
    expect(est("choconut", 470, 7).spots).toBe(72);
  });

  /**
   * The correction the whole exercise exists for. The old model assumed every
   * spot yields, so the honest number has to be strictly larger, and by a
   * visible margin rather than a rounding difference.
   */
  it("is slower than the old deterministic estimate", () => {
    const e = est("choconut", 470, 7);
    const old = totalSeconds(7, plantingSeconds("choconut", data, BARE) ?? 0, 1);

    expect(e.deterministicSeconds).toBeCloseTo(old, 6);
    expect(e.expectedSeconds).toBeGreaterThan(old);
  });

  /**
   * 72 spots concentrate the binomial hard, so the whole spread lands inside
   * one planting and the p90 can sit a hair BELOW the expectation - the mean
   * is a real number, the percentile is a whole count of rounds. That is why
   * `hasSpread` exists and why the UI does not quote a bound here.
   */
  it("has a spread narrower than a single planting, so no bound is quoted", () => {
    const e = est("choconut", 470, 7);
    expect(Math.abs(e.p90Seconds - e.expectedSeconds)).toBeLessThan(e.plantingSeconds);
    expect(hasSpread(e.expectedSeconds, e.p90Seconds)).toBe(false);
  });

  /**
   * The actionable half. Rolls land every cycle and the cocoa beans are not
   * consumed when a Choconut spawns, so leaving the planting standing fills
   * more of the plot, until the extra cycles cost more than the extra yield
   * saves. Asserted against a scan rather than a remembered number, because
   * the optimum moves with demand.
   *
   * Note for anyone checking this against the research doc: §6 quotes 5 cycles
   * for Choconut. The curve is flat there - 4 and 5 are within 0.3% - and the
   * optimiser takes the true minimum, which is 4 at this demand.
   */
  it("picks the window that genuinely finishes soonest", () => {
    const e = est("choconut", 470, 7);
    expect(e.harvestWindow).toBe(4);
    expect(e.harvestWindow).toBeLessThanOrEqual(e.maxWindow);

    const at = (w: number) => nodeEstimate(node("choconut", 470, 7), data, ECONOMIES, BARE, 0, w)!.expectedSeconds;
    for (let w = 1; w <= 12; w++) {
      if (w !== e.harvestWindow) expect(at(w)).toBeGreaterThanOrEqual(e.expectedSeconds);
    }
  });

  /** Harvesting every single cycle is the trap the window guidance exists for. */
  it("is far slower if you harvest every cycle instead", () => {
    const best = est("choconut", 470, 7);
    const eager = nodeEstimate(node("choconut", 470, 7), data, ECONOMIES, BARE, 0, 1)!;
    expect(eager.expectedSeconds / best.expectedSeconds).toBeGreaterThan(1.5);
  });
});

describe("Snoozling, a 3x3 on a 4 spot plot", () => {
  /** Five mutation inputs, all of them crops, so the full 25% weight applies. */
  it("supports the full weight from five mutation inputs", () => {
    expect(est("snoozling", 6, 2).spawnChance).toBeCloseTo(0.25, 12);
  });

  it("takes the four spots a 3x3 leaves on a full plot", () => {
    expect(est("snoozling", 6, 2).spots).toBe(4);
  });

  /**
   * A 3x3 waits on the slowest of its inputs and then on its own 20 growth
   * stages, so one planting is far longer than a single cycle. This is the
   * check that input stages are being fed in at all: drop them and the
   * planting collapses to the mutation's own growth.
   */
  it("waits for the slowest input before its own twenty stages", () => {
    const e = est("snoozling", 6, 2);
    const stage = stageFor();
    const inputStages = Math.max(
      ...data.mutations.snoozling.requirements.map((r) => data.mutations[r.crop]?.growth_stages ?? data.crops[r.crop]?.growth_stages ?? 0)
    );

    // One planting: inputs mature, the roll window runs, then it grows.
    expect(e.plantingSeconds).toBeCloseTo((inputStages + (e.harvestWindow - 1) + 20) * stage, 6);
    expect(inputStages).toBeGreaterThan(0);
  });

  /** Its inputs are mutations and they rot, so the window has a hard ceiling. */
  it("cannot be left standing longer than its inputs survive", () => {
    const e = est("snoozling", 6, 2);
    expect(Number.isFinite(e.maxWindow)).toBe(true);
    expect(e.harvestWindow).toBeLessThanOrEqual(e.maxWindow);
  });
});

describe("Lonelily, zero growth stages", () => {
  /**
   * The live bug. Lonelily has 0 growth stages and needs no adjacent crops, so
   * the old model multiplied out to zero seconds and the UI printed "instant"
   * next to it. A spawn only rolls on the cycle tick, so a planting can never
   * span less than one cycle, however fast the thing grows once it appears.
   */
  it("used to read as instant under the old model", () => {
    expect(plantingSeconds("lonelily", data, { ...BARE, uniqueCrops: 0 })).toBe(0);
    expect(formatDuration(0)).toBe("instant");
  });

  it("is floored at exactly one growth cycle", () => {
    const e = est("lonelily", 100, 1);
    expect(e.plantingSeconds).toBeCloseTo(stageFor(), 6);
  });

  it("never renders as instant anywhere the UI would show it", () => {
    const e = est("lonelily", 100, 1);
    expect(e.expectedSeconds).toBeGreaterThan(0);
    expect(e.expectedSecondsLeft).toBeGreaterThan(0);
    expect(formatDuration(e.expectedSeconds)).not.toBe("instant");
    expect(formatDuration(e.expectedSecondsLeft)).not.toBe("instant");
    expect(formatDuration(e.plantingSeconds)).not.toBe("instant");
  });

  /** Weight 6 and no crops to scale it, so the chance is the weight itself. */
  it("rolls at its bare 6% weight", () => {
    expect(est("lonelily", 100, 1).spawnChance).toBeCloseTo(0.06, 12);
  });
});

describe("spawn timing and mutation maturation stay separate", () => {
  it("treats Veilshroom as ready after its spawn roll, not as a zero-second spawn", () => {
    const result = est("veilshroom", 1, 1);

    expect(result.breakdown.mutationStages).toBe(0);
    expect(result.breakdown.rollStages).toBeGreaterThanOrEqual(1);
    expect(result.plantingSeconds).toBeGreaterThan(0);
    expect(result.completionMode).toBe("single-sowing");
    expect(result.breakdown.cyclesToFill).toBeCloseTo(1 / result.spawnChance, 8);
    expect(result.breakdown.p90CyclesToFill).toBe(7);
    // The job ends when its first successful roll lands. It is not charged for
    // the unused tail of the optimiser's fixed harvest window.
    expect(result.expectedSeconds).toBeCloseTo(
      (result.breakdown.inputStages - 1 + result.breakdown.cyclesToFill) * result.breakdown.stageSeconds,
      6,
    );
  });

  it("keeps Magic Jellybean's full 120-stage maturation after it appears", () => {
    const result = est("magic_jellybean", 1, 1);

    expect(result.breakdown.mutationStages).toBe(120);
    expect(result.plantingSeconds).toBeGreaterThanOrEqual(120 * result.breakdown.stageSeconds);
  });
});

describe("base crop expiry through the planner path", () => {
  it("caps a non-decaying mutation field at the base crop's 72-hour window", () => {
    const fixture = {
      ...data,
      mutations: {
        ...data.mutations,
        magic_jellybean: {
          ...data.mutations.magic_jellybean,
          requirements: [{ crop: "sugar_cane", count: 5 }],
        },
      },
    };
    const economies = { magic_jellybean: { yield: 1, crops: { sugar_cane: 5 } } };
    const result = nodeEstimate(node("magic_jellybean", 1, 1), fixture, economies, BARE);

    expect(result).not.toBeNull();
    expect(result!.maxWindow).toBe(
      Math.floor((BASE_CROP_DECAY_DAYS.value * 86400) / result!.breakdown.stageSeconds),
    );
  });
});

describe("Bioanalysis through the planner path", () => {
  const chance = (bioanalysis: EstimateSettings["bioanalysis"]) => est("choconut", 470, 7, { ...BARE, bioanalysis }).spawnChance;

  /**
   * Staff proved the buff multiplies rather than adding points: 15% becomes
   * 17.25% with the Artifact, and 15 x 1.15 = 17.25 exactly. The planner has
   * to carry that through the settings rather than re-deriving it.
   */
  it("multiplies the spawn chance rather than adding percentage points", () => {
    const base = chance("none");
    expect(base).toBeCloseTo(0.3, 12);
    expect(chance("talisman")).toBeCloseTo(base * 1.05, 12);
    expect(chance("ring")).toBeCloseTo(base * 1.1, 12);
    expect(chance("artifact")).toBeCloseTo(base * 1.15, 12);
  });

  it("reproduces the staff worked example on Ashwreath", () => {
    // Two Nether Wart and two Fire; Fire is not a crop, so half the weight is
    // unsupported and 30% becomes 15%. With the Artifact, 17.25%.
    const bare = nodeEstimate(node("ashwreath", 696, 10), data, {}, BARE);
    const buffed = nodeEstimate(node("ashwreath", 696, 10), data, {}, { ...BARE, bioanalysis: "artifact" });

    expect(bare?.spawnChance).toBeCloseTo(0.15, 12);
    expect(buffed?.spawnChance).toBeCloseTo(0.1725, 12);
  });

  it("never makes the grind slower", () => {
    const none = est("choconut", 470, 7, BARE);
    const artifact = est("choconut", 470, 7, { ...BARE, bioanalysis: "artifact" });
    expect(artifact.expectedSeconds).toBeLessThanOrEqual(none.expectedSeconds);
  });
});

describe("mutations that never roll a spawn", () => {
  /**
   * Shellfruit has a weight of 0: it only exists through the Blastberry
   * explosion mechanic, so there is no chance to cost and the flat number the
   * model falls back to is not an estimate of anything. It is flagged rather
   * than dressed up, and the UI prints "mechanic" instead of a duration.
   */
  it("are flagged rather than given a time that looks real", () => {
    const e = nodeEstimate(node("shellfruit", 66, 66), data, {}, BARE);
    expect(e?.mechanicOnly).toBe(true);
    expect(e?.spawnChance).toBe(0);
  });

  it("does not flag a mutation that does roll", () => {
    expect(est("choconut", 470, 7).mechanicOnly).toBe(false);
    expect(est("lonelily", 100, 1).mechanicOnly).toBe(false);
  });
});

describe("harvest window wording", () => {
  /** The legendaries at the end of a plan all land on a window of one. */
  it("says every cycle rather than every 1 cycles", () => {
    expect(harvestWindowLabel(1)).toBe("every cycle");
    expect(harvestWindowLabel(2)).toBe("every 2 cycles");
    expect(harvestWindowLabel(15)).toBe("every 15 cycles");
  });

  it("covers the windows the real plan actually produces", () => {
    for (const [id, need, plots] of [
      ["timestalk", 1, 1],
      ["choconut", 2624, 37],
      ["snoozling", 39, 10],
    ] as const) {
      const e = nodeEstimate(node(id, need, plots), data, ECONOMIES, BARE);
      expect(harvestWindowLabel(e!.harvestWindow)).not.toContain("1 cycles");
    }
  });
});

/**
 * The sentence that makes a minimal plot read as informative, not stingy.
 *
 * The default sizes a plot to exactly the units wanted, which is the cheapest
 * answer in crops and in placements, and the honest cost of it is cycles. The
 * breakdown line is where that cost is said out loud instead of being left for
 * the player to discover, so it is worth pinning as a string.
 */
describe("the fill line", () => {
  /** A breakdown as the UI would hold it, with only the fields this reads. */
  const bill = (spots: number, cyclesToFill: number) => ({
    inputStages: 0,
    inputName: null,
    rollStages: 0,
    mutationStages: 0,
    totalStages: 0,
    stageSeconds: 0,
    spots,
    cyclesToFill,
  });

  it("says what the reported case actually is", () => {
    // Two Soggybud, two spots, a 25% per spot chance: 5.71 cycles, rounded.
    expect(fillLabel(bill(2, expectedCyclesToFill(2, 0.25, 2)))).toBe("2 spawn spots · about 6 growth cycles for both to fill");
  });

  it("says the other half of the choice too", () => {
    // The 90% sizing, which is what the control buys.
    expect(fillLabel(bill(8, expectedCyclesToFill(8, 0.25, 2)))).toBe("8 spawn spots · about 1 growth cycle to fill them");
  });

  it("agrees with itself on one spot", () => {
    expect(fillLabel(bill(1, 4))).toBe("1 spawn spot · about 4 growth cycles to fill it");
  });

  it("never reads as instant, because a roll only lands on the tick", () => {
    // A fraction of a cycle is still a cycle of waiting, and "about 0 cycles"
    // beside a real duration would look like a bug rather than a number.
    expect(fillLabel(bill(40, 0.4))).toBe("40 spawn spots · about 1 growth cycle to fill them");
  });

  it("declines rather than fabricating a clause", () => {
    // A demand no single sowing can fill has no "fill" to expect, and a
    // mutation that never rolls has no distribution behind one.
    expect(fillLabel(bill(2, Number.POSITIVE_INFINITY))).toBeNull();
    expect(fillLabel(bill(0, 3))).toBeNull();
    expect(fillLabel(bill(2, 0))).toBeNull();
  });

  it("is the number the estimate itself computed, on the plot it was sized to", () => {
    /*
     * Read off a real estimate rather than a hand-built breakdown, so the line
     * cannot drift away from the spot count the plot was actually costed at.
     */
    const e = est("choconut", 2624, 37);
    expect(e.breakdown.spots).toBe(e.spots);
    expect(e.breakdown.cyclesToFill).toBe(expectedCyclesToFill(e.spots, e.spawnChance, 2624));
  });
});

describe("the field cycle headline", () => {
  it("keeps a finite cycle count when the request needs more than one sowing", () => {
    const estimate = est("choconut", 181, 3);

    expect(estimate.breakdown.cyclesToFill).toBe(Number.POSITIVE_INFINITY);
    expect(expectedGrowthCyclesLeft(estimate)).toBe(
      Math.round(estimate.expectedSecondsLeft / estimate.breakdown.stageSeconds),
    );
    expect(expectedGrowthCyclesLeft(estimate)).toBeGreaterThan(0);
  });

  it("does not invent a value without a usable clock", () => {
    expect(expectedGrowthCyclesLeft(null)).toBeNull();
    expect(expectedGrowthCyclesLeft({
      expectedSecondsLeft: 100,
      breakdown: {
        inputStages: 0,
        inputName: null,
        rollStages: 0,
        mutationStages: 0,
        totalStages: 0,
        stageSeconds: 0,
        spots: 1,
        cyclesToFill: 1,
      },
    })).toBeNull();
  });
});

describe("rollups", () => {
  const plan: SolverPlan = {
    cycles: [
      { index: 0, produce: [node("choconut", 470, 7, 0), node("lonelily", 100, 1, 0)] },
      { index: 1, produce: [node("snoozling", 6, 2, 1)] },
    ],
    baseCrops: [], placed: [],
    manual: [],
    unknown: [],
    pending: [],
    totalPlantings: 10,
    depth: 2,
  };

  /**
   * Cycles sum rather than take their slowest member. You sow one mutation at
   * a time and the `plots` setting is already spent inside each row's own
   * estimate, so a maximum would assume plots you do not have.
   */
  it("sums rows into cycles and cycles into the total", () => {
    const e = buildPlanEstimates(plan, data, ECONOMIES, BARE);

    expect(e.cycles[0].expectedSeconds).toBeCloseTo(e.byId.choconut.expectedSeconds + e.byId.lonelily.expectedSeconds, 6);
    expect(e.cycles[1].expectedSeconds).toBeCloseTo(e.byId.snoozling.expectedSeconds, 6);
    expect(e.total.expectedSeconds).toBeCloseTo(e.cycles[0].expectedSeconds + e.cycles[1].expectedSeconds, 6);
  });

  /**
   * The p90 rollups are JOINT, not summed. Summing per-row p90s prices every
   * mutation running unlucky at once and quotes the coincidence under a "90%"
   * label - a construction rightly disbelieved on sight.
   * (The sum was not even a safe bound: on THIS fixture the rows are so tight
   * that each p90 sits at its own mean, and the summed figure lands BELOW the
   * true joint quantile. Wrong in both directions, depending on the plan.)
   *
   * What IS a theorem, and what this pins: the joint figure never sits below
   * the expected total, never below any single row's own exact p90 (a sum of
   * nonnegatives dominates each member pointwise), and is exactly the
   * mean-plus-spread construction over the rows' summed variances.
   */
  it("quotes a joint p90: mean plus combined spread, floored by every member", () => {
    const e = buildPlanEstimates(plan, data, ECONOMIES, BARE);

    const rows = [e.byId.choconut, e.byId.lonelily, e.byId.snoozling];
    const maxRow = Math.max(...rows.map((r) => r.p90Seconds));
    const variance = rows.reduce((s, r) => s + r.varianceSeconds2, 0);
    const normal = e.total.expectedSeconds + 1.2815515655446004 * Math.sqrt(variance);

    expect(e.total.p90Seconds).toBeGreaterThanOrEqual(e.total.expectedSeconds);
    expect(e.total.p90Seconds).toBeGreaterThanOrEqual(maxRow);
    expect(e.total.p90Seconds).toBeCloseTo(Math.max(e.total.expectedSeconds, maxRow, normal), 6);

    // A single-row cycle passes its row's EXACT p90 through untouched: the
    // normal approximation is for sums, and one row already has its answer.
    expect(e.cycles[1].p90Seconds).toBeCloseTo(e.byId.snoozling.p90Seconds, 6);
  });

  /** With nothing ticked off, "left" is the whole job. */
  it("starts with everything still ahead of you", () => {
    const e = buildPlanEstimates(plan, data, ECONOMIES, BARE);
    expect(e.total.expectedSecondsLeft).toBeCloseTo(e.total.expectedSeconds, 6);
  });

  /**
   * Progress is counted in plantings against the plan's planting count, which
   * is exactly what the progress bars show, so the time has to discount by the
   * same fraction or the two disagree on screen.
   */
  it("discounts finished plantings in the same proportion the bars do", () => {
    const e = buildPlanEstimates(plan, data, ECONOMIES, BARE, { choconut: 7, snoozling: 1 });

    expect(e.byId.choconut.expectedSecondsLeft).toBe(0);
    expect(e.byId.snoozling.expectedSecondsLeft).toBeCloseTo(e.byId.snoozling.expectedSeconds / 2, 6);
    expect(e.byId.lonelily.expectedSecondsLeft).toBeCloseTo(e.byId.lonelily.expectedSeconds, 6);
  });

  it("ignores rows the solver has not answered for yet", () => {
    const unsolved: SolverPlanNode = { id: "choconut", name: "Choconut", kind: "mutation", need: 5, have: 0, cycle: 0 };
    const e = buildPlanEstimates({ ...plan, cycles: [{ index: 0, produce: [unsolved] }] }, data, {}, BARE);

    expect(e.byId.choconut).toBeUndefined();
    expect(e.total.expectedSeconds).toBe(0);
  });

  /** More plots is fewer sequential rounds, never more. */
  it("gets faster with more plots running", () => {
    const one = buildPlanEstimates(plan, data, ECONOMIES, BARE);
    const three = buildPlanEstimates(plan, data, ECONOMIES, { ...BARE, plots: 3 });
    expect(three.total.expectedSeconds).toBeLessThan(one.total.expectedSeconds);
  });
});

/* =========================================================================
   Unit-weighted progress
   -------------------------------------------------------------------------
   The bug: the site read "0%" at a player holding 429 mutations, because
   progress only ever counted plantings ticked off. These pin the two rules
   that fix it and must not be allowed to drift - unit weighting, and the
   per-item clamp - plus the real reported numbers, so a regression surfaces as
   a recognisable figure rather than as an abstraction.
   ========================================================================= */

describe("progress is weighted by units, not by rows", () => {
  /**
   * The failure a row-weighted average produces: finishing a twelve unit row
   * and touching nothing else would read as half the plan done. Units say what
   * it actually is, which is under one percent.
   */
  it("does not let a tiny row count as much as a huge one", () => {
    const rows: PlanProgressRow[] = [
      { id: "big", wanted: 2624, need: 2624 },
      { id: "small", wanted: 12, need: 0 },
    ];

    const p = planProgress(rows, { small: 12 });

    expect(p.wantedUnits).toBe(2636);
    expect(p.ownedUnits).toBe(12);
    expect(p.pct).toBeCloseTo((12 / 2636) * 100, 10);
    // The row-weighted reading of the same state, which is what it must not be.
    expect(p.pct).toBeLessThan(50);
  });

  it("counts the huge row for what it is worth", () => {
    const rows: PlanProgressRow[] = [
      { id: "big", wanted: 2624, need: 1312 },
      { id: "small", wanted: 12, need: 12 },
    ];

    expect(planProgress(rows, { big: 1312 }).pct).toBeCloseTo((1312 / 2636) * 100, 10);
  });
});

describe("owning more than the plan asks for", () => {
  /**
   * The clamp, stated as plainly as it can be. Owning 5,000 of something the
   * plan needs 100 of is worth 100 towards the plan. Without this, one row of
   * overflowing stock reads as a finished grind, which is the same class of
   * lie as the 0% and no more useful.
   */
  it("contributes min(owned, wanted) and not a unit more", () => {
    const rows: PlanProgressRow[] = [
      { id: "overflowing", wanted: 100, need: 0 },
      { id: "untouched", wanted: 900, need: 900 },
    ];

    const p = planProgress(rows, { overflowing: 5000 });

    expect(p.ownedUnits).toBe(100);
    expect(p.wantedUnits).toBe(1000);
    expect(p.pct).toBeCloseTo(10, 10);
  });

  it("cannot push the whole plan past 100%", () => {
    const p = planProgress([{ id: "overflowing", wanted: 100, need: 0 }], { overflowing: 5000 });

    expect(p.ownedUnits).toBe(100);
    expect(p.pct).toBe(100);
  });

  /** The clamp holds through a plan node the solver already discounted. */
  it("holds through progressRow, where need is already zero", () => {
    const row = progressRow({ id: "choconut", need: 0, have: 5000, rawNeed: 100, perPlot: 72, plots: 0 });

    expect(row.wanted).toBe(100);
    expect(planProgress([row], { choconut: 5000 }).ownedUnits).toBe(100);
  });
});

describe("harvested plantings become units", () => {
  const row: PlanProgressRow = { id: "choconut", wanted: 2624, need: 2379, perPlot: 72, plots: 34 };

  it("credits one planting with one plot's yield", () => {
    const p = planProgress([row], { choconut: 245 }, { choconut: 1 });
    expect(p.harvestedUnits).toBe(72);
    expect(p.ownedUnits).toBe(245);
  });

  /**
   * `plots` is `ceil(need / yield)`, so the last planting is usually partial.
   * Crediting a full plot for it would claim units that do not exist, and on a
   * finished row would carry the total past what the plan ever wanted.
   */
  it("never credits more than the row still needs", () => {
    const p = planProgress([row], { choconut: 245 }, { choconut: 34 });

    expect(34 * 72).toBeGreaterThan(2379); // the rounded-up final planting
    expect(p.harvestedUnits).toBe(2379);
    expect(p.ownedUnits + p.harvestedUnits).toBe(2624);
    expect(p.pct).toBe(100);
  });

  it("ignores plantings ticked off beyond the plan", () => {
    expect(planProgress([row], { choconut: 245 }, { choconut: 9999 }).harvestedUnits).toBe(2379);
  });

  /** No solver answer means no yield, so an even share is the honest reading. */
  it("falls back to an even share when the yield is unknown", () => {
    expect(planProgress([{ id: "x", wanted: 100, need: 100, plots: 4 }], {}, { x: 1 }).harvestedUnits).toBe(25);
    expect(planProgress([{ id: "x", wanted: 100, need: 100 }], {}, { x: 1 }).harvestedUnits).toBe(0);
  });
});

describe("progress on nothing", () => {
  it("returns zero rather than dividing by zero", () => {
    for (const rows of [[], [{ id: "a", wanted: 0, need: 0 }]] as PlanProgressRow[][]) {
      const p = planProgress(rows, { a: 500 });
      expect(p.wantedUnits).toBe(0);
      expect(p.pct).toBe(0);
      expect(Number.isNaN(p.pct)).toBe(false);
    }
  });

  it("treats nonsense quantities as none", () => {
    const p = planProgress([{ id: "a", wanted: Number.NaN, need: -5 }], { a: Number.POSITIVE_INFINITY });
    expect(p).toEqual({ ownedUnits: 0, harvestedUnits: 0, wantedUnits: 0, pct: 0 });
  });
});

describe("the reported island state", () => {
  /**
   * Taken from a real island snapshot, run through the real owned pipeline
   * against the cached solver economies: 429 mutations across three kinds,
   * against a Rose Dragon Pet plan wanting 11,634 units in total. The site
   * showed 0%.
   *
   * `the_rest` stands in for the 34 rows the snapshot owns none of, at their
   * real combined size, so the denominator is real rather than a round number.
   */
  const HIS_ROWS: PlanProgressRow[] = [
    { id: "choconut", wanted: 2624, need: 2379, perPlot: 72, plots: 34 },
    { id: "gloomgourd", wanted: 702, need: 596, perPlot: 72, plots: 9 },
    { id: "lonelily", wanted: 280, need: 202, perPlot: 100, plots: 3 },
    { id: "the_rest", wanted: 8028, need: 8028, perPlot: 16, plots: 502 },
  ];
  const HIS_STOCK = { choconut: 245, gloomgourd: 106, lonelily: 78 };

  it("reads roughly 3%, not 0%", () => {
    const p = planProgress(HIS_ROWS, HIS_STOCK);

    expect(p.ownedUnits).toBe(429);
    expect(p.wantedUnits).toBe(11634);
    expect(p.pct).toBeCloseTo(3.687, 3);
    expect(progressPctLabel(p.pct)).toBe("3.7");
  });

  /** The pale pre-fill the two-tone bar draws on the Choconut row. */
  it("puts Choconut at about 9% before any planting is finished", () => {
    expect(planProgress([HIS_ROWS[0]], HIS_STOCK).pct).toBeCloseTo(9.34, 2);
  });

  it("moves when a planting is finished", () => {
    const before = planProgress(HIS_ROWS, HIS_STOCK);
    const after = planProgress(HIS_ROWS, HIS_STOCK, { choconut: 1 });

    expect(after.harvestedUnits).toBe(72);
    expect(after.pct).toBeGreaterThan(before.pct);
  });
});

describe("a plan node as a progress row", () => {
  /**
   * The ledger prints `needSplit`, and progress reads the same figures through
   * it, so a bar and the line of text beside it cannot disagree about the row
   * they are both describing.
   */
  it("takes the pre-discount total the ledger row shows", () => {
    const row = progressRow({ id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 });
    expect(row).toEqual({ id: "choconut", wanted: 2624, need: 2379, perPlot: 72, plots: 34 });
  });

  it("wants the whole thing when no discount happened", () => {
    const row = progressRow({ id: "veilshroom", need: 621, have: 0, perPlot: 72, plots: 9 });
    expect(row.wanted).toBe(621);
    expect(planProgress([row], {}).ownedUnits).toBe(0);
  });

  /** The row's own figures stand when the caller has no owned lookup to offer. */
  it("credits the discount without an owned lookup", () => {
    const row = progressRow({ id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 });
    expect(planProgress([row]).ownedUnits).toBe(245);
  });
});

describe("percentages a person can read", () => {
  /** The whole point: a real 3.7% must never round down to the old 0%. */
  it("keeps a decimal below ten and drops it above", () => {
    expect(progressPctLabel(3.68746776689015)).toBe("3.7");
    expect(progressPctLabel(9.34)).toBe("9.3");
    expect(progressPctLabel(63.4)).toBe("63");
    expect(progressPctLabel(0)).toBe("0");
    expect(progressPctLabel(100)).toBe("100");
  });

  it("says so rather than printing zero for a tiny real figure", () => {
    expect(progressPctLabel(0.02)).toBe("<0.1");
  });
});

/* =========================================================================
   Unit demand on the snapshot
   -------------------------------------------------------------------------
   The Planner is the only thing that knows how many UNITS a plan wants, and
   the Dashboard cannot re-derive it without a solver call per mutation. These
   pin the producer half of that contract: what a snapshot written today
   carries, and what a snapshot written before it existed still does.
   ========================================================================= */

describe("the unit maps a snapshot carries", () => {
  const ROWS: PlanProgressRow[] = [
    { id: "choconut", wanted: 2624, need: 2379, perPlot: 72, plots: 34 },
    { id: "gloomgourd", wanted: 702, need: 596, perPlot: 72, plots: 9 },
    { id: "timestalk", wanted: 1, need: 1, perPlot: 16, plots: 1 },
  ];

  it("writes all three maps, keyed alike, for a plan written today", () => {
    const maps = planUnitMaps(ROWS);

    expect(maps).not.toBeNull();
    expect(Object.keys(maps!)).toEqual(["wantedOf", "needOf", "perPlotOf"]);
    for (const map of [maps!.wantedOf, maps!.needOf, maps!.perPlotOf]) {
      expect(Object.keys(map).sort()).toEqual(["choconut", "gloomgourd", "timestalk"]);
    }
    expect(maps!.wantedOf.choconut).toBe(2624);
    expect(maps!.needOf.choconut).toBe(2379);
    expect(maps!.perPlotOf.choconut).toBe(72);
  });

  /**
   * A reader hands these straight back to `planProgress`, so a round trip has
   * to reproduce the Planner's own figure exactly rather than approximately.
   */
  it("round trips back to the same percentage the Planner shows", () => {
    const maps = planUnitMaps(ROWS)!;
    const rebuilt: PlanProgressRow[] = Object.keys(maps.wantedOf).map((id) => ({
      id,
      wanted: maps.wantedOf[id],
      need: maps.needOf[id],
      perPlot: maps.perPlotOf[id],
      plots: ROWS.find((r) => r.id === id)!.plots,
    }));

    const stock = { choconut: 245, gloomgourd: 106 };
    expect(planProgress(rebuilt, stock).pct).toBeCloseTo(planProgress(ROWS, stock).pct, 12);
  });

  /**
   * All three or none. A row with no solver yield cannot state units, and a map
   * that covered every other row would still be trusted as complete by a reader
   * and quietly swallow the one it left out.
   */
  it("writes nothing at all when a single row cannot state its units", () => {
    expect(planUnitMaps([...ROWS, { id: "unsolved", wanted: 500, need: 500, plots: 4 }])).toBeNull();
    expect(planUnitMaps([...ROWS, { id: "noyield", wanted: 500, need: 500, perPlot: 0, plots: 4 }])).toBeNull();
    expect(planUnitMaps([...ROWS, { id: "nowant", wanted: 0, need: 0, perPlot: 16, plots: 0 }])).toBeNull();
    expect(planUnitMaps([])).toBeNull();
  });

  it("keeps a zero need, which is a real answer and not an absent one", () => {
    const maps = planUnitMaps([{ id: "covered", wanted: 100, need: 0, perPlot: 16, plots: 0 }]);
    expect(maps!.needOf.covered).toBe(0);
  });
});

describe("a snapshot written before unit demand existed", () => {
  /**
   * The reader's fallback: one planting counts as one unit, `need` equal to
   * `wanted`, so a plan with no unit figures still weights and still renders.
   */
  const fallbackRows = (plots: Record<string, number>): PlanProgressRow[] =>
    Object.entries(plots).map(([id, n]) => ({ id, wanted: n, need: n, perPlot: 1, plots: n }));

  const PLOTS = { choconut: 34, gloomgourd: 9, timestalk: 1 };

  it("still reads as the planting-weighted figure it always did", () => {
    const p = planProgress(fallbackRows(PLOTS), {}, { choconut: 17 });

    expect(p.wantedUnits).toBe(44);
    expect(p.harvestedUnits).toBe(17);
    expect(p.pct).toBeCloseTo((17 / 44) * 100, 12);
  });

  /**
   * Where the protection actually lives, pinned because it is easy to get
   * wrong: a row measured in PLANTINGS must never have an ITEM count credited
   * against it, or 245 Choconut covers a 34 planting row outright, which is the
   * same lie as the 0% only flattering.
   *
   * `planProgress` cannot detect that on its own - a row does not say what unit
   * its `wanted` is in - so the caller withholds the stock instead, by
   * returning undefined for any id whose demand is not stated in units. These
   * two cases are the difference between doing that and forgetting to.
   */
  it("credits no stock when the caller withholds it for a plantings row", () => {
    const stockOf = () => undefined; // what a reader passes for a non-unit row
    const p = planProgress(fallbackRows(PLOTS), stockOf);

    expect(p.ownedUnits).toBe(0);
    expect(p.pct).toBe(0);
  });

  it("would over-credit if a caller measured items against plantings", () => {
    // Not an endorsement. This is the failure the withholding prevents, kept
    // here so anyone tempted to simplify the caller can see what it costs.
    const p = planProgress(fallbackRows(PLOTS), { choconut: 245, gloomgourd: 106 });

    expect(p.ownedUnits).toBe(43); // 34 plantings plus 9, both clamped
    expect(p.pct).toBeGreaterThan(90);
  });

  /** And with real units present the same stock is credited honestly. */
  it("credits the stock properly once units are there", () => {
    const withUnits: PlanProgressRow[] = [
      { id: "choconut", wanted: 2624, need: 2379, perPlot: 72, plots: 34 },
      { id: "gloomgourd", wanted: 702, need: 596, perPlot: 72, plots: 9 },
      { id: "timestalk", wanted: 1, need: 1, perPlot: 16, plots: 1 },
    ];
    const p = planProgress(withUnits, { choconut: 245, gloomgourd: 106 });

    expect(p.ownedUnits).toBe(351);
    expect(p.pct).toBeCloseTo((351 / 3327) * 100, 12);
  });
});

/* =========================================================================
   One plan, one set of rows, two pages
   -------------------------------------------------------------------------
   The bug: the Planner read DONE 3.7% and the Dashboard read 3.8% for one
   state. Not rounding - both format through `progressPctLabel` - but two
   constructions of what was meant to be one set of rows, the Planner from the
   live solver plan and the Dashboard from the persisted snapshot.

   These assert on the NUMBERS. A divergence smaller than one rounding step
   still has to fail, because a divergence that only shows up sometimes is
   worse than one that always does.
   ========================================================================= */

describe("the Dashboard reproduces the Planner exactly", () => {
  /** The real plan, four of its rows, as `progressRow` emits them. */
  const LIVE = [
    { id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 },
    { id: "gloomgourd", need: 596, have: 106, rawNeed: 702, perPlot: 72, plots: 9 },
    { id: "lonelily", need: 202, have: 78, rawNeed: 280, perPlot: 100, plots: 3 },
    { id: "veilshroom", need: 621, have: 0, perPlot: 72, plots: 9 },
  ];

  /** What the Planner renders. */
  const plannerRows = LIVE.map(progressRow);

  /** What the Dashboard renders, out of the snapshot the Planner writes. */
  const written = planUnitMaps(plannerRows)!;
  const plots = Object.fromEntries(LIVE.map((n) => [n.id, n.plots]));
  const dash = snapshotRows({ plots, ...written });

  /** Everything held, including a mutation the plan never asks for. */
  const STOCK: Record<string, number> = { choconut: 245, gloomgourd: 106, lonelily: 78, do_not_eat_shroom: 17 };

  it("hands both pages the identical row for every id", () => {
    expect(dash.rows).toHaveLength(plannerRows.length);
    for (const mine of plannerRows) {
      const theirs = dash.byId[mine.id];
      expect(theirs).toBeDefined();
      expect(theirs.wanted).toBe(mine.wanted);
      expect(theirs.need).toBe(mine.need);
      expect(theirs.perPlot).toBe(mine.perPlot);
      expect(theirs.plots).toBe(mine.plots);
      expect(rawPlots(theirs)).toBe(rawPlots(mine));
    }
  });

  /**
   * The pinning test. `toBe` on the raw figures, not `toBeCloseTo` and not the
   * formatted label: 3.7 against 3.8 was only the visible end of it, and a gap
   * of a thousandth of a percent is the same defect one round earlier.
   */
  it("arrives at the same numbers, not merely the same label", () => {
    const progress = { choconut: 2, gloomgourd: 1 };
    const mine = planProgress(plannerRows, gateStock(new Set(plannerRows.map((r) => r.id)), STOCK), progress);
    const theirs = planProgress(dash.rows, gateStock(dash.unitIds, STOCK), progress);

    expect(theirs.ownedUnits).toBe(mine.ownedUnits);
    expect(theirs.harvestedUnits).toBe(mine.harvestedUnits);
    expect(theirs.wantedUnits).toBe(mine.wantedUnits);
    expect(theirs.pct).toBe(mine.pct);
  });

  /**
   * The 446 against 429 that pointed at this. The island holds 446 mutations
   * and the plan's rows account for 429 of them, and the odd 17 sit in a
   * mutation no row asks for. Neither page may count them: the clamp is per row
   * and a row that does not exist has no clamp to reach.
   */
  it("never lets a mutation the plan does not ask for reach the percentage", () => {
    const withIt = planProgress(dash.rows, gateStock(dash.unitIds, STOCK), {});
    const withoutIt = planProgress(dash.rows, gateStock(dash.unitIds, { ...STOCK, do_not_eat_shroom: 0 }), {});

    expect(withIt.ownedUnits).toBe(429);
    expect(withIt.pct).toBe(withoutIt.pct);
  });

  /** A tick on one page is the same unit gain on the other. */
  it("moves in step when a planting is ticked off", () => {
    const stock = gateStock(dash.unitIds, STOCK);
    const before = planProgress(dash.rows, stock, {});
    const after = planProgress(dash.rows, stock, { choconut: 1 });

    expect(after.harvestedUnits - before.harvestedUnits).toBe(72);
    expect(planProgress(plannerRows, gateStock(dash.unitIds, STOCK), { choconut: 1 }).pct).toBe(after.pct);
  });

  /**
   * The gate, on the reader that now owns it. A snapshot with no unit maps
   * yields planting-weighted rows, and an item count measured against those
   * would let 245 Choconut cover a 34 planting row outright.
   */
  it("withholds stock from a row whose demand is counted in plantings", () => {
    const bare = snapshotRows({ plots });

    expect(bare.unitIds.size).toBe(0);
    expect(planProgress(bare.rows, gateStock(bare.unitIds, STOCK), {}).ownedUnits).toBe(0);

    /*
     * What it costs to forget: the same rows with the stock handed straight in.
     * 245 Choconut swallows a 34 planting row whole, and three untouched rows
     * of real work read as five sixths finished.
     */
    const forgotten = planProgress(bare.rows, STOCK, {});
    expect(forgotten.ownedUnits).toBe(46);
    expect(forgotten.wantedUnits).toBe(55);
    expect(forgotten.pct).toBeGreaterThan(80);
  });
});

/* =========================================================================
   Plantings, credited for the ones your stock removed
   -------------------------------------------------------------------------
   The bug: a part filled bar beside a counter reading "0/34". The bar counted
   the stock that had already covered part of the row and the number counted
   only plantings sown by hand, so the two said different things about one row.

   The credit is the planting reduction the plan already applied and nothing
   else. There is deliberately no second derivation of it here.
   ========================================================================= */

describe("the planting counter credits what your stock removed", () => {
  /** The two live cases, exactly. */
  it("reads 3 of 37 for Choconut and 1 of 10 for Gloomgourd", () => {
    const choconut = plantingCount(progressRow({ id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 }));
    expect(choconut).toEqual({ credited: 3, ticked: 0, done: 3, raw: 37 });

    const gloomgourd = plantingCount(progressRow({ id: "gloomgourd", need: 596, have: 106, rawNeed: 702, perPlot: 72, plots: 9 }));
    expect(gloomgourd).toEqual({ credited: 1, ticked: 0, done: 1, raw: 10 });
  });

  it("adds a tick to the numerator and leaves the denominator alone", () => {
    const row = progressRow({ id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 });

    expect(plantingCount(row, 1)).toEqual({ credited: 3, ticked: 1, done: 4, raw: 37 });
    expect(plantingCount(row, 34).done).toBe(37);
    // Ticks past what is left to sow are not extra progress.
    expect(plantingCount(row, 9999)).toEqual({ credited: 3, ticked: 34, done: 37, raw: 37 });
  });

  /**
   * The rule that keeps it honest: the credit comes off the plan's own planting
   * reduction, never off a fresh floor of your holding over the yield. The two
   * do not always agree, because the discount is taken against demand and then
   * ceilinged, and a second derivation of one quantity is how the pages came to
   * disagree in the first place.
   */
  it("takes the credit from the discount and not from the holding", () => {
    const gloomgourd = progressRow({ id: "gloomgourd", need: 596, have: 106, rawNeed: 702, perPlot: 72, plots: 9 });
    expect(plantingCount(gloomgourd).credited).toBe(1);
    expect(Math.floor(106 / 72)).toBe(1); // agrees here

    // And not here. Same holding, same yield, a different answer.
    const ragged: PlanProgressRow = { id: "ragged", wanted: 101, need: 30, perPlot: 10, plots: 3 };
    expect(plantingCount(ragged).credited).toBe(8);
    expect(Math.floor((101 - 30) / 10)).toBe(7);
  });

  /**
   * Lonelily. The stock holds 78 and the row still wants all three plantings,
   * because 78 was not a whole plot's worth against a 100 unit yield. "0 of 3"
   * is the truth, and the owned figure belongs in the tooltip so the zero
   * cannot read as "you have nothing".
   */
  it("leaves a row your stock did not shrink at zero of N", () => {
    const row = progressRow({ id: "lonelily", need: 202, have: 78, rawNeed: 280, perPlot: 100, plots: 3 });

    expect(plantingCount(row)).toEqual({ credited: 0, ticked: 0, done: 0, raw: 3 });
    // The partial story the tooltip and the pale bar carry instead.
    expect(planProgress([row], { lonelily: 78 }).ownedUnits).toBe(78);
    expect(planProgress([row], { lonelily: 78 }).pct).toBeGreaterThan(0);
  });

  it("shows nothing to credit on a row your stock never touched", () => {
    const row = progressRow({ id: "veilshroom", need: 621, have: 0, perPlot: 72, plots: 9 });
    expect(plantingCount(row)).toEqual({ credited: 0, ticked: 0, done: 0, raw: 9 });
  });

  /** A strip cannot disagree with the rows underneath it. */
  it("sums to exactly the sum of its rows", () => {
    const rows = [
      progressRow({ id: "choconut", need: 2379, have: 245, rawNeed: 2624, perPlot: 72, plots: 34 }),
      progressRow({ id: "gloomgourd", need: 596, have: 106, rawNeed: 702, perPlot: 72, plots: 9 }),
      progressRow({ id: "lonelily", need: 202, have: 78, rawNeed: 280, perPlot: 100, plots: 3 }),
      progressRow({ id: "veilshroom", need: 621, have: 0, perPlot: 72, plots: 9 }),
    ];
    const progress: Record<string, number> = { choconut: 2, veilshroom: 1 };
    const total = plantingTotals(rows, progress);

    let credited = 0;
    let ticked = 0;
    let raw = 0;
    for (const row of rows) {
      const one = plantingCount(row, progress[row.id]);
      credited += one.credited;
      ticked += one.ticked;
      raw += one.raw;
    }

    expect(total).toEqual({ credited, ticked, done: credited + ticked, raw });
    // The four credited plantings at rest, before a single tick.
    expect(plantingTotals(rows).credited).toBe(4);
    expect(plantingTotals(rows).done).toBe(4);
  });

  /**
   * A row still waiting on the solver has no planting count at all, so it
   * contributes nothing rather than a confident zero out of a zero.
   */
  it("counts nothing for a row with no solver answer", () => {
    expect(plantingCount({ id: "unsolved", wanted: 500, need: 500 })).toEqual({ credited: 0, ticked: 0, done: 0, raw: 0 });
    expect(rawPlots({ id: "unsolved", wanted: 500, need: 500 })).toBe(0);
  });

  /** No unit figures means no credit, which is the fallback reading unchanged. */
  it("credits nothing on a planting-weighted snapshot row", () => {
    const bare = snapshotRows({ plots: { choconut: 34, gloomgourd: 9 } });
    expect(plantingTotals(bare.rows, { choconut: 17 })).toEqual({ credited: 0, ticked: 17, done: 17, raw: 43 });
  });

  /** Nonsense cannot produce a negative credit or a numerator past the total. */
  it("refuses to credit a row that claims to have grown", () => {
    const backwards: PlanProgressRow = { id: "x", wanted: 10, need: 500, perPlot: 5, plots: 100 };
    const count = plantingCount(backwards, 5);

    expect(count.credited).toBe(0);
    expect(count.raw).toBe(100);
    expect(count.done).toBeLessThanOrEqual(count.raw);
  });
});
