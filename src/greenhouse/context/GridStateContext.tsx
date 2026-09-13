import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useGreenhouseStats } from "../../island/profileStats";
import {
  GRID_SIZE,
  getDefaultUnlockedCells,
  getExpandableCells,
  isAdjacentToUnlocked,
  isPermanentUnlockedCell,
  withPermanentUnlockedCells,
} from "../constants";
import type { ExpansionStep } from "../types/greenhouse";
import { LocalStorageManager } from "../utilities";

export type GridCellSource = "hypixel" | "browser";

interface GridStateContextType {
  // grid state
  unlockedCells: Set<string>;
  expandableCells: Set<string>;
  cellSource: GridCellSource;
  
  // Actions
  toggleCell: (row: number, col: number) => void;
  unlockCell: (row: number, col: number) => void;
  lockCell: (row: number, col: number) => void;
  replaceUnlockedCells: (cells: Iterable<string>, source?: GridCellSource) => GridCellSource;
  selectAll: () => void;
  resetToDefault: () => void;
  
  // Helpers
  isCellUnlocked: (row: number, col: number) => boolean;
  isCellExpandable: (row: number, col: number) => boolean;
  getUnlockedCellsArray: () => [number, number][];
  getLockedCellsArray: () => [number, number][];
  
  // Expansion overlay
  expansionSteps: ExpansionStep[];
  setExpansionSteps: (steps: ExpansionStep[]) => void;
  clearExpansionSteps: () => void;
  getExpansionStep: (row: number, col: number) => ExpansionStep | undefined;
}

const GridStateContext = createContext<GridStateContextType | null>(null);

export const GridStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const stats = useGreenhouseStats();
  const [manualUnlockedCells, setManualUnlockedCells] = useState<Set<string>>(() => {
    // Try to load from localStorage first
    const saved = LocalStorageManager.loadGridConfig();
    if (saved && saved.size > 0) {
      return withPermanentUnlockedCells(saved);
    }
    // Fall back to default
    return getDefaultUnlockedCells();
  });
  const [profileOverrideCells, setProfileOverrideCells] = useState<Set<string> | null>(null);
  const [expansionSteps, setExpansionStepsState] = useState<ExpansionStep[]>([]);
  const isInitialMount = useRef(true);

  const profileUnlockedCells = useMemo<Set<string> | null>(() => {
    if (!stats.unlockedCells) return null;
    return withPermanentUnlockedCells(
      stats.unlockedCells.value.map(([row, col]) => `${row},${col}`),
    );
  }, [stats.unlockedCells]);
  // Hypixel supplies purchased slots; the starter core is permanent and is
  // added above before the shape reaches the planner. Edit Cells creates a
  // local planning override without making the API-backed board read-only.
  const unlockedCells = profileOverrideCells ?? profileUnlockedCells ?? manualUnlockedCells;
  const cellSource: GridStateContextType["cellSource"] =
    profileUnlockedCells && !profileOverrideCells ? "hypixel" : "browser";

  // The browser fallback remains useful before Hypixel has supplied a slot
  // list. Never persist the API result as a user edit: it belongs to the
  // selected profile and may change independently.
  useEffect(() => {
    if (isInitialMount.current) {
      // Check if we loaded from localStorage
      const saved = LocalStorageManager.loadGridConfig();
      if (saved && saved.size > 0) {
        // We loaded from localStorage, so future changes should save
        isInitialMount.current = false;
      } else {
        // We're using defaults, don't save yet
        isInitialMount.current = false;
        return;
      }
    }
    LocalStorageManager.saveGridConfig(manualUnlockedCells);
  }, [manualUnlockedCells]);
  
  // Compute expandable cells whenever unlocked cells change
  const expandableCells = useMemo(() => getExpandableCells(unlockedCells), [unlockedCells]);
  
  const isCellUnlocked = useCallback((row: number, col: number): boolean => {
    return unlockedCells.has(`${row},${col}`);
  }, [unlockedCells]);
  
  const isCellExpandable = useCallback((row: number, col: number): boolean => {
    return expandableCells.has(`${row},${col}`);
  }, [expandableCells]);
  
  const updateEditableCells = useCallback((update: (cells: Set<string>) => Set<string>) => {
    if (profileUnlockedCells) {
      setProfileOverrideCells((current) => withPermanentUnlockedCells(
        update(new Set(current ?? profileUnlockedCells)),
      ));
      return;
    }
    setManualUnlockedCells((current) => withPermanentUnlockedCells(update(new Set(current))));
  }, [profileUnlockedCells]);

  const toggleCell = useCallback((row: number, col: number) => {
    if (isPermanentUnlockedCell(row, col)) return;
    const key = `${row},${col}`;
    updateEditableCells(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (isAdjacentToUnlocked(row, col, next)) {
        next.add(key);
      }
      return next;
    });
    // Clear expansion overlay when grid changes
    setExpansionStepsState([]);
  }, [updateEditableCells]);
  
  const unlockCell = useCallback((row: number, col: number) => {
    const key = `${row},${col}`;
    updateEditableCells(prev => {
      if (prev.has(key)) return prev;
      if (!isAdjacentToUnlocked(row, col, prev)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    // Update expansion steps - remove the first step if it matches this cell
    setExpansionStepsState(prev => {
      if (prev.length > 0 && prev[0].cell[0] === row && prev[0].cell[1] === col) {
        return prev.slice(1).map((step, i) => ({ ...step, order: i + 1 }));
      }
      return [];
    });
  }, [updateEditableCells]);
  
  const lockCell = useCallback((row: number, col: number) => {
    if (isPermanentUnlockedCell(row, col)) return;
    const key = `${row},${col}`;
    updateEditableCells(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setExpansionStepsState([]);
  }, [updateEditableCells]);

  const replaceUnlockedCells = useCallback((
    cells: Iterable<string>,
    source: GridCellSource = "browser",
  ): GridCellSource => {
    const restored = withPermanentUnlockedCells(cells);
    if (source === "hypixel") {
      setProfileOverrideCells(null);
      setExpansionStepsState([]);
      if (profileUnlockedCells) return "hypixel";

      // The profile feed may disappear between an edit and Undo. Restore the
      // recorded shape as the browser fallback instead of leaving the custom
      // override selected over a state source that no longer exists.
      setManualUnlockedCells(restored);
      return "browser";
    }
    if (profileUnlockedCells) setProfileOverrideCells(restored);
    else {
      setProfileOverrideCells(null);
      setManualUnlockedCells(restored);
    }
    setExpansionStepsState([]);
    return "browser";
  }, [profileUnlockedCells]);
  
  const selectAll = useCallback(() => {
    const allCells = new Set<string>();
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        allCells.add(`${r},${c}`);
      }
    }
    updateEditableCells(() => allCells);
    setExpansionStepsState([]);
  }, [updateEditableCells]);
  
  const resetToDefault = useCallback(() => {
    updateEditableCells(() => getDefaultUnlockedCells());
    setExpansionStepsState([]);
  }, [updateEditableCells]);
  
  const getUnlockedCellsArray = useCallback((): [number, number][] => {
    return Array.from(unlockedCells).map(key => {
      const [row, col] = key.split(",").map(Number);
      return [row, col] as [number, number];
    });
  }, [unlockedCells]);
  
  const getLockedCellsArray = useCallback((): [number, number][] => {
    const locked: [number, number][] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (!unlockedCells.has(`${r},${c}`)) {
          locked.push([r, c]);
        }
      }
    }
    return locked;
  }, [unlockedCells]);
  
  const setExpansionSteps = useCallback((steps: ExpansionStep[]) => {
    setExpansionStepsState(steps);
  }, []);
  
  const clearExpansionSteps = useCallback(() => {
    setExpansionStepsState([]);
  }, []);
  
  const getExpansionStep = useCallback((row: number, col: number): ExpansionStep | undefined => {
    return expansionSteps.find(step => step.cell[0] === row && step.cell[1] === col);
  }, [expansionSteps]);
  
  const value: GridStateContextType = {
    unlockedCells,
    expandableCells,
    cellSource,
    toggleCell,
    unlockCell,
    lockCell,
    replaceUnlockedCells,
    selectAll,
    resetToDefault,
    isCellUnlocked,
    isCellExpandable,
    getUnlockedCellsArray,
    getLockedCellsArray,
    expansionSteps,
    setExpansionSteps,
    clearExpansionSteps,
    getExpansionStep,
  };
  
  return (
    <GridStateContext.Provider value={value}>
      {children}
    </GridStateContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useGridState = (): GridStateContextType => {
  const context = useContext(GridStateContext);
  if (!context) {
    throw new Error("useGridState must be used within a GridStateProvider");
  }
  return context;
};
