import React from "react";
import { getGroundImagePath } from "../types/greenhouse";
import { CropImage } from "../components/shared/CropImage";
import { WikiLink } from "../../ui/WikiLink";
import { cropIconSrc } from "./icons";
import { groundLabel } from "./ground";
import { cropBill } from "./useSolvedLayout";
import type { SolveResponse, CropDefinition, MutationDefinition } from "../types/greenhouse";

const GRID = 10;

interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

interface Cell {
  id: string;
  name: string;
  ground: string;
  isMutation: boolean;
  /** Top-left cell of a multi-cell placement, so we only draw the icon once. */
  anchor: boolean;
  size: number;
  /** Dependency wave for a delayed-growth overlay. Undefined on direct fields. */
  wave?: number;
}

const buildCells = (
  result: SolveResponse,
  data: Dataset,
  mutationWaveByPlacement?: Record<string, number>,
): Map<string, Cell> => {
  const map = new Map<string, Cell>();

  const put = (id: string, row: number, col: number, size: number, isMutation: boolean) => {
    const def = isMutation ? data.mutations[id] : data.crops[id] ?? data.mutations[id];
    const wave = isMutation ? mutationWaveByPlacement?.[`${id}@${row},${col}`] : undefined;
    for (let dr = 0; dr < size; dr++) {
      for (let dc = 0; dc < size; dc++) {
        map.set(`${row + dr},${col + dc}`, {
          id,
          name: def?.name ?? id,
          ground: def?.ground ?? "farmland",
          isMutation,
          anchor: dr === 0 && dc === 0,
          size,
          ...(wave !== undefined ? { wave } : {}),
        });
      }
    }
  };

  // Crops first; mutation spots take precedence if anything overlaps.
  for (const p of result.placements) put(p.crop, p.position[0], p.position[1], p.size, false);
  for (const m of result.mutations) put(m.mutation, m.position[0], m.position[1], m.size, true);

  return map;
};

/**
 * Renders one optimal plot from the greenhouse solver.
 *
 * Two kinds of cell, drawn to be told apart at a glance:
 *   - a planted crop: its soil, with the crop sitting on it at full strength
 *   - a mutation spot: left visibly bare, ringed in emerald, with a faint
 *     preview of what will appear there
 */
interface SolvedGridViewProps {
  result: SolveResponse;
  data: Dataset;
  cellSize?: number;
  /**
   * Present on the workspace's locked preview. A solved field is read-only,
   * but read-only must not mean inscrutable: every occupied cell can still
   * open the same item sheet as the editable grid.
   *
   * Phase thumbnails deliberately omit this callback because their whole
   * surface selects the field. Keeping the interaction opt-in prevents a cell
   * click from doing two unrelated things there.
   */
  onOpenItem?: (id: string) => void;
  /** Optional dependency wave for each `id@row,col` mutation placement. */
  mutationWaveByPlacement?: Record<string, number>;
}

const SolvedGridViewComponent: React.FC<SolvedGridViewProps> = ({
  result,
  data,
  cellSize = 44,
  onOpenItem,
  mutationWaveByPlacement,
}) => {
  const cells = React.useMemo(
    () => buildCells(result, data, mutationWaveByPlacement),
    [result, data, mutationWaveByPlacement],
  );

  return (
    <div
      className="grid gap-px mx-auto bg-slate-950 p-1 rounded-md border border-slate-700/60"
      style={{ gridTemplateColumns: `repeat(${GRID}, ${cellSize}px)`, width: "fit-content" }}
    >
      {Array.from({ length: GRID * GRID }, (_, i) => {
        const row = Math.floor(i / GRID);
        const col = i % GRID;
        const cell = cells.get(`${row},${col}`);

        if (!cell) {
          return (
            <div
              key={i}
              title="Unused"
              className="rounded-[2px] bg-slate-900 border border-slate-800/80"
              style={{ width: cellSize, height: cellSize }}
            />
          );
        }

        const soil = getGroundImagePath(cell.ground);
        /*
         * A multi-cell block is drawn ONCE, as a single overlay spanning its
         * whole footprint, anchored at its top-left cell. The old version gave
         * every covered cell its own ring and clipped a block-sized icon
         * inside a one-cell box, so a 3x3 snoozling rendered as nine
         * separately ringed squares with a corner of an icon in one of them -
         * unreadable at the line's 10px scale. The +1s
         * bridge the grid's 1px gaps so the block reads as one thing; the
         * overlay ignores the pointer so every covered cell keeps its
         * tooltip.
         */
        const span = cellSize * cell.size + (cell.size - 1);
        const soilTile = {
          backgroundImage: `url(${soil})`,
          backgroundSize: `${cellSize}px ${cellSize}px`,
          imageRendering: "pixelated" as const,
        };
        const CellElement: React.ElementType = onOpenItem ? "button" : "div";
        const inspectProps = onOpenItem
          ? {
              type: "button" as const,
              onClick: () => onOpenItem(cell.id),
              "aria-label": `Open ${cell.name} details`,
            }
          : {};

        if (cell.isMutation) {
          const stagedTitle = cell.wave === undefined
            ? `${cell.name} spawns here`
            : cell.wave === 0
              ? `Step 1: ${cell.name} grows here`
              : `Step ${cell.wave + 1}: ${cell.name} grows here after its inputs appear`;
          return (
            <CellElement
              key={i}
              {...inspectProps}
              title={`${stagedTitle}, leave this cell empty (${groundLabel(cell.ground)})`}
              className={`greenhouse-solved-cell relative rounded-[2px]${onOpenItem ? " is-inspectable" : ""}`}
              style={{ width: cellSize, height: cellSize, ...soilTile }}
            >
              {cell.anchor && (
                <div
                  className={`greenhouse-solved-mutation${cell.wave !== undefined ? ` is-wave-${Math.min(2, cell.wave)}` : ""} pointer-events-none absolute left-0 top-0 z-10 overflow-hidden rounded-[2px]`}
                  style={{ width: span, height: span, ...soilTile }}
                >
                  {/* Wash keeps the spot obviously bare rather than looking planted. */}
                  <div className="greenhouse-solved-mutation-wash absolute inset-0" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <CropImage
                      cropId={cell.id}
                      cropName={cell.name}
                      size="full"
                      hasGroundContext
                      groundType={cell.ground}
                      className="opacity-70"
                      style={{ width: span, height: span }}
                    />
                  </div>
                </div>
              )}
            </CellElement>
          );
        }

        return (
          <CellElement
            key={i}
            {...inspectProps}
            title={`Plant ${cell.name} on ${groundLabel(cell.ground)}`}
            className={`greenhouse-solved-cell relative rounded-[2px]${onOpenItem ? " is-inspectable" : ""} ${cell.size === 1 ? "overflow-hidden border border-slate-700/50" : ""}`}
            style={{ width: cellSize, height: cellSize, ...soilTile }}
          >
            {cell.size === 1 ? (
              <CropImage cropId={cell.id} cropName={cell.name} size="full" hasGroundContext groundType={cell.ground} className="absolute inset-0" />
            ) : (
              cell.anchor && (
                <div
                  className="pointer-events-none absolute left-0 top-0 z-10 overflow-hidden rounded-[2px] border border-slate-700/50"
                  style={{ width: span, height: span, ...soilTile }}
                >
                  <CropImage
                    cropId={cell.id}
                    cropName={cell.name}
                    size="full"
                    hasGroundContext
                    groundType={cell.ground}
                    className="absolute inset-0"
                  />
                </div>
              )
            )}
          </CellElement>
        );
      })}
    </div>
  );
};

/**
 * Planner progress changes timings and counters, not a solver result's board.
 * Keeping the board behind a memo boundary prevents every planting tick from
 * reconciling another 100 cells for every move in the route preview.
 */
export const SolvedGridView = React.memo(SolvedGridViewComponent);
SolvedGridView.displayName = "SolvedGridView";

export const SolvedLegend: React.FC = () => (
  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
    <span className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-[2px] ring-2 ring-emerald-400 ring-inset bg-emerald-950" />
      mutation spawns here, leave empty
    </span>
    <span className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-[2px] border border-slate-600 bg-amber-900/60" />
      plant this crop
    </span>
    <span className="flex items-center gap-1.5">
      <span className="w-3.5 h-3.5 rounded-[2px] bg-slate-900 border border-slate-800" />
      unused
    </span>
  </div>
);

/** What the solved plot yields and what it costs to plant. */
export const SolvedSummary: React.FC<{ result: SolveResponse; data: Dataset }> = ({ result, data }) => {
  const yields = new Map<string, number>();
  for (const m of result.mutations) yields.set(m.mutation, (yields.get(m.mutation) ?? 0) + 1);

  /*
   * The SAME counter the economics costs a planting with, not a second one that
   * happens to agree. PLANT THIS is the panel a player acts on, so the bill on
   * it has to be the bill the plan was priced at, by construction rather than
   * by coincidence.
   */
  const crops = cropBill(result.placements);

  const soil = new Map<string, number>();
  for (const p of result.placements) {
    const g = data.crops[p.crop]?.ground ?? data.mutations[p.crop]?.ground ?? "farmland";
    soil.set(g, (soil.get(g) ?? 0) + p.size * p.size);
  }
  for (const m of result.mutations) {
    const g = data.mutations[m.mutation]?.ground ?? "farmland";
    soil.set(g, (soil.get(g) ?? 0) + m.size * m.size);
  }

  const row = (label: string, entries: [string, number][], nameOf: (id: string) => string) => (
    <div>
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</h4>
      <div className="flex flex-wrap gap-1">
        {entries
          .sort((a, b) => b[1] - a[1])
          .map(([id, n]) => (
            <span key={id} className="flex items-center gap-1 rounded-sm bg-slate-700/50 border border-slate-600/50 px-1.5 py-0.5 text-[11px] text-slate-300">
              <WikiLink name={nameOf(id)} icon iconSize={14} iconSrc={cropIconSrc(id)} />
              <span className="text-slate-400 tabular-nums">×{n}</span>
            </span>
          ))}
      </div>
    </div>
  );

  /*
   * Say whether this plot is PROVED best or merely the best we found.
   *
   * The solver has always known the difference: it returns OPTIMAL only when
   * every target reached its own upper bound, and FEASIBLE otherwise. The
   * solver results page showed that; this panel did not, and this is the panel
   * a player actually plants from. Worse, the loading line above it used to
   * read "Solving the optimal plot", so the planner promised an optimum and
   * then never withdrew the claim when it came back one spawn short.
   *
   * Nine of the forty mutations genuinely finish FEASIBLE, so this is a real
   * distinction for a real player, not a formality.
   */
  const proved = result.status === "OPTIMAL";

  return (
    <div className="space-y-2">
      <p
        className={`text-[11px] uppercase tracking-wide font-semibold ${proved ? "text-emerald-400" : "text-amber-300/90"}`}
        title={
          proved
            ? "Every spawn spot this layout could possibly reach is filled: no arrangement of this plot does better."
            : "The search did not prove this is the maximum. It is the best layout it found in the time it had, and a better one may exist."
        }
      >
        {proved ? "Proved optimal" : "Best found, not proved optimal"}
      </p>
      {row("Yields per plot", [...yields.entries()], (id) => data.mutations[id]?.name ?? id)}
      {row("Plant this", Object.entries(crops), (id) => data.crops[id]?.name ?? data.mutations[id]?.name ?? id)}
      <div>
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Soil</h4>
        <div className="flex flex-wrap gap-1">
          {[...soil.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([g, n]) => (
              <span key={g} className="flex items-center gap-1 rounded-sm bg-slate-700/50 border border-slate-600/50 px-1.5 py-0.5 text-[11px] text-slate-300">
                <span
                  className="w-3.5 h-3.5 rounded-[2px] border border-slate-600/60"
                  style={{ backgroundImage: `url(${getGroundImagePath(g)})`, backgroundSize: "cover", imageRendering: "pixelated" }}
                />
                {groundLabel(g)}
                <span className="text-slate-400 tabular-nums">×{n}</span>
              </span>
            ))}
        </div>
      </div>
    </div>
  );
};
