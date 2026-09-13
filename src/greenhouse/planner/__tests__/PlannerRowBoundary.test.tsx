import { describe, expect, it } from "vitest";
import { PlannerRowBoundary } from "../PlannerRowBoundary";

describe("the planner row render boundary", () => {
  it("keeps an unchanged sibling row out of a progress update", () => {
    const node = { id: "wheat" };
    const compare = (PlannerRowBoundary as unknown as {
      compare: (previous: unknown, next: unknown) => boolean;
    }).compare;

    expect(
      compare(
        { node, index: 0, signature: "0", renderRow: () => null },
        { node, index: 0, signature: "0", renderRow: () => null },
      ),
    ).toBe(true);
  });

  it("re-renders the changed row and rows whose zebra position moved", () => {
    const node = { id: "wheat" };
    const compare = (PlannerRowBoundary as unknown as {
      compare: (previous: unknown, next: unknown) => boolean;
    }).compare;

    expect(
      compare(
        { node, index: 0, signature: "0", renderRow: () => null },
        { node, index: 0, signature: "1", renderRow: () => null },
      ),
    ).toBe(false);
    expect(
      compare(
        { node, index: 0, signature: "0", renderRow: () => null },
        { node, index: 1, signature: "0", renderRow: () => null },
      ),
    ).toBe(false);
  });
});
