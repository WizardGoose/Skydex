import { describe, expect, it } from "vitest";
import { accessoryPowerStats, normalizeAccessoryPowerName } from "../powerStats";

describe("accessory Power stats", () => {
  it("scales the selected Power from the player's current Magical Power", () => {
    const stats = accessoryPowerStats("Forceful", 250);
    expect(stats.map(({ key, value }) => [key, value])).toEqual([
      ["strength", 174],
      ["health", 16],
      ["critDamage", 46],
    ]);
  });

  it("normalizes API-style Power names and preserves negative stats", () => {
    expect(normalizeAccessoryPowerName("  Bonus-Attack Power ")).toBe("bonusattackpower");
    expect(accessoryPowerStats("Bizarre", 250).find((stat) => stat.key === "strength")?.value).toBe(-23);
  });

  it("makes no claim for a Power that is not in the published table", () => {
    expect(accessoryPowerStats("future_power", 250)).toEqual([]);
  });
});
