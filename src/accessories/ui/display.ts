import { RARITY, RARITY_TILE_UNKNOWN as KIT_TILE_UNKNOWN, rarityTileClass as kitRarityTileClass } from "../../ui/kit";
import type { AccessoryView, CheckedRequirement, RequirementState } from "./types";

/**
 * Rarity colour for an accessory tier.
 *
 * `RARITY` in the kit is the base and stays authoritative for the five tiers it
 * defines. It carries only those five, and accessories run past them, so the
 * tiers it omits are added here against the same `--color-rarity-*` tokens the
 * Items page already uses. That is the existing namespace, not a second one:
 * inventing a colour for MYTHIC would break the lock, and greying it out would
 * throw away real game data the tile is meant to show.
 *
 * Anything still unrecognised, including a null tier, falls back to neutral.
 * We never guess a rarity.
 */
const RARITY_TEXT: Record<string, string> = {
  ...RARITY,
  mythic: "text-rarity-mythic",
  divine: "text-rarity-divine",
  special: "text-rarity-special",
  "very special": "text-rarity-very-special",
  supreme: "text-rarity-supreme",
};

/** Neutral. Used when the tier is null or is a name we do not have a colour for. */
export const RARITY_UNKNOWN = "text-slate-300";

/**
 * The rarity tile classes moved to the kit (the rarity tile became the
 * slot language of the whole profile, so the map this module
 * grew for its hover band became sitewide law). These re-exports keep every
 * accessories call site working against the one authoritative map in
 * `ui/kit.tsx` rather than a private copy that could drift.
 */
export const RARITY_TILE_UNKNOWN = KIT_TILE_UNKNOWN;

export function rarityTileClass(tier: string | null): string {
  return kitRarityTileClass(tier);
}

/**
 * Tiers arrive in whatever shape the source used, so `VERY_SPECIAL`, `Very
 * Special` and `very special` all have to land on one key.
 */
export function rarityClass(tier: string | null): string {
  if (!tier) return RARITY_UNKNOWN;
  const key = tier.trim().toLowerCase().replace(/_/g, " ");
  return RARITY_TEXT[key] ?? RARITY_UNKNOWN;
}

/**
 * Collection tiers are written in Roman numerals in game, so "Acacia Log VI"
 * is what a player is looking for on their collections screen and "Acacia Log
 * 6" is not.
 *
 * Anything outside the range this can express (zero, negative, fractional, or
 * absurdly large) falls back to the plain number rather than emitting nonsense.
 */
const NUMERALS: ReadonlyArray<readonly [number, string]> = [
  [1000, "M"],
  [900, "CM"],
  [500, "D"],
  [400, "CD"],
  [100, "C"],
  [90, "XC"],
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

export function roman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) return String(n);
  let left = n;
  let out = "";
  for (const [value, numeral] of NUMERALS) {
    while (left >= value) {
      out += numeral;
      left -= value;
    }
  }
  return out;
}

/**
 * A requirement, written the way it goes on a tile.
 *
 * Kept apart from the rendering so the wording is testable and so the tile can
 * set the figures in tabular mono while the words stay in the body face.
 *
 * `have` is null when the requirement is understood but the player's side of it
 * was never measured, which is a different sentence from "you have zero" and
 * must read differently on screen.
 */
export interface RequirementLine {
  /** "Revenant Horror Slayer 7", the bar to clear. */
  label: string;
  /** "5", where the player stands, or null when nobody measured. */
  have: string | null;
  /** Plain words telling them how to clear it. */
  how: string;
  state: RequirementState;
}

const lineOf = (req: CheckedRequirement): RequirementLine => ({
  // Threshold is empty for a requirement kind we do not understand in detail,
  // and joining on a space would leave a trailing one.
  label: req.threshold ? `${req.target} ${req.threshold}` : req.target,
  have: req.have,
  how: req.how,
  state: req.state,
});

/** Every requirement on an accessory, in the order the data carries them. */
export function requirementLines(entry: AccessoryView): RequirementLine[] {
  return entry.checked.map(lineOf);
}

/**
 * The one requirement that locked this accessory, or null.
 *
 * Only ever a requirement measured as unmet. An unmet one is what puts the
 * tile in the Locked zone, so this is the line that has to answer "why".
 */
export function blockingLine(entry: AccessoryView): RequirementLine | null {
  return entry.blockedBy ? lineOf(entry.blockedBy) : null;
}

/**
 * Requirements worth showing on a tile that is NOT locked.
 *
 * A met requirement is noise: the player has already cleared it and the tile is
 * about what stands between them and the item. An unknown one is the useful
 * case, and the only one kept, because it is how somebody with no profile (or
 * with a requirement we cannot measure) still learns what the thing asks.
 */
export function openRequirementLines(entry: AccessoryView): RequirementLine[] {
  return requirementLines(entry).filter((l) => l.state === "unknown");
}

/**
 * The profile-specific tooltip fact, without turning missing measurements into
 * a sentence-long disclaimer. The detailed requirement or recipe sits in its
 * own section; this row only answers what the loaded profile proves.
 */
export function readinessSummary(entry: Pick<AccessoryView, "readiness" | "ownedPrerequisite">): string {
  switch (entry.readiness.kind) {
    case "owned": return "Owned";
    case "collectionLocked": return "Collection locked";
    case "progressionLocked": return "Progression locked";
    case "nextUpgrade": return entry.ownedPrerequisite ? `Owns ${entry.ownedPrerequisite.name}` : "Next upgrade";
    case "materialsUnknown": return "Materials not checked";
    case "currencyUnknown": return "Funds not checked";
    case "timeWindow": return "Availability not checked";
    case "rngUnknown": return "Drop not recorded";
    case "unavailable": return "Unavailable";
    case "routeKnown": return "Route known";
    case "unknown": return "Not available";
  }
}

/**
 * Search over the fields a player would actually type: the item's name, and the
 * family it belongs to so that "wolf" finds the whole Wolf line.
 */
export function matchesQuery(entry: AccessoryView, needle: string): boolean {
  if (!needle) return true;
  if (entry.name.toLowerCase().includes(needle)) return true;
  return (entry.family ?? "").toLowerCase().includes(needle);
}
