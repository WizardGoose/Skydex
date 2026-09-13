import type { ItemRequirement } from "../items/useItemData";

/**
 * What an accessory asks of you before you can have it, and whether you meet it.
 *
 * WHERE THESE COME FROM, AND WHY NOT THE WIKI
 * -------------------------------------------
 * Hypixel's own item resource carries a `requirements` array on the items that
 * have one, and for accessories it is the whole story. Measured against the
 * live catalogue: 39 of the 411 accessories carry a structured requirement,
 * broken down as 24 SLAYER, 8 TROPHY_FISHING, 6 HEART_OF_THE_MOUNTAIN and 1
 * MELODY_HAIR.
 *
 * The obvious alternative was to read requirements out of wiki prose, the way
 * `sources.ts` reads where an item comes from. That was measured before it was
 * built, and the measurement is the reason it does not exist: across all 343
 * accessory articles the wiki mentions a slayer requirement on 24 items, which
 * is the same 24 Hypixel already tells us about plus exactly 2 more, and both
 * of those two are passing mentions rather than requirements (a Spider Talisman
 * article naming the spider slayer, and similar). Wiki prose mentions a SKILL
 * level requirement on ZERO accessories.
 *
 * So prose parsing here would add no real coverage and a couple of false
 * positives, and a false requirement is worse than a missing one: it tells a
 * player they are locked out of something they can already get. Hypixel's
 * structured array is authoritative, exact, and already on the page.
 *
 * Recipes also reuse this checker. Some non-accessory recipe outputs do carry
 * a structured SKILL gate, so callers can provide levels derived from
 * `player_data.experience` and Hypixel's current skills resource. Accessory
 * callers leave that optional projection null because no accessory needs it.
 *
 * THE THREE-STATE RULE
 * --------------------
 * Every check answers met, unmet, or unknown, and unknown is not a failure.
 * A requirement we can read but cannot check against the player (no key, or a
 * progress field this codebase has not verified a path for) must leave the
 * accessory in Missing with its requirement SHOWN. Filing it under Locked
 * would be claiming the player fails something nobody measured.
 */

export type RequirementKind = "slayer" | "trophyFishing" | "heartOfTheMountain" | "skill" | "collection" | "other";

export interface Requirement {
  kind: RequirementKind;
  /** The thing to go and do, e.g. "Revenant Horror Slayer". Also the wiki target. */
  target: string;
  /** The bar, rendered after the target: "7", "Silver", "Tier 4". */
  threshold: string;
  /** Plain words telling the player how to clear it. */
  how: string;
  /** Hypixel's own type string, kept so an unrecognised one can be named honestly. */
  raw: string;
}

export type RequirementState = "met" | "unmet" | "unknown";

export interface CheckedRequirement extends Requirement {
  state: RequirementState;
  /** Where the player currently stands, when we could measure it. */
  have: string | null;
  /**
   * How far short, in the requirement's own units, or null when unmeasured or
   * already met.
   *
   * Carried as a number alongside the display strings because the attainability
   * triage has to compare gaps, and re-parsing "5" back out of a sentence built
   * for humans is the kind of round trip that breaks the first time somebody
   * improves the wording.
   */
  gap: number | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Slayer boss keys to the names players actually use.
 *
 * The API keys the bosses by their mob (`zombie`, `spider`, `wolf`), and no
 * player calls them that. The mapping is the game's own naming and matches the
 * names used in the brief for this work (Revenant, Tarantula, Sven, Voidgloom,
 * Blaze), which is the cross-check for it.
 *
 * An unrecognised key is title-cased and used as-is rather than dropped: a
 * seventh slayer added later should read as "Newthing Slayer 5", which is
 * clumsy but true, instead of vanishing from a page whose whole job is to say
 * why you cannot have something.
 */
const SLAYER_NAMES: Record<string, string> = {
  zombie: "Revenant Horror",
  spider: "Tarantula Broodfather",
  wolf: "Sven Packmaster",
  enderman: "Voidgloom Seraph",
  blaze: "Inferno Demonlord",
  vampire: "Riftstalker Bloodfiend",
};

const titleCase = (s: string): string =>
  s
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

/** Trophy fish reward tiers, weakest first. Catching a better one clears a lesser bar. */
const TROPHY_TIERS = ["bronze", "silver", "gold", "diamond"] as const;

/**
 * Turn one of Hypixel's requirement objects into something renderable.
 *
 * Returns null only for a shape too broken to describe at all. An unfamiliar
 * `type` is not broken: it becomes an `other` requirement carrying the raw
 * type, so the tile can say "this has a requirement we do not understand, see
 * the wiki" rather than silently pretending the item is freely available.
 */
export function readRequirement(raw: ItemRequirement | unknown): Requirement | null {
  if (!isObject(raw) || typeof raw.type !== "string" || !raw.type) return null;
  const type = raw.type;

  if (type === "SLAYER") {
    const boss = typeof raw.slayer_boss_type === "string" ? raw.slayer_boss_type : "";
    const level = typeof raw.level === "number" ? raw.level : null;
    if (!boss || level === null) return null;
    const name = SLAYER_NAMES[boss] ?? titleCase(boss);
    return {
      kind: "slayer",
      target: `${name} Slayer`,
      threshold: String(level),
      how: `Level ${name} slayer to ${level}.`,
      raw: type,
    };
  }

  if (type === "TROPHY_FISHING") {
    const fish = typeof raw.trophy_type === "string" ? raw.trophy_type : "";
    const reward = typeof raw.reward === "string" ? raw.reward : "";
    if (!fish || !reward) return null;
    return {
      kind: "trophyFishing",
      target: `${titleCase(fish)} trophy fish`,
      threshold: titleCase(reward),
      how: `Catch a ${titleCase(reward)} ${titleCase(fish)} in the Crimson Isle.`,
      raw: type,
    };
  }

  if (type === "HEART_OF_THE_MOUNTAIN") {
    const tier = typeof raw.tier === "number" ? raw.tier : null;
    if (tier === null) return null;
    return {
      kind: "heartOfTheMountain",
      target: "Heart of the Mountain",
      threshold: `Tier ${tier}`,
      how: `Reach Heart of the Mountain tier ${tier} in the Dwarven Mines.`,
      raw: type,
    };
  }

  if (type === "SKILL") {
    const skill = typeof raw.skill === "string" ? raw.skill : "";
    const level = typeof raw.level === "number" ? raw.level : null;
    if (!skill || level === null) return null;
    const name = titleCase(skill);
    return {
      kind: "skill",
      target: name,
      threshold: String(level),
      how: `Reach ${name} level ${level}.`,
      raw: type,
    };
  }

  // Known to exist, not understood in detail. Named honestly rather than hidden.
  return {
    kind: "other",
    target: titleCase(type),
    threshold: "",
    how: "The wiki article explains this one.",
    raw: type,
  };
}

/* -------------------------------------------------------------------------- */
/* The player's side                                                          */
/* -------------------------------------------------------------------------- */

export interface PlayerProgress {
  /** Slayer boss key to the level reached, or null when the member carried none. */
  slayerLevels: Record<string, number> | null;
  /** Trophy fish counts, keyed exactly as Hypixel keys them ("frog_silver"). */
  trophyFish: Record<string, number> | null;
  /** Resource skill key to the level derived from Hypixel's current XP ladder. */
  skillLevels?: Record<string, number> | null;
}

export const NO_PROGRESS: PlayerProgress = { slayerLevels: null, trophyFish: null, skillLevels: null };

/**
 * Read a player's slayer levels.
 *
 * From `claimed_levels`, NOT from `xp`, and that choice is the same one the
 * collection gate makes for the same reason. `slayer.slayer_bosses.<boss>` has
 * both: an `xp` total, and a `claimed_levels` object of `level_1 ... level_9`
 * booleans. The booleans are the game's own record of which levels the player
 * has actually reached, so reading them needs no XP curve at all, and needing
 * no curve means there is no table to source, no rebalance to track, and
 * nothing to get quietly wrong.
 *
 * A boss with no `claimed_levels` is reported as level 0 only if it has some
 * other trace of being played; a member with no slayer object at all yields
 * null, which is "we do not know" rather than "you have no slayer levels".
 */
export function readSlayerLevels(member: unknown): Record<string, number> | null {
  if (!isObject(member)) return null;
  const slayer = isObject(member.slayer) ? member.slayer : null;
  const bosses = slayer && isObject(slayer.slayer_bosses) ? slayer.slayer_bosses : null;
  if (!bosses) return null;

  const levels: Record<string, number> = {};
  for (const [boss, data] of Object.entries(bosses)) {
    if (!isObject(data)) continue;
    let best = 0;
    const claimed = isObject(data.claimed_levels) ? data.claimed_levels : null;
    if (claimed) {
      for (const [key, value] of Object.entries(claimed)) {
        if (value !== true) continue;
        const n = Number(key.replace(/^level_/, ""));
        if (Number.isInteger(n) && n > best) best = n;
      }
    }
    levels[boss] = best;
  }

  return Object.keys(levels).length > 0 ? levels : null;
}

/** Read the trophy fish tally. Same null-versus-empty discipline as everywhere. */
export function readTrophyFish(member: unknown): Record<string, number> | null {
  if (!isObject(member)) return null;
  const raw = member.trophy_fish;
  if (!isObject(raw)) return null;

  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    counts[key] = value;
  }
  return counts;
}

export function readProgress(member: unknown): PlayerProgress {
  return { slayerLevels: readSlayerLevels(member), trophyFish: readTrophyFish(member), skillLevels: null };
}

/* -------------------------------------------------------------------------- */
/* The check                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Measure one requirement against one player.
 *
 * `unknown` is returned whenever the answer would otherwise be a guess: no
 * profile at all, a progress field this codebase has not verified a path for
 * (Heart of the Mountain), or a requirement type we do not understand. The
 * caller must leave those in Missing and simply show the requirement.
 */
export function checkRequirement(req: Requirement, progress: PlayerProgress): CheckedRequirement {
  const unknown = (): CheckedRequirement => ({ ...req, state: "unknown", have: null, gap: null });

  if (req.kind === "slayer") {
    if (!progress.slayerLevels) return unknown();
    // The boss key is recoverable from the target, but reading it back out of a
    // display string would be fragile, so the lookup goes the other way: find
    // the boss whose display name built this target.
    const boss = Object.keys(SLAYER_NAMES).find((k) => `${SLAYER_NAMES[k]} Slayer` === req.target);
    const key = boss ?? Object.keys(progress.slayerLevels).find((k) => `${titleCase(k)} Slayer` === req.target);
    if (!key) return unknown();

    const have = progress.slayerLevels[key] ?? 0;
    const need = Number(req.threshold);
    if (!Number.isFinite(need)) return unknown();
    const met = have >= need;
    return { ...req, state: met ? "met" : "unmet", have: String(have), gap: met ? null : need - have };
  }

  if (req.kind === "trophyFishing") {
    if (!progress.trophyFish) return unknown();
    const fish = req.target.replace(/\s+trophy fish$/i, "").toLowerCase().replace(/\s+/g, "_");
    const needed = req.threshold.toLowerCase();
    const from = TROPHY_TIERS.indexOf(needed as (typeof TROPHY_TIERS)[number]);
    if (from < 0) return unknown();

    // A better catch clears a lesser bar, so every tier from the required one
    // upwards counts.
    let best = -1;
    for (let i = 0; i < TROPHY_TIERS.length; i++) {
      if ((progress.trophyFish[`${fish}_${TROPHY_TIERS[i]}`] ?? 0) > 0) best = i;
    }
    if (best >= from) return { ...req, state: "met", have: titleCase(TROPHY_TIERS[best]), gap: null };
    return {
      ...req,
      state: "unmet",
      have: best < 0 ? "none caught" : titleCase(TROPHY_TIERS[best]),
      // Tiers short, counting a never-caught fish as one below bronze.
      gap: from - best,
    };
  }

  if (req.kind === "skill") {
    if (!progress.skillLevels) return unknown();
    const key = Object.keys(progress.skillLevels).find((candidate) => titleCase(candidate) === req.target);
    const need = Number(req.threshold);
    if (!key || !Number.isFinite(need)) return unknown();
    const have = progress.skillLevels[key] ?? 0;
    const met = have >= need;
    return { ...req, state: met ? "met" : "unmet", have: String(have), gap: met ? null : need - have };
  }

  /*
   * Heart of the Mountain is deliberately never checked.
   *
   * The tier lives behind `mining_core`, and the profile dump this work was
   * built against truncates that object before reaching the field, so there is
   * no verified path to read and no keyless endpoint publishing the tier curve
   * to derive one from. Guessing either would be exactly the confident-wrong
   * failure the rest of this codebase refuses. The requirement is still read
   * and still shown on the tile, which is the useful half; only the "and you
   * do not meet it" claim is withheld.
   */
  return unknown();
}
