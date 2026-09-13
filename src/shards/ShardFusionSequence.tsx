import React from "react";
import { rarityKey } from "../search/rarity";
import type { InventoryRecipeTree, ShardWithDirectInfo } from "../types/types";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { getRarityColor } from "../utilities";
import { buildFusionBranches, layoutFusionBranches } from "./fusionBranches";
import type { FusionBranchItem } from "./fusionBranches";
import type { ShardProgressEntry } from "./progressionModel";
import { shardTooltipContent } from "./shardTooltipContent";
import { acquisitionMethods } from "./acquisition";
import { HuntingEstimateContext, acquisitionEstimateSections, useHuntingEstimate } from "./huntingEstimateContext";

const rarityStyle = (shard: ShardWithDirectInfo | undefined): React.CSSProperties | undefined => {
  const rarity = rarityKey(shard?.rarity ?? "");
  return rarity ? ({ "--shard-rarity": `var(--color-rarity-${rarity})` } as React.CSSProperties) : undefined;
};

const ShardPicture: React.FC<{
  shardKey: string;
  quantity?: number;
  shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>;
  progressByKey?: ReadonlyMap<string, ShardProgressEntry>;
  selected?: boolean;
  onSelect?: () => void;
  sources?: FusionBranchItem["sources"];
  ironman?: boolean;
}> = ({ shardKey, quantity, shardsByKey, progressByKey, selected, onSelect, sources, ironman }) => {
  const shard = shardsByKey.get(shardKey);
  const estimate = useHuntingEstimate(shardKey);
  const count = quantity === undefined ? undefined : Math.ceil(quantity);
  return (
    <span className="shards-sequence-picture" style={rarityStyle(shard)}>
      <ProfileItemTile
        {...(shard ? shardTooltipContent(shard, progressByKey?.get(shardKey)) : {})}
        skyDexSections={[
          ...(sources?.map((source) => ({ title: source.method === "inventory" ? "From storage" : ironman ? estimate?.method ?? "Gather" : "Buy", lines: [`${Math.ceil(source.quantity).toLocaleString()} for this step`] })) ?? []),
          ...acquisitionEstimateSections(estimate),
        ]}
        id={shard?.internal_id ?? shardKey}
        name={`${shard?.name ?? shardKey} Shard`}
        iconName={shard?.name ?? shardKey}
        iconSrc={`${import.meta.env.BASE_URL}shardIcons/${shardKey}.png`}
        tier={shard?.rarity ?? null}
        count={count}
        countLabel={count?.toLocaleString()}
        iconSize={52}
        ariaLabel={onSelect ? `Select ${shard?.name ?? shardKey} target` : `${shard?.name ?? shardKey}${count === undefined ? "" : `, ${count.toLocaleString()}`}`}
        selected={selected}
        onClick={onSelect}
      />
    </span>
  );
};

interface ShardFusionSequenceProps {
  tree: InventoryRecipeTree | null;
  target: ShardWithDirectInfo;
  remaining: number | null;
  selected: boolean;
  shardsByKey: ReadonlyMap<string, ShardWithDirectInfo>;
  progressByKey?: ReadonlyMap<string, ShardProgressEntry>;
  onSelect: () => void;
  ironman?: boolean;
  onGatherInstead?: (key: string) => void;
}

export const ShardFusionSequence: React.FC<ShardFusionSequenceProps> = ({
  tree, target, remaining, selected, shardsByKey, progressByKey, onSelect, ironman = true, onGatherInstead,
}) => {
  const root = React.useMemo(() => buildFusionBranches(tree), [tree]);
  const estimates = React.useContext(HuntingEstimateContext);
  const container = React.useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = React.useState(600);
  const arrowId = React.useId().replace(/:/g, "");
  React.useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setAvailableWidth(element.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const layout = React.useMemo(() => layoutFusionBranches(root, availableWidth), [root, availableWidth]);

  return (
    <article className={`shards-fusion-lane${selected ? " is-selected" : ""}`} aria-label={`${target.name} fusion breakdown`}>
      <div className="shards-fusion-sequence" ref={container}>
        <div className="shards-branch-map" style={{ width: layout.width, height: layout.height }}>
          <svg className="shards-branch-connectors" width={layout.width} height={layout.height} aria-hidden="true">
            <defs><marker id={arrowId} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 6 3 L 0 6" /></marker></defs>
            {layout.edges.map((edge) => <path key={`${edge.from}:${edge.to}`} d={edge.path} markerEnd={`url(#${arrowId})`} data-from={edge.from} data-to={edge.to} />)}
          </svg>
          {layout.nodes.map(({ branch, x, y, width, height }) => {
            const isGoal = branch.kind === "goal";
            const shardKey = isGoal ? target.key : branch.shardKey;
            const shard = shardKey ? shardsByKey.get(shardKey) : undefined;
            const name = shard?.name ?? shardKey;
            return (
              <section
                key={branch.id}
                className={`shards-branch-node shards-branch-node--${branch.kind}`}
                style={{ left: x, top: y, width, height }}
                data-branch-id={branch.id}
                aria-label={isGoal ? `${target.name} target` : branch.kind === "inputs" ? "Input shards" : `${name}, ${branch.kind === "cycle" ? "cycle" : `combine step ${branch.step}`}, repeat ${branch.repeats} ${branch.repeats === 1 ? "time" : "times"}`}
              >
                <header>
                  <small>{isGoal ? "Target" : branch.kind === "inputs" ? "Inputs" : branch.kind === "cycle" ? "Cycle" : `Combine ${branch.step}`}</small>
                  {branch.repeats !== undefined && <b>Repeat {branch.repeats.toLocaleString()}×</b>}
                  {isGoal && remaining !== null && <b>{remaining.toLocaleString()} to fuse</b>}
                </header>
                {branch.kind === "inputs" ? (
                  <div className="shards-branch-ingredients">
                    {branch.items.map((item) => (
                      <div key={item.shardKey}>
                        <ShardPicture shardKey={item.shardKey} quantity={item.quantity} shardsByKey={shardsByKey} progressByKey={progressByKey} sources={item.sources} ironman={ironman} />
                        {item.sources.map((source) => {
                          const amount = item.sources.length > 1 ? `${Math.ceil(source.quantity).toLocaleString()} ` : "";
                          return source.method === "inventory" && onGatherInstead ? (
                            <button key={source.method} type="button" className="shards-input-source" title={`Reserve ${shardsByKey.get(item.shardKey)?.name ?? item.shardKey} for ${target.name}`} aria-label={`Reserve ${shardsByKey.get(item.shardKey)?.name ?? item.shardKey} for ${target.name}`} onClick={() => onGatherInstead(item.shardKey)}>{amount}Storage</button>
                          ) : <small key={source.method} className="shards-input-source" title={source.method === "inventory" ? "From storage" : ironman ? acquisitionMethods(item.shardKey).join(" / ") : "Buy from Bazaar"}>{amount}{source.method === "inventory" ? "Storage" : !ironman ? "Buy" : estimates[item.shardKey]?.method ?? acquisitionMethods(item.shardKey)[0] ?? "Gather"}</small>;
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <ShardPicture shardKey={shardKey!} quantity={isGoal ? remaining ?? undefined : branch.quantity} shardsByKey={shardsByKey} progressByKey={progressByKey} selected={isGoal ? selected : undefined} onSelect={isGoal ? onSelect : undefined} />
                    <strong className={`shards-branch-name ${getRarityColor(shard?.rarity ?? "common")}`}>{name}</strong>
                    {isGoal && <span className="shards-branch-status">{remaining === null ? "Progress needed" : remaining === 0 ? "Complete" : `${remaining.toLocaleString()} remaining`}</span>}
                  </>
                )}
              </section>
            );
          })}
        </div>
        {!tree && <span className="shards-sequence-complete">{remaining === 0 ? "Already complete" : remaining === null ? "Set progress" : "Fusion unavailable"}</span>}
      </div>
    </article>
  );
};
