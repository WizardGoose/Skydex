import { describe, expect, it } from "vitest";
import { visibleProfileStatus } from "../useNetworth";

describe("visibleProfileStatus", () => {
  it("loads when the ready snapshot belongs to the previous profile", () => {
    expect(visibleProfileStatus("ready", false, true)).toBe("loading");
  });

  it("surfaces an initial load error instead of presenting it as endless loading", () => {
    expect(visibleProfileStatus("error", false, true)).toBe("error");
  });

  it("keeps matching cached data visible through ready and stale-error states", () => {
    expect(visibleProfileStatus("ready", true, true)).toBe("ready");
    expect(visibleProfileStatus("error", true, true)).toBe("error");
    expect(visibleProfileStatus("ready", true, false)).toBe("ready");
  });

  it("does not invent a load without credentials", () => {
    expect(visibleProfileStatus("idle", false, false)).toBe("needsKey");
  });
});
