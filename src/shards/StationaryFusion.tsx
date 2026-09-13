import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Plus, Repeat2, RotateCcw, X } from "lucide-react";
import type { Data, Recipe, RecipeOverride } from "../types/types";
import { getRarityColor } from "../utilities";
import { ReplacementPicker, type Picker, type RenderItem } from "./compact/EquationBreakdown";
import { equationsFor, groupFusionEquations, remainingRecipeFor } from "./compact/equations";
import type { PlanTarget } from "./compact/sharedPlan";
import "./stationary-fusion.css";
import { ShardResultSummary } from "./ShardResultSummary";
import { ShardFusionCard } from "./ShardFusionCard";

export function StationaryFusion({ targets, data, busy, renderItem, onReplace, crocodileMultiplier = 1, renderFallback, renderDirect, collapsedGroups, onToggleGroup }: {
  targets: (PlanTarget & { storage: ReadonlyMap<string, number>; overrides: RecipeOverride[] })[];
  data: Data; busy: boolean; renderItem: RenderItem;
  onReplace: (target: string, output: string, recipe: Recipe | undefined) => Promise<boolean>;
  crocodileMultiplier?: number;
  renderFallback?: (target: PlanTarget) => ReactNode;
  renderDirect?: (target: PlanTarget) => ReactNode;
  collapsedGroups?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
}) {
  const [picker, setPicker] = useState<(Picker & { target: string }) | null>(null);
  const anchors = useRef(new Map<string, HTMLDivElement>());
  const selected = targets.find(target => target.id === picker?.target);
  const close = (restore = false) => {
    if (restore) picker?.anchor.querySelector("button")?.focus({ preventScroll: true });
    setPicker(null);
  };
  return <section className="shards-stationary" aria-label="Combined fusion calculation" aria-busy={busy}>
    {targets.map(target => {
      const { rows, incompleteCycle } = equationsFor(target.tree, data, crocodileMultiplier, true);
      if (!incompleteCycle && !rows.length && renderDirect) return <section key={target.id}>{renderDirect(target)}</section>;
      if (incompleteCycle || !rows.length) return <section key={target.id}>{renderFallback?.(target)}</section>;
      const groups = groupFusionEquations(rows);
      return <section className="shards-stationary-target" key={target.id} aria-label={`${data.shards[target.id].name} fusions`}>
        {[...groups].map(([output, equations]) => {
          const hasCycle = equations.some(row => row.cycle);
          const needed = Math.ceil(equations.reduce((sum, row) => sum + row.needed, 0));
          const produced = Math.ceil(equations.reduce((sum, row) => sum + row.yield * row.repeats, 0));
          const seedOutput = Math.ceil(equations.filter(row => !row.cycle).reduce((sum, row) => sum + row.yield * row.repeats, 0));
          const reusedOutput = Math.ceil(equations.filter(row => row.cycle).reduce((sum, row) => sum + row.yield * row.repeats, 0));
          const groupKey = `${target.id}:${output}`;
          return <ShardFusionCard key={output} shardKey={output} shard={data.shards[output]} needed={needed} className={equations.length > 1 ? " has-batches" : ""}
            collapsed={collapsedGroups?.has(groupKey)} onToggle={onToggleGroup ? () => {
              if (picker?.target === target.id && picker.row.output === output) close();
              onToggleGroup(groupKey);
            } : undefined}
            summary={<ShardResultSummary showName={false} shardKey={output} shard={data.shards[output]} picture={renderItem(output, produced)}>
            <dl className="shards-output-breakdown">
              {hasCycle && <div><dt>Seed output</dt><dd>{seedOutput.toLocaleString()}</dd></div>}
              <div title={hasCycle ? "Total output passing through these recipes, including shards reused by the loop. Not additional purchases." : undefined}><dt>Produced</dt><dd>{produced.toLocaleString()}</dd></div>
              <div title={hasCycle ? "Output circulated through the loop, not extra shards to acquire." : "Planned output above the amount needed."}><dt>{hasCycle ? "Reused" : "Extra"}</dt><dd>{(hasCycle ? reusedOutput : Math.max(0, produced - needed)).toLocaleString()}</dd></div>
            </dl>
          </ShardResultSummary>}>
          <div className="shards-fusion-inputs" aria-label="Fusion ingredients">
          {target.overrides.some(override => override.shardId === output) && <button className="shards-equation-reset" disabled={busy} aria-label={`Restore automatic ${data.shards[output].name} recipes`} onClick={() => { void onReplace(target.id, output, undefined); }}><RotateCcw size={12} />Automatic</button>}
          {equations.map(row => {
            const remaining = equations.some(candidate => candidate.cycle) ? undefined : remainingRecipeFor(equations, row);
            return <div className="shards-equation-batch" key={row.id}>
              <div className="shards-equation">
                {([0, 1] as const).map(slot => {
                  const id = row.recipe.inputs[slot];
                  const expanded = picker?.target === target.id && picker.row.id === row.id && picker.slot === slot;
                  const anchorKey = `${target.id}:${row.id}:${slot}`;
                  const toggle = () => {
                    const anchor = anchors.current.get(anchorKey);
                    if (!busy && anchor) setPicker(expanded ? null : { row, slot, target: target.id, anchor });
                  };
                  return <div className="shards-equation-operand" key={slot}>
                    <div className="shards-equation-input">
                      <div className="shards-equation-tile" ref={element => { if (element) anchors.current.set(anchorKey, element); else anchors.current.delete(anchorKey); }}>
                        {renderItem(id, row.inputs[slot] * row.repeats, toggle, expanded)}
                        <button type="button" onClick={toggle} disabled={busy} className="equation-input-toggle" aria-label={`Replace ${data.shards[id].name} for ${data.shards[target.id].name}`} aria-haspopup="dialog" aria-expanded={expanded}><ChevronDown size={13} aria-hidden /></button>
                      </div>
                      <strong className={getRarityColor(data.shards[id].rarity)}>{data.shards[id].name}</strong>
                    </div>
                  </div>;
                })}
                <div className="shards-equation-operation">
                  <Plus size={22} aria-hidden />
                <span className="shards-repeat-count" title={`Repeat this fusion ${row.repeats.toLocaleString()} ${row.repeats === 1 ? "time" : "times"}`} aria-label={`Repeat this fusion ${row.repeats.toLocaleString()} ${row.repeats === 1 ? "time" : "times"}`}><Repeat2 size={14} aria-hidden /><b>{row.repeats.toLocaleString()}</b></span>
                </div>
              </div>
              <div className="shards-batch-caption shards-equation-actions">
                {equations.length > 1 && <span><b>{Math.ceil(row.yield * row.repeats).toLocaleString()}</b> produced</span>}
                {row.cycle && <small title="These totals pass through the loop. Output is reused; storage and purchases are counted separately below.">Output reused</small>}
                {remaining && <button disabled={busy} aria-label={`Remove ${row.recipe.inputs.map(id => data.shards[id].name).join(" and ")} fusion for ${data.shards[target.id].name}`} title="Move this amount to the remaining recipe" onClick={() => { void onReplace(target.id, output, remaining); }}><X size={14} /></button>}
              </div>
            </div>;
          })}
          </div>
        </ShardFusionCard>; })}
      </section>;
    })}
    {picker && selected && <ReplacementPicker picker={picker} targetName={data.shards[selected.id].name} data={data} storage={selected.storage} storageContext="available" overrides={selected.overrides} busy={busy} renderItem={renderItem} onReplace={(output, recipe) => onReplace(picker.target, output, recipe)} onClose={close} />}
  </section>;
}
