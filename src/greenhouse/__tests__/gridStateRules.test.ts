import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  getDefaultUnlockedCells,
  isPermanentUnlockedCell,
  withPermanentUnlockedCells,
} from "../constants";
import { greenhouseCellCacheSuffix } from "../planner/useSolvedLayout";

const key = (row: number, col: number) => `${row},${col}`;

describe("greenhouse cell rules", () => {
  it("keeps the twelve-cell starter core permanently unlocked", () => {
    const core = getDefaultUnlockedCells();

    expect([...core].sort()).toEqual([
      "3,4", "3,5",
      "4,3", "4,4", "4,5", "4,6",
      "5,3", "5,4", "5,5", "5,6",
      "6,4", "6,5",
    ]);
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        expect(isPermanentUnlockedCell(row, col)).toBe(core.has(key(row, col)));
      }
    }
  });

  it("adds the permanent core to Hypixel's separately returned expansion slots", () => {
    const core = getDefaultUnlockedCells();
    const expansionSlots = new Set<string>();
    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const cell = key(row, col);
        if (!core.has(cell)) expansionSlots.add(cell);
      }
    }

    expect(expansionSlots.size).toBe(88);
    const usable = withPermanentUnlockedCells(expansionSlots);
    expect(usable.size).toBe(100);
    expect(greenhouseCellCacheSuffix(
      [...usable].map((cell) => cell.split(",").map(Number) as [number, number]),
    )).toBe("");
  });

  it("restores a missing core even after an attempted lock", () => {
    const edited = withPermanentUnlockedCells(new Set(["0,0", "9,9"]));
    edited.delete("4,4");

    const protectedShape = withPermanentUnlockedCells(edited);
    expect(protectedShape.has("4,4")).toBe(true);
    expect(protectedShape.has("0,0")).toBe(true);
    expect(protectedShape.has("9,9")).toBe(true);
  });
});
