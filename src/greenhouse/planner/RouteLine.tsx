import React, { useEffect, useMemo, useState } from "react";
import type { SolveResponse } from "../types/greenhouse";
import type { CropDefinition, MutationDefinition } from "../types/greenhouse";
import type { PlotEconomy, SolverPlan } from "./solverPlan.ts";
import type { PlanEstimates } from "./planEstimates.ts";
import { formatDuration } from "./time.ts";
import { solveLayout } from "./useSolvedLayout.ts";
import { FULL_GRID } from "./useSolvedLayout.ts";
import { SolvedGridView } from "./SolvedGridView.tsx";
import { routeMoves, type RouteMove } from "./routeMoves.ts";
import { LABEL, NUM, TILE, TILE_HOVER } from "../../ui/kit";

/**
 * The Line: the plan rendered the way a chess engine shows its principal
 * variation, one board per move.
 *
 * A move is a planting inside a cycle. Each card shows the plot that move
 * actually sows, sized the way the bill costed it, with the move's expected
 * time and the running clock underneath: "after this move, you are ~here".
 * Covered moves (stock spent instead of grown) appear as flat cards with no
 * board, because nothing is sown; hiding them entirely would break the "what
 * do I physically do next" reading the sequence exists for.
 *
 * v1 is the sequence-of-boards form. The ghost-overlay form in the design doc
 * builds on the same data and is deliberately later work.
 */

interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}



/**
 * Solves each move's board, one at a time through the same worker path the
 * focus panel uses, cached by (id, spots) so revisits are free. Sequential on
 * purpose: the line can hold a dozen boards and firing them all at once would
 * make the page fight itself for the worker.
 */
const useRouteBoards = (moves: RouteMove[]): Record<string, SolveResponse | null> => {
  const [boards, setBoards] = useState<Record<string, SolveResponse | null>>({});
  const wanted = useMemo(
    () =>
      moves
        .filter((m) => !m.node.covered && m.node.kind === "mutation")
        .map((m) => `${m.node.id}@${m.spots ?? "max"}`),
    [moves]
  );
  const signature = wanted.join("|");

  useEffect(() => {
    if (!signature) return;
    const controller = new AbortController();
    let cancelled = false;
    (async () => {
      for (const key of signature.split("|")) {
        if (cancelled) return;
        setBoards((prev) => (key in prev ? prev : { ...prev, [key]: null }));
        const at = key.lastIndexOf("@");
        const id = key.slice(0, at);
        const spotsRaw = key.slice(at + 1);
        const spots = spotsRaw === "max" ? undefined : Number(spotsRaw);
        try {
          const result = await solveLayout(FULL_GRID, [id], spots, controller.signal);
          if (!cancelled) setBoards((prev) => (prev[key] ? prev : { ...prev, [key]: result }));
        } catch {
          // A refused or failed solve leaves the card boardless; the move's
          // numbers still render, which is the honest partial answer.
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [signature]);

  return boards;
};

/**
 * The solver's refusal reasons are sentences ("no adjacency layout can
 * produce this: shellfruit: explosion mechanic..."); a card is forty pixels
 * of column. Keep the tail after the last colon, which is where every refusal
 * path puts the concrete reason; the full sentence rides on the tooltip.
 */
const shortReason = (approach: string | undefined): string => {
  const tail = approach?.split(":").pop()?.trim();
  return tail && tail.length > 0 ? tail : (approach ?? "unknown");
};

export const RouteLine: React.FC<{
  plan: SolverPlan;
  data: Dataset;
  economies: Record<string, PlotEconomy | null>;
  fullYields: Record<string, number>;
  estimates: PlanEstimates;
  /** Open a move's plot in the big focus panel. Cards are buttons when set. */
  onOpen?: (mutationId: string) => void;
}> = ({ plan, data, economies, fullYields, estimates, onOpen }) => {
  const moves = useMemo(
    () => routeMoves(plan, estimates, economies, fullYields),
    [plan, estimates, economies, fullYields]
  );
  const boards = useRouteBoards(moves);
  if (moves.length === 0) return null;

  return (
    <section aria-label="The line" className="mt-3 rounded-md border border-slate-800 bg-slate-900/40 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        {/* The hand-rolled label clone is gone: this is the kit LABEL job. */}
        <h3 className={LABEL}>
          The line
        </h3>
        <span className={`text-[11px] text-slate-500 ${NUM}`}>
          {moves.length} moves, ~{formatDuration(moves[moves.length - 1].clockSeconds)} total
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {moves.map((move) => {
          const key = `${move.node.id}@${move.spots ?? "max"}`;
          const board = move.node.covered ? null : (boards[key] ?? null);
          const openable = onOpen !== undefined && move.node.kind === "mutation";
          /*
           * The card is a button into the big focus panel above - the same
           * farming view, not a second grid, so the two can never
           * disagree. The cycle label is 1-based because every
           * cycle STRIP on this page says "Cycle {index + 1}", and a card
           * saying "cycle 0" under a strip saying "Cycle 1" was two names for
           * one thing on one screen.
           */
          /*
           * Two explicit elements rather than a "button" | "div" union
           * component: the union's intersected props reject `type` when the
           * div side is possible, which tsc -b (the build path) flags even
           * though the dev server shrugs - it broke `pnpm build` for the
           * networth crew. The card body is shared; only the shell differs.
           */
          const cardBody = (
            <>
              <div className="flex items-baseline justify-between">
                <span className={`text-[11px] text-slate-500 ${NUM}`}>#{move.number}</span>
                <span className={`text-[11px] text-slate-500 ${NUM}`}>cycle {move.cycleIndex + 1}</span>
              </div>
              <div className="truncate text-[12px] text-slate-200" title={move.node.name}>
                {move.node.name}
              </div>
              {move.node.covered ? (
                <div className="flex h-24 items-center justify-center text-[11px] text-slate-500">
                  from stock, no time
                </div>
              ) : board && board.status !== "INFEASIBLE" ? (
                /*
                 * Status, not placements.length: Lonelily's legal answer IS an
                 * empty placement list (it spawns on empty ground), and gating
                 * on placements branded its perfectly solved board a refusal.
                 *
                 * No my-1 here any more: the shell's gap-1 spaces this now,
                 * and the margin on top of it doubled the gap up.
                 */
                <div className="flex justify-center">
                  <SolvedGridView result={board} data={data} cellSize={10} />
                </div>
              ) : board ? (
                /*
                 * A refused solve RESOLVES with an empty INFEASIBLE response
                 * rather than throwing, and the first version rendered that as
                 * an empty board labeled "instant" - two lies on one card.
                 * Blocked is blocked, and the card repeats
                 * the solver's OWN reason: a hardcoded "multi-cell supports"
                 * here mislabeled Shellfruit, whose real blocker is the
                 * explosion mechanic.
                 */
                <div
                  className="flex h-24 items-center justify-center px-1 text-center text-[11px] text-amber-400/80"
                  title={board.solver_approach}
                >
                  not solvable yet: {shortReason(board.solver_approach)}
                </div>
              ) : (
                <div className="flex h-24 items-center justify-center text-[11px] text-slate-500">
                  solving...
                </div>
              )}
              <div className={`text-[11px] text-slate-400 ${NUM}`}>
                {move.node.covered
                  ? "from stock"
                  : Number.isNaN(move.expectedSeconds)
                    ? "time unknown"
                    : `~${formatDuration(move.expectedSeconds)}`}
              </div>
              <div className={`text-[11px] text-slate-500 ${NUM}`}>
                clock ~{formatDuration(move.clockSeconds)}
              </div>
            </>
          );

          /*
           * Move cards are things you PICK, so they are kit tiles rather than
           * the flat slate-950 slabs they started as (the kit's shards-scale
           * rule). The openable card takes the hover variant;
           * a covered move is not a destination and stays a plain TILE.
           */
          const shell = `sd-route-card flex w-40 shrink-0 flex-col gap-1 p-2.5 text-left`;
          return openable ? (
            <button
              key={`${move.cycleIndex}-${move.node.id}`}
              type="button"
              onClick={() => onOpen(move.node.id)}
              title={`Open the ${move.node.name} plot above`}
              className={`${TILE_HOVER} ${shell} cursor-pointer`}
            >
              {cardBody}
            </button>
          ) : (
            <div key={`${move.cycleIndex}-${move.node.id}`} className={`${TILE} ${shell}`}>
              {cardBody}
            </div>
          );
        })}
      </div>
    </section>
  );
};
