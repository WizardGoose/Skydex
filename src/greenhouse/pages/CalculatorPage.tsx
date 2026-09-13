import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Grid3x3, Sprout, Menu, X } from "lucide-react";
import { PageHeader, PANEL, BTN_QUIET } from "../../ui/kit";
import { useGridState, useGreenhouseData, useLockedPlacements } from "../context";
import { GridManagerModal, FirstTimeVisitorModal } from "../components";
import { MutationTargets, SolverResults, CropConfigurationsPanel, SendToGameButton } from "../components";
import { solveGreenhouseWithJob } from "../services";
import { LocalStorageManager } from "../utilities";
import type { SolveResponse, MutationGoal, JobProgress } from "../types/greenhouse";
import type { LayoutItem } from "../../island/layout";
import { ManagedInventoryPanel } from "../../components/common/ManagedInventoryPanel";
import { greenhouseHoldingsItems } from "../../inventory";
import { GreenhouseCapabilityFrame } from "../GreenhouseCapabilityFrame";

export const CalculatorPage: React.FC<{ embedded?: boolean; showFirstTimeModal?: boolean }> = ({ embedded = false, showFirstTimeModal = true }) => {
  const { getUnlockedCellsArray, unlockedCells } = useGridState();
  const { selectedMutations, crops, mutations, isLoading: dataLoading, getCropDef, getMutationDef } = useGreenhouseData();
  const { getLocksForAPI, priorities, lockedPlacements } = useLockedPlacements();
  const holdingsItems = useMemo(() => greenhouseHoldingsItems(crops, mutations), [crops, mutations]);

  // Modal state
  const [isGridModalOpen, setIsGridModalOpen] = useState(false);
  const [isFirstTimeModalOpen, setIsFirstTimeModalOpen] = useState(false);

  // Narrow viewports collapse the rail behind one button, same as every split page.
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Check if user is a first-time visitor
  useEffect(() => {
    if (!showFirstTimeModal) return;
    // Small delay to ensure contexts have initialized
    const timer = setTimeout(() => {
      // Check if the user has actually customized anything
      const gridConfig = LocalStorageManager.loadGridConfig();
      const mutationTargets = LocalStorageManager.loadMutationTargets();
      const designerInputs = LocalStorageManager.loadDesignerInputs();
      const designerTargets = LocalStorageManager.loadDesignerTargets();
      const lockedPlacements = LocalStorageManager.loadLockedPlacements();
      const priorities = LocalStorageManager.loadPriorities();
      const hasVisited = localStorage.getItem("skyshards-has-visited");
      
      // Check if grid config is the default (12 cells in a 4x4 diamond pattern)
      const isDefaultGrid = gridConfig && gridConfig.size === 12;
      
      // Check if there's any actual user data (non-empty, non-default)
      const hasUserData = 
        (!isDefaultGrid && gridConfig && gridConfig.size > 0) || // Non-default grid
        (mutationTargets && mutationTargets.length > 0) || // Has mutation targets
        (designerInputs && designerInputs.length > 0) || // Has designer inputs
        (designerTargets && designerTargets.length > 0) || // Has designer targets
        (lockedPlacements && lockedPlacements.length > 0) || // Has locked placements
        (priorities && Object.keys(priorities).length > 0); // Has custom priorities
      
      // If no user data AND hasn't visited before, show the first-time modal
      if (!hasUserData && !hasVisited) {
        setIsFirstTimeModalOpen(true);
      }
      
      // Mark as visited
      try {
        localStorage.setItem("skyshards-has-visited", "true");
      } catch {
        // Only drives whether the first-time modal appears again. Losing it
        // shows a returning visitor one extra welcome, which is survivable.
      }
    }, 100); // Small delay to let contexts initialize
    
    return () => clearTimeout(timer);
  }, [showFirstTimeModal]);

  // Solver state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SolveResponse | null>(null);
  
  // Job progress state
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [previewResult, setPreviewResult] = useState<SolveResponse | null>(null);
  
  // Abort controller for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleSolve = useCallback(async () => {
    const cells = getUnlockedCellsArray();

    if (cells.length === 0) {
      setError("No cells are unlocked. Go to the Grid tab to configure your greenhouse.");
      return;
    }

    if (selectedMutations.length === 0) {
      setError("No mutation targets selected. Add at least one target to optimize for.");
      return;
    }

    // Reset state
    setIsLoading(true);
    setError(null);
    setResult(null);
    setProgress(null);
    setQueuePosition(null);
    setPreviewResult(null);

    // Create abort controller for this solve
    abortControllerRef.current = new AbortController();

    try {
      // Convert selected mutations to API format
      const targets: MutationGoal[] = selectedMutations.map((m) => ({
        mutation: m.id,
        maximize: m.mode === "maximize",
        count: m.mode === "target" ? m.targetCount : null,
      }));

      const response = await solveGreenhouseWithJob(
        { 
          cells, 
          targets,
          priorities: Object.keys(priorities).length > 0 ? priorities : undefined,
          locks: getLocksForAPI().length > 0 ? getLocksForAPI() : undefined,
        },
        {
          onProgress: (p) => {
            setProgress(p);
            setQueuePosition(null);
          },
          onQueuePosition: (pos) => {
            setQueuePosition(pos);
            setProgress(null);
          },
          onPreviewUpdate: (preview) => {
            setPreviewResult(preview);
          },
        },
        abortControllerRef.current.signal
      );

      setResult(response);
      setPreviewResult(null);
    } catch (err) {
      if (err instanceof Error && err.message === "Job cancelled") {
        // If we have a preview result, show it as the final result
        if (previewResult) {
          setResult({ ...previewResult, status: "CANCELLED" });
        }
      } else {
        setError(err instanceof Error ? err.message : "Failed to solve");
        setResult(null);
      }
    } finally {
      setIsLoading(false);
      setProgress(null);
      setQueuePosition(null);
      abortControllerRef.current = null;
    }
    // `uniqueCrops` is deliberately not a dependency: it is a growth-rate
    // setting and has never changed a layout, so re-solving when it moves only
    // threw away a good answer and asked for another one.
  }, [getUnlockedCellsArray, selectedMutations, previewResult, priorities, getLocksForAPI]);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);
  
  const handleClearResults = useCallback(() => {
    setResult(null);
    setPreviewResult(null);
    setError(null);
    setProgress(null);
    setQueuePosition(null);
  }, []);

  const unlockedCount = unlockedCells.size;

  const solverHeading = (
    <PageHeader title="Solver" sub="Optimal plot layout for the mutations you pick" icon={Sprout} />
  );

  // Determine what to show in the results area
  const displayResult = result || previewResult;

  /**
   * The solved plot as the mod wants to hear about it.
   *
   * Built from exactly what the results panel draws - the solution being shown,
   * preview included, plus whatever is pinned on the grid - so the ghost overlay
   * in game and the picture on screen can never disagree. Locked placements are
   * listed after the solver's crops so they win a contested cell, which is the
   * precedence the rest of this page already uses.
   */
  const layoutItems = useMemo((): LayoutItem[] => {
    const nameOf = (id: string) =>
      getCropDef(id)?.name || getMutationDef(id)?.name || id.replace(/_/g, " ");
    const groundOf = (id: string) => getCropDef(id)?.ground ?? getMutationDef(id)?.ground ?? null;

    const items: LayoutItem[] = (displayResult?.placements || []).map((p) => ({
      position: p.position,
      size: p.size,
      name: nameOf(p.crop),
      isMutation: false,
      ground: groundOf(p.crop),
    }));

    for (const placement of lockedPlacements) {
      items.push({
        position: placement.position,
        size: placement.size,
        name: nameOf(placement.crop),
        isMutation: false,
        // A locked placement carries the ground it was pinned with.
        ground: placement.ground ?? groundOf(placement.crop),
      });
    }

    for (const mutation of displayResult?.mutations || []) {
      items.push({
        position: mutation.position,
        size: mutation.size,
        name: getMutationDef(mutation.mutation)?.name || nameOf(mutation.mutation),
        isMutation: true,
        ground: getMutationDef(mutation.mutation)?.ground ?? groundOf(mutation.mutation),
      });
    }

    return items;
  }, [displayResult, lockedPlacements, getCropDef, getMutationDef]);

  return (
    <>
      {/* The signature split: configuration in the rail under the logo,
          results under the tabs. Same furniture positions as every page. */}
      <GreenhouseCapabilityFrame
        embedded={embedded}
        variant="band"
        railLabel="Solver configuration"
        leading={solverHeading}
        rail={
          <>
            {/* Narrow viewports collapse the rail behind one button. */}
            <div className="min-[900px]:hidden">
              <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`${BTN_QUIET} w-full justify-center`}>
                {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span>{sidebarOpen ? "Hide" : "Show"} Configuration</span>
              </button>
            </div>

            <div className={`${sidebarOpen ? "block" : "hidden min-[900px]:block"} space-y-4`}>
              {!embedded && <ManagedInventoryPanel items={holdingsItems} defaultOpen={false} />}
            {/* The bespoke panel string was PANEL by hand; use the real one. */}
            <div className={`${PANEL} p-3 sm:p-4`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-medium text-slate-200">Grid Configuration</h3>
                <span className="text-xs text-slate-400">
                  {unlockedCount} cells unlocked
                </span>
              </div>
              <button
                onClick={() => setIsGridModalOpen(true)}
                className={`${BTN_QUIET} w-full justify-center py-2 hover:border-emerald-500/50 hover:text-emerald-300`}
              >
                <Grid3x3 className="w-4 h-4" />
                <span>Configure Grid</span>
              </button>
              <p className="text-xs text-slate-500 mt-2 text-center">
                <span className="hidden sm:inline">Click to manage unlocked cells</span>
                <span className="sm:hidden">Tap to manage unlocked cells</span>
              </p>
            </div>

            {/* Mutation Targets */}
            <MutationTargets />

            {/* Solve Button */}
            <button
              onClick={isLoading ? handleCancel : handleSolve}
              disabled={dataLoading}
              /*
               * Translucent fills like the kit BTN_PRIMARY, not the old solid
               * slabs (the kit's shards-scale rule). Kept bespoke because the
               * stop state swaps the whole ramp to red, which no kit primitive
               * carries, and red staying red for destructive is a kit rule.
               */
              className={`w-full px-4 py-2.5 font-medium rounded-md text-[12px] border flex items-center justify-center gap-2 cursor-pointer transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
                isLoading
                  ? "bg-red-500/15 hover:bg-red-500/25 text-red-200 border-red-500/45 hover:border-red-400/60"
                  : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/45 hover:border-emerald-400/60"
              }`}
            >
              {isLoading ? (
                <>
                  <span>Stop Solving</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Solve</span>
                </>
              )}
            </button>

            {/* Push the solved plot to the mod as an in-game ghost overlay.
                Only appears when the localhost server actually answers. */}
            <SendToGameButton items={layoutItems} />

            {/* Crop priorities and locked placements. Bounded so the panel's
                own list keeps its internal scroll inside the rail rather than
                stretching the rail to the full list length. */}
            <div className="h-[500px]">
              <CropConfigurationsPanel />
            </div>
            </div>
          </>
        }
      >
        <SolverResults
          result={displayResult}
          error={error}
          isLoading={false}
          progress={progress}
          queuePosition={queuePosition}
          onClear={handleClearResults}
        />
      </GreenhouseCapabilityFrame>

      {/* Grid Manager Modal */}
      <GridManagerModal 
        isOpen={isGridModalOpen} 
        onClose={() => setIsGridModalOpen(false)} 
      />

      {/* First Time Visitor Modal */}
      <FirstTimeVisitorModal
        isOpen={showFirstTimeModal && isFirstTimeModalOpen}
        onClose={() => setIsFirstTimeModalOpen(false)}
        onConfigureGrid={() => setIsGridModalOpen(true)}
      />
    </>
  );
};
