import { decayDaysToCycles } from "./constants";
import { estimateTime, fillCycleEstimate, optimalHarvestWindow } from "./model";
import { isMechanicOnly, spawnChance, type BioanalysisTier, type Requirement } from "./spawnChance";
import type { DemandSpec, PlantingSpec, TimeEstimate } from "./types";

/**
 * The seam between the planner and the model.
 *
 * Everything the model needs arrives here as plain data. The types below are
 * re-declared rather than imported from `types/greenhouse` on purpose: this
 * module has to stay usable from a test fixture, a CLI, or a worker, none of
 * which should have to drag the app's type graph along. They are structurally
 * compatible, so the planner can pass its own objects straight in.
 */

/** The subset of a mutation record the model actually reads. */
export interface MutationFacts {
  id: string;
  requirements: Requirement[];
  /** Growth stages the mutation needs after it spawns. 0 is real for eleven. */
  growth_stages: number;
  /** Decay timer in days. 0 means it never decays. */
  decay: number;
}

/** The subset of a crop or mutation record used to size the input wait. */
export interface InputFacts {
  growth_stages: number | null;
  /** Days before this planted input decays. 0 or absent = never. */
  decay?: number;
}

export interface EstimateRequest {
  mutation: MutationFacts;
  /**
   * Growth stages of each required input, so the model can wait for the
   * slowest. Inputs grow in parallel, so only the maximum matters.
   */
  inputs: InputFacts[];
  /** Valid spawn spots on one packed plot - the solver's `economy.yield`. */
  spots: number;
  /** Seconds per growth stage, from `planner/time.ts`. */
  stageSeconds: number;
  /** Units wanted and plots run in parallel. */
  demand: DemandSpec;
  /** Best Bioanalysis accessory held. */
  bioanalysis?: BioanalysisTier;
  /** Override the unresolved crop-support rule, for sensitivity analysis. */
  supportRule?: "share" | "quarter";
  /**
   * Force a harvest window in cycles. Left undefined, the model picks the one
   * that finishes soonest, which is usually what a player wants to be told.
   */
  harvestWindow?: number;
}

/**
 * The parts `plantingSeconds` was actually built from.
 *
 * ECHOED, NOT RECOMPUTED. These are the exact fields of the `PlantingSpec` the
 * model was handed, passed back out so a caller can show its working. Nothing
 * here is derived a second time, which is the only way a breakdown can be
 * guaranteed to add up to the total it sits beside: a display that recalculates
 * the same quantity is a second opinion waiting to disagree, and this project
 * has already paid for one of those.
 *
 * `plantingSeconds` is `(inputStages + rollCyclesFor(inputStages, window) +
 * mutationStages) x stageSeconds`, floored at one cycle. The roll term is
 * window - 1 when maturation gives the first roll a tick to ride, and the full
 * window when there is no maturation at all (Dead Plant, bare soil) - every
 * roll then pays its own cycle. The floor is the only case where the parts do
 * not sum to the whole, and with the zero-maturation rule it is no longer
 * reachable in practice.
 */
export interface PlantingParts {
  /** Growth stages the slowest input needs before it counts. */
  inputStages: number;
  /** Growth stages the mutation itself needs after it spawns. */
  mutationStages: number;
  /** Seconds one growth stage takes on this plot. */
  stageSeconds: number;
}

export interface EstimateResult extends TimeEstimate {
  /** What the planting span was made of. See `PlantingParts`. */
  parts: PlantingParts;
  /** Cycles the planting was left in the ground before harvesting. */
  harvestWindow: number;
  /** Ceiling on that window, in cycles, imposed by decay. */
  maxWindow: number;
  /** Per-spot, per-cycle spawn probability used. */
  spawnChance: number;
  /**
   * True when this mutation never spawns by chance and the estimate is not
   * meaningful - Jerryflower and Shellfruit. Route these through their own
   * mechanic instead.
   */
  mechanicOnly: boolean;
  /**
   * The clock the planner should put in front of the player.
   *
   * `TimeEstimate` still prices repeated fixed harvest windows, which is the
   * right throughput model for a demand larger than the standing spawn space.
   * A demand that fits in one sowing stops as soon as its last required spot
   * succeeds, so its visible clock comes from the persistent-spot stopping
   * time instead. Keeping this named prevents a harvest instruction and a
   * completion estimate from silently becoming the same number again.
   */
  completion: {
    mode: "single-sowing" | "repeated-harvest" | "mechanic";
    expectedRollCycles: number | null;
    p50RollCycles: number | null;
    p90RollCycles: number | null;
    expectedSeconds: number;
    varianceSeconds2: number;
    p50Seconds: number;
    p90Seconds: number;
  };
}

const repeatedCompletion = (estimate: TimeEstimate): EstimateResult["completion"] => ({
  mode: "repeated-harvest",
  expectedRollCycles: null,
  p50RollCycles: null,
  p90RollCycles: null,
  expectedSeconds: estimate.expectedSeconds,
  varianceSeconds2: estimate.varianceSeconds2,
  p50Seconds: estimate.p50Seconds,
  p90Seconds: estimate.p90Seconds,
});

/** Time until a one-sowing goal is actually ready, rather than until its chosen harvest window ends. */
const singleSowingCompletion = (
  spec: PlantingSpec,
  demand: DemandSpec,
): EstimateResult["completion"] | null => {
  const plots = Math.max(1, demand.plots);
  const rollingSpots = spec.spots * plots;
  if (demand.need <= 0 || demand.need > rollingSpots) return null;

  const fill = fillCycleEstimate(rollingSpots, spec.spawnChance, demand.need);
  if (!Number.isFinite(fill.expectedCycles)) return null;

  // With real input growth, the first mutation roll lands on the final input
  // maturation tick. With no growth to ride, the first roll is the next tick.
  const cyclesBeforeFirstRoll = spec.inputStages > 0 ? spec.inputStages - 1 : 0;
  const toReady = (rollCycles: number): number =>
    Math.max(1, cyclesBeforeFirstRoll + rollCycles + spec.mutationStages);
  const seconds = (rollCycles: number): number => toReady(rollCycles) * spec.stageSeconds;

  return {
    mode: "single-sowing",
    expectedRollCycles: fill.expectedCycles,
    p50RollCycles: fill.p50Cycles,
    p90RollCycles: fill.p90Cycles,
    expectedSeconds: seconds(fill.expectedCycles),
    varianceSeconds2: fill.varianceCycles2 * spec.stageSeconds * spec.stageSeconds,
    p50Seconds: seconds(fill.p50Cycles),
    p90Seconds: seconds(fill.p90Cycles),
  };
};

/**
 * The longest a planting can usefully sit before decay eats the result.
 *
 * Two clocks, and the tighter one wins: the mutations already spawned start
 * rotting, and planted inputs can expire too, invalidating the layout. Inputs
 * that never decay impose no limit.
 */
export const maxHarvestWindow = (mutation: MutationFacts, inputs: InputFacts[], stageSeconds: number): number => {
  const clocks = [mutation.decay, ...inputs.map((i) => i.decay ?? 0)]
    .filter((d) => d > 0)
    .map((d) => decayDaysToCycles(d, stageSeconds));

  if (!clocks.length) return Number.POSITIVE_INFINITY;
  return Math.max(1, Math.floor(Math.min(...clocks)));
};

/** Turn planner facts into the model's flat spec. */
export const toPlantingSpec = (request: EstimateRequest): PlantingSpec => {
  const inputStages = request.inputs.reduce((max, i) => Math.max(max, i.growth_stages ?? 0), 0);

  return {
    id: request.mutation.id,
    spots: request.spots,
    spawnChance: spawnChance(request.mutation.id, request.mutation.requirements, {
      bioanalysis: request.bioanalysis,
      supportRule: request.supportRule,
    }),
    inputStages,
    mutationStages: request.mutation.growth_stages ?? 0,
    stageSeconds: request.stageSeconds,
    // Overwritten by the window choice below; 1 is the deterministic default.
    attemptsPerPlanting: 1,
    // Rolls land on the growth cycle, so the gap between them is one stage.
    attemptIntervalSeconds: request.stageSeconds,
  };
};

/** The one call the planner needs. */
export const estimate = (request: EstimateRequest): EstimateResult => {
  const spec = toPlantingSpec(request);
  const mechanicOnly = isMechanicOnly(request.mutation.id);
  const maxWindow = maxHarvestWindow(request.mutation, request.inputs, request.stageSeconds);

  // Read straight off the spec the model runs on, so the breakdown a caller
  // shows and the seconds the model returns can never describe different
  // plantings.
  const parts: PlantingParts = {
    inputStages: spec.inputStages,
    mutationStages: spec.mutationStages,
    stageSeconds: spec.stageSeconds,
  };

  // A mutation that never rolls has no expected time to give. Report it as
  // such rather than dividing by a zero chance and printing "forever".
  if (mechanicOnly || spec.spawnChance <= 0) {
    const flat = estimateTime({ ...spec, spawnChance: 1 }, request.demand);
    return {
      ...flat,
      parts,
      harvestWindow: 1,
      maxWindow,
      spawnChance: 0,
      mechanicOnly: true,
      completion: { ...repeatedCompletion(flat), mode: "mechanic" },
    };
  }

  const chosen =
    request.harvestWindow !== undefined
      ? { window: request.harvestWindow, estimate: estimateTime({ ...spec, attemptsPerPlanting: request.harvestWindow }, request.demand) }
      : optimalHarvestWindow(spec, request.demand, maxWindow);

  return {
    ...chosen.estimate,
    parts,
    harvestWindow: chosen.window,
    maxWindow,
    spawnChance: spec.spawnChance,
    mechanicOnly: false,
    completion: singleSowingCompletion(spec, request.demand) ?? repeatedCompletion(chosen.estimate),
  };
};
