import React, { useRef, useCallback, forwardRef, useImperativeHandle, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { useDesigner, useGreenhouseData, useGridState, useInfoModal } from "../../context";
import { useDesignerGridPlacement } from "../../hooks";
import { 
  getGridDimensions, 
  calculateCropImageDimensions,
  getCellPixelPosition,
  evaluateMutationTargets,
} from "../../utilities";
import { GridBackground, DragValidationOverlay } from "../grid";
import { getGroundImagePath } from "../../types/greenhouse";
import { CropImage } from "../shared";
import type { DesignerPlacement } from "../../context";
import { isPlacementInfoClick } from "../../hooks/shared/gridPaint";

export interface DesignerGridHandle {
  getGridElement: () => HTMLDivElement | null;
}

interface DesignerGridProps {
  className?: string;
  cellSize?: number;
  gap?: number;
  showTargets?: boolean;
  showStatus?: boolean;
  readOnly?: boolean;
  inputPlacementsOverride?: DesignerPlacement[];
  targetPlacementsOverride?: DesignerPlacement[];
  showLockedCells?: boolean;
}

const StatusMessage: React.FC<{
  hoveredPlacementId: string | null;
  isPlacementMode: boolean;
  hoverInfo: { cell: [number, number] } | null;
}> = ({ hoveredPlacementId, isPlacementMode, hoverInfo }) => {
  const getMessage = () => {
    if (hoveredPlacementId && isPlacementMode) {
      return (
        <span>
          <span className="font-semibold text-emerald-400">Left-click to place</span>,{" "}
          <span className="font-semibold text-red-400">right-click to remove</span>,{" "}
          drag to move
        </span>
      );
    }
    if (hoveredPlacementId && !isPlacementMode) {
      return (
        <span>
          <span className="font-semibold text-emerald-400">Drag to move</span>,{" "}
          <span className="font-semibold text-red-400">right-click to remove</span>
        </span>
      );
    }
    if (isPlacementMode && hoverInfo) {
      return (
        <span>
          <span className="font-semibold text-emerald-400">Left-click to place</span>, right-click to remove, drag to move
        </span>
      );
    }
    if (isPlacementMode) {
      return "Left-click to place, right-click to remove, drag to move";
    }
    return "Select a crop from the palette to begin placing";
  };

  return (
    <div className="text-center py-2 text-slate-500 text-sm">
      {getMessage()}
    </div>
  );
};

interface DesignerPlacementCellProps {
  placement: DesignerPlacement;
  cellSize: number;
  gap: number;
  isDragging: boolean;
  isHovered: boolean;
  isPlacementMode: boolean;
  isInput: boolean;
  groundType: string;
  showImage?: boolean;
  validationInfo?: {
    state: "valid" | "delayed" | "invalid";
    isValid: boolean;
    missingRequirements: Array<{ crop: string; needed: number; have: number }>;
  };
  onMouseDown: (e: React.MouseEvent) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick?: () => void;
  readOnly?: boolean;
}

const DesignerPlacementCell: React.FC<DesignerPlacementCellProps> = ({
  placement,
  cellSize,
  gap,
  isDragging,
  isHovered,
  isPlacementMode,
  isInput,
  groundType,
  showImage = true,
  validationInfo,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onClick,
  readOnly = false,
}) => {
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  
  const { totalWidth, totalHeight, imageWidth, imageHeight } = calculateCropImageDimensions(placement.size, cellSize, gap);
  const { top, left } = getCellPixelPosition(placement.position[0], placement.position[1], cellSize, gap);
  
  // Determine if this is an invalid target
  const isInvalidTarget = !isInput && validationInfo?.state === "invalid";
  const isDelayedTarget = !isInput && validationInfo?.state === "delayed";
  
  // Inputs stay neutral; targets are blue when ready, yellow when another
  // target must grow first, and red when the layout cannot satisfy them.
  const baseGlow = isInput
    ? undefined
    : isInvalidTarget
      ? undefined // No glow for invalid, we use border instead
      : isDelayedTarget
        ? showImage ? "0 0 10px color-mix(in srgb, var(--color-yellow-400) 90%, transparent), inset 0 0 8px color-mix(in srgb, var(--color-yellow-400) 55%, transparent)" : undefined
        : showImage ? "0 0 8px rgba(0, 200, 255, 1), inset 0 0 8px rgba(0, 200, 255, 1)" : undefined;
  const hoverGlow = "0 0 8px rgba(239, 68, 68, 0.8), inset 0 0 8px rgba(239, 68, 68, 0.4)";
  
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    left,
    width: totalWidth,
    height: totalHeight,
    backgroundImage: `url(${getGroundImagePath(groundType)})`,
    backgroundSize: `${cellSize}px ${cellSize}px`,
    backgroundPosition: "top left",
    backgroundRepeat: "repeat",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible", // Allow tooltip to overflow
    boxShadow: isHovered && !readOnly ? hoverGlow : baseGlow,
    // The site's red token, not stock #ef4444: index.css retints the ramp and
    // an off-ramp red reads as a foreign element on this ground.
    border: isInvalidTarget
      ? "2px solid var(--color-red-500)"
      : isDelayedTarget
        ? "2px solid var(--color-yellow-400)"
        : undefined,
    zIndex: isDragging ? 20 : (isHovered && isInvalidTarget ? 30 : 10), // Higher z-index when showing tooltip
    cursor: readOnly ? "pointer" : isDragging ? "grabbing" : (isPlacementMode ? "crosshair" : "grab"),
    opacity: isDragging ? 0.8 : 1,
    transition: isDragging ? "none" : "transform 0.15s ease, box-shadow 0.15s ease",
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
    onMouseDown(e);
  }, [onMouseDown]);
  
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (mouseDownPos.current && onClick) {
      const dx = Math.abs(e.clientX - mouseDownPos.current.x);
      const dy = Math.abs(e.clientY - mouseDownPos.current.y);
      if (isPlacementInfoClick(e.button, dx, dy)) {
        onClick();
      }
    }
    mouseDownPos.current = null;
  }, [onClick]);

  return (
    <div
      style={style}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onContextMenu={(e) => e.preventDefault()}
      title={readOnly
        ? `${placement.cropName} - click for details`
        : `${placement.cropName}${isDelayedTarget ? " - delayed until adjacent target mutations grow" : ""} - Drag to move, right-click to remove`}
    >
      {showImage && (
        <CropImage
          cropId={placement.cropId}
          cropName={placement.cropName}
          width={imageWidth}
          height={imageHeight}
          showGround={false}
          groundType={groundType}
          hasGroundContext={true}
          showFallback={true}
          fallbackText={placement.cropName.slice(0, 4)}
        />
      )}
      
      {/* Trash icon on hover */}
      {isHovered && !readOnly && (
        <div className="absolute top-0.5 right-0.5 bg-red-500 rounded-bl-md p-0.5">
          <Trash2 className="w-3 h-3 text-white" />
        </div>
      )}
    </div>
  );
};

interface DesignerPlacementPreviewProps {
  position: [number, number];
  cropId: string;
  cropName: string;
  size: number;
  groundType: string;
  isValid: boolean;
  cellSize: number;
  gap: number;
}

const DesignerPlacementPreview: React.FC<DesignerPlacementPreviewProps> = ({
  position,
  cropId,
  cropName,
  size,
  groundType,
  isValid,
  cellSize,
  gap,
}) => {
  const { totalWidth, totalHeight, imageWidth, imageHeight } = calculateCropImageDimensions(size, cellSize, gap);
  const { top, left } = getCellPixelPosition(position[0], position[1], cellSize, gap);
  
  const style: React.CSSProperties = {
    position: "absolute",
    top,
    left,
    width: totalWidth,
    height: totalHeight,
    backgroundImage: `url(${getGroundImagePath(groundType)})`,
    backgroundSize: `${cellSize}px ${cellSize}px`,
    backgroundPosition: "top left",
    backgroundRepeat: "repeat",
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    zIndex: 15,
    opacity: 0.7,
    // Valid/invalid are interactive state, so they take the site's tokens:
    // the retinted emerald (verdigris) and red ramps from index.css, not the
    // stock Tailwind greens and reds these hexes were.
    border: isValid ? "2px solid var(--color-emerald-500)" : "2px solid var(--color-red-500)",
    boxShadow: isValid
      ? "0 0 12px color-mix(in srgb, var(--color-emerald-500) 50%, transparent)"
      : "0 0 12px color-mix(in srgb, var(--color-red-500) 50%, transparent)",
    pointerEvents: "none",
  };

  return (
    <div style={style}>
      <CropImage
        cropId={cropId}
        cropName={cropName}
        width={imageWidth}
        height={imageHeight}
        showGround={false}
        groundType={groundType}
        hasGroundContext={true}
        showFallback={true}
        fallbackText={cropName.slice(0, 4)}
      />
    </div>
  );
};

export const DesignerGrid = forwardRef<DesignerGridHandle, DesignerGridProps>(({
  className = "",
  cellSize = 48,
  gap = 2,
  showTargets = true,
  showStatus = true,
  readOnly = false,
  inputPlacementsOverride,
  targetPlacementsOverride,
  showLockedCells = true,
}, ref) => {
  const gridRef = useRef<HTMLDivElement>(null);
  const { getCropDef, getMutationDef, mutations } = useGreenhouseData();
  const { unlockedCells } = useGridState();
  const { openInfo } = useInfoModal();
  const {
    inputPlacements: designerInputPlacements,
    targetPlacements: designerTargetPlacements,
    selectedCropForPlacement,
    isPlacementMode,
    setHoveredTargetId,
  } = useDesigner();
  const inputPlacements = inputPlacementsOverride ?? designerInputPlacements;
  const targetPlacements = targetPlacementsOverride ?? designerTargetPlacements;
  const renderedPlacements = useMemo(
    () => [...inputPlacements, ...targetPlacements],
    [inputPlacements, targetPlacements],
  );
  const validationByTarget = useMemo(
    () => evaluateMutationTargets(inputPlacements, targetPlacements, mutations),
    [inputPlacements, mutations, targetPlacements],
  );
  
  // Expose grid element via ref
  useImperativeHandle(ref, () => ({
    getGridElement: () => gridRef.current,
  }), []);
  
  const { width: gridWidth, height: gridHeight } = getGridDimensions(cellSize, gap);
  
  const {
    hoveredPlacementId,
    setHoveredPlacementId,
    dragState,
    paintState,
    hoverInfo,
    previewPosition,
    previewValidation,
    dragValidation,
    handleMouseMove,
    handleMouseLeave,
    handleMouseDown,
    handleMouseUp,
    handleContextMenu,
    handlePlacementMouseDown,
  } = useDesignerGridPlacement({ cellSize, gap, gridRef });
  
  // Get ground type for a crop
  const getGroundType = (cropId: string): string => {
    const cropDef = getCropDef(cropId);
    const mutationDef = getMutationDef(cropId);
    return cropDef?.ground || mutationDef?.ground || "farmland";
  };
  
return (
    <>
      <div
        ref={gridRef}
        data-grid-container
        className={`relative select-none ${className}`}
        style={{
          width: gridWidth,
          height: gridHeight,
          cursor: readOnly ? "default" : isPlacementMode ? "crosshair" : "default",
        }}
        onMouseMove={readOnly ? undefined : handleMouseMove}
        onMouseLeave={readOnly ? undefined : handleMouseLeave}
        onMouseDown={readOnly ? undefined : handleMouseDown}
        onContextMenu={handleContextMenu}
        onMouseUp={readOnly ? undefined : handleMouseUp}
      >
      {/* Background grid cells */}
      <GridBackground
        cellSize={cellSize}
        gap={gap}
        unlockedCells={unlockedCells}
        variant="gray"
        showLockedCells={showLockedCells}
      />
      
      {/* Input placements */}
      {inputPlacements.map((placement) => {
        const isBeingDragged = !readOnly && dragState?.placementId === placement.id && dragState?.isDragging;
        const isHovered = !readOnly && hoveredPlacementId === placement.id && !isBeingDragged && !isPlacementMode;
        
        const displayPlacement = isBeingDragged
          ? { ...placement, position: dragState.currentPosition }
          : placement;
        
        return (
          <DesignerPlacementCell
            key={placement.id}
            placement={displayPlacement}
            cellSize={cellSize}
            gap={gap}
            isDragging={isBeingDragged}
            isHovered={isHovered}
            isPlacementMode={isPlacementMode}
            isInput={true}
            groundType={getGroundType(placement.cropId)}
            onMouseDown={readOnly ? () => undefined : (e) => handlePlacementMouseDown(placement.id, e)}
            onMouseEnter={readOnly ? () => undefined : () => setHoveredPlacementId(placement.id)}
            onMouseLeave={readOnly ? () => undefined : () => setHoveredPlacementId(null)}
            onClick={() => openInfo(placement.cropId)}
            readOnly={readOnly}
          />
        );
      })}
      
      {/* Target placements */}
      {targetPlacements.map((placement) => {
        const isBeingDragged = !readOnly && dragState?.placementId === placement.id && dragState?.isDragging;
        const isHovered = !readOnly && hoveredPlacementId === placement.id && !isBeingDragged && !isPlacementMode;
        
        const displayPlacement = isBeingDragged
          ? { ...placement, position: dragState.currentPosition }
          : placement;
        
        // Get validation info for this target
        const validationInfo = validationByTarget.get(placement.id);
        
        return (
          <DesignerPlacementCell
            key={placement.id}
            placement={displayPlacement}
            cellSize={cellSize}
            gap={gap}
            isDragging={isBeingDragged}
            isHovered={isHovered}
            isPlacementMode={isPlacementMode}
            isInput={false}
            groundType={getGroundType(placement.cropId)}
            showImage={showTargets}
            validationInfo={validationInfo}
            onMouseDown={readOnly ? () => undefined : (e) => handlePlacementMouseDown(placement.id, e)}
            onMouseEnter={readOnly ? () => undefined : () => {
              setHoveredPlacementId(placement.id);
              setHoveredTargetId(placement.id);
            }}
            onMouseLeave={readOnly ? () => undefined : () => {
              setHoveredPlacementId(null);
              setHoveredTargetId(null);
            }}
            onClick={() => openInfo(placement.cropId)}
            readOnly={readOnly}
          />
        );
      })}
      
      {/* Drag preview validation overlay */}
      {!readOnly && dragState?.isDragging && dragValidation && (
        <DragValidationOverlay
          position={dragState.currentPosition}
          size={renderedPlacements.find(p => p.id === dragState.placementId)?.size ?? 1}
          cellSize={cellSize}
          gap={gap}
          isValid={dragValidation.valid}
        />
      )}
      
      {/* Placement preview (when not dragging) */}
      {!readOnly && previewPosition && selectedCropForPlacement && !dragState?.isDragging && !paintState && (
        <DesignerPlacementPreview
          position={previewPosition}
          cropId={selectedCropForPlacement.id}
          cropName={selectedCropForPlacement.name}
          size={selectedCropForPlacement.size}
          groundType={getGroundType(selectedCropForPlacement.id)}
          isValid={previewValidation?.valid ?? false}
          cellSize={cellSize}
          gap={gap}
        />
      )}
      </div>
      
      {showStatus && (
        <StatusMessage
          hoveredPlacementId={hoveredPlacementId}
          isPlacementMode={isPlacementMode}
          hoverInfo={hoverInfo}
        />
      )}
    </>
  );
});

DesignerGrid.displayName = "DesignerGrid";
