import { useEffect, useRef, useState } from "react";
import { solveGreenhouseDirect } from "../services/greenhouseService";
import {
  cropBill,
  FULL_GRID,
  greenhouseCellCacheSuffix,
  PRUNE_UNUSED_CROPS,
} from "./useSolvedLayout";
import { solveGoal } from "../solver/request";
import type { PlotEconomy } from "./solverPlan";
import { SIZING_ROUNDS, sameSizing } from "./plotSizing";
import { solvedEconomies } from "./economyCache";

/**
 * Per-mutation plot economics, straight from the greenhouse solver.
 *
 * For each mutation we ask "what does one optimal plot of this yield, and what
 * does it cost to sow?" - the two numbers the planner needs to turn demand
 * into plantings.
 *
 * Answers live in `economyCache`: persisted across sessions and replaced only
 * by strictly better solves, because the solver's wall-clock deadline makes a
 * re-solve land differently under load, so a plan's day
 * count visibly wandered between visits. The Map used to live here and last one tab;
 * the surface it exposed is unchanged. Requests still go out a few at a time
 * to avoid hammering the service.
 */

const cache = solvedEconomies;
const inFlight = new Set<string>();
const BATCH = 5;

/**
 * The cache key for one solve.
 *
 * A full 100-cell maximize answer keeps the mutation-only key used by the
 * shipped precompute. A player's smaller unlocked shape is a different
 * question, so both maximized and right-sized answers carry that cell shape
 * rather than borrowing a plausible answer from a different greenhouse.
 */
const keyFor = (
  id: string,
  spots?: number,
  cells: readonly [number, number][] = FULL_GRID,
): string => `${spots === undefined ? id : `${id}#${spots}`}${greenhouseCellCacheSuffix(cells)}`;

export interface SolverEconomies {
  /** The economy to plan with: right-sized where one was asked for. */
  economies: Record<string, PlotEconomy | null>;
  /**
   * What a MAXIMIZED plot of each mutation yields.
   *
   * Kept beside the sized answers rather than derived from them, because it is
   * the ceiling every sizing decision is measured against. Reading the ceiling
   * back out of an already-sized economy would shrink the plot a little further
   * on every pass until nothing was left of it.
   */
  fullYields: Record<string, number>;
  /** Mutations still being solved. */
  loading: string[];
  /** True once every requested mutation has an answer. */
  ready: boolean;
  error: string | null;
  progress: { done: number; total: number };
}

/**
 * One mutation's plot economy, solved.
 *
 * TARGET MODE when a size was asked for. The solver has always taken a count;
 * the planner simply never used it, so a plan for two Soggybud quoted the bill
 * for fifty one. `maximize` stays the question for everything big, which is
 * what keeps large plans byte for byte as they were.
 *
 * The pruning flag and the crop count both come from `useSolvedLayout` rather
 * than being written out again here. That is the whole fix: this and the layout
 * preview answer the same question with the same bill, and the test that pins
 * them together drives this function directly.
 */
export const solveEconomy = async (
  id: string,
  spots?: number,
  cells: [number, number][] = FULL_GRID,
): Promise<PlotEconomy | null> => {
  try {
    const res = await solveGreenhouseDirect(cells, [solveGoal(id, spots)], undefined, PRUNE_UNUSED_CROPS);
    const crops = cropBill(res.placements);
    const yields = res.mutations.length;
    return yields > 0 ? { yield: yields, crops } : null;
  } catch {
    return null;
  }
};

/**
 * Asked, after each round, how big each plot should actually be.
 *
 * The caller supplies this because sizing needs a PLAN, and building one needs
 * the targets, the dataset and the player's stock, none of which this hook has
 * any business knowing. It hands over the economies it has and gets back
 * `id -> spot count` for the rows worth re-solving smaller.
 */
export type RefineSizing = (
  economies: Record<string, PlotEconomy | null>,
  fullYields: Record<string, number>
) => Record<string, number>;

/** Everything the cache knows right now, sized where a size was asked for. */
const readEconomies = (
  ids: string[],
  sizing: Record<string, number>,
  cells: readonly [number, number][],
) => {
  const economies: Record<string, PlotEconomy | null> = {};
  const fullYields: Record<string, number> = {};
  for (const id of ids) {
    const full = cache.get(keyFor(id, undefined, cells));
    if (full === undefined) continue;
    if (full) fullYields[id] = full.yield;
    const spots = sizing[id];
    const sized = spots === undefined ? undefined : cache.get(keyFor(id, spots, cells));
    economies[id] = sized === undefined ? full : sized;
  }
  return { economies, fullYields };
};

/**
 * @param ids     every mutation the plan touches. Always solved MAXIMIZED, which
 *                is the question the shipped precompute answers, so the opening
 *                burst is unchanged and still costs no solver time.
 * @param refine  optional. Given the economies so far, returns the spot counts
 *                worth re-solving. Called at most `SIZING_ROUNDS` times and
 *                stops the moment it asks for the same thing twice.
 * @param refineKey
 *                anything OTHER than the mutation set that changes what
 *                `refine` would answer, as a string.
 *
 *                LOAD BEARING, and it is here because the refinement was
 *                otherwise unreachable. `refine` is held in a ref rather than a
 *                dependency, deliberately, since its identity changes on nearly
 *                every render. That left the mutation set as the only thing
 *                that could re-run the loop, so a player switching one row to
 *                "grow faster" would have watched the plan not move: same ids,
 *                same signature, no re-solve. The same silence covered a
 *                changed stock or a flipped "grow instead", both of which move
 *                a row's need and therefore its size.
 *
 *                Re-running is cheap when nothing really changed. Round zero is
 *                already cached, `refine` returns the same map, and `sameSizing`
 *                stops the loop before it asks the solver anything.
 * @param cells    the actual usable Hypixel greenhouse cells. Full-grid callers
 *                keep using the shipped precompute; other shapes are solved
 *                and cached under their own canonical cell key.
 */
export const useSolverEconomies = (
  ids: string[],
  refine?: RefineSizing,
  refineKey = "",
  cells: [number, number][] = FULL_GRID,
): SolverEconomies => {
  const signature = [...ids].sort().join("|");
  const cellScope = greenhouseCellCacheSuffix(cells);
  const [sizing, setSizing] = useState<Record<string, number>>({});
  const [, bump] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(true);

  /*
   * Held in a ref, not a dependency. The callback closes over the plan targets
   * and the player's stock, so its identity changes on almost every render;
   * depending on it would restart the solve burst constantly. The refinement
   * below always calls the LATEST one, which is what actually matters.
   */
  const refineRef = useRef(refine);
  refineRef.current = refine;

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);

  useEffect(() => {
    if (!signature) return;
    const wanted = signature.split("|");
    setSizing({});

    let cancelled = false;

    /** Solve whatever of `jobs` is not already cached or in flight. */
    const run = async (jobs: { id: string; spots?: number; key: string }[]) => {
      const missing = jobs.filter((j) => !cache.has(j.key) && !inFlight.has(j.key));
      if (!missing.length) return;
      missing.forEach((j) => inFlight.add(j.key));
      try {
        for (let i = 0; i < missing.length; i += BATCH) {
          if (cancelled) break;
          const slice = missing.slice(i, i + BATCH);
          const results = await Promise.all(slice.map((j) => solveEconomy(j.id, j.spots, cells)));
          slice.forEach((j, n) => {
            cache.set(j.key, results[n]);
            inFlight.delete(j.key);
          });
          if (active.current && !cancelled) bump((v) => v + 1);
        }
      } finally {
        missing.forEach((j) => inFlight.delete(j.key));
      }
    };

    (async () => {
      try {
        // Round zero: maximize everything. A full grid can use the shipped
        // precompute; a profile-specific shape resolves into its own cache key.
        await run(wanted.map((id) => ({ id, key: keyFor(id, undefined, cells) })));
        if (cancelled) return;

        /*
         * Then refine. Each round settles one more tier, because right-sizing a
         * plot shrinks what it sows and therefore what the tier below it owes.
         * Bounded by SIZING_ROUNDS and stopped early by `sameSizing`, so this
         * cannot spin however strange the data is.
         */
        let current: Record<string, number> = {};
        for (let round = 0; round < SIZING_ROUNDS && refineRef.current; round++) {
          const { economies, fullYields } = readEconomies(wanted, current, cells);
          const next = refineRef.current(economies, fullYields);
          if (sameSizing(next, current)) break;

          current = next;
          await run(Object.entries(current).map(([id, spots]) => ({ id, spots, key: keyFor(id, spots, cells) })));
          if (cancelled) return;
          if (active.current) setSizing(current);
        }

        if (active.current && !cancelled) setError(null);
      } catch (err) {
        if (active.current && !cancelled) setError((err as Error).message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cellScope, signature, refineKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const wanted = signature ? signature.split("|") : [];
  const economies: Record<string, PlotEconomy | null> = {};
  const fullYields: Record<string, number> = {};
  const loading: string[] = [];

  for (const id of wanted) {
    const fullKey = keyFor(id, undefined, cells);
    const full = cache.has(fullKey) ? cache.get(fullKey)! : undefined;
    if (full === undefined) {
      loading.push(id);
      continue;
    }
    if (full) fullYields[id] = full.yield;

    /*
     * The sized answer when one was asked for AND has landed. Falling back to
     * the maximized plot while the smaller solve is in flight is deliberate:
     * the plan stays complete and merely overstates for a moment, rather than
     * blanking a row and taking the whole page's unit maps down with it.
     */
    const spots = sizing[id];
    const sized = spots === undefined ? undefined : cache.get(keyFor(id, spots, cells));
    economies[id] = sized === undefined ? full : sized;
    if (spots !== undefined && sized === undefined) loading.push(id);
  }

  return {
    economies,
    fullYields,
    loading,
    ready: wanted.length > 0 && loading.length === 0,
    error,
    progress: { done: wanted.length - loading.length, total: wanted.length },
  };
};
