import { undash } from "./hypixel";
import type { IslandSnapshot } from "./types";

export type StorageIdentityState = "match" | "mismatch" | "unknown";

export interface StorageIdentityExpectation {
  /** Connected account UUIDs that should all describe the same player. */
  playerUuids: readonly (string | null | undefined)[];
  /** The selected profile name, when the profile API has supplied one. */
  profileName?: string | null;
  /** True while any saved/loaded account is selected, even before UUID resolution. */
  hasConnectedAccount: boolean;
}

export interface StorageIdentityCheck {
  state: StorageIdentityState;
  /** True when any connected account or profile identity is available. */
  hasExpectedIdentity: boolean;
}

const normalizedUuid = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed ? undash(trimmed) : null;
};

const normalizedProfileName = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.toLowerCase() : null;
};

/**
 * Check whether a mod snapshot can be shown beside the currently connected
 * profile. A player name is intentionally not compared: casing and display
 * names can change, while UUID is the account identity.
 *
 * A snapshot with a matching UUID remains usable when no selected profile is
 * known. Once a selected profile is known, a blank snapshot profile cannot
 * prove ownership and stays unknown. A known UUID cannot be verified against
 * a snapshot that has no UUID either, so that case is withheld by the page.
 */
export const checkStorageIdentity = (
  snapshot: Pick<IslandSnapshot, "player" | "profile"> | null,
  expected: StorageIdentityExpectation,
): StorageIdentityCheck => {
  const expectedUuids = [...new Set(expected.playerUuids
    .map(normalizedUuid)
    .filter((value): value is string => value !== null))];
  const expectedProfile = normalizedProfileName(expected.profileName);
  const hasExpectedIdentity = expected.hasConnectedAccount || expectedUuids.length > 0 || expectedProfile !== null;

  if (!snapshot) return { state: "unknown", hasExpectedIdentity };

  // Parsed profile state and saved access state should agree. If they do not,
  // neither identity is safe enough to use as a gate for old chest data.
  if (expectedUuids.length > 1) {
    return { state: "mismatch", hasExpectedIdentity: true };
  }

  const snapshotUuid = normalizedUuid(snapshot.player.uuid);
  const snapshotProfile = normalizedProfileName(snapshot.profile.name);

  if (expectedUuids.length === 1) {
    if (!snapshotUuid) return { state: "unknown", hasExpectedIdentity: true };
    if (snapshotUuid !== expectedUuids[0]) {
      return { state: "mismatch", hasExpectedIdentity: true };
    }
    if (expectedProfile && !snapshotProfile) {
      return { state: "unknown", hasExpectedIdentity: true };
    }
    if (expectedProfile && snapshotProfile && expectedProfile !== snapshotProfile) {
      return { state: "mismatch", hasExpectedIdentity: true };
    }
    return { state: "match", hasExpectedIdentity: true };
  }

  if (expected.hasConnectedAccount) {
    // A display name or profile name without the account UUID is not enough
    // to prove ownership of a snapshot. Wait for the canonical account UUID.
    return { state: "unknown", hasExpectedIdentity: true };
  }

  // No connected account means this is a mod-only/offline snapshot. Its own
  // identity remains the only honest identity available to the page. The
  // profile value is intentionally not used as an account substitute.
  return { state: "unknown", hasExpectedIdentity: false };
};
