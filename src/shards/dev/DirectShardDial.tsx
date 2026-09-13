import type { RenderItem } from "../compact/EquationBreakdown";
import type { InventoryRecipeTree, ShardWithDirectInfo } from "../../types/types";
import { useHuntingEstimate } from "../huntingEstimateContext";
import { ShardResultSummary } from "../ShardResultSummary";
import { ShardFusionCard } from "../ShardFusionCard";
import { acquisitionGuidanceFor, acquisitionMethods } from "../acquisition";
import { ShardGameText } from "../ShardGameTextView";
import { shardAcquisitionGameText } from "../shardGameTextModel";
import { ShardAcquisitionSuffix } from "../ShardSourceCount";
import { UtilityMetric } from "../../profile-view/UtilityMetric";
import { formatTime } from "../../utilities";

export function DirectShardDial({ shard, quantity, tree, ironman, renderItem, unitPrice, collapsed, onToggle, className }: {
  shard: ShardWithDirectInfo;
  quantity: number;
  tree: InventoryRecipeTree | null;
  ironman: boolean;
  renderItem: RenderItem;
  unitPrice?: number;
  collapsed?: boolean;
  onToggle?: () => void;
  className?: string;
}) {
  const estimate = useHuntingEstimate(shard.key);
  let stored = 0, direct = 0;
  const visit = (node: InventoryRecipeTree) => {
    if (Array.isArray(node)) node.forEach(visit);
    else if (node.shard === shard.key) {
      if (node.method === "inventory") stored += node.quantity;
      if (node.method === "direct") direct += node.quantity;
    }
  };
  if (tree) visit(tree);
  const rate = estimate?.rate != null && Number.isFinite(estimate.rate) && estimate.rate > 0 ? estimate.rate : null;
  const methods = ironman ? acquisitionMethods(shard.key) : ["Bazaar"];
  const estimatedMethod = estimate?.method && estimate.method !== "Unavailable" ? estimate.method : "Gathering";
  const guidance = acquisitionGuidanceFor(shard.key).filter(line => !line.startsWith("Fusing "));
  return <ShardFusionCard shardKey={shard.key} shard={shard} needed={quantity} direct collapsed={collapsed} onToggle={onToggle} className={className}
    label={`${shard.name} ${ironman ? "acquisition" : direct > 0 ? "purchase" : "from storage"}`}
    summary={<ShardResultSummary showName={false} shardKey={shard.key} shard={shard} picture={renderItem(shard.key, quantity)} />}>
    <dl className="shards-direct-breakdown">
      <UtilityMetric label={ironman ? "Gather" : "Buy"} value={Math.ceil(direct).toLocaleString()} tone="materials" />
      <UtilityMetric label="From storage" value={Math.ceil(stored).toLocaleString()} tone="storage" />
      {direct > 0 && <UtilityMetric label={ironman ? `${estimatedMethod} rate` : "Bazaar total"} tone="materials" activation="click" info={{
        summary: ironman ? `Estimated yield using ${estimatedMethod}.` : "Total purchase price for the additional shards in this target.",
        notes: ironman ? estimate?.assumptions : undefined,
        note: ironman ? undefined : "Uses the selected Bazaar price; held shards are excluded.",
      }} value={ironman ? rate ? `~${Math.round(rate).toLocaleString()} / hour` : "Rate unavailable" : unitPrice && unitPrice > 0 ? `${Math.ceil(direct * unitPrice).toLocaleString()} coins` : "Price unavailable"} />}
      {direct > 0 && ironman && <UtilityMetric label="Est. time" tone="time" activation="click" info={{
        summary: "An average for planning, not a guaranteed catch time.",
        rows: [{ label: "To gather", value: Math.ceil(direct).toLocaleString() }, { label: "Hourly yield", value: rate ? `~${Math.round(rate).toLocaleString()}` : "Unavailable" }],
        note: "Time = shards to gather ÷ hourly yield.",
      }} value={rate ? `~${formatTime(direct / rate)}` : "Unavailable"} />}
    </dl>
    {direct > 0 && <div className="shards-direct-guidance">
      <strong className="shards-direct-method">{methods.join(" / ") || "Gathering"}<ShardAcquisitionSuffix name={shard.name} methods={methods} /></strong>
      {ironman && (guidance.length ? guidance.map(line => <p key={line}><ShardGameText text={shardAcquisitionGameText(shard.key, line) ?? line} /></p>) : <p>Location not yet mapped.</p>)}
    </div>}
  </ShardFusionCard>;
}
