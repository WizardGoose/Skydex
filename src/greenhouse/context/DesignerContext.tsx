import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import type { MutationDefinition } from "../types/greenhouse";
import type { SavedLayout } from "../types/layout";
import {
  isPositionOccupiedByPlacements,
  findOverlappingPlacements,
  getPlacementAtCell,
  validateGridBounds,
  validateAllowedCells,
  generatePlacementId,
  LocalStorageManager,
  evaluateMutationTargets,
} from "../utilities";
import { useGridState } from "./GridStateContext";
import { loadLayouts, saveLayouts } from "../utilities/layoutStorage";
import {
  createDesignerTimeline,
  designerShortcut,
  loadDesignerRecovery,
  pushDesignerTimeline,
  redoDesignerTimeline,
  saveDesignerRecovery,
  toMostRecentLayout,
  undoDesignerTimeline,
  type DesignerTimeline,
  type DesignerWorkspace,
} from "../utilities/designerWorkspace";
import { GRID_SIZE, getDefaultUnlockedCells } from "../constants";
import {
  editPlotCell as editPlotCellState,
  reconcilePlotCellMask,
  type PlotCellEditResult,
} from "../plotCellEditing";

export type DesignerMode = "inputs" | "targets";

export interface DesignerPlacement {
  id: string;
  cropId: string;
  cropName: string;
  size: number;
  position: [number, number];
  isMutation: boolean;
}

export interface SelectedCropForDesigner {
  id: string;
  name: string;
  size: number;
  isMutation: boolean;
}

// Requirement info with satisfaction status
export interface RequirementInfo {
  crop: string;
  needed: number;
  have: number;
  satisfied: boolean;
}

// Mutation validation result
export interface MutationValidationInfo {
  state: "valid" | "delayed" | "invalid";
  /** Zero is ready now; positive values are target-dependency generations. */
  delay: number | null;
  isValid: boolean;
  missingRequirements: Array<RequirementInfo>;
  satisfiedRequirements: Array<RequirementInfo>;
}

interface DesignerContextType {
  // Mode
  mode: DesignerMode;
  setMode: (mode: DesignerMode) => void;
  
  // Placements
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
  
  // Actions
  addPlacement: (placement: Omit<DesignerPlacement, "id">) => { success: boolean; error?: string };
  removePlacement: (id: string) => void;
  movePlacement: (id: string, newPosition: [number, number]) => { success: boolean; error?: string };
  clearInputPlacements: () => void;
  clearTargetPlacements: () => void;
  clearAllPlacements: () => void;
  setPlotCell: (row: number, col: number, mode: "unlock" | "lock") => boolean;
  selectAllPlotCells: () => boolean;
  resetPlotCells: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => boolean;
  redo: () => boolean;
  setKeyboardShortcutsEnabled: (enabled: boolean) => void;

  // One automatic recovery slot plus layouts deliberately saved by the user
  mostRecentLayout: SavedLayout | null;
  savedLayouts: SavedLayout[];
  restoreMostRecent: () => boolean;
  saveNamedLayout: (layout: SavedLayout, overwriteId?: string) => boolean;
  deleteNamedLayout: (id: string) => boolean;
  renameNamedLayout: (id: string, name: string) => boolean;
  
  // Validation helpers
  isPositionOccupied: (position: [number, number], size: number, excludeId?: string) => boolean;
  isValidPlacement: (position: [number, number], size: number, excludeId?: string) => { valid: boolean; error?: string };
  isValidPlacementPosition: (position: [number, number], size: number) => { valid: boolean; error?: string };
  getPlacementAt: (row: number, col: number) => DesignerPlacement | undefined;
  
  // Selection for placement
  selectedCropForPlacement: SelectedCropForDesigner | null;
  setSelectedCropForPlacement: (crop: SelectedCropForDesigner | null) => void;
  isPlacementMode: boolean;
  
  // Hovered target for showing validation info
  hoveredTargetId: string | null;
  setHoveredTargetId: (id: string | null) => void;
  
  // Load from calculator results
  loadFromSolverResult: (
    crops: Array<{ id: string; name: string; position: [number, number]; size: number }>,
    mutations: Array<{ id: string; name: string; position: [number, number]; size: number }>
  ) => void;
  
  // Get all placements for display
  allPlacements: DesignerPlacement[];
  
  // Mutation validation
  getPossibleMutations: (
    mutations: MutationDefinition[]
  ) => Array<{ mutation: MutationDefinition; positions: [number, number][] }>;
  
  // Get validation info for a target placement (for showing missing requirements)
  getTargetValidation: (
    targetId: string,
    mutations: MutationDefinition[]
  ) => MutationValidationInfo;
}

const DesignerContext = createContext<DesignerContextType | null>(null);

export const DesignerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { unlockedCells, cellSource, replaceUnlockedCells } = useGridState();
  const [mode, setMode] = useState<DesignerMode>("inputs");
  const [timeline, setTimeline] = useState<DesignerTimeline>(() => {
    const recovery = loadDesignerRecovery();
    return createDesignerTimeline({
      inputPlacements: recovery?.inputPlacements ?? LocalStorageManager.loadDesignerInputs() ?? [],
      targetPlacements: recovery?.targetPlacements ?? LocalStorageManager.loadDesignerTargets() ?? [],
      mostRecent: recovery?.mostRecent ?? null,
      savedLayouts: loadLayouts(),
    });
  });
  const timelineRef = useRef(timeline);
  const unlockedCellsRef = useRef(unlockedCells);
  const cellSourceRef = useRef(cellSource);
  const keyboardShortcutsEnabledRef = useRef(true);
  const { inputPlacements, targetPlacements, mostRecent, savedLayouts } = timeline.present;
  const [selectedCropForPlacement, setSelectedCropForPlacement] = useState<SelectedCropForDesigner | null>(null);
  const [hoveredTargetId, setHoveredTargetId] = useState<string | null>(null);

  const persistTimeline = useCallback((next: DesignerTimeline): boolean => {
    const previous = timelineRef.current;
    if (
      next.present.savedLayouts !== previous.present.savedLayouts &&
      !saveLayouts(next.present.savedLayouts)
    ) return false;

    timelineRef.current = next;
    setTimeline(next);
    saveDesignerRecovery(next.present);
    LocalStorageManager.saveDesignerInputs(next.present.inputPlacements);
    LocalStorageManager.saveDesignerTargets(next.present.targetPlacements);
    return true;
  }, []);

  const commitWorkspace = useCallback((
    update: (workspace: DesignerWorkspace) => DesignerWorkspace,
    options: { now?: number } = {},
  ): boolean => {
    const current = timelineRef.current;
    const nextWorkspace = update(current.present);
    if (nextWorkspace === current.present) return true;
    return persistTimeline(pushDesignerTimeline(current, nextWorkspace, options));
  }, [persistTimeline]);

  useEffect(() => {
    unlockedCellsRef.current = unlockedCells;
    cellSourceRef.current = cellSource;
  }, [cellSource, unlockedCells]);

  // Adopt a legacy active layout into the crash-safe record on first mount.
  useEffect(() => {
    saveDesignerRecovery(timelineRef.current.present);
  }, []);

  const currentPlacements = mode === "inputs" ? inputPlacements : targetPlacements;
  
  // All placements combined (for overlap checking and display)
  const allPlacements = useMemo(() => {
    return [...inputPlacements, ...targetPlacements];
  }, [inputPlacements, targetPlacements]);

  const commitPlotCellEdit = useCallback((edit: PlotCellEditResult | null): boolean => {
    if (!edit) return false;
    const current = timelineRef.current;
    const before = unlockedCellsRef.current;
    const nextWorkspace: DesignerWorkspace = {
      ...current.present,
      inputPlacements: edit.inputPlacements,
      targetPlacements: edit.targetPlacements,
    };
    const next = pushDesignerTimeline(current, nextWorkspace, {
      cellEdit: {
        before: [...before],
        after: [...edit.unlockedCells],
        beforeSource: cellSourceRef.current,
        afterSource: "browser",
      },
    });
    if (!persistTimeline(next)) return false;
    unlockedCellsRef.current = edit.unlockedCells;
    cellSourceRef.current = replaceUnlockedCells(edit.unlockedCells);
    return true;
  }, [persistTimeline, replaceUnlockedCells]);

  const setPlotCell = useCallback((
    row: number,
    col: number,
    cellMode: "unlock" | "lock",
  ): boolean => {
    const current = timelineRef.current.present;
    return commitPlotCellEdit(editPlotCellState(
      unlockedCellsRef.current,
      row,
      col,
      cellMode,
      current.inputPlacements,
      current.targetPlacements,
    ));
  }, [commitPlotCellEdit]);

  const selectAllPlotCells = useCallback((): boolean => {
    const allCells = new Set<string>();
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) allCells.add(`${row},${col}`);
    }
    const current = timelineRef.current.present;
    return commitPlotCellEdit(reconcilePlotCellMask(
      unlockedCellsRef.current,
      allCells,
      current.inputPlacements,
      current.targetPlacements,
    ));
  }, [commitPlotCellEdit]);

  const resetPlotCells = useCallback((): boolean => {
    const current = timelineRef.current.present;
    return commitPlotCellEdit(reconcilePlotCellMask(
      unlockedCellsRef.current,
      getDefaultUnlockedCells(),
      current.inputPlacements,
      current.targetPlacements,
    ));
  }, [commitPlotCellEdit]);

  // Check if position is occupied by any placement (inputs or targets)
  const isPositionOccupied = useCallback((
    position: [number, number],
    size: number,
    excludeId?: string
  ): boolean => {
    return isPositionOccupiedByPlacements(position, size, allPlacements, excludeId);
  }, [allPlacements]);
  
  // The manual editor and the arranger now work on the same real plot. A crop
  // cannot be drawn through a cell the player has not unlocked.
  const isValidPlacementPosition = useCallback((
    position: [number, number],
    size: number
  ): { valid: boolean; error?: string } => {
    const bounds = validateGridBounds(position, size);
    if (!bounds.valid) return bounds;
    return validateAllowedCells(position, size, unlockedCells);
  }, [unlockedCells]);
  
  // Validate placement (includes overlap check)
  const isValidPlacement = useCallback((
    position: [number, number],
    size: number,
    excludeId?: string
  ): { valid: boolean; error?: string } => {
    const positionValidation = isValidPlacementPosition(position, size);
    if (!positionValidation.valid) {
      return positionValidation;
    }
    
    if (isPositionOccupied(position, size, excludeId)) {
      return { valid: false, error: "Position is occupied by another placement" };
    }
    
    return { valid: true };
  }, [isValidPlacementPosition, isPositionOccupied]);
  
  // Find overlapping placements in current mode's list
  const getOverlappingPlacements = useCallback((
    position: [number, number],
    size: number,
    excludeId?: string
  ): DesignerPlacement[] => {
    return findOverlappingPlacements(position, size, currentPlacements, excludeId);
  }, [currentPlacements]);
  
  // Add placement to current mode's list
  const addPlacement = useCallback((
    placement: Omit<DesignerPlacement, "id">
  ): { success: boolean; error?: string } => {
    const validation = isValidPlacementPosition(placement.position, placement.size);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    const newPlacement: DesignerPlacement = {
      ...placement,
      id: generatePlacementId("designer"),
    };
    
    // Remove any overlapping placements in the current mode's list
    const overlapping = getOverlappingPlacements(placement.position, placement.size);
    const overlappingIds = new Set(overlapping.map(p => p.id));
    
    commitWorkspace((workspace) => {
      const key = mode === "inputs" ? "inputPlacements" : "targetPlacements";
      return {
        ...workspace,
        [key]: [
          ...workspace[key].filter((p) => !overlappingIds.has(p.id)),
          newPlacement,
        ],
      };
    });
    
    return { success: true };
  }, [isValidPlacementPosition, getOverlappingPlacements, commitWorkspace, mode]);
  
  // Remove placement from either list
  const removePlacement = useCallback((id: string) => {
    commitWorkspace((workspace) => ({
      ...workspace,
      inputPlacements: workspace.inputPlacements.filter((p) => p.id !== id),
      targetPlacements: workspace.targetPlacements.filter((p) => p.id !== id),
    }));
  }, [commitWorkspace]);
  
  // Move placement
  const movePlacement = useCallback((
    id: string,
    newPosition: [number, number]
  ): { success: boolean; error?: string } => {
    const placement = allPlacements.find(p => p.id === id);
    if (!placement) {
      return { success: false, error: "Placement not found" };
    }
    
    const validation = isValidPlacement(newPosition, placement.size, id);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }
    
    // Update in the correct list
    const isInput = inputPlacements.some(p => p.id === id);
    commitWorkspace((workspace) => isInput
      ? {
          ...workspace,
          inputPlacements: workspace.inputPlacements.map((p) =>
            p.id === id ? { ...p, position: newPosition } : p
          ),
        }
      : {
          ...workspace,
          targetPlacements: workspace.targetPlacements.map((p) =>
            p.id === id ? { ...p, position: newPosition } : p
          ),
        });
    
    return { success: true };
  }, [allPlacements, inputPlacements, isValidPlacement, commitWorkspace]);
  
  // Clear functions
  const clearInputPlacements = useCallback(() => {
    if (timelineRef.current.present.inputPlacements.length === 0) return;
    commitWorkspace((workspace) => ({ ...workspace, inputPlacements: [] }));
  }, [commitWorkspace]);
  
  const clearTargetPlacements = useCallback(() => {
    if (timelineRef.current.present.targetPlacements.length === 0) return;
    commitWorkspace((workspace) => ({ ...workspace, targetPlacements: [] }));
  }, [commitWorkspace]);
  
  const clearAllPlacements = useCallback(() => {
    const current = timelineRef.current.present;
    if (current.inputPlacements.length === 0 && current.targetPlacements.length === 0) return;
    commitWorkspace((workspace) => ({ ...workspace, inputPlacements: [], targetPlacements: [] }));
  }, [commitWorkspace]);
  
  // Get placement at position
  const getPlacementAt = useCallback((
    row: number,
    col: number
  ): DesignerPlacement | undefined => {
    return getPlacementAtCell(row, col, allPlacements);
  }, [allPlacements]);
  
  // Load from solver result
  const loadFromSolverResult = useCallback((
    crops: Array<{ id: string; name: string; position: [number, number]; size: number }>,
    mutations: Array<{ id: string; name: string; position: [number, number]; size: number }>
  ) => {
    // Convert crops to input placements
    const newInputs: DesignerPlacement[] = crops.map(crop => ({
      id: generatePlacementId("designer"),
      cropId: crop.id,
      cropName: crop.name,
      size: crop.size,
      position: crop.position,
      isMutation: false,
    }));
    
    // Convert mutations to target placements
    const newTargets: DesignerPlacement[] = mutations.map(mutation => ({
      id: generatePlacementId("designer"),
      cropId: mutation.id,
      cropName: mutation.name,
      size: mutation.size,
      position: mutation.position,
      isMutation: true,
    }));
    
    commitWorkspace((workspace) => ({
      ...workspace,
      inputPlacements: newInputs,
      targetPlacements: newTargets,
    }));
  }, [commitWorkspace]);

  const restoreMostRecent = useCallback((): boolean => {
    const point = timelineRef.current.present.mostRecent;
    if (!point) return false;
    return commitWorkspace((workspace) => ({
      ...workspace,
      inputPlacements: point.inputPlacements,
      targetPlacements: point.targetPlacements,
    }));
  }, [commitWorkspace]);

  const saveNamedLayout = useCallback((layout: SavedLayout, overwriteId?: string): boolean => {
    if (
      overwriteId &&
      !timelineRef.current.present.savedLayouts.some((saved) => saved.id === overwriteId)
    ) return false;
    return commitWorkspace((workspace) => {
      if (!overwriteId) {
        return { ...workspace, savedLayouts: [...workspace.savedLayouts, layout] };
      }
      const index = workspace.savedLayouts.findIndex((saved) => saved.id === overwriteId);
      if (index === -1) return workspace;
      const next = [...workspace.savedLayouts];
      next[index] = {
        ...layout,
        id: overwriteId,
        savedAt: workspace.savedLayouts[index].savedAt,
      };
      return { ...workspace, savedLayouts: next };
    });
  }, [commitWorkspace]);

  const deleteNamedLayout = useCallback((id: string): boolean => {
    const current = timelineRef.current.present;
    if (!current.savedLayouts.some((layout) => layout.id === id)) return false;
    return commitWorkspace((workspace) => ({
      ...workspace,
      savedLayouts: workspace.savedLayouts.filter((layout) => layout.id !== id),
    }));
  }, [commitWorkspace]);

  const renameNamedLayout = useCallback((id: string, name: string): boolean => {
    const trimmed = name.trim();
    const current = timelineRef.current.present;
    if (
      !trimmed ||
      current.savedLayouts.some((layout) => layout.id !== id && layout.name === trimmed) ||
      !current.savedLayouts.some((layout) => layout.id === id)
    ) return false;
    return commitWorkspace((workspace) => ({
      ...workspace,
      savedLayouts: workspace.savedLayouts.map((layout) =>
        layout.id === id ? { ...layout, name: trimmed, modifiedAt: Date.now() } : layout
      ),
    }));
  }, [commitWorkspace]);

  const undo = useCallback((): boolean => {
    const current = timelineRef.current;
    const cellEdit = current.pastCellEdits.at(-1) ?? null;
    const next = undoDesignerTimeline(current);
    if (next === current || !persistTimeline(next)) return false;
    if (cellEdit) {
      const restored = new Set(cellEdit.before);
      unlockedCellsRef.current = restored;
      cellSourceRef.current = replaceUnlockedCells(restored, cellEdit.beforeSource);
    }
    return true;
  }, [persistTimeline, replaceUnlockedCells]);

  const redo = useCallback((): boolean => {
    const current = timelineRef.current;
    const cellEdit = current.futureCellEdits[0] ?? null;
    const next = redoDesignerTimeline(current);
    if (next === current || !persistTimeline(next)) return false;
    if (cellEdit) {
      const restored = new Set(cellEdit.after);
      unlockedCellsRef.current = restored;
      cellSourceRef.current = replaceUnlockedCells(restored, cellEdit.afterSource);
    }
    return true;
  }, [persistTimeline, replaceUnlockedCells]);

  const setKeyboardShortcutsEnabled = useCallback((enabled: boolean): void => {
    keyboardShortcutsEnabledRef.current = enabled;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!keyboardShortcutsEnabledRef.current) return;
      const shortcut = designerShortcut(event);
      if (!shortcut) return;
      const changed = shortcut === "undo" ? undo() : redo();
      if (changed) event.preventDefault();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);
  
  // Get possible mutations based on current input placements
  const getPossibleMutations = useCallback((
    mutations: MutationDefinition[]
  ): Array<{ mutation: MutationDefinition; positions: [number, number][] }> => {
    const results: Array<{ mutation: MutationDefinition; positions: [number, number][] }> = [];
    
    // Build a map of what crops are at each cell
    const cropAtCell = new Map<string, string>();
    for (const placement of inputPlacements) {
      const [row, col] = placement.position;
      for (let dr = 0; dr < placement.size; dr++) {
        for (let dc = 0; dc < placement.size; dc++) {
          cropAtCell.set(`${row + dr},${col + dc}`, placement.cropId);
        }
      }
    }
    
    // For each mutation, check if requirements can be satisfied
    for (const mutation of mutations) {
      const validPositions: [number, number][] = [];
      
      // Try each possible position for the mutation
      for (let row = 0; row <= 10 - mutation.size; row++) {
        for (let col = 0; col <= 10 - mutation.size; col++) {
          // Check if position is valid (unlocked cells)
          const posValid = isValidPlacementPosition([row, col], mutation.size);
          if (!posValid.valid) continue;
          
          // Count adjacent cells by crop type
          const adjacentCropCounts = new Map<string, Set<string>>();
          
          // Get all adjacent cells (cells touching the mutation area)
          for (let dr = 0; dr < mutation.size; dr++) {
            for (let dc = 0; dc < mutation.size; dc++) {
              const cellRow = row + dr;
              const cellCol = col + dc;
              
              // Check all 8 directions (including diagonals)
              const neighbors = [
                [cellRow - 1, cellCol],     // North
                [cellRow + 1, cellCol],     // South
                [cellRow, cellCol - 1],     // West
                [cellRow, cellCol + 1],     // East
                [cellRow - 1, cellCol - 1], // Northwest
                [cellRow - 1, cellCol + 1], // Northeast
                [cellRow + 1, cellCol - 1], // Southwest
                [cellRow + 1, cellCol + 1], // Southeast
              ];
              
              for (const [nr, nc] of neighbors) {
                // Skip if inside the mutation area
                if (nr >= row && nr < row + mutation.size && 
                    nc >= col && nc < col + mutation.size) continue;
                
                const crop = cropAtCell.get(`${nr},${nc}`);
                if (crop) {
                  if (!adjacentCropCounts.has(crop)) {
                    adjacentCropCounts.set(crop, new Set());
                  }
                  // Track unique cell positions for this crop type
                  adjacentCropCounts.get(crop)!.add(`${nr},${nc}`);
                }
              }
            }
          }
          
          // Check if all requirements are satisfied (both crop type AND count)
          const requirementsMet = mutation.requirements.every(req => {
            const cellsOfThisCrop = adjacentCropCounts.get(req.crop);
            return cellsOfThisCrop && cellsOfThisCrop.size >= req.count;
          });
          
          if (requirementsMet) {
            validPositions.push([row, col]);
          }
        }
      }
      
      if (validPositions.length > 0) {
        results.push({ mutation, positions: validPositions });
      }
    }
    
    return results;
  }, [inputPlacements, isValidPlacementPosition]);
  
  // Get validation info for a target placement
  const getTargetValidation = useCallback((
    targetId: string,
    mutations: MutationDefinition[]
  ): MutationValidationInfo => {
    return evaluateMutationTargets(inputPlacements, targetPlacements, mutations).get(targetId) ?? {
      state: "invalid",
      delay: null,
      isValid: false,
      missingRequirements: [],
      satisfiedRequirements: [],
    };
  }, [inputPlacements, targetPlacements]);
  
  const value: DesignerContextType = {
    mode,
    setMode,
    inputPlacements,
    targetPlacements,
    addPlacement,
    removePlacement,
    movePlacement,
    clearInputPlacements,
    clearTargetPlacements,
    clearAllPlacements,
    setPlotCell,
    selectAllPlotCells,
    resetPlotCells,
    canUndo: timeline.past.length > 0,
    canRedo: timeline.future.length > 0,
    undo,
    redo,
    setKeyboardShortcutsEnabled,
    mostRecentLayout: toMostRecentLayout(mostRecent),
    savedLayouts,
    restoreMostRecent,
    saveNamedLayout,
    deleteNamedLayout,
    renameNamedLayout,
    isPositionOccupied,
    isValidPlacement,
    isValidPlacementPosition,
    getPlacementAt,
    selectedCropForPlacement,
    setSelectedCropForPlacement,
    isPlacementMode: selectedCropForPlacement !== null,
    hoveredTargetId,
    setHoveredTargetId,
    loadFromSolverResult,
    allPlacements,
    getPossibleMutations,
    getTargetValidation,
  };
  
  return (
    <DesignerContext.Provider value={value}>
      {children}
    </DesignerContext.Provider>
  );
};

// The provider and its matching hook intentionally share one module.
// eslint-disable-next-line react-refresh/only-export-components
export const useDesigner = (): DesignerContextType => {
  const context = useContext(DesignerContext);
  if (!context) {
    throw new Error("useDesigner must be used within a DesignerProvider");
  }
  return context;
};
