import { useEffect, useState } from "react";
import { solveGreenhouseDirect } from "../services/greenhouseService";
import { FULL_PLOT, solveGoal } from "../solver/request";
import type { SolveResponse } from "../types/greenhouse";

/**
 * Optimal plot layout for a set of mutations, from the greenhouse solver.
 *
 * This defers to the real solver rather than our own packing heuristic. The
 * solver reliably finds far denser layouts - for a single mutation type it
 * returns 72 spawns from 26 crops on one plot, because crops are shared
 * between neighbouring spawn spots.
 *
 * The solve is local now, but it still runs in a Web Worker and can take a
 * couple of seconds on the slack family, so this hook keeps its loading and
 * error state and the caller degrades gracefully rather than showing a broken
 * grid. The states are no longer about a network that might not answer; they
 * are about work that has not finished yet.
 */

/**
 * All 100 cells.
 *
 * Re-exported from the solver rather than built again here. The cache and the
 * shipped precompute both key on the exact cell list, so a second copy that
 * drifted would stop hitting them silently instead of failing.
 */
export const FULL_GRID = FULL_PLOT;

/** A stable identity for a usable-cell shape, independent of array order. */
export const greenhouseCellKey = (cells: readonly [number, number][]): string =>
  [...new Set(cells.map(([row, col]) => row * 10 + col))]
    .sort((left, right) => left - right)
    .join(".");

const FULL_GRID_KEY = greenhouseCellKey(FULL_GRID);

/** Preserve the shipped full-grid cache keys; scope every other shape. */
export const greenhouseCellCacheSuffix = (cells: readonly [number, number][]): string => {
  const key = greenhouseCellKey(cells);
  return key === FULL_GRID_KEY ? "" : `@cells:${key}`;
};

/**
 * Whether a plot solve strips crops that contribute nothing.
 *
 * ONE DECISION, ONE PLACE, and it is here because it was two places that
 * disagreed. The economics pruned and the layout did not, so the plan costed a
 * planting at 5 Melon and 5 Gloomgourd while PLANT THIS told the player to sow
 * 24 and 21 for the identical 8 yield. One fact, two derivations, contradicting
 * each other on screen in the one panel a player acts on.
 *
 * `solveGoal` in `solver/request.ts` already made the two ask the same
 * QUESTION. This is the other half: they now accept the same ANSWER, read from
 * a shared constant rather than a literal written out at each call site.
 * `prunedBill.test.ts` holds the two bills equal on numbers, so a third caller
 * that picked the other answer fails rather than merely disagreeing.
 */
export const PRUNE_UNUSED_CROPS = true;

/**
 * What one planting costs, counted off the solved placements.
 *
 * One planting, however many cells a crop covers, which is the unit the player
 * sows in. Shared by the economics, the PLANT THIS bill and the test that holds
 * them equal, because two derivations of the same count is exactly how the two
 * came apart in the first place.
 */
export const cropBill = (placements: readonly { crop: string }[]): Record<string, number> => {
  const crops: Record<string, number> = {};
  for (const p of placements) crops[p.crop] = (crops[p.crop] ?? 0) + 1;
  return crops;
};

/**
 * One plot solve, as the layout preview asks it.
 *
 * Exported rather than left inline in the effect so the paired test can put the
 * real question through the real service with no DOM in the way. The hook adds
 * React to this and nothing else.
 */
export const solveLayout = async (
  cells: [number, number][],
  mutationIds: string[],
  spots?: number,
  signal?: AbortSignal
): Promise<SolveResponse> => {
  const result = await solveGreenhouseDirect(
    cells,
    mutationIds.map((id) => solveGoal(id, spots)),
    signal,
    PRUNE_UNUSED_CROPS
  );
  if (mutationIds.some((id) =>
    result.mutations.filter((placement) => placement.mutation === id).length < (spots ?? 1)
  )) {
    throw new Error("No complete field was found in the current usable cells. Unlock more connected cells in Edit cells and try again.");
  }
  return result;
};

export interface SolvedLayout {
  result: SolveResponse | null;
  loading: boolean;
  error: string | null;
  /** mutation id -> how many that plot yields. */
  yieldPerPlot: Record<string, number>;
}

/**
 * @param spots Solve for exactly this many spawns instead of as many as
 *              possible. The planner passes the size it costed the plot at, so
 *              the grid on screen is the plot the bill beside it is for. Left
 *              undefined this maximizes, which is every other caller.
 */
export const useSolvedLayout = (
  mutationIds: string[] | null,
  cells: [number, number][] = FULL_GRID,
  spots?: number,
  enabled = true,
): SolvedLayout => {
  const [answer, setAnswer] = useState<{
    signature: string;
    result: SolveResponse | null;
    loading: boolean;
    error: string | null;
  }>({ signature: "", result: null, loading: false, error: null });

  /*
   * Stable key so we only re-solve when the question changes. The spot count is
   * PART OF THE QUESTION, as is the player's usable-cell shape. The effect
   * below depends on this string alone deliberately; both inputs therefore
   * have to be represented or a profile-slot refresh could leave a valid-looking
   * solution from the wrong greenhouse on screen.
   */
  const orderedMutationIds = enabled && mutationIds ? [...mutationIds].sort() : [];
  const signature = orderedMutationIds.length
    ? `${orderedMutationIds.join("|")}@${spots ?? "max"}${greenhouseCellCacheSuffix(cells)}`
    : "";

  useEffect(() => {
    if (!signature) {
      return;
    }

    const controller = new AbortController();
    setAnswer({ signature, result: null, loading: true, error: null });

    solveLayout(cells, orderedMutationIds, spots, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return;
        setAnswer({ signature, result: res, loading: false, error: null });
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setAnswer({ signature, result: null, loading: false, error: err.message });
      });

    return () => controller.abort();
    // `signature` carries the mutation set, spot count and canonical cell set.
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  // A new shape must not display the previous shape's answer before its effect runs.
  const { result, loading, error } = signature && answer.signature === signature
    ? answer
    : { result: null, loading: Boolean(signature), error: null };
  const yieldPerPlot: Record<string, number> = {};
  for (const m of result?.mutations ?? []) {
    yieldPerPlot[m.mutation] = (yieldPerPlot[m.mutation] ?? 0) + 1;
  }

  return { result, loading, error, yieldPerPlot };
};
