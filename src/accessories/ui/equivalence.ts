import type { AccessoryView } from "./types";

/**
 * Accessories in these groups are alternatives, not upgrade rungs. Hypixel
 * grants Magical Power for one Hatcessory and does not stack the rest, so the
 * Missing view must not present every anniversary variant as a separate job.
 *
 * Kept explicit rather than name-stem based. A broad "hat" rule would merge
 * unrelated accessories and recreate the exact false-family bug the directed
 * upgrade graph was built to avoid.
 */
const HATCESSORY_IDS = new Set([
  "PARTY_HAT_CRAB",
  "PARTY_HAT_CRAB_ANIMATED",
  "PARTY_HAT_SLOTH",
  "BALLOON_HAT_2024",
]);

const equivalenceKey = (entry: AccessoryView): string | null => {
  if (HATCESSORY_IDS.has(entry.id.toUpperCase())) return "hatcessory";
  if (/^(?:crab|sloth) hat of celebration(?:\s*-\s*\d{4} edition)?$/i.test(entry.name.trim())) return "hatcessory";
  if (/anniversary balloon hat$/i.test(entry.name.trim())) return "hatcessory";
  return null;
};

const attainabilityRank: Record<AccessoryView["attainability"], number> = {
  now: 0,
  soon: 1,
  long: 2,
  unknownReach: 3,
};

const representative = (entries: readonly AccessoryView[]): AccessoryView => [...entries].sort((left, right) => {
  const owned = Number(right.status === "owned") - Number(left.status === "owned");
  if (owned !== 0) return owned;
  const unlocked = Number(left.status === "locked") - Number(right.status === "locked");
  if (unlocked !== 0) return unlocked;
  const reach = attainabilityRank[left.attainability] - attainabilityRank[right.attainability];
  return reach || left.name.localeCompare(right.name);
})[0];

/** Collapse only non-stacking alternatives in the visible progress filters. */
export function collapseNonStackingAccessories(entries: readonly AccessoryView[]): AccessoryView[] {
  const groups = new Map<string, AccessoryView[]>();
  for (const entry of entries) {
    const key = equivalenceKey(entry);
    if (key === null) continue;
    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  const chosen = new Map<string, AccessoryView>();
  for (const [key, group] of groups) chosen.set(key, representative(group));

  return entries.flatMap((entry) => {
    const key = equivalenceKey(entry);
    if (key === null) return [entry];
    const selected = chosen.get(key);
    if (!selected || selected.id !== entry.id) return [];
    const alternatives = groups.get(key)!
      .filter((candidate) => candidate.id !== entry.id)
      .map((candidate) => ({ id: candidate.id, name: candidate.name, tier: candidate.tier }));
    return [{ ...entry, equivalentAlternatives: alternatives }];
  });
}
