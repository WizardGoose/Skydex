import { atLeastOnce, binomialAtLeast } from "./probability";
import type { DemandSpec, PlantingOutcome, PlantingSpec, TimeEstimate } from "./types";

/**
 * Expected time for greenhouse mutations.
 *
 * The old model was deterministic: sow a plot, wait the growth stages, harvest
 * one mutation per valid spawn spot. That is the best case, not the average.
 * Each spot only has a *chance* to produce the mutation, so a planting is a
 * fistful of coin flips, not a guaranteed harvest.
 *
 * The whole model is three steps.
 *
 * 1. A spot succeeds during one planting with
 *
 *      q = 1 - (1 - p)^k
 *
 *    for spawn chance `p` and `k` rolls before the planting has to be redone.
 *    k = 1 collapses this to q = p.
 *
 * 2. A planting sows `spots` spots, so its harvest is Binomial(spots, q).
 *    `plots` plots run in parallel, so one *round* is Binomial(spots x plots, q).
 *
 * 3. Independent binomials add, so after `r` rounds the total harvested is
 *    Binomial(r x spots x plots, q). That gives an exact answer for
 *
 *      P(done within r rounds) = P(Binomial(r x spots x plots, q) >= need)
 *
 *    with no simulation anywhere - which is why percentiles here are exact
 *    rather than sampled, and why the tests can check them against
 *    brute-force binomials.
 *
 * The "crops expired before it procced, sow it again" loop people describe is
 * not a special case in this model. It is just the rounds where the binomial
 * came up short, and it is already priced into the tail.
 */

/** Hard ceiling on the round sum, so a pathological input cannot hang the UI. */
const MAX_ROUNDS = 500_000;

/**
 * Longest harvest window the optimiser will consider, in growth cycles.
 * Well past the point where waiting longer stops paying for itself.
 */
const MAX_WINDOW = 400;

/** Beyond this many sigma below the target, P(done) is nil and the term is 1. */
const SIGMA_GUARD = 8;

/**
 * Roll cycles a planting spends waiting, for `attempts` rolls.
 *
 * The first roll rides the final maturation tick, so a window of w costs w-1
 * extra cycles - EXCEPT when there is no maturation at all. A Dead Plant or
 * bare soil has no maturation tick for that first roll to ride: you sow, and
 * the earliest a spawn can roll is the NEXT tick, so every roll pays its own
 * cycle. Charging w-1 there is how Witherbloom's clock ran a full cycle short
 * per planting and how 2-cycle windows looked cheaper than they are (the
 * quoted times read as off in real use; this was the mechanical piece of it).
 *
 * Exported so the display derives the same number from the same rule:
 * echoed, not recomputed, per the adapter's own doctrine.
 */
export const rollCyclesFor = (inputStages: number, attempts: number): number =>
  Math.max(1, Math.floor(attempts)) - 1 + (inputStages <= 0 ? 1 : 0);

export const plantingOutcome = (spec: PlantingSpec): PlantingOutcome => {
  const attempts = Math.max(1, Math.floor(spec.attemptsPerPlanting));
  const perSpotSuccess = atLeastOnce(spec.spawnChance, attempts);

  // One planting occupies the plot for: inputs maturing, then the roll window,
  // then the mutation growing. With a single attempt and real maturation the
  // roll window is zero and this is exactly the old model's
  // (inputStages + mutationStages) x stage; see rollCyclesFor for the
  // zero-maturation exception.
  const spanSeconds =
    spec.inputStages * spec.stageSeconds +
    rollCyclesFor(spec.inputStages, attempts) * spec.attemptIntervalSeconds +
    spec.mutationStages * spec.stageSeconds;

  // ...but never less than one growth cycle. Rolls only land on the cycle
  // tick, so even a mutation that needs no crops and grows instantly - a
  // Lonelily on bare soil - has to wait for a tick to have a chance at all.
  // The old model returns a flat "instant" for those eleven zero-stage
  // mutations, which is the one place this model deliberately disagrees with
  // it rather than reproducing it.
  const plantingSeconds = Math.max(spanSeconds, spec.stageSeconds);

  const expectedYield = spec.spots * perSpotSuccess;

  return {
    perSpotSuccess,
    expectedYield,
    plantingSeconds,
    yieldPerHour: plantingSeconds > 0 ? (expectedYield * 3600) / plantingSeconds : 0,
  };
};

/** P(demand met within `rounds` rounds). Exact, via the binomial tail. */
export const probabilityDoneWithin = (spec: PlantingSpec, demand: DemandSpec, rounds: number): number => {
  const { perSpotSuccess } = plantingOutcome(spec);
  const perRound = spec.spots * Math.max(1, demand.plots);
  if (demand.need <= 0) return 1;
  if (perRound <= 0 || perSpotSuccess <= 0) return 0;
  return binomialAtLeast(Math.floor(rounds * perRound), perSpotSuccess, demand.need);
};

/**
 * Smallest round count reaching `target` confidence.
 *
 * Exponential probe then binary search - the distribution is monotone in
 * rounds, so this is exact to the round.
 */
export const roundsForConfidence = (spec: PlantingSpec, demand: DemandSpec, target: number): number => {
  if (demand.need <= 0) return 0;

  let hi = 1;
  while (hi < MAX_ROUNDS && probabilityDoneWithin(spec, demand, hi) < target) hi *= 2;
  if (probabilityDoneWithin(spec, demand, hi) < target) return MAX_ROUNDS;

  let lo = Math.floor(hi / 2);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (probabilityDoneWithin(spec, demand, mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

/**
 * Expected rounds AND their variance, from the same survival sum:
 *
 *   E[R]  = sum over r >= 0 of P(R > r)
 *   E[R2] = sum over r >= 0 of (2r + 1) x P(R > r)
 *
 * both standard identities for a nonnegative integer stopping time, so the
 * variance costs no extra binomial evaluations - the loop that was already
 * walking the survival curve just weights each term a second way.
 *
 * WHY THE VARIANCE EXISTS. A plan is a sum of independent row times, and the
 * page used to quote "90% within" for that sum by adding up each row's own
 * p90 - which prices every mutation running unlucky at once, a coincidence
 * with probability far under 1% on a real plan. The result was unbelievable
 * on sight. A true quantile of a sum needs the spread of each term, and
 * this is the spread, in rounds squared.
 *
 * Rounds far below the target contribute a full 1 each and their binomial tail
 * is nil, so those are added without evaluating the beta function. That keeps
 * a 3,000-round grind fast instead of grinding through 3,000 continued
 * fractions.
 */
export const expectedRounds = (
  spec: PlantingSpec,
  demand: DemandSpec
): { rounds: number; variance: number; truncated: boolean } => {
  if (demand.need <= 0) return { rounds: 0, variance: 0, truncated: false };

  const { perSpotSuccess: q } = plantingOutcome(spec);
  const perRound = spec.spots * Math.max(1, demand.plots);
  if (perRound <= 0 || q <= 0) return { rounds: MAX_ROUNDS, variance: 0, truncated: true };

  let total = 0;
  let secondMoment = 0;
  for (let r = 0; r < MAX_ROUNDS; r++) {
    const trials = r * perRound;
    const mean = trials * q;
    const sd = Math.sqrt(Math.max(trials * q * (1 - q), 0));

    // Nowhere near the target yet: P(done) is nil, so P(not done) is 1.
    if (mean + SIGMA_GUARD * sd < demand.need) {
      total += 1;
      secondMoment += 2 * r + 1;
      continue;
    }

    const done = binomialAtLeast(trials, q, demand.need);
    const survival = 1 - done;
    total += survival;
    secondMoment += (2 * r + 1) * survival;
    // The clamp guards floating point only: mathematically E[R2] >= E[R]^2.
    if (survival < 1e-12) return { rounds: total, variance: Math.max(0, secondMoment - total * total), truncated: false };
  }

  return { rounds: total, variance: Math.max(0, secondMoment - total * total), truncated: true };
};

/** The full estimate for one mutation against one demand. */
export const estimateTime = (spec: PlantingSpec, demand: DemandSpec): TimeEstimate => {
  const plots = Math.max(1, demand.plots);
  const outcome = plantingOutcome(spec);
  const { rounds, variance, truncated } = expectedRounds(spec, demand);

  const p50Rounds = roundsForConfidence(spec, demand, 0.5);
  const p90Rounds = roundsForConfidence(spec, demand, 0.9);

  // What the old model claimed: every spot yields, every time.
  const deterministicPlantings = spec.spots > 0 ? Math.ceil(demand.need / spec.spots) : 0;
  const deterministicPerPlanting = (spec.inputStages + spec.mutationStages) * spec.stageSeconds;

  return {
    id: spec.id,
    need: demand.need,
    expectedYieldPerPlanting: outcome.expectedYield,
    perSpotSuccess: outcome.perSpotSuccess,
    plantingSeconds: outcome.plantingSeconds,

    expectedPlantings: rounds * plots,
    expectedRounds: rounds,
    expectedSeconds: rounds * outcome.plantingSeconds,
    // Seconds are rounds scaled by a constant, so the variance scales by its
    // square. This is what lets a plan total quote a real joint quantile.
    varianceSeconds2: variance * outcome.plantingSeconds * outcome.plantingSeconds,

    p50Rounds,
    p90Rounds,
    p50Seconds: p50Rounds * outcome.plantingSeconds,
    p90Seconds: p90Rounds * outcome.plantingSeconds,

    deterministicPlantings,
    deterministicSeconds: (deterministicPlantings * deterministicPerPlanting) / plots,

    truncated,
  };
};

/**
 * How long to leave a planting in the ground before harvesting.
 *
 * This is the decision the old model never had to make. Rolls land every
 * growth cycle, so a spot that came up empty this cycle gets another go next
 * cycle - waiting longer fills more of the plot. But every extra cycle is
 * another `stageSeconds` on the clock, and the yield curve flattens out
 * (1 - (1-p)^w saturates), so at some point waiting stops paying and you are
 * better off harvesting and re-sowing.
 *
 * That trade has an optimum, and it is worth surfacing: it is a concrete
 * "leave it N cycles" instruction rather than a number to stare at.
 *
 * `maxWindow` is the cap the caller's data imposes - a planting cannot outlive
 * the crops feeding it. See `constants.ts` for where that cap comes from.
 */
export const optimalHarvestWindow = (
  spec: PlantingSpec,
  demand: DemandSpec,
  maxWindow: number
): { window: number; estimate: TimeEstimate } => {
  const cap = Math.max(1, Math.min(MAX_WINDOW, Math.floor(maxWindow)));

  let best: { window: number; estimate: TimeEstimate } | null = null;
  for (let w = 1; w <= cap; w++) {
    const estimate = estimateTime({ ...spec, attemptsPerPlanting: w }, demand);
    if (!best || estimate.expectedSeconds < best.estimate.expectedSeconds) best = { window: w, estimate };
  }

  // cap >= 1 guarantees at least one iteration, so this is never null.
  return best!;
};

/**
 * Expected cycles of rolling before `need` of `spots` spots have filled.
 *
 * THE NUMBER A SMALL PLOT NEEDS IN ORDER TO READ AS REASONABLE. Sizing a plot
 * to exactly the units wanted is the cheapest possible answer in crops and in
 * placement effort, and it is only defensible if the wait it buys is stated
 * rather than left for the player to wonder about. Two spots for two Soggybud
 * is about six cycles; that is the sentence, and this is where it comes from.
 *
 * SAME MACHINERY, NOT A SECOND MODEL. This is the survival sum `expectedRounds`
 * already uses:
 *
 *   E[cycles] = sum over w >= 0 of P(not yet done after w cycles)
 *
 * with the two probabilities the rest of this file is built from. `atLeastOnce`
 * gives the chance one spot has succeeded at some point within w cycles, and
 * `binomialAtLeast` gives the chance at least `need` of the `spots` have. The
 * only thing that differs from `expectedRounds` is which quantity is being
 * summed over: cycles within one sowing rather than whole re-sowings.
 *
 * WHY THIS IS THE RIGHT SHAPE, and it rests on a cited fact rather than an
 * assumption. Input crops are not consumed when a mutation spawns (Startlevine
 * is destroyed if its Blastberry decays, which only parses if the Blastberry is
 * still standing), so a spot that came up empty simply rolls again next cycle
 * off the same sowing. A shortfall therefore costs WAITING and never
 * replanting, which is exactly what a per-spot geometric with no resets
 * describes. A spot that has filled is occupied until harvest and stops
 * rolling, which is why this counts distinct spots succeeding rather than a
 * Poisson stream of spawns.
 *
 * Returns Infinity for a mutation that never rolls, rather than a number that
 * would read as an estimate.
 */
export interface FillCycleEstimate {
  /** Expected number of mutation-roll ticks until the requested spots fill. */
  expectedCycles: number;
  /** Variance of that wait, measured in growth-cycle ticks squared. */
  varianceCycles2: number;
  /** First whole roll count at which at least half of runs are complete. */
  p50Cycles: number;
  /** First whole roll count at which at least 90% of runs are complete. */
  p90Cycles: number;
  /** True only when the numerical safety ceiling was reached. */
  truncated: boolean;
}

/**
 * Probability that persistent spawn spots have filled the requested amount by
 * a given Greenhouse roll tick.
 *
 * This is the CDF used by `fillCycleEstimate`, exposed so a staged layout can
 * combine several dependency waves without inventing a second probability
 * model. A negative or fractional cycle count simply means no completed roll
 * tick yet.
 */
export const probabilityFilledWithin = (
  spots: number,
  spawnChance: number,
  need: number,
  cycles: number,
): number => {
  if (need <= 0) return 1;
  if (spots <= 0 || spawnChance <= 0 || need > spots || cycles < 0) return 0;
  return binomialAtLeast(spots, atLeastOnce(spawnChance, Math.floor(cycles)), need);
};

/**
 * Full stopping-time distribution for a set of persistent spawn spots.
 *
 * Unlike `estimateTime`, this does not divide the job into fixed harvest
 * windows. The same planted inputs remain in place and every still-empty spot
 * rolls again on the next Greenhouse tick. That distinction is decisive for a
 * small goal: one Veilshroom can finish on its first successful roll, so it
 * must not be charged for the unused tail of a four-roll harvest window.
 *
 * The first and second moments use the standard survival identities also used
 * by `expectedRounds`. The percentiles come from the exact same CDF, so the
 * headline expectation and the confidence line cannot describe different
 * random processes.
 */
export const fillCycleEstimate = (spots: number, spawnChance: number, need: number): FillCycleEstimate => {
  if (need <= 0) {
    return { expectedCycles: 0, varianceCycles2: 0, p50Cycles: 0, p90Cycles: 0, truncated: false };
  }
  if (spots <= 0 || spawnChance <= 0 || need > spots) {
    return {
      expectedCycles: Number.POSITIVE_INFINITY,
      varianceCycles2: Number.POSITIVE_INFINITY,
      p50Cycles: Number.POSITIVE_INFINITY,
      p90Cycles: Number.POSITIVE_INFINITY,
      truncated: false,
    };
  }

  let expected = 0;
  let secondMoment = 0;
  let p50 = Number.POSITIVE_INFINITY;
  let p90 = Number.POSITIVE_INFINITY;

  for (let w = 0; w < MAX_ROUNDS; w++) {
    const done = probabilityFilledWithin(spots, spawnChance, need, w);
    if (!Number.isFinite(p50) && done >= 0.5) p50 = w;
    if (!Number.isFinite(p90) && done >= 0.9) p90 = w;

    const survival = 1 - done;
    expected += survival;
    secondMoment += (2 * w + 1) * survival;

    if (survival < 1e-12 && Number.isFinite(p90)) {
      return {
        expectedCycles: expected,
        varianceCycles2: Math.max(0, secondMoment - expected * expected),
        p50Cycles: p50,
        p90Cycles: p90,
        truncated: false,
      };
    }
  }

  return {
    expectedCycles: expected,
    varianceCycles2: Math.max(0, secondMoment - expected * expected),
    p50Cycles: p50,
    p90Cycles: p90,
    truncated: true,
  };
};

export const expectedCyclesToFill = (spots: number, spawnChance: number, need: number): number =>
  fillCycleEstimate(spots, spawnChance, need).expectedCycles;

/**
 * Sustained throughput, for layouts that keep producing without re-sowing.
 *
 * The wiki is clear that input crops are not consumed when a mutation spawns:
 * a Startlevine "will be destroyed if the Blastberry decays", which only makes
 * sense if the Blastberry is still standing there feeding it. And a spot stops
 * rolling only while something occupies it - a Lonelily or Godseed in the 3x3
 * will "prevent a Snoozling from growing" until harvested.
 *
 * Put together: harvest a spot and it goes back to rolling every cycle, with
 * the same crops still in the ground. So a plot is not one planting and done.
 * It is a pump that runs until the layout dies, and each spot cycles through
 *
 *   wait to proc (1/p cycles on average) -> grow (mutationStages) -> harvest
 *
 * giving a steady rate of one mutation per spot per (1/p + mutationStages)
 * cycles once it is warmed up.
 *
 * This is strictly faster than the planting model and needs the player to
 * actually turn up and harvest, so the planner keeps the planting model as its
 * headline number and uses this as the "if you tend it attentively" floor.
 */
export const sustainedThroughput = (
  spec: PlantingSpec,
  demand: DemandSpec
): { cyclesPerMutationPerSpot: number; mutationsPerCycle: number; expectedSeconds: number } => {
  const plots = Math.max(1, demand.plots);
  const p = spec.spawnChance;

  if (p <= 0 || spec.spots <= 0) {
    return { cyclesPerMutationPerSpot: Number.POSITIVE_INFINITY, mutationsPerCycle: 0, expectedSeconds: Number.POSITIVE_INFINITY };
  }

  // Geometric waiting time for the roll, then the mutation's own growth.
  const cyclesPerMutationPerSpot = 1 / p + spec.mutationStages;
  const mutationsPerCycle = (spec.spots * plots) / cyclesPerMutationPerSpot;

  // The first crop still has to grow before anything can roll at all.
  const warmupSeconds = spec.inputStages * spec.stageSeconds;
  const steadySeconds = mutationsPerCycle > 0 ? (demand.need / mutationsPerCycle) * spec.stageSeconds : Number.POSITIVE_INFINITY;

  return { cyclesPerMutationPerSpot, mutationsPerCycle, expectedSeconds: warmupSeconds + steadySeconds };
};

/**
 * Roll several mutations up into one grind.
 *
 * Cycles are sequential - a tier cannot start until the tier feeding it is
 * done - but everything inside one cycle is independent, so a cycle costs as
 * long as its slowest member rather than the sum of its members.
 *
 * Percentiles do NOT add across cycles in general. Summing per-cycle p90s
 * would claim the pessimistic case happens in every cycle at once, which
 * overstates the tail. This returns the sum as a clearly-labelled
 * conservative bound rather than pretending it is a true p90.
 */
export const combineCycles = (
  cycles: { index: number; estimates: TimeEstimate[] }[]
): {
  expectedSeconds: number;
  p50SecondsUpperBound: number;
  p90SecondsUpperBound: number;
  deterministicSeconds: number;
  perCycle: { index: number; expectedSeconds: number; p90Seconds: number; deterministicSeconds: number; slowest: string }[];
} => {
  const perCycle = cycles.map((c) => {
    const slowest = c.estimates.reduce<TimeEstimate | null>((a, b) => (a && a.expectedSeconds >= b.expectedSeconds ? a : b), null);
    return {
      index: c.index,
      expectedSeconds: slowest?.expectedSeconds ?? 0,
      p50Seconds: Math.max(0, ...c.estimates.map((e) => e.p50Seconds)),
      p90Seconds: Math.max(0, ...c.estimates.map((e) => e.p90Seconds)),
      deterministicSeconds: Math.max(0, ...c.estimates.map((e) => e.deterministicSeconds)),
      slowest: slowest?.id ?? "",
    };
  });

  const sum = (pick: (c: (typeof perCycle)[number]) => number) => perCycle.reduce((s, c) => s + pick(c), 0);

  return {
    expectedSeconds: sum((c) => c.expectedSeconds),
    p50SecondsUpperBound: sum((c) => c.p50Seconds),
    p90SecondsUpperBound: sum((c) => c.p90Seconds),
    deterministicSeconds: sum((c) => c.deterministicSeconds),
    perCycle: perCycle.map(({ index, expectedSeconds, p90Seconds, deterministicSeconds, slowest }) => ({
      index,
      expectedSeconds,
      p90Seconds,
      deterministicSeconds,
      slowest,
    })),
  };
};
