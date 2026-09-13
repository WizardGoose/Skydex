import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PROFILE_TAB_STORAGE_KEY,
  PROFILE_TABS,
  PROFILE_TAB_TTL_MS,
  profilePrimaryTab,
  profileTabFromSearch,
  readRememberedProfileTab,
  resolveProfileTab,
  selectProfileTab,
  type ProfileTabStorage,
} from "../profileTabs";
import { profileStatusView } from "../profileStatus";

class MemoryStorage implements ProfileTabStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Profile tab URL and session persistence", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00.000Z"));
    storage = new MemoryStorage();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("expires the remembered tab at five minutes and falls back to Gear", () => {
    const selectedAt = Date.now();
    selectProfileTab("", "pets", storage, selectedAt);

    vi.advanceTimersByTime(PROFILE_TAB_TTL_MS - 1);
    expect(readRememberedProfileTab(storage)).toEqual({ tab: "pets", selectedAt });

    vi.advanceTimersByTime(1);
    expect(readRememberedProfileTab(storage)).toBeNull();
    expect(resolveProfileTab("", storage)).toBe("gear");
  });

  it("renews the timestamp on a fresh selection", () => {
    const first = Date.now();
    selectProfileTab("", "pets", storage, first);

    vi.advanceTimersByTime(PROFILE_TAB_TTL_MS - 1_000);
    const renewed = Date.now();
    const search = selectProfileTab("?settings=1", "inventory", storage, renewed);

    vi.advanceTimersByTime(1_000);
    expect(resolveProfileTab(search, storage)).toBe("inventory");

    // The first timestamp would have expired now; the deliberate second click
    // is what keeps this preference alive for another full window.
    vi.advanceTimersByTime(PROFILE_TAB_TTL_MS - 1_001);
    expect(readRememberedProfileTab(storage)?.tab).toBe("inventory");
  });

  it("survives a remount or HMR-style module consumer restart", () => {
    const selectedAt = Date.now();
    selectProfileTab("?settings=1", "network", storage, selectedAt);

    // A new hook instance has no React state from the old one. It only needs
    // the same session storage and the current route query.
    expect(resolveProfileTab("?settings=1", storage, selectedAt + 1)).toBe("network");
    expect(resolveProfileTab("?settings=1", storage, selectedAt + 1)).toBe("network");
    expect(JSON.parse(storage.getItem(PROFILE_TAB_STORAGE_KEY) as string).tab).toBe("network");
  });

  it("preserves unrelated query state and makes URL navigation back/forward-safe", () => {
    const first = selectProfileTab("?settings=1&box=chests", "pets", storage);
    const second = selectProfileTab(first, "inventory", storage, Date.now() + 1);

    expect(first).toContain("settings=1");
    expect(first).toContain("box=chests");
    expect(profileTabFromSearch(first)).toBe("pets");
    expect(profileTabFromSearch(second)).toBe("inventory");

    // A browser back entry is a URL read, not a new session write. It must
    // restore the old tab instead of being replaced by local component state.
    expect(resolveProfileTab(first, storage)).toBe("pets");
    expect(resolveProfileTab(second, storage)).toBe("inventory");
  });

  it("accepts the established networth URL as the Network tab", () => {
    expect(profileTabFromSearch("?tab=networth")).toBe("network");
    expect(profileTabFromSearch("?tab=network")).toBe("network");
    expect(selectProfileTab("?tab=gear", "network", storage)).toBe("?tab=networth");
    expect(readRememberedProfileTab(storage)?.tab).toBe("network");
    expect(profileTabFromSearch("?tab=not-a-profile-tab")).toBeNull();
  });

  it("groups Garden and Dungeons under Skills without changing their deep links", () => {
    expect(profilePrimaryTab("skills")).toBe("skills");
    expect(profilePrimaryTab("garden")).toBe("skills");
    expect(profilePrimaryTab("dungeons")).toBe("skills");
    expect(profileTabFromSearch("?tab=garden")).toBe("garden");
    expect(profileTabFromSearch("?tab=dungeons")).toBe("dungeons");
  });

  it("round-trips every Profile section through its URL value", () => {
    for (const tab of PROFILE_TABS) {
      const search = selectProfileTab("?settings=1", tab, storage);
      expect(search).toContain("settings=1");
      expect(profileTabFromSearch(search)).toBe(tab);
    }
  });

  it("drops malformed and future session records", () => {
    storage.setItem(PROFILE_TAB_STORAGE_KEY, "{not json");
    expect(readRememberedProfileTab(storage)).toBeNull();

    storage.setItem(PROFILE_TAB_STORAGE_KEY, JSON.stringify({ tab: "pets", selectedAt: Date.now() + 1 }));
    expect(readRememberedProfileTab(storage)).toBeNull();
  });
});

describe("Profile data status", () => {
  beforeEach(() => {
    // Keep these state assertions deterministic even if a future model grows
    // an expiry timer of its own.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T18:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the final layout skeleton while loading without a cache", () => {
    expect(profileStatusView("loading", false)).toMatchObject({
      phase: "loading",
      dataVisible: false,
      showSkeleton: true,
      showError: false,
    });
  });

  it("shows an explicit Settings state when no Minecraft profile is connected", () => {
    expect(profileStatusView("needsKey", false)).toMatchObject({
      phase: "no-key",
      dataVisible: false,
      showNoKey: true,
      label: "Connect your Minecraft profile in Settings to load your profile.",
    });
  });

  it("keeps cached data visible with stale and error labels after failure", () => {
    expect(profileStatusView("error", true)).toMatchObject({
      phase: "stale",
      hasCache: true,
      dataVisible: true,
      isStale: true,
      showError: true,
      label: "Showing cached profile data. Refresh failed.",
    });
  });

  it("does not turn an uncached failure into successful empty content", () => {
    expect(profileStatusView("error", false)).toMatchObject({
      phase: "error",
      dataVisible: false,
      showSkeleton: false,
      showError: true,
      label: "Profile data could not be loaded.",
    });
  });
});
