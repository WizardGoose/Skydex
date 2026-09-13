import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, Info, Minus, Plus, Repeat2, RotateCcw, X } from "lucide-react";
import { UtilityInfo } from "../profile-view/UtilityMetric";
import type { Data, Recipe } from "../types/types";
import { CalculationService } from "../services/calculationService";
import { getRarityColor } from "../utilities";
import { ReplacementPicker, type Picker, type RenderItem } from "./compact/EquationBreakdown";
import { equationsFor, groupFusionEquations, type FusionEquation } from "./compact/equations";
import { fusionDependencies, type FusionDependency, type FusionFocus } from "./fusionDependencies";
import { ShardFusionCard } from "./ShardFusionCard";
import { ShardResultSummary } from "./ShardResultSummary";
import type { StationaryFusion } from "./StationaryFusion";
import { useHuntingEstimate } from "./huntingEstimateContext";
import { acquisitionMethods } from "./acquisition";
import { ShardAcquisitionGuide } from "./ShardAcquisitionGuide";
import { ShardSourceCount, ShardAcquisitionSuffix } from "./ShardSourceCount";
import { fusionYield } from "./fusionYield";
import type { ShardProgressEntry } from "./progressionModel";
import "./stationary-fusion.css";
import "./fusion-dependencies.css";

const count = (quantity: number) => Math.ceil(quantity).toLocaleString();
function acquisitionFor(shard: string, ironman: boolean, estimatedMethod?: string) {
  return !ironman ? ["Bazaar"] : estimatedMethod && estimatedMethod !== "Unavailable" ? [estimatedMethod] : acquisitionMethods(shard);
}
function AcquisitionSuffix({ node, name, ironman }: { node: FusionDependency; name: string; ironman: boolean }) {
  const estimate = useHuntingEstimate(node.shard);
  const acquired = node.direct > 0 || (!node.recipes.length && !node.cycles.length);
  return acquired ? <ShardAcquisitionSuffix name={name} shardKey={node.shard} methods={acquisitionFor(node.shard, ironman, estimate?.method)} /> : null;
}

type Target = ComponentProps<typeof StationaryFusion>["targets"][number];
function ConnectedTarget({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<{ id: string; from: string; to: string; path: string }[]>([]);
  useLayoutEffect(() => {
    const element = root.current!;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const outputTile = element.querySelector<HTMLElement>(".shards-result-identity .profile-item-tile");
      const output = outputTile?.getBoundingClientRect();
      const paths = output?.width ? [...element.querySelectorAll<HTMLElement>(".shards-dependency-recipe > .shards-dependency-toggle")].flatMap(button => {
        const toggle = button.getBoundingClientRect();
        if (!toggle.width || !toggle.height) return [];
        const batch = button.closest<HTMLElement>(".shards-dependency-batch")!;
        if (batch.closest(".shards-cycle-steps")) return [];
        const nested = batch.closest(".shards-dependency-nested");
        const owner = nested?.parentElement;
        const source = owner ? owner.querySelector<HTMLElement>(":scope > .shards-dependency-row .profile-item-tile") : outputTile;
        if (!source) return [];
        const tile = source.getBoundingClientRect();
        if (!tile.width) return [];
        const right = owner?.classList.contains("is-right") ?? false;
        const group = batch.getBoundingClientRect();
        const outputRail = output.left + output.width / 2 - bounds.left;
        const rail = right ? bounds.width - 13 : outputRail;
        const startX = tile.left + tile.width / 2 - bounds.left;
        const startY = tile.bottom - bounds.top;
        const inputs = [...batch.querySelectorAll<HTMLElement>(":scope > .shards-dependency-group-body > .shards-dependency-children > .shards-dependency-branch > .shards-dependency-row .profile-item-tile, :scope > .shards-dependency-group-body > .shards-fusion-batch-layout > .shards-dependency-children > .shards-dependency-branch > .shards-dependency-row .profile-item-tile")]
          .map(input => input.getBoundingClientRect()).filter(input => input.width > 0);
        const inputCenter = inputs.length ? inputs[0].top + inputs[0].height / 2 : group.top + group.height / 2;
        const endY = inputCenter - bounds.top;
        const endX = (inputs.length ? right ? Math.max(...inputs.map(input => input.right)) : Math.min(...inputs.map(input => input.left)) : right ? group.right : group.left) - bounds.left;
        const border = parseFloat(getComputedStyle(batch).borderLeftWidth) || 0;
        button.style.left = `${rail + bounds.left - group.left - border - toggle.width / 2}px`;
        button.style.top = `${inputCenter - group.top - border - toggle.height / 2}px`;
        const direction = right ? 1 : -1;
        const firstBatch = batch.parentElement?.firstElementChild?.getBoundingClientRect();
        const forkY = Math.max(startY, (nested?.getBoundingClientRect().top ?? firstBatch?.top ?? group.top) - bounds.top - 5);
        const start = `M ${startX} ${startY} V ${forkY} H ${rail}`;
        return [{ id: button.getAttribute("aria-controls")!, from: source.getAttribute("aria-label") ?? "Target", to: button.getAttribute("aria-label")!.replace(/^(Collapse|Expand) /, ""),
          path: `${start} V ${endY - 4} Q ${rail} ${endY} ${rail - direction * 4} ${endY} H ${endX}` }];
      }) : [];
      setConnections(previous => JSON.stringify(previous) === JSON.stringify(paths) ? previous : paths);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    const mutations = new MutationObserver(measure);
    mutations.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-expanded"] });
    measure();
    return () => { observer.disconnect(); mutations.disconnect(); };
  }, []);
  return <div className="shards-connected-target" ref={root}>
    <svg className="shards-tree-connector" aria-hidden="true">{connections.map(connection =>
      <path key={connection.id} data-from={connection.from} data-to={connection.to} d={connection.path} />
    )}</svg>
    {children}
  </div>;
}
interface Context {
  focus?: FusionFocus;
  path: string[];
  target: Target; data: Data; busy: boolean; ironman: boolean; multiplier: number; renderItem: RenderItem;
  onReplace: (target: string, output: string, recipe: Recipe | undefined) => Promise<boolean>;
  onExcludeInput?: (target: string, input: string, excluded: boolean) => void;
  openPicker: (row: FusionEquation, slot: 0 | 1, anchor: HTMLDivElement) => void;
  closePicker: () => void;
  picker: Picker | null;
  renderFallback?: ComponentProps<typeof StationaryFusion>["renderFallback"];
}

function Allocation({ node, ironman, compact = false, onInspect, expanded, controls, name, labelled = false }: { node: FusionDependency; ironman: boolean; compact?: boolean; onInspect?: () => void; expanded?: boolean; controls?: string; name?: string; labelled?: boolean }) {
  const estimate = useHuntingEstimate(node.shard);
  if (compact) {
    const methods = acquisitionFor(node.shard, ironman, estimate?.method);
    return <span className="shards-dependency-allocation">
      {node.stored > 0 && <ShardSourceCount quantity={node.stored} source="storage" labelled={labelled} />}
      {node.direct > 0 && <ShardSourceCount quantity={node.direct} source="acquire" methods={methods} labelled={labelled} />}
      {node.recipes.length > 0 && <ShardSourceCount quantity={node.recipes.reduce((sum, batch) => sum + batch.quantity, 0)} source="fusion" onInspect={onInspect} expanded={expanded} controls={controls} name={name} labelled={labelled} />}
      {node.cycles.length > 0 && <ShardSourceCount quantity={node.cycles.reduce((sum, cycle) => sum + cycle.quantity, 0)} source="cycle" onInspect={onInspect} expanded={expanded} controls={controls} name={name} labelled={labelled} />}
    </span>;
  }
  return <span className="shards-dependency-allocation">
    {node.stored > 0 && <span><b>{count(node.stored)}</b> from storage</span>}
    {node.direct > 0 && <span className="shards-dependency-acquire"><b>{count(node.direct)}</b> {ironman ? "to gather" : "to buy"}</span>}
    {node.recipes.length > 0 && <span><b>{count(node.recipes.reduce((sum, batch) => sum + batch.quantity, 0))}</b> from fusion</span>}
    {node.cycles.length > 0 && <span><b>{count(node.cycles.reduce((sum, cycle) => sum + cycle.quantity, 0))}</b> from cycle</span>}
  </span>;
}

function DependencyGroup({ label, header, collapsedSummary, children, onToggle, focus }: { label: string; header?: ReactNode; collapsedSummary?: ReactNode; children: ReactNode; onToggle: () => void; focus?: FusionFocus }) {
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { if (focus) setExpanded(true); }, [focus]);
  const bodyId = useId();
  return <div className={`shards-dependency-batch${header ? "" : " is-summary-batch"}${expanded ? "" : " is-collapsed"}`}>
    <div className="shards-dependency-recipe">
      <button type="button" className="shards-dependency-toggle" aria-expanded={expanded} aria-controls={bodyId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`} title={`${expanded ? "Collapse" : "Expand"} group`}
        onClick={() => { onToggle(); setExpanded(value => !value); }}>
        {expanded ? <Minus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
      </button>
      {expanded ? header : collapsedSummary ?? header}
    </div>
    <div id={bodyId} className="shards-dependency-group-body" hidden={!expanded}>{children}</div>
  </div>;
}

function FusionRepeat({ repeats, outputLabel }: { repeats: number; outputLabel?: string }) {
  return <UtilityInfo control activation="hover" title="Fusion count" info={{ rows: [{ label: "Operations", value: count(repeats) }], summary: outputLabel }}>
    <span tabIndex={0} className="shards-repeat-count" aria-description={outputLabel} aria-label={`Repeat this fusion ${count(repeats)} ${repeats === 1 ? "time" : "times"}`}>
    <Repeat2 size={14} aria-hidden /><b>{count(repeats)}</b>
    </span>
  </UtilityInfo>;
}

function ExpectedFusionOutput({ node, multiplier }: { node: FusionDependency; multiplier: number }) {
  if (node.cycles.length) return <UtilityInfo activation="click" title="Expected cycle output" className="shards-expected-output" info={{
    summary: "This cycle relies on random doubling and reuses its output. Actual gains vary, so it may take more fusions or additional supplies to reach the target.",
  }}><button type="button"><span>RNG</span><Info size={12} aria-hidden /></button></UtilityInfo>;
  const totals = node.recipes.reduce((sum, batch) => {
    const output = fusionYield(batch.recipe, batch.crafts, multiplier);
    return { base: sum.base + output.baseTotal, expected: sum.expected + output.expectedTotal };
  }, { base: 0, expected: 0 });
  if (totals.expected <= totals.base) return null;
  const expected = totals.expected.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <UtilityInfo activation="click" title="Expected fusion output" className="shards-expected-output" info={{
    summary: "The plan includes Crocodile’s Pure Reptile doubling bonus. Actual output varies, so reaching the target may take more fusions.",
    rows: [{ label: "Base output", value: count(totals.base) }, { label: "Expected with doubling", value: expected }],
  }}><button type="button"><span>RNG</span><Info size={12} aria-hidden /></button></UtilityInfo>;
}

function FusionIngredientUse({ node, row, slot, context, reused, expanded, onInspect }: {
  node: FusionDependency; row: FusionEquation; slot: 0 | 1; context: Context;
  reused: boolean; expanded: boolean; onInspect: () => void;
}) {
  const shard = context.data.shards[node.shard];
  const recipes = node.recipes.map(batch => `${batch.recipe.inputs.map(id => context.data.shards[id].name).join(" + ")}: ${count(batch.crafts)} ${batch.crafts === 1 ? "fusion" : "fusions"}.`);
  const showAcquisition = !reused && (!node.recipes.length || node.direct > 0);
  const notes = reused ? ["These shards circulate through the cycle. They are not additional supplies to gather."]
    : [...recipes, ...(showAcquisition && !context.ironman ? ["Buy on the Bazaar."] : [])];
  return <div className="shards-fusion-input-use" aria-label={`${shard.name} used`}>
    <UtilityInfo activation="click" title={shard.name} ariaLabel={`${shard.name} calculation and acquisition`} info={{
      summary: `${count(row.inputs[slot])} × ${count(row.repeats)} ${row.repeats === 1 ? "fusion" : "fusions"} = ${count(node.quantity)} ${shard.name} used.`,
      rows: [
        ...(node.stored > 0 ? [{ label: "From storage", value: count(node.stored) }] : []),
        ...(node.direct > 0 ? [{ label: context.ironman ? "To gather" : "To buy", value: count(node.direct) }] : []),
        ...(node.recipes.length ? [{ label: "From fusion", value: count(node.recipes.reduce((sum, batch) => sum + batch.quantity, 0)) }] : []),
        ...(node.cycles.length ? [{ label: "From cycle", value: count(node.cycles.reduce((sum, cycle) => sum + cycle.quantity, 0)) }] : []),
      ], notes,
    }} details={showAcquisition && context.ironman ? <ShardAcquisitionGuide shardKey={node.shard} /> : undefined}>
      <button type="button" className="shards-fusion-input-info">
        <img src={`${import.meta.env.BASE_URL}shardIcons/${node.shard}.png`} alt="" width={20} height={20} />
        <strong className={getRarityColor(shard.rarity)}>{shard.name}</strong><ChevronDown size={12} aria-hidden />
      </button>
    </UtilityInfo>
    {reused ? <ShardSourceCount quantity={node.quantity} source="reused" labelled />
      : <Allocation node={node} ironman={context.ironman} compact labelled onInspect={onInspect} expanded={expanded} name={shard.name} />}
  </div>;
}

function FusionCombo({ row, context, inputs, reused = false, action }: {
  row: FusionEquation; context: Context; inputs: [FusionDependency[], FusionDependency[]]; reused?: boolean; action?: ReactNode;
}) {
  const [openInputs, setOpenInputs] = useState<ReadonlySet<string>>(() => new Set());
  const setInputOpen = useCallback((key: string, open: boolean) => setOpenInputs(current => {
    if (current.has(key) === open) return current;
    const next = new Set(current);
    if (open) next.add(key); else next.delete(key);
    return next;
  }), []);
  const names = row.recipe.inputs.map(id => context.data.shards[id].name);
  const output = fusionYield(row.recipe, row.repeats, context.multiplier);
  const outputLabel = `${count(output.perFusion)} ${context.data.shards[row.output].name} shards per fusion${output.doubleChance ? `; ${Math.round(output.doubleChance * 100)}% chance of doubling` : ""}. ${count(output.baseTotal)} base output across ${count(row.repeats)} ${row.repeats === 1 ? "fusion" : "fusions"}${reused ? ", circulated through the cycle" : ""}.`;
  return <DependencyGroup focus={context.focus} label={`${names.join(" and ")} fusion group for ${context.data.shards[row.output].name}`} onToggle={context.closePicker}
    collapsedSummary={<><span className="shards-combo-summary">{row.recipe.inputs.map((id, slot) => <span className="shards-combo-ingredient" key={slot}>
      {slot > 0 && <Plus className="shards-combo-plus" size={12} aria-hidden />}
      <img src={`${import.meta.env.BASE_URL}shardIcons/${id}.png`} alt="" width={20} height={20} />
      <span><strong className={getRarityColor(context.data.shards[id].rarity)}>{context.data.shards[id].name}</strong>{" "}
        <span className="shards-fusion-needed">({count(inputs[slot].reduce((total, input) => total + input.quantity, 0))})</span></span>
    </span>)}</span><FusionRepeat repeats={row.repeats} outputLabel={outputLabel} />{action}</>}>
    <div className="shards-fusion-batch-layout">
    <div className="shards-dependency-children is-combo">
      {([0, 1] as const).map(slot => inputs[slot].map(child => <DependencyBranch key={`${slot}:${child.shard}`} node={child} context={context} row={row} slot={slot} reused={reused}
        expansionKey={`${slot}:${child.shard}`} controlledExpanded={openInputs.has(`${slot}:${child.shard}`)} onExpand={setInputOpen} hideAllocation />))}
      <div className="shards-equation-operation">
        <Plus size={22} aria-hidden /><FusionRepeat repeats={row.repeats} outputLabel={outputLabel} />
      </div>
    <aside className="shards-fusion-batch-details" aria-label={`${context.data.shards[row.output].name} fusion details`}>
      {output.doubleChance > 0 && <p className="shards-fusion-bonus"><b>{Math.round(output.doubleChance * 100)}%</b> chance of doubling</p>}
      <div className="shards-fusion-input-uses">{([0, 1] as const).map(slot => inputs[slot].map(child => {
        const key = `${slot}:${child.shard}`;
        return <FusionIngredientUse key={key} node={child} row={row} slot={slot} context={context} reused={reused}
          onInspect={() => { context.closePicker(); setInputOpen(key, !openInputs.has(key)); }} expanded={openInputs.has(key)} />;
      }))}</div>
    </aside>
    </div>
    </div>
    {action && <div className="shards-combo-action">{action}</div>}
  </DependencyGroup>;
}

function DependencyBranch({ node, context, row, slot, reused = false, controlledExpanded, onExpand, expansionKey, hideAllocation = false }: {
  node: FusionDependency; context: Context; row?: FusionEquation; slot?: 0 | 1; reused?: boolean;
  controlledExpanded?: boolean; onExpand?: (key: string, open: boolean) => void; expansionKey?: string; hideAllocation?: boolean;
}) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const setExpanded = (open: boolean) => onExpand && expansionKey ? onExpand(expansionKey, open) : setLocalExpanded(open);
  const bodyId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const shard = context.data.shards[node.shard];
  const hasChildren = node.recipes.length > 0 || node.cycles.length > 0;
  const path = [...context.path, node.shard];
  const containsFocus = !!context.focus && path.every((id, index) => context.focus!.path[index] === id);
  useEffect(() => {
    if (!containsFocus) return;
    if (onExpand && expansionKey) onExpand(expansionKey, true); else setLocalExpanded(true);
  }, [containsFocus, context.focus, onExpand, expansionKey]);
  return <div className={`shards-dependency-branch${slot === 1 ? " is-right" : ""}${expanded ? " is-expanded" : ""}`}>
    <div className="shards-dependency-row" data-fusion-shard={node.shard} data-fusion-path={path.join("/")} tabIndex={-1}>
      <div className={`shards-dependency-picture${row ? " has-replacement" : ""}`} ref={anchor}>
        {context.renderItem(node.shard, node.quantity)}
        {row && slot !== undefined && <button className="equation-input-toggle" type="button" disabled={context.busy}
          aria-label={`Replace ${shard.name} for ${context.data.shards[context.target.id].name}`} aria-haspopup="dialog" aria-expanded={context.picker?.anchor === anchor.current}
          onClick={() => { if (anchor.current) context.openPicker(row, slot, anchor.current); }}><ChevronDown size={13} aria-hidden /></button>}
      </div>
      <div className="shards-dependency-copy">
        <div className="shards-dependency-heading">
        {hasChildren ? <button type="button" className="shards-dependency-name" aria-expanded={expanded} aria-controls={bodyId}
          aria-label={`${expanded ? "Collapse" : "Expand"} ${shard.name} ingredients`}
          onClick={() => { context.closePicker(); setExpanded(!expanded); }}>
          <strong className={getRarityColor(shard.rarity)}>{shard.name}</strong><ChevronDown size={12} className="shards-ingredient-chevron" aria-hidden />
        </button> : <span className="shards-dependency-name"><strong className={getRarityColor(shard.rarity)}>{shard.name}</strong></span>}
          <AcquisitionSuffix node={node} name={shard.name} ironman={context.ironman} />
          {!row && <span className="shards-fusion-needed">({count(node.quantity)} {reused ? "used" : "needed"})</span>}
        </div>
        {!hideAllocation && (reused ? <span className="shards-dependency-allocation"><ShardSourceCount quantity={node.quantity} source="reused" /></span> : <Allocation node={node} ironman={context.ironman} compact onInspect={() => { context.closePicker(); setExpanded(!expanded); }} expanded={expanded} controls={bodyId} name={shard.name} />)}
      </div>
    </div>
    {hasChildren && <div id={bodyId} hidden={!expanded} className="shards-dependency-nested">
      {expanded && <>
        <strong className={`shards-nested-name ${getRarityColor(shard.rarity)}`}>{shard.name}</strong>
        <ShardResultSummary showName={false} shardKey={node.shard} shard={shard} picture={null}
          calculation={<ExpectedFusionOutput node={node} multiplier={context.multiplier} />} />
        <DependencyBatches node={node} context={{ ...context, path }} />
      </>}
    </div>}
  </div>;
}

function CycleDependencies({ node, context }: { node: FusionDependency; context: Context }) {
  const [expanded, setExpanded] = useState(false);
  const bodyId = useId();
  const { rows, incompleteCycle } = useMemo(() => equationsFor(node.cycles, context.data, context.multiplier, true), [node.cycles, context.data, context.multiplier]);
  const groups = groupFusionEquations(rows.filter(row => row.cycle));
  const supplies = fusionDependencies(node.cycles.flatMap(cycle => [cycle.inputRecipe, ...cycle.cycleInputs]));
  if (incompleteCycle) return context.renderFallback?.(context.target);
  return <div className="shards-dependency-loop">
    <DependencyGroup focus={context.focus} label={`${context.data.shards[node.shard].name} cycle supplies`} header="Cycle supplies" onToggle={context.closePicker}>
    <div className="shards-dependency-children">
      {supplies.map(supply => <DependencyBranch key={supply.shard} node={supply} context={context} />)}
    </div>
    </DependencyGroup>
    <button type="button" className="shards-cycle-disclosure" aria-expanded={expanded} aria-controls={bodyId}
      onClick={() => { context.closePicker(); setExpanded(value => !value); }}>
      {expanded ? <Minus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}<span>Cycle steps</span>
      <span className="shards-repeat-count" aria-label={`${count(node.cycles.reduce((sum, cycle) => sum + cycle.craftsNeeded, 0))} fusions in cycle`}><Repeat2 size={14} aria-hidden /><b>{count(node.cycles.reduce((sum, cycle) => sum + cycle.craftsNeeded, 0))}</b></span>
    </button>
    <div id={bodyId} className="shards-cycle-steps" hidden={!expanded}>
      {expanded && [...groups].map(([output, equations]) => <div key={output}>
        {context.target.overrides.some(override => override.shardId === output) && <button className="shards-equation-reset" disabled={context.busy}
          aria-label={`Restore automatic ${context.data.shards[output].name} cycle recipes`} onClick={() => { void context.onReplace(context.target.id, output, undefined); }}><RotateCcw size={12} />Automatic</button>}
        <strong className={`shards-cycle-output ${getRarityColor(context.data.shards[output].rarity)}`}>{context.data.shards[output].name}</strong>
        <div className="shards-dependency-batches">{equations.map(row => {
          const input = (slot: 0 | 1): FusionDependency[] => [{ shard: row.recipe.inputs[slot], quantity: row.inputs[slot] * row.repeats, stored: 0, direct: 0, recipes: [], cycles: [] }];
          return <FusionCombo key={row.id} row={row} context={context} reused inputs={[input(0), input(1)]} />;
        })}</div>
      </div>)}
    </div>
  </div>;
}

function DependencyBatches({ node, context }: { node: FusionDependency; context: Context }) {
  const { data, target, multiplier, onReplace } = context;
  return <>
    {target.overrides.some(override => override.shardId === node.shard) && <button className="shards-equation-reset" disabled={context.busy}
      aria-label={`Restore automatic ${data.shards[node.shard].name} recipes`} onClick={() => { void onReplace(target.id, node.shard, undefined); }}><RotateCcw size={12} />Automatic</button>}
    <div className="shards-dependency-batches">{node.recipes.map((batch, index) => {
      const row: FusionEquation = { id: `${node.shard}-${index}`, output: node.shard, recipe: batch.recipe,
        inputs: batch.recipe.inputs.map(id => data.shards[id].fuse_amount) as [number, number],
        yield: CalculationService.getInstance().getEffectiveOutputQuantity(batch.recipe, multiplier), repeats: batch.crafts, needed: batch.quantity, producers: [[], []] };
      return <FusionCombo key={`${batch.recipe.inputs.join(":")}:${batch.recipe.outputQuantity}`} row={row} context={context}
        inputs={[fusionDependencies(batch.inputs[0]), fusionDependencies(batch.inputs[1])]}
        action={context.onExcludeInput && !context.busy && !node.cycles.length && <UtilityInfo activation="click" title="Exclude an ingredient" ariaLabel={`Exclude an ingredient from ${batch.recipe.inputs.map(id => data.shards[id].name).join(" and ")}`} info={{ summary: `Recalculate ${data.shards[target.id].name} without recipes that use this ingredient.` }}
          details={<div className="shards-exclude-choices">{[...new Set(batch.recipe.inputs)].map(input => <div key={input}>{context.renderItem(input)}<button type="button" disabled={context.busy}
            onClick={() => context.onExcludeInput?.(target.id, input, true)}>Exclude <strong className={getRarityColor(data.shards[input].rarity)}>{data.shards[input].name}</strong></button></div>)}</div>}>
          <button type="button" disabled={context.busy}><X size={14} /></button>
        </UtilityInfo>} />;
    })}</div>
    {node.cycles.length > 0 && <CycleDependencies node={node} context={context} />}
  </>;
}

function TargetDependencies({ target, data, busy, ironman, crocodileMultiplier = 1, renderItem, onReplace, onExcludeInput, excludedInputs, collapsed, onToggle, renderDirect, renderFallback, focus, progressByKey }: {
  target: Target; data: Data; busy: boolean; ironman: boolean; crocodileMultiplier?: number; renderItem: RenderItem;
  onReplace: Context["onReplace"]; collapsed?: boolean; onToggle?: () => void;
  onExcludeInput?: Context["onExcludeInput"]; excludedInputs?: Record<string, string[]>;
  renderDirect?: ComponentProps<typeof StationaryFusion>["renderDirect"]; renderFallback?: ComponentProps<typeof StationaryFusion>["renderFallback"];
  focus?: FusionFocus;
  progressByKey?: ReadonlyMap<string, ShardProgressEntry>;
}) {
  const [picker, setPicker] = useState<Picker | null>(null);
  const nodes = useMemo(() => fusionDependencies(target.tree), [target.tree]);
  const node = nodes.find(node => node.shard === target.id);
  const shard = data.shards[target.id];
  if (!node) return renderFallback?.(target);
  if (!node.recipes.length && !node.cycles.length) return renderDirect?.(target);
  const produced = Math.floor(node.recipes.reduce((sum, batch) => sum + fusionYield(batch.recipe, batch.crafts, crocodileMultiplier).expectedTotal, 0) + 1e-9);
  const progress = progressByKey?.get(target.id);
  const closePicker = (restore = false) => {
    if (restore) picker?.anchor.querySelector<HTMLButtonElement>("button.equation-input-toggle")?.focus({ preventScroll: true });
    setPicker(null);
  };
  const context: Context = { target, data, busy, ironman, multiplier: crocodileMultiplier, renderItem, onReplace, onExcludeInput, picker, renderFallback, focus, path: [target.id],
    openPicker: (row, slot, anchor) => setPicker({ row, slot, anchor }), closePicker };
  return <ConnectedTarget>
    <ShardFusionCard shardKey={target.id} shard={shard} needed={target.amount} className=" shards-dependency-card"
      collapsed={collapsed} onToggle={onToggle ? () => { closePicker(); onToggle(); } : undefined}
      summary={<ShardResultSummary shardKey={target.id} shard={shard} showName={false} picture={renderItem(target.id, node.cycles.length ? target.amount : produced)}
        calculation={<ExpectedFusionOutput node={node} multiplier={crocodileMultiplier} />}>
        {progress && <dl className="shards-target-stock">
          <div><dd>{progress.loose === null ? "?" : count(progress.loose)}</dd><dt>in storage</dt></div>
          <div><dd>{progress.fused === null ? "?" : count(progress.fused)}/{count(progress.cap)}</dd><dt>consumed</dt></div>
        </dl>}
      </ShardResultSummary>}>
      {(node.stored > 0 || node.direct > 0) && <Allocation node={{ ...node, recipes: [], cycles: [] }} ironman={ironman} />}
      <DependencyBatches node={node} context={context} />
    </ShardFusionCard>
    {picker && <ReplacementPicker picker={picker} targetName={shard.name} data={{ ...data, recipes: Object.fromEntries(Object.entries(data.recipes).map(([output, recipes]) => [output, recipes.filter(recipe => !recipe.inputs.some(input => excludedInputs?.[target.id]?.includes(input)))])) }} storage={target.storage} storageContext="available"
      overrides={target.overrides} busy={busy} renderItem={renderItem} onReplace={(output, recipe) => onReplace(target.id, output, recipe)} onClose={closePicker} />}
  </ConnectedTarget>;
}

export function FusionDependencyTree({ targets, collapsedGroups, onToggleGroup, focus, ...props }: ComponentProps<typeof StationaryFusion> & { ironman: boolean; focus?: FusionFocus; progressByKey?: ReadonlyMap<string, ShardProgressEntry>; onExcludeInput?: Context["onExcludeInput"]; excludedInputs?: Record<string, string[]> }) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focus || props.busy || !root.current) return;
    const element = root.current;
    const reveal = () => {
      const target = [...element.querySelectorAll<HTMLElement>("[data-fusion-target]")].find(node => node.dataset.fusionTarget === focus.target);
      const destination = focus.path.length === 1 ? target?.querySelector<HTMLElement>(".shards-fusion-disclosure") ?? target
        : [...target?.querySelectorAll<HTMLElement>("[data-fusion-path]") ?? []].find(node => node.dataset.fusionPath === focus.path.join("/") && node.getBoundingClientRect().height > 0);
      if (!destination || !destination.getBoundingClientRect().height) return false;
      destination.focus({ preventScroll: true });
      const viewport = destination.closest<HTMLElement>(".shards-calculator-scroll");
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollTop + destination.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 12, behavior: "smooth" });
        viewport.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
      return true;
    };
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (reveal()) observer.disconnect(); }); };
    const observer = new MutationObserver(schedule);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden", "aria-expanded"] });
    schedule();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [focus, props.busy]);
  return <section ref={root} className="shards-stationary shards-dependencies" aria-label="Combined fusion calculation" aria-busy={props.busy}>
    {targets.map(target => <div className="shards-fusion-target" data-fusion-target={target.id} tabIndex={-1} key={target.id}><TargetDependencies {...props} target={target} focus={focus?.target === target.id ? focus : undefined} collapsed={collapsedGroups?.has(`${target.id}:${target.id}`)}
      onToggle={onToggleGroup ? () => onToggleGroup(`${target.id}:${target.id}`) : undefined} /></div>)}
  </section>;
}
