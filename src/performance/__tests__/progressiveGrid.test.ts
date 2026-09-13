import { describe, expect, it } from "vitest";
import { nextProgressiveCount } from "../progressiveGrid";

describe("progressive grid window", () => {
  it("adds one bounded batch without skipping entries", () => {
    expect(nextProgressiveCount(24, 189, 24)).toBe(48);
  });

  it("clamps the final batch to the actual result count", () => {
    expect(nextProgressiveCount(168, 189, 24)).toBe(189);
  });

  it("normalises invalid counts rather than creating an endless observer loop", () => {
    expect(nextProgressiveCount(-5, 12, 0)).toBe(1);
    expect(nextProgressiveCount(30, 12, 24)).toBe(12);
  });
});
