import type {
  CropPlacement,
  LockDefinition,
  MutationGoal,
  MutationResult,
  SolveResponse,
} from "../types/greenhouse";
import { SPECIALS } from "../planner/specials.ts";
import { anneal, polish } from "./anneal.ts";
import { Field } from "./field.ts";
import { colOf, ringCells, rowOf } from "./grid.ts";
import { selectBlocks } from "./inner.ts";
import { BadRequestError, compileProblem, isLayoutImpossible, upperBoundFor } from "./problem.ts";
import type { Problem, SolverDataset } from "./problem.ts";
import { mulberry32 } from "./rng.ts";
import type { Rng } from "./rng.ts";
import { buildSeeds } from "./seeds.ts";
import { buildChainCandidate, plantedCount, selectCompactAnchors } from "./smallTarget.ts";
import { solveMultiCell } from "./multiCell.ts";

export type { SolverDataset } from "./problem.ts";
export { validateSolveResponse } from "./validate.ts";
export type { ValidationReport } from "./validate.ts";
/*
 * How a question is phrased is part of the solver's public surface, not each
 * caller's private business. See request.ts for the divergence that made this
 * a rule rather than a preference.
 */
export {
  FULL_PLOT,
  isShippedConfiguration,
  requirementGoal,
  shippedSolveOptions,
  solveGoal,
  solveGoals,
  tuningKeysSet,
} from "./request.ts";

export interface LocalSolveOptions {
  seed?: number;
  iterations?: number;
  timeBudgetMs?: number;
  removeUnusedCrops?: boolean;
  /*
   * `uniqueCrops` USED TO LIVE HERE and is deliberately gone.
   *
   * It is a GROWTH RATE input: how fast a stage ticks, per
   * data/uniqueCropsStore.ts. It never changed which cells get planted, and the
   * comment here said so. But the solver still ACCEPTED it, so it was tokenised
   * into the cache key and it disqualified the request from the shipped
   * precompute, and the solver page sent it on every solve because the setting
   * defaults above zero.
   *
   * The result was a phantom: turning the unique-crops dial changed nothing
   * about the layout and yet changed the answer on screen, because it pushed
   * the request off the precompute and onto a cold search. Ashwreath came back
   * 51 instead of the 52 we ship.
   *
   * Documented inertness is not inertness. An option the search never reads has
   * no business being part of the question, so it is not in the type at all now
   * and cannot be passed. Growth timing reads the store directly, which is
   * where it always belonged.
   */
  /** Crops and mutations the player pinned to the grid. The search works around them. */
  locks?: LockDefinition[];
  /**
   * Rank per mutation, 1 to 34, higher is more valuable. A tie-break between
   * layouts with the same total spawn count on a multi-target solve; provably
   * inert on a single-target solve (see Field.priorityValue).
   */
  priorities?: Record<string, number>;
  onProgress?: (best: number, elapsedMs: number) => void;
}

/**
 * Deterministic defaults. The time budget is a safety valve, not the schedule:
 * the search is bounded by ITERATIONS so the same seed and budget give the same
 * answer on a fast machine and a slow one.
 */
const DEFAULTS = {
  seed: 0x5eed_1234,
  iterations: 2_600_000,
  /**
   * Chosen by measurement, at the knee of the quality curve.
   *
   * This matters because the planner does not solve one mutation, it solves a
   * BURST: roughly 30 single-target plots back to back to build its
   * per-mutation economics. At a 10 second ceiling that burst took 18.8
   * seconds of wall clock, nearly all of it in the slack family (soggybud
   * 2495ms, ashwreath 2158ms, veilshroom 1921ms), which was slow enough to be
   * noticed and complained about.
   *
   * Sweeping the ceiling against the parity harness, holding everything else
   * fixed:
   *     700ms  -> 24 matched, median  95ms, worst  867ms
   *   2_500ms  -> 27 matched, median 165ms, worst 2.4s
   *  10_000ms  -> 27 matched, median 253ms, worst 4.9s
   * So 2.5s buys every point that 10s buys and caps the worst case at about a
   * quarter of it. Below roughly a second the slack family starts genuinely
   * losing spawns, so this is not a free dial to keep turning down.
   *
   * The full-ring family is unaffected at any of these settings: it exits
   * constructively in 1 to 200ms with a provable optimum, long before a
   * ceiling is reached.
   */
  timeBudgetMs: 2_500,
  seedsToPolish: 6,
  maskKeep: 20,
  randomSeeds: 10,
  paintPasses: 3,
  /**
   * Cold on the spawn scale on purpose: exp(-1/0.35) is about 5%, so giving up
   * a spawn is rare. A warmer schedule measurably destroyed the full-ring
   * lattices, which are rigid enough that any loss is unrecoverable by drift.
   */
  startTemperature: 0.35,
  endTemperature: 0.04,
  reheatAfter: 4_000,
  kickSize: 6,
  /**
   * Ruin-and-recreate: a stalled search clears a 3x3 window and rebuilds it.
   *
   * Measured, on the slack family: scattered single-cell kicks left five of
   * them one short (71 against 72), because the annealer just repairs each cell
   * locally and returns to the same packing. Clearing a whole region took
   * choconut, scourroot, veilshroom, gloomgourd and shadevine to 72 and
   * witherbloom to 52. Windows of 4 and 5 were both measurably worse than 3.
   */
  kickWindow: 3,
} as const;

const emptyResponse = (status: string, approach: string): SolveResponse => ({
  status,
  total_cells_used: 0,
  placements: [],
  mutations: [],
  solver_approach: approach,
});

/**
 * Drops planted crops that no placed spawn actually needs.
 *
 * The planner costs a plot by what it plants, so surplus has to genuinely go
 * rather than being hidden. Removal is one cell at a time with a full re-check,
 * because crops are shared between spawns: a cell that looks redundant for one
 * mutation may be the fourth dead_plant another one is counting on. Locked
 * crops are never touched - they are not in `plantable` at all, so this cannot
 * strip something the player pinned even by accident.
 */
const pruneUnusedCrops = (field: Field, problem: Problem, chosen: number[]): void => {
  const stillLegal = (): boolean => chosen.every((ai) => field.isSatisfied(ai));
  if (!stillLegal()) return;
  for (const cell of problem.plantable) {
    const crop = field.cells[cell];
    if (crop < 0) continue;
    field.set(cell, -1);
    if (!stillLegal()) field.set(cell, crop);
  }
};

/**
 * Two-for-one support exchanges: remove a PAIR of same-crop cells and try one
 * replacement cell that serves every spawn the pair was carrying.
 *
 * The standing objective is most mutations grown first, fewest cells planted
 * second. The search only optimises the first;
 * pruning only removes cells no spawn needs at all. Neither can find the
 * arrangement where one well-placed crop does the work of two - the exact gap
 * measured against the remote on choconut, 27 cocoa beans against
 * their 26 for the same 72 spawns. This pass closes that shape of gap without
 * ever risking a spawn: the chosen anchors must all stay satisfied through
 * every step, checked through the same Field counters as everything else.
 *
 * A pair whose removal breaks nothing is also kept removed - that is a
 * genuine double surplus single-cell pruning cannot see, because each cell
 * alone looked load bearing.
 */
const minimizeSupports = (field: Field, problem: Problem, chosen: number[]): void => {
  const stillLegal = (): boolean => chosen.every((ai) => field.isSatisfied(ai));
  if (!stillLegal()) return;
  const chosenSet = new Set(chosen);

  /*
   * Bounded by WORK, not by the clock. The first version took a wall-clock
   * slice, and under CPU load two solves of the identical question did
   * different amounts of polish and returned different layouts - the
   * determinism the whole solver promises (and two tests pin) broke on the
   * machine's mood. Every improvement either removes a cell or strictly
   * raises a cell's load, both monotone and bounded, so a generous fixed cap
   * terminates deterministically in milliseconds.
   */
  let budget = 200;

  /**
   * How many chosen spawns a planted cell feeds. Relocating a crop toward
   * higher load concentrates the work onto fewer cells, which is what
   * manufactures the surplus the exchange step below cashes in - the remote's
   * thrifty layouts run almost every support at 7 of its 8 possible spawns.
   */
  const loadOf = (cell: number): number => {
    let n = 0;
    for (const ai of problem.anchorsOnRing[cell]) if (chosenSet.has(ai)) n++;
    return n;
  };

  const relocateForLoad = (): boolean => {
    let moved = false;
    for (const cell of problem.plantable) {
      const crop = field.cells[cell];
      if (crop < 0) continue;
      const from = loadOf(cell);
      for (const to of problem.plantable) {
        if (field.cells[to] >= 0 || loadOf(to) <= from) continue;
        field.set(cell, -1);
        field.set(to, crop);
        if (stillLegal()) {
          moved = true;
          break;
        }
        field.set(to, -1);
        field.set(cell, crop);
      }
    }
    return moved;
  };

  let improved = true;
  while (improved && budget > 0) {
    improved = false;
    const planted = problem.plantable.filter((cell) => field.cells[cell] >= 0);

    search: for (let i = 0; i < planted.length; i++) {
      for (let j = i + 1; j < planted.length; j++) {
        const a = planted[i];
        const b = planted[j];
        const crop = field.cells[a];
        if (crop < 0 || field.cells[b] !== crop) continue;

        field.set(a, -1);
        field.set(b, -1);

        const broken: number[] = [];
        for (const cell of [a, b]) {
          for (const ai of problem.anchorsOnRing[cell]) {
            if (chosenSet.has(ai) && !field.isSatisfied(ai) && !broken.includes(ai)) broken.push(ai);
          }
        }

        if (broken.length === 0) {
          improved = true;
          budget--;
          break search;
        }

        // A replacement has to sit on every broken spawn's ring at once.
        let candidates = [...problem.anchors[broken[0]].ring];
        for (let k = 1; k < broken.length; k++) {
          const ring = new Set(problem.anchors[broken[k]].ring);
          candidates = candidates.filter((cell) => ring.has(cell));
        }
        let placed = false;
        for (const z of candidates) {
          if (field.cells[z] >= 0) continue;
          field.set(z, crop);
          if (stillLegal()) {
            placed = true;
            break;
          }
          field.set(z, -1);
        }
        if (placed) {
          improved = true;
          budget--;
          break search;
        }

        field.set(a, crop);
        field.set(b, crop);
      }
    }

    // Exchanges dry? Concentrate load and try once more before giving up.
    if (!improved && budget > 0 && relocateForLoad()) {
      improved = true;
      budget--;
    }
  }
};

/**
 * Builds one seed that honours every finite target before the joint search
 * tries to improve it. A sum-only objective can otherwise spend the whole
 * plot on the largest request: 37 Veilshroom + 1 Magic Jellybean returned 37
 * Veilshroom and a half-built Jellybean ring. More iterations cannot cross
 * that valley because temporarily losing one Veilshroom is scored as a loss.
 *
 * The rigid targets go first. Their solved crops are pinned while the next
 * target is laid out, and their spawn cells are removed from the remaining
 * plot. The finished crop field is then handed back to the ordinary joint
 * selector and validator; this is a seed, not a second source of truth.
 */
const buildRequiredSequenceSeed = (
  cells: [number, number][],
  problem: Problem,
  cappedBounds: number[],
  dataset: SolverDataset,
  options: LocalSolveOptions,
  iterationBudget: number,
  deadline: number,
): Int16Array | null => {
  if (
    problem.targets.length < 2 ||
    problem.targets.some((target) => target.required <= 0) ||
    (options.locks?.length ?? 0) > 0
  ) {
    return null;
  }

  const stages = problem.targets
    .map((target, index) => ({ target, index, count: Math.floor(cappedBounds[index]) }))
    .filter((stage) => stage.count > 0)
    .sort((left, right) => {
      const leftRigidity = left.target.zeroAdjacent ? 2 : left.target.fullRing ? 1 : 0;
      const rightRigidity = right.target.zeroAdjacent ? 2 : right.target.fullRing ? 1 : 0;
      return (
        rightRigidity - leftRigidity ||
        right.target.size - left.target.size ||
        left.count - right.count ||
        right.target.reqSum - left.target.reqSum ||
        left.index - right.index
      );
    });
  if (stages.length !== problem.targets.length) return null;

  const reserved = new Set<number>();
  let available = cells.slice();
  let locks: LockDefinition[] = [];
  const stageIterations = Math.max(50_000, Math.floor(iterationBudget / stages.length));

  for (const { target, count } of stages) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) return null;
    const result = solveLocal(
      available,
      [{ mutation: target.id, maximize: false, count }],
      dataset,
      {
        seed: options.seed ?? DEFAULTS.seed,
        iterations: stageIterations,
        timeBudgetMs: remainingMs,
        removeUnusedCrops: true,
        locks,
      },
    );
    const produced = result.mutations.filter((mutation) => mutation.mutation === target.id);
    if (produced.length < count) return null;

    locks = result.placements.map((placement) => ({
      name: placement.crop,
      size: placement.size,
      position: placement.position,
    }));
    for (const mutation of produced.slice(0, count)) {
      const [row, col] = mutation.position;
      for (let dr = 0; dr < mutation.size; dr++) {
        for (let dc = 0; dc < mutation.size; dc++) reserved.add((row + dr) * 10 + col + dc);
      }
      if (target.zeroAdjacent) {
        for (const cell of ringCells(row, col, mutation.size)) reserved.add(cell);
      }
    }
    available = cells.filter(([row, col]) => !reserved.has(row * 10 + col));
  }

  const field = new Field(problem);
  for (const lock of locks) {
    const crop = problem.paletteIndex.get(lock.name);
    if (crop === undefined) continue;
    const [row, col] = lock.position;
    for (let dr = 0; dr < lock.size; dr++) {
      for (let dc = 0; dc < lock.size; dc++) {
        const cell = (row + dr) * 10 + col + dc;
        if (problem.plantableMask[cell]) field.set(cell, crop);
      }
    }
  }

  const selection = selectBlocks(field, problem);
  return problem.targets.every((_, index) => selection.perTarget[index] >= cappedBounds[index])
    ? field.snapshot()
    : null;
};

/**
 * Seed, anneal, polish. Returns the best crop field found.
 *
 * `forced` layouts are always searched even if they rank below the generated
 * seeds. That is what makes the multi-target floor structural: a joint solve is
 * handed the best single-target layout and can only improve on it.
 */
const runSearch = (
  problem: Problem,
  rng: Rng,
  iterations: number,
  deadline: number,
  bound: number,
  forced: Int16Array[],
  compound: boolean,
  onProgress?: (best: number) => void
): Int16Array => {
  const field = new Field(problem);
  const generated = buildSeeds(problem, rng, {
    maskKeep: DEFAULTS.maskKeep,
    randomSeeds: DEFAULTS.randomSeeds,
    paintPasses: DEFAULTS.paintPasses,
  });

  const ranked = generated
    .map((cells, index) => {
      field.load(cells);
      return { index, cells, score: field.score() };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, DEFAULTS.seedsToPolish)
    .map((entry) => entry.cells);

  const queue = [...forced, ...ranked];

  /**
   * Judge candidates by the number we REPORT, not the one we anneal on.
   *
   * `field.score()` is the annealer's gradient: it counts every satisfied spot,
   * which is what gives a hill to climb. `selectBlocks().value` is the answer,
   * and it is smaller, because the spots a field satisfies overlap and the
   * response can only carry a non-overlapping set of them.
   *
   * Keeping the best by score while reporting value is how the joint search
   * came back BELOW a single-target layout it had already been handed as a
   * seed. Measured on the parity harness: ashwreath+veilshroom returned 46 when
   * veilshroom alone reaches 72, and 72 was sitting in `forced` the whole time.
   * A higher-scoring field simply packed satisfied spots that could not all be
   * selected.
   *
   * So value leads. Between equal values, FEWER PLANTED CELLS wins next - the
   * standing objective is most mutations grown, then fewest cells planted
   * (measured against the remote: same 72 choconut, one bean
   * thriftier). Score breaks the remaining ties: between two layouts that
   * report the same at the same cost, the one with more satisfied spots has
   * more room for the annealer to find the next one.
   */
  let bestCells = queue[0];
  let bestScore = -1;
  let bestValue = -1;
  let bestPlanted = Number.POSITIVE_INFINITY;
  const consider = (cells: Int16Array): void => {
    field.load(cells);
    const score = field.score();
    const selection = selectBlocks(field, problem);
    const value = selection.value;
    // The bill is what survives pruning, so candidates are compared on their
    // PRUNED cost; the raw field would punish surplus the answer never ships.
    // The winner's cells stay unpruned here - the answer path prunes again.
    pruneUnusedCrops(field, problem, selection.anchors);
    const planted = plantedCount(field);
    if (
      value > bestValue ||
      (value === bestValue && planted < bestPlanted) ||
      (value === bestValue && planted === bestPlanted && score > bestScore)
    ) {
      bestValue = value;
      bestScore = score;
      bestPlanted = planted;
      bestCells = cells;
    }
  };
  for (const start of queue) consider(start);

  const perSeed = Math.floor(iterations / Math.max(1, queue.length));
  for (const start of queue) {
    if (Date.now() > deadline) break;
    field.load(start);
    const result = anneal(field, problem, rng, {
      iterations: perSeed,
      startTemperature: DEFAULTS.startTemperature,
      endTemperature: DEFAULTS.endTemperature,
      targetHard: bound,
      deadline,
      reheatAfter: DEFAULTS.reheatAfter,
      kickSize: DEFAULTS.kickSize,
      kickWindow: DEFAULTS.kickWindow,
      compound,
    });

    // Exhaustive single-cell finish. The annealer plateaus a move or two short
    // surprisingly often, and this closes exactly that gap cheaply.
    field.load(result.bestCells);
    polish(field, problem, 8);
    // Snapshot before considering: `consider` reloads the field, and handing it
    // a live buffer would file a reference to something about to change.
    consider(field.snapshot());
    onProgress?.(bestValue);
    if (bestValue >= bound) break;
  }
  return bestCells;
};

/** Re-expresses a crop field from one problem's palette in another's. */
const translate = (from: Problem, cells: Int16Array, to: Problem): Int16Array => {
  const out = Int16Array.from(to.baseline);
  for (let cell = 0; cell < cells.length; cell++) {
    const crop = cells[cell];
    if (crop < 0 || out[cell] >= 0 || !to.plantableMask[cell]) continue;
    const index = to.paletteIndex.get(from.palette[crop]);
    if (index === undefined) continue;
    out[cell] = index;
  }
  return out;
};

const buildResponse = (
  problem: Problem,
  field: Field,
  chosen: number[],
  status: string,
  approach: string
): SolveResponse => {
  const lockedCells = new Set<number>();
  const placements: CropPlacement[] = [];
  for (const lock of problem.lockedCrops) {
    placements.push({ crop: lock.crop, position: [lock.row, lock.col], size: lock.size, locked: true });
    for (let dr = 0; dr < lock.size; dr++) {
      for (let dc = 0; dc < lock.size; dc++) lockedCells.add((lock.row + dr) * 10 + lock.col + dc);
    }
  }
  for (let cell = 0; cell < field.cells.length; cell++) {
    const crop = field.cells[cell];
    if (crop < 0 || lockedCells.has(cell)) continue;
    placements.push({ crop: problem.palette[crop], position: [rowOf(cell), colOf(cell)], size: 1 });
  }

  /**
   * Only spawns this layout actually produces are reported.
   *
   * A locked mutation is something the player has already pinned on the grid.
   * It is an OBSTACLE the search works around - its cells are reserved - not a
   * spawn this plot earns, and echoing it here was wrong twice over. It made
   * the response claim a spawn nothing supports, so validateSolveResponse
   * rightly called the layout illegal ("snoozling at [4,4] needs 4x creambloom
   * but has 0"). And because the results page already draws pinned placements
   * itself, on top of these, echoing them double-counted the pin and inflated
   * the yield the player is shown.
   *
   * The cells stay spoken for either way: they are excluded from `plantable`
   * during compilation and counted below, so the plot is still costed honestly.
   */
  const mutations: MutationResult[] = [];
  for (const ai of chosen) {
    const anchor = problem.anchors[ai];
    mutations.push({
      mutation: problem.targets[anchor.targetIndex].id,
      position: [anchor.row, anchor.col],
      size: anchor.size,
    });
  }

  let used = 0;
  for (const placement of placements) used += placement.size * placement.size;
  for (const spawn of mutations) used += spawn.size * spawn.size;
  for (const lock of problem.lockedMutations) used += lock.size * lock.size;

  return { status, total_cells_used: used, placements, mutations, solver_approach: approach };
};

/**
 * Solves a greenhouse layout locally. Pure and synchronous: same seed, same
 * input, same iteration budget gives a byte-identical response, and nothing
 * here touches React, storage, the network or the DOM, so it runs unchanged in
 * a Web Worker and in bare Node.
 */
export const solveLocal = (
  cells: [number, number][],
  targets: MutationGoal[],
  dataset: SolverDataset,
  options: LocalSolveOptions = {}
): SolveResponse => {
  const started = Date.now();
  const rng = mulberry32(options.seed ?? DEFAULTS.seed);
  const iterationBudget = Math.max(0, options.iterations ?? DEFAULTS.iterations);
  const deadline = started + (options.timeBudgetMs ?? DEFAULTS.timeBudgetMs);
  const compileOptions = { locks: options.locks, priorities: options.priorities };

  const known = targets.filter((goal) => dataset.mutations[goal.mutation]);
  if (known.length === 0) return emptyResponse("INFEASIBLE", "no known target mutation was requested");

  // Multi-cell SUPPORT crops (snoozling 3x3, noctilume 2x2) need block
  // placement, which the main engine does not do - it plants every support on
  // one cell, and every layout it produced for these targets was physically
  // impossible in game, including four it labeled OPTIMAL (disproved
  // against the remote's real layouts; validate.ts now enforces
  // footprints so that class of lie fails legality mechanically). Single
  // targets route to the dedicated block-placement search in multiCell.ts,
  // which matches the remote on all four recorded targets (4/4/11/13).
  // Counting semantics are settled by data: per-cell, not per-instance.
  const multiCellSupports = new Set<string>();
  for (const goal of known) {
    for (const req of dataset.mutations[goal.mutation].requirements) {
      if ((dataset.mutations[req.crop]?.size ?? 1) > 1) multiCellSupports.add(req.crop);
    }
  }
  if (multiCellSupports.size > 0) {
    // Single-target requests route to the dedicated block-placement search;
    // joint requests mixing these targets with others stay refused until the
    // joint machinery learns blocks too.
    if (known.length === 1) {
      return solveMultiCell(cells, known[0], dataset, {
        seed: options.seed ?? DEFAULTS.seed,
        timeBudgetMs: options.timeBudgetMs ?? DEFAULTS.timeBudgetMs,
      });
    }
    const list = [...multiCellSupports].sort().join(", ");
    return emptyResponse(
      "INFEASIBLE",
      `multi-cell support crops (${list}) are not modeled in joint solves yet`
    );
  }

  const plannable = known.filter((goal) => !isLayoutImpossible(dataset.mutations[goal.mutation]));
  if (plannable.length === 0) {
    // Rule 9. These carry empty requirements in the dataset, which is not the
    // same as "free" - treating them as unconstrained fill is how a solver ends
    // up claiming 100 shellfruit from an explosion mechanic.
    const reasons = known
      .map((goal) => `${goal.mutation}: ${SPECIALS[goal.mutation]?.label ?? "not produced by layout"}`)
      .join("; ");
    return emptyResponse("INFEASIBLE", `no adjacency layout can produce this: ${reasons}`);
  }

  let problem: Problem;
  try {
    problem = compileProblem(cells, plannable, dataset, compileOptions);
  } catch (error) {
    if (error instanceof BadRequestError) return emptyResponse("INFEASIBLE", error.message);
    throw error;
  }
  if (problem.targets.length === 0 || problem.anchors.length === 0) {
    return emptyResponse("INFEASIBLE", "no legal position for any target on these cells");
  }

  const cappedBounds = problem.targets.map((target, ti) =>
    Math.min(upperBoundFor(problem, ti), target.cap)
  );
  const totalBound = cappedBounds.reduce((sum, value) => sum + value, 0);

  // Multi-target floor. Solving one target alone is always a legal answer to a
  // multi-target request, so the joint search starts from the best of those and
  // can only improve on it. Without this the joint search can return less than
  // the single-target path it is supposed to generalise, which it did.
  /**
   * Compound surplus-relocation is ON, and ONLY for a coupled single target.
   *
   * The move removes a crop that is surplus somewhere and replants it where it
   * is missing, as one proposal. That pairing is the point: neither half is an
   * improvement alone, so a walk that only ever changes one cell cannot find it.
   *
   * Scoping it took three measurements, and the first two were wrong in
   * instructive ways.
   *
   * It was first scoped to "any single target" on the parity harness seed,
   * 20260802. Re-measured on the seed the app actually ships, that setting is a
   * straight loss. A/B on a full plot, single target, maximize, on
   * DEFAULTS.seed, compound-everywhere against off:
   *
   *   gloomgourd  71 / 72     scourroot   71 / 72
   *   shadevine   71 / 72     veilshroom  71 / 72
   *   witherbloom 51 / 52     choconut    72 / 72
   *   dustgrain   72 / 72     soggybud    51 / 51
   *   ashwreath   51 / 51
   *
   * Five losses, no wins. So it was turned off entirely, which was the second
   * wrong answer: it threw away the one family the move is built for.
   *
   * Look at what separates the two groups and the scoping writes itself. Every
   * mutation it HURTS needs one of each of two crops, or four of a single crop:
   * there is no surplus-and-deficit structure for the move to work with, so it
   * spends proposals that a plain recolour would have used better. The two it
   * HELPS, soggybud and ashwreath, need TWO of each of two crops on the same
   * ring, which is precisely a packing where one crop is over-supplied while
   * the other is short.
   *
   * That is the `coupled` predicate the relaxed-geometry seed below already
   * uses, so the same structural fact now gates both. Measured over 20 seeds
   * with this scoping, soggybud and ashwreath reach their known-good 52 where
   * they never did before, and the five above hold 72, 72, 72, 72 and 52
   * exactly. Scoped by structure rather than by mutation name, so a new
   * two-of-each mutation in the dataset gets the move without an edit here.
   */
  const singleTarget = plannable.length === 1 && problem.targets.length === 1;
  const coupledTarget =
    singleTarget &&
    !problem.targets[0].fullRing &&
    !problem.targets[0].zeroAdjacent &&
    problem.targets[0].requirements.length > 1 &&
    problem.targets[0].reqSum >= 4;
  const compound = coupledTarget;

  const forced: Int16Array[] = [];
  const requiredSequenceSeed = buildRequiredSequenceSeed(
    cells,
    problem,
    cappedBounds,
    dataset,
    options,
    iterationBudget,
    deadline,
  );
  if (requiredSequenceSeed) forced.push(requiredSequenceSeed);
  if (plannable.length > 1) {
    /**
     * FULL QUALITY, HIGHEST BOUND FIRST.
     *
     * These seeds are what makes the multi-target floor real: solving one
     * target alone is always a legal answer to a request for several, so the
     * joint answer should never come back below the best of them.
     *
     * They used to get `iterationBudget / (2 * plannable.length)`, and a
     * starved seed cannot hold up a floor it never reached itself. Measured,
     * single target alone, iterations against the yield it reaches:
     *
     *   veilshroom    650k -> 70    1.3M -> 71    2.6M -> 72
     *   witherbloom   650k -> 51    1.3M -> 52    2.6M -> 52
     *   ashwreath     650k -> 50    1.3M -> 51    2.6M -> 51
     *
     * At 650k, which is exactly the share a two-target request handed out,
     * veilshroom seeds the joint search with 70 and witherbloom with 51. That
     * is the whole of the remaining multi-target gap: ashwreath+veilshroom
     * reported 71 against a floor of 72, snoozling+witherbloom 51 against 52.
     *
     * More wall clock does not fix it, which is worth recording because it was
     * the obvious guess and it is wrong. Holding iterations at the old share
     * and raising the ceiling instead:
     *
     *   ashwreath+veilshroom   2500ms -> 71   5000ms -> 71   12000ms -> 71
     *   snoozling+witherbloom  2500ms -> 51   5000ms -> 51   12000ms -> 51
     *
     * The searches finish their iterations and stop; the budget was never the
     * binding constraint. So each seed now gets the FULL iteration budget.
     *
     * Descending by bound, because a target cannot beat its own upper bound, so
     * the one with the highest bound is the only one that can set a high floor,
     * and it should get its full quality before the deadline can bite. The
     * deadline stays the safety valve: later targets take whatever time is
     * left, and `runSearch` exits the moment a seed reaches its bound.
     */
    const singles = plannable
      .map((goal) => {
        const single = compileProblem(cells, [goal], dataset, compileOptions);
        if (single.targets.length === 0 || single.anchors.length === 0) return null;
        return { single, bound: Math.min(upperBoundFor(single, 0), single.targets[0].cap) };
      })
      .filter((entry): entry is { single: Problem; bound: number } => entry !== null)
      .sort((a, b) => b.bound - a.bound);

    for (const { single, bound } of singles) {
      if (Date.now() > deadline) break;
      forced.push(translate(single, runSearch(single, rng, iterationBudget, deadline, bound, [], compound), problem));
    }
  }

  // RELAXED GEOMETRY SEED. When a target has slack AND needs several different
  // crops, choosing which cells to plant and which crop goes in each are
  // coupled, and that coupling is what the search struggles with: witherbloom
  // needs 4x one crop and reaches its target easily, while ashwreath needs
  // 2+2 of two crops on the same size ring and falls short. So solve the
  // easier single-crop version of the same shape first - same ring size, same
  // total - and hand its geometry over as a starting layout to be recoloured.
  if (plannable.length === 1) {
    const target = problem.targets[0];
    // Only where the coupling is real. A target needing 1 of each of two crops
    // (scourroot, veilshroom, gloomgourd, shadevine) is barely coupled at all
    // and reaches its number without help - spending a quarter of the budget on
    // a relaxed pass measurably cost each of them a spawn. The pain starts when
    // a single crop is needed more than once in the same ring.
    /**
     * SOGGYBUD AND ASHWREATH STOP AT 51. The remote reached 52, and its layout
     * is real: replayed through our own `validateSolveResponse` it passes, 52
     * spawns over 48 plants. So this is a genuine search gap, not a bad
     * baseline, and it is the last one on the parity board.
     *
     * The shape of it. Both are the same problem wearing different crop names
     * (2 of one crop plus 2 of another, ring size 1) and our search returns
     * geometrically IDENTICAL layouts for the two, 51 spawns over 46 plants
     * with THREE CELLS LEFT EMPTY, all three in column 0. The remote's answer
     * uses all 100 cells. We are not losing on crop efficiency, we are failing
     * to close the packing at the left edge.
     *
     * Three hypotheses were measured and all three are wrong. Recorded so the
     * next attempt starts past them rather than through them:
     *
     *   1. SEED. Not luck. 51 on every seed tried: 0x5eed_1234, 20260802, 1,
     *      99991, 0x0badc0de. Spread zero, unlike gloomgourd and choconut
     *      which do move (71 to 72).
     *   2. WALL CLOCK. Not time. Holding iterations fixed and lifting the
     *      ceiling to 5s, 7.5s and 12s leaves both at 51. The searches finish
     *      their iterations and stop; the deadline was never binding.
     *   3. THIS RELAXED SEED'S BUDGET. Not starvation, which was the obvious
     *      guess after the multi-target seeds turned out to be starved. Giving
     *      it half and then the whole iteration budget instead of a quarter
     *      changed nothing: soggybud and ashwreath stayed at 51 and the other
     *      seven slack mutations held their numbers exactly.
     *
     * What is left is the packing itself. A finishing pass that plants into
     * leftover empty cells cannot do it either: reaching a spawn at (2,0) needs
     * two of each crop among its neighbours and only one of each is available
     * there, so the 52 is a globally different tiling rather than three cells
     * of local repair. That points at a constructive lattice for the "2+2 over
     * two crops" family, which is the same kind of move that already gives the
     * full-ring family its proved optimum, and not at more annealing.
     *
     * Until then the label stays honest: FEASIBLE against a bound of 66, never
     * OPTIMAL.
     */
    const coupled = target.requirements.length > 1 && target.reqSum >= 4;
    if (!target.fullRing && !target.zeroAdjacent && coupled) {
      const goal = plannable[0];
      const definition = dataset.mutations[goal.mutation];
      const relaxedDataset: SolverDataset = {
        crops: dataset.crops,
        mutations: {
          ...dataset.mutations,
          [goal.mutation]: {
            ...definition,
            requirements: [{ crop: definition.requirements[0].crop, count: target.reqSum }],
          },
        },
      };
      const relaxed = compileProblem(cells, [goal], relaxedDataset, compileOptions);
      if (relaxed.anchors.length > 0) {
        const share = Math.floor(iterationBudget / 4);
        const shape = runSearch(relaxed, rng, share, deadline, totalBound, [], compound);
        const recoloured = new Field(problem);
        recoloured.load(translate(relaxed, shape, problem));
        polish(recoloured, problem, 8);
        forced.push(recoloured.snapshot());
      }
    }
  }

  const jointIterations = plannable.length > 1 ? Math.floor(iterationBudget / 2) : iterationBudget;
  const bestCells = runSearch(problem, rng, jointIterations, deadline, totalBound, forced, compound, (best) =>
    options.onProgress?.(best, Date.now() - started)
  );

  const field = new Field(problem);
  field.load(bestCells);
  let selection = selectBlocks(field, problem);
  let approachExtra = "";

  /**
   * Small-target economy. A capped single-target request is asking for the
   * CHEAPEST k spawns, which the annealer cannot express (every field with at
   * least k satisfied spots scores identically, so it has no gradient toward
   * planting less; measured in real use: 45 support crops for a need of 2). Two
   * corrections, both verified through the same Field and validator as every
   * other answer:
   *
   *   1. Selection picks the k spots that SHARE the most support instead of
   *      the first k by anchor index, then pruning strips what the cluster
   *      does not use. Pruning is unconditional here: a capped request that
   *      leaves surplus crops standing is lying about its cost.
   *   2. A constructed flank-chain candidate (about 2 crops per spawn)
   *      competes with the searched field, judged by spawns reached, then by
   *      fewer crops planted. The constructor returns null rather than an
   *      unverified layout, so this can only improve on the search.
   */
  const singleCapped =
    problem.targets.length === 1 &&
    Number.isFinite(problem.targets[0].cap) &&
    problem.targets[0].cap >= 1;
  if (singleCapped) {
    const k = problem.targets[0].cap;
    /*
     * Zero-adjacent targets take the FIRST k of the spacing-aware selection
     * instead of the compact cluster: "compact" means adjacent, which is the
     * one arrangement a lonelily can never grow in, and routing them through
     * selectCompactAnchors emitted illegal packed layouts in target mode.
     * Any subset of an independent set is independent, so
     * slicing the MIS selection is legal by construction; there is no support
     * to share and nothing for the chain constructor to build, so both
     * economies are skipped rather than misapplied.
     */
    const zeroAdjacent = problem.targets[0].zeroAdjacent;
    const picked = zeroAdjacent
      ? selection.anchors.slice(0, k)
      : selectCompactAnchors(field, problem, k).slice(0, k);
    selection = {
      anchors: picked,
      perTarget: [Math.min(picked.length, k)],
      value: Math.min(picked.length, k),
    };
    pruneUnusedCrops(field, problem, selection.anchors);

    const chainCells = zeroAdjacent ? null : buildChainCandidate(problem, k);
    if (chainCells) {
      const chainField = new Field(problem);
      chainField.load(chainCells);
      const chainAnchors = selectCompactAnchors(chainField, problem, k).slice(0, k);
      pruneUnusedCrops(chainField, problem, chainAnchors);
      const chainValue = Math.min(chainAnchors.length, k);
      const better =
        chainValue > selection.value ||
        (chainValue === selection.value && plantedCount(chainField) < plantedCount(field));
      if (better) {
        field.load(chainField.snapshot());
        selection = { anchors: chainAnchors, perTarget: [chainValue], value: chainValue };
        approachExtra = " / flank-chain construct";
      }
    }
  } else if (options.removeUnusedCrops) {
    pruneUnusedCrops(field, problem, selection.anchors);
  }

  /*
   * Fewest cells planted, at the yield already won. Runs on every answer that
   * prunes (both branches above); its work budget is fixed and small, so it
   * cannot eat a search budget and cannot vary with machine load.
   */
  if (singleCapped || options.removeUnusedCrops) {
    minimizeSupports(field, problem, selection.anchors);
    pruneUnusedCrops(field, problem, selection.anchors);
  }

  const optimal = problem.targets.every((_, ti) => selection.perTarget[ti] >= cappedBounds[ti]);
  const approach =
    [
      "local",
      problem.targets.some((t) => t.fullRing) ? "full-ring lattice" : "periodic seeds",
      "ruin-and-recreate anneal",
      `bound ${Number.isFinite(totalBound) ? totalBound : "none"}`,
    ].join(" / ") + approachExtra;

  return buildResponse(problem, field, selection.anchors, optimal ? "OPTIMAL" : "FEASIBLE", approach);
};

export { compileProblem, upperBoundFor, BadRequestError } from "./problem.ts";
export type { Problem, CompiledTarget, Anchor } from "./problem.ts";
export { Field } from "./field.ts";
