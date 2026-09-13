import {
  GRID_SIZE,
  isAdjacentToUnlocked,
  isPermanentUnlockedCell,
  withPermanentUnlockedCells,
} from "./constants";
import type { DesignerPlacement } from "./context/DesignerContext";

export interface PlotCellEditResult {
  unlockedCells: Set<string>;
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
}

const placementFits = (
  placement: DesignerPlacement,
  unlockedCells: ReadonlySet<string>,
): boolean => {
  for (let row = placement.position[0]; row < placement.position[0] + placement.size; row += 1) {
    for (let col = placement.position[1]; col < placement.position[1] + placement.size; col += 1) {
      if (!unlockedCells.has(`${row},${col}`)) return false;
    }
  }
  return true;
};

const placementCoversCell = (
  placement: DesignerPlacement,
  row: number,
  col: number,
): boolean => (
  row >= placement.position[0]
  && row < placement.position[0] + placement.size
  && col >= placement.position[1]
  && col < placement.position[1] + placement.size
);

export function reconcilePlotCellMask(
  currentCells: ReadonlySet<string>,
  nextCells: Iterable<string>,
  inputPlacements: readonly DesignerPlacement[],
  targetPlacements: readonly DesignerPlacement[],
): PlotCellEditResult | null {
  const unlockedCells = withPermanentUnlockedCells(nextCells);
  const nextInputs = inputPlacements.filter((placement) => placementFits(placement, unlockedCells));
  const nextTargets = targetPlacements.filter((placement) => placementFits(placement, unlockedCells));
  if (
    unlockedCells.size === currentCells.size
    && [...unlockedCells].every((cell) => currentCells.has(cell))
    && nextInputs.length === inputPlacements.length
    && nextTargets.length === targetPlacements.length
  ) return null;

  return {
    unlockedCells,
    inputPlacements: nextInputs,
    targetPlacements: nextTargets,
  };
}

export function editPlotCell(
  currentCells: ReadonlySet<string>,
  row: number,
  col: number,
  mode: "unlock" | "lock",
  inputPlacements: readonly DesignerPlacement[],
  targetPlacements: readonly DesignerPlacement[],
): PlotCellEditResult | null {
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return null;
  if (mode === "lock" && isPermanentUnlockedCell(row, col)) return null;

  const key = `${row},${col}`;
  if (mode === "unlock") {
    if (currentCells.has(key) || !isAdjacentToUnlocked(row, col, new Set(currentCells))) {
      return null;
    }
    const unlockedCells = withPermanentUnlockedCells([...currentCells, key]);
    return {
      unlockedCells,
      // Unlocking one cell must not opportunistically clean up unrelated
      // legacy placements that happen to sit outside the current mask.
      inputPlacements: [...inputPlacements],
      targetPlacements: [...targetPlacements],
    };
  }

  const nextCells = new Set(currentCells);
  nextCells.delete(key);
  const nextInputs = inputPlacements.filter((item) => !placementCoversCell(item, row, col));
  const nextTargets = targetPlacements.filter((item) => !placementCoversCell(item, row, col));
  if (
    !currentCells.has(key)
    && nextInputs.length === inputPlacements.length
    && nextTargets.length === targetPlacements.length
  ) return null;

  return {
    unlockedCells: withPermanentUnlockedCells(nextCells),
    inputPlacements: nextInputs,
    targetPlacements: nextTargets,
  };
}
