import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CropDefinition, MutationDefinition } from "../../types/greenhouse";
import { nodeEstimate, plantingBreakdownLabel, stageSecondsFor, type EstimateSettings } from "../planEstimates";
import type { PlotEconomy, SolverPlanNode } from "../solverPlan";
import { formatDuration, stageSeconds } from "../time";

/**
 * A base crop is sown as a seed, so it has to grow before anything can roll.
 *
 * THE REPORT THIS FILE COMES FROM, AND WHAT IT ACTUALLY FOUND. A reader saw
 * "2d 4h" for one Soggybud planting and thought the Melon's own maturation had
 * been left out of it. It had not. The model charges the slowest input's full
 * growth before the roll window opens, and the 2d 4h is 21 growth stages of
 * which ELEVEN are the Melon getting to maturity. The claim did not reproduce.
 *
 * These tests exist because that is far too easy to lose. The lead-in is one
 * `Math.max` inside `inputsOf`, it produces no line of its own on the page, and
 * dropping it would shave 11 stages off every Soggybud planting while every
 * other number on the screen carried on looking correct. So the arithmetic is
 * pinned to its parts here rather than to a total that could be right by
 * coincidence.
 *
 * ## What the wiki does and does not say, since the numbers rest on it
 *
 * CITED. The stage count is the wiki's. `Greenhouse` -> "Overview" gives a
 * per-crop column: Melon 11, Pumpkin 11, Wheat/Carrot/Potato/Sugar Cane/Cactus/
 * Nether Wart 8, Cocoa Beans and both Mushrooms 6, Sunflower/Moonflower/Wild
 * Rose 15. The dataset matches it.
 *
 * SILENT, and this is why the charge stays where it is. Nothing on the wiki says
 * whether a Greenhouse tile keeps its plant through a harvest or has to be
 * re-sown, so there is no source for charging the lead-in once at the front
 * instead of once per planting. The Garden's replenish behaviour is documented
 * and is explicitly NOT the Greenhouse's - different clock, different page - so
 * it must not be carried over. Until an in-game check settles it the model pays
 * the lead-in every planting, which can only ever overstate the work. A plan
 * that overstates is survivable; one that understates fails at the point of
 * running short.
 *
 * SILENT, second gap, in the other direction. The candidate rule for the other
 * half - "a mutation placed from stock is already grown" - is not on the wiki
 * either, and the three lines that come closest do not agree: Magic Jellybean
 * and Fleshtrap read "do not decay when fully grown OR placed by the player",
 * two separate states, while All-in Aloe reads "does not decay while growing or
 * after being placed", which only parses if placed means done growing. There is
 * also at least one mutation where the rule is definitely false - a Jerryflower
 * comes from a Fertilized Jerryseed, which is planted and grows through stages
 * like any crop. So mutation inputs keep paying their growth stages for now.
 * Acting on the rule would shorten every estimate on the site, and shortening on
 * an unsourced assumption is the one move this model does not make.
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

/** The reported plot, as the solver answered it: 52 spots off Melon and Gloomgourd. */
const ECONOMIES: Record<string, PlotEconomy | null> = {
  soggybud: { yield: 52, crops: { melon: 27, gloomgourd: 21 } },
};

/**
 * The reported greenhouse. Crop Growth 100 and Growth Speed I, which is the
 * setting that puts "One stage 2h 30m" on the panel at 12 unique crops.
 */
const SETTINGS: EstimateSettings = { cropGrowth: 100, speedTier: 1, uniqueCrops: 12, plots: 1 };

const node = (need: number, plots: number): SolverPlanNode => ({
  id: "soggybud",
  name: "Soggybud",
  kind: "mutation",
  need,
  have: 0,
  cycle: 1,
  perPlot: 52,
  plots,
});

const est = (need = 2, plots = 1) => nodeEstimate(node(need, plots), data, ECONOMIES, SETTINGS)!;

/** Melon: sown as a seed, eleven stages to maturity. Wiki, Greenhouse overview. */
const MELON_STAGES = 11;
/** Soggybud's own growth once it has spawned. */
const SOGGYBUD_STAGES = 10;

describe("the panel readout the report was made from", () => {
  it("is 2h 30m a stage at twelve unique crops, the figure in the report", () => {
    // The bonus is greenhouse-wide. The Soggybud field has two crop types, but
    // it runs on the same twelve-crop clock as every other field.
    expect(formatDuration(stageSeconds(SETTINGS))).toBe("2h 30m");
    expect(formatDuration(stageSecondsFor(ECONOMIES.soggybud, SETTINGS))).toBe("2h 30m");
  });

  it("prices one Soggybud planting at 21 greenhouse-wide growth stages", () => {
    expect(formatDuration(est().plantingSeconds)).toBe("2d 4h");
  });
});

describe("the base crop lead-in is in the number, not missing from it", () => {
  it("is exactly the Melon's eleven stages, ahead of Soggybud's own ten", () => {
    const e = est();
    const stage = stageSecondsFor(ECONOMIES.soggybud, SETTINGS);

    // Inputs mature, the roll window runs, then the mutation grows. The window
    // is 1 here, so the middle term is zero and the span is the two growths.
    expect(e.harvestWindow).toBe(1);
    expect(e.plantingSeconds).toBeCloseTo((MELON_STAGES + (e.harvestWindow - 1) + SOGGYBUD_STAGES) * stage, 6);

    // Stated as a share so a failure says WHICH half moved: eleven stages of
    // twenty one is the Melon, and it is over half the wait.
    expect(e.plantingSeconds / stage).toBeCloseTo(21, 6);
    expect(MELON_STAGES / 21).toBeGreaterThan(0.5);
  });

  it("collapses to the mutation's own growth plus one roll cycle if the lead-in is dropped", () => {
    /*
     * The check that the term is genuinely load bearing. A dataset where Melon
     * springs up fully grown loses the eleven maturation stages - but it also
     * loses the maturation tick the first roll used to ride, so the roll now
     * pays its own cycle (rollCyclesFor). Net: eleven off, one back on. A
     * refactor that stops feeding input stages in cannot pass both this and
     * the test above.
     */
    const instantMelon = { ...data, crops: { ...data.crops, melon: { ...data.crops.melon, growth_stages: 0 } } };
    const stage = stageSecondsFor(ECONOMIES.soggybud, SETTINGS);
    const without = nodeEstimate(node(2, 1), instantMelon, ECONOMIES, SETTINGS)!;

    expect(without.plantingSeconds).toBeCloseTo((SOGGYBUD_STAGES + 1) * stage, 6);
    expect(est().plantingSeconds - without.plantingSeconds).toBeCloseTo((MELON_STAGES - 1) * stage, 6);
  });

  it("takes the slowest input, not the sum of them", () => {
    /*
     * Soggybud's other input is Gloomgourd, which is a mutation and has zero
     * growth stages of its own, so it adds nothing. Inputs grow side by side in
     * the same plot, so only the slowest can set the wait; adding them would
     * charge for a queue that does not exist.
     */
    expect(data.mutations.gloomgourd.growth_stages).toBe(0);
    expect(est().plantingSeconds).toBeCloseTo(
      (MELON_STAGES + SOGGYBUD_STAGES) * stageSecondsFor(ECONOMIES.soggybud, SETTINGS),
      6
    );
  });
});

describe("the breakdown that makes the number checkable", () => {
  /**
   * The number was right and unreadable, so this is the line that makes it
   * checkable. Pinned as a literal string: it is copy a person reads, and a
   * refactor that quietly turns it into "11 melon maturation" or drops the
   * Melon's name should have to say so here.
   */
  it("reads out the Soggybud planting in full", () => {
    const e = est();
    expect(plantingBreakdownLabel(e.breakdown, "Soggybud")).toBe("21 stages: 11 Melon maturation + 10 Soggybud growth");
    expect(formatDuration(e.plantingSeconds)).toBe("2d 4h");
  });

  it("names the input the model actually waited on", () => {
    const e = est();
    // Not Gloomgourd, which is the other input and needs no growing.
    expect(e.breakdown.inputName).toBe("Melon");
    expect(e.breakdown.inputStages).toBe(MELON_STAGES);
    expect(e.breakdown.mutationStages).toBe(SOGGYBUD_STAGES);
    expect(e.breakdown.rollStages).toBe(0);
  });

  it("shows the roll window once waiting starts paying for itself", () => {
    const many = est(2000, 40);
    expect(many.harvestWindow).toBeGreaterThan(1);
    expect(many.breakdown.rollStages).toBe(many.harvestWindow - 1);
    expect(plantingBreakdownLabel(many.breakdown, "Soggybud")).toContain(`${many.harvestWindow - 1} roll window`);
  });

  it("charges Lonelily's cycle as the roll it is, not as a floor to apologise for", () => {
    /*
     * Lonelily needs no crops and grows instantly, so there is no maturation
     * tick for the first roll to ride: the roll pays its own cycle
     * (rollCyclesFor), and the breakdown SAYS so. The old wording explained a
     * "floor" as if the cycle were a technicality; it is a real wait with a
     * real name.
     */
    const e = nodeEstimate(
      { id: "lonelily", name: "Lonelily", kind: "mutation", need: 1, have: 0, cycle: 0, perPlot: 100, plots: 1 },
      data,
      { lonelily: { yield: 100, crops: {} } },
      SETTINGS,
      0,
      1
    )!;

    expect(e.breakdown.totalStages).toBe(1);
    expect(e.breakdown.rollStages).toBe(1);
    expect(e.breakdown.inputName).toBeNull();
    const label = plantingBreakdownLabel(e.breakdown, "Lonelily");
    expect(label).toBe("1 stage: 1 roll window");
    expect(label).not.toContain("0 stages");
  });

  /**
   * THE ANTI-DRIFT GUARD, and the reason the parts are echoed from the model's
   * own spec rather than worked out again beside it.
   *
   * A breakdown that recomputes what it is explaining is a second opinion, and
   * a second opinion is what put two different percentages on two pages once
   * already. So the claim is checked for every mutation in the dataset, not
   * just the one in the bug report: the parts multiply back to the exact total
   * they sit beside, or the floor is the reason they do not.
   */
  it("adds back up to the total it explains, for every mutation there is", () => {
    const ids = Object.keys(data.mutations);
    expect(ids.length).toBeGreaterThan(30);

    let floored = 0;
    for (const id of ids) {
      const economies = { [id]: { yield: 8, crops: { melon: 4 } } };
      const e = nodeEstimate(
        { id, name: data.mutations[id].name, kind: "mutation", need: 20, have: 0, cycle: 0, perPlot: 8, plots: 3 },
        data,
        economies,
        SETTINGS
      );
      if (!e) continue;

      const { breakdown: b } = e;
      expect(b.totalStages).toBe(b.inputStages + b.rollStages + b.mutationStages);

      if (b.totalStages === 0) {
        floored++;
        expect(e.plantingSeconds).toBeCloseTo(b.stageSeconds, 6);
        continue;
      }
      expect(e.plantingSeconds).toBeCloseTo(b.totalStages * b.stageSeconds, 6);

      // And whenever a term is claimed, it is named rather than left blank.
      if (b.inputStages > 0) expect(b.inputName).not.toBeNull();
    }

    // The floor became unreachable when the zero-maturation roll started
    // paying its own cycle: every planting now carries at least one real
    // stage in its parts, so nothing needs the apology branch. If this ever
    // goes positive again, a term went missing from the parts.
    expect(floored).toBe(0);
  });
});

describe("the replant question, answered the conservative way", () => {
  it("charges the lead-in on every planting, never fewer", () => {
    /*
     * The wiki does not say whether a Greenhouse tile keeps its crop through a
     * harvest. Until it does, each planting pays for its own crops to mature.
     *
     * This is the direction guard for the whole file. "Once at the front"
     * is the cheapest defensible reading and this is at least that, for any
     * number of plantings. If a source ever settles the question the other way
     * this test is where the change gets made, deliberately and visibly.
     */
    const one = est(2, 1);
    const many = est(2000, 40);
    const leadIn = MELON_STAGES * stageSecondsFor(ECONOMIES.soggybud, SETTINGS);

    const stage = stageSecondsFor(ECONOMIES.soggybud, SETTINGS);

    /*
     * The lead-in is the same eleven stages whatever else the planting does.
     * A big demand buys a longer roll window, which stretches the middle term
     * and leaves the two growth terms exactly where they were.
     */
    expect(many.expectedSeconds / many.plantingSeconds).toBeGreaterThan(1);
    expect(many.harvestWindow).toBeGreaterThan(one.harvestWindow);
    for (const e of [one, many]) {
      expect(e.plantingSeconds - (e.harvestWindow - 1) * stage - SOGGYBUD_STAGES * stage).toBeCloseTo(leadIn, 6);
    }

    // Per planting the lead-in is paid in full, both times.
    expect(one.plantingSeconds).toBeGreaterThanOrEqual(leadIn);
    expect(many.plantingSeconds).toBeGreaterThanOrEqual(leadIn);

    // And the whole job is never cheaper than paying it once at the front.
    expect(many.expectedSeconds).toBeGreaterThanOrEqual(leadIn);
  });

  it("never lets a planting cost less than a single growth cycle", () => {
    // Even a mutation that needs no crops and grows instantly waits for a tick,
    // so the lead-in can be zero but the planting can not.
    const e = nodeEstimate(
      { id: "lonelily", name: "Lonelily", kind: "mutation", need: 4, have: 0, cycle: 0, perPlot: 100, plots: 1 },
      data,
      { lonelily: { yield: 100, crops: {} } },
      SETTINGS
    )!;
    expect(e.plantingSeconds).toBeGreaterThanOrEqual(stageSecondsFor({ yield: 100, crops: {} }, SETTINGS));
  });
});
