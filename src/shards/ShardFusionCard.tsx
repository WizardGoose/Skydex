import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { getRarityColor } from "../utilities";
import type { Shard } from "../types/types";
import { ShardCategory } from "./ShardResultSummary";

/** Profile's titlebar disclosure for the complete shard card. */
export function ShardFusionCard({ shardKey, shard, needed, summary, children, collapsed, onToggle, label, className = "", direct = false }: {
  shardKey: string; shard: Shard; needed: number; summary: ReactNode; children: ReactNode;
  collapsed?: boolean; onToggle?: () => void; label?: string; className?: string; direct?: boolean;
}) {
  const [localCollapsed, setLocalCollapsed] = useState(false);
  const closed = collapsed ?? localCollapsed;
  const bodyId = useId();
  return <section className={`shards-equation-group${className}${closed ? " is-collapsed" : ""}`} aria-label={label ?? `${shard.name} fusion`}>
    <button type="button" className="profile-wardrobe-page-titlebar profile-wardrobe-page-disclosure shards-fusion-disclosure"
      aria-label={`${closed ? "Expand" : "Collapse"} ${shard.name} ${direct ? "acquisition" : "fusion steps"}`}
      aria-expanded={!closed} aria-controls={bodyId} onClick={onToggle ?? (() => setLocalCollapsed(value => !value))}>
      <span className={getRarityColor(shard.rarity)}><img src={`${import.meta.env.BASE_URL}shardIcons/${shardKey}.png`} alt="" width={24} height={24} />{shard.name}<ShardCategory type={shard.type} iconOnly /><span className="shards-fusion-needed">({Math.ceil(needed).toLocaleString()} needed)</span></span>
      <ChevronDown className="profile-disclosure-chevron" aria-hidden />
    </button>
    <div id={bodyId} className={direct ? "shards-stationary-direct" : "shards-fusion-content"} hidden={closed}>
      {summary}
      <div className="shards-fusion-steps">{children}</div>
    </div>
  </section>;
}
