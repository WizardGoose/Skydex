import { describe, expect, it } from "vitest";
import { hasCustomRateChanges, withCustomRate } from "../customRatesModel";

describe("custom rate updates", () => {
  it("preserves rapid edits to different shards", () => {
    const first = withCustomRate({}, "cod", 12);
    const second = withCustomRate(first, "chill", 34);

    expect(second).toEqual({ cod: 12, chill: 34 });
  });

  it("only reports rates that differ from their defaults", () => {
    const defaults = { cod: 12, chill: 20 };

    expect(hasCustomRateChanges({ cod: 12, chill: undefined }, defaults)).toBe(false);
    expect(hasCustomRateChanges({ cod: 12, chill: 34 }, defaults)).toBe(true);
  });
});
