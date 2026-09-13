import {
  BASE_CROP_DECAY_DAYS,
  estimate,
  expectedCyclesToFill,
  rollCyclesFor,
  type BioanalysisTier,
  type EstimateResult,
} from "../timeModel";
import type { CropDefinition, MutationDefinition } from "../types/greenhouse";
import { needSplit } from "./needSplit";
import type { PlotEconomy, SolverPlan, SolverPlanNode } from "./solverPlan";
import { stageSeconds, type GrowthSettings } from "./time";

/**
 * The one place a planner number becomes a time.
 *
 * Both the Planner page and `pnpm check` call in here, so the terminal and the
 * page cannot print different totals: there is one function, and drifting
 * apart would take deleting it. The old deterministic path in `planner/time.ts`
 * is still the stage arithmetic underneath (this module hands its
 * `stageSeconds` straight to the model); what changed is that a planting is
 * now a fistful of coin flips rather than a guaranteed harvest.
 *
 * Everything here is pure. No React, no fetching, no storage. The caller
 * measures the world - spots from the solver, demand from the plan, upgrades
 * from the settings - and this turns it into seconds.
 */

export type { BioanalysisTier };

/** Your greenhouse, as far as the time model is concerned. */
export interface EstimateSettings extends GrowthSettings {
  /** Plots sown in parallel. 1 to 3. */
  plots: number;
  /** Best Bioanalysis accessory held. Multiplicative, best-only. */
  bioanalysis?: BioanalysisTier;
  /**
   * Override the unresolved crop-support rule. Left undefined the model uses
   * its default ("share"); the CLI exposes this for sensitivity analysis.
   */
  supportRule?: "share" | "quarter";
}

interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

/**
 * One planting's clock, split into the waits a person actually sits through.
 *
 * THE REPORT THIS EXISTS FOR. A reader saw "2d 14h" for one Soggybud
 * planting and concluded the Melon's own growth had been left out of it. It had
 * not: eleven of those twenty one stages ARE the Melon. The number was right
 * and unreadable, and with no way to see inside it that reading was the only
 * one available. That is a display defect, and it is worth fixing precisely
 * BECAUSE the arithmetic was correct.
 *
 * Every figure here is echoed from `EstimateResult.parts`, which is itself the
 * spec the model ran on. Nothing is recalculated, so the breakdown cannot come
 * to a different answer than the total it explains.
 */
export interface PlantingBreakdown {
  /** Stages the slowest input needs to mature, and what that input is. */
  inputStages: number;
  inputName: string | null;
  /** Extra cycles spent leaving the planting standing for more rolls. */
  rollStages: number;
  /** Stages the mutation itself grows once it has spawned. */
  mutationStages: number;
  /** The three above, summed. Zero means the one-cycle floor set the time. */
  totalStages: number;
  /** Seconds one stage takes on this plot. */
  stageSeconds: number;
  /** Spawn spots the plot was sized to. */
  spots: number;
  /**
   * Expected cycles of rolling before the plot has filled what is wanted.
   *
   * THE NUMBER A MINIMAL PLOT IS DEFENDED BY. Two spots for two Soggybud is the
   * cheapest plot that can hold the job, and the only reason that is a good
   * trade rather than a stingy one is that the wait it buys is modest and
   * stated. Infinity when the demand cannot fit in one sowing, which the label
   * declines to print rather than dressing up.
   */
  cyclesToFill: number;
  /** 90th-percentile roll count for the same persistent spawn spots. */
  p90CyclesToFill?: number;
}

/** One mutation's honest cost, in the shape the UI reads. */
export interface NodeEstimate {
  id: string;
  /** Valid spawn spots on one optimal plot. */
  spots: number;
  /** Per-spot, per-cycle spawn probability. 0 for mechanic-only mutations. */
  spawnChance: number;
  /** True when the mutation never rolls and its time is not a chance result. */
  mechanicOnly: boolean;
  /** Whether the visible clock stops within one standing sowing or spans harvest rounds. */
  completionMode: EstimateResult["completion"]["mode"];

  /** Leave the planting this many growth cycles before harvesting. */
  harvestWindow: number;
  /** Longest window decay allows. */
  maxWindow: number;
  /** True when decay, not diminishing returns, is what ends the window. */
  windowCappedByDecay: boolean;

  /** Seconds one planting occupies a plot. Never less than one growth cycle. */
  plantingSeconds: number;
  /** What that span is made of, for showing the working. */
  breakdown: PlantingBreakdown;

  /** Expected wall clock for the whole job, from nothing. */
  expectedSeconds: number;
  /** Exact: 90% of runs finish this mutation within it. */
  p90Seconds: number;
  /** Variance of the row's wall clock, for joint quantiles over sums of rows. */
  varianceSeconds2: number;

  /** The same numbers with finished plantings discounted. */
  expectedSecondsLeft: number;
  p90SecondsLeft: number;
  varianceSeconds2Left: number;

  /** What the old deterministic model claimed, kept for the CLI comparison. */
  deterministicSeconds: number;
}

export interface CycleEstimate {
  index: number;
  expectedSeconds: number;
  p90Seconds: number;
  expectedSecondsLeft: number;
  p90SecondsLeft: number;
}

export interface PlanEstimates {
  byId: Record<string, NodeEstimate>;
  cycles: CycleEstimate[];
  total: {
    expectedSeconds: number;
    p90Seconds: number;
    expectedSecondsLeft: number;
    p90SecondsLeft: number;
    deterministicSeconds: number;
  };
}

/**
 * Expected wall-clock time left, expressed in the greenhouse's own cycle unit.
 *
 * `cyclesToFill` deliberately becomes Infinity when one sowing cannot hold the
 * whole demand. That is useful for explaining a small one-sowing field, but it
 * is not a useful headline for larger jobs: their complete expected duration is
 * still known. This converts that duration back through the exact stage clock
 * the estimate used, so every field can show one comparable cycle count.
 */
export const expectedGrowthCyclesLeft = (
  estimate: Pick<NodeEstimate, "expectedSecondsLeft" | "breakdown"> | null | undefined,
): number | null => {
  if (!estimate) return null;
  const seconds = estimate.expectedSecondsLeft;
  const secondsPerCycle = estimate.breakdown.stageSeconds;
  if (!Number.isFinite(seconds) || !Number.isFinite(secondsPerCycle) || seconds < 0 || secondsPerCycle <= 0) return null;
  if (seconds === 0) return 0;
  return Math.max(1, Math.round(seconds / secondsPerCycle));
};

/**
 * Growth stages and decay of everything a mutation needs adjacent.
 *
 * Inputs grow in parallel so only the slowest sets the wait. Mutation inputs
 * carry their individual decay clocks; base crops share the cited 72-hour
 * clock. Either can cap how long the planting remains reusable.
 *
 * THIS IS THE LEAD-IN, and it is deliberately charged for every input.
 *
 * A base crop is sown as a seed, so its growth is real: Soggybud's Melon is 11
 * of the 21 stages one planting spans. That half was queried as missing and is
 * not; `__tests__/baseCropLeadIn.test.ts` pins it against its parts.
 *
 * A mutation input is a different case, and an OPEN one. The rule offered was
 * that a mutation placed from stock is already grown and so should cost nothing
 * to mature, which would zero this term for 20 of the 40 mutations. The wiki
 * does not say. The three trivia lines that come closest contradict each other,
 * and Fertilized Jerryseed is a live counterexample: it is planted and grows
 * into a Jerryflower like any crop. Charging the stages is the reading that can
 * only overstate, so it stands until a playtest settles it.
 */
const inputsOf = (mutation: MutationDefinition, data: Dataset) =>
  (mutation.requirements ?? []).map((req) => {
    const def = data.mutations[req.crop] ?? data.crops[req.crop];
    return {
      growth_stages: def?.growth_stages ?? 0,
      decay: data.mutations[req.crop]?.decay ?? (data.crops[req.crop] ? BASE_CROP_DECAY_DAYS.value : 0),
      // Carried for the breakdown only. The model reads the two fields above
      // and never this one; `InputFacts` is unchanged.
      name: def?.name ?? req.crop,
    };
  });

/**
 * Seconds per growth stage for the player's greenhouse.
 *
 * The unique-crop bonus is shared across every Greenhouse plot. A field's
 * solver economy therefore cannot override it with the crops in that one
 * layout. Keep the economy argument for the existing estimate call sites, but
 * price every field with the same greenhouse-wide settings value.
 */
export const stageSecondsFor = (
  _economy: PlotEconomy | null | undefined,
  settings: EstimateSettings,
): number => stageSeconds(settings);

/**
 * The honest estimate for one plan row.
 *
 * `null` when the row has no solver answer yet, which is the same condition
 * that leaves its planting count blank.
 */
export const nodeEstimate = (
  node: SolverPlanNode,
  data: Dataset,
  economies: Record<string, PlotEconomy | null>,
  settings: EstimateSettings,
  /** Plantings already ticked off, for the "left" figures. */
  done = 0,
  /**
   * Force a harvest window instead of letting the model choose the one that
   * finishes soonest. Only for asking "what would waiting N cycles cost", which
   * is what proves the chosen window is actually the best one.
   */
  harvestWindow?: number
): NodeEstimate | null => {
  const mutation = data.mutations[node.id];
  if (!mutation || node.plots === undefined) return null;

  const economy = economies[node.id];
  const spots = economy?.yield ?? node.perPlot ?? 1;
  const plots = Math.max(1, settings.plots);
  const inputs = inputsOf(mutation, data);

  const result: EstimateResult = estimate({
    mutation: {
      id: node.id,
      requirements: mutation.requirements ?? [],
      growth_stages: mutation.growth_stages ?? 0,
      decay: mutation.decay ?? 0,
    },
    inputs,
    spots,
    stageSeconds: stageSecondsFor(economy, settings),
    demand: { need: node.need, plots },
    bioanalysis: settings.bioanalysis,
    supportRule: settings.supportRule,
    harvestWindow,
  });

  /*
   * Progress is counted in plantings ticked off against the plan's planting
   * count, which is what the progress bars already show. Discounting the
   * honest total by that same fraction keeps one notion of "how far through
   * this am I" across the whole page, instead of a bar saying 25% next to a
   * time that disagrees.
   */
  const fractionLeft = node.plots > 0 ? Math.max(0, node.plots - Math.min(done, node.plots)) / node.plots : 0;

  /*
   * Which input the model waited on, found by LOOKING UP its answer rather than
   * working the maximum out again. `parts.inputStages` is the model's own
   * figure; this only asks which requirement carries it, so if that figure ever
   * changes the label follows it instead of drifting away from it. Nothing to
   * name when no input has any growth to do, which is the honest reading of a
   * mutation that spreads onto bare soil.
   */
  const slowest = result.parts.inputStages > 0 ? inputs.find((i) => i.growth_stages === result.parts.inputStages) : undefined;
  // The model's own rule, not a re-derivation: with no maturation tick to
  // ride, the first roll pays its own cycle (see rollCyclesFor).
  const rollStages = rollCyclesFor(result.parts.inputStages, result.harvestWindow);

  return {
    id: node.id,
    spots,
    breakdown: {
      inputStages: result.parts.inputStages,
      inputName: slowest?.name ?? null,
      rollStages,
      mutationStages: result.parts.mutationStages,
      totalStages: result.parts.inputStages + rollStages + result.parts.mutationStages,
      stageSeconds: result.parts.stageSeconds,
      spots,
      // The model's own survival sum, over the spot count the plot was actually
      // sized to and the chance the estimate was actually priced at.
      cyclesToFill: expectedCyclesToFill(spots, result.spawnChance, node.need),
      p90CyclesToFill: result.completion.p90RollCycles ?? undefined,
    },
    spawnChance: result.spawnChance,
    mechanicOnly: result.mechanicOnly,
    harvestWindow: result.harvestWindow,
    maxWindow: result.maxWindow,
    windowCappedByDecay: Number.isFinite(result.maxWindow) && result.harvestWindow >= result.maxWindow,
    plantingSeconds: result.plantingSeconds,
    completionMode: result.completion.mode,
    expectedSeconds: result.completion.expectedSeconds,
    p90Seconds: result.completion.p90Seconds,
    varianceSeconds2: result.completion.varianceSeconds2,
    expectedSecondsLeft: result.completion.expectedSeconds * fractionLeft,
    p90SecondsLeft: result.completion.p90Seconds * fractionLeft,
    // Scaling a duration by a constant fraction scales its variance by the
    // square. The "left" figures already treat the remainder as that constant
    // fraction of the whole, so the variance follows the same reading.
    varianceSeconds2Left: result.completion.varianceSeconds2 * fractionLeft * fractionLeft,
    deterministicSeconds: result.deterministicSeconds,
  };
};

/* =========================================================================
   A real "90% within" for a sum of rows
   ========================================================================= */

/** The standard normal's 90th percentile. */
const Z90 = 1.2815515655446004;

/** Running moments of a sum of independent row times. */
export interface SpreadAccumulator {
  /** Sum of the rows' expected seconds. */
  expected: number;
  /** Sum of the rows' variances, valid because the rows are independent. */
  variance: number;
  /** Largest single-row exact p90 seen. */
  maxP90: number;
  /** Rows accumulated. */
  rows: number;
}

export const emptySpread = (): SpreadAccumulator => ({ expected: 0, variance: 0, maxP90: 0, rows: 0 });

/**
 * The 90th percentile of a sum of independent row times.
 *
 * THE NUMBER A READER REFUSED TO BELIEVE. The old figure summed every row's own p90,
 * which prices EVERY mutation running unlucky at the same time - on a forty
 * row plan that coincidence has probability well under one percent, so the
 * label "90% within" was hanging on a number that was really a 99.9% bound.
 * The quoted "~295d expected, 90% within 346d" was disbelieved on sight,
 * and the disbelief was correct.
 *
 * The honest construction: independent variances add, so the sum's spread is
 * `sqrt(sum of variances)`, and with many rows the sum is close to normal, so
 * its 90th percentile is `mean + 1.2816 x sigma`. Two guards keep the
 * approximation from ever understating:
 *
 *   A SINGLE ROW is not "many", and its exact p90 is already known, so it is
 *   passed through untouched - the cycle line above a lone row prints the same
 *   figure the row does.
 *
 *   THE SUM DOMINATES EVERY MEMBER. Each row's time is nonnegative, so the
 *   total is at least any one row, and a true quantile of the total can never
 *   sit below any row's own. The floor at `maxP90` (and at the mean) makes a
 *   heavy-tailed row - one slow geometric dominating the plan - unable to
 *   drag the estimate below what its own exact distribution states.
 */
export const jointP90 = (acc: SpreadAccumulator): number => {
  if (acc.rows === 0) return 0;
  if (acc.rows === 1) return acc.maxP90;
  return Math.max(acc.expected, acc.maxP90, acc.expected + Z90 * Math.sqrt(Math.max(acc.variance, 0)));
};

/** Fold one row's whole-job figures into the running spread. */
const addSpread = (acc: SpreadAccumulator, expected: number, variance: number, p90: number): void => {
  acc.expected += expected;
  acc.variance += variance;
  if (p90 > acc.maxP90) acc.maxP90 = p90;
  acc.rows += 1;
};

/**
 * Every row, cycle and total for one plan.
 *
 * Rollups SUM expectations rather than take the slowest member of a cycle.
 * That is the honest reading of how the grind is actually run: you sow a plot
 * for one mutation at a time, and the `plots` setting is already spent inside
 * each mutation's own estimate. Taking a cycle's maximum would assume you can
 * grow every mutation in it simultaneously on plots you do not have.
 *
 * The p90 columns are JOINT figures over those sums, built by `jointP90` from
 * the rows' summed variances. They are no longer the sum of per-row p90s -
 * that construction priced every mutation running unlucky at once and quoted
 * it under a "90%" label, a figure rightly disbelieved on sight. A
 * cycle's figure is joint over its own rows; the plan total is joint over ALL
 * rows, not a sum of the cycle figures, because summing quantiles is the
 * exact mistake being removed.
 */
export const buildPlanEstimates = (
  plan: SolverPlan,
  data: Dataset,
  economies: Record<string, PlotEconomy | null>,
  settings: EstimateSettings,
  progress: Record<string, number> = {}
): PlanEstimates => {
  const byId: Record<string, NodeEstimate> = {};
  const cycles: CycleEstimate[] = [];

  const planSpread = emptySpread();
  const planSpreadLeft = emptySpread();
  let deterministicSeconds = 0;

  for (const cycle of plan.cycles) {
    const spread = emptySpread();
    const spreadLeft = emptySpread();

    for (const node of cycle.produce) {
      const done = Math.min(progress[node.id] ?? 0, node.plots ?? 0);
      const est = nodeEstimate(node, data, economies, settings, done);
      if (!est) continue;

      byId[node.id] = est;
      addSpread(spread, est.expectedSeconds, est.varianceSeconds2, est.p90Seconds);
      addSpread(spreadLeft, est.expectedSecondsLeft, est.varianceSeconds2Left, est.p90SecondsLeft);
      addSpread(planSpread, est.expectedSeconds, est.varianceSeconds2, est.p90Seconds);
      addSpread(planSpreadLeft, est.expectedSecondsLeft, est.varianceSeconds2Left, est.p90SecondsLeft);
      deterministicSeconds += est.deterministicSeconds;
    }

    cycles.push({
      index: cycle.index,
      expectedSeconds: spread.expected,
      p90Seconds: jointP90(spread),
      expectedSecondsLeft: spreadLeft.expected,
      p90SecondsLeft: jointP90(spreadLeft),
    });
  }

  return {
    byId,
    cycles,
    total: {
      expectedSeconds: planSpread.expected,
      p90Seconds: jointP90(planSpread),
      expectedSecondsLeft: planSpreadLeft.expected,
      p90SecondsLeft: jointP90(planSpreadLeft),
      deterministicSeconds,
    },
  };
};

/* =========================================================================
   How far through the plan you actually are
   ========================================================================= */

/**
 * Progress, counted in units rather than in rows.
 *
 * The bug this exists to kill: the site read "0%" at a player holding 429
 * mutations. Progress was measured only in *plantings ticked off*, so stock
 * that had already been grown, bought or traded for counted for nothing, and
 * the one number meant to say "how far along am I" said the opposite of the
 * truth.
 *
 * Two rules make it honest, and both matter:
 *
 *   UNIT WEIGHTED, NOT ROW WEIGHTED. A plan row for 2,624 Choconut is not the
 *   same size of job as a row for 12 Timestalk, so averaging per-row
 *   percentages would let a trivial row cancel out a monstrous one. Everything
 *   below sums units and divides once, at the end.
 *
 *   CLAMPED PER ITEM at `min(owned, wanted)`. Owning 5,000 of something the
 *   plan needs 100 of is worth 100 towards the plan and not a unit more.
 *   Without the clamp one overflowing sack would read as a finished grind,
 *   which is the same class of lie as the 0% and no less damaging.
 */
export interface PlanProgress {
  /** Units the plan already had covered by your stock, clamped per item. */
  ownedUnits: number;
  /** Units grown since, from the plantings you have ticked off. */
  harvestedUnits: number;
  /** Units the plan asks for in total, before any stock was applied. */
  wantedUnits: number;
  /**
   * `(ownedUnits + harvestedUnits) / wantedUnits` as a percentage, 0 to 100.
   *
   * Exact, not rounded: rounding at the source is how a real 3% became a
   * displayed 0% in the first place. Round at the point of display, or use
   * `progressPctLabel`.
   */
  pct: number;
}

/**
 * One row of a plan, reduced to what progress actually needs.
 *
 * `wanted` is required and is deliberately NOT derived from `need + owned`.
 * That identity holds only while `owned < wanted`, and the case worth getting
 * right is exactly the one where it breaks, so the total is stated rather than
 * reconstructed. `progressRow` below does the stating for a solver plan node.
 */
export interface PlanProgressRow {
  id: string;
  /** Units this row asks for, before your stock is applied. */
  wanted: number;
  /** Units still to obtain. Defaults to `wanted`, meaning nothing was covered. */
  need?: number;
  /** Units one planting of this yields. */
  perPlot?: number;
  /**
   * Plantings the plan asks for, AFTER your stock removed some.
   *
   * This is the number of times you still have to sow, which is why the tick
   * control counts against it. The pre-discount figure is `rawPlots` below,
   * derived rather than stored so the two can never drift apart.
   */
  plots?: number;
}

/** What a caller knows about your stock: a map, or a reader over one. */
export type OwnedLookup = Record<string, number> | ((id: string) => number | undefined);

const finite = (n: number | undefined): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, n) : 0);

/**
 * A solver plan node as a progress row.
 *
 * `needSplit` is the one place that recovers "what was asked for before your
 * stock came off", and it is already what the ledger rows print, so progress
 * reads the same figures the player can see rather than a second derivation
 * that could drift from them.
 */
export const progressRow = (node: Pick<SolverPlanNode, "id" | "need" | "have" | "perPlot" | "plots"> & { rawNeed?: number }): PlanProgressRow => {
  const split = needSplit(node);
  return { id: node.id, wanted: split.raw, need: split.remaining, perPlot: node.perPlot, plots: node.plots };
};

/**
 * Unit-weighted progress across a plan.
 *
 * `owned` overrides whatever the rows imply, because the page's owned figures
 * carry precedence rules of their own (a number you typed beats an island
 * sync) and progress must not quietly re-derive them. Omit it and each row's
 * own `wanted - need` stands.
 *
 * `progress` is plantings ticked off, keyed by id, exactly as the planner
 * stores it. Those become units through `perPlot`, falling back to an even
 * share of the row when the solver has not answered with a yield yet, and are
 * capped at what the row still needs so a rounded-up final planting cannot
 * credit you with units that do not exist.
 */
export const planProgress = (
  rows: Iterable<PlanProgressRow>,
  owned: OwnedLookup = {},
  progress: Record<string, number> = {}
): PlanProgress => {
  const stockOf = typeof owned === "function" ? owned : (id: string) => owned[id];

  let ownedUnits = 0;
  let harvestedUnits = 0;
  let wantedUnits = 0;

  for (const row of rows) {
    const wanted = finite(row.wanted);
    if (wanted === 0) continue;

    const need = Math.min(row.need === undefined ? wanted : finite(row.need), wanted);

    // The clamp. Anything past `wanted` is stock you happen to have, not
    // progress against this plan.
    const stock = stockOf(row.id) ?? (wanted - need);
    const covered = Math.min(finite(stock), wanted);

    const plots = finite(row.plots);
    const perPlot = finite(row.perPlot);
    const perPlanting = perPlot > 0 ? perPlot : plots > 0 ? need / plots : 0;
    const done = plots > 0 ? Math.min(finite(progress[row.id]), plots) : 0;

    wantedUnits += wanted;
    ownedUnits += covered;
    harvestedUnits += Math.min(done * perPlanting, need, wanted - covered);
  }

  const pct = wantedUnits > 0 ? Math.min(100, ((ownedUnits + harvestedUnits) / wantedUnits) * 100) : 0;
  return { ownedUnits, harvestedUnits, wantedUnits, pct };
};

/**
 * The unit demand a snapshot carries, keyed by mutation id.
 *
 * Named for the store's own `<thing>Of` convention, beside `cycleOf` and
 * `expectedSecondsOf`, and read by the Dashboard with a presence check exactly
 * as every other additive snapshot field is.
 */
export interface PlanUnitMaps {
  /** Units the plan asked for, before your stock came off. */
  wantedOf: Record<string, number>;
  /** Units still to obtain, after your stock came off. */
  needOf: Record<string, number>;
  /** Units one planting of it yields. */
  perPlotOf: Record<string, number>;
}

/**
 * The three maps, or nothing at all.
 *
 * All three or none is the contract, and it is not tidiness. A reader with no
 * unit figure for a row falls back to weighting that row by plantings, and on
 * that path it deliberately credits no stock, because measuring an item count
 * against a planting count would let 245 Choconut cover a 12 planting row
 * outright. A half-written map defeats that: it looks like real data, so the
 * reader trusts it, and a zero `wanted` would silently swallow a row that the
 * fallback would at least have counted honestly.
 *
 * So a single row that cannot state all three collapses the whole result to
 * null and the writer emits no maps, which leaves the reader on the fallback it
 * already handles rather than on data that is quietly wrong.
 */
export const planUnitMaps = (rows: Iterable<PlanProgressRow>): PlanUnitMaps | null => {
  const wantedOf: Record<string, number> = {};
  const needOf: Record<string, number> = {};
  const perPlotOf: Record<string, number> = {};

  let any = false;
  for (const row of rows) {
    const wanted = row.wanted;
    const need = row.need;
    const perPlot = row.perPlot;

    // `need` of 0 and `perPlot` of 0 are not the same claim as absent, so these
    // are typed checks rather than truthiness. A wanted of 0 is: it means the
    // row asks for nothing, which is not a row worth stating units for.
    if (!Number.isFinite(wanted) || wanted <= 0) return null;
    if (need === undefined || !Number.isFinite(need)) return null;
    if (perPlot === undefined || !Number.isFinite(perPlot) || perPlot <= 0) return null;

    wantedOf[row.id] = wanted;
    needOf[row.id] = need;
    perPlotOf[row.id] = perPlot;
    any = true;
  }

  return any ? { wantedOf, needOf, perPlotOf } : null;
};

/* =========================================================================
   One plan, one set of rows, two pages
   ========================================================================= */

/**
 * The snapshot fields a progress reader needs, and nothing else.
 *
 * Structural rather than an import of `PlanSnapshot`: the snapshot type belongs
 * to the planner store, the unit maps are additive on it, and this module is
 * pure. Stating only what is read keeps the Planner able to hand in a plan it
 * has just computed and not yet persisted.
 */
export interface PlanSnapshotUnits {
  /** mutation id -> plantings still to do, after your stock came off. */
  plots: Record<string, number>;
  wantedOf?: Record<string, number>;
  needOf?: Record<string, number>;
  perPlotOf?: Record<string, number>;
}

/** One plan as progress rows, plus the ids whose demand is stated in units. */
export interface PlanRowSet {
  rows: PlanProgressRow[];
  byId: Record<string, PlanProgressRow>;
  /**
   * The ids whose `wanted` is stated in units, and so the only ids your stock
   * may be counted against. Per row rather than per snapshot: a snapshot that
   * states units for most rows and not for one must not credit an item count
   * against that one's planting count. Feed it to `gateStock`.
   */
  unitIds: Set<string>;
}

/**
 * The one place a plan becomes progress rows.
 *
 * THE DIVERGENCE THIS EXISTS TO END. The Planner computed its rows from the
 * live solver plan and the Dashboard rebuilt its own from the persisted
 * snapshot, so two functions were producing what was supposed to be one set of
 * numbers, and the two pages printed different percentages for one state. Both
 * pages now come through here. The Planner runs the plan it is about to persist
 * through this reader and renders the result, so what the Dashboard reads back
 * is the same construction, not a matching one. Anything left over is a
 * question of snapshot freshness, which has an authoritative answer - the
 * Planner - rather than a question of whose arithmetic is right.
 *
 * Two row shapes come out, and which one you get is per row:
 *
 *   UNIT STATED, when the snapshot carries `wantedOf` for that id. The row's
 *   demand is in items, so your item counts may be measured against it.
 *
 *   PLANTING WEIGHTED, otherwise: one planting, one unit. `need` equal to
 *   `wanted` matters as much as the weighting does, because it makes
 *   `planProgress` fall back to `wanted - need`, which is zero, so a row with
 *   no unit figure contributes no owned units however much of it you hold.
 */
export const snapshotRows = (snap: PlanSnapshotUnits): PlanRowSet => {
  const rows: PlanProgressRow[] = [];
  const byId: Record<string, PlanProgressRow> = {};
  const unitIds = new Set<string>();

  for (const [id, plots] of Object.entries(snap.plots)) {
    const wanted = snap.wantedOf?.[id];
    let row: PlanProgressRow;

    if (typeof wanted === "number" && Number.isFinite(wanted)) {
      row = { id, wanted, need: snap.needOf?.[id], perPlot: snap.perPlotOf?.[id], plots };
      unitIds.add(id);
    } else {
      row = { id, wanted: plots, need: plots, perPlot: 1, plots };
    }

    rows.push(row);
    byId[id] = row;
  }

  return { rows, byId, unitIds };
};

/**
 * A stock reader that can only reach rows whose demand is stated in units.
 *
 * THIS GATE IS LOAD BEARING. Do not simplify it away by passing an owned lookup
 * straight to `planProgress`.
 *
 * It is tempting to think `planProgress` protects itself, because a
 * planting-weighted row has `need === wanted` and so looks like it credits
 * nothing. It does not protect itself. A supplied stock figure WINS over the
 * row's own numbers, so handing it stock for a row whose demand is counted in
 * plantings compares an item count against a planting count and massively
 * over-credits: 245 Choconut measured against 34 plantings reads as more than
 * 90% done. A test pins that failure shape, so losing the gate fails loudly
 * rather than quietly inflating the number the whole site is built around.
 */
export const gateStock = (unitIds: ReadonlySet<string>, owned: OwnedLookup): ((id: string) => number | undefined) => {
  const read = typeof owned === "function" ? owned : (id: string) => owned[id];
  return (id: string) => (unitIds.has(id) ? read(id) : undefined);
};

/* =========================================================================
   Plantings, credited for the ones your stock removed
   ========================================================================= */

/**
 * Plantings the plan asked for BEFORE your stock removed any.
 *
 * Derived, never stored. `plots` is `ceil(need / perPlot)` and this is the same
 * ceiling over the pre-discount demand, so the pair is exact and a snapshot
 * needs no fourth map to carry it.
 *
 * The floor at `plots` is a guard, not arithmetic: a row can only ever have had
 * at least as many plantings before a discount as after one, and a nonsense
 * input claiming otherwise must not be able to produce a negative credit.
 */
export const rawPlots = (row: PlanProgressRow): number => {
  if (row.plots === undefined) return 0;
  const plots = finite(row.plots);
  const perPlot = finite(row.perPlot);
  return perPlot > 0 ? Math.max(plots, Math.ceil(finite(row.wanted) / perPlot)) : plots;
};

/** A row's planting counter, split into where each planting came from. */
export interface PlantingCount {
  /**
   * Plantings your stock removed from this row.
   *
   * ONE SOURCE. This is the planting reduction the plan already applied and
   * nothing else: `rawPlots - plots`. It must never be re-derived as
   * `floor(owned / perPlot)`, because a second derivation of one quantity is
   * exactly how the Planner and the Dashboard came to disagree in the first
   * place, and the two would not even agree here - the discount is applied
   * against demand and then ceilinged, which is not the same as flooring your
   * holding.
   */
  credited: number;
  /** Plantings you have ticked off, capped at what the plan still asks for. */
  ticked: number;
  /** `credited + ticked`. The counter's numerator. */
  done: number;
  /** Plantings before the discount. The counter's denominator. */
  raw: number;
}

/**
 * The counter beside a progress bar.
 *
 * The bug this fixes: a pre-filled bar next to "0/34" said two different things
 * at once. The bar counted the stock that had already covered part of the row,
 * the number counted only plantings sown by hand, and a player reading them
 * together got a bar saying partway and a number saying nothing done.
 *
 * The credit already existed as the planting reduction, so no second notion of
 * progress is invented here: Choconut's 37 plantings became 34 because 245 in a
 * sack covered the rest, and 3 of 37 is what that is. Tick semantics are
 * untouched - the button still counts against the plantings that remain.
 */
export const plantingCount = (row: PlanProgressRow, ticked = 0): PlantingCount => {
  const raw = rawPlots(row);
  const plots = row.plots === undefined ? 0 : finite(row.plots);
  const credited = Math.max(0, raw - plots);
  const done = Math.min(finite(ticked), plots);
  return { credited, ticked: done, done: credited + done, raw };
};

/**
 * The same counter across many rows, summed.
 *
 * Summed from the per-row figures rather than recomputed from totals, so a
 * strip cannot disagree with the rows underneath it.
 */
export const plantingTotals = (rows: Iterable<PlanProgressRow>, progress: Record<string, number> = {}): PlantingCount => {
  const total: PlantingCount = { credited: 0, ticked: 0, done: 0, raw: 0 };
  for (const row of rows) {
    const one = plantingCount(row, progress[row.id]);
    total.credited += one.credited;
    total.ticked += one.ticked;
    total.done += one.done;
    total.raw += one.raw;
  }
  return total;
};

/**
 * A percentage as a person reads it.
 *
 * One decimal below ten, whole numbers above, because the difference between
 * 3% and 4% is worth seeing and the difference between 63% and 64% is not.
 * Anything above zero but below a tenth says so rather than rounding to the
 * "0%" this whole exercise exists to stop printing.
 */
export const progressPctLabel = (pct: number): string => {
  if (!Number.isFinite(pct) || pct <= 0) return "0";
  if (pct >= 100) return "100";
  if (pct < 0.1) return "<0.1";
  if (pct < 10) return String(Math.round(pct * 10) / 10);
  return String(Math.round(pct));
};

/**
 * How to say a harvest window out loud. One phrasing, every place it appears.
 *
 * A window of one is "every cycle", not "every 1 cycles", and the singular is
 * common enough to matter: the legendaries at the end of a plan all sit there.
 */
export const harvestWindowLabel = (cycles: number): string => (cycles === 1 ? "every cycle" : `every ${cycles} cycles`);

/**
 * One planting's clock, read out as a sentence.
 *
 * "21 stages: 11 Melon maturation + 10 Soggybud growth".
 *
 * Chronological, because that is the order they are waited through: the crops
 * come up, the plot is left standing for its rolls, then the mutation grows.
 * Terms worth nothing are left out entirely rather than printed as zeroes, so
 * the common two-term case reads as a sentence instead of a form.
 *
 * The floor gets its own wording. When every term is zero the span would be
 * nothing at all, and the planting still costs a cycle because a spawn only
 * rolls on the tick. Saying "0 stages" beside a real duration would look like a
 * bug; saying why it cannot be shorter is the actual answer.
 */
export const plantingBreakdownLabel = (b: PlantingBreakdown, mutationName: string): string => {
  if (b.totalStages <= 0) return "1 stage: a spawn only rolls on the cycle tick, so a planting is never shorter";

  const terms: string[] = [];
  if (b.inputStages > 0) terms.push(`${b.inputStages} ${b.inputName ?? "input"} maturation`);
  if (b.rollStages > 0) terms.push(`${b.rollStages} roll window`);
  if (b.mutationStages > 0) terms.push(`${b.mutationStages} ${mutationName} growth`);

  return `${b.totalStages} ${b.totalStages === 1 ? "stage" : "stages"}: ${terms.join(" + ")}`;
};

/**
 * The plot's size, and the wait that size buys.
 *
 * "2 spawn spots, about 6 growth cycles for both to fill."
 *
 * This is the sentence that makes a minimal plot defensible rather than stingy.
 * Sizing to one spot per unit is the cheapest possible answer in crops and in
 * placement effort, and the honest cost of it is cycles, so the cycles are
 * said out loud next to the spot count rather than buried in a total.
 *
 * Returns null when there is nothing worth saying: a demand too large for one
 * sowing has no "fill" to expect, and a mutation that never rolls has no
 * distribution behind it. A missing clause is better than a fabricated one.
 */
export const fillLabel = (b: PlantingBreakdown): string | null => {
  if (!Number.isFinite(b.cyclesToFill) || b.cyclesToFill <= 0 || b.spots <= 0) return null;

  const cycles = Math.max(1, Math.round(b.cyclesToFill));
  const spots = `${b.spots} spawn ${b.spots === 1 ? "spot" : "spots"}`;
  const fill = b.spots === 1 ? "to fill it" : b.spots === 2 ? "for both to fill" : "to fill them";
  return `${spots} · about ${cycles} growth ${cycles === 1 ? "cycle" : "cycles"} ${fill}`;
};

/**
 * Whether a p90 bound says anything the expected value does not.
 *
 * `expectedRounds` is a real number and `p90Rounds` is a whole count of
 * rounds, so when the binomial is tight - which is most of the time, because a
 * 72 spot plot concentrates it hard - the mean is dragged a fraction of a
 * round past the integer the 90th percentile lands on, and the "bound" comes
 * out slightly BELOW the expectation. Choconut at its best window is the
 * ordinary case: 9.018 expected rounds against a p90 of 9.
 *
 * That is not a contradiction. It means the entire spread fits inside one
 * planting, which is the research doc's point that per-mutation distributions
 * are tight. But "~13d, 90% within 13d" reads as broken, so the spread is only
 * quoted where it genuinely sits above the expectation and carries
 * information.
 */
export const hasSpread = (expectedSeconds: number, p90Seconds: number): boolean => p90Seconds > expectedSeconds;

/**
 * The one caveat worth putting on screen, in one place.
 *
 * Staff confirmed exactly one spawn percentage, and two different crop-support
 * rules reproduce it. The model takes the one that reproduces the published
 * table. Everything else the estimates rest on is cited. Sensitivity is about
 * 6% on a full Rose Dragon plan, so this is a footnote and not a banner.
 */
export const SUPPORT_RULE_NOTE =
  "Spawn chance assumes each required crop carries an equal share of the support. That is the one rule still " +
  "waiting on an in game check; every other number behind these estimates is sourced.";
