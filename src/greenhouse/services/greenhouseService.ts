import type {
  SolveRequest,
  SolveResponse,
  ExpansionRequest,
  ExpansionResponse,
  JobProgress,
  MutationGoal,
} from "../types/greenhouse";
import { createSolverClient, runSolve } from "../solverClient";
import { runExpansion } from "../expansion";
import type { SolverDataset } from "../solver";
import { getDataset } from "../data/datasetStore";

/**
 * The app's dataset, in the shape the solver core wants.
 *
 * The store hands out arrays because that is what the pages render from; the
 * solver looks things up by id, so it wants records. The conversion is cheap
 * but it happens on every solve, and the planner solves a few dozen mutations
 * in a burst, so it is memoised on the array identities the store hands back.
 * Those identities change when the wiki overlay is refreshed, which is exactly
 * when the solver should stop trusting the previous conversion.
 */
let datasetCache: { crops: unknown; mutations: unknown; value: SolverDataset } | null = null;

/**
 * Exported for one reason: a test pins that this conversion and
 * `data/solverDataset.ts` - the pure one the precompute build script uses -
 * agree on every field the solver reads. They are two roads to the same place,
 * and if they ever diverge the precompute would stop applying silently. The
 * app itself still reaches this through the two functions below.
 */
export const solverDataset = (): SolverDataset => {
  const { crops, mutations } = getDataset();
  if (datasetCache && datasetCache.crops === crops && datasetCache.mutations === mutations) {
    return datasetCache.value;
  }
  const value: SolverDataset = {
    crops: Object.fromEntries(crops.map((c) => [c.id, c])),
    mutations: Object.fromEntries(mutations.map((m) => [m.id, m])),
  };
  datasetCache = { crops, mutations, value };
  return value;
};


export interface SolveJobCallbacks {
  onProgress?: (progress: JobProgress) => void;
  onQueuePosition?: (position: number) => void;
  onPreviewUpdate?: (result: SolveResponse) => void;
}

/*
 * User-triggered work gets its own worker queue.
 *
 * The planner deliberately solves background economics in batches. Those
 * requests are synchronous once they reach the shared worker, so a four-goal
 * Auto-arrange posted behind a batch could spend many solver budgets waiting
 * without emitting its own first progress event. A separate client keeps the
 * interactive request immediate and also lets Stop terminate that work instead
 * of leaving it queued behind unrelated calculations. Both clients still use
 * the same canonical cache, dataset and solver implementation.
 */
const interactiveSolverClient = createSolverClient();

/**
 * Solve a plot, reporting progress as it goes.
 *
 * The "WithJob" name is a leftover. This used to POST a job to a queue on
 * api.skyshards.com and poll it every 500ms until it finished. It now runs our
 * own solver in a dedicated Web Worker on the visitor's machine: no remote
 * service queue, no polling, no network. The worker still has its ordinary
 * local message queue, isolated above from background planner calculations.
 * The signature is unchanged so the page did not have to move.
 *
 * Two of the three callbacks are deliberately never called now, and both
 * silences are improvements rather than gaps:
 *
 *   onQueuePosition - there is no shared or remote wait position to report.
 *   Interactive calls have their own worker and begin independently of the
 *   background planner queue.
 *
 *   onPreviewUpdate - this is the interesting one. The remote streamed partial
 *   layouts while it searched, and the results page renders
 *   `result || previewResult`, so ONE solve redrew the plot with a DIFFERENT
 *   arrangement on every 500ms poll. Across a cold solve of 1.7 to 10.6
 *   seconds that was anywhere from 3 to 21 different layouts flashing past,
 *   which is what was meant by the solver seeming to "randomly decide to
 *   refresh the planting ideas". Our solver is deterministic and returns one
 *   answer, so the plot is drawn once and then stays put. Reintroducing a
 *   preview would bring the flicker back with it.
 */
export async function solveGreenhouseWithJob(
  request: SolveRequest,
  callbacks?: SolveJobCallbacks,
  abortSignal?: AbortSignal
): Promise<SolveResponse> {
  try {
    return await interactiveSolverClient.runSolve({
      cells: request.cells,
      targets: request.targets,
      dataset: solverDataset(),
      /*
       * `unique_crops` is NOT forwarded. It is a growth-rate input and the
       * search never read it, but forwarding it changed the cache key and
       * pushed every solve from this page off the shipped precompute. See the
       * note where it used to sit in solver/index.ts.
       */
      options: {
        locks: request.locks,
        priorities: request.priorities,
        removeUnusedCrops: request.removeUnusedCrops,
      },
      signal: abortSignal,
      onProgress: callbacks?.onProgress,
    });
  } catch (error) {
    // The page tells a deliberate cancel apart from a real failure by this
    // exact message, and shows what it already had instead of an error.
    if (abortSignal?.aborted) throw new Error("Job cancelled");
    throw error;
  }
}

/**
 * Work out the best order to unlock cells in.
 *
 * This used to POST the unlocked and locked cell lists to
 * api.skyshards.com/greenhouse/expansion. It now runs our own planner in a Web
 * Worker on the visitor's machine: no network, and it works offline.
 *
 * The signature is unchanged so the panel did not have to move. The returned
 * object carries three extra fields the remote never sent - `final_label`,
 * `final_bound` and `final_gap` - so a caller can say whether the headline
 * number is proved maximal or merely the best found. Nothing reads them yet.
 *
 * Parity against the recorded remote answers is checked by
 * tools/expansion-parity.mjs (`pnpm parity:expansion`): 16 or 17 of the 18
 * sampled plots match and the rest are one spawn short, those being the two
 * 99-cell plots. None are illegal, because the harness re-counts every layout
 * rather than trusting the number it was given. The planner also answers the
 * disconnected plots that the remote endpoint times out on.
 *
 * The range is literal. `refine` in potential.ts is bounded by wall clock, not
 * by iterations, and both borderline plots use their full 2500ms, so the count
 * moves with machine load: two runs on the same commit gave 16 and then 17.
 * Re-run the harness rather than quoting this comment, and treat a wall-clock
 * bound behind an exit code as a thing to fix rather than a thing to rely on.
 */
export async function optimizeExpansion(request: ExpansionRequest): Promise<ExpansionResponse> {
  return runExpansion(request.unlocked_cells, request.locked_cells);
}

/**
 * Solve a greenhouse plot.
 *
 * This used to POST to api.skyshards.com. It now runs our own solver in a Web
 * Worker on the visitor's machine. The signature is deliberately unchanged, so
 * every caller carried over untouched: the planner economics, the solved-layout
 * preview and the mutation requirement grid.
 *
 * Why this moved locally at all: the remote is someone else's server, and
 * publishing the site would have put every visitor on their bandwidth. It is
 * also simply better. Against the captured baseline our solver matches or beats
 * the remote on all 40 mutations, and beats it outright on four that the remote
 * gets wrong while reporting them as proven optimal (stoplight_petal 4 -> 16,
 * plantboy_advance 4 -> 9, puffercloud 11 -> 16, thunderling 13 -> 16). See
 * tools/solver-parity.mjs for the evidence, which anyone can re-run offline.
 *
 * `removeUnusedCrops` is honoured here for real. The remote accepted the flag
 * and ignored it, so a plot was costed by whatever it happened to plant,
 * surplus included. Honouring it means the planner's seed costs can only get
 * cheaper, never more expensive, for the same yield.
 */
export async function solveGreenhouseDirect(
  cells: [number, number][],
  targets: MutationGoal[],
  abortSignal?: AbortSignal,
  // The planner costs a plot by what it actually plants, so it asks the solver
  // to strip crops that contribute nothing. Defaults to the original behaviour.
  removeUnusedCrops = false
): Promise<SolveResponse> {
  return runSolve({
    cells,
    targets,
    dataset: solverDataset(),
    options: { removeUnusedCrops },
    signal: abortSignal,
  });
}
