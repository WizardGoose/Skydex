import React from "react";
import { ChevronDown } from "lucide-react";
import type { ShardWithDirectInfo } from "../types/types";
import { getRarityColor } from "../utilities";
import { ShardTooltip } from "./ShardTooltip";
import type { ShardProgressEntry } from "./progressionModel";

export const ShardGatherPreferences: React.FC<{
  goalName: string;
  keys: readonly string[];
  selected: readonly string[];
  inventory: ReadonlyMap<string, number>;
  shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>;
  progressByKey?: ReadonlyMap<string, ShardProgressEntry>;
  onChange: (key: string, gather: boolean) => void;
}> = ({ goalName, keys, selected, inventory, shardsByKey, progressByKey, onChange }) => (
  <details className="shards-gather-preferences">
    <summary className="shards-toolbar-toggle" title={`Keep these shards in storage for ${goalName} only`}>Reserve{selected.length > 0 && <b>{selected.length}</b>}<ChevronDown aria-hidden /></summary>
    <div className="shards-gather-menu" role="group" aria-label={`Reserve shards for ${goalName}`}>
      {keys.length ? [...keys].sort((a, b) => Number(selected.includes(b)) - Number(selected.includes(a))).map((key) => {
        const shard = shardsByKey.get(key);
        return <label key={key}>
          <input type="checkbox" checked={selected.includes(key)} onChange={(event) => onChange(key, event.target.checked)} aria-label={`Reserve ${shard?.name ?? key} for ${goalName}`} />
          <ShardTooltip shard={shard} progress={progressByKey?.get(key)}><span><img src={`${import.meta.env.BASE_URL}shardIcons/${key}.png`} alt="" width={28} height={28} /></span></ShardTooltip>
          <span><strong className={getRarityColor(shard?.rarity ?? "common")}>{shard?.name ?? key}</strong><small>{inventory.has(key) ? `${inventory.get(key)!.toLocaleString()} in storage` : "Storage unknown"}</small></span>
        </label>;
      }) : <p>No storage inputs for this target.</p>}
    </div>
  </details>
);
