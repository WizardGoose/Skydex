import { useId, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, CornerDownLeft, Focus } from "lucide-react";
import type { BreakdownNode } from "./breakdown";
import { circuitLayout, connectionGraph, lensLayout, traceGraph } from "./connectionModel";

type RenderItem = (node: BreakdownNode, onSelect?: () => void, selected?: boolean) => ReactNode;
type Props = { root: BreakdownNode; availableWidth: number; renderItem: RenderItem; itemName: (id: string) => string };

function Repeat({ node }: { node: BreakdownNode }) {
  return node.repeats != null ? <small className="experiment-repeat" title={`Repeat ${node.repeats} times`}>{node.repeats}×</small>
    : node.kind === "total" ? <small className="experiment-repeat">Total</small> : null;
}

export function CircuitBreakdown({ root, availableWidth, renderItem, itemName }: Props) {
  const graph = useMemo(() => connectionGraph(root), [root]);
  const layout = useMemo(() => circuitLayout(graph, availableWidth), [graph, availableWidth]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const active = hovered ?? pinned;
  const trace = active ? traceGraph(graph, active) : null;
  const marker = useId();
  return <div className="circuit-view">
    <div className={`circuit-board${active ? " is-tracing" : ""}`} style={{ width: layout.width, height: layout.height }} aria-label="Packed fusion connections">
      <svg width={layout.width} height={layout.height} aria-hidden>
        <defs><marker id={marker} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6" /></marker></defs>
        {layout.edges.map(edge => <g key={`${edge.from}:${edge.to}`} className={!trace || trace.has(edge.from) && trace.has(edge.to) ? "is-related" : ""}>
          <path d={edge.path} markerEnd={`url(#${marker})`} />
          {active && edge.split && trace?.has(edge.from) && trace.has(edge.to) && <text x={edge.labelX} y={edge.labelY} textAnchor="middle">{edge.quantity}</text>}
        </g>)}
      </svg>
      {layout.nodes.map(node => <div key={node.id} data-connection-id={node.id}
        className={`circuit-item${!trace || trace.has(node.id) ? " is-related" : ""}${node.id === graph.rootId ? " is-target" : ""}`}
        style={{ left: node.x, top: node.y }} onMouseEnter={() => setHovered(node.id)} onMouseLeave={() => setHovered(null)}
        onFocusCapture={() => setHovered(node.id)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(null); }}>
        {renderItem(node, () => setPinned(previous => previous === node.id ? null : node.id), pinned === node.id)}
        <Repeat node={node} />
      </div>)}
    </div>
    <div className="experiment-caption"><span>{active ? itemName(graph.nodes.find(node => node.id === active)!.itemId) : "Hover to trace · click to hold"}</span>
      {pinned && <button onClick={() => { setPinned(null); setHovered(null); }}>Clear</button>}
    </div>
  </div>;
}

export function LensBreakdown({ root, availableWidth, renderItem, itemName }: Props) {
  const graph = useMemo(() => connectionGraph(root), [root]);
  const [selected, setSelected] = useState(root.id);
  const { active, positioned, width, centerY, height } = lensLayout(graph, selected, availableWidth);
  const [history, setHistory] = useState<string[]>([]);
  const select = (id: string) => {
    if (id === active.id) return;
    setHistory(previous => [...previous, active.id]);
    setSelected(id);
  };
  const back = () => { setSelected(history[history.length - 1] ?? graph.rootId); setHistory(previous => previous.slice(0, -1)); };
  const marker = useId();
  const related = new Set(positioned.map(item => item.node.id));
  return <div className="lens-view">
    <div className="lens-heading">
      <button aria-label="Previous fusion" disabled={!history.length} onClick={back}><ArrowLeft size={15} /></button>
      <strong>{itemName(active.itemId)}</strong>
      <button aria-label="Focus final target" title="Final target" disabled={active.id === graph.rootId} onClick={() => select(graph.rootId)}><Focus size={16} /></button>
    </div>
    <div className="lens-stage" style={{ width, height }} aria-label={`${itemName(active.itemId)} focused fusion`}>
      <svg width={width} height={height} aria-hidden>
        <defs><marker id={marker} viewBox="0 0 6 6" refX="5" refY="3" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0L6 3L0 6" /></marker></defs>
        {positioned.filter(item => item.kind !== "focus").map(item => {
          const from = item.kind === "input" ? { x: item.x + 26, y: item.y + 56 } : { x: width / 2, y: centerY + 78 };
          const to = item.kind === "input" ? { x: width / 2, y: centerY - 6 } : { x: item.x + 26, y: item.y - 6 };
          return <path key={`${item.kind}:${item.node.id}`} d={`M${from.x} ${from.y} C${from.x} ${(from.y + to.y) / 2} ${to.x} ${(from.y + to.y) / 2} ${to.x} ${to.y}`} markerEnd={`url(#${marker})`} />;
        })}
      </svg>
      {positioned.map(item => <div className={`lens-item lens-item--${item.kind}`} key={item.node.id} data-lens-id={item.node.id}
        style={{ left: item.x, top: item.y }}>
        {renderItem(item.node, () => select(item.node.id), item.kind === "focus")}
        {item.kind === "focus" ? <Repeat node={item.node} /> : <small className="lens-drill" aria-hidden>{item.kind === "input" ? <ChevronRight size={12} /> : <CornerDownLeft size={12} />}</small>}
      </div>)}
    </div>
    <div className="lens-overview" aria-label="All ingredients and fusions">
      {graph.nodes.map(node => <div key={node.id} className={related.has(node.id) ? "is-related" : ""}>
        {renderItem(node, () => select(node.id), node.id === active.id)}<Repeat node={node} />
      </div>)}
    </div>
    <div className="experiment-caption">Select any shard to bring its connections into focus</div>
  </div>;
}
