import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import bundled from "../../../public/greenhouse/data.json";
import { toSolverDataset } from "../data/solverDataset";
import type { GreenhouseDataJSON } from "../data/datasetStore";
import { buildSolverPlan, hasUnresolvedPlanFields, type PlotEconomy } from "../planner/solverPlan";
import { buildPlanEstimates } from "../planner/planEstimates";
import type { SolvedLayout } from "../planner/useSolvedLayout";
import { GreenhousePlanBreakdown } from "../GreenhousePlanBreakdown";
import { GreenhousePlotBrief } from "../GreenhousePlotBrief";

const mock = vi.hoisted(() => ({ layout: { result: null, loading: false, error: "No complete field was found in the current usable cells.", yieldPerPlot: {} } as SolvedLayout }));
vi.mock("../planner/useSolvedLayout", async (original) => ({
  ...await original<typeof import("../planner/useSolvedLayout")>(),
  useSolvedLayout: () => mock.layout,
}));

const dataset = toSolverDataset(bundled as unknown as GreenhouseDataJSON);
const growth = { cropGrowth: 0, speedTier: 0, uniqueCrops: 0, plots: 1 };
const targets = [{ id: "cheesebite", qty: 3 }, { id: "glasscorn", qty: 1 }];
const noop = () => {};
const render = (economies: Record<string, PlotEconomy | null>, measuring = false) => {
  const plan = buildSolverPlan(targets, dataset, economies);
  const estimates = buildPlanEstimates(plan, dataset, economies, growth);
  return {
    plan,
    html: renderToStaticMarkup(<>
      <GreenhousePlotBrief inputPlacements={[]} targetPlacements={[]} plan={plan} estimates={estimates}
        targetLabel="Groovy Nozzle" measuring={measuring} dataset={dataset} onOpenItem={noop} />
      <GreenhousePlanBreakdown plan={plan} estimates={estimates} targetLabel="Groovy Nozzle" measuring={measuring}
        dataset={dataset} sizing={{}} growth={growth} cells={[]} onOpenItem={noop} onSelectField={noop}
        onActivateField={noop} rootTargetIds={targets.map((target) => target.id)} delayedGrowthEnabled={false} />
    </>),
  };
};

beforeEach(() => {
  mock.layout = { result: null, loading: false, error: "No complete field was found in the current usable cells.", yieldPerPlot: {} };
});

describe("unfinished Greenhouse plans", () => {
  it("does not turn unplaceable Cheesebite and Glasscorn into instant, free empty fields", () => {
    const { plan, html } = render({ cheesebite: null, glasscorn: null });
    expect(hasUnresolvedPlanFields(plan)).toBe(true);
    expect(html).toContain("Grow <b>3</b> Cheesebite");
    expect(html).toContain("Grow <b>1</b> Glasscorn");
    expect(html).toContain("Field unavailable");
    expect(html).toContain("Time unavailable");
    expect(html).toContain("Materials are incomplete");
    expect(html).toContain("Input crops unresolved");
    expect(html).not.toContain("instant");
    expect(html).not.toContain("Nothing else needs to be brought");
    expect(html).not.toContain("0 direct plantings");
    expect(html).not.toContain("0 input crops");
    expect(html).not.toContain("Inputs appear with a goal");
    expect(html).not.toContain("Building the planting list");
    expect(html).not.toContain("solved-grid");
  });

  it("keeps pending calculations distinct from a failed calculation", () => {
    mock.layout = { result: null, loading: true, error: null, yieldPerPlot: {} };
    const { html } = render({}, true);
    expect(html).toContain("Calculating the remaining materials");
    expect(html).toContain("Building the planting list");
    expect(html).not.toContain("Field unavailable");
    expect(html).not.toContain("Nothing else needs to be brought");
    expect(html).not.toContain("instant");
  });

  it("does not present one solved branch as the complete materials bill", () => {
    const { html } = render({ cheesebite: { yield: 3, crops: { creambloom: 7, fermento: 11 } }, glasscorn: null });
    expect(html).toContain("Fermento");
    expect(html).toContain("Materials are incomplete");
    expect(html).toContain("Time unavailable");
    expect(html).not.toContain("instant");
  });
});
