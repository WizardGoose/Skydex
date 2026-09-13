import { describe, expect, it } from "vitest";
import { summarizeSearchCoverage } from "../coverage";

describe("summarizeSearchCoverage", () => {
  it("counts the three searchable data areas without counting site or wiki rows", () => {
    expect(
      summarizeSearchCoverage([
        { destination: "site" },
        { destination: "items" },
        { destination: "items" },
        { destination: "greenhouse" },
        { destination: "shards" },
        { destination: "wiki" },
      ])
    ).toEqual({ items: 2, greenhouse: 1, shards: 1 });
  });
});
