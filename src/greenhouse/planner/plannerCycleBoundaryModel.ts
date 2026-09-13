import type { SolverPlan } from "./solverPlan";
import type { PlanEstimates } from "./planEstimates";

type PlannerCycle = SolverPlan["cycles"][number];

interface PlannerCycleVisibleState {
  progress: Record<string, number>;
  growFresh: Record<string, boolean>;
  focusId: string | null;
  hideCompleted: boolean;
  showTime: boolean;
  estimates: PlanEstimates | null;
}

/** Only the values that can change the rendered rows of one existing cycle. */
export const plannerCycleSignature = (cycle: PlannerCycle, state: PlannerCycleVisibleState): string => {
  const focused = cycle.produce.some((node) => node.id === state.focusId) ? state.focusId : null;
  const cycleEstimate = state.showTime
    ? (state.estimates?.cycles.find((estimate) => estimate.index === cycle.index) ?? null)
    : null;

  return JSON.stringify([
    state.hideCompleted,
    state.showTime,
    focused,
    cycleEstimate,
    cycle.produce.map((node) => [
      node.id,
      state.progress[node.id] ?? 0,
      Boolean(state.growFresh[node.id]),
      state.showTime ? (state.estimates?.byId[node.id] ?? null) : null,
    ]),
  ]);
};
