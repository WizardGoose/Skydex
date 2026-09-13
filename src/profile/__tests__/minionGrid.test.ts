import { describe, expect, it } from "vitest";
import { MINION_TIER_ROW_CLASS } from "../minionGrid";

describe("Minion detail rows", () => {
  it("keeps tier rows compact", () => {
    expect(MINION_TIER_ROW_CLASS).toContain("rounded-sm");
  });
});
