import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Menu, Search, Share2, X } from "lucide-react";
import { useFusionData } from "../hooks";
import { buildFusionGraphInWorker } from "../services/fusionGraphWorkerService";
import { ShardGraphNode } from "../components/graph";
import { BTN_QUIET, INPUT, LABEL, PANEL, PageHeader, SplitPage, Figure, stated } from "../ui/kit";
import {
  EDGE_COLORS,
  NODE_HEIGHT,
  NODE_WIDTH,
  getConnectedLine,
  type EdgeFilter,
  type FusionEdge,
  type FusionGraph,
  type ShardNode,
} from "../utilities/fusionGraphLayout";

const nodeTypes = { shard: ShardGraphNode };

const FusionGraphInner: React.FC = () => {
  const { fusionData, rates, loading } = useFusionData();
  const { fitView, setCenter } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<ShardNode>([]);
  const [graph, setGraph] = useState<FusionGraph | null>(null);
  const [baseEdges, setBaseEdges] = useState<FusionEdge[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edgeFilter, setEdgeFilter] = useState<EdgeFilter>("both");
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didFit = useRef(false);

  /*
   * The sharp channel. `--sd-split` is 0 by default, so a page that does not
   * open it is one unbroken sheet of frosted glass and the backdrop photograph
   * is never actually seen. This page opens it because its layout already puts
   * a full-height rail in exactly that column, so the split falls on a seam the
   * design already has rather than cutting across content.
   *
   * Opening it obliges the rail to be drawn on `.sd-glass` rather than on a
   * tint-only panel: over the sharp photograph a tint alone is not enough
   * material to set small text on. Removed on the way out so no other route
   * inherits the split.
   */
  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);

  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasHeight, setCanvasHeight] = useState("calc(100vh - 3.5rem)");
  useEffect(() => {
    const update = () => {
      if (!containerRef.current) return;
      const top = containerRef.current.getBoundingClientRect().top;
      // The split page's content column keeps 2.5rem of bottom padding under
      // the canvas; account for it so the canvas bottoms out at the viewport
      // edge instead of forcing a page scrollbar.
      setCanvasHeight(`${Math.max(360, window.innerHeight - top - 40)}px`);
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
    };
    // Below the split's breakpoint the rail stacks above the canvas, so
    // toggling the controls drawer moves the canvas top and it must remeasure.
  }, [loading, controlsOpen]);

  useEffect(() => {
    if (!fusionData || !rates) return;
    let active = true;
    const task = buildFusionGraphInWorker(fusionData, rates);
    task.promise
      .then(({ graph: builtGraph, nodes: builtNodes, edges }) => {
        if (!active) return;
        setGraph(builtGraph);
        setBaseEdges(edges);
        setNodes(builtNodes);
        didFit.current = false;
      })
      .catch((error) => {
        if (active) console.error("Failed to build the fusion graph", error);
      });
    return () => {
      active = false;
      task.cancel();
    };
  }, [fusionData, rates, setNodes]);

  const connectedLine = useMemo(() => {
    if (!selectedId || !graph) return null;
    return getConnectedLine(selectedId, graph, edgeFilter);
  }, [selectedId, graph, edgeFilter]);

  const isTypeVisible = useCallback(
    (node: ShardNode) => edgeFilter === "both" || (edgeFilter === "special" ? node.data.inSpecial : node.data.inId),
    [edgeFilter]
  );

  const nodesInitialized = useNodesInitialized();
  useEffect(() => {
    if (didFit.current || !nodesInitialized || nodes.length === 0) return;
    didFit.current = true;
    fitView({ padding: 0.15, duration: 0 });
  }, [nodesInitialized, nodes.length, fitView]);

  const displayNodes = useMemo(
    () =>
      nodes
        .filter(isTypeVisible)
        .map((node) =>
          (connectedLine ? !connectedLine.has(node.id) : false) === node.data.dimmed
            ? node
            : { ...node, data: { ...node.data, dimmed: connectedLine ? !connectedLine.has(node.id) : false } }
        ),
    [nodes, connectedLine, isTypeVisible]
  );

  const displayEdges = useMemo(
    () =>
      baseEdges
        .filter((edge) => edgeFilter === "both" || edge.data?.edgeType === edgeFilter)
        .map((edge) => {
          const color = EDGE_COLORS[edge.data!.edgeType];
          const inLine = connectedLine ? connectedLine.has(edge.source) && connectedLine.has(edge.target) : true;
          return {
            ...edge,
            style: { stroke: color, strokeWidth: inLine ? 2 : 1, opacity: connectedLine ? (inLine ? 0.95 : 0.05) : 0.55 },
            markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14, markerUnits: "userSpaceOnUse" },
          };
        }),
    [baseEdges, edgeFilter, connectedLine]
  );

  /**
   * What the graph actually holds, counted off the built elements.
   *
   * Every figure is a count of something already on the canvas, so none of them
   * can be a guess. The two edge families are split because the page's whole
   * subject is the difference between them, and the legend says so in words
   * immediately underneath.
   */
  const tally = useMemo(() => {
    let special = 0;
    let id = 0;
    for (const e of baseEdges) {
      if (e.data?.edgeType === "special") special++;
      else if (e.data?.edgeType === "id") id++;
    }
    return { special, id };
  }, [baseEdges]);

  /** True once the graph has been built, so the counts may be stated. */
  const built = nodes.length > 0;

  /** The shard whose line is highlighted, by name rather than by id. */
  const selectedName = useMemo(
    () => (selectedId ? nodes.find((n) => n.id === selectedId)?.data.name ?? selectedId : null),
    [selectedId, nodes]
  );

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes
      .filter((n) => n.data.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q))
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .slice(0, 8);
  }, [query, nodes]);

  const focusShard = useCallback(
    (node: ShardNode) => {
      setSelectedId(node.id);
      setCenter(node.position.x + NODE_WIDTH / 2, node.position.y + NODE_HEIGHT / 2, { zoom: 1.2, duration: 600 });
      setQuery("");
      setShowResults(false);
    },
    [setCenter]
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => setSelectedId((prev) => (prev === node.id ? null : node.id)), []);
  const onPaneClick = useCallback(() => setSelectedId(null), []);

  return (
    <SplitPage
      railLabel="Graph controls"
      rail={
        <>
          {/* Narrow viewports collapse the controls behind one button so the
              canvas keeps the screen. */}
          <div className="min-[900px]:hidden">
            <button onClick={() => setControlsOpen(!controlsOpen)} className={`${BTN_QUIET} w-full justify-center`}>
              {controlsOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              <span>{controlsOpen ? "Hide" : "Show"} Graph Controls</span>
            </button>
          </div>

          {/* `.sd-glass` rather than the kit's tint-only panel: this column sits
              in the sharp channel opened above, so its ground is the photograph
              itself rather than the curtain's already-blurred output. Radius and
              geometry stay the panel's. */}
          <section className={`${controlsOpen ? "block" : "hidden min-[900px]:block"} ws-panel sd-glass space-y-3 rounded-md p-2.5`}>
            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowResults(true);
                }}
                onFocus={() => setShowResults(true)}
                onBlur={() => {
                  blurTimer.current = setTimeout(() => setShowResults(false), 150);
                }}
                placeholder="Search shards"
                className={`${INPUT} w-full pl-8 pr-8`}
                autoComplete="off"
                spellCheck={false}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer text-slate-400 hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              {showResults && searchResults.length > 0 && (
                <div
                  className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-white/12 bg-slate-900/95 shadow-xl"
                  onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
                >
                  {searchResults.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => focusShard(node)}
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left hover:bg-purple-500/20"
                    >
                      <img
                        src={`${import.meta.env.BASE_URL}shardIcons/${node.id}.png`}
                        alt=""
                        className="h-4 w-4 object-contain"
                      />
                      <span className="truncate text-sm text-slate-200">{node.data.name}</span>
                      <span className="ml-auto text-[10px] text-slate-500">{node.id}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Edge-type toggle */}
            <div className="space-y-1.5">
              <div className={LABEL}>Fusion type</div>
              <div className="flex gap-1 rounded-md border border-white/12 bg-white/5 p-1">
                {(["both", "special", "id"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => setEdgeFilter(opt)}
                    className={`flex-1 cursor-pointer rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors ${
                      edgeFilter === opt ? "bg-purple-500/30 text-purple-200" : "text-slate-400 hover:bg-white/8 hover:text-slate-200"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="space-y-1.5">
              <div className={LABEL}>Legend</div>
              <div className="flex flex-col gap-1 rounded-md border border-white/8 bg-white/5 px-3 py-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-5 rounded" style={{ backgroundColor: EDGE_COLORS.special }} />
                  <span>Special, family upgrades</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-0.5 w-5 rounded" style={{ backgroundColor: EDGE_COLORS.id }} />
                  <span>ID, cross-family ladders</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5 text-center text-amber-300">*</span>
                  <span>Shared by multiple lines</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">Click a shard to highlight its fusion line. Drag to rearrange.</div>
              </div>
            </div>
          </section>
        </>
      }
    >
      <PageHeader
        title="Fusion Lines"
        sub="Special and ID fusion lines. Click a shard to highlight the line it belongs to."
        icon={Share2}
        actions={
          selectedName ? (
            <span className="text-[11px] text-slate-400">
              line through <span className="font-medium text-purple-200">{selectedName}</span>
            </span>
          ) : undefined
        }
      />

      {/*
        What the graph holds, as a strip of figures.

        Every figure is a dash until the graph has been built. A zero here would
        read as "there are none of these", which is a different and false claim
        while the fusion data is still loading.
      */}
      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2`}>
        <Figure label="Shards" value={stated(built, nodes.length)} title="Every shard the graph placed" />
        <Figure label="Fusions" value={stated(built, baseEdges.length)} title="Every fusion edge between them" />
        <Figure label="Special" value={stated(built, tally.special)} title="Family upgrades, which produce two shards" />
        <Figure label="ID" value={stated(built, tally.id)} title="Cross-family ladders, which produce one shard" />
        <Figure label="Shown" value={stated(built, displayNodes.length)} title="Shards the fusion-type filter currently draws" />
        <Figure label="Drawn" value={stated(built, displayEdges.length)} title="Edges the fusion-type filter currently draws" />
        <Figure
          label="In line"
          value={connectedLine ? connectedLine.size.toLocaleString() : "-"}
          title={connectedLine ? "Shards on the highlighted line" : "No shard selected, so no line is highlighted"}
        />
      </div>

      {loading || !fusionData ? (
        <div className="flex h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500/20 border-t-purple-500" />
        </div>
      ) : (
        <div ref={containerRef} className={`${PANEL} relative w-full overflow-hidden`} style={{ height: canvasHeight }}>
          <ReactFlow
            nodes={displayNodes}
            edges={displayEdges}
            onNodesChange={onNodesChange}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodesConnectable={false}
            minZoom={0.1}
            colorMode="dark"
            proOptions={{ hideAttribution: true }}
          >
            {/* React Flow takes these as props rather than classes, so they cannot be
                reached by a theme token and have to be kept in step by hand. Both were
                stock Tailwind blue-grey, which read cold and slightly blue against the
                obsidian-violet ink everything else now sits on. #2b3340 is slate-700
                and rgb(7 6 11) is slate-950, i.e. the same two values the surrounding
                !bg-slate-800 / !bg-slate-900 chrome resolves to. */}
            <Background color="#2b3340" gap={24} />
            <Controls className="!bg-slate-800 !border-slate-700" />
            <MiniMap pannable zoomable className="!bg-slate-900" maskColor="rgba(7, 6, 11, 0.7)" />
          </ReactFlow>
        </div>
      )}
    </SplitPage>
  );
};

export const FusionGraphPage: React.FC = () => (
  <ReactFlowProvider>
    <FusionGraphInner />
  </ReactFlowProvider>
);

export default FusionGraphPage;
