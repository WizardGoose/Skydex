import { describe, expect, it } from "vitest";
import { wikiStatusLabel } from "../wikiStatusModel";

describe("wikiStatusLabel", () => {
  const now = 10_000_000;

  it("reports syncing before any source claim", () => {
    expect(wikiStatusLabel({ syncing: true, error: null, fetchedAt: null }, now)).toBe("syncing");
  });

  it("distinguishes usable wiki data from a failed refresh", () => {
    expect(wikiStatusLabel({ syncing: false, error: "403", fetchedAt: now - 3_600_000 }, now)).toBe("wiki data 1h ago · refresh failed");
  });

  it("keeps bundled data explicit when no wiki snapshot exists", () => {
    expect(wikiStatusLabel({ syncing: false, error: "network", fetchedAt: null }, now)).toBe("bundled data · refresh failed");
  });

  it("does not claim a live source for a successful cached snapshot", () => {
    expect(wikiStatusLabel({ syncing: false, error: null, fetchedAt: now - 120_000 }, now)).toBe("wiki 2m ago");
  });
});