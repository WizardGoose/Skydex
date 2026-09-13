import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import type { InventoryRecipeTree, ShardWithDirectInfo } from "../types/types";
import { getRarityColor } from "../utilities";
import { rarityFlatTileClass } from "../ui/kit";
import { acquisitionGuidanceFor, acquisitionMethods } from "./acquisition";
import { useHuntingEstimate } from "./huntingEstimateContext";
import { dependencyInputs, fusionDependencies, type FusionDependency } from "./fusionDependencies";
import { ShardMethodIcons } from "./ShardSourceCount";
import { ShardAcquisitionGuide } from "./ShardAcquisitionGuide";

interface Props {
  tree: InventoryRecipeTree;
  shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>;
  ironman: boolean;
  onInspect: (path: string[]) => void;
}
const count = (value: number) => Math.ceil(value).toLocaleString();

function RouteNode({ node, shardsByKey, ironman, onInspect, depth, ancestors }: Omit<Props, "tree"> & { node: FusionDependency; depth: number; ancestors: string[] }) {
  const [expanded, setExpanded] = useState(depth === 0 && (node.recipes.length > 0 || node.cycles.length > 0));
  const bodyId = useId();
  const shard = shardsByKey.get(node.shard);
  const estimate = useHuntingEstimate(node.shard);
  const children = fusionDependencies(dependencyInputs(node));
  const methods = !ironman ? ["Bazaar"] : estimate?.method && estimate.method !== "Unavailable" ? [estimate.method] : acquisitionMethods(node.shard);
  const acquired = node.direct > 0 || !children.length;
  const fused = node.recipes.reduce((sum, batch) => sum + batch.quantity, 0);
  const cycled = node.cycles.reduce((sum, cycle) => sum + cycle.quantity, 0);
  const guide = acquired ? acquisitionGuidanceFor(node.shard) : [];
  const path = [...ancestors, node.shard];
  return <div className="shards-breakdown-branch">
    <div className={`shards-breakdown-card ${rarityFlatTileClass(shard?.rarity)}`}>
      <button type="button" className="shards-breakdown-row" aria-expanded={expanded} aria-controls={guide.length ? `${bodyId} ${bodyId}-guide` : bodyId}
        aria-label={`Show ${shard?.name ?? node.shard} in fusion plan`}
        onClick={event => {
          const card = event.currentTarget.parentElement;
          setExpanded(value => !value);
          onInspect(path);
          if (!expanded && card) requestAnimationFrame(() => {
            const panel = card.closest<HTMLElement>(".shards-plan-panel");
            if (!panel) return;
            const bounds = card.getBoundingClientRect();
            const viewport = panel.getBoundingClientRect();
            if (bounds.bottom > viewport.bottom) panel.scrollBy({ top: Math.min(bounds.bottom - viewport.bottom + 8, bounds.top - viewport.top), behavior: "smooth" });
          });
        }}>
        <img src={`${import.meta.env.BASE_URL}shardIcons/${node.shard}.png`} alt="" width={34} height={34} loading="lazy" />
        <span className="shards-breakdown-copy">
          <span className="shards-breakdown-name"><strong className={getRarityColor(shard?.rarity ?? "common")}>{shard?.name ?? node.shard}</strong>{acquired && <ShardMethodIcons methods={methods} />}</span>
          <span className="shards-breakdown-sources">
            {node.stored > 0 && <span>Storage <b>{count(node.stored)}</b></span>}
            {node.direct > 0 && <span>{methods.join(" / ") || "Gather"} <b>{count(node.direct)}</b></span>}
            {fused > 0 && <span>Fusion <b>{count(fused)}</b></span>}
            {cycled > 0 && <span>Cycle <b>{count(cycled)}</b></span>}
          </span>
        </span>
        <ChevronRight size={14} className={expanded ? "is-expanded" : ""} aria-hidden />
      </button>
      {guide.length > 0 && <div id={`${bodyId}-guide`} hidden={!expanded} className="shards-breakdown-guide">
        {!ironman && <p>Buy the additional shards from the Bazaar.</p>}
        {ironman && <ShardAcquisitionGuide shardKey={node.shard} lines={guide} />}
      </div>}
    </div>
    <div id={bodyId} hidden={!expanded} className="shards-breakdown-children">
      {expanded && children.map(child => <RouteNode key={child.shard} node={child} shardsByKey={shardsByKey} ironman={ironman} onInspect={onInspect} depth={depth + 1} ancestors={path} />)}
    </div>
  </div>;
}

export function ShardRouteTree({ tree, ...props }: Props) {
  return <div className="shards-breakdown-tree">{fusionDependencies(tree).map(node => <RouteNode key={node.shard} node={node} {...props} depth={0} ancestors={[]} />)}</div>;
}
