import { describe, expect, it } from "vitest";
import { checkStorageIdentity } from "../storageIdentity";

const playerUuid = "12345678-1234-1234-1234-1234567890ab";
const otherUuid = "abcdefab-cdef-cdef-cdef-abcdefabcdef";

const snapshot = (over: {
  uuid?: string;
  playerName?: string;
  profileName?: string;
} = {}) => ({
  player: {
    uuid: over.uuid ?? playerUuid,
    name: over.playerName ?? "Wizard",
  },
  profile: {
    name: over.profileName ?? "Pomegranate",
    gameMode: "ironman",
  },
});

describe("Storage snapshot identity", () => {
  it("matches UUIDs across dashed forms without relying on player display names", () => {
    expect(checkStorageIdentity(snapshot({ playerName: "Different Display Name" }), {
      playerUuids: [playerUuid.replaceAll("-", "").toUpperCase()],
      profileName: "pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "match", hasExpectedIdentity: true });
  });

  it("rejects a snapshot from another account", () => {
    expect(checkStorageIdentity(snapshot({ uuid: otherUuid }), {
      playerUuids: [playerUuid],
      profileName: "Pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "mismatch", hasExpectedIdentity: true });
  });

  it("rejects a snapshot from another selected profile on the same account", () => {
    expect(checkStorageIdentity(snapshot({ profileName: "Papaya" }), {
      playerUuids: [playerUuid],
      profileName: "Pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "mismatch", hasExpectedIdentity: true });
  });

  it("withholds a snapshot with a blank profile name when the selected profile is known", () => {
    expect(checkStorageIdentity(snapshot({ profileName: "" }), {
      playerUuids: [playerUuid],
      profileName: "Pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "unknown", hasExpectedIdentity: true });
  });

  it("withholds a snapshot whose UUID is unavailable while a connected UUID is known", () => {
    expect(checkStorageIdentity(snapshot({ uuid: "" }), {
      playerUuids: [playerUuid],
      profileName: "Pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "unknown", hasExpectedIdentity: true });
  });

  it("flags conflicting connected UUID sources instead of picking one", () => {
    expect(checkStorageIdentity(snapshot(), {
      playerUuids: [playerUuid, otherUuid],
      profileName: "Pomegranate",
      hasConnectedAccount: true,
    })).toEqual({ state: "mismatch", hasExpectedIdentity: true });
  });

  it("waits for UUID resolution when only a saved account name is present", () => {
    expect(checkStorageIdentity(snapshot({ playerName: "Saved Name" }), {
      playerUuids: [],
      hasConnectedAccount: true,
    })).toEqual({ state: "unknown", hasExpectedIdentity: true });
  });

  it("allows a mod-only snapshot when no connected identity exists", () => {
    expect(checkStorageIdentity(snapshot(), { playerUuids: [], hasConnectedAccount: false }))
      .toEqual({ state: "unknown", hasExpectedIdentity: false });
  });
});
