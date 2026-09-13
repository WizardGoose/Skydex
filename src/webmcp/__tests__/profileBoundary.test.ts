import { describe, expect, it, vi } from "vitest";
import { loadProfileSnapshot, type ProfileLoadDependencies } from "../profile";

const stop = new Error("stop after boundary assertion");

const dependencies = (): ProfileLoadDependencies => ({
  connectedAccess: vi.fn(() => ({
    key: "browser-secret",
    uuid: "connected-uuid",
    name: "ConnectedPlayer",
    profileId: "connected-profile",
  })),
  hasConnectedAccess: vi.fn(() => true),
  resolvePlayer: vi.fn(async () => ({
    ok: true as const,
    value: { uuid: "public-uuid", name: "TheWizardGoose" },
  })),
  loadSources: vi.fn(async () => {
    throw stop;
  }),
  loadSkillDefinitions: vi.fn(async () => null),
  now: vi.fn(() => 1_000),
});

describe("WebMCP profile privacy boundary", () => {
  it("never reads connected browser identity for an explicit public player", async () => {
    const stubs = dependencies();

    await expect(loadProfileSnapshot({
      player: "TheWizardGoose",
      profileId: "public-profile",
    }, stubs)).rejects.toBe(stop);

    expect(stubs.resolvePlayer).toHaveBeenCalledWith("TheWizardGoose");
    expect(stubs.connectedAccess).not.toHaveBeenCalled();
    expect(stubs.hasConnectedAccess).not.toHaveBeenCalled();
    expect(stubs.loadSources).toHaveBeenCalledWith({
      key: "",
      uuid: "public-uuid",
      name: "TheWizardGoose",
      profileId: "public-profile",
    });
  });

  it("requires a player when this browser has no linked account", async () => {
    const stubs = dependencies();
    stubs.hasConnectedAccess = vi.fn(() => false);

    await expect(loadProfileSnapshot({ player: null, profileId: null }, stubs))
      .rejects.toMatchObject({
        code: "needs_player",
        message: expect.stringContaining("No player is linked in this browser"),
      });

    expect(stubs.connectedAccess).toHaveBeenCalledOnce();
    expect(stubs.resolvePlayer).not.toHaveBeenCalled();
    expect(stubs.loadSources).not.toHaveBeenCalled();
  });

  it("does not silently fall back when an explicit profile ID is absent", async () => {
    const stubs = dependencies();
    stubs.loadSources = vi.fn(async () => ({ profileId: "different-profile" }) as never);

    await expect(loadProfileSnapshot({
      player: "TheWizardGoose",
      profileId: "requested-profile",
    }, stubs)).rejects.toMatchObject({
      code: "profile_not_found",
      message: expect.stringContaining("requested-profile"),
    });
  });
});
