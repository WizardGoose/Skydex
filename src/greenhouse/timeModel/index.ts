/**
 * Expected-time model for greenhouse mutations.
 *
 * The planner's existing model is deterministic: sow a plot, wait the growth
 * stages, harvest one mutation from every valid spawn spot. That is the lucky
 * case. In reality each spot only rolls a *chance* to produce the mutation,
 * once per growth cycle, so the honest answer to "how long will this take" is
 * a distribution rather than a number.
 *
 * This module is pure and data-driven. It imports nothing from the app, does
 * no fetching, and holds no state - the planner measures the world (spots from
 * the solver, stage seconds from `planner/time.ts`, demand from the plan) and
 * hands the numbers in. That is what lets the tests pin it against
 * brute-force binomials and fixtures instead of a running app.
 *
 * Nothing here is wired into the UI yet, by design.
 *
 * Start with `estimate` in `adapter.ts`; everything else is the machinery
 * underneath it. `constants.ts` records the provenance and assumption status
 * for every number.
 */

export type { DemandSpec, PlantingOutcome, PlantingSpec, TimeEstimate } from "./types";
export type { BioanalysisTier, ChanceOptions, Requirement } from "./spawnChance";
export type { EstimateRequest, EstimateResult, InputFacts, MutationFacts } from "./adapter";
export type { Provenance, SourcedValue } from "./constants";

export { atLeastOnce, binomialAtLeast, clamp, logGamma, regularisedIncompleteBeta } from "./probability";

export {
  combineCycles,
  expectedCyclesToFill,
  fillCycleEstimate,
  estimateTime,
  expectedRounds,
  optimalHarvestWindow,
  plantingOutcome,
  probabilityFilledWithin,
  probabilityDoneWithin,
  rollCyclesFor,
  roundsForConfidence,
  sustainedThroughput,
} from "./model";
export type { FillCycleEstimate } from "./model";

export { cropSupport, isCropRequirement, isMechanicOnly, spawnChance } from "./spawnChance";

export { estimate, maxHarvestWindow, toPlantingSpec } from "./adapter";

export {
  BASE_CROP_DECAY_DAYS,
  BASE_STAGE_SECONDS,
  BIOANALYSIS_MULTIPLIER,
  CONTENTION_MODEL,
  CROP_SUPPORT_RULE,
  DECAY_CLOCK_START,
  DECAY_UNIT,
  MUTATION_WEIGHTS,
  NON_CROP_REQUIREMENTS,
  ROLL_CADENCE,
  ROLLS_PER_SPOT_PER_CYCLE,
  WATER_PENALTY,
  decayDaysToCycles,
} from "./constants";
