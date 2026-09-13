import { describe, expect, it } from "vitest";
import { acquisitionFor, acquisitionMethods, acquisitionSummary, hasDirectAcquisition } from "../acquisition";

describe("shard acquisition guidance", () => {
  it("distinguishes actual gathering methods without treating fusion as gathering", () => {
    expect(acquisitionMethods("U18")).toEqual(["Black Hole", "Charm"]);
    expect(acquisitionMethods("C5")).toEqual(["Traps", "Fishing", "Fishing Net"]);
    expect(acquisitionMethods("C1")).toEqual([]);
    expect(acquisitionMethods("UNKNOWN")).toEqual([]);
  });
  it("preserves known hunting locations from the earlier fusion catalogue", () => {
    expect(acquisitionFor("C4")).toContain("Place Hunting Traps in Galatea. (On Land).");
    expect(acquisitionSummary("L15")).toMatch(/Kuudra/i);
    expect(acquisitionFor("E39").join(" ")).toMatch(/Sphinx/i);
  });

  it("keeps unmapped new shards honest", () => {
    expect(acquisitionFor("UNKNOWN")).toEqual([]);
    expect(acquisitionSummary("UNKNOWN")).toBe("Location not yet mapped");
  });

  it("summarizes every acquisition method instead of choosing only the trap location", () => {
    expect(acquisitionSummary("C20")).toBe("Pocket Black Hole · Charm · Hunting Traps");
    expect(acquisitionSummary("E6")).toBe("Fusion · Charm · Hunting Traps");
    expect(acquisitionSummary("C4")).toBe("Lasso · Hunting Traps · Tree Gifts");
    expect(acquisitionFor("C20").join(" ")).toContain("Murkwater Shallows");
  });

  it("treats Kraken as directly acquirable even though its rate is calculated", () => {
    expect(hasDirectAcquisition("L15", 0)).toBe(true);
    expect(hasDirectAcquisition("C4", 12)).toBe(true);
    expect(hasDirectAcquisition("C1", 0)).toBe(false);
  });
});
