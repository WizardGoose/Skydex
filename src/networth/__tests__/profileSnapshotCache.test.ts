import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_SNAPSHOT_TTL_MS,
  profileSnapshotIsFresh,
  profileSnapshotValue,
  readProfileSnapshot,
} from "../profileSnapshotCache";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("profile snapshot cache", () => {
  const value = { identity: "v1:player-profile", fetchedAt: 1_000, profileName: "Pomegranate" };
  const stored = {
    key: "latest",
    version: 2,
    identity: value.identity,
    fetchedAt: value.fetchedAt,
    value,
  };

  it("accepts only the matching identity and never crosses accounts", () => {
    expect(profileSnapshotValue<typeof value>(stored, value.identity)).toEqual(value);
    expect(profileSnapshotValue<typeof value>(stored, "v1:somebody-else")).toBeNull();
  });

  it("rejects an envelope whose identity and payload disagree", () => {
    expect(profileSnapshotValue<typeof value>({
      ...stored,
      value: { ...value, identity: "v1:somebody-else" },
    }, value.identity)).toBeNull();
  });

  it("rejects the lossy first snapshot shape so sack zeroes are fetched once", () => {
    expect(profileSnapshotValue<typeof value>({ ...stored, version: 1 }, value.identity)).toBeNull();
  });

  it("uses the same five-minute freshness boundary as the live profile store", () => {
    expect(profileSnapshotIsFresh(value, value.fetchedAt + PROFILE_SNAPSHOT_TTL_MS - 1)).toBe(true);
    expect(profileSnapshotIsFresh(value, value.fetchedAt + PROFILE_SNAPSHOT_TTL_MS)).toBe(false);
  });

  it("treats a stalled browser database as a cache miss", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("indexedDB", {
      // Deliberately never fires success, error, or blocked.
      open: () => ({}),
    });

    const read = readProfileSnapshot<typeof value>(value.identity);
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(read).resolves.toBeNull();
  });
});
