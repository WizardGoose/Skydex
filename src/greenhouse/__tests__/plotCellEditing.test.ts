import { describe, expect, it } from "vitest";
import { getDefaultUnlockedCells, withPermanentUnlockedCells } from "../constants";
import type { DesignerPlacement } from "../context/DesignerContext";
import { editPlotCell, reconcilePlotCellMask } from "../plotCellEditing";

const placement = (
  id: string,
  position: [number, number],
  size = 1,
  isMutation = false,
): DesignerPlacement => ({
  id,
  cropId: id,
  cropName: id,
  size,
  position,
  isMutation,
});

describe("Greenhouse plot cell edits", () => {
  it("unlocks only the orthogonally adjacent frontier", () => {
    const core = getDefaultUnlockedCells();

    expect(editPlotCell(core, 2, 4, "unlock", [], [])?.unlockedCells.has("2,4")).toBe(true);
    expect(editPlotCell(core, 2, 3, "unlock", [], [])).toBeNull();
    expect(editPlotCell(core, 0, 0, "unlock", [], [])).toBeNull();
  });

  it("removes every input and target plant that overlaps a locked cell", () => {
    const cells = withPermanentUnlockedCells(["1,4", "1,5", "2,4", "2,5"]);
    const inputs = [placement("wide-input", [1, 4], 2), placement("input-on-cell", [2, 5])];
    const targets = [placement("target-on-cell", [2, 5], 1, true)];

    const edited = editPlotCell(cells, 2, 5, "lock", inputs, targets);

    expect(edited?.unlockedCells.has("2,5")).toBe(false);
    expect(edited?.inputPlacements).toEqual([]);
    expect(edited?.targetPlacements).toEqual([]);
  });

  it("removes a stale occupant when its already-locked cell is locked again", () => {
    const core = getDefaultUnlockedCells();
    const staleOccupant = placement("stale-outer-crop", [2, 4]);

    const edited = editPlotCell(core, 2, 4, "lock", [staleOccupant], []);

    expect(edited?.unlockedCells).toEqual(core);
    expect(edited?.inputPlacements).toEqual([]);
  });

  it("does not prune an unrelated stale occupant while unlocking elsewhere", () => {
    const core = getDefaultUnlockedCells();
    const staleOccupant = placement("stale-outer-crop", [0, 0]);

    const edited = editPlotCell(core, 2, 4, "unlock", [staleOccupant], []);

    expect(edited?.unlockedCells.has("2,4")).toBe(true);
    expect(edited?.inputPlacements).toEqual([staleOccupant]);
  });

  it("never locks the starter core or removes its occupant", () => {
    const core = getDefaultUnlockedCells();
    const occupant = placement("core-crop", [4, 4]);

    expect(editPlotCell(core, 4, 4, "lock", [occupant], [])).toBeNull();
  });

  it("locks only the requested cell without cascading through disconnected land", () => {
    const cells = withPermanentUnlockedCells(["1,4", "2,4"]);
    const edited = editPlotCell(cells, 2, 4, "lock", [], []);

    expect(edited?.unlockedCells.has("2,4")).toBe(false);
    expect(edited?.unlockedCells.has("1,4")).toBe(true);
  });

  it("prunes only off-core plants when restoring the starter preset", () => {
    const full = new Set(Array.from({ length: 100 }, (_, index) => `${Math.floor(index / 10)},${index % 10}`));
    const coreCrop = placement("core-crop", [4, 4]);
    const outerCrop = placement("outer-crop", [0, 0]);
    const edited = reconcilePlotCellMask(full, getDefaultUnlockedCells(), [coreCrop, outerCrop], []);

    expect(edited?.unlockedCells).toEqual(getDefaultUnlockedCells());
    expect(edited?.inputPlacements).toEqual([coreCrop]);
  });

  it("keeps placements intact when selecting the all-cells preset", () => {
    const core = getDefaultUnlockedCells();
    const full = new Set(Array.from({ length: 100 }, (_, index) => `${Math.floor(index / 10)},${index % 10}`));
    const coreCrop = placement("core-crop", [4, 4]);
    const outerCrop = placement("outer-crop", [0, 0]);
    const edited = reconcilePlotCellMask(core, full, [coreCrop, outerCrop], []);

    expect(edited?.unlockedCells.size).toBe(100);
    expect(edited?.inputPlacements).toEqual([coreCrop, outerCrop]);
  });
});
