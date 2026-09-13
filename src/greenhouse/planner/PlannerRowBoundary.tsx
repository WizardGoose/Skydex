import React from "react";
import type { SolverPlanNode } from "./solverPlan";

interface PlannerRowBoundaryProps {
  node: SolverPlanNode;
  index: number;
  signature: string;
  renderRow: (node: SolverPlanNode, index: number) => React.ReactNode;
}

const PlannerRowBoundaryComponent: React.FC<PlannerRowBoundaryProps> = ({ node, index, renderRow }) => (
  <>{renderRow(node, index)}</>
);

/** Keep untouched ledger rows out of another row's progress update. */
export const PlannerRowBoundary = React.memo(
  PlannerRowBoundaryComponent,
  (previous, next) =>
    previous.node === next.node &&
    previous.index === next.index &&
    previous.signature === next.signature,
);
PlannerRowBoundary.displayName = "PlannerRowBoundary";
