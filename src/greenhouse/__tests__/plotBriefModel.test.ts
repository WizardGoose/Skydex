import { describe, expect, it } from "vitest";
import type { DesignerPlacement } from "../context";
import { summarizePlacements } from "../plotBriefModel";

const placement = (id: string, cropId: string, cropName: string, size = 1): DesignerPlacement => ({
  id,
  cropId,
  cropName,
  size,
  position: [0, 0],
  isMutation: false,
});

describe("plot brief placement summary", () => {
  it("counts planted crops rather than the cells they occupy", () => {
    const rows = summarizePlacements([
      placement("one", "veilshroom", "Veilshroom", 3),
      placement("two", "veilshroom", "Veilshroom", 3),
      placement("three", "melon", "Melon"),
    ]);

    expect(rows).toEqual([
      { id: "veilshroom", name: "Veilshroom", count: 2 },
      { id: "melon", name: "Melon", count: 1 },
    ]);
  });

  it("uses names as a stable tie-breaker", () => {
    expect(summarizePlacements([
      placement("one", "wart", "Nether Wart"),
      placement("two", "cocoa", "Cocoa Beans"),
    ]).map((row) => row.name)).toEqual(["Cocoa Beans", "Nether Wart"]);
  });
});
