import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ProfileTypeModule from "../profileType";

const PROFILE_KEY = "wizardsky.profile.v1";
const FLAVOUR_KEY = "skydex.mode-flavour.v1";
const storage = new Map<string, string>();

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  get length() {
    return storage.size;
  },
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  removeItem: (key) => void storage.delete(key),
  setItem: (key, value) => void storage.set(key, value),
};

const fresh = async () => {
  vi.resetModules();
  const profileType = await import("../profileType");
  const profile = await import("../useProfile");
  return { profileType, profile };
};

const readHook = (module: typeof ProfileTypeModule) => {
  const captured: { current?: ReturnType<typeof module.useProfileType> } = {};
  const Probe = () => {
    captured.current = module.useProfileType();
    return null;
  };
  renderToStaticMarkup(createElement(Probe));
  if (!captured.current) throw new Error("profile type hook did not render");
  return captured.current;
};

beforeEach(() => storage.clear());

describe("Converter profile type", () => {
  it("remembers the joke label while keeping Normal calculation behavior", async () => {
    const { profileType, profile } = await fresh();
    readHook(profileType).setProfileType("converter");

    expect(profile.currentProfile()).toEqual({ mode: "normal", source: "manual" });
    expect(storage.get(FLAVOUR_KEY)).toBe("converter");
    expect(readHook(profileType).profileType).toBe("converter");
    expect(JSON.parse(storage.get(PROFILE_KEY) ?? "null")).toEqual({ mode: "normal", source: "manual" });
  });

  it("clears Converter when Normal or automatic profile detection is chosen", async () => {
    const { profileType, profile } = await fresh();
    const first = readHook(profileType);
    first.setProfileType("converter");
    readHook(profileType).setProfileType("normal");

    expect(storage.has(FLAVOUR_KEY)).toBe(false);
    expect(readHook(profileType).profileType).toBe("normal");

    readHook(profileType).setProfileType("converter");
    readHook(profileType).clearOverride();
    profile.applyApiGameMode("ironman");
    expect(storage.has(FLAVOUR_KEY)).toBe(false);
    expect(readHook(profileType).profileType).toBe("ironman");
  });

  it("never presents an API-derived Normal profile as Converter", async () => {
    storage.set(FLAVOUR_KEY, "converter");
    storage.set(PROFILE_KEY, JSON.stringify({ mode: "normal", source: "api" }));
    const { profileType } = await fresh();

    expect(readHook(profileType).profileType).toBe("normal");
  });
});
