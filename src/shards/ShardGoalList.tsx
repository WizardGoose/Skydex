import React from "react";
import { Eye, EyeOff, Minus, Plus, X } from "lucide-react";
import { remainingForGoal, type ShardProgressEntry } from "./progressionModel";
import { FOCUS } from "../ui/kit";
import { getRarityColor } from "../utilities";
import { ShardTooltip } from "./ShardTooltip";

interface GoalRow {
  goal: { shardKey: string; amount: number; mode: "amount" | "max" };
  entry: ShardProgressEntry;
}

export const ShardGoalList: React.FC<{
  routes: readonly GoalRow[];
  activeKey?: string;
  hiddenTargets?: ReadonlySet<string>;
  onToggleVisibility?: (key: string) => void;
  onSelect: (key: string) => void;
  onAmount: (key: string, amount: number) => void;
  onMax: (key: string) => void;
  onRemove: (key: string) => void;
}> = ({ routes, activeKey, hiddenTargets, onToggleVisibility, onSelect, onAmount, onMax, onRemove }) => (
  <div className="shards-target-list" role="list" aria-label="Targets in this plan">
    {routes.map(({ goal, entry }) => {
      const remaining = remainingForGoal(goal.amount, entry.fused);
      const maximum = remainingForGoal(entry.cap, entry.fused);
      return (
      <div role="listitem" key={goal.shardKey} className={`shards-target-row${goal.shardKey === activeKey ? " is-selected" : ""}`}>
        <div className="shards-target-name-group">
        <ShardTooltip shard={entry.shard} progress={entry} interactive>
        <button
          type="button"
          className={`shards-target-identity ${FOCUS}`}
          onClick={() => onSelect(goal.shardKey)}
          aria-label={`Select ${entry.shard.name} target`}
          aria-pressed={goal.shardKey === activeKey}
        >
          <img src={`${import.meta.env.BASE_URL}shardIcons/${entry.shard.key}.png`} alt="" width={34} height={34} />
          <span><strong className={getRarityColor(entry.shard.rarity)}>{entry.shard.name}</strong><small>{entry.fused === null ? "Progress unknown" : entry.fused >= goal.amount ? "Complete" : `${(goal.amount - entry.fused).toLocaleString()} remaining`}</small></span>
        </button>
        </ShardTooltip>
        </div>
        <div className="shards-target-controls">
          {onToggleVisibility && <button type="button" className={`shards-target-visibility ${FOCUS}`} aria-label={`${hiddenTargets?.has(goal.shardKey) ? "Show" : "Hide"} ${entry.shard.name} fusion`} aria-pressed={!hiddenTargets?.has(goal.shardKey)} onClick={() => onToggleVisibility(goal.shardKey)}>{hiddenTargets?.has(goal.shardKey) ? <EyeOff size={14} /> : <Eye size={14} />}</button>}
          <button type="button" className={`shards-max-quantity ${FOCUS}`} aria-label={`Max ${entry.shard.name} attribute`} aria-pressed={goal.mode === "max"} onClick={() => onMax(goal.shardKey)}>Max</button>
          <div className="shards-quantity" role="group" aria-label={`Adjust ${entry.shard.name} to fuse`}>
            <button type="button" disabled={remaining === null} onClick={() => remaining! <= 1 ? onRemove(goal.shardKey) : onAmount(goal.shardKey, remaining! - 1)} aria-label={remaining !== null && remaining <= 1 ? `Remove ${entry.shard.name}` : `Decrease ${entry.shard.name} to fuse`}><Minus aria-hidden /></button>
            <input type="number" min={remaining === 0 ? 0 : 1} max={maximum ?? undefined} step={1} inputMode="numeric" value={remaining ?? ""} placeholder="?" disabled={remaining === null || maximum === 0} onChange={(event) => onAmount(goal.shardKey, Number(event.target.value) || 1)} onWheel={(event) => event.currentTarget.blur()} aria-label={`${entry.shard.name} to fuse`} />
            <button type="button" onClick={() => onAmount(goal.shardKey, remaining! + 1)} disabled={remaining === null || maximum === null || remaining >= maximum} aria-label={`Increase ${entry.shard.name} to fuse`}><Plus aria-hidden /></button>
          </div>
        <button type="button" className={`shards-target-remove ${FOCUS}`} onClick={() => onRemove(goal.shardKey)} aria-label={`Remove ${entry.shard.name} from targets`}><X aria-hidden /></button>
        </div>
      </div>
    ); })}
  </div>
);
