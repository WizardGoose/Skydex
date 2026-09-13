import { describe, expect, it } from "vitest";
import { gridLineCells, isPlacementInfoClick } from "../gridPaint";

describe("gridLineCells", () => {
  it("fills every skipped cell in a horizontal sweep", () => {
    expect(gridLineCells([4, 1], [4, 5])).toEqual([
      [4, 1], [4, 2], [4, 3], [4, 4], [4, 5],
    ]);
  });

  it("covers a continuous diagonal in either direction", () => {
    expect(gridLineCells([1, 1], [4, 4])).toEqual([
      [1, 1], [2, 2], [3, 3], [4, 4],
    ]);
    expect(gridLineCells([4, 4], [1, 1])).toEqual([
      [4, 4], [3, 3], [2, 2], [1, 1],
    ]);
  });
});

describe("isPlacementInfoClick", () => {
  it("opens details for a still left click", () => {
    expect(isPlacementInfoClick(0, 2, 3)).toBe(true);
  });

  it("never turns a right-click removal into a detail click", () => {
    expect(isPlacementInfoClick(2, 0, 0)).toBe(false);
  });

  it("does not open details after a drag", () => {
    expect(isPlacementInfoClick(0, 6, 0)).toBe(false);
  });
});
