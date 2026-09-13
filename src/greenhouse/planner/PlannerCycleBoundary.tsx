import React from "react";
import type { SolverPlan } from "./solverPlan";

type PlannerCycle = SolverPlan["cycles"][number];

interface PlannerCycleBoundaryProps {
  cycle: PlannerCycle;
  signature: string;
  renderCycle: (cycle: PlannerCycle) => React.ReactNode;
}
const PlannerCycleBoundaryComponent: React.FC<PlannerCycleBoundaryProps> = ({ cycle, renderCycle }) => (
  <>{renderCycle(cycle)}</>
);

/**
 * A progress tick changes one cycle, but PlannerPage still has to publish its
 * plan-wide totals. Keep that parent update while declining to reconstruct
 * every unchanged cycle's rows. `renderCycle` intentionally is not compared:
 * the parent creates that closure in JSX, while `signature` explicitly names
 * the visible state the closure reads for this cycle.
 */
export const PlannerCycleBoundary = React.memo(
  PlannerCycleBoundaryComponent,
  (previous, next) => previous.cycle === next.cycle && previous.signature === next.signature,
);
PlannerCycleBoundary.displayName = "PlannerCycleBoundary";
