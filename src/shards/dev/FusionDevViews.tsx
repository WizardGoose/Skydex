import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { getRarityColor } from "../../utilities";
import { FusionDependencyTree } from "../FusionDependencyTree";
import type { FusionFocus } from "../fusionDependencies";
import { CompactRoute } from "../compact/CompactRoute";
import { LensBreakdown } from "../compact/ExperimentalBreakdown";
import { breakdownFor } from "../compact/breakdown";
import type { RenderItem } from "../compact/EquationBreakdown";
import { ProfileItemTile } from "../../profile-view/profile-sections/ProfileItemTile";
import type { Data, InventoryCalculationResult, Recipe, RecipeOverride, ShardWithDirectInfo } from "../../types/types";
import type { ShardProgressEntry } from "../progressionModel";
import { shardTooltipContent } from "../shardTooltipContent";
import { acquisitionEstimateSections, useHuntingEstimate } from "../huntingEstimateContext";
import { ShardFusionSequence } from "../ShardFusionSequence";
import { DirectShardDial } from "./DirectShardDial";
import { ShardCalculationStatus } from "../ShardCalculationStatus";
import "../compact/fusion-views.css";
import "./fusion-dev.css";

interface Route {
  goal: { shardKey: string; excludedFusionInputs?: string[] };
  entry: ShardProgressEntry;
  remaining: number | null;
  result: InventoryCalculationResult | null;
  error: string | null;
  storage?: ReadonlyMap<string, number>;
}

function LiveTile({ shard, progress, quantity, onSelect, selected }: {
  shard: ShardWithDirectInfo; progress?: ShardProgressEntry; quantity?: number; onSelect?: () => void; selected?: boolean;
}) {
  const estimate = useHuntingEstimate(shard.key);
  const count = quantity === undefined ? undefined : Math.ceil(quantity);
  return <span className="shards-sequence-picture"><ProfileItemTile
    {...shardTooltipContent(shard, progress)} skyDexSections={acquisitionEstimateSections(estimate)}
    id={shard.internal_id ?? shard.key} name={`${shard.name} Shard`} iconName={shard.name}
    iconSrc={`${import.meta.env.BASE_URL}shardIcons/${shard.key}.png`} tier={shard.rarity} iconSize={52}
    count={count} countLabel={count?.toLocaleString()} ariaLabel={`${shard.name}${count === undefined ? "" : `, ${count.toLocaleString()}`}`}
    onClick={onSelect} selected={selected} /></span>;
}

function Comparison({ route, view, shardsByKey, renderItem }: {
  route: Route; view: "compact" | "lens"; shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>; renderItem: RenderItem;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const root = useMemo(() => breakdownFor(route.result!.tree, route.goal.shardKey, route.remaining!), [route]);
  useLayoutEffect(() => {
    const element = stage.current!;
    const measure = () => setWidth(element.clientWidth);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  return <section className="shards-dev-comparison" aria-label={`${route.entry.shard.name} ${view} fusion`}>
    <h3>{route.entry.shard.name}</h3>
    <div ref={stage}>{view === "compact"
      ? <CompactRoute demo={{ target: route.entry.shard, amount: route.remaining!, result: route.result! }} catalogue={shardsByKey} available={width} onSize={() => {}} renderItem={renderItem} />
      : <LensBreakdown root={root} availableWidth={width} renderItem={(node, onSelect, selected) => renderItem(node.itemId, node.quantity, onSelect, selected)} itemName={id => shardsByKey.get(id)?.name ?? id} />}
    </div>
  </section>;
}

export default function FusionDevViews({ view, routes, hiddenTargets, focus, data, crocodileMultiplier, overrides, busy, shardsByKey, progressByKey, ironman, onReplace, onExcludeInput, onGatherInstead, onSelect }: {
  view: "compact" | "circuit" | "lens"; routes: Route[]; data: Data | null; crocodileMultiplier: number;
  hiddenTargets?: ReadonlySet<string>;
  focus?: FusionFocus;
  overrides: Record<string, RecipeOverride[]>; busy: boolean;
  shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>; progressByKey: ReadonlyMap<string, ShardProgressEntry>; ironman: boolean;
  onReplace: (target: string, output: string, recipe: Recipe | undefined) => Promise<boolean>;
  onExcludeInput?: (target: string, input: string, excluded: boolean) => void;
  onGatherInstead: (target: string, key: string, gather: boolean) => void; onSelect: (target: string) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (focus) setCollapsedGroups(current => { const next = new Set(current); next.delete(`${focus.target}:${focus.target}`); return next; });
  }, [focus]);
  const toggleGroup = (key: string) => setCollapsedGroups(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const shown = routes.filter(route => !hiddenTargets?.has(route.goal.shardKey));
  const renderItem: RenderItem = (key, quantity, onClick, selected) => {
    const shard = shardsByKey.get(key);
    return shard ? <LiveTile shard={shard} progress={progressByKey.get(key)} quantity={quantity} onSelect={onClick} selected={selected} /> : null;
  };
  const fallback = (route: Route) => <ShardFusionSequence tree={route.result?.tree ?? null} target={route.entry.shard}
    remaining={route.remaining} selected={false} shardsByKey={shardsByKey} progressByKey={progressByKey} ironman={ironman}
    onSelect={() => onSelect(route.goal.shardKey)} onGatherInstead={key => onGatherInstead(route.goal.shardKey, key, true)} />;
  const ready = shown.filter(route => route.result && route.remaining !== null && route.remaining > 0);
  const waiting = busy || shown.some(route => !route.result && !route.error && route.remaining !== null && route.remaining > 0);
  return <div className="shards-dev-fusion">
    {waiting && <ShardCalculationStatus updating={ready.length > 0} />}
    <div className={`shards-calculation-results${waiting ? " is-updating" : ""}`} aria-busy={waiting} inert={waiting || undefined}>
      {shown.filter(route => route.goal.excludedFusionInputs?.length).map(route => <div className="shards-excluded-inputs" key={route.goal.shardKey} aria-label={`${route.entry.shard.name} excluded ingredients`}>
        <span>Excluded from {route.entry.shard.name}</span>
        {route.goal.excludedFusionInputs!.map(key => <button type="button" key={key} disabled={waiting} aria-label={`Allow ${shardsByKey.get(key)?.name ?? key} for ${route.entry.shard.name}`}
          onClick={() => onExcludeInput?.(route.goal.shardKey, key, false)}>{shardsByKey.get(key)?.name ?? key} ×</button>)}
      </div>)}
      {shown.filter(route => !ready.includes(route) && (route.remaining === null || route.remaining === 0 || route.error)).map(route => <section className="shards-dev-state" key={route.goal.shardKey}>
        <strong className={getRarityColor(route.entry.shard.rarity)}>{route.entry.shard.name}</strong>
        {route.remaining === 0 ? <span><Check size={14} />Target complete</span> : route.error ? <p role="alert">{route.error}</p> : fallback(route)}
      </section>)}
      {view === "circuit" && data ? <FusionDependencyTree ironman={ironman} focus={focus} progressByKey={progressByKey} onExcludeInput={onExcludeInput} excludedInputs={Object.fromEntries(routes.map(route => [route.goal.shardKey, route.goal.excludedFusionInputs ?? []]))} targets={ready.map(route => ({ id: route.goal.shardKey, amount: route.remaining!, tree: route.result!.tree,
        storage: route.storage ?? new Map(), overrides: overrides[route.goal.shardKey] ?? [] }))} data={data} crocodileMultiplier={crocodileMultiplier}
        busy={waiting} renderItem={renderItem} onReplace={onReplace} collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup}
        renderDirect={target => <DirectShardDial className=" shards-dependency-card" shard={shardsByKey.get(target.id)!} quantity={target.amount} tree={target.tree} ironman={ironman} renderItem={renderItem} unitPrice={data.shards[target.id]?.rate}
          collapsed={collapsedGroups.has(`${target.id}:${target.id}`)} onToggle={() => toggleGroup(`${target.id}:${target.id}`)} />}
        renderFallback={target => fallback(ready.find(route => route.goal.shardKey === target.id)!)} />
        : view !== "circuit" && <div className="shards-dev-comparisons">{ready.map(route => <Comparison key={route.goal.shardKey} route={route} view={view} shardsByKey={shardsByKey} renderItem={renderItem} />)}</div>}
      {!waiting && !routes.length && <div className="shards-route-empty"><strong>Choose a shard target</strong></div>}
      {!waiting && !!routes.length && !shown.length && <p className="shards-dev-state" role="status">All target diagrams are hidden.</p>}
    </div>
  </div>;
}
