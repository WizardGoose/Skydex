import { describe, expect, it } from "vitest";
import { wikiStatusLabel } from "../wikiStatusModel";

describe("blocked Greenhouse wiki refresh status", () => {
  it("retains cached data while naming a Cloudflare-blocked live refresh honestly", () => {
    expect(
      wikiStatusLabel(
        {
          syncing: false,
          error: "Live wiki refresh blocked by Cloudflare challenge",
          fetchedAt: 6_400_000,
        },
        10_000_000
      )
    ).toBe("wiki data 1h ago · live refresh blocked");
  });

  it("does not call a blocked live refresh fresh when only bundled data remains", () => {
    expect(
      wikiStatusLabel(
        {
          syncing: false,
          error: "Live wiki refresh blocked by Cloudflare challenge",
          fetchedAt: null,
        },
        10_000_000
      )
    ).toBe("bundled data · live refresh blocked");
  });
});
