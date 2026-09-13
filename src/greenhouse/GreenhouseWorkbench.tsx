import React, { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { GreenhouseTool } from "./route";

interface GreenhouseWorkbenchProps {
  primaryTool: GreenhouseTool;
  PlannerPage: React.ElementType;
  SolverPage: React.ElementType;
  DesignerPage: React.ElementType;
}

/**
 * The three greenhouse capabilities share one vertical workbench.  The URL
 * fragment still identifies the capability for bookmarks and deep links, but
 * the rendered surface is a continuous workflow rather than a tabbed mini-app.
 */
export const GreenhouseWorkbench: React.FC<GreenhouseWorkbenchProps> = ({
  primaryTool,
  PlannerPage,
  SolverPage,
  DesignerPage,
}) => {
  const location = useLocation();
  const sectionRefs = useRef<Partial<Record<GreenhouseTool, HTMLElement | null>>>({});

  useEffect(() => {
    // The bare Greenhouse route should open at the shared identity surface so
    // the profile picker remains immediately available. Hash links still
    // land on their requested capability after the workbench mounts.
    if (!/^#(?:planner|solver|designer)(?:\?|$)/.test(location.hash)) return;
    const node = sectionRefs.current[primaryTool];
    if (!node) return;
    const frame = window.requestAnimationFrame(() => node.scrollIntoView({ block: "start", behavior: "auto" }));
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, primaryTool]);

  return (
    <div className="greenhouse-workbench" data-primary-tool={primaryTool}>
      <section
        ref={(node) => { sectionRefs.current.planner = node; }}
        id="greenhouse-planner"
        className={`greenhouse-workbench-section greenhouse-workbench-section--planner${primaryTool === "planner" ? " is-primary" : ""}`}
        aria-label="Planner"
      >
        <PlannerPage embedded />
      </section>
      <section
        ref={(node) => { sectionRefs.current.solver = node; }}
        id="greenhouse-solver"
        className={`greenhouse-workbench-section greenhouse-workbench-section--solver${primaryTool === "solver" ? " is-primary" : ""}`}
        aria-label="Solver"
      >
        <SolverPage embedded showFirstTimeModal={false} />
      </section>
      <section
        ref={(node) => { sectionRefs.current.designer = node; }}
        id="greenhouse-designer"
        className={`greenhouse-workbench-section greenhouse-workbench-section--designer${primaryTool === "designer" ? " is-primary" : ""}`}
        aria-label="Designer"
      >
        <DesignerPage embedded />
      </section>
    </div>
  );
};
