import type { LoadoutStatement } from "./parseItems";

const DEFAULT_LOADOUT_SLOTS = 12;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const upgradeKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");

const isGeneralLoadoutUpgrade = (key: string): boolean => {
  if (!key.includes("loadout")) return false;
  return !key.includes("hotm") && !key.includes("hotf") && !key.includes("mountain") && !key.includes("forest");
};

/**
 * Number of loadout slots this profile can actually use.
 *
 * The API emits all 18 potential entries, including locked ones. The base
 * menu contains 12 usable slots and the 0.26 Community Upgrade adds one slot
 * per claimed tier. Missing profile-level upgrade data stays `null`: callers
 * must not turn uncertainty into a locked claim.
 */
export const readUnlockedLoadoutSlots = (
  communityUpgrades: unknown,
  loadouts: readonly LoadoutStatement[],
): number | null => {
  const community = asRecord(communityUpgrades);
  if (!community || !Array.isArray(community.upgrade_states)) return null;

  let tier = 0;
  for (const rawState of community.upgrade_states) {
    const state = asRecord(rawState);
    if (!state || typeof state.upgrade !== "string") continue;
    const key = upgradeKey(state.upgrade);
    if (!isGeneralLoadoutUpgrade(key)) continue;
    const statedTier = typeof state.tier === "number" && Number.isInteger(state.tier) && state.tier > 0
      ? state.tier
      : 0;
    const claimed = (typeof state.claimed_ms === "number" && Number.isFinite(state.claimed_ms)) || state.claimed === true;
    if (claimed) tier = Math.max(tier, statedTier);
  }

  const highestConfigured = loadouts.reduce((highest, loadout) => {
    const configured =
      loadout.armorSetId !== null ||
      loadout.equipmentSetId !== null ||
      loadout.petUuid !== null ||
      loadout.powerStone !== null ||
      loadout.tuningSlot !== null ||
      loadout.miningTreeSlot != null ||
      loadout.foragingTreeSlot != null ||
      loadout.name.trim().toLowerCase() !== `loadout ${loadout.id}`;
    return configured ? Math.max(highest, loadout.id) : highest;
  }, 0);
  const highestKnownSlot = loadouts.reduce((highest, loadout) => Math.max(highest, loadout.id), 0);
  return Math.min(highestKnownSlot, Math.max(DEFAULT_LOADOUT_SLOTS + tier, highestConfigured));
};
