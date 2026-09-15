import { UtilityTargetSearch } from "../ui/UtilityTargetSearch";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ItemTooltip } from "../ui/ItemTooltip";
import { useLocation } from "react-router-dom";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Eraser,
  Eye,
  EyeOff,
  FolderOpen,
  Lock,
  Minus,
  MousePointer2,
  Move,
  Pause,
  PackageOpen,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Share2,
  SlidersHorizontal,
  Sprout,
  Target,
  TimerReset,
  TriangleAlert,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { describeSources, useOwned } from "../inventory";
import { useIsland } from "../island/useIsland";
import { useGreenhouseStats } from "../island/profileStats";
import { useNetworth } from "../networth/useNetworth";
import { pushRecent, useRecentSearches } from "../search/recentSearches";
import { rarityKey } from "../search/rarity";
import { ItemIcon } from "../ui/ItemIcon";
import type { ItemTooltipMetadata, ItemTooltipSection } from "../ui/itemTooltipModel";
import type { LayoutItem } from "../island/layout";
import { ProfileIdentityTrigger } from "../profile-view/profile-sections/ProfileIdentityTrigger";
import { UtilityInfo } from "../profile-view/UtilityMetric";
import { CropImage } from "./components/shared";
import { DesignerGrid, LoadLayoutModal, SendToGameButton } from "./components";
import { useToast } from "./components/ui/toastContext";
import { isPermanentUnlockedCell } from "./constants";
import { getEffectDescription, useDesigner, useGreenhouseData, useGridState, useInfoModal } from "./context";
import type { DesignerPlacement } from "./context";
import { nextDesignerLayoutCode } from "./designerRoute";
import { usePlannerState, type PlannerTarget } from "./planner/usePlannerState";
import { useTargetCatalogue, type CatalogueTarget } from "./planner/useTargetCatalogue";
import {
  buildSolverPlan,
  collectMutations,
  type PlotEconomy,
  type SolverPlan,
  type SolverPlanNode,
} from "./planner/solverPlan";
import { useSolverEconomies } from "./planner/useSolverEconomies";
import {
  buildDelayedGrowthLayout,
  restoreDelayedGrowthLayout,
  type DelayedGrowthChange,
  type DelayedGrowthLayout,
} from "./planner/delayedGrowth";
import { useSolvedLayout } from "./planner/useSolvedLayout";
import { DEFAULT_SIZING_MODE, sizingFor } from "./planner/plotSizing";
import { buildPlanEstimates } from "./planner/planEstimates";
import { resolveGrowth } from "./planner/growthSource";
import { withMutationIds } from "./planner/mutationBridge";
import { mostRecentLayoutNickname } from "./components/designer/layoutPreviewPresentation";
import { solveGreenhouseWithJob } from "./services";
import type { GreenhouseTool } from "./route";
import type { CropDefinition, JobProgress, MutationDefinition, MutationGoal, SolveResponse } from "./types/greenhouse";
import type { SavedLayout } from "./types/layout";
import {
  buildShareUrl,
  decodeDesign,
  encodeSharedDesign,
  generateLayoutId,
  getGridDimensions,
} from "./utilities";
import {
  countProfileContainer,
  goalChoiceKey,
  goalQuantityForPlotCapacity,
  goalWorkRemaining,
  mutationCapacity,
  normalisePlotInteractionMode,
  rankGoalChoices,
  selectPlanField,
  targetFieldId,
  unmetFiniteMutationGoals,
  type PlotInteractionMode,
} from "./workspaceModel";
import { gridLineCells } from "./hooks/shared/gridPaint";
import { GreenhousePlanBreakdown } from "./GreenhousePlanBreakdown";
import { GreenhousePlotBrief } from "./GreenhousePlotBrief";
import { resolveLinkedTargetAddition } from "./linkedTarget";

interface GreenhouseWorkspaceProps {
  focusTool?: GreenhouseTool;
  linkedTarget?: string | null;
}

interface SearchChoice {
  id: string;
  kind: PlannerTarget["kind"];
  name: string;
  item?: CatalogueTarget;
  rarity?: string | null;
  hypixelId?: string | null;
}

interface MutationNeed {
  id: string;
  name: string;
  units: number;
  owned?: number;
  missing: number;
  source: string;
}

interface RequirementGroup {
  key: string;
  label: string;
  rows: SolverPlanNode[];
}

interface HoldingSummary {
  known: boolean;
  count: number;
  source: string;
}

const NO_CHESTS: [] = [];
const PLOT_PREFERENCE_KEY = "skydex.greenhouse.plot-workspace.v1";

interface PlotWorkspacePreference {
  mode: PlotInteractionMode;
  hybridFieldId: string | null;
  delayedGrowth: boolean;
}

const loadPlotWorkspacePreference = (): PlotWorkspacePreference => {
  try {
    const raw = JSON.parse(localStorage.getItem(PLOT_PREFERENCE_KEY) ?? "null") as {
      mode?: unknown;
      hybridFieldId?: unknown;
      delayedGrowth?: unknown;
    } | null;
    return {
      mode: normalisePlotInteractionMode(raw?.mode),
      hybridFieldId: typeof raw?.hybridFieldId === "string" ? raw.hybridFieldId : null,
      delayedGrowth: raw?.delayedGrowth === true,
    };
  } catch {
    return { mode: "locked", hybridFieldId: null, delayedGrowth: false };
  }
};

const requirementGroupsFor = (plan: SolverPlan | null): RequirementGroup[] => {
  if (!plan) return [];
  const groups: RequirementGroup[] = [];
  if (plan.baseCrops.length) {
    groups.push({ key: "base", label: "Inputs to gather", rows: plan.baseCrops });
  }
  for (const cycle of plan.cycles) {
    groups.push({
      key: `cycle-${cycle.index}`,
      label: `Phase ${cycle.index + 1}`,
      rows: cycle.produce,
    });
  }
  if (plan.manual.length) {
    groups.push({ key: "manual", label: "Manual steps", rows: plan.manual });
  }
  return groups;
};

const cleanName = (id: string): string =>
  id.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const rarityStyle = (raw: string | null | undefined): React.CSSProperties | undefined => {
  const key = rarityKey(raw);
  return key
    ? ({ "--greenhouse-rarity": `var(--color-rarity-${key})` } as React.CSSProperties)
    : undefined;
};

const detailName = (id: string): string => cleanName(id);

const TargetArtwork: React.FC<{
  id: string;
  name: string;
  kind: PlannerTarget["kind"];
  size?: number;
  hypixelId?: string | null;
}> = ({ id, name, kind, size = 28, hypixelId }) =>
  kind === "mutation" ? (
    <CropImage cropId={id} cropName={name} width={size} height={size} showFallback />
  ) : (
    <ItemIcon id={id} hypixelId={hypixelId ?? undefined} name={name} size={size} fallback="initials" />
  );

const GreenhouseIdentityTrigger: React.FC<{
  id: string;
  name: string;
  kind: PlannerTarget["kind"] | "crop";
  rarity?: string | null;
  hypixelId?: string | null;
  source?: string;
  mutation?: MutationDefinition;
  item?: CatalogueTarget;
  getCropDef: (id: string) => CropDefinition | undefined;
  effects: Record<string, { name: string; description: string }>;
  buttonClassName: string;
  children: React.ReactNode;
  onSelect?: () => void;
}> = ({
  id,
  name,
  kind,
  rarity,
  hypixelId,
  source,
  mutation,
  item,
  getCropDef,
  effects,
  buttonClassName,
  children,
  onSelect,
}) => {
  const metadata: ItemTooltipMetadata[] = [];
  const sections: ItemTooltipSection[] = [];

  if (mutation) {
    const grounds = mutation.grounds?.length ? mutation.grounds : [mutation.ground];
    metadata.push(
      { label: "Footprint", value: `${mutation.size}×${mutation.size}` },
      { label: "Ground", value: grounds.map(detailName).join(" or ") },
      { label: "Growth", value: `${mutation.growth_stages} stage${mutation.growth_stages === 1 ? "" : "s"}` },
      { label: "Decay", value: mutation.decay ? `${mutation.decay} days` : "None" },
    );
    if (mutation.requirements.length) {
      sections.push({
        title: "Required around it",
        lines: mutation.requirements.map((requirement) =>
          `${requirement.count.toLocaleString()}× ${getCropDef(requirement.crop)?.name ?? cleanName(requirement.crop)}`),
      });
    }
    if (mutation.positive_buffs.length) {
      sections.push({
        title: "Positive effects",
        tone: "bonus",
        lines: mutation.positive_buffs.map((effect) => {
          const description = getEffectDescription(effect, effects);
          return description ? `${cleanName(effect)}: ${description}` : cleanName(effect);
        }),
      });
    }
    if (Object.keys(mutation.drops).length) {
      sections.push({
        title: "Drops",
        lines: Object.entries(mutation.drops).map(([drop, count]) =>
          `${count.toLocaleString()}× ${cleanName(drop)}`),
      });
    }
  }

  const tooltip = {
    id: hypixelId ?? id,
    name,
    tier: rarity,
    tierIsDisplayed: true,
    icon: kind === "crop"
      ? <CropImage cropId={id} cropName={name} width={38} height={38} showFallback />
      : <TargetArtwork id={id} name={name} kind={kind} hypixelId={hypixelId} size={38} />,
    metadata,
    sections,
    recipe: item ? { ingredients: item.ingredients.map(ingredient => ({
      id: ingredient.mutation ?? ingredient.crop, name: ingredient.name, qty: ingredient.qty,
    })) } : undefined,
    wikiName: name,
    provenance: source || undefined,
    wrapperClassName: "block min-w-0",
  };
  return onSelect ? (
    <ItemTooltip {...tooltip} interactive>
      <button type="button" role="option" aria-selected="false" aria-label={`Add ${name}`}
        className={buttonClassName} style={rarityStyle(rarity)} onClick={onSelect}>
        {children}
      </button>
    </ItemTooltip>
  ) : (
    <ProfileIdentityTrigger {...tooltip} buttonClassName={buttonClassName}>{children}</ProfileIdentityTrigger>
  );
};

const GoalChoiceGrid: React.FC<{
  choices: SearchChoice[];
  loading: boolean;
  onSelect: (choice: SearchChoice) => void;
  mutationById: ReadonlyMap<string, MutationDefinition>;
  getCropDef: (id: string) => CropDefinition | undefined;
  effects: Record<string, { name: string; description: string }>;
}> = ({ choices, loading, onSelect, mutationById, getCropDef, effects }) => (
  <div className="greenhouse-goal-search-results" role="listbox" aria-label="Available targets">
    <div className="greenhouse-goal-icon-grid">
      {choices.map(choice => (
        <GreenhouseIdentityTrigger key={goalChoiceKey(choice)} {...choice}
          mutation={mutationById.get(choice.id)} getCropDef={getCropDef} effects={effects}
          buttonClassName="greenhouse-goal-choice" onSelect={() => onSelect(choice)}>
          <TargetArtwork {...choice} size={36} />
        </GreenhouseIdentityTrigger>
      ))}
      {choices.length === 0 && <span className="greenhouse-empty-line">
        {loading ? "Loading targets…" : "No matching target"}
      </span>}
    </div>
  </div>
);

const PlotCellEditor: React.FC<{
  cellSize: number;
  gap: number;
  occupiedCells: ReadonlySet<string>;
  children?: React.ReactNode;
}> = ({ cellSize, gap, occupiedCells, children }) => {
  const { unlockedCells, expandableCells } = useGridState();
  const { setPlotCell, selectAllPlotCells, resetPlotCells } = useDesigner();
  const { width, height } = getGridDimensions(cellSize, gap);
  const paintRef = useRef<{ mode: "unlock" | "lock"; last: [number, number] } | null>(null);
  const touchRef = useRef<{
    pointerId: number;
    row: number;
    col: number;
    startX: number;
    startY: number;
    cancelled: boolean;
  } | null>(null);

  const paintTo = useCallback((row: number, col: number, mode: "unlock" | "lock") => {
    const start = paintRef.current?.last ?? [row, col];
    for (const [nextRow, nextCol] of gridLineCells(start, [row, col])) {
      setPlotCell(nextRow, nextCol, mode);
    }
    paintRef.current = { mode, last: [row, col] };
  }, [setPlotCell]);

  useEffect(() => {
    const stopPainting = () => {
      paintRef.current = null;
      touchRef.current = null;
    };
    document.addEventListener("pointerup", stopPainting);
    document.addEventListener("pointercancel", stopPainting);
    window.addEventListener("blur", stopPainting);
    return () => {
      document.removeEventListener("pointerup", stopPainting);
      document.removeEventListener("pointercancel", stopPainting);
      window.removeEventListener("blur", stopPainting);
    };
  }, []);

  return (
    <div className="greenhouse-cell-editor" style={{ width }}>
      <div className="greenhouse-cell-editor-stage" style={{ width, height }}>
        {children && (
          <div className="greenhouse-cell-editor-plot" aria-hidden="true" inert>
            {children}
          </div>
        )}
        <div
          className="greenhouse-cell-editor-grid"
          style={{
            gridTemplateColumns: `repeat(10, ${cellSize}px)`,
            gap,
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {Array.from({ length: 100 }, (_, index) => {
            const row = Math.floor(index / 10);
            const col = index % 10;
            const key = `${row},${col}`;
            const unlocked = unlockedCells.has(key);
            const expandable = expandableCells.has(key);
            const occupied = occupiedCells.has(key);
            const permanent = isPermanentUnlockedCell(row, col);
            const unreachable = !unlocked && !expandable;
            return (
              <button
                key={key}
                type="button"
                className={`greenhouse-cell-editor-cell${unlocked ? " is-unlocked" : ""}${expandable ? " is-expandable" : ""}${unreachable ? " is-unreachable" : ""}${occupied ? " is-occupied" : ""}${permanent ? " is-permanent" : ""}`}
                style={{ width: cellSize, height: cellSize }}
                disabled={permanent}
                aria-disabled={!permanent && unreachable ? true : undefined}
                onPointerDown={(event) => {
                  if (event.pointerType === "touch") {
                    paintRef.current = null;
                    touchRef.current = {
                      pointerId: event.pointerId,
                      row,
                      col,
                      startX: event.clientX,
                      startY: event.clientY,
                      cancelled: false,
                    };
                    return;
                  }
                  if (event.button !== 0 && event.button !== 2) return;
                  event.preventDefault();
                  const mode = event.button === 2 ? "lock" : "unlock";
                  paintRef.current = { mode, last: [row, col] };
                  paintTo(row, col, mode);
                }}
                onPointerMove={(event) => {
                  const touch = touchRef.current;
                  if (!touch || touch.pointerId !== event.pointerId) return;
                  if (
                    Math.abs(event.clientX - touch.startX) > 8
                    || Math.abs(event.clientY - touch.startY) > 8
                  ) touch.cancelled = true;
                }}
                onPointerUp={(event) => {
                  const touch = touchRef.current;
                  if (!touch || touch.pointerId !== event.pointerId) return;
                  touchRef.current = null;
                  if (!touch.cancelled && touch.row === row && touch.col === col) {
                    setPlotCell(row, col, unlocked ? "lock" : "unlock");
                  }
                }}
                onPointerCancel={() => {
                  touchRef.current = null;
                }}
                onPointerEnter={() => {
                  const paint = paintRef.current;
                  if (paint) paintTo(row, col, paint.mode);
                }}
                onClick={(event) => {
                  // Keyboard and assistive activation has detail 0. Pointer
                  // clicks were already handled and must not toggle twice.
                  if (event.detail !== 0) return;
                  setPlotCell(row, col, unlocked ? "lock" : "unlock");
                }}
                aria-pressed={unlocked}
                aria-label={`Row ${row + 1}, column ${col + 1}: ${permanent ? "permanent core, " : ""}${occupied ? "in use, " : ""}${unlocked ? "unlocked" : expandable ? "locked, available to unlock" : "locked, unlock an adjacent cell first"}`}
                title={permanent ? "Permanent core cell" : unlocked ? "Lock cell" : expandable ? "Unlock cell" : "Unlock an adjacent cell first"}
              />
            );
          })}
        </div>
      </div>
      <div className="greenhouse-cell-editor-actions">
        <button type="button" onClick={resetPlotCells}>Starter plot</button>
        <button type="button" onClick={selectAllPlotCells}>All cells</button>
      </div>
    </div>
  );
};

/**
 * One greenhouse, one state.
 *
 * Goals, automatic arrangement and hand placement used to be three complete
 * pages mounted one after another. This surface keeps the capabilities but
 * removes the modes: every action reads or changes the same plot in the
 * middle, while the two narrow columns only answer "why am I growing this?"
 * and "what can I put here?".
 */
export const GreenhouseWorkspace: React.FC<GreenhouseWorkspaceProps> = ({
  focusTool = "planner",
  linkedTarget = null,
}) => {
  const location = useLocation();
  const { toast } = useToast();
  const {
    crops,
    mutations,
    isLoading: dataLoading,
    error: dataError,
    uniqueCrops,
    getCropDef,
    getMutationDef,
  } = useGreenhouseData();
  const mutationIds = useMemo(() => mutations.map((mutation) => mutation.id), [mutations]);
  const {
    targets: catalogue,
    items: itemIndex,
    loading: catalogueLoading,
    error: catalogueError,
  } = useTargetCatalogue(mutationIds);
  const { effectsMap, openInfo } = useInfoModal();
  const apiGreenhouseStats = useGreenhouseStats();
  const recentSearches = useRecentSearches();
  const { snapshot: islandSnapshot } = useIsland();
  const profileInventory = useNetworth(islandSnapshot?.chests ?? NO_CHESTS);
  const planner = usePlannerState();
  const { state, addTarget, setTargetQty, removeTarget, bumpProgress, setView } = planner;
  const {
    unlockedCells,
    cellSource,
    getUnlockedCellsArray,
    unlockCell,
  } = useGridState();
  const plotCells = useMemo(() => getUnlockedCellsArray(), [getUnlockedCellsArray]);
  const {
    inputPlacements,
    targetPlacements,
    allPlacements,
    selectedCropForPlacement,
    setSelectedCropForPlacement,
    setMode,
    loadFromSolverResult,
    getTargetValidation,
    canUndo,
    canRedo,
    undo,
    redo,
    setKeyboardShortcutsEnabled,
    mostRecentLayout,
    savedLayouts,
    restoreMostRecent,
    saveNamedLayout,
    deleteNamedLayout,
    renameNamedLayout,
    clearAllPlacements,
    mode,
  } = useDesigner();

  const [goalQuery, setGoalQuery] = useState("");
  const [goalSearchOpen, setGoalSearchOpen] = useState(true);
  const [plantQuery, setPlantQuery] = useState("");
  const [showTargets, setShowTargets] = useState(true);
  const [editingCells, setEditingCells] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [loadoutsOpen, setLoadoutsOpen] = useState(false);
  const [loadoutName, setLoadoutName] = useState("");
  const [solving, setSolving] = useState(false);
  const [maxingTargetId, setMaxingTargetId] = useState<string | null>(null);
  const [solveProgress, setSolveProgress] = useState<JobProgress | null>(null);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [focusedRequirementId, setFocusedRequirementId] = useState<string | null>(null);
  const [gridMetrics, setGridMetrics] = useState({ cellSize: 38, gap: 2 });
  const [plotWorkspace, setPlotWorkspace] = useState<PlotWorkspacePreference>(loadPlotWorkspacePreference);
  const [pendingHybridFieldId, setPendingHybridFieldId] = useState<string | null>(null);

  const boardMeasureRef = useRef<HTMLDivElement>(null);
  const plotSectionRef = useRef<HTMLElement>(null);
  const solveAbortRef = useRef<AbortController | null>(null);
  const maxAbortRef = useRef<AbortController | null>(null);
  const lastLoadedLayoutCodeRef = useRef<string | null>(null);
  const handledLinkedTargetRef = useRef<string | null>(null);
  const hybridDelayedChangeRef = useRef<DelayedGrowthChange | null>(null);
  const requirementDetailRef = useRef<HTMLElement>(null);
  const { mode: plotMode, hybridFieldId, delayedGrowth: delayedGrowthEnabled } = plotWorkspace;
  const delayedGrowthEnabledRef = useRef(delayedGrowthEnabled);

  useEffect(() => {
    try {
      localStorage.setItem(PLOT_PREFERENCE_KEY, JSON.stringify(plotWorkspace));
    } catch {
      // Private browsing can deny storage. The current session still works.
    }
  }, [plotWorkspace]);

  useEffect(() => {
    setKeyboardShortcutsEnabled(plotMode === "hybrid" || editingCells);
    if (plotMode === "locked") {
      setSelectedCropForPlacement(null);
    }
    return () => setKeyboardShortcutsEnabled(true);
  }, [editingCells, plotMode, setKeyboardShortcutsEnabled, setSelectedCropForPlacement]);

  const catalogueById = useMemo(
    () => new Map(catalogue.map((target) => [target.id, target])),
    [catalogue],
  );
  const mutationById = useMemo(
    () => new Map(mutations.map((mutation) => [mutation.id, mutation])),
    [mutations],
  );
  const dataset = useMemo(
    () => ({
      crops: Object.fromEntries(crops.map((crop) => [crop.id, crop])) as Record<string, CropDefinition>,
      mutations: Object.fromEntries(mutations.map((mutation) => [mutation.id, mutation])) as Record<string, MutationDefinition>,
    }),
    [crops, mutations],
  );
  const bridgeIndex = useMemo(
    () => withMutationIds(itemIndex, mutations),
    [itemIndex, mutations],
  );
  /**
   * Point the plot at the freshly chosen target's field. Without this steer
   * `state.view.mutation` keeps naming the previous field, which wins whenever
   * it still belongs to the plan - so selecting a different mutation could
   * leave the plot showing the old one.
   */
  const showFieldForTarget = useCallback((id: string, kind: PlannerTarget["kind"]) => {
    const fieldId = targetFieldId(kind, id, catalogueById.get(id)?.ingredients ?? [], dataset);
    if (fieldId) setView({ mutation: fieldId, cycle: null });
  }, [catalogueById, dataset, setView]);

  useEffect(() => {
    if (!linkedTarget) {
      handledLinkedTargetRef.current = null;
      return;
    }
    if (
      dataLoading
      || catalogueLoading
      || handledLinkedTargetRef.current === linkedTarget
    ) return;

    const alreadySaved = state.targets.some((target) => target.id === linkedTarget);
    if (alreadySaved) {
      handledLinkedTargetRef.current = linkedTarget;
      showFieldForTarget(linkedTarget, mutationById.has(linkedTarget) ? "mutation" : "item");
      return;
    }

    const addition = resolveLinkedTargetAddition(
      linkedTarget,
      state.targets,
      mutationById,
      catalogueById,
    );
    if (addition) {
      handledLinkedTargetRef.current = linkedTarget;
      addTarget(addition.id, addition.kind);
      showFieldForTarget(addition.id, addition.kind);
      return;
    }

    // A failed catalogue is not proof that an item target is invalid. Leave
    // the link pending so a later resource refresh can resolve it.
    if (!catalogueError) handledLinkedTargetRef.current = linkedTarget;
  }, [
    addTarget,
    catalogueById,
    catalogueError,
    catalogueLoading,
    dataLoading,
    linkedTarget,
    mutationById,
    showFieldForTarget,
    state.targets,
  ]);

  const owned = useOwned({ items: bridgeIndex, manual: state.inventory });
  const personalVaultCounts = useMemo(
    () => countProfileContainer(profileInventory.parsed?.personal_vault),
    [profileInventory.parsed],
  );

  const holdingsFor = useCallback((id: string): HoldingSummary => {
    const entry = owned.get(id);
    if (entry?.overridden) {
      return { known: true, count: entry.total, source: "Set by you" };
    }

    const hypixelId = bridgeIndex[id]?.hypixelId ?? catalogueById.get(id)?.hypixelId ?? null;
    const vaultCount = hypixelId ? personalVaultCounts.get(hypixelId.toUpperCase()) ?? 0 : 0;
    const known = entry !== undefined || vaultCount > 0;
    const sources = [
      describeSources(entry),
      vaultCount > 0 ? `personal vault ${vaultCount.toLocaleString()} (api)` : "",
    ].filter(Boolean);

    return {
      known,
      count: (entry?.total ?? 0) + vaultCount,
      source: sources.join(", "),
    };
  }, [bridgeIndex, catalogueById, owned, personalVaultCounts]);

  const targetName = useCallback(
    (target: PlannerTarget) =>
      catalogueById.get(target.id)?.name ?? mutationById.get(target.id)?.name ?? cleanName(target.id),
    [catalogueById, mutationById],
  );

  const targetLabel = useMemo(
    () =>
      state.targets.length === 0
        ? null
        : state.targets
            .map((target) => `${target.qty > 1 ? `${target.qty}x ` : ""}${targetName(target)}`)
            .join(", "),
    [state.targets, targetName],
  );

  const targetHoldings = useMemo(() => {
    const values = new Map<string, HoldingSummary>();
    for (const target of state.targets) values.set(`${target.kind}:${target.id}`, holdingsFor(target.id));
    return values;
  }, [holdingsFor, state.targets]);

  const directGoalMutations = useMemo(
    () => new Set(state.targets
      .filter((target) => target.kind === "mutation")
      .map((target) => target.id)),
    [state.targets],
  );

  const planTargets = useMemo(() => {
    const totals = new Map<string, number>();
    for (const target of state.targets) {
      if (target.kind === "mutation") {
        totals.set(target.id, (totals.get(target.id) ?? 0) + target.qty);
        continue;
      }

      for (const ingredient of catalogueById.get(target.id)?.ingredients ?? []) {
        if (!ingredient.mutation) continue;
        totals.set(
          ingredient.mutation,
          (totals.get(ingredient.mutation) ?? 0) + ingredient.qty * target.qty,
        );
      }
    }
    return [...totals.entries()].map(([id, qty]) => ({ id, qty }));
  }, [catalogueById, state.targets]);
  const planTargetIds = useMemo(() => planTargets.map((target) => target.id), [planTargets]);

  const effectiveInventory = useMemo(() => {
    const inventory: Record<string, number> = {};
    const ids = new Set([
      ...Object.keys(dataset.mutations),
      ...Object.keys(dataset.crops),
      ...Object.keys(state.inventory),
    ]);
    for (const id of ids) {
      const holding = holdingsFor(id);
      if (holding.known && holding.count > 0) inventory[id] = Math.floor(holding.count);
    }
    return inventory;
  }, [dataset, holdingsFor, state.inventory]);

  const involvedMutations = useMemo(
    () => planTargets.length ? collectMutations(planTargets, dataset) : [],
    [dataset, planTargets],
  );

  const refineRequirements = useCallback(
    (economies: Record<string, PlotEconomy | null>, fullYields: Record<string, number>) => {
      if (!planTargets.length) return {};
      const currentPlan = buildSolverPlan(
        planTargets,
        dataset,
        economies,
        effectiveInventory,
        directGoalMutations,
      );
      return sizingFor(
        currentPlan,
        dataset.mutations,
        fullYields,
        {},
        DEFAULT_SIZING_MODE,
      );
    },
    [dataset, directGoalMutations, effectiveInventory, planTargets],
  );

  const requirementsRefineKey = useMemo(
    () => JSON.stringify([
      planTargets,
      [...directGoalMutations].sort(),
      Object.entries(effectiveInventory).sort(([left], [right]) => left.localeCompare(right)),
      mutations.length,
    ]),
    [directGoalMutations, effectiveInventory, mutations.length, planTargets],
  );
  const requirementEconomy = useSolverEconomies(
    involvedMutations,
    refineRequirements,
    requirementsRefineKey,
    plotCells,
  );

  const plan = useMemo(
    () => planTargets.length && mutations.length
      ? buildSolverPlan(
          planTargets,
          dataset,
          requirementEconomy.economies,
          effectiveInventory,
          directGoalMutations,
        )
      : null,
    [dataset, directGoalMutations, effectiveInventory, mutations.length, planTargets, requirementEconomy.economies],
  );
  const resolvedGrowth = useMemo(
    () => ({
      ...resolveGrowth(state.growth, apiGreenhouseStats),
      uniqueCrops,
    }),
    [apiGreenhouseStats, state.growth, uniqueCrops],
  );
  const planEstimates = useMemo(
    () => plan
      ? buildPlanEstimates(plan, dataset, requirementEconomy.economies, resolvedGrowth, state.progress)
      : null,
    [dataset, plan, requirementEconomy.economies, resolvedGrowth, state.progress],
  );
  const planSizing = useMemo(
    () => plan
      ? sizingFor(
          plan,
          dataset.mutations,
          requirementEconomy.fullYields,
          {},
          DEFAULT_SIZING_MODE,
        )
      : {},
    [dataset.mutations, plan, requirementEconomy.fullYields],
  );

  const activePlanField = useMemo(
    () => selectPlanField(plan?.cycles ?? [], state.progress, state.view.mutation),
    [plan, state.progress, state.view.mutation],
  );
  const activeFieldIds = useMemo(
    () => activePlanField ? [activePlanField.node.id] : null,
    [activePlanField],
  );
  const activeSolved = useSolvedLayout(
    activeFieldIds,
    plotCells,
    activePlanField ? planSizing[activePlanField.node.id] : undefined,
  );
  const activeFieldResult = useMemo(
    () => activePlanField && activeSolved.result?.mutations.some(
      (placement) => placement.mutation === activePlanField.node.id,
    )
      ? activeSolved.result
      : null,
    [activePlanField, activeSolved.result],
  );
  const activeDelayedLayout = useMemo<DelayedGrowthLayout | null>(() => {
    if (
      !delayedGrowthEnabled ||
      !activePlanField ||
      !activeFieldResult ||
      activePlanField.node.plots !== 1
    ) return null;
    const finalSpots = activeFieldResult.mutations.filter(
      (placement) => placement.mutation === activePlanField.node.id,
    ).length;
    if (activePlanField.node.need > finalSpots) return null;
    return buildDelayedGrowthLayout(activeFieldResult, activePlanField.node.id, dataset, plotCells);
  }, [activeFieldResult, activePlanField, dataset, delayedGrowthEnabled, plotCells]);
  const activeDisplayResult = activeDelayedLayout?.displayResult ?? activeFieldResult;
  const retainedDisplayResult = useRef<{
    fieldId: string;
    result: SolveResponse;
  } | null>(null);
  useEffect(() => {
    if (!activeDisplayResult || !activePlanField) return;
    // This is a fallback for the next render, not a reason to render again.
    // The planner can produce a new field wrapper for the same solved layout.
    retainedDisplayResult.current = { fieldId: activePlanField.node.id, result: activeDisplayResult };
  }, [activeDisplayResult, activePlanField]);
  const visibleDisplayResult = activeDisplayResult ?? (
    editingCells && retainedDisplayResult.current?.fieldId === activePlanField?.node.id
      ? retainedDisplayResult.current?.result ?? null
      : null
  );
  useEffect(() => {
    if (!activePlanField) return;
    if (
      state.view.mutation === activePlanField.node.id &&
      state.view.cycle === activePlanField.cycleIndex
    ) return;
    setView({
      cycle: activePlanField.cycleIndex,
      mutation: activePlanField.node.id,
    });
  }, [activePlanField, setView, state.view.cycle, state.view.mutation]);

  const plannedInputPlacements = useMemo<DesignerPlacement[]>(
    () => (visibleDisplayResult?.placements ?? []).map((placement, index) => ({
      id: `planned-input:${activePlanField?.node.id ?? "field"}:${index}`,
      cropId: placement.crop,
      cropName: getCropDef(placement.crop)?.name ?? getMutationDef(placement.crop)?.name ?? cleanName(placement.crop),
      size: placement.size,
      position: placement.position,
      isMutation: false,
    })),
    [visibleDisplayResult, activePlanField?.node.id, getCropDef, getMutationDef],
  );
  const plannedTargetPlacements = useMemo<DesignerPlacement[]>(
    () => (visibleDisplayResult?.mutations ?? []).map((placement, index) => ({
      id: `planned-target:${activePlanField?.node.id ?? "field"}:${index}`,
      cropId: placement.mutation,
      cropName: getMutationDef(placement.mutation)?.name ?? getCropDef(placement.mutation)?.name ?? cleanName(placement.mutation),
      size: placement.size,
      position: placement.position,
      isMutation: true,
    })),
    [visibleDisplayResult, activePlanField?.node.id, getCropDef, getMutationDef],
  );
  const displayInputPlacements = plotMode === "locked" ? plannedInputPlacements : inputPlacements;
  const displayTargetPlacements = plotMode === "locked" ? plannedTargetPlacements : targetPlacements;
  const displayAllPlacements = useMemo(
    () => plotMode === "locked"
      ? [...plannedInputPlacements, ...plannedTargetPlacements]
      : allPlacements,
    [allPlacements, plannedInputPlacements, plannedTargetPlacements, plotMode],
  );
  const hybridShowsActiveField = Boolean(
    activePlanField &&
    hybridFieldId === activePlanField.node.id &&
    targetPlacements.some((placement) => placement.cropId === activePlanField.node.id),
  );

  const loadSolvedFieldIntoHybrid = useCallback((
    fieldId: string | null,
    result: SolveResponse,
    directResult: SolveResponse = result,
  ) => {
    loadFromSolverResult(
      result.placements.map((placement) => ({
        id: placement.crop,
        name: getCropDef(placement.crop)?.name ?? getMutationDef(placement.crop)?.name ?? cleanName(placement.crop),
        position: placement.position,
        size: placement.size,
      })),
      result.mutations.map((placement) => ({
        id: placement.mutation,
        name: getMutationDef(placement.mutation)?.name ?? getCropDef(placement.mutation)?.name ?? cleanName(placement.mutation),
        position: placement.position,
        size: placement.size,
      })),
    );
    hybridDelayedChangeRef.current = directResult === result ? null : { direct: directResult, delayed: result };
    setSelectedCropForPlacement(null);
    setEditingCells(false);
    setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: fieldId }));
  }, [getCropDef, getMutationDef, loadFromSolverResult, setSelectedCropForPlacement]);

  useEffect(() => {
    if (
      plotMode !== "hybrid" ||
      !pendingHybridFieldId ||
      pendingHybridFieldId !== activePlanField?.node.id ||
      !activeDisplayResult
    ) return;
    loadSolvedFieldIntoHybrid(pendingHybridFieldId, activeDisplayResult, activeFieldResult ?? activeDisplayResult);
    setPendingHybridFieldId(null);
  }, [
    activePlanField?.node.id,
    activeDisplayResult,
    activeFieldResult,
    loadSolvedFieldIntoHybrid,
    pendingHybridFieldId,
    plotMode,
  ]);

  useEffect(() => {
    if (
      pendingHybridFieldId &&
      pendingHybridFieldId === activePlanField?.node.id &&
      activeSolved.error
    ) setPendingHybridFieldId(null);
  }, [activePlanField?.node.id, activeSolved.error, pendingHybridFieldId]);

  const activatePlannedField = useCallback((
    node: SolverPlanNode,
    phaseIndex: number,
  ) => {
    setView({ cycle: phaseIndex, mutation: node.id });
    if (plotMode === "hybrid") setPendingHybridFieldId(node.id);
  }, [plotMode, setView]);

  const selectPlannedField = useCallback((
    node: SolverPlanNode,
    phaseIndex: number,
  ) => {
    activatePlannedField(node, phaseIndex);
    window.requestAnimationFrame(() => {
      plotSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [activatePlannedField]);

  const choosePlotMode = useCallback((nextMode: PlotInteractionMode) => {
    if (nextMode === plotMode) return;
    setPlotWorkspace((current) => ({ ...current, mode: nextMode }));
    if (nextMode === "locked") {
      setPendingHybridFieldId(null);
      setSelectedCropForPlacement(null);
      return;
    }
    if (
      activePlanField &&
      (!hybridShowsActiveField || allPlacements.length === 0)
    ) setPendingHybridFieldId(activePlanField.node.id);
  }, [
    activePlanField,
    allPlacements.length,
    hybridShowsActiveField,
    plotMode,
    setSelectedCropForPlacement,
  ]);

  const chooseDelayedGrowth = useCallback((enabled: boolean) => {
    delayedGrowthEnabledRef.current = enabled;
    setPlotWorkspace((current) => ({ ...current, delayedGrowth: enabled }));
    if (plotMode !== "hybrid") return;
    setPendingHybridFieldId(null);
    const current: SolveResponse = {
      status: "HYBRID",
      placements: inputPlacements.map((placement) => ({
        crop: placement.cropId, position: placement.position, size: placement.size,
      })),
      mutations: targetPlacements.map((placement) => ({
        mutation: placement.cropId, position: placement.position, size: placement.size,
      })),
    };
    if (enabled) {
      const delayed = buildDelayedGrowthLayout(
        current, current.mutations.map((target) => target.mutation), dataset, plotCells,
      );
      if (delayed) loadSolvedFieldIntoHybrid(hybridFieldId, delayed.displayResult, current);
    } else {
      const restored = restoreDelayedGrowthLayout(current, hybridDelayedChangeRef.current);
      if (restored) loadSolvedFieldIntoHybrid(hybridFieldId, restored);
    }
  }, [dataset, hybridFieldId, inputPlacements, loadSolvedFieldIntoHybrid, plotCells, plotMode, targetPlacements]);

  const mutationNeeds = useMemo<MutationNeed[]>(() => {
    const totals = new Map<string, number>();
    for (const target of state.targets) {
      if (target.kind === "mutation") {
        totals.set(target.id, (totals.get(target.id) ?? 0) + target.qty);
        continue;
      }
      for (const ingredient of catalogueById.get(target.id)?.ingredients ?? []) {
        if (!ingredient.mutation) continue;
        totals.set(
          ingredient.mutation,
          (totals.get(ingredient.mutation) ?? 0) + ingredient.qty * target.qty,
        );
      }
    }
    return [...totals.entries()]
      .map(([id, units]) => {
        const holding = holdingsFor(id);
        return {
          id,
          units,
          name: mutationById.get(id)?.name ?? cleanName(id),
          ...(holding.known ? { owned: holding.count } : {}),
          missing: goalWorkRemaining(
            units,
            holding.known ? holding.count : undefined,
            directGoalMutations.has(id),
          ),
          source: holding.source,
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [catalogueById, directGoalMutations, holdingsFor, mutationById, state.targets]);

  const outstandingMutationNeeds = useMemo(
    () => mutationNeeds.filter((need) => need.missing > 0),
    [mutationNeeds],
  );
  const focusedRequirement = useMemo(
    () => mutationNeeds.find((need) => need.id === focusedRequirementId && need.missing > 0) ?? null,
    [focusedRequirementId, mutationNeeds],
  );
  const focusedRequirementPlan = useMemo(
    () => focusedRequirement
      ? buildSolverPlan(
          [{ id: focusedRequirement.id, qty: focusedRequirement.units }],
          dataset,
          requirementEconomy.economies,
          effectiveInventory,
          directGoalMutations,
        )
      : null,
    [dataset, directGoalMutations, effectiveInventory, focusedRequirement, requirementEconomy.economies],
  );
  const focusedRequirementGroups = useMemo(
    () => requirementGroupsFor(focusedRequirementPlan),
    [focusedRequirementPlan],
  );

  const openRequirementDetail = useCallback((id: string) => {
    setFocusedRequirementId(id);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        requirementDetailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    });
  }, []);

  useEffect(() => {
    if (!focusedRequirementId) return;
    if (!focusedRequirement) {
      setFocusedRequirementId(null);
    }
  }, [focusedRequirement, focusedRequirementId]);

  const searchChoices = useMemo<SearchChoice[]>(() => {
    const chosen = new Set(state.targets.map((target) => target.id));
    const itemChoices = catalogue
      .filter((target) => !chosen.has(target.id))
      .map((target) => ({
        id: target.id,
        kind: "item" as const,
        name: target.name,
        item: target,
        rarity: target.rarity,
        hypixelId: target.hypixelId,
      }));
    const mutationChoices = mutations
      .filter((mutation) => !chosen.has(mutation.id))
      .map((mutation) => ({
        id: mutation.id,
        kind: "mutation" as const,
        name: mutation.name,
        rarity: mutation.rarity,
      }));
    return rankGoalChoices(
      [...mutationChoices, ...itemChoices],
      recentSearches.map((recent) => recent.key),
      goalQuery,
    );
  }, [catalogue, goalQuery, mutations, recentSearches, state.targets]);

  const snapshotRows = useMemo(() => {
    const snapshot = state.snapshot;
    if (!snapshot || !targetLabel || snapshot.targetLabel !== targetLabel) return [];
    return Object.entries(snapshot.plots)
      .map(([id, total]) => ({
        id,
        total,
        name: snapshot.names[id] ?? mutationById.get(id)?.name ?? cleanName(id),
        cycle: snapshot.cycleOf[id] ?? Number.MAX_SAFE_INTEGER,
      }))
      .sort((left, right) => left.cycle - right.cycle || left.name.localeCompare(right.name));
  }, [mutationById, state.snapshot, targetLabel]);

  const plantChoices = useMemo(() => {
    const query = plantQuery.trim().toLowerCase();
    const matches = (name: string) => !query || name.toLowerCase().includes(query);
    return (mode === "targets" ? mutations : crops).filter((plant) => matches(plant.name));
  }, [crops, mode, mutations, plantQuery]);

  const occupiedCells = useMemo(() => {
    const cells = new Set<string>();
    for (const placement of displayAllPlacements) {
      for (let row = placement.position[0]; row < placement.position[0] + placement.size; row += 1) {
        for (let col = placement.position[1]; col < placement.position[1] + placement.size; col += 1) {
          cells.add(`${row},${col}`);
        }
      }
    }
    return cells;
  }, [displayAllPlacements]);

  const validationSummary = useMemo(() => {
    let ready = 0;
    let delayed = 0;
    let missing = 0;
    for (const placement of targetPlacements) {
      const result = getTargetValidation(placement.id, mutations);
      if (result.state === "valid") ready += 1;
      else if (result.state === "delayed") delayed += 1;
      else missing += 1;
    }
    return { ready, delayed, missing };
  }, [getTargetValidation, mutations, targetPlacements]);

  const layoutItems = useMemo<LayoutItem[]>(() => {
    const toItem = (placement: DesignerPlacement, isMutation: boolean): LayoutItem => ({
      position: placement.position,
      size: placement.size,
      name: placement.cropName,
      isMutation,
      ground: getCropDef(placement.cropId)?.ground ?? getMutationDef(placement.cropId)?.ground ?? null,
    });
    return [
      ...displayInputPlacements.map((placement) => toItem(placement, false)),
      ...displayTargetPlacements.map((placement) => toItem(placement, true)),
    ];
  }, [displayInputPlacements, displayTargetPlacements, getCropDef, getMutationDef]);

  useEffect(() => {
    const host = boardMeasureRef.current;
    if (!host || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const available = Math.max(260, host.clientWidth - 20);
      const gap = available < 360 ? 1 : 2;
      const desired = Math.min(498, available);
      const cellSize = Math.max(24, Math.floor((desired - gap * 9) / 10));
      setGridMetrics((current) =>
        current.cellSize === cellSize && current.gap === gap ? current : { cellSize, gap },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    solveAbortRef.current?.abort();
    maxAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

  const loadLayoutCode = useCallback((layoutCode: string) => {
    const decoded = decodeDesign(layoutCode);
    const inputs = decoded.inputs.map((placement) => {
      const crop = getCropDef(placement.cropId);
      const mutation = getMutationDef(placement.cropId);
      return {
        id: placement.cropId,
        name: crop?.name ?? mutation?.name ?? cleanName(placement.cropId),
        position: placement.position,
        size: crop?.size ?? mutation?.size ?? 1,
      };
    });
    const targets = decoded.targets.map((placement) => {
      const mutation = getMutationDef(placement.cropId);
      const crop = getCropDef(placement.cropId);
      return {
        id: placement.cropId,
        name: mutation?.name ?? crop?.name ?? cleanName(placement.cropId),
        position: placement.position,
        size: mutation?.size ?? crop?.size ?? 1,
      };
    });

    // A shared layout is an explicit request to use these cells. Unlock only
    // the cells it occupies, preserving every other part of the player's plot.
    for (const placement of [...inputs, ...targets]) {
      for (let row = placement.position[0]; row < placement.position[0] + placement.size; row += 1) {
        for (let col = placement.position[1]; col < placement.position[1] + placement.size; col += 1) {
          unlockCell(row, col);
        }
      }
    }
    loadFromSolverResult(inputs, targets);
    setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: null }));
    return { ...decoded, inputs, targets };
  }, [getCropDef, getMutationDef, loadFromSolverResult, unlockCell]);

  useEffect(() => {
    if (dataLoading) return;
    try {
      const layoutCode = nextDesignerLayoutCode(
        lastLoadedLayoutCodeRef.current,
        location.hash,
        location.search,
      );
      if (!layoutCode) return;
      lastLoadedLayoutCodeRef.current = layoutCode;
      const loaded = loadLayoutCode(layoutCode);
      toast({
        title: "Layout loaded",
        description: `${loaded.inputs.length} crops and ${loaded.targets.length} mutations are now on this plot.`,
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Could not load that layout",
        description: error instanceof Error ? error.message : "The layout code is invalid.",
        variant: "error",
        duration: 5000,
      });
    }
  }, [dataLoading, loadLayoutCode, location.hash, location.search, toast]);

  const loadSavedLoadout = useCallback((layout: SavedLayout) => {
    const inputs = layout.inputs.map((placement) => {
      const crop = getCropDef(placement.cropId);
      const mutation = getMutationDef(placement.cropId);
      return {
        id: placement.cropId,
        name: crop?.name ?? mutation?.name ?? cleanName(placement.cropId),
        position: placement.position,
        size: crop?.size ?? mutation?.size ?? 1,
      };
    });
    const targets = layout.targets.map((placement) => {
      const mutation = getMutationDef(placement.cropId);
      const crop = getCropDef(placement.cropId);
      return {
        id: placement.cropId,
        name: mutation?.name ?? crop?.name ?? cleanName(placement.cropId),
        position: placement.position,
        size: mutation?.size ?? crop?.size ?? 1,
      };
    });

    loadFromSolverResult(inputs, targets);
    setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: null }));
    setSelectedCropForPlacement(null);
    setLoadoutsOpen(false);
    toast({
      title: "Loadout loaded",
      description: layout.name,
      variant: "success",
      duration: 3000,
    });
  }, [getCropDef, getMutationDef, loadFromSolverResult, setSelectedCropForPlacement, toast]);

  const saveCurrentLoadout = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = loadoutName.trim();
    if (!name || allPlacements.length === 0) return;
    if (savedLayouts.some((layout) => layout.name === name)) {
      toast({
        title: "That loadout name is already used",
        variant: "warning",
        duration: 3000,
      });
      return;
    }

    const now = Date.now();
    const layout: SavedLayout = {
      id: generateLayoutId(),
      name,
      savedAt: now,
      modifiedAt: now,
      inputs: inputPlacements.map(({ cropId, position }) => ({ cropId, position })),
      targets: targetPlacements.map(({ cropId, position }) => ({ cropId, position })),
    };
    if (!saveNamedLayout(layout)) {
      toast({
        title: "Could not save loadout",
        description: "Browser storage is full.",
        variant: "error",
        duration: 5000,
      });
      return;
    }

    setLoadoutName("");
    toast({
      title: "Loadout saved",
      description: name,
      variant: "success",
      duration: 3000,
    });
  };

  const renameSavedLoadout = (id: string, name: string) => {
    if (!renameNamedLayout(id, name)) {
      toast({
        title: "Could not rename loadout",
        description: "Use a name that is not already saved.",
        variant: "warning",
        duration: 3000,
      });
    }
  };

  const removeSavedLoadout = (id: string) => {
    const layout = savedLayouts.find((candidate) => candidate.id === id);
    if (deleteNamedLayout(id)) {
      toast({
        title: "Loadout deleted",
        description: layout?.name,
        variant: "success",
        duration: 3000,
      });
    }
  };

  const restoreRecoveryLoadout = () => {
    if (!restoreMostRecent()) return;
    setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: null }));
    setSelectedCropForPlacement(null);
    setLoadoutsOpen(false);
    toast({
      title: "Recent plot restored",
      variant: "success",
      duration: 3000,
    });
  };

  const addGoal = (choice: SearchChoice) => {
    addTarget(choice.id, choice.kind);
    showFieldForTarget(choice.id, choice.kind);
    pushRecent({
      key: goalChoiceKey(choice),
      name: choice.name,
      destination: "greenhouse",
      href: `/greenhouse#planner?target=${encodeURIComponent(choice.id)}`,
      rarity: rarityKey(choice.rarity),
      iconName: choice.name,
      ...(choice.kind === "mutation"
        ? { iconSrc: `${import.meta.env.BASE_URL}greenhouse/crops/${choice.id}.png` }
        : { iconId: choice.id }),
      hint: choice.kind === "mutation" ? "Mutation" : "Target",
      weight: 0,
      needle: choice.name.toLowerCase(),
      aliases: choice.id.toLowerCase(),
    });
    setGoalQuery("");
  };

  const selectPlant = (
    item: { id: string; name: string; size: number },
    role: "inputs" | "targets",
  ) => {
    if (plotMode !== "hybrid") return;
    const isMutation = mutationById.has(item.id);
    const alreadySelected =
      selectedCropForPlacement?.id === item.id &&
      mode === role;
    if (alreadySelected) {
      setSelectedCropForPlacement(null);
      return;
    }
    setMode(role);
    setSelectedCropForPlacement({
      id: item.id,
      name: item.name,
      size: item.size,
      isMutation,
    });
    setEditingCells(false);
  };

  const arrangePlot = useCallback(async () => {
    if (solving) {
      solveAbortRef.current?.abort();
      return;
    }
    const cells = plotCells;
    if (cells.length === 0) {
      setSolveError("Unlock at least one plot cell first.");
      return;
    }
    if (mutationNeeds.length === 0) {
      setSolveError("Add something to grow toward first.");
      return;
    }
    if (outstandingMutationNeeds.length === 0) {
      setSolveError(null);
      return;
    }

    const targets: MutationGoal[] = outstandingMutationNeeds.map((need) => ({
      mutation: need.id,
      maximize: false,
      count: need.missing,
    }));
    const controller = new AbortController();
    solveAbortRef.current = controller;
    setSolving(true);
    setSolveProgress(null);
    setSolveError(null);
    try {
      const response = await solveGreenhouseWithJob(
        { cells, targets, removeUnusedCrops: true },
        { onProgress: setSolveProgress },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const unmetTargets = unmetFiniteMutationGoals(targets, response.mutations);
      if (unmetTargets.length > 0) {
        const requestedCount = targets.reduce(
          (total, target) => total + (target.maximize ? 0 : Math.max(0, Math.trunc(target.count ?? 0))),
          0,
        );
        const missingCount = unmetTargets.reduce(
          (total, target) => total + target.requested - target.produced,
          0,
        );
        setSolveError(
          `Auto-arrange could place only ${requestedCount - missingCount} of ${requestedCount} requested mutation spots in ${cells.length} usable cells. Check the space for their inputs in Edit cells. Your current plot was left unchanged.`,
        );
        return;
      }
      const delayed = delayedGrowthEnabledRef.current
        ? buildDelayedGrowthLayout(response, targets.map((target) => target.mutation), dataset, cells, controller.signal)
        : null;
      if (controller.signal.aborted) return;
      const arranged = delayed?.displayResult ?? response;
      loadFromSolverResult(
        arranged.placements.map((placement) => ({
          id: placement.crop,
          name: getCropDef(placement.crop)?.name ?? getMutationDef(placement.crop)?.name ?? cleanName(placement.crop),
          position: placement.position,
          size: placement.size,
        })),
        arranged.mutations.map((placement) => ({
          id: placement.mutation,
          name: getMutationDef(placement.mutation)?.name ?? getCropDef(placement.mutation)?.name ?? cleanName(placement.mutation),
          position: placement.position,
          size: placement.size,
        })),
      );
      hybridDelayedChangeRef.current = delayed ? { direct: response, delayed: arranged } : null;
      setPendingHybridFieldId(null);
      setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: null }));
      setSelectedCropForPlacement(null);
      toast({
        title: "Plot arranged",
        description: `${arranged.placements.length} crops support ${arranged.mutations.length} mutation spots.`,
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === "Job cancelled")) {
        setSolveError(error instanceof Error ? error.message : "The plot could not be arranged.");
      }
    } finally {
      if (solveAbortRef.current === controller) solveAbortRef.current = null;
      setSolving(false);
      setSolveProgress(null);
    }
  }, [
    dataset,
    getCropDef,
    getMutationDef,
    plotCells,
    loadFromSolverResult,
    mutationNeeds,
    outstandingMutationNeeds,
    setSelectedCropForPlacement,
    solving,
    toast,
  ]);

  const setMutationGoalToMaximum = useCallback(async (target: PlannerTarget) => {
    if (target.kind !== "mutation" || solving || maxingTargetId) return;
    const cells = plotCells;
    if (cells.length === 0) {
      toast({
        title: "No usable plot cells",
        variant: "warning",
        duration: 3000,
      });
      return;
    }

    const controller = new AbortController();
    maxAbortRef.current = controller;
    setMaxingTargetId(target.id);
    try {
      const response = await solveGreenhouseWithJob(
        {
          cells,
          targets: [{ mutation: target.id, maximize: true, count: null }],
        },
        undefined,
        controller.signal,
      );
      const capacity = mutationCapacity(target.id, response.mutations);
      if (capacity === 0) {
        toast({
          title: `No ${targetName(target)} fits this plot`,
          variant: "warning",
          duration: 3500,
        });
        return;
      }

      setTargetQty(target.id, goalQuantityForPlotCapacity(capacity));
      toast({
        title: `${capacity.toLocaleString()} ${targetName(target)} fit`,
        description: "Measured against the currently usable cells.",
        variant: "success",
        duration: 3500,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === "Job cancelled")) {
        toast({
          title: "Could not measure this plot",
          description: error instanceof Error ? error.message : undefined,
          variant: "error",
          duration: 5000,
        });
      }
    } finally {
      if (maxAbortRef.current === controller) maxAbortRef.current = null;
      setMaxingTargetId((current) => current === target.id ? null : current);
    }
  }, [
    plotCells,
    maxingTargetId,
    setTargetQty,
    solving,
    targetName,
    toast,
  ]);

  const sharePlot = useCallback(async () => {
    if (displayAllPlacements.length === 0) return;
    try {
      const displayName = targetLabel
        ? `${targetLabel} plot`
        : mostRecentLayoutNickname({
            inputs: displayInputPlacements,
            targets: displayTargetPlacements,
          });
      const code = encodeSharedDesign(displayInputPlacements, displayTargetPlacements, displayName);
      const url = buildShareUrl(code, window.location.origin, import.meta.env.BASE_URL);
      await navigator.clipboard.writeText(url);
      toast({
        title: "Share link copied",
        description: "The whole plot is stored in the link.",
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Could not copy the plot",
        description: error instanceof Error ? error.message : "Clipboard access failed.",
        variant: "error",
        duration: 5000,
      });
    }
  }, [displayAllPlacements.length, displayInputPlacements, displayTargetPlacements, targetLabel, toast]);

  const shareSavedLoadout = useCallback(async (layout: SavedLayout, displayName: string) => {
    try {
      const code = encodeSharedDesign(layout.inputs, layout.targets, displayName);
      const url = buildShareUrl(code, window.location.origin, import.meta.env.BASE_URL);
      await navigator.clipboard.writeText(url);
      toast({
        title: "Loadout link copied",
        description: displayName,
        variant: "success",
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: "Could not copy the loadout",
        description: error instanceof Error ? error.message : "Clipboard access failed.",
        variant: "error",
        duration: 5000,
      });
    }
  }, [toast]);

  const clearPlot = () => {
    if (plotMode !== "hybrid") return;
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearAllPlacements();
    setPlotWorkspace((current) => ({ ...current, mode: "hybrid", hybridFieldId: null }));
    setSelectedCropForPlacement(null);
    setConfirmClear(false);
  };

  const boardStatus = (() => {
    if (solveError) return solveError;
    if (maxingTargetId) return "Measuring how many mutation spots fit in the usable cells…";
    if (solving) {
      if (solveProgress?.current_activity) return solveProgress.current_activity;
      return "Finding the strongest arrangement…";
    }
    if (editingCells) return "Left-drag to unlock cells. Right-drag to lock cells. Tap toggles a cell. The starter core stays unlocked.";
    if (plotMode === "locked") {
      if (activeSolved.error) return activeSolved.error;
      if (activeSolved.loading || requirementEconomy.loading.length > 0) {
        return activePlanField
          ? `Preparing the ${activePlanField.node.name} field…`
          : "Preparing the next greenhouse field…";
      }
      if (state.targets.length > 0 && outstandingMutationNeeds.length === 0) {
        return "Storage covers the greenhouse work for this target.";
      }
      if (!activePlanField || !activeDisplayResult) {
        return "Choose a target to see its first greenhouse field.";
      }
      if (activeDelayedLayout) {
        const grown = Object.entries(activeDelayedLayout.grownInPlace)
          .map(([id, count]) => `${count.toLocaleString()} ${getMutationDef(id)?.name ?? cleanName(id)}`)
          .join(", ");
        return `${grown} grow in place first; the ${activePlanField.node.name} spaces become ready on the next dependency wave.`;
      }
      return `Phase ${activePlanField.cycleIndex + 1}, field ${activePlanField.fieldIndex + 1} is ready to follow. Switch to Hybrid to adjust it.`;
    }
    if (pendingHybridFieldId) {
      return activePlanField
        ? `Loading the ${activePlanField.node.name} field into your editable greenhouse…`
        : "Loading this field into your editable greenhouse…";
    }
    if (selectedCropForPlacement) return `Placing ${selectedCropForPlacement.name}. Drag to place; right-drag to erase.`;
    if (state.targets.length > 0 && outstandingMutationNeeds.length === 0) {
      return "Storage covers the greenhouse work for this target.";
    }
    if (targetPlacements.length === 0) return "Choose a target to arrange this plot, or pick a plant to place it by hand.";
    const pieces = [`${validationSummary.ready} ready`];
    if (validationSummary.delayed) pieces.push(`${validationSummary.delayed} later`);
    if (validationSummary.missing) pieces.push(`${validationSummary.missing} missing crops`);
    return pieces.join(" · ");
  })();

  return (
    <section
      className="greenhouse-workspace"
      data-greenhouse-workspace
      data-focus-tool={focusTool}
    >
      <div className="greenhouse-workspace-grid utility-workbench">
        <aside className="greenhouse-zone greenhouse-goals utility-workbench-zone utility-rail-split" aria-labelledby="greenhouse-goal-title">
          <div className="greenhouse-target-catalogue">
          <header className="greenhouse-zone-heading">
            <h2 id="greenhouse-goal-title">{state.targets.some(target => target.kind !== "mutation") ? state.targets.length === 1 ? "Target" : "Targets" : state.targets.length === 1 ? "Target Mutation" : "Target Mutations"}</h2>
            {!targetLabel && <p>Nothing selected</p>}
          </header>

          <UtilityTargetSearch query={goalQuery} onQueryChange={setGoalQuery} expanded={goalSearchOpen} onExpandedChange={setGoalSearchOpen} placeholder="Add an item or mutation" label="Add an item or mutation target" />

          {goalSearchOpen && (
            <GoalChoiceGrid
              choices={searchChoices}
              loading={catalogueLoading}
              onSelect={addGoal}
              mutationById={mutationById}
              getCropDef={getCropDef}
              effects={effectsMap}
            />
          )}

          </div>
          <div className="greenhouse-target-list utility-target-list" tabIndex={0} role="region" aria-label="Selected targets">
            {state.targets.map((target) => {
              const name = targetName(target);
              const holding = targetHoldings.get(`${target.kind}:${target.id}`);
              const targetMutation = target.kind === "mutation" ? mutationById.get(target.id) : undefined;
              const targetItem = target.kind === "item" ? catalogueById.get(target.id) : undefined;
              const targetRarity = targetMutation?.rarity ?? targetItem?.rarity;
              const targetField = targetFieldId(target.kind, target.id, targetItem?.ingredients ?? [], dataset);
              return (
                <article
                  key={`${target.kind}:${target.id}`}
                  className={`greenhouse-target-row${String(target.qty).length > 6 ? " has-wide-quantity" : ""}${targetField !== null && activePlanField?.node.id === targetField ? " is-selected" : ""}`}
                  style={rarityStyle(targetRarity)}
                  onClickCapture={(event) => {
                    /* Capture, not bubble: the identity tooltip swallows the
                       click on the way down, so a plain onClick never sees the
                       name/icon press that should switch the field. */
                    if ((event.target as HTMLElement).closest(".greenhouse-target-controls, .greenhouse-row-remove")) return;
                    showFieldForTarget(target.id, target.kind);
                  }}
                >
                  <GreenhouseIdentityTrigger
                    id={target.id}
                    name={name}
                    kind={target.kind}
                    rarity={targetRarity}
                    hypixelId={targetItem?.hypixelId}
                    source={holding?.source}
                    mutation={targetMutation}
                    item={targetItem}
                    getCropDef={getCropDef}
                    effects={effectsMap}
                    buttonClassName="greenhouse-target-identity"
                  >
                    <TargetArtwork
                      id={target.id}
                      name={name}
                      kind={target.kind}
                      hypixelId={targetItem?.hypixelId}
                      size={34}
                    />
                    <span className="greenhouse-target-copy">
                      <strong>{name}</strong>
                      {(holding?.known || target.kind !== "mutation") && <span>
                        {target.kind !== "mutation" ? "Crafted target" : ""}
                        {holding?.known ? `${target.kind !== "mutation" ? " · " : ""}${holding.count.toLocaleString()} owned` : ""}
                      </span>}
                    </span>
                  </GreenhouseIdentityTrigger>
                  <div className="greenhouse-target-controls">
                    {target.kind === "mutation" && (
                      <button
                        type="button"
                        className="greenhouse-max-quantity"
                        onClick={() => void setMutationGoalToMaximum(target)}
                        disabled={dataLoading || solving || maxingTargetId !== null}
                        aria-label={`Set ${name} to the maximum that fits this plot`}
                      >
                        {maxingTargetId === target.id ? "…" : "Max"}
                      </button>
                    )}
                    <div
                      className="greenhouse-quantity"
                      style={{
                        "--greenhouse-quantity-digits": Math.min(16, Math.max(2, String(target.qty).length)),
                      } as React.CSSProperties}
                      aria-label={`${name} quantity`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (target.qty === 1) removeTarget(target.id);
                          else setTargetQty(target.id, target.qty - 1);
                        }}
                        aria-label={target.qty === 1 ? `Remove ${name}` : `Decrease ${name}`}
                      >
                        <Minus aria-hidden="true" />
                      </button>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={target.qty}
                        onChange={(event) => setTargetQty(target.id, Number(event.target.value) || 1)}
                        aria-label={`${name} quantity`}
                      />
                      <button type="button" onClick={() => setTargetQty(target.id, target.qty + 1)} aria-label={`Increase ${name}`}>
                        <Plus aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="greenhouse-row-remove"
                    onClick={() => removeTarget(target.id)}
                    aria-label={`Remove ${name}`}
                  >
                    <X aria-hidden="true" />
                  </button>
                </article>
              );
            })}
            {state.targets.length === 0 && (
              <p className="greenhouse-empty-copy">Search for the item you want, or start with a mutation.</p>
            )}
          </div>

          {snapshotRows.length > 0 && (
            <section className="greenhouse-progress" aria-labelledby="greenhouse-progress-title">
              <div className="greenhouse-subheading">
                <span>PROGRESS</span>
                <strong id="greenhouse-progress-title">
                  {snapshotRows.reduce((sum, row) => sum + Math.min(row.total, state.progress[row.id] ?? 0), 0)} / {snapshotRows.reduce((sum, row) => sum + row.total, 0)} plantings
                </strong>
              </div>
              {snapshotRows.map((row) => {
                const done = Math.min(row.total, state.progress[row.id] ?? 0);
                return (
                  <div key={row.id} className="greenhouse-progress-row">
                    <div>
                      <span>{row.name}</span>
                      <small>{done} / {row.total}</small>
                    </div>
                    <div className="greenhouse-progress-track">
                      <i style={{ width: `${row.total > 0 ? (done / row.total) * 100 : 0}%` }} />
                    </div>
                    <div className="greenhouse-progress-actions">
                      <button type="button" onClick={() => bumpProgress(row.id, -1, row.total)} aria-label={`Undo one ${row.name} planting`}><Minus /></button>
                      <button type="button" onClick={() => bumpProgress(row.id, 1, row.total)} aria-label={`Complete one ${row.name} planting`}><Check /></button>
                    </div>
                  </div>
                );
              })}
            </section>
          )}
        </aside>

        <main
          ref={plotSectionRef}
          className="greenhouse-zone greenhouse-plot utility-workbench-zone"
          data-plot-mode={plotMode}
          aria-labelledby="greenhouse-plot-title"
        >
          <header className="greenhouse-zone-heading greenhouse-plot-heading">
            <div>
              <span>PLOT</span>
              <h2 id="greenhouse-plot-title">Greenhouse</h2>
              <p>
                {activePlanField && (plotMode === "locked" || hybridShowsActiveField)
                  ? `${activeDelayedLayout ? "Staged field" : `Phase ${activePlanField.cycleIndex + 1} · Field ${activePlanField.fieldIndex + 1}`} · ${activePlanField.node.name} · `
                  : plotMode === "hybrid"
                    ? "Custom layout · "
                    : ""}
                {unlockedCells.size} cell{unlockedCells.size === 1 ? "" : "s"} · {displayInputPlacements.length} crop{displayInputPlacements.length === 1 ? "" : "s"} · {displayTargetPlacements.length} mutation{displayTargetPlacements.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="greenhouse-plot-primary">
              <div className="greenhouse-plot-legend" aria-label="Plot controls">
                {editingCells ? (
                  <>
                    <span><MousePointer2 aria-hidden="true" /><kbd>Left drag</kbd> unlock</span>
                    <span><Eraser aria-hidden="true" /><kbd>Right drag</kbd> lock</span>
                  </>
                ) : plotMode === "locked" ? (
                  <>
                    <span><Lock aria-hidden="true" /><kbd>Locked</kbd> planned field</span>
                    <span><MousePointer2 aria-hidden="true" /><kbd>Click crop</kbd> details</span>
                    {activeDelayedLayout && <span><TimerReset aria-hidden="true" /><kbd>Blue then gold</kbd> growth order</span>}
                  </>
                ) : selectedCropForPlacement ? (
                  <>
                    <span><MousePointer2 aria-hidden="true" /><kbd>Left drag</kbd> place</span>
                    <span><Eraser aria-hidden="true" /><kbd>Right drag</kbd> remove</span>
                  </>
                ) : (
                  <>
                    <span><MousePointer2 aria-hidden="true" /><kbd>Click</kbd> details</span>
                    <span><Move aria-hidden="true" /><kbd>Drag</kbd> move</span>
                    <span><Eraser aria-hidden="true" /><kbd>Right drag</kbd> remove</span>
                  </>
                )}
              </div>
              <SendToGameButton items={layoutItems} className="greenhouse-send-to-game" />
            </div>
          </header>

          <div className="greenhouse-plot-tools" aria-label="Plot actions">
            <div className="greenhouse-plot-mode" role="group" aria-label="Plot interaction mode">
              <UtilityInfo control title="Locked plot" info={{ summary: "Show the selected planned field without changing it." }}>
              <button
                type="button"
                className={plotMode === "locked" ? "is-active" : ""}
                onClick={() => choosePlotMode("locked")}
                aria-pressed={plotMode === "locked"}
              >
                <Lock aria-hidden="true" />
                <span>Locked</span>
              </button>
              </UtilityInfo>
              <UtilityInfo control title="Hybrid plot" info={{ summary: "Load the selected planned field and allow edits." }}>
              <button
                type="button"
                className={plotMode === "hybrid" ? "is-active" : ""}
                onClick={() => choosePlotMode("hybrid")}
                aria-pressed={plotMode === "hybrid"}
              >
                <Pencil aria-hidden="true" />
                <span>Hybrid</span>
              </button>
              </UtilityInfo>
            </div>
            <button
              type="button"
              className={solving ? "is-active" : ""}
              onClick={() => void arrangePlot()}
              disabled={dataLoading || maxingTargetId !== null || (!solving && outstandingMutationNeeds.length === 0)}
              title={solving ? "Stop arranging" : "Arrange the selected target automatically"}
            >
              {solving ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              <span>{solving ? "Stop" : "Auto-arrange"}</span>
            </button>
            <UtilityInfo control title="Delayed growth" info={{ summary: "Grow eligible mutation inputs from base crops inside the next field. The field plan shows which dependencies can grow in place." }}><button
              type="button"
              className={delayedGrowthEnabled ? "is-active" : ""}
              onClick={() => chooseDelayedGrowth(!delayedGrowthEnabled)}
              aria-pressed={delayedGrowthEnabled}
            >
              <TimerReset aria-hidden="true" />
              <span>Delayed growth</span>
            </button></UtilityInfo>
            <button
              type="button"
              className={loadoutsOpen ? "is-active" : ""}
              onClick={() => setLoadoutsOpen((open) => !open)}
              aria-haspopup="dialog"
              aria-expanded={loadoutsOpen}
              title="Open saved greenhouse loadouts"
            >
              <FolderOpen aria-hidden="true" />
              <span>Loadouts</span>
              {savedLayouts.length > 0 && <small className="greenhouse-tool-count">{savedLayouts.length}</small>}
            </button>
            <span className="greenhouse-tool-divider" />
            <button
              type="button"
              className={editingCells ? "is-active" : ""}
              onClick={() => {
                setEditingCells((value) => !value);
                setSelectedCropForPlacement(null);
              }}
              aria-pressed={editingCells}
              title={cellSource === "hypixel"
                ? editingCells ? "Return to the greenhouse plot" : "Edit usable cells from your Hypixel greenhouse"
                : editingCells ? "Finish choosing usable cells" : "Choose usable cells"}
            >
              {editingCells ? <Check /> : <SlidersHorizontal />}
              <span>{editingCells ? "Done" : "Edit cells"}</span>
            </button>
            <span className="greenhouse-tool-divider" />
            <button type="button" onClick={undo} disabled={(plotMode === "locked" && !editingCells) || !canUndo} title="Undo (Ctrl+Z)"><Undo2 /><span>Undo</span></button>
            <button type="button" onClick={redo} disabled={(plotMode === "locked" && !editingCells) || !canRedo} title="Redo (Ctrl+Y or Ctrl+Shift+Z)"><Redo2 /><span>Redo</span></button>
            <button
              type="button"
              onClick={() => setShowTargets((value) => !value)}
              disabled={plotMode === "locked" || editingCells}
              title={showTargets ? "Hide mutation plants" : "Show mutation plants"}
            >
              {showTargets ? <EyeOff /> : <Eye />}
              <span>{showTargets ? "Hide mutations" : "Show mutations"}</span>
            </button>
            <button type="button" onClick={restoreRecoveryLoadout} disabled={plotMode === "locked" || !mostRecentLayout || editingCells} title="Restore the last complete layout"><RotateCcw /><span>Restore</span></button>
            <button type="button" onClick={() => void sharePlot()} disabled={displayAllPlacements.length === 0 || editingCells} title="Copy a share link"><Share2 /><span>Share</span></button>
            <button
              type="button"
              className={confirmClear ? "is-danger" : ""}
              onClick={clearPlot}
              disabled={plotMode === "locked" || allPlacements.length === 0 || editingCells}
              title={confirmClear ? "Click again to clear the plot" : "Clear plot"}
            >
              <Trash2 />
              <span>{confirmClear ? "Clear now" : "Clear"}</span>
            </button>

          </div>

          <div className="greenhouse-plot-scroll utility-scroll" tabIndex={0} role="region" aria-label="Greenhouse plot and current plants">
          <div className="greenhouse-plot-measure" ref={boardMeasureRef}>
            <div className="greenhouse-plot-canvas">
              {editingCells ? (
                <PlotCellEditor
                  cellSize={gridMetrics.cellSize}
                  gap={gridMetrics.gap}
                  occupiedCells={occupiedCells}
                >
                  {plotMode === "locked" ? (
                    visibleDisplayResult && (
                      <DesignerGrid
                        cellSize={gridMetrics.cellSize}
                        gap={gridMetrics.gap}
                        showTargets
                        showStatus={false}
                        readOnly
                        inputPlacementsOverride={plannedInputPlacements}
                        targetPlacementsOverride={plannedTargetPlacements}
                        showLockedCells
                      />
                    )
                  ) : (
                    <DesignerGrid
                      cellSize={gridMetrics.cellSize}
                      gap={gridMetrics.gap}
                      showTargets={showTargets}
                      showStatus={false}
                      readOnly
                      showLockedCells
                    />
                  )}
                </PlotCellEditor>
              ) : plotMode === "locked" ? (
                activeDisplayResult ? (
                  <DesignerGrid
                    cellSize={gridMetrics.cellSize}
                    gap={gridMetrics.gap}
                    showTargets
                    showStatus={false}
                    readOnly
                    inputPlacementsOverride={plannedInputPlacements}
                    targetPlacementsOverride={plannedTargetPlacements}
                    showLockedCells={unlockedCells.size === 0}
                  />
                ) : (
                  <div className={`greenhouse-plot-placeholder${activeSolved.error ? " is-error" : ""}`}>
                    <Sprout aria-hidden="true" />
                    <strong>
                      {activeSolved.error
                        ? "This field is unavailable"
                        : activePlanField
                          ? `Preparing ${activePlanField.node.name}`
                          : "Choose a target mutation"}
                    </strong>
                    <small>{activeSolved.error ?? "The planned field will appear here."}</small>
                  </div>
                )
              ) : (
                <DesignerGrid
                  cellSize={gridMetrics.cellSize}
                  gap={gridMetrics.gap}
                  showTargets={showTargets}
                  showStatus={false}
                  showLockedCells={unlockedCells.size === 0}
                />
              )}
            </div>
          </div>
          <p className={`greenhouse-plot-status${solveError ? " is-error" : ""}`} role="status" aria-live="polite">
            {boardStatus}
          </p>

          <GreenhousePlotBrief
            inputPlacements={displayInputPlacements}
            targetPlacements={displayTargetPlacements}
            plan={plan}
            estimates={planEstimates}
            targetLabel={targetLabel}
            measuring={requirementEconomy.loading.length > 0}
            dataset={dataset}
            onOpenItem={openInfo}
          />
          </div>
        </main>

        <aside className="greenhouse-support utility-workbench-zone utility-rail-split utility-support-rail" aria-label="Greenhouse requirements and plants">
          <section className="greenhouse-zone greenhouse-requirements" aria-labelledby="greenhouse-needs-title">
            <header className="greenhouse-zone-heading">
              <span>NEEDS</span>
              <h2 id="greenhouse-needs-title">Mutation requirements</h2>
              <p>
                {state.targets.length === 0
                  ? "Add a target to see the mutations it requires"
                  : mutationNeeds.length === 0
                    ? "This target has no mutation requirements"
                    : outstandingMutationNeeds.length === 0
                      ? "You already have every required mutation"
                      : `${outstandingMutationNeeds.length} of ${mutationNeeds.length} mutation${mutationNeeds.length === 1 ? " needs" : "s need"} growing`}
              </p>
            </header>
            <div className="greenhouse-need-list utility-scroll">
              {mutationNeeds.map((need) => {
                const definition = mutationById.get(need.id);
                const rarity = definition?.rarity ?? itemIndex[need.id]?.tier ?? null;
                return (
                  <article
                    key={need.id}
                    className={need.missing === 0 ? "greenhouse-need-row is-covered" : "greenhouse-need-row is-missing"}
                    style={rarityStyle(rarity)}
                  >
                    <GreenhouseIdentityTrigger
                      id={need.id}
                      name={need.name}
                      kind="mutation"
                      rarity={rarity}
                      hypixelId={bridgeIndex[need.id]?.hypixelId}
                      source={need.source}
                      mutation={definition}
                      getCropDef={getCropDef}
                      effects={effectsMap}
                      buttonClassName="greenhouse-need-identity"
                    >
                      <CropImage cropId={need.id} cropName={need.name} width={34} height={34} showFallback />
                      <span className="greenhouse-need-copy">
                        <strong>{need.name}</strong>
                        <span className="greenhouse-need-counts">
                          {!directGoalMutations.has(need.id) && <em className="is-needed"><Target aria-hidden="true" />Need {need.units.toLocaleString()}</em>}
                          <em className={need.owned === undefined ? "is-storage is-unknown" : "is-storage"}>
                            <PackageOpen aria-hidden="true" />
                             {need.owned === undefined ? "Not found in captured storage" : `Owned ${need.owned.toLocaleString()}`}
                          </em>
                          <b className={need.missing === 0 ? "is-covered" : "is-missing"}>
                            {need.missing === 0 ? <CheckCircle2 aria-hidden="true" /> : directGoalMutations.has(need.id) ? <Target aria-hidden="true" /> : <TriangleAlert aria-hidden="true" />}
                            {need.missing === 0 ? "Have it" : directGoalMutations.has(need.id) ? `${need.missing.toLocaleString()} to grow` : `${need.missing.toLocaleString()} still needed`}
                          </b>
                        </span>
                      </span>
                    </GreenhouseIdentityTrigger>
                    {need.missing > 0 && (
                      <button
                        type="button"
                        className="greenhouse-need-detail"
                        onClick={() => openRequirementDetail(need.id)}
                        aria-label={`Open the growing plan for ${need.name}`}
                        title={`Open the growing plan for ${need.name}`}
                      >
                        <ChevronRight aria-hidden="true" />
                      </button>
                    )}
                  </article>
                );
              })}
              {mutationNeeds.length === 0 && (
                <p className="greenhouse-empty-copy">
                  {state.targets.length
                    ? "Nothing else needs growing for the selected quantity."
                    : "The mutations required by the target will stay here beside the plot."}
                </p>
              )}
            </div>
          </section>

          <section
            className={`greenhouse-zone greenhouse-plant-tray${plotMode === "locked" ? " is-locked" : ""}`}
            aria-labelledby="greenhouse-plants-title"
            aria-disabled={plotMode === "locked"}
          >
            <header className="greenhouse-zone-heading">
              <span>PLANTS</span>
              <h2 id="greenhouse-plants-title">Place by hand</h2>
              <p>
                {plotMode === "locked"
                  ? "Switch to Hybrid to adjust the selected field"
                  : selectedCropForPlacement
                  ? `${selectedCropForPlacement.name} selected as ${mode === "targets" ? "a target" : "an input"}`
                  : mode === "targets"
                    ? "Choose the mutation you want to grow"
                    : "Choose the crops or mutations it needs"}
              </p>
            </header>
            <div className="greenhouse-plant-role" role="tablist" aria-label="Place by hand section">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "inputs"}
                className={mode === "inputs" ? "is-active" : ""}
                disabled={plotMode === "locked"}
                onClick={() => {
                  setMode("inputs");
                  setSelectedCropForPlacement(null);
                }}
              >
                Input <small>{crops.length}</small>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "targets"}
                className={mode === "targets" ? "is-active" : ""}
                disabled={plotMode === "locked"}
                onClick={() => {
                  setMode("targets");
                  setSelectedCropForPlacement(null);
                }}
              >
                Target <small>{mutations.length}</small>
              </button>
            </div>
            <label className="greenhouse-plant-search">
              <Search aria-hidden="true" />
              <input
                value={plantQuery}
                onChange={(event) => setPlantQuery(event.target.value)}
                placeholder={mode === "targets" ? "Find a target mutation" : "Find an input"}
                disabled={plotMode === "locked"}
              />
              {plantQuery && <button type="button" onClick={() => setPlantQuery("")} aria-label="Clear plant search"><X /></button>}
            </label>
            <div className="greenhouse-plant-list utility-scroll">
              {plantChoices.map((plant) => {
                const mutation = mutationById.get(plant.id);
                const selected = selectedCropForPlacement?.id === plant.id;
                return (
                  <button
                    key={`${mode}:${plant.id}`}
                    type="button"
                    className={selected ? "is-selected" : ""}
                    style={rarityStyle(mutation?.rarity ?? itemIndex[plant.id]?.tier)}
                    onClick={() => selectPlant(plant, mode)}
                    disabled={plotMode === "locked"}
                  >
                    <CropImage cropId={plant.id} cropName={plant.name} width={28} height={28} showFallback />
                    <span>{plant.name}</span>
                    <small>{plant.size}×{plant.size}</small>
                  </button>
                );
              })}
              {!dataLoading && plantChoices.length === 0 && (
                <span className="greenhouse-empty-line">No matching plant</span>
              )}
            </div>
          </section>
        </aside>
      </div>

      <GreenhousePlanBreakdown
        plan={plan}
        estimates={planEstimates}
        targetLabel={targetLabel}
        measuring={requirementEconomy.loading.length > 0}
        dataset={dataset}
        sizing={planSizing}
        growth={resolvedGrowth}
        growthSpeedSource={apiGreenhouseStats?.growthSpeedTier?.source}
        cells={plotCells}
        onOpenItem={openInfo}
        activeFieldId={activePlanField?.node.id}
        onSelectField={selectPlannedField}
        onActivateField={activatePlannedField}
        rootTargetIds={planTargetIds}
        delayedGrowthEnabled={delayedGrowthEnabled}
      />

      <LoadLayoutModal
        isOpen={loadoutsOpen}
        onClose={() => setLoadoutsOpen(false)}
        onLoad={loadSavedLoadout}
        onLoadMostRecent={restoreRecoveryLoadout}
        onDelete={removeSavedLoadout}
        onRename={renameSavedLoadout}
        onShare={(layout, displayName) => void shareSavedLoadout(layout, displayName)}
        layouts={savedLayouts}
        mostRecentLayout={mostRecentLayout}
        title="Greenhouse loadouts"
        saveCurrent={{
          name: loadoutName,
          onNameChange: setLoadoutName,
          onSubmit: saveCurrentLoadout,
          disabled: plotMode === "locked" || !loadoutName.trim() || allPlacements.length === 0,
          summary: plotMode === "locked"
            ? "Switch to Hybrid to save an edited loadout."
            : allPlacements.length === 0
            ? "Place or arrange something before saving."
            : `${inputPlacements.length} crops · ${targetPlacements.length} mutations`,
        }}
      />

      {focusedRequirement && (
        <section
          ref={requirementDetailRef}
          className="greenhouse-requirement-detail"
          aria-labelledby="greenhouse-requirement-detail-title"
        >
          <header className="greenhouse-requirement-detail-heading">
            <div>
              <span>GROWING PLAN</span>
              <h2 id="greenhouse-requirement-detail-title">How to get {focusedRequirement.name}</h2>
              <p>
                {focusedRequirement.missing.toLocaleString()} {directGoalMutations.has(focusedRequirement.id) ? "to grow" : "still needed after captured storage"}
                {requirementEconomy.loading.length > 0
                  ? ` · measuring ${requirementEconomy.progress.done} / ${requirementEconomy.progress.total}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFocusedRequirementId(null)}
              aria-label="Close the growing plan"
              title="Close the growing plan"
            >
              <X aria-hidden="true" />
            </button>
          </header>

          {requirementEconomy.error ? (
            <p className="greenhouse-empty-copy">The growing plan could not be measured right now.</p>
          ) : (
            <div className="greenhouse-requirement-detail-groups">
              {focusedRequirementGroups.map((group) => (
                <section className="greenhouse-requirement-detail-group" key={group.key} aria-label={group.label}>
                  <header>
                    <h3>{group.label}</h3>
                    <span>{group.rows.length} row{group.rows.length === 1 ? "" : "s"}</span>
                  </header>
                  {group.rows.map((need) => {
                    const definition = mutationById.get(need.id);
                    const holding = holdingsFor(need.id);
                    const rarity = definition?.rarity ?? itemIndex[need.id]?.tier ?? null;
                    const requested = need.rawNeed ?? need.need;
                    return (
                      <article
                        key={`${group.key}:${need.id}`}
                        className={need.need === 0 ? "greenhouse-detail-row is-covered" : "greenhouse-detail-row"}
                        style={rarityStyle(rarity)}
                      >
                        <GreenhouseIdentityTrigger
                          id={need.id}
                          name={need.name}
                          kind={definition ? "mutation" : "crop"}
                          rarity={rarity}
                          hypixelId={bridgeIndex[need.id]?.hypixelId}
                          source={holding.source}
                          mutation={definition}
                          getCropDef={getCropDef}
                          effects={effectsMap}
                          buttonClassName="greenhouse-detail-identity"
                        >
                          <CropImage cropId={need.id} cropName={need.name} width={36} height={36} showFallback />
                          <span className="greenhouse-detail-copy">
                            <strong>{need.name}</strong>
                            <span>
                              Need {requested.toLocaleString()} · {holding.known ? `${need.have.toLocaleString()} owned` : "not found in captured storage"}
                            </span>
                            <small>
                              {need.need === 0
                                ? "Covered by captured storage"
                                : need.kind === "crop"
                                  ? `Gather ${need.need.toLocaleString()}`
                                  : need.plots !== undefined
                                  ? `${need.plots.toLocaleString()} direct planting${need.plots === 1 ? "" : "s"}`
                                  : "Planting count is still being measured"}
                            </small>
                          </span>
                        </GreenhouseIdentityTrigger>
                      </article>
                    );
                  })}
                </section>
              ))}
              {focusedRequirementGroups.length === 0 && (
                <p className="greenhouse-empty-copy">
                  {requirementEconomy.loading.length > 0
                    ? "Building the crop and mutation cycles…"
                    : "Captured storage already covers this requirement."}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {(dataError || catalogueError) && (
        <p className="greenhouse-data-note" role="status">
          {dataError ?? "Some item targets are unavailable; mutation targets still work."}
        </p>
      )}

    </section>
  );
};

export default GreenhouseWorkspace;
