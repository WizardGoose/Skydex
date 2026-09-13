import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { InventoryRecipeTree, ShardWithDirectInfo } from "../../types/types";
import { buildFusionBranches } from "../fusionBranches";
import { HuntingEstimateContext } from "../huntingEstimateContext";
import { compactLayout } from "./layout";
import type { RenderItem } from "./EquationBreakdown";

export function CompactRoute({ demo, catalogue, available, onSize, renderItem }: { demo: { target: ShardWithDirectInfo; amount: number; result: { tree: InventoryRecipeTree | null } }; catalogue: ReadonlyMap<string, ShardWithDirectInfo>; available: number; onSize: (size: number) => void; renderItem: RenderItem }) {
  const root = useMemo(() => buildFusionBranches(demo.result.tree), [demo]);
  const estimates = React.useContext(HuntingEstimateContext);
  const map = useRef<HTMLDivElement>(null);
  const markerId = React.useId();
  const [heights, setHeights] = useState<Record<string, number>>({});
  const layout = useMemo(() => compactLayout(root, available, heights), [root, available, heights]);
  useLayoutEffect(() => {
    const contents = [...(map.current?.querySelectorAll<HTMLElement>(".compact-node-content") ?? [])];
    const measure = () => {
      const next = Object.fromEntries(contents.map(element => [element.parentElement!.dataset.node!, Math.ceil(element.getBoundingClientRect().height)]));
      setHeights(previous => Object.keys(next).length === Object.keys(previous).length && Object.entries(next).every(([key, height]) => previous[key] === height) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    contents.forEach(element => observer.observe(element));
    measure();
    return () => observer.disconnect();
  }, [demo]);
  useEffect(() => onSize(layout.height), [layout.height, onSize]);
  return <div ref={map} className="compact-map" style={{ width: layout.width, height: layout.height }} aria-label={`${demo.target.name} compact fusion breakdown`}>
    <svg className="shards-branch-connectors" width={layout.width} height={layout.height} aria-hidden="true">
      <defs><marker id={markerId} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L6 3L0 6" /></marker></defs>
      {layout.edges.map(edge => <path key={`${edge.from}:${edge.to}`} d={edge.path} markerEnd={`url(#${markerId})`} data-from={edge.from} data-to={edge.to} />)}
    </svg>
    {layout.nodes.map(node => {
      const total = node.branch.kind === "goal";
      const key = total ? demo.target.key : node.branch.shardKey!;
      const shard = catalogue.get(key)!;
      return <section className={`compact-operation${total ? " compact-total" : ""}`} key={node.branch.id}
        data-node={node.branch.id} style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
        aria-label={node.input ? `${shard.name} input` : total ? `${demo.target.name} total` : `${shard.name}, combine ${node.branch.step}, repeat ${node.branch.repeats}`}>
        <div className="compact-node-content">{renderItem(key, total ? demo.amount : node.branch.quantity)}
        <div className="compact-output">
        <strong style={{ color: `var(--color-rarity-${shard.rarity.toLowerCase()})` }}>{shard.name}</strong>
        {node.input ? <div className="compact-sources">{node.input.sources.map((source, index) => <small key={index}>
          {node.input!.sources.length > 1 ? `${source.quantity} ` : ""}{source.method === "inventory" ? "Storage" : estimates[key]?.method ?? "Gather"}
        </small>)}</div> : <>
          {!total && <small title={`Combine ${node.branch.step}`}>{node.branch.kind === "cycle" ? "Cycle" : "Repeat"} {node.branch.repeats}×</small>}
          {node.goal && <small>{demo.amount} to fuse</small>}
        </>}
        </div></div>
      </section>;
    })}
  </div>;
}
