import type { DesignerPlacement } from "../context/DesignerContext";
import type {
  CropDefinition,
  CropPlacement,
  MutationDefinition,
  MutationResult,
  SolveResponse,
} from "../types/greenhouse";
import {
  fillCycleEstimate,
  probabilityFilledWithin,
  spawnChance,
  type BioanalysisTier,
} from "../timeModel";
import { evaluateMutationTargets } from "../utilities/mutationValidation";
import { blockCells, colOf, ringCells, rowOf } from "../solver/grid";
import { FULL_PLOT } from "../solver/request";

interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

interface Constraint {
  target: string;
  crop: string;
  need: number;
  cells: number[];
}

interface SearchBudget {
  remaining: number;
  relocations: number;
  signal?: AbortSignal;
}

export interface DelayedGrowthStage {
  wave: number;
  mutations: MutationResult[];
}

/**
 * A field where lower-tier mutations grow in the cells that the final target
 * will later read as its inputs.
 *
 * `displayResult` intentionally contains targets from several moments in time.
 * It is a route map, not a claim that they all spawn on the same tick. The
 * validator-proved wave number beside every target is what gives that overlay
 * its temporal meaning.
 */
export interface DelayedGrowthLayout {
  displayResult: SolveResponse;
  stages: DelayedGrowthStage[];
  /** Mutation inputs the player no longer has to harvest and replant. */
  grownInPlace: Record<string, number>;
  /** New base-crop placements required to make those inputs appear in place. */
  addedInputs: Record<string, number>;
  /** Number of separate dependency waves folded into this field. */
  mergedWaves: number;
}

export interface DelayedGrowthChange {
  direct: SolveResponse;
  delayed: SolveResponse;
}

/** A dependency phase disappears only when every consuming field replaces it. */
export const fullyGrownInPlace = (
  id: string,
  consumers: readonly (DelayedGrowthLayout | null | undefined)[],
): boolean => consumers.length > 0 && consumers.every((layout) =>
  (layout?.grownInPlace[id] ?? 0) > 0 &&
  !layout!.displayResult.placements.some((placement) => placement.crop === id)
);

/** Restore this toggle's planting only while the player has not edited it. */
export const restoreDelayedGrowthLayout = (
  current: SolveResponse,
  change: DelayedGrowthChange | null,
): SolveResponse | null => {
  if (!change) return null;
  const signature = (result: SolveResponse): string => JSON.stringify([
    result.placements.map((placement) => `${placementKey(placement.crop, placement.position)}:${placement.size}`).sort(),
    result.mutations.map((placement) => `${placementKey(placement.mutation, placement.position)}:${placement.size}`).sort(),
  ]);
  return signature(current) === signature(change.delayed) ? change.direct : null;
};

export interface DelayedGrowthTimingSettings {
  bioanalysis?: BioanalysisTier;
  supportRule?: "share" | "quarter";
}

export interface DelayedGrowthTimingGroup {
  id: string;
  count: number;
  expectedReadyCycle: number;
  p90ReadyCycle: number;
}

/**
 * Time until a two-wave delayed field is ready, measured in Greenhouse ticks.
 *
 * The intermediate mutations roll concurrently. The final mutation starts on
 * the tick after every required intermediate is ready, because Greenhouse
 * updates happen simultaneously and a plant created by this tick cannot have
 * been an input to the same tick. The returned percentile is the exact
 * convolution of those persistent-spot distributions under the time model's
 * existing independence assumption.
 */
export interface DelayedGrowthTiming {
  expectedCycles: number;
  varianceCycles2: number;
  p50Cycles: number;
  p90Cycles: number;
  dependencyExpectedCycle: number;
  finalRollExpectedCycles: number;
  finalRollP90Cycles: number;
  groups: DelayedGrowthTimingGroup[];
}

const placementKey = (id: string, position: [number, number]): string =>
  `${id}@${position[0]},${position[1]}`;

/** Mutation placement -> dependency wave, for drawing a staged field truthfully. */
export const delayedGrowthWaveMap = (layout: DelayedGrowthLayout): Record<string, number> =>
  Object.fromEntries(layout.stages.flatMap((stage) =>
    stage.mutations.map((mutation) => [placementKey(mutation.mutation, mutation.position), stage.wave])
  ));

const MAX_DELAY_CYCLES = 10_000;
const DISTRIBUTION_TAIL = 1e-12;

interface DiscreteDistribution {
  pmf: number[];
  expected: number;
  variance: number;
}

const distributionFromCdf = (cdf: (cycles: number) => number): DiscreteDistribution | null => {
  const pmf: number[] = [];
  let previous = 0;

  for (let cycles = 0; cycles <= MAX_DELAY_CYCLES; cycles++) {
    const cumulative = Math.max(previous, Math.min(1, cdf(cycles)));
    pmf[cycles] = Math.max(0, cumulative - previous);
    previous = cumulative;
    if (1 - cumulative < DISTRIBUTION_TAIL) break;
  }
  if (1 - previous >= DISTRIBUTION_TAIL) return null;

  // The omitted tail is below 1e-12. Normalising keeps the moments and the
  // quantile search numerically self-consistent without pretending it is a
  // meaningful extra cycle.
  const mass = pmf.reduce((sum, value) => sum + value, 0);
  if (!(mass > 0)) return null;
  for (let index = 0; index < pmf.length; index++) pmf[index] /= mass;

  const expected = pmf.reduce((sum, probability, cycles) => sum + probability * cycles, 0);
  const second = pmf.reduce((sum, probability, cycles) => sum + probability * cycles * cycles, 0);
  return { pmf, expected, variance: Math.max(0, second - expected * expected) };
};

const quantileOfSum = (
  dependency: DiscreteDistribution,
  finalCdf: (cycles: number) => number,
  mutationGrowth: number,
  target: number,
): number => {
  const upper = dependency.pmf.length - 1 + MAX_DELAY_CYCLES + mutationGrowth;
  const cumulative = (total: number): number => {
    const available = total - mutationGrowth;
    if (available < 0) return 0;
    let probability = 0;
    for (let dependencyCycles = 0; dependencyCycles < dependency.pmf.length; dependencyCycles++) {
      const mass = dependency.pmf[dependencyCycles];
      if (mass <= 0) continue;
      probability += mass * finalCdf(available - dependencyCycles);
    }
    return probability;
  };

  let low = 0;
  let high = upper;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (cumulative(middle) >= target) high = middle;
    else low = middle + 1;
  }
  return low;
};

const placementCells = (placement: { position: [number, number]; size: number }): number[] =>
  blockCells(placement.position[0], placement.position[1], placement.size) ?? [];

const designerInput = (placement: CropPlacement, index: number): DesignerPlacement => ({
  id: `delay-input:${index}:${placement.crop}:${placement.position.join(",")}`,
  cropId: placement.crop,
  cropName: placement.crop,
  size: placement.size,
  position: placement.position,
  isMutation: false,
});

const designerTarget = (placement: MutationResult, index: number): DesignerPlacement => ({
  id: `delay-target:${index}:${placement.mutation}:${placement.position.join(",")}`,
  cropId: placement.mutation,
  cropName: placement.mutation,
  size: placement.size,
  position: placement.position,
  isMutation: true,
});

const countBy = (ids: readonly string[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
  return counts;
};

/** How many currently-unsatisfied target requirements one placement advances. */
const placementGain = (
  cell: number,
  crop: string,
  constraints: Constraint[],
  countFor: (constraint: Constraint) => number,
): number => constraints.reduce(
  (gain, constraint) => gain + (
    constraint.crop === crop &&
    constraint.cells.includes(cell) &&
    countFor(constraint) < constraint.need
      ? 1
      : 0
  ),
  0,
);

/**
 * Minimum extra base-crop assignment for fixed mutation spawn cells.
 *
 * Each (target, crop) requirement is a small quota over an eight-cell ring.
 * Branching on the tightest unmet quota and trying the highest-sharing cells
 * first finds the minimum for the ordinary one-cell mutation families in a
 * few dozen nodes. A hard node ceiling protects the render path on novel data;
 * the greedy legal answer remains available if exact minimisation runs out.
 */
const coverRequirements = (
  constraints: Constraint[],
  fixed: Map<number, string>,
  reserved: Set<number>,
  budget: SearchBudget,
): Map<number, string> | null => {
  const selected = new Map<number, string>();
  const countFor = (constraint: Constraint): number => constraint.cells.reduce(
    (count, cell) => count + (
      fixed.get(cell) === constraint.crop || selected.get(cell) === constraint.crop ? 1 : 0
    ),
    0,
  );
  const unresolved = (): Constraint[] => constraints.filter((constraint) => countFor(constraint) < constraint.need);
  const candidatesFor = (constraint: Constraint): number[] => constraint.cells.filter((cell) =>
    !reserved.has(cell) &&
    !fixed.has(cell) &&
    !selected.has(cell)
  );

  // A quick feasible ceiling. A greedy dead end can still have an exact
  // solution when two different crops compete for the same available cells.
  while (true) {
    if (budget.signal?.aborted) return null;
    const pending = unresolved();
    if (!pending.length) break;
    let best: { cell: number; crop: string; gain: number } | null = null;
    for (const constraint of pending) {
      for (const cell of candidatesFor(constraint)) {
        const gain = placementGain(cell, constraint.crop, constraints, countFor);
        if (!best || gain > best.gain || (gain === best.gain && cell < best.cell)) {
          best = { cell, crop: constraint.crop, gain };
        }
      }
    }
    if (!best || best.gain <= 0) break;
    selected.set(best.cell, best.crop);
  }

  let best: Map<number, string> | null = unresolved().length ? null : new Map(selected);
  selected.clear();
  const seen = new Set<string>();
  const visit = () => {
    if (budget.signal?.aborted || budget.remaining-- <= 0 || (best && selected.size >= best.size)) return;
    const pending = unresolved();
    if (!pending.length) {
      best = new Map(selected);
      return;
    }

    const viable = pending
      .map((constraint) => ({ constraint, candidates: candidatesFor(constraint) }))
      .sort((left, right) =>
        left.candidates.length - right.candidates.length ||
        (left.constraint.need - countFor(left.constraint)) - (right.constraint.need - countFor(right.constraint))
      );
    const { constraint, candidates } = viable[0];
    if (candidates.length < constraint.need - countFor(constraint)) return;

    candidates.sort((left, right) => {
      const gain = placementGain(right, constraint.crop, constraints, countFor) -
        placementGain(left, constraint.crop, constraints, countFor);
      return gain || left - right;
    });

    for (const cell of candidates) {
      selected.set(cell, constraint.crop);
      const signature = [...selected.entries()]
        .sort(([left], [right]) => left - right)
        .map(([at, crop]) => `${at}:${crop}`)
        .join("|");
      if (!seen.has(signature)) {
        seen.add(signature);
        visit();
      }
      selected.delete(cell);
      if (budget.remaining <= 0) break;
    }
  };

  visit();
  return best;
};

/**
 * Fold one directly-planted mutation tier into the field above it.
 *
 * This first implementation is deliberately bounded to mutation inputs whose
 * own requirements are ordinary 1x1 base crops. Those are the cases the game
 * can prove from a static field without inventing a special mechanic or a
 * multi-generation search. Deeper chains remain separate phases until every
 * intermediate wave can be validated with the same rigor.
 */
const buildFixedDelayedGrowthLayout = (
  direct: SolveResponse,
  finalMutationId: string,
  data: Dataset,
  cells: readonly [number, number][],
  budget: SearchBudget,
): DelayedGrowthLayout | null => {
  const finalIds = new Set([finalMutationId]);
  const finalTargets = direct.mutations.filter((placement) => finalIds.has(placement.mutation));
  if (!finalTargets.length || finalTargets.some((target) => !data.mutations[target.mutation])) return null;

  const usable = new Set(cells.map(([row, col]) => row * 10 + col));
  const occupied = new Set<number>();
  for (const placement of [...direct.placements, ...direct.mutations]) {
    const footprint = placementCells(placement);
    if (!footprint.length || footprint.some((cell) => !usable.has(cell) || occupied.has(cell))) return null;
    footprint.forEach((cell) => occupied.add(cell));
  }

  // Only fold mutations the requested target actually consumes. Solver fields
  // can also contain mutations chosen for an effect or another packing benefit;
  // turning those into future spawn spaces would create work the dependency
  // route never asked for and could reintroduce the redundant plants this mode
  // exists to remove.
  const convertible = direct.placements.filter((placement) => {
    const mutation = data.mutations[placement.crop];
    return Boolean(
      mutation &&
      !mutation.special &&
      mutation.size === placement.size &&
      finalTargets.some((target) =>
        data.mutations[target.mutation].requirements.some((requirement) => requirement.crop === placement.crop) &&
        ringCells(...target.position, target.size).some((cell) => placementCells(placement).includes(cell))
      ) &&
      mutation.requirements.length > 0 &&
      mutation.requirements.every((requirement) => {
        const crop = data.crops[requirement.crop];
        return crop?.size === 1 && !data.mutations[requirement.crop];
      })
    );
  });
  if (!convertible.length || convertible.length > 16) return null;

  const candidates = new Set(convertible);
  const fixed = new Map<number, string>();
  for (const placement of direct.placements.filter((placement) => !candidates.has(placement))) {
    for (const cell of placementCells(placement)) fixed.set(cell, placement.crop);
  }

  const reserved = new Set<number>();
  for (const target of [...direct.mutations, ...convertible.map((placement) => ({
    mutation: placement.crop,
    position: placement.position,
    size: placement.size,
  }))]) {
    for (const cell of placementCells(target)) reserved.add(cell);
    if (data.mutations[target.mutation]?.special === "requires_zero_adjacent") {
      ringCells(...target.position, target.size).forEach((cell) => reserved.add(cell));
    }
  }

  const eligible = convertible.flatMap((placement, index) => {
    const mutation = data.mutations[placement.crop];
    const cells = ringCells(placement.position[0], placement.position[1], placement.size)
      .filter((cell) => usable.has(cell));
    const constraints: Constraint[] = mutation.requirements.map((requirement) => ({
      target: `${index}:${placement.crop}:${placement.position.join(",")}`,
      crop: requirement.crop,
      need: requirement.count,
      cells,
    }));
    const added = coverRequirements(constraints, fixed, reserved, budget);
    return added ? [{ placement, constraints, helperCount: added.size }] : [];
  });
  if (!eligible.length) return null;

  // A boxed-in placement stays planted, without vetoing its neighbours. Try
  // all feasible conversions together first, retaining shared helper crops.
  // If their helpers compete for space, keep a jointly legal subset instead.
  // Every attempt shares one search budget so partial conversion cannot turn
  // a crowded field into many independent expensive searches.
  let chosen = eligible;
  let added = coverRequirements(chosen.flatMap((entry) => entry.constraints), fixed, reserved, budget);
  if (!added) {
    chosen = [];
    for (const entry of [...eligible].sort((a, b) => a.helperCount - b.helperCount)) {
      const next = [...chosen, entry];
      const helpers = coverRequirements(next.flatMap((candidate) => candidate.constraints), fixed, reserved, budget);
      if (!helpers) continue;
      chosen = next;
      added = helpers;
    }
  }
  if (!added || !chosen.length) return null;

  const converting = new Set(chosen.map((entry) => entry.placement));
  const fixedPlacements = direct.placements.filter((placement) => !converting.has(placement));

  const addedPlacements: CropPlacement[] = [...added.entries()]
    .sort(([left], [right]) => left - right)
    .map(([cell, crop]) => ({ crop, position: [rowOf(cell), colOf(cell)], size: 1 }));
  const inputs = [...fixedPlacements, ...addedPlacements];
  const intermediateTargets: MutationResult[] = [...converting].map((placement) => ({
    mutation: placement.crop,
    position: placement.position,
    size: placement.size,
  }));
  const targets = [...intermediateTargets, ...direct.mutations];

  // The same dependency-wave validator that powers Hybrid is the acceptance
  // gate. A proposed layout that cannot reach every target never leaves this
  // function, even if the covering search thought its local quotas were met.
  const evaluated = evaluateMutationTargets(
    inputs.map(designerInput),
    targets.map(designerTarget),
    Object.values(data.mutations),
  );
  if ([...evaluated.values()].some((entry) => entry.state === "invalid")) return null;
  if (!direct.mutations.some((target, index) =>
    finalIds.has(target.mutation) &&
    (evaluated.get(designerTarget(target, intermediateTargets.length + index).id)?.delay ?? 0) >= 1
  )) return null;

  const byWave = new Map<number, MutationResult[]>();
  targets.forEach((target, index) => {
    const state = evaluated.get(designerTarget(target, index).id);
    if (!state || state.delay === null) return;
    const wave = byWave.get(state.delay) ?? [];
    wave.push(target);
    byWave.set(state.delay, wave);
  });
  const stages = [...byWave.entries()]
    .sort(([left], [right]) => left - right)
    .map(([wave, mutations]) => ({ wave, mutations }));
  const totalCells = inputs.reduce((sum, placement) => sum + placement.size * placement.size, 0) +
    targets.reduce((sum, placement) => sum + placement.size * placement.size, 0);

  return {
    displayResult: {
      status: "DELAYED",
      total_cells_used: totalCells,
      placements: inputs,
      mutations: targets,
      solver_approach: "validated delayed-growth overlay",
    },
    stages,
    grownInPlace: countBy([...converting].map((placement) => placement.crop)),
    addedInputs: countBy(addedPlacements.map((placement) => placement.crop)),
    mergedWaves: Math.max(0, ...stages.map((stage) => stage.wave)),
  };
};

const ordinaryDependency = (id: string, data: Dataset): boolean => {
  const mutation = data.mutations[id];
  return Boolean(mutation && !mutation.special && mutation.requirements.length &&
    mutation.requirements.every((requirement) =>
      data.crops[requirement.crop]?.size === 1 && !data.mutations[requirement.crop]
    ));
};

const supportsTarget = (
  placement: { position: [number, number]; size: number },
  crop: string,
  target: MutationResult,
  data: Dataset,
): boolean => Boolean(data.mutations[target.mutation]?.requirements.some((requirement) => requirement.crop === crop)) &&
  ringCells(...target.position, target.size).some((cell) => placementCells(placement).includes(cell));

/** Move one crowded goal and its inputs together, then re-cover its helpers. */
const rearrangeDelayedGrowthLayout = (
  direct: SolveResponse,
  finalId: string,
  data: Dataset,
  cells: readonly [number, number][],
  budget: SearchBudget,
): DelayedGrowthLayout | null => {
  const finals = direct.mutations.filter((target) => target.mutation === finalId);
  if (!finals.length || data.mutations[finalId]?.special) return null;
  const movingInputs = direct.placements.filter((placement) =>
    finals.some((target) => supportsTarget(placement, placement.crop, target, data))
  );
  const blocked = movingInputs.filter((placement) => ordinaryDependency(placement.crop, data));
  if (!blocked.length || movingInputs.some((placement) => placement.locked)) return null;

  const movingTargets = direct.mutations.filter((placement) => !finals.includes(placement) &&
    finals.some((target) => supportsTarget(placement, placement.mutation, target, data))
  );
  // Existing future inputs must keep their proven one-tier growth behavior.
  // Moving an unsupported deeper chain would require another kind of search.
  if (movingTargets.some((target) => !ordinaryDependency(target.mutation, data)) ||
      blocked.length + movingTargets.length > 16) return null;

  const stationaryTargets = direct.mutations.filter((target) => !finals.includes(target) && !movingTargets.includes(target));
  const helperTargets = [...movingTargets, ...blocked.map((placement) => ({
    mutation: placement.crop, position: placement.position, size: placement.size,
  }))];
  // Helpers shared with another target stay where they are. Exclusive helpers
  // can be reassigned instead of leaving an unused copy at the old location.
  const movableHelpers = direct.placements.filter((placement) => !placement.locked &&
    !data.mutations[placement.crop] && !movingInputs.includes(placement) &&
    helperTargets.some((target) => supportsTarget(placement, placement.crop, target, data)) &&
    !stationaryTargets.some((target) => supportsTarget(placement, placement.crop, target, data))
  );
  const fixedInputs = direct.placements.filter((placement) =>
    !movingInputs.includes(placement) && !movableHelpers.includes(placement)
  );
  const movableInputs: CropPlacement[] = [...movingInputs, ...movingTargets.map((target) => ({
    crop: target.mutation, position: target.position, size: target.size,
  }))];
  const fixedCells = new Set([...fixedInputs, ...stationaryTargets].flatMap(placementCells));
  for (const target of stationaryTargets) {
    if (data.mutations[target.mutation]?.special === "requires_zero_adjacent") {
      ringCells(...target.position, target.size).forEach((cell) => fixedCells.add(cell));
    }
  }
  const usable = new Set(cells.map(([row, col]) => row * 10 + col));
  const offsets = FULL_PLOT.map(([row, col]) => [
    row - finals[0].position[0], col - finals[0].position[1],
  ] as [number, number]).filter(([row, col]) => row !== 0 || col !== 0)
    .sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));

  for (const [dr, dc] of offsets) {
    if (budget.signal?.aborted || budget.remaining <= 0 || budget.relocations-- <= 0) break;
    const move = <T extends { position: [number, number] }>(placement: T): T => ({
      ...placement, position: [placement.position[0] + dr, placement.position[1] + dc],
    });
    const inputs = movableInputs.map(move);
    const targets = finals.map(move);
    const movedCells = [...inputs, ...targets].map(placementCells);
    if (movedCells.some((footprint) => !footprint.length ||
        footprint.some((cell) => !usable.has(cell) || fixedCells.has(cell)))) continue;

    const candidate: SolveResponse = {
      ...direct, placements: [...fixedInputs, ...inputs], mutations: [...stationaryTargets, ...targets],
    };
    const delayed = buildFixedDelayedGrowthLayout(candidate, finalId, data, cells, budget);
    if (!delayed) continue;
    // Reinterpreting an existing growth target as planted would be a downgrade.
    // Require the entire moved ordinary tier to grow, including blocked inputs.
    if (!inputs.filter((placement) => ordinaryDependency(placement.crop, data)).every((placement) =>
      delayed.displayResult.mutations.some((target) => target.mutation === placement.crop &&
        target.position[0] === placement.position[0] && target.position[1] === placement.position[1])
    )) continue;
    return delayed;
  }
  return null;
};

/** Grow eligible inputs in place, rearranging a crowded dependency group when needed. */
export const buildDelayedGrowthLayout = (
  direct: SolveResponse,
  finalMutationId: string | readonly string[],
  data: Dataset,
  cells: readonly [number, number][] = FULL_PLOT,
  signal?: AbortSignal,
): DelayedGrowthLayout | null => {
  if (signal?.aborted) return null;
  const usable = new Set(cells.map(([row, col]) => row * 10 + col));
  const occupied = new Set<number>();
  for (const placement of [...direct.placements, ...direct.mutations]) {
    const footprint = placementCells(placement);
    if (!footprint.length || footprint.some((cell) => !usable.has(cell) || occupied.has(cell))) return null;
    footprint.forEach((cell) => occupied.add(cell));
  }
  const budget = { remaining: 80_000, relocations: 100, signal };
  let delayed: DelayedGrowthLayout | null = null;
  for (const id of new Set(typeof finalMutationId === "string" ? [finalMutationId] : finalMutationId)) {
    const current = delayed?.displayResult ?? direct;
    const fixed = buildFixedDelayedGrowthLayout(current, id, data, cells, budget);
    const moved = rearrangeDelayedGrowthLayout(fixed?.displayResult ?? current, id, data, cells, budget);
    delayed = moved ?? fixed ?? delayed;
  }
  if (!delayed || signal?.aborted) return null;
  const before = countBy(direct.placements.map((placement) => placement.crop));
  const after = countBy(delayed.displayResult.placements.map((placement) => placement.crop));
  delayed.grownInPlace = Object.fromEntries(Object.entries(before)
    .filter(([id, count]) => data.mutations[id] && count > (after[id] ?? 0))
    .map(([id, count]) => [id, count - (after[id] ?? 0)]));
  delayed.addedInputs = Object.fromEntries(Object.entries(after)
    .filter(([id, count]) => count > (before[id] ?? 0))
    .map(([id, count]) => [id, count - (before[id] ?? 0)]));
  return delayed;
};

/**
 * Price the bounded two-wave layout produced above.
 *
 * Returns null instead of a decorative estimate when the layout contains a
 * mechanic-only mutation, a deeper wave, or a demand that does not fit the
 * displayed field. Those cases stay on the direct planner path until their
 * mechanics can be modelled rather than guessed.
 */
export const estimateDelayedGrowthTiming = (
  layout: DelayedGrowthLayout,
  finalMutationId: string,
  finalNeed: number,
  data: Dataset,
  settings: DelayedGrowthTimingSettings = {},
): DelayedGrowthTiming | null => {
  if (layout.stages.some((stage) => stage.wave > 1)) return null;

  const finalMutation = data.mutations[finalMutationId];
  const finalSpots = layout.displayResult.mutations.filter(
    (placement) => placement.mutation === finalMutationId,
  ).length;
  if (!finalMutation || finalNeed <= 0 || finalNeed > finalSpots) return null;

  const firstWave = layout.stages.find((stage) => stage.wave === 0)?.mutations ?? [];
  if (!firstWave.length) return null;

  const grouped = new Map<string, number>();
  for (const target of firstWave) grouped.set(target.mutation, (grouped.get(target.mutation) ?? 0) + 1);

  const groups = [...grouped.entries()].map(([id, count]) => {
    const mutation = data.mutations[id];
    if (!mutation) return null;
    const chance = spawnChance(id, mutation.requirements, settings);
    if (!(chance > 0)) return null;
    const inputStages = mutation.requirements.reduce((longest, requirement) => {
      const input = data.crops[requirement.crop] ?? data.mutations[requirement.crop];
      return Math.max(longest, input?.growth_stages ?? 0);
    }, 0);
    const fill = fillCycleEstimate(count, chance, count);
    if (!Number.isFinite(fill.expectedCycles) || !Number.isFinite(fill.p90Cycles)) return null;
    const offset = (inputStages > 0 ? inputStages - 1 : 0) + (mutation.growth_stages ?? 0);
    return {
      id,
      count,
      chance,
      offset,
      expectedReadyCycle: offset + fill.expectedCycles,
      p90ReadyCycle: offset + fill.p90Cycles,
    };
  });
  if (groups.some((group) => group === null)) return null;
  const timedGroups = groups.filter((group): group is NonNullable<typeof group> => group !== null);

  // Crops that remain literal placements can support the final roll on their
  // own maturation tick. Intermediates created by a roll become usable on the
  // following tick, so their ready cycle is the floor directly.
  const directInputStages = layout.displayResult.placements.reduce((longest, placement) => {
    const input = data.crops[placement.crop] ?? data.mutations[placement.crop];
    return Math.max(longest, input?.growth_stages ?? 0);
  }, 0);
  const directFloor = Math.max(0, directInputStages - 1);
  const dependencyCdf = (cycles: number): number => {
    if (cycles < directFloor) return 0;
    return timedGroups.reduce((probability, group) => probability * probabilityFilledWithin(
      group.count,
      group.chance,
      group.count,
      cycles - group.offset,
    ), 1);
  };
  const dependency = distributionFromCdf(dependencyCdf);
  if (!dependency) return null;

  const finalChance = spawnChance(finalMutationId, finalMutation.requirements, settings);
  if (!(finalChance > 0)) return null;
  const finalFill = fillCycleEstimate(finalSpots, finalChance, finalNeed);
  if (!Number.isFinite(finalFill.expectedCycles) || !Number.isFinite(finalFill.p90Cycles)) return null;
  const finalCdf = (cycles: number): number => probabilityFilledWithin(
    finalSpots,
    finalChance,
    finalNeed,
    cycles,
  );
  const mutationGrowth = Math.max(0, finalMutation.growth_stages ?? 0);

  return {
    expectedCycles: Math.max(1, dependency.expected + finalFill.expectedCycles + mutationGrowth),
    varianceCycles2: dependency.variance + finalFill.varianceCycles2,
    p50Cycles: Math.max(1, quantileOfSum(dependency, finalCdf, mutationGrowth, 0.5)),
    p90Cycles: Math.max(1, quantileOfSum(dependency, finalCdf, mutationGrowth, 0.9)),
    dependencyExpectedCycle: dependency.expected,
    finalRollExpectedCycles: finalFill.expectedCycles,
    finalRollP90Cycles: finalFill.p90Cycles,
    groups: timedGroups.map(({ id, count, expectedReadyCycle, p90ReadyCycle }) => ({
      id,
      count,
      expectedReadyCycle,
      p90ReadyCycle,
    })),
  };
};
