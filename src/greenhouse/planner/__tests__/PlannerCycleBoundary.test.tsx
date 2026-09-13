import { describe, expect, it } from "vitest";
import { PlannerCycleBoundary } from "../PlannerCycleBoundary";

describe("the planner cycle render boundary", () => {
  it("ignores a new render callback when that cycle's visible state is unchanged", () => {
    const cycle = { index: 0, produce: [] };
    const compare = (PlannerCycleBoundary as unknown as {
      compare: (previous: unknown, next: unknown) => boolean;
    }).compare;

    expect(
      compare(
        { cycle, signature: "wheat:0", renderCycle: () => null },
        { cycle, signature: "wheat:0", renderCycle: () => null },
      ),
    ).toBe(true);
  });

  it("re-renders when the cycle's progress or plan changes", () => {
    const cycle = { index: 0, produce: [] };
    const compare = (PlannerCycleBoundary as unknown as {
      compare: (previous: unknown, next: unknown) => boolean;
    }).compare;

    expect(
      compare(
        { cycle, signature: "wheat:0", renderCycle: () => null },
        { cycle, signature: "wheat:1", renderCycle: () => null },
      ),
    ).toBe(false);
    expect(
      compare(
        { cycle, signature: "wheat:0", renderCycle: () => null },
        { cycle: { ...cycle }, signature: "wheat:0", renderCycle: () => null },
      ),
    ).toBe(false);
  });
});
