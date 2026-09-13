import { describe, expect, it } from "vitest";
import { readProfileApiDetails } from "../profileApiDetails";

describe("readProfileApiDetails", () => {
  it("preserves future Slayer keys and reads the game-stated claimed level", () => {
    const details = readProfileApiDetails({
      slayer: {
        slayer_bosses: {
          spectre: {
            xp: 12_345,
            claimed_levels: { level_1: true, level_2: true, level_3: false },
          },
        },
      },
    });

    expect(details.slayers).toEqual([{ key: "spectre", level: 2, xp: 12_345 }]);
  });

  it("keeps an absent section distinct from a stated empty section", () => {
    expect(readProfileApiDetails({})).toEqual({ slayers: null, securedTimecharms: null });
    expect(readProfileApiDetails({ rift: { gallery: { secured_trophies: [] } } }).securedTimecharms).toEqual([]);
  });

  it("preserves unknown Timecharm types and removes duplicate trophy records", () => {
    const details = readProfileApiDetails({
      rift: {
        gallery: {
          secured_trophies: [
            { type: "RIFT_TROPHY_FUTURE", timestamp: 123, visits: 4 },
            { type: "RIFT_TROPHY_FUTURE", timestamp: 456, visits: 8 },
            { type: "", timestamp: 999 },
          ],
        },
      },
    });

    expect(details.securedTimecharms).toEqual([
      { key: "RIFT_TROPHY_FUTURE", timestamp: 123, visits: 4 },
    ]);
  });
});
