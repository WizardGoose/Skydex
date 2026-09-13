import type { CheckedRequirement } from "./requirements";
import type { SourceCategory } from "./sources";
import { groupFromLocation, type LocationIndex } from "./locations";

/**
 * The two lenses the page groups by.
 *
 * The framing: what I can get right now, what I can grind towards to get
 * soon, or what is long set out. That is an ironman
 * question rather than a collector's one, and it is the reason the primary
 * grouping here is attainability rather than category: a checklist that answers
 * "what do I do next" is worth more than one that merely sorts by topic.
 */

/* -------------------------------------------------------------------------- */
/* Attainability                                                              */
/* -------------------------------------------------------------------------- */

export type Attainability = "now" | "soon" | "long" | "unknownReach";

/**
 * How far away an accessory is.
 *
 *   now           nothing measurable is in the way
 *   soon          a small, measured gap: a couple of slayer levels, a
 *                 collection more than half done, one trophy tier
 *   long          a deep measured gap, or a source that is only open at
 *                 certain times of year
 *   unknownReach  something in the way that nobody measured
 *
 * WHERE THE THRESHOLDS COME FROM, HONESTLY
 * ----------------------------------------
 * They are a judgement call, and they are written here rather than buried so
 * the judgement can be argued with. Two slayer levels is "soon" because the
 * levels below 7 are hours rather than weeks; half a collection is "soon"
 * because the back half of a collection is the short half once the tools and
 * minions are running. Nothing about these is measured from play data, and if
 * they turn out to feel wrong the fix is one number in this file.
 *
 * What is NOT a judgement call is the unknown bucket. An accessory whose
 * requirement nobody could measure never lands in now, soon or long, because
 * each of those is a claim about how much work the player has left and we
 * cannot make that claim without knowing where they stand.
 */

/** Slayer levels short that still counts as a near-term errand. */
export const SOON_SLAYER_LEVELS = 2;
/** Fraction of a collection already done that counts as nearly there. */
export const SOON_COLLECTION_FRACTION = 0.5;
/** Trophy tiers short that still counts as near term. */
export const SOON_TROPHY_TIERS = 1;

/**
 * A source that is not open on demand.
 *
 * An event accessory can have every requirement met and still be unobtainable
 * today, because the event is not running. That is a real wall and it belongs
 * in `long` rather than `now`, where it would read as "go and get this" on a
 * day it cannot be got.
 *
 * Dark Auction is deliberately NOT here: it runs on a short repeating timer
 * rather than a season, so it is genuinely available today.
 */
const TIME_GATED: ReadonlySet<SourceCategory> = new Set<SourceCategory>(["event"]);

/** Is one unmet requirement a short errand? */
const isNearTerm = (req: CheckedRequirement, requiredTotal: number | null): boolean => {
  if (req.gap === null) return false;
  if (req.kind === "slayer") return req.gap <= SOON_SLAYER_LEVELS;
  if (req.kind === "trophyFishing") return req.gap <= SOON_TROPHY_TIERS;
  if (req.kind === "collection") {
    if (requiredTotal === null || requiredTotal <= 0) return false;
    const done = 1 - req.gap / requiredTotal;
    return done >= SOON_COLLECTION_FRACTION;
  }
  return false;
};

export interface AttainabilityInput {
  checked: readonly CheckedRequirement[];
  source: SourceCategory;
  /** The collection size behind a collection requirement, for the fraction. */
  collectionRequired: number | null;
}

export function attainabilityOf(input: AttainabilityInput): Attainability {
  const { checked, source } = input;

  // An unmeasured requirement outranks everything. We do not know how far away
  // this is, and any of the other three answers would be a guess about the
  // player's own progress.
  if (checked.some((r) => r.state === "unknown")) return "unknownReach";

  const unmet = checked.filter((r) => r.state === "unmet");

  if (unmet.length === 0) {
    // An unclassified source has no evidence about availability or effort. It
    // stays in review instead of being promoted to the easiest-looking band.
    if (source === "wiki") return "unknownReach";
    // Nothing measurable is in the way, but the door may only open at certain
    // times of year. `now` deliberately means no measured gate, not cheap.
    return TIME_GATED.has(source) ? "long" : "now";
  }

  // The furthest requirement sets the distance: clearing three of four leaves
  // you exactly as far away as the fourth.
  return unmet.every((r) => isNearTerm(r, input.collectionRequired)) ? "soon" : "long";
}

/* -------------------------------------------------------------------------- */
/* Category                                                                   */
/* -------------------------------------------------------------------------- */

export type AccessoryGroup =
  | "combat"
  | "mining"
  | "farming"
  | "fishing"
  | "foraging"
  | "dungeons"
  | "rift"
  | "event"
  | "other";

/**
 * Which part of the game an accessory belongs to.
 *
 * WHAT WAS TRIED AND REJECTED
 * ---------------------------
 * The wiki's own `[[Category:...]]` links were the obvious source and are not
 * usable: measured across 343 accessory articles only 137 carry any category at
 * all, and the commonest are `Talisman`, `Ring` and `Artifact`, which describe
 * the rung rather than the activity. Grouping by those would produce three
 * buckets that say nothing about what to go and do.
 *
 * So the signal is Hypixel's own data, in two layers:
 *
 *   1. the requirement, where there is one. A slayer requirement is a combat
 *      accessory by definition, a Heart of the Mountain one is mining, a trophy
 *      fishing one is fishing. This is exact and comes first.
 *   2. the stat block. `farming_fortune` is a farming accessory whatever else
 *      it does. Stat keys arrive in mixed case in the live data (`WALK_SPEED`
 *      next to `walk_speed`), so everything is lowercased before matching.
 *
 * `other` is an honest bucket, not a failure. A great many accessories give
 * walk speed or intelligence and belong to no activity in particular, and
 * inventing a home for them would make the grouping worse rather than better.
 */
const STAT_GROUPS: readonly { group: AccessoryGroup; match: RegExp }[] = [
  { group: "farming", match: /^(farming_fortune|farming_wisdom|bonus_pest_chance|pest_)/ },
  { group: "mining", match: /^(mining_speed|mining_fortune|mining_wisdom|pristine)/ },
  { group: "fishing", match: /^(sea_creature_chance|fishing_speed|trophy_fish_chance|fishing_wisdom)/ },
  { group: "foraging", match: /^(foraging_fortune|foraging_wisdom|logging|sweep)/ },
  {
    group: "combat",
    match: /^(strength|critical_|crit_|ferocity|true_defense|defense|health|damage|combat_wisdom|magic_find|bonus_attack_speed|attack_speed)/,
  },
];

export interface GroupInput {
  checked: readonly CheckedRequirement[];
  source: SourceCategory;
  /** Hypixel's stat block for the item, or null. Keys may be any case. */
  stats: Record<string, unknown> | null;
  /** Where you go to get it: merchant, NPC and zone names from its article. */
  locations?: readonly string[];
  /** Those names already resolved to activities. See `locations.ts`. */
  locationIndex?: LocationIndex;
}

export function groupOf(input: GroupInput): AccessoryGroup {
  // 1. The requirement, which is exact.
  for (const req of input.checked) {
    if (req.kind === "slayer") return "combat";
    if (req.kind === "heartOfTheMountain") return "mining";
    if (req.kind === "trophyFishing") return "fishing";
  }

  const keys = Object.keys(input.stats ?? {}).map((k) => k.toLowerCase());

  // The Rift is its own dimension with its own stats, and an accessory that
  // only works there belongs with the rest of the Rift rather than filed under
  // whatever stat it happens to grant.
  if (keys.length > 0 && keys.every((k) => k.startsWith("rift_"))) return "rift";

  // 2. The stat block.
  for (const rule of STAT_GROUPS) {
    if (keys.some((k) => rule.match.test(k))) return rule.group;
  }

  /*
   * 3. Where you go to get it.
   *
   * This is the single biggest win in this file: you buy it at the Great
   * Harvest, so it is a farming accessory. It sits below
   * the stat block on purpose, because a stat says what the item DOES and a
   * shop only says where it came from: a farming accessory sold by the Combat
   * Merchant is still a farming accessory. Where the stats are silent, which is
   * most of the catalogue, the counter it is sold at is the best evidence
   * there is. Measured: this lands 109 accessories that were otherwise Other.
   */
  const fromLocation = input.locationIndex
    ? groupFromLocation(input.locations ?? [], input.locationIndex)
    : null;
  if (fromLocation) return fromLocation;

  // 4. Failing all of that, a seasonal accessory is at least an event accessory.
  if (input.source === "event") return "event";

  return "other";
}

/** Reading order for the page. `other` last because it is the leftovers. */
export const GROUP_ORDER: readonly AccessoryGroup[] = [
  "combat",
  "mining",
  "farming",
  "fishing",
  "foraging",
  "dungeons",
  "rift",
  "event",
  "other",
];

export const GROUP_LABEL: Record<AccessoryGroup, string> = {
  combat: "Combat",
  mining: "Mining",
  farming: "Farming",
  fishing: "Fishing",
  foraging: "Foraging",
  dungeons: "Dungeons",
  rift: "Rift",
  event: "Event",
  other: "Other",
};

export const ATTAINABILITY_ORDER: readonly Attainability[] = ["now", "soon", "long", "unknownReach"];

export const ATTAINABILITY_LABEL: Record<Attainability, string> = {
  now: "No measured gate",
  soon: "Near a known requirement",
  long: "Long or time-gated",
  unknownReach: "Source needs review",
};

export const ATTAINABILITY_HINT: Record<Attainability, string> = {
  now: "",
  soon: "",
  long: "",
  unknownReach: "",
};
