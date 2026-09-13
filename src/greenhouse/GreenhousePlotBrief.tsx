import React from "react";
import { Sprout, Target } from "lucide-react";
import { GreenhousePlantIdentity } from "./GreenhousePlantIdentity";
import type { DesignerPlacement } from "./context";
import type { PlanEstimates } from "./planner/planEstimates";
import { hasUnresolvedPlanFields, type SolverPlan } from "./planner/solverPlan";
import type { CropDefinition, MutationDefinition } from "./types/greenhouse";
import { summarizePlacements, type PlacementSummary } from "./plotBriefModel";

interface PlanDataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

interface BriefItem extends PlacementSummary {
  rarity?: string | null;
  cycles?: number | null;
}

interface GreenhousePlotBriefProps {
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
  plan: SolverPlan | null;
  estimates: PlanEstimates | null;
  targetLabel: string | null;
  measuring: boolean;
  dataset: PlanDataset;
  onOpenItem: (id: string) => void;
}

const mergeItems = (items: BriefItem[]): BriefItem[] => {
  const totals = new Map<string, BriefItem>();
  for (const item of items) {
    const current = totals.get(item.id);
    if (current) {
      current.count += item.count;
      continue;
    }
    totals.set(item.id, { ...item });
  }
  return [...totals.values()].sort((left, right) =>
    right.count - left.count || left.name.localeCompare(right.name),
  );
};

const BriefItemButton: React.FC<{
  item: BriefItem;
  onOpen: (id: string) => void;
}> = ({ item, onOpen }) => (
  <GreenhousePlantIdentity {...item} onOpen={onOpen}
    detail={item.cycles ? `~${item.cycles.toLocaleString()} cycles` : undefined} />
);

const BriefGroup: React.FC<{
  label: string;
  icon: React.ReactNode;
  items: BriefItem[];
  total: number | null;
  empty: string;
  onOpen: (id: string) => void;
}> = ({ label, icon, items, total, empty, onOpen }) => (
  <section className="greenhouse-plot-brief-group">
    <header>
      {icon}
      <span>{label}</span>
      <b>{total === null ? "—" : total.toLocaleString()}</b>
    </header>
    <div>
      {items.map((item) => <BriefItemButton key={item.id} item={item} onOpen={onOpen} />)}
      {items.length === 0 && <small className="greenhouse-plot-brief-empty">{empty}</small>}
    </div>
  </section>
);

export const GreenhousePlotBrief: React.FC<GreenhousePlotBriefProps> = ({
  inputPlacements,
  targetPlacements,
  plan,
  estimates,
  targetLabel,
  measuring,
  dataset,
  onOpenItem,
}) => {
  const hasCurrentPlot = inputPlacements.length > 0 || targetPlacements.length > 0;
  const inputsUnresolved = !hasCurrentPlot && Boolean(plan && hasUnresolvedPlanFields(plan));

  const inputs = React.useMemo<BriefItem[]>(() => {
    if (hasCurrentPlot) {
      return summarizePlacements(inputPlacements).map((item) => ({
        ...item,
        rarity: dataset.mutations[item.id]?.rarity ?? null,
      }));
    }
    if (!plan) return [];

    return mergeItems([
      ...plan.baseCrops
        .map((node) => ({
          id: node.id,
          name: node.name,
          count: node.rawNeed ?? node.need,
          rarity: node.rarity,
        }))
        .filter((item) => item.count > 0),
      ...plan.placed
        .map((node) => ({
          id: node.id,
          name: node.name,
          count: node.count,
          rarity: dataset.mutations[node.id]?.rarity ?? null,
        }))
        .filter((item) => item.count > 0),
    ]);
  }, [dataset.mutations, hasCurrentPlot, inputPlacements, plan]);

  const targets = React.useMemo<BriefItem[]>(() => {
    if (hasCurrentPlot) {
      return summarizePlacements(targetPlacements).map((item) => {
        const cyclesToFill = estimates?.byId[item.id]?.breakdown.cyclesToFill;
        return {
          ...item,
          rarity: dataset.mutations[item.id]?.rarity ?? null,
          cycles: cyclesToFill && Number.isFinite(cyclesToFill)
            ? Math.max(1, Math.round(cyclesToFill))
            : null,
        };
      });
    }
    if (!plan) return [];

    return mergeItems(plan.cycles
      .flatMap((cycle) => cycle.produce)
      .filter((node) => !node.covered && node.need > 0)
      .map((node) => {
        const cyclesToFill = estimates?.byId[node.id]?.breakdown.cyclesToFill;
        return {
          id: node.id,
          name: node.name,
          count: node.need,
          rarity: node.rarity,
          cycles: cyclesToFill && Number.isFinite(cyclesToFill)
            ? Math.max(1, Math.round(cyclesToFill))
            : null,
        };
      }));
  }, [dataset.mutations, estimates, hasCurrentPlot, plan, targetPlacements]);

  const inputTotal = inputs.reduce((total, item) => total + item.count, 0);
  const targetTotal = targets.reduce((total, item) => total + item.count, 0);
  const headline = hasCurrentPlot
    ? targets.length === 1
      ? `Grow ${targetTotal.toLocaleString()} ${targets[0].name}`
      : `${targetTotal.toLocaleString()} mutations on the plot`
    : targetLabel
      ? `Target: ${targetLabel}`
      : "Choose a target mutation";

  return (
    <section className="greenhouse-plot-brief" aria-label={hasCurrentPlot ? "Current plot contents" : "Selected target breakdown"}>
      <div className="greenhouse-plot-brief-lead">
        <small>{hasCurrentPlot ? "CURRENT PLOT" : "GROW PLAN"}</small>
        <strong>{headline}</strong>
        <span>
          {inputsUnresolved ? "Input crops unresolved" : `${inputTotal.toLocaleString()} input crop${inputTotal === 1 ? "" : "s"}`}
          {!hasCurrentPlot && measuring && <em>measuring cycles</em>}
        </span>
      </div>

      <BriefGroup
        label="MUTATIONS TO GROW"
        icon={<Target aria-hidden="true" />}
        items={targets}
        total={targetTotal}
        empty={hasCurrentPlot ? "No targets planted" : "Choose a goal"}
        onOpen={onOpenItem}
      />
      <BriefGroup
        label="INPUT CROPS"
        icon={<Sprout aria-hidden="true" />}
        items={inputs}
        total={inputsUnresolved ? null : inputTotal}
        empty={hasCurrentPlot ? "No inputs planted" : inputsUnresolved
          ? measuring ? "Calculating the planting list…" : "Inputs unavailable until a field can be arranged."
          : plan ? "No inputs required" : "Inputs appear with a goal"}
        onOpen={onOpenItem}
      />
    </section>
  );
};

export default GreenhousePlotBrief;
