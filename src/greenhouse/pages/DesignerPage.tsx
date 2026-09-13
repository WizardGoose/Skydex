import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, Menu, X } from "lucide-react";
import { PageHeader, PANEL, TILE, LABEL, BTN_QUIET } from "../../ui/kit";
import { Grid3x3 as DesignerIcon } from "lucide-react";
import { 
  CropSelectionPalette, 
  DesignerActions, 
  DesignerGrid,
  MutationValidator,
} from "../components";
import { CropImage } from "../components/shared";
import { useToast } from "../components/ui/toastContext";
import { useDesigner, useGreenhouseData } from "../context";
import { decodeDesign, getRarityTextColor } from "../utilities";
import { nextDesignerLayoutCode } from "../designerRoute";
import type { DesignerGridHandle } from "../components";
import { ManagedInventoryPanel } from "../../components/common/ManagedInventoryPanel";
import { greenhouseHoldingsItems } from "../../inventory";
import { GreenhouseCapabilityFrame } from "../GreenhouseCapabilityFrame";

export const DesignerPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const [showTargets, setShowTargets] = useState(true);
  // Narrow viewports collapse the rail behind one button, same as every split page.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const gridRef = useRef<DesignerGridHandle>(null);
  const location = useLocation();
  const { toast } = useToast();
  const { inputPlacements, targetPlacements, loadFromSolverResult } = useDesigner();
  const { crops, mutations, getCropDef, getMutationDef, isLoading: isDataLoading } = useGreenhouseData();
  const holdingsItems = React.useMemo(() => greenhouseHoldingsItems(crops, mutations), [crops, mutations]);
  const lastLoadedLayoutCodeRef = useRef<string | null>(null);
  
  // Responsive grid sizing
  const [gridSize, setGridSize] = useState(() => {
    const width = window.innerWidth;
    if (width < 640) return { cellSize: 32, gap: 1 };
    if (width < 1024) return { cellSize: 40, gap: 2 };
    return { cellSize: 48, gap: 2 };
  });
  
  // Get crop counts for display
  const inputCropCounts = React.useMemo(() => {
    const counts = new Map<string, { name: string; rarity: string; count: number }>();
    for (const p of inputPlacements) {
      const existing = counts.get(p.cropId);
      if (existing) {
        existing.count++;
      } else {
        const mutationDef = getMutationDef(p.cropId);
        counts.set(p.cropId, { 
          name: p.cropName, 
          rarity: mutationDef?.rarity || "common",
          count: 1 
        });
      }
    }
    return Array.from(counts.entries()).map(([cropId, data]) => ({ cropId, ...data }));
  }, [inputPlacements, getMutationDef]);
  
  const targetCropCounts = React.useMemo(() => {
    const counts = new Map<string, { name: string; rarity: string; count: number }>();
    for (const p of targetPlacements) {
      const existing = counts.get(p.cropId);
      if (existing) {
        existing.count++;
      } else {
        const mutationDef = getMutationDef(p.cropId);
        counts.set(p.cropId, { 
          name: p.cropName, 
          rarity: mutationDef?.rarity || "common",
          count: 1 
        });
      }
    }
    return Array.from(counts.entries()).map(([cropId, data]) => ({ cropId, ...data }));
  }, [targetPlacements, getMutationDef]);
  
  const totalInputCells = React.useMemo(() => {
    return inputPlacements.reduce((sum, p) => sum + (p.size * p.size), 0);
  }, [inputPlacements]);
  
  const totalTargetCells = React.useMemo(() => {
    return targetPlacements.reduce((sum, p) => sum + (p.size * p.size), 0);
  }, [targetPlacements]);
  
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 640) setGridSize({ cellSize: 32, gap: 1 });
      else if (width < 1024) setGridSize({ cellSize: 40, gap: 2 });
      else setGridSize({ cellSize: 48, gap: 2 });
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  /*
   * This page used to hang three helpers off `window` (`exportGrid`,
   * `loadLayoutFromCode` and a `layoutLoadState` flag) so a Playwright bot on
   * api.skyshards.com could open a share link, screenshot the grid, and serve
   * the result as a Discord preview image. That server is not ours and the
   * share flow no longer talks to it, so the bridges are gone along with the
   * preview image they fed. Nothing in this repo ever called them.
   */

  // Load a layout from an encoded string
  const loadLayoutFromCode = useCallback((layoutCode: string) => {
    // Decode failures carry their own player-readable message from
    // designEncoding, so they travel up to the caller untouched.
    const { inputs, targets } = decodeDesign(layoutCode);

    // Convert to the format expected by loadFromSolverResult
    const crops = inputs.map(p => {
      const cropDef = getCropDef(p.cropId);
      const mutationDef = getMutationDef(p.cropId);
      const displayName = cropDef?.name || mutationDef?.name || p.cropId.replace(/_/g, " ");
      return {
        id: p.cropId,
        name: displayName,
        position: p.position,
        size: cropDef?.size || mutationDef?.size || 1,
      };
    });

    const mutations = targets.map(p => {
      const mutationDef = getMutationDef(p.cropId);
      const cropDef = getCropDef(p.cropId);
      const displayName = mutationDef?.name || cropDef?.name || p.cropId.replace(/_/g, " ");
      return {
        id: p.cropId,
        name: displayName,
        position: p.position,
        size: mutationDef?.size || cropDef?.size || 1,
      };
    });

    loadFromSolverResult(crops, mutations);

    return { inputs: crops, targets: mutations };
  }, [getCropDef, getMutationDef, loadFromSolverResult]);

  // Auto-load layout from URL parameter
  useEffect(() => {
    if (isDataLoading) return;
    
    try {
      const layoutCode = nextDesignerLayoutCode(
        lastLoadedLayoutCodeRef.current,
        location.hash,
        location.search,
      );
      if (!layoutCode) return;

      lastLoadedLayoutCodeRef.current = layoutCode;
      const { inputs, targets } = loadLayoutFromCode(layoutCode);
      toast({
        title: "Layout loaded",
        description: `Loaded ${inputs.length} inputs and ${targets.length} targets from shared link`,
        variant: "success",
        duration: 3000,
      });
    } catch (err) {
      toast({
        title: "Failed to load layout",
        description: err instanceof Error ? err.message : "Invalid layout code in URL",
        variant: "error",
        duration: 5000,
      });
    }
  }, [location.hash, location.search, isDataLoading, loadLayoutFromCode, toast]);

  const designerHeading = (
    <PageHeader title="Designer" sub="Lay out a plot by hand and validate the mutations" icon={DesignerIcon} />
  );

  return (
    /* The signature split: tools in the rail under the logo, the plot canvas
       under the tabs. Same furniture positions as every page. */
    <GreenhouseCapabilityFrame
      embedded={embedded}
      variant="band"
      railLabel="Designer tools"
      leading={designerHeading}
      rail={
        <>
          {/* Narrow viewports collapse the rail behind one button. */}
          <div className="min-[900px]:hidden">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`${BTN_QUIET} w-full justify-center`}>
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>{sidebarOpen ? "Hide" : "Show"} Tools</span>
            </button>
          </div>

          <div className={`${sidebarOpen ? "block" : "hidden min-[900px]:block"} space-y-4`}>
            {!embedded && <ManagedInventoryPanel items={holdingsItems} defaultOpen={false} />}
            <div className={`${PANEL} p-3 sm:p-4`}>
              <DesignerActions gridRef={gridRef} showTargets={showTargets} />
            </div>

            {/* Mutation Validator */}
            <div className={`${PANEL} p-3 sm:p-4`}>
              <h3 className="text-[13px] font-medium text-slate-200 mb-3">Mutation Status</h3>
              <MutationValidator />
            </div>

            {/* Crop palette, from the old third column. Bounded so its tile
                grid keeps its internal scroll inside the rail rather than
                stretching the rail to the full catalogue length. */}
            <div className={`${PANEL} p-3 sm:p-4 h-[500px]`}>
              <CropSelectionPalette className="h-full" />
            </div>
          </div>
        </>
      }
    >
      <div className={`${PANEL} p-3 sm:p-4 w-full`}>
            <div className="flex flex-col sm:flex-row items-center justify-between mb-4 gap-2">
              <h3 className="text-[13px] font-medium text-slate-200">Greenhouse Designer</h3>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setShowTargets(!showTargets)}
                  className={BTN_QUIET}
                  title={showTargets ? "Hide target mutations" : "Show target mutations"}
                >
                  {showTargets ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Hide Targets</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Show Targets</span>
                    </>
                  )}
                </button>
                <div className="flex gap-2 sm:gap-4 text-xs text-slate-400">
                </div>
              </div>
            </div>
            
            {/* Grid Layout */}
            <div className="mb-4">
              <h4 className={`${LABEL} mb-2`}>
                Grid Layout
              </h4>
              <div className="w-full">
                <div className="overflow-x-auto">
                  <div className="flex flex-col items-center min-w-full">
                    <DesignerGrid 
                      ref={gridRef} 
                      showTargets={showTargets}
                      cellSize={gridSize.cellSize}
                      gap={gridSize.gap}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Crop Counts Display */}
            {(targetCropCounts.length > 0 || inputCropCounts.length > 0) && (
              <>
                {/* Target Mutations */}
                {targetCropCounts.length > 0 && (
                  <div className="mb-4">
                    <h4 className={`${LABEL} mb-2`}>
                      Target Mutations
                    </h4>
                    <div className="space-y-2">
                      {targetCropCounts.map(({ cropId, name, rarity, count }) => (
                        <div
                          key={cropId}
                          /* A target is a thing you picked, so it reads as a kit tile, not a flat slab. */
                          className={`${TILE} flex items-center justify-between px-3 py-2`}
                        >
                          <div className="flex items-center gap-2">
                            <CropImage
                              cropId={cropId}
                              cropName={name}
                              size="xs"
                              showFallback={false}
                            />
                            <span className={`text-[12px] ${getRarityTextColor(rarity)}`}>{name}</span>
                          </div>
                          <span className="text-[12px] font-medium text-emerald-400">x{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Input Crops */}
                {inputCropCounts.length > 0 && (
                  <div className="mb-4">
                    <h4 className={`${LABEL} mb-2`}>
                      Input Crops
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {inputCropCounts.map(({ cropId, name, count }) => (
                        <div
                          key={cropId}
                          className={`${TILE} flex items-center gap-2 px-2.5 py-1`}
                        >
                          <CropImage
                            cropId={cropId}
                            cropName={name}
                            size="xs"
                            showFallback={false}
                          />
                          <span className="text-xs text-slate-300">{name}</span>
                          <span className="text-xs text-slate-500">x{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Total Cells Used */}
                <div className={`${TILE} px-3 py-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Total Cells Used:</span>
                    <span className="text-sm font-medium text-emerald-400">
                      {totalInputCells + totalTargetCells}
                    </span>
                  </div>
                </div>
              </>
            )}
      </div>
    </GreenhouseCapabilityFrame>
  );
};
