import React from "react";
import { CalendarDays, Clock3, Info, PackageOpen, Sprout, TimerReset } from "lucide-react";
import { UtilityInfo, UtilityMetric } from "../profile-view/UtilityMetric";
import { rarityKey } from "../search/rarity";
import { CropImage } from "./components/shared";
import { GreenhousePlantIdentity } from "./GreenhousePlantIdentity";
import { SolvedGridView } from "./planner/SolvedGridView";
import {
  buildDelayedGrowthLayout,
  delayedGrowthWaveMap,
  estimateDelayedGrowthTiming,
  fullyGrownInPlace,
  type DelayedGrowthLayout,
} from "./planner/delayedGrowth";
import {
  expectedGrowthCyclesLeft,
  hasSpread,
  type EstimateSettings,
  type PlanEstimates,
} from "./planner/planEstimates";
import { hasUnresolvedPlanFields, type SolverPlan, type SolverPlanNode } from "./planner/solverPlan";
import { cropBill, greenhouseCellKey, useSolvedLayout } from "./planner/useSolvedLayout";
import { formatDuration, stageSeconds } from "./planner/time";
import type { CropDefinition, MutationDefinition, SolveResponse } from "./types/greenhouse";

interface PlanDataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

interface FieldResolution {
  result: SolveResponse;
  delayed: DelayedGrowthLayout | null;
}

interface GreenhousePlanBreakdownProps {
  plan: SolverPlan | null;
  estimates: PlanEstimates | null;
  targetLabel: string | null;
  measuring: boolean;
  dataset: PlanDataset;
  sizing: Record<string, number>;
  growth: EstimateSettings;
  growthSpeedSource?: "api" | "manual" | "default";
  cells: [number, number][];
  onOpenItem: (id: string) => void;
  activeFieldId?: string | null;
  onSelectField: (node: SolverPlanNode, phaseIndex: number, fieldIndex: number) => void;
  onActivateField: (node: SolverPlanNode, phaseIndex: number) => void;
  rootTargetIds: readonly string[];
  delayedGrowthEnabled: boolean;
}

const rarityStyle = (raw: string | null | undefined): React.CSSProperties | undefined => {
  const key = rarityKey(raw);
  return key
    ? ({ "--greenhouse-rarity": `var(--color-rarity-${key})` } as React.CSSProperties)
    : undefined;
};

const PlanItem = GreenhousePlantIdentity;

const FieldPlant: React.FC<{
  id: string;
  count: number;
  dataset: PlanDataset;
  onOpen: (id: string) => void;
}> = ({ id, count, dataset, onOpen }) => {
  const crop = dataset.crops[id];
  const mutation = dataset.mutations[id];
  return <GreenhousePlantIdentity id={id} name={crop?.name ?? mutation?.name ?? id}
    rarity={mutation?.rarity} count={count} onOpen={onOpen} />;
};

const FieldPlan: React.FC<{
  node: SolverPlanNode;
  estimate: PlanEstimates["byId"][string] | undefined;
  phaseLabel: string;
  fieldNumber: number;
  dataset: PlanDataset;
  spots?: number;
  measuring: boolean;
  growth: EstimateSettings;
  cells: [number, number][];
  delayedGrowthEnabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onOpen: (id: string) => void;
  onResolve: (id: string, resolution: FieldResolution) => void;
}> = ({
  node,
  estimate,
  phaseLabel,
  fieldNumber,
  dataset,
  spots,
  measuring,
  growth,
  cells,
  delayedGrowthEnabled,
  selected,
  onSelect,
  onOpen,
  onResolve,
}) => {
  const fieldRef = React.useRef<HTMLElement>(null);
  const observerUnavailable = typeof window === "undefined" || !("IntersectionObserver" in window);
  const [previewReady, setPreviewReady] = React.useState(observerUnavailable);
  const [previewVisible, setPreviewVisible] = React.useState(observerUnavailable);

  React.useEffect(() => {
    if (!fieldRef.current || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const nearby = entries.some((entry) => entry.isIntersecting);
      setPreviewVisible(nearby);
      if (nearby) setPreviewReady(true);
    }, { rootMargin: "500px 0px" });
    observer.observe(fieldRef.current);
    return () => observer.disconnect();
  }, []);

  const mutationIds = React.useMemo(() => [node.id], [node.id]);
  /*
   * Delayed growth changes the route itself, including the materials total and
   * which dependency phases remain. Resolve every staged field when that
   * option is on; tying this calculation to viewport proximity made the plan
   * contradict itself until the user scrolled far enough to reveal a card.
   * Ordinary field previews stay lazy.
   */
  const solved = useSolvedLayout(mutationIds, cells, spots, previewReady || delayedGrowthEnabled);
  const delayedLayout = React.useMemo(() => {
    if (!delayedGrowthEnabled || node.plots !== 1 || !solved.result) return null;
    const finalSpots = solved.result.mutations.filter((placement) => placement.mutation === node.id).length;
    if (node.need > finalSpots) return null;
    return buildDelayedGrowthLayout(solved.result, node.id, dataset, cells);
  }, [cells, dataset, delayedGrowthEnabled, node.id, node.need, node.plots, solved.result]);
  const delayedTiming = React.useMemo(
    () => delayedLayout
      ? estimateDelayedGrowthTiming(delayedLayout, node.id, node.need, dataset, growth)
      : null,
    [dataset, delayedLayout, growth, node.id, node.need],
  );
  const previewResult = delayedLayout?.displayResult ?? solved.result;
  const mutationWaves = React.useMemo(
    () => delayedLayout ? delayedGrowthWaveMap(delayedLayout) : undefined,
    [delayedLayout],
  );

  React.useEffect(() => {
    if (!previewResult) return;
    onResolve(node.id, { result: previewResult, delayed: delayedLayout });
  }, [delayedLayout, node.id, onResolve, previewResult]);
  const plants = React.useMemo(
    () => previewResult
      ? Object.entries(cropBill(previewResult.placements)).sort((left, right) => right[1] - left[1])
      : [],
    [previewResult],
  );
  const stageSpan = (cycles: number, empty: string) => cycles <= 0
    ? empty
    : `${cycles.toLocaleString()} cycle${cycles === 1 ? "" : "s"} (${formatDuration(cycles * (estimate?.breakdown.stageSeconds ?? 0))})`;
  const secondsPerCycle = estimate?.breakdown.stageSeconds ?? stageSeconds(growth);
  const visibleExpectedSeconds = delayedTiming
    ? delayedTiming.expectedCycles * secondsPerCycle
    : estimate?.expectedSecondsLeft;
  const visibleP90Seconds = delayedTiming
    ? delayedTiming.p90Cycles * secondsPerCycle
    : estimate?.p90SecondsLeft;
  const growthCycles = delayedTiming
    ? Math.max(1, Math.round(delayedTiming.expectedCycles))
    : expectedGrowthCyclesLeft(estimate);
  const hasGrowthCycles = growthCycles !== null;
  const delayedInputCount = delayedLayout
    ? Object.values(delayedLayout.grownInPlace).reduce((sum, count) => sum + count, 0)
    : 0;
  const fieldState = solved.error
    ? "Field unavailable"
    : delayedLayout
    ? `${previewResult?.mutations.filter((placement) => placement.mutation === node.id).length ?? 0} final spawn spot${(previewResult?.mutations.filter((placement) => placement.mutation === node.id).length ?? 0) === 1 ? "" : "s"} · ${delayedInputCount} input${delayedInputCount === 1 ? "" : "s"} grow in place`
    : estimate
    ? `${estimate.spots.toLocaleString()} spawn spot${estimate.spots === 1 ? "" : "s"}`
    : measuring
      ? "Measuring"
      : "Field pending";
  const hasConfidence = Boolean(
    visibleExpectedSeconds !== undefined &&
    visibleP90Seconds !== undefined &&
    hasSpread(visibleExpectedSeconds, visibleP90Seconds),
  );
  const chanceLabel = estimate
    ? `${Math.round(estimate.spawnChance * 1_000) / 10}% per open spot each cycle`
    : "";
  const rollWait = estimate?.breakdown.cyclesToFill;
  const rollWaitLabel = rollWait !== undefined && Number.isFinite(rollWait)
    ? `${Math.round(rollWait * 10) / 10} cycle${Math.round(rollWait * 10) / 10 === 1 ? "" : "s"} expected`
    : null;
  const rollP90 = estimate?.breakdown.p90CyclesToFill;
  const delayedGroups = delayedLayout
    ? Object.entries(delayedLayout.grownInPlace).map(([id, count]) => {
        const name = dataset.mutations[id]?.name ?? id;
        return `${count.toLocaleString()} ${name}`;
      }).join(", ")
    : "";
  const mechanics = delayedTiming && estimate
    ? [
        {
          key: "inputs",
          label: "First wave",
          icon: <Sprout aria-hidden="true" />,
          detail: `${delayedGroups} grow in their final cells · ~${Math.round(delayedTiming.dependencyExpectedCycle * 10) / 10} cycles expected`,
        },
        {
          key: "spread",
          label: "Final rolls",
          icon: <TimerReset aria-hidden="true" />,
          detail: `~${Math.round(delayedTiming.finalRollExpectedCycles * 10) / 10} cycles expected · ${delayedTiming.finalRollP90Cycles} by 90% · ${chanceLabel}`,
        },
        {
          key: "growth",
          label: "After it appears",
          icon: <Clock3 aria-hidden="true" />,
          detail: estimate.breakdown.mutationStages > 0
            ? `${stageSpan(estimate.breakdown.mutationStages, "")} to mature`
            : "Ready on the cycle it appears",
        },
        {
          key: "expiry",
          label: "Reuse window",
          icon: <CalendarDays aria-hidden="true" />,
          detail: Number.isFinite(estimate.maxWindow)
            ? `${stageSpan(estimate.maxWindow, "none")} available`
            : "No decay limit",
        },
      ]
    : estimate
    ? [
        {
          key: "inputs",
          label: "Inputs",
          icon: <Sprout aria-hidden="true" />,
          detail: estimate.breakdown.inputStages > 0
            ? `${stageSpan(estimate.breakdown.inputStages, "")} for ${estimate.breakdown.inputName ?? "the slowest input"}`
            : "No input-growth wait",
        },
        {
          key: "spread",
          label: "Mutation rolls",
          icon: <TimerReset aria-hidden="true" />,
          detail: estimate.mechanicOnly
            ? "Resolved by its special mechanic, not a percentage roll"
            : estimate.completionMode === "single-sowing" && rollWaitLabel
              ? `${rollWaitLabel}${rollP90 ? ` · ${rollP90} by 90%` : ""} · ${chanceLabel}`
              : `Harvest ${estimate.harvestWindow === 1 ? "each cycle" : `after ${estimate.harvestWindow} rolls`} · ${chanceLabel}`,
        },
        {
          key: "growth",
          label: "After it appears",
          icon: <Clock3 aria-hidden="true" />,
          detail: estimate.breakdown.mutationStages > 0
            ? `${stageSpan(estimate.breakdown.mutationStages, "")} to mature`
            : "Ready on the cycle it appears",
        },
        {
          key: "expiry",
          label: "Reuse window",
          icon: <CalendarDays aria-hidden="true" />,
          detail: Number.isFinite(estimate.maxWindow)
            ? `${stageSpan(estimate.maxWindow, "none")} available`
            : "No decay limit",
        },
      ]
    : [];

  return (
    <article ref={fieldRef} className={`greenhouse-plan-field${selected ? " is-selected" : ""}`}>
      <div
        className="greenhouse-plan-field-visual"
        role="button"
        tabIndex={0}
        aria-label={`Show the ${node.name} field on your greenhouse`}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          onSelect();
        }}
        title={`Show the ${node.name} field on your greenhouse`}
      >
        <span>{phaseLabel} · FIELD {fieldNumber}</span>
        {previewResult && previewVisible ? (
          <SolvedGridView
            result={previewResult}
            data={dataset}
            cellSize={28}
            mutationWaveByPlacement={mutationWaves}
          />
        ) : (
          <div className={`greenhouse-plan-field-placeholder${solved.error ? " is-error" : ""}`} aria-live="polite">
            <Sprout aria-hidden="true" />
            <strong>{solved.error ? "Field unavailable" : previewReady ? "Laying out this field" : "Field preview queued"}</strong>
            <small>{solved.error ?? (previewReady ? "Using the same solver result as the crop bill." : "It loads just before this step reaches the screen.")}</small>
          </div>
        )}
      </div>

      <div className="greenhouse-plan-field-copy">
        <header className="greenhouse-plan-field-priority">
          <button
            type="button"
            className="greenhouse-plan-field-target"
            style={rarityStyle(node.rarity)}
            onClick={onSelect}
            aria-pressed={selected}
            title={`Show the ${node.name} field on your greenhouse`}
          >
            <CropImage cropId={node.id} cropName={node.name} width={38} height={38} showFallback />
            <span>
              <small>TARGET MUTATION</small>
              <strong>Grow <b>{node.need.toLocaleString()}</b> {node.name}</strong>
            </span>
          </button>
          <div className="greenhouse-plan-field-cycles" aria-label={hasGrowthCycles ? `About ${growthCycles} total growth cycles` : fieldState}>
            <TimerReset aria-hidden="true" />
            <span>
              <strong>{hasGrowthCycles ? `~${growthCycles.toLocaleString()}` : measuring && !solved.error ? "…" : "—"}</strong>
              <b>cycle{growthCycles === 1 ? "" : "s"} to ready</b>
              <small>
                {fieldState}
                {visibleExpectedSeconds !== undefined ? ` · ~${formatDuration(visibleExpectedSeconds)} expected` : ""}
                {hasConfidence && visibleP90Seconds !== undefined ? ` · 90% within ${formatDuration(visibleP90Seconds)}` : ""}
              </small>
            </span>
          </div>
        </header>

        <div className="greenhouse-plan-field-recipe">
          <small>{delayedLayout ? "PLANT NOW" : "PLANT THIS FIELD"}</small>
          <div>
            {plants.map(([id, count]) => (
              <FieldPlant key={id} id={id} count={count} dataset={dataset} onOpen={onOpen} />
            ))}
            {plants.length === 0 && (
              <span className="greenhouse-plan-empty">
                {solved.error ? "Planting list unavailable." : previewResult ? "No inputs required." : "Building the planting list…"}
              </span>
            )}
          </div>
          {delayedLayout && (
            <p className="greenhouse-plan-delay-note">
              <TimerReset aria-hidden="true" />
              <span>
                <strong>Delayed growth</strong>
                {` ${delayedGroups} grow exactly where the next mutation needs them, so there is no harvest-and-replant step between waves.`}
              </span>
            </p>
          )}
        </div>

        {mechanics.length > 0 && (
          <div className="greenhouse-plan-field-mechanics" aria-label="Field timing and mechanics">
            {mechanics.map((detail) => (
              <span key={detail.key} className={`is-${detail.key}`}>
                {detail.icon}
                <small>{detail.label}</small>
                <b>{detail.detail}</b>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
};

export const GreenhousePlanBreakdown: React.FC<GreenhousePlanBreakdownProps> = ({
  plan,
  estimates,
  targetLabel,
  measuring,
  dataset,
  sizing,
  growth,
  growthSpeedSource,
  cells,
  onOpenItem,
  activeFieldId,
  onSelectField,
  onActivateField,
  rootTargetIds,
  delayedGrowthEnabled,
}) => {
  // A delayed field from another mask or quantity must not remove this route's dependencies.
  const resolutionKey = JSON.stringify([
    greenhouseCellKey(cells), delayedGrowthEnabled,
    plan?.cycles.flatMap((cycle) => cycle.produce.map((node) => [node.id, node.need, node.plots, sizing[node.id]])),
  ]);
  const [resolvedFields, setResolvedFields] = React.useState<{
    key: string;
    fields: Record<string, FieldResolution>;
  }>({ key: "", fields: {} });
  const fieldResolutions = React.useMemo(
    () => resolvedFields.key === resolutionKey ? resolvedFields.fields : {},
    [resolutionKey, resolvedFields],
  );
  const reportFieldResolution = React.useCallback((id: string, resolution: FieldResolution) => {
    setResolvedFields((current) => {
      const fields = current.key === resolutionKey ? current.fields : {};
      const previous = fields[id];
      if (previous?.result === resolution.result && previous.delayed === resolution.delayed) return current;
      return { key: resolutionKey, fields: { ...fields, [id]: resolution } };
    });
  }, [resolutionKey]);
  const rootTargetSet = React.useMemo(() => new Set(rootTargetIds), [rootTargetIds]);

  /*
   * Once a later field proves that one of its mutation inputs can grow in its
   * final support cells, the earlier production field is no longer a task.
   * Keep an explicit goal even when it is also a dependency: the user still
   * asked for those units in their own right, so swallowing that row would
   * understate the job.
   */
  const absorptionOwners = React.useMemo(() => {
    const owners = new Map<string, { node: SolverPlanNode; cycleIndex: number; fieldIndex: number }>();
    if (!delayedGrowthEnabled || !plan) return owners;
    const currentNodes = plan.cycles.flatMap((cycle) => cycle.produce);
    const currentIds = new Set(currentNodes.map((node) => node.id));

    for (const cycle of plan.cycles) {
      cycle.produce.forEach((node, fieldIndex) => {
        const delayed = fieldResolutions[node.id]?.delayed;
        if (!delayed) return;
        for (const absorbedId of Object.keys(delayed.grownInPlace)) {
          const consumers = currentNodes.filter((candidate) => !candidate.covered && candidate.need > 0 &&
            dataset.mutations[candidate.id]?.requirements.some((requirement) => requirement.crop === absorbedId)
          );
          if (currentIds.has(absorbedId) && !rootTargetSet.has(absorbedId) &&
            fullyGrownInPlace(absorbedId, consumers.map((consumer) => fieldResolutions[consumer.id]?.delayed))) {
            owners.set(absorbedId, { node, cycleIndex: cycle.index, fieldIndex });
          }
        }
      });
    }
    return owners;
  }, [dataset.mutations, delayedGrowthEnabled, fieldResolutions, plan, rootTargetSet]);

  const activeCycles = React.useMemo(() => (plan?.cycles ?? [])
    .map((cycle) => ({
      ...cycle,
      produce: cycle.produce.filter((node) =>
        !node.covered && node.need > 0 && !absorptionOwners.has(node.id)
      ),
    }))
    .filter((cycle) => cycle.produce.length > 0), [absorptionOwners, plan]);

  /* Keep the locked or hybrid plot on the route that replaced a hidden field. */
  React.useEffect(() => {
    if (!activeFieldId) return;
    const owner = absorptionOwners.get(activeFieldId);
    if (owner) onActivateField(owner.node, owner.cycleIndex);
  }, [absorptionOwners, activeFieldId, onActivateField]);

  const activeFields = React.useMemo(() => activeCycles.flatMap((cycle) =>
    cycle.produce.map((node) => ({ node, cycleIndex: cycle.index }))
  ), [activeCycles]);

  /*
   * In staged mode the card's solved layout is the task. Build the materials
   * strip from those literal placements so it cannot keep quoting the direct
   * field that was just removed. For unresolved or special/manual routes, keep
   * the existing plan bill until there is enough evidence to replace it.
   */
  const routeMaterials = React.useMemo(() => {
    if (!plan || !delayedGrowthEnabled || absorptionOwners.size === 0 || plan.manual.length > 0) return null;
    if (activeFields.some(({ node }) => !fieldResolutions[node.id]?.result)) return null;

    const totals = new Map<string, number>();
    for (const { node } of activeFields) {
      const result = fieldResolutions[node.id].result;
      const repeat = Math.max(1, node.plots ?? 1);
      for (const [id, count] of Object.entries(cropBill(result.placements))) {
        totals.set(id, (totals.get(id) ?? 0) + count * repeat);
      }
    }
    return [...totals.entries()]
      .map(([id, count]) => ({
        id,
        count,
        crop: dataset.crops[id],
        mutation: dataset.mutations[id],
      }))
      .sort((left, right) =>
        Number(Boolean(left.mutation)) - Number(Boolean(right.mutation)) ||
        right.count - left.count ||
        (left.crop?.name ?? left.mutation?.name ?? left.id).localeCompare(right.crop?.name ?? right.mutation?.name ?? right.id)
      );
  }, [absorptionOwners.size, activeFields, dataset, delayedGrowthEnabled, fieldResolutions, plan]);

  const routeSecondsById = React.useMemo(() => {
    const seconds: Record<string, number> = {};
    if (!plan) return seconds;
    for (const { node } of activeFields) {
      const delayed = fieldResolutions[node.id]?.delayed;
      const delayedTiming = delayed
        ? estimateDelayedGrowthTiming(delayed, node.id, node.need, dataset, growth)
        : null;
      const value = delayedTiming
        ? delayedTiming.expectedCycles * stageSeconds(growth)
        : estimates?.byId[node.id]?.expectedSecondsLeft;
      if (value !== undefined && Number.isFinite(value)) seconds[node.id] = value;
    }
    return seconds;
  }, [activeFields, dataset, estimates, fieldResolutions, growth, plan]);

  const stagedRouteActive = absorptionOwners.size > 0;
  const routeExpectedSeconds = stagedRouteActive && activeCycles.every((cycle) =>
    cycle.produce.every((node) => routeSecondsById[node.id] !== undefined)
  )
    ? activeCycles.reduce(
        (total, cycle) => total + Math.max(0, ...cycle.produce.map((node) => routeSecondsById[node.id])),
        0,
      )
    : undefined;

  if (!plan || !targetLabel) return null;
  const fieldsUnresolved = hasUnresolvedPlanFields(plan);
  const timingResolved = !fieldsUnresolved && activeFields.every(({ node }) => routeSecondsById[node.id] !== undefined);
  const directSupplyTypes = plan.baseCrops.length + plan.placed.length;
  const supplyTypes = routeMaterials?.length ?? directSupplyTypes;
  const fieldCount = activeCycles.reduce((total, cycle) => total + cycle.produce.length, 0);
  const routePlantings = activeCycles.reduce(
    (total, cycle) => total + cycle.produce.reduce((cycleTotal, node) => cycleTotal + (node.plots ?? 0), 0),
    0,
  );

  return (
    <section className="greenhouse-plan-breakdown" aria-labelledby="greenhouse-plan-breakdown-title">
      <header className="greenhouse-plan-breakdown-heading">
        <div>
          <div className="greenhouse-plan-title"><h2 id="greenhouse-plan-breakdown-title">Growing plan</h2>
          <UtilityInfo title="Growing plan" info={{ summary: delayedGrowthEnabled
              ? "Eligible fields now grow their next dependency in place. Each staged field shows the revised rolls and ready time."
              : "Each phase resolves its dependencies before the next. Every field separates maturity, spread rolls, growth, and expiry." }}>
            <button type="button" className="profile-metric-hint-button"><Info aria-hidden /></button>
          </UtilityInfo></div>
          <p>{targetLabel}</p>
        </div>
        <dl className="greenhouse-plan-totals" aria-label="Plan totals">
          <UtilityMetric label="Item types" value={fieldsUnresolved ? "—" : supplyTypes.toLocaleString()} tone="storage" info={{ summary: "Distinct crop and mutation supplies needed by the fields below." }} />
          <UtilityMetric label="Fields" value={fieldsUnresolved ? "—" : fieldCount.toLocaleString()} tone="plots" info={{ summary: "Planned field layouts across the growing phases." }} />
          <UtilityMetric label="Grow phases" value={fieldsUnresolved ? "—" : activeCycles.length.toLocaleString()} tone="operations" info={{ summary: "Dependency phases. Finish each phase before using its outputs in the next." }} />
          <UtilityMetric label={stagedRouteActive ? "Route plantings" : "Direct plantings"} value={fieldsUnresolved ? "—" : (stagedRouteActive ? routePlantings : plan.totalPlantings).toLocaleString()} tone="growth" info={{ summary: "Total field plantings needed across the plan, including repeated use of a layout." }} />
          <UtilityMetric label={stagedRouteActive ? "Staged time" : "Time left"} tone="time" info={{ summary: "Estimated route duration using the timing inputs below. Mutation rolls vary; each field includes its expected time and confidence range where available." }} value={!timingResolved ? measuring ? "Measuring" : "Unavailable" : routeExpectedSeconds !== undefined
              ? `~${formatDuration(routeExpectedSeconds)}`
              : estimates
                ? `~${formatDuration(estimates.total.expectedSecondsLeft)}`
                : measuring ? "Measuring" : "Unknown"} />
        </dl>
      </header>

      <dl className="greenhouse-plan-timing" aria-label="Timing inputs used by this plan">
        <UtilityMetric label="One grow cycle" value={`~${formatDuration(stageSeconds(growth))}`} tone="time" info={{ summary: "Estimated time for one growth stage, reduced by Greenhouse Speed, unique crops and Crop Growth. The planner uses the wiki-derived timing model." }} />
        <UtilityMetric label="Greenhouse Speed" value={`Tier ${growth.speedTier}`} tone="progress" info={{ summary: "Growth Speed upgrade tier used in the timing estimate.", rows: [{ label: "Source", value: growthSpeedSource === "api" ? "Selected profile" : "Planner setting" }] }} />
        <UtilityMetric label="Unique crops" value={`${growth.uniqueCrops}/12`} tone="growth" info={{ summary: "Unique crop types used in the growth-time estimate.", rows: [{ label: "Source", value: "Saved browser setting" }] }} />
        <UtilityMetric label="Crop Growth" value={`${growth.cropGrowth}/200`} tone="materials" info={{ summary: "Crop Growth stat used to reduce the duration of each growth cycle.", rows: [{ label: "Source", value: "Planner setting" }] }} />
      </dl>

      <div className="greenhouse-plan-breakdown-body">
        <section className="greenhouse-plan-supplies" aria-label="Materials">
          <header>
            <PackageOpen aria-hidden="true" />
            <h3>Materials</h3>
            <span>{fieldsUnresolved ? measuring ? "Calculating…" : "Incomplete" : `${supplyTypes.toLocaleString()} item type${supplyTypes === 1 ? "" : "s"}`}</span>
          </header>
          <div className="greenhouse-plan-supply-list">
            {routeMaterials
              ? routeMaterials.map(({ id, count, crop, mutation }) => (
                <PlanItem
                  key={`route:${id}`}
                  id={id}
                  name={crop?.name ?? mutation?.name ?? id}
                  rarity={mutation?.rarity}
                  count={count}
                  detail={`${mutation ? "Mutation input" : "Base crop"} · ${count === 1 ? "1 to plant" : "to plant"}`}
                  onOpen={onOpenItem}
                />
              ))
              : <>
                  {plan.baseCrops.map((crop) => {
                    const requested = crop.rawNeed ?? crop.need;
                    const coveredByStorage = crop.covered || (crop.rawNeed !== undefined && crop.need === 0);
                    const detail = coveredByStorage
                      ? "Covered by captured storage"
                      : crop.have > 0
                        ? `${crop.need.toLocaleString()} still to gather`
                        : `Base crop · ${requested === 1 ? "1 to gather" : "to gather"}`;
                    return (
                      <PlanItem
                        key={`crop:${crop.id}`}
                        id={crop.id}
                        name={crop.name}
                        rarity={crop.rarity}
                        count={requested}
                        detail={detail}
                        onOpen={onOpenItem}
                      />
                    );
                  })}
                  {plan.placed.map((mutation) => (
                    <PlanItem
                      key={`mutation:${mutation.id}`}
                      id={mutation.id}
                      name={mutation.name}
                      rarity={dataset.mutations[mutation.id]?.rarity}
                      count={mutation.count}
                      detail={mutation.covered ? "From captured storage" : `Mutation input · ${mutation.count === 1 ? "1 field placement" : "field placements"}`}
                      onOpen={onOpenItem}
                    />
                  ))}
                </>}
            {fieldsUnresolved
              ? <p className="greenhouse-plan-empty">{measuring ? "Calculating the remaining materials…" : "Materials are incomplete because a field could not be arranged in the current usable cells."}</p>
              : supplyTypes === 0 && <p className="greenhouse-plan-empty">Nothing else needs to be brought.</p>}
          </div>
        </section>

        <section className="greenhouse-plan-cycles" aria-label="Solved growth phases">
          <header className="greenhouse-plan-sequence-heading">
            <div>
              <span>GROW PHASES</span>
              <h3>{delayedGrowthEnabled ? "Let eligible dependencies grow into place" : "Build each dependency before the next"}</h3>
            </div>
            <div className="greenhouse-plan-sequence-actions">
              <div className="greenhouse-plan-field-legend" aria-label="Field legend">
                <span><i className="is-planted" /> planted input</span>
                <span><i className="is-spawn" /> mutation space</span>
                {delayedGrowthEnabled && <span><i className="is-later" /> later wave</span>}
                <span><i className="is-unused" /> unused</span>
              </div>
            </div>
          </header>

          <div className="greenhouse-plan-cycle-grid">
            {activeCycles.map((cycle, routeCycleIndex) => {
              const cycleEstimate = estimates?.cycles.find((entry) => entry.index === cycle.index);
              const fields = cycle.produce;
              const phaseLabel = `PHASE ${routeCycleIndex + 1}`;
              const cyclePlantings = fields.reduce((total, node) => total + (node.plots ?? 0), 0);
              const cycleResolved = fields.every((node) => node.plots !== undefined && routeSecondsById[node.id] !== undefined);
              const stagedCycleSeconds = stagedRouteActive && fields.every((node) => routeSecondsById[node.id] !== undefined)
                ? Math.max(0, ...fields.map((node) => routeSecondsById[node.id]))
                : undefined;
              return (
                <section key={cycle.index} className="greenhouse-plan-cycle">
                  <header>
                    <div>
                      <span>{phaseLabel}</span>
                      <h3>
                        {fields.length.toLocaleString()} field{fields.length === 1 ? "" : "s"} · {cycleResolved ? `${cyclePlantings.toLocaleString()} direct planting${cyclePlantings === 1 ? "" : "s"}` : "plantings unresolved"}
                      </h3>
                    </div>
                    <strong>{!cycleResolved ? measuring ? "measuring" : "Time unavailable" : stagedCycleSeconds !== undefined
                      ? `~${formatDuration(stagedCycleSeconds)} left`
                      : cycleEstimate ? `~${formatDuration(cycleEstimate.expectedSecondsLeft)} left` : measuring ? "measuring" : ""}</strong>
                  </header>
                  <div className="greenhouse-plan-cycle-fields">
                    {fields.map((node, index) => (
                      <FieldPlan
                        key={node.id}
                        node={node}
                        estimate={estimates?.byId[node.id]}
                        phaseLabel={phaseLabel}
                        fieldNumber={index + 1}
                        dataset={dataset}
                        spots={sizing[node.id]}
                        measuring={measuring}
                        growth={growth}
                        cells={cells}
                        delayedGrowthEnabled={delayedGrowthEnabled}
                        selected={activeFieldId === node.id}
                        onSelect={() => onSelectField(node, cycle.index, index)}
                        onOpen={onOpenItem}
                        onResolve={reportFieldResolution}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {plan.manual.length > 0 && (
              <section className="greenhouse-plan-cycle is-manual">
                <header><div><span>MANUAL</span><h3>Special steps</h3></div></header>
                <div className="greenhouse-plan-manual-steps">
                  {plan.manual.map((node) => (
                    <PlanItem
                      key={node.id}
                      id={node.id}
                      name={node.name}
                      rarity={node.rarity}
                      count={node.need}
                      detail="Follow its special growing condition"
                      onOpen={onOpenItem}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </section>
      </div>
    </section>
  );
};

export default GreenhousePlanBreakdown;
