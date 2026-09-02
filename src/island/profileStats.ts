import { useSyncExternalStore } from "react";
import { chooseProfile, fetchGarden, fetchProfiles, shouldAutoRefresh, undash } from "./hypixel";
import { currentAccess, hasApiProfileAccess, writeAccess } from "./apiKey";
import { applyApiGameMode } from "../profile/useProfile";

/**
 * Greenhouse numbers, taken from Hypixel rather than from the player.
 *
 * The standing rule for this site is that any stat the API exposes gets pulled
 * from the API. Typing your own Growth Speed tier into a box is an override and
 * a keyless fallback, never the default, because the number you half remember
 * from three sessions ago is the number your whole grind estimate is built on.
 *
 * The honest result of researching this is that the API exposes exactly one of
 * the four numbers the greenhouse settings ask for. That is not a shortfall in
 * the parsing; it is what is on the wire. Each field below records what was
 * checked and where, because the failure mode here is silent: a plausible
 * looking field name that is subtly the wrong number produces a confident,
 * wrong answer, which is strictly worse than asking.
 *
 * ## What was verified, and against what
 *
 * The garden is its own endpoint, `GET /v2/skyblock/garden?profile=<id>`, and
 * its payload is where every greenhouse number lives. Sources: Hypixel's own
 * OpenAPI spec for the stable garden fields, and the DTOs EliteFarmers run in
 * production for the greenhouse fields, which the spec predates. SkyCrypt was
 * checked first, as the usual ground truth, and parses no garden data at all,
 * so it has nothing to say here.
 *
 *   garden.garden_upgrades.GROWTH_SPEED   USED. The Growth Speed upgrade tier.
 *                                         Verified as an explicit JSON name in
 *                                         EliteFarmers' `GardenDeskUpgrades`,
 *                                         where the C# property is spelled
 *                                         `GreenhouseGrowthSpeed` and therefore
 *                                         could not bind to this key without
 *                                         the attribute being real. Lines up
 *                                         with the wiki's growth formula, which
 *                                         takes a tier `u` of 0 to 9.
 *
 *   garden.garden_upgrades.PLOT_LIMIT     USED, as PURCHASED TIERS. The off by
 *                                         one that kept this manual (plots 1
 *                                         to 3, or purchased levels 0 to 2?)
 *                                         is now answered from documentation:
 *                                         the Desk UI page on the continuation
 *                                         wiki (hypixelskyblock.minecraft.wiki
 *                                         /w/The_Desk/UI) shows the upgrade
 *                                         unpurchased as "Current Tier: 0/2"
 *                                         with "Plot Limit: +0", each tier
 *                                         adding "+1 Greenhouse Plot", and The
 *                                         Garden page caps it: "Up to 3
 *                                         Greenhouse plots can be unlocked."
 *                                         So base 1, plus one per purchased
 *                                         tier: greenhouse plots = N + 1, and
 *                                         an ABSENT key is the unpurchased
 *                                         default (Hypixel only materialises
 *                                         the key once a tier is bought; the
 *                                         one dumped account has 1 plot and no
 *                                         PLOT_LIMIT key, consistent).
 *
 *                                         Two honest caveats, kept on purpose:
 *                                         the key-name-to-upgrade mapping is
 *                                         name-match inference with the tier
 *                                         counts lining up, not a documented
 *                                         API contract; and the mapping has
 *                                         not yet been verified against an
 *                                         account that has actually purchased
 *                                         a tier. The first such observation
 *                                         is the closing confirmation.
 *
 *   Crop Growth                           NOT EXPOSED. It is a computed player
 *                                         stat, the same kind of thing as
 *                                         Farming Fortune: gear, pets and perks
 *                                         add up to it at runtime and the total
 *                                         is never stored. Absent from the
 *                                         spec, from every DTO, and from every
 *                                         parser checked.
 *
 *   Bioanalysis                           NOT ON THE GARDEN ENDPOINT, but no
 *                                         longer unavailable. In this app it
 *                                         means the best of the talisman, ring
 *                                         and artifact chain, so answering it
 *                                         means reading the accessory bag, and
 *                                         the accessory bag is base64 gzip NBT.
 *                                         This file used to record that as a
 *                                         flat no, on the grounds stated in
 *                                         `hypixel.ts` that a subtly wrong
 *                                         binary parser is worse than an honest
 *                                         blank. `src/nbt` is that parser,
 *                                         round-trip tested against its own
 *                                         writer, so the objection has been met
 *                                         rather than waived. The value arrives
 *                                         through `setApiBioanalysis` from the
 *                                         accessories layer, which reads the
 *                                         bag anyway; see that function for the
 *                                         full reasoning. Note the near miss:
 *                                         the profile member carries
 *                                         `garden_player_data.analyzed_greenhouse_crops`,
 *                                         which sounds like this and is not. It
 *                                         is the list of crops run through the
 *                                         Crop Analyzer, a different mechanic
 *                                         with a similar name.
 *
 * ## Two rules that shape the code
 *
 * **A missing field is `null`, never `0`.** Zero is a real answer to every one
 * of these questions and it is the worst possible guess: it silently reads as
 * "no upgrades" and quietly triples the time estimate. `null` means the API did
 * not say, which the settings render as manual only.
 *
 * **Nothing in this module writes to storage.** It reads the credential record
 * to make its one authenticated call and keeps everything else in memory for
 * the session. There is no `wizardsky.*` key it can damage, by accident or
 * otherwise, and the manual half of these settings stays owned by whoever
 * already persists it.
 */

export type StatSource = "api" | "manual" | "default";

/** A number and where it came from, or `null` for "nobody has said". */
export interface Stat {
  value: number;
  source: StatSource;
}

export interface GreenhouseStats {
  /** Crop Growth stat, 0 to 200. Never `api`: see the note above. */
  cropGrowth: Stat | null;
  /** Greenhouse Growth Speed upgrade tier, 0 to 9. */
  growthSpeedTier: Stat | null;
  /**
   * Garden Desk Plant Yield upgrade tier, from `garden_upgrades.YIELD`.
   *
   * Pulled because the standing rule is that anything the API exposes is read
   * rather than asked, and this is exposed: the live dump in
   * `docs/hypixel-api-cheatsheet.md` records `garden_upgrades` as exactly
   * `{"GROWTH_SPEED": 6, "YIELD": 4}`, so it sits in the same object as the
   * tier already used, with the same reliability.
   *
   * NO CONSUMER TODAY, and that is recorded here rather than left to be
   * rediscovered. The planner's "yield" is a different quantity entirely: it is
   * what the grid solver says one optimal plot produces, not a desk upgrade the
   * player buys with copper. Nothing in `time.ts` or `planEstimates.ts` reads
   * this. It is carried with its provenance so the first consumer finds the
   * plumbing already in place instead of discovering it missing.
   *
   * Ranged 0 to 9, and the ceiling is now DOCUMENTED rather than inferred: the
   * Desk UI page (hypixelskyblock.minecraft.wiki/w/The_Desk/UI) shows Plant
   * Yield unpurchased as "Current Tier: 0/9" with nine tiers I to IX, +2% each
   * for I to VIII and +4% at IX, +20% in total, corroborated by the Greenhouse
   * page's "+2-20%" row. The live observed 4 sits mid scale, no anomaly.
   *
   * Two caveats, stated rather than implied. The YIELD-to-Plant-Yield mapping
   * is name-match inference with the tier counts lining up, not a documented
   * API contract. And the wiki snapshot predates a 4 June 2026 patch note,
   * "Fixed Plant Yield upgrade not working", which reads as a bug fix rather
   * than a rebalance but has not been verified as one.
   */
  yieldTier: Stat | null;
  /**
   * Greenhouse plots running in parallel, 1 to 3.
   *
   * Now `api` when a garden has been read: derived as PLOT_LIMIT + 1, with an
   * absent key meaning zero tiers purchased and therefore the base single
   * plot. The mapping is wiki-documented (see the PLOT_LIMIT entry at the top
   * of this file) but not yet confirmed against an account that has purchased
   * a tier, which is why the derivation lives in one place and carries its own
   * citation. A typed value still wins, exactly as everywhere else.
   */
  plots: Stat | null;
  /**
   * Best Bioanalysis accessory held, as a rank: 0 none, 1 talisman, 2 ring,
   * 3 artifact. The contract is a number, so the rank is the mapping, written
   * down here rather than left implied.
   *
   * `api` when something has read the accessory bag and told us via
   * `setApiBioanalysis`, otherwise manual as before. It does not come from the
   * garden endpoint and never has; see the note at the top of this file.
   */
  bioanalysis: Stat | null;
  /**
   * `garden_upgrades.PLOT_LIMIT` exactly as the API sent it, or null when the
   * field was absent.
   *
   * Kept even now that `plots` above is derived from it, because the two answer
   * different questions: `plots` is the interpretation and this is the
   * evidence. The panel shows the interpreted count and carries this raw value
   * in the tooltip, so anybody can check the arithmetic against what the API
   * literally said, and the first observation from an account that HAS
   * purchased a tier can confirm the mapping at a glance.
   *
   * Still unranged, for the same reason as before: a clamp would hide a
   * surprising value, and a surprising value is precisely the thing worth
   * seeing raw.
   */
  rawPlotLimit: number | null;
  /** When the API was last read for this profile, or `null` if it never was. */
  fetchedAt: number | null;
}

/** Nothing known, from anywhere. The starting state and the failure state. */
export const EMPTY_STATS: GreenhouseStats = {
  cropGrowth: null,
  growthSpeedTier: null,
  yieldTier: null,
  plots: null,
  bioanalysis: null,
  rawPlotLimit: null,
  fetchedAt: null,
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/* -------------------------------------------------------------------------- */
/* Parsing, pure and testable without a network                               */
/* -------------------------------------------------------------------------- */

/**
 * Find the garden object, wherever the caller happened to put it.
 *
 * Three shapes turn up and all three are legitimate: the raw endpoint response
 * `{ success, garden }`, the combined `{ garden, profiles }` this module's own
 * store builds because greenhouse data spans two endpoints, and a bare garden
 * object from a fixture. Sniffing for a known key is what tells a bare garden
 * apart from some other object that happens to be passed in.
 */
const readGarden = (input: unknown): Record<string, unknown> | null => {
  if (!isObject(input)) return null;
  if (isObject(input.garden)) return input.garden;
  if ("garden_upgrades" in input || "greenhouse_slots" in input || "unlocked_plots_ids" in input) {
    return input;
  }
  return null;
};

/**
 * Find this player's member entry.
 *
 * A garden belongs to a profile and every member of that profile shares it, so
 * the garden payload alone cannot tell you whether the player you asked about
 * is actually on it. The member lookup is what confirms that, and it is also
 * where anything per player would come from if the API ever exposed one of the
 * remaining three stats.
 *
 * Keyed undashed by Hypixel, but both sides are normalised rather than trusted,
 * for the same reason `parseProfiles` does it.
 */
const readMember = (input: unknown, uuid: string): Record<string, unknown> | null => {
  if (!isObject(input)) return null;

  const key = undash(uuid);
  if (!key) return null;

  const fromMembers = (value: unknown): Record<string, unknown> | null => {
    if (!isObject(value)) return null;
    for (const [memberId, member] of Object.entries(value)) {
      if (undash(memberId) === key && isObject(member)) return member;
    }
    return null;
  };

  // A profiles response, or anything carrying one.
  if (Array.isArray(input.profiles)) {
    for (const raw of input.profiles) {
      if (!isObject(raw)) continue;
      const member = fromMembers(raw.members);
      if (member) return member;
    }
  }

  // A single profile, either bare or wrapped.
  const single = isObject(input.profile) ? input.profile : input;
  return fromMembers(single.members);
};

/**
 * A whole number in a known range, or nothing.
 *
 * Deliberately not `Number(raw)`: `Number(null)` and `Number("")` are both 0,
 * which would turn a field that is absent or broken into a confident "tier 0"
 * and quietly inflate every growth estimate that follows.
 *
 * The range check is not decoration. These are small, bounded tiers with known
 * maximums, so a value outside the range does not mean the player is unusual,
 * it means the field is not the thing we believe it is. Declining and letting
 * the player type it is the correct answer to that, and it is what stops a
 * future change in the API's units from becoming a wrong number on screen.
 */
const readTier = (raw: unknown, max: number): number | null => {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
  else return null;

  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 0 || n > max) return null;
  return n;
};

/** The wiki's growth formula takes tiers 0 to 8 at +0.05 each, then a flat +0.50 at 9. */
const GROWTH_SPEED_MAX_TIER = 9;

/**
 * Plant Yield's documented ceiling: "Current Tier: 0/9" on the Desk UI page
 * (hypixelskyblock.minecraft.wiki/w/The_Desk/UI), nine tiers I to IX.
 */
const YIELD_MAX_TIER = 9;

/**
 * Plot Limit counts PURCHASED tiers, and two is all of them: the same Desk UI
 * page shows "Current Tier: 0/2" unpurchased, each tier "+1 Greenhouse Plot",
 * and The Garden page states "Up to 3 Greenhouse plots can be unlocked."
 */
const PLOT_LIMIT_MAX_TIER = 2;

/**
 * A number reported as the API sent it, with no range opinion at all.
 *
 * `readTier` refuses anything outside the range it knows, which is right when
 * the number is about to be fed into a formula. This one is for a value that is
 * only ever shown to a person, where a clamp would suppress exactly the
 * evidence being gathered. Same tolerance for a numeric string, since Hypixel
 * has been known to send small integers either way.
 *
 * Still refuses non-integers and non-numbers. A field that came back as `2.5`
 * or as an object is not a plot count under either reading, and reporting it as
 * one would be its own kind of guess.
 */
const readRawCount = (raw: unknown): number | null => {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
  else return null;

  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  return n;
};

/**
 * The plots the greenhouse runs, derived from PLOT_LIMIT.
 *
 * The whole derivation in one place, because it carries an interpretation and
 * interpretations should not be spread across call sites:
 *
 *   no garden read          null. We know nothing and say nothing.
 *   key absent              1. Hypixel only materialises the key once a tier
 *                           has been bought, so absence IS the unpurchased
 *                           default: base greenhouse, no upgrades. Verified
 *                           against the one live dump (1 plot, no key).
 *   key present, 0 to 2     that many tiers purchased, plus the base: N + 1.
 *   key present, outside    null. The field is not what we believe it is, and
 *                           declining beats a confident wrong plot count. The
 *                           raw value still reaches the player via
 *                           `rawPlotLimit`, which is exactly the case it is
 *                           kept for.
 *
 * The mapping is wiki-documented (citations on `PLOT_LIMIT_MAX_TIER` and at
 * the top of this file) but has not yet been observed against an account that
 * purchased a tier, and the field's doc says so. `undefined`-check rather than
 * truthiness for presence, because a present 0 must read as "purchased zero
 * tiers", not as absent, even though no live payload has yet shown one.
 */
const derivePlots = (garden: Record<string, unknown> | null, upgrades: Record<string, unknown> | null): Stat | null => {
  if (!garden) return null;
  if (!upgrades || upgrades.PLOT_LIMIT === undefined) return { value: 1, source: "api" };
  const purchased = readTier(upgrades.PLOT_LIMIT, PLOT_LIMIT_MAX_TIER);
  return purchased === null ? null : { value: purchased + 1, source: "api" };
};

/**
 * Read the greenhouse stats out of whatever the API gave us.
 *
 * `profile` is anything carrying a garden payload, a profiles payload, or both.
 * `uuid` identifies which member of the profile is being asked about. `at` is
 * injectable so tests are not at the mercy of the clock; callers pass nothing
 * and get now, which keeps the two argument call in the agreed contract intact.
 *
 * Returns `fetchedAt` only when there was genuinely something to read. An
 * unusable argument leaves it `null` rather than stamping a time onto a blank,
 * because "read at 14:02, found nothing" and "never read" are different claims
 * and the settings panel says different things about them.
 */
export function parseGreenhouseStats(profile: unknown, uuid: string, at: number = Date.now()): GreenhouseStats {
  const garden = readGarden(profile);
  const member = readMember(profile, uuid);

  // Neither half present means the argument was not a profile at all.
  if (!garden && !member) return EMPTY_STATS;

  const upgrades = garden && isObject(garden.garden_upgrades) ? garden.garden_upgrades : null;
  const tier = upgrades ? readTier(upgrades.GROWTH_SPEED, GROWTH_SPEED_MAX_TIER) : null;
  // Same object, same dump, same reliability, and now the same documented
  // ceiling treatment as its neighbour. See `YIELD_MAX_TIER` for the citation.
  const yieldT = upgrades ? readTier(upgrades.YIELD, YIELD_MAX_TIER) : null;

  return {
    // Not on the wire. Left null on purpose, and the comment at the top of this
    // file is the record of why rather than a shrug.
    cropGrowth: null,
    growthSpeedTier: tier === null ? null : { value: tier, source: "api" },
    yieldTier: yieldT === null ? null : { value: yieldT, source: "api" },
    plots: derivePlots(garden, upgrades),
    bioanalysis: null,
    // The evidence behind `plots`, kept raw for the panel's tooltip.
    rawPlotLimit: upgrades ? readRawCount(upgrades.PLOT_LIMIT) : null,
    fetchedAt: at,
  };
}

/* -------------------------------------------------------------------------- */
/* Overrides                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Numbers the player typed.
 *
 * Presence is the whole signal, exactly as it is for owned counts in
 * `src/inventory`: a key being here is what marks a number as the player's own
 * word. That matters more than it looks, because every one of these stats has a
 * legitimate value of 0, so a stored 0 has to mean "I have none" and cannot be
 * allowed to collapse into "I have not said". Only absence means the latter.
 */
export interface ManualGreenhouseStats {
  cropGrowth?: number | null;
  growthSpeedTier?: number | null;
  /**
   * Present so the yield tier obeys the same precedence as everything else the
   * moment a consumer wants it. Nothing sets it today.
   *
   * A NOTE FOR THAT FIRST CONSUMER. `setManualGreenhouseStats` replaces the
   * whole manual record rather than merging into it, which is correct while one
   * caller owns it. The planner currently calls it with
   * `manualGreenhouseLayer(typedSpeedTier)`, which states only
   * `growthSpeedTier`. Adding a second typed field means extending that one
   * layer to carry both, NOT calling the setter a second time from somewhere
   * else, because the second call would wipe the first field.
   */
  yieldTier?: number | null;
  plots?: number | null;
  bioanalysis?: number | null;
}

/** A typed number wins, or the API value stands. Never a sum, never an average. */
const override = (manual: number | null | undefined, api: Stat | null): Stat | null => {
  if (typeof manual === "number" && Number.isFinite(manual)) return { value: manual, source: "manual" };
  return api;
};

/**
 * Lay the player's numbers over the API's.
 *
 * One rule, and it is the same rule the rest of the site already runs on: the
 * player's word replaces the automatic value outright. It does not add to it,
 * it is not averaged with it, and it is not ignored when the API happens to
 * disagree. Someone who types a number is telling us the automatic one is
 * wrong, and the only respectful reading of that is to believe them.
 *
 * `fetchedAt` is untouched by overriding. It records when the API was read, not
 * what is currently on screen, and a manual edit does not make an API pull
 * older or newer than it was.
 */
export function applyManualOverrides(stats: GreenhouseStats, manual: ManualGreenhouseStats): GreenhouseStats {
  return {
    cropGrowth: override(manual.cropGrowth, stats.cropGrowth),
    growthSpeedTier: override(manual.growthSpeedTier, stats.growthSpeedTier),
    // Same lock as the speed tier, through the same `override`, so a typed
    // yield can never be displaced by an API answer that lands after it.
    yieldTier: override(manual.yieldTier, stats.yieldTier),
    plots: override(manual.plots, stats.plots),
    bioanalysis: override(manual.bioanalysis, stats.bioanalysis),
    // Carried through untouched. There is no manual layer for a diagnostic:
    // it reports what the API said, and a player cannot override what they
    // were told.
    rawPlotLimit: stats.rawPlotLimit,
    fetchedAt: stats.fetchedAt,
  };
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/** Same five minutes the island feed uses, and the same floor between attempts. */
const TTL_MS = 5 * 60 * 1000;
export const MIN_GAP_MS = 10_000;

/**
 * May an account or profile switch skip the floor between attempts?
 *
 * A switch is allowed to jump the queue because the numbers on screen now
 * belong to somebody else, and there is no timer in this module that would come
 * back later to replace them. Waiting ten seconds would mean showing a blank
 * panel for ten seconds and, if nothing happens to remount it, indefinitely.
 *
 * The bypass is bounded rather than unconditional, and that is the whole point
 * of this function. Unbounded, it was a hole: the cross-tab storage listener
 * fires `forget` on every switch, so a person flipping the profile select with
 * several tabs open could put a request per flip per tab onto the wire with no
 * floor in the way at all. One switch skipping the floor is a courtesy; a
 * hundred of them is a rate limit.
 *
 * So one skip is granted, and the next is refused until the gap has passed. A
 * refused switch is not dropped: it falls back to the ordinary floor, which is
 * unchanged and still the only thing gating every other attempt.
 *
 * Null means no switch has ever skipped the floor, which is the starting state
 * and always a yes.
 *
 * Pure, and takes `now` and the gap as arguments, so the sequence is testable
 * without a clock. Same reasoning as `shouldAutoRefresh` in `hypixel.ts`: this
 * is policy rather than plumbing, and policy is the part worth pinning down.
 */
export const mayBypassFloor = (lastBypassAt: number | null, now: number, gapMs: number = MIN_GAP_MS): boolean =>
  lastBypassAt === null || now - lastBypassAt >= gapMs;

let api: GreenhouseStats = EMPTY_STATS;
let manual: ManualGreenhouseStats = {};
let view: GreenhouseStats = EMPTY_STATS;

/**
 * Bioanalysis, once something has actually read the accessory bag.
 *
 * It is held apart from `api` rather than written into it, and the reason is
 * the two values arrive from different places at different times. Everything in
 * `api` comes back from one garden request; this one comes from the accessory
 * bag, which is a different endpoint's payload, parsed by a different module,
 * and typically lands later. Folding it into `api` would mean the next garden
 * pull silently wiped it, because that pull replaces `api` wholesale.
 *
 * Kept as a `Stat` rather than a bare number so the provenance travels with the
 * value and the settings panel can show the same "from API" chip it shows for
 * Growth Speed, without a second rule for where this one came from.
 *
 * `null` is "nobody has read a bag", which is emphatically not "the player owns
 * no Bioanalysis accessory". That second claim is `{ value: 0 }`, and the
 * difference is the same one the rest of this file is built around.
 */
let apiBioanalysis: Stat | null = null;

/** The profile the cached numbers belong to, so a switch cannot show stale ones. */
let cachedProfileId: string | null = null;
let cachedUuid = "";

let busy = false;
let lastAttempt = 0;
let lastPullAt: number | null = null;
/** When a switch last skipped the floor. Null until one has. */
let lastBypassAt: number | null = null;

const listeners = new Set<() => void>();

const publish = () => {
  /*
   * The bag's answer is laid into the API half before the player's overrides go
   * on top, which keeps the precedence rule in exactly one place. It does not
   * jump the queue: `applyManualOverrides` still decides that a typed number
   * beats an automatic one, and this value is an automatic one.
   *
   * `api.bioanalysis` is consulted first purely so that a future garden field
   * carrying this stat would win without anybody having to come back and edit
   * this line. Today that field does not exist, so the bag is always what
   * answers, and when no bag has been read both are null and the stat stays
   * manual exactly as it was before.
   */
  view = applyManualOverrides({ ...api, bioanalysis: api.bioanalysis ?? apiBioanalysis }, manual);
  for (const fn of listeners) fn();
};

const getSnapshot = () => view;

/**
 * Drop the cached numbers without touching a byte of storage.
 *
 * Called when the account or profile changes underneath us. It resets this
 * module's own memory and nothing else: there is no `localStorage.removeItem`
 * anywhere in this file, so no amount of switching profiles can cost anybody a
 * planner target or an island snapshot.
 */
const forget = () => {
  api = EMPTY_STATS;
  /*
   * The bag reading goes with it. An accessory bag belongs to one member of one
   * profile, so the moment the account or profile changes underneath us that
   * rank is a statement about somebody else, and keeping it would be worse than
   * showing nothing: it would look like a fact about the profile now on screen.
   * Whoever reads the new bag will set it again.
   */
  apiBioanalysis = null;
  lastPullAt = null;
  /*
   * The floor between attempts is there to stop one impatient person clicking
   * refresh into a rate limit. It is not there to make a different profile wait
   * ten seconds for its first answer, and leaving it in place would do exactly
   * that: the panel would blank on the switch and, with no timer in this module
   * to come back later, simply stay blank.
   *
   * So the switch may open the floor, but only once per gap. `mayBypassFloor`
   * carries the reasoning; the short version is that the first switch goes
   * straight through and one a moment later does not, which bounds a path that
   * was previously unbounded. A refused switch still gets its answer, just on
   * the ordinary floor's schedule rather than ahead of it.
   */
  const now = Date.now();
  if (mayBypassFloor(lastBypassAt, now)) {
    lastBypassAt = now;
    lastAttempt = 0;
  }
  publish();
};

/**
 * Read the greenhouse for the current profile.
 *
 * Two requests, not one, and the reason is structural: the garden lives at its
 * own endpoint keyed by profile id, and when the player has not explicitly
 * picked a profile we do not know that id until the profiles endpoint tells us
 * which one Hypixel has selected. When a profile *has* been picked the first
 * request is skipped entirely.
 *
 * `force` is the refresh button. It skips the freshness check but not the floor
 * between attempts, because a button that fires a request per click is a button
 * that gets somebody's key throttled.
 *
 * There is no timer in this module and nothing here runs on an interval. This
 * is a pull, on demand, behind a five minute TTL.
 */
export async function refreshGreenhouseStats(force = false): Promise<void> {
  const access = currentAccess();
  if (!hasApiProfileAccess(access)) return;

  // A different account or profile than the cached numbers belong to is not a
  // refresh, it is a different question, so the old answer goes first.
  if (cachedUuid && (cachedUuid !== access.uuid || cachedProfileId !== access.profileId)) forget();
  cachedUuid = access.uuid;
  cachedProfileId = access.profileId;

  if (
    !force &&
    !shouldAutoRefresh({
      hasCredentials: true,
      // The mod cannot see the garden. `useIsland` defers to a live mod because
      // the mod covers the sections the API would answer for and covers them
      // better; there is no such overlap here, so there is nothing to defer to
      // and deferring would just mean never showing a number to the people who
      // run the mod.
      modLive: false,
      lastPullAt,
      now: Date.now(),
      ttlMs: TTL_MS,
    })
  ) {
    return;
  }

  if (busy) return;
  if (Date.now() - lastAttempt < MIN_GAP_MS) return;

  busy = true;
  lastAttempt = Date.now();

  try {
    let profileId = access.profileId;

    if (!profileId) {
      const list = await fetchProfiles({ uuid: access.uuid, name: access.name }, access.key);
      if (!list.ok) {
        // Only an auth failure says anything about the key. A blip leaves the
        // previous verdict exactly where it was, same as the island pull.
        if (list.error.reason === "auth") writeAccess({ keyState: "invalid", checkedAt: Date.now() });
        return;
      }
      writeAccess({ keyState: "valid", checkedAt: list.fetchedAt ?? Date.now() });
      const chosen = chooseProfile(list.value, access.profileId);

      /*
       * The profile response is the only place `game_mode` appears, so a call
       * made for the garden is also the call that can answer "is this an
       * Ironman profile". Asking it here costs nothing extra and means the
       * site's mode is right without the player being asked, which is the
       * standing rule for anything the API exposes.
       *
       * It fills in a default and nothing more. `applyApiGameMode` refuses to
       * touch a mode the player set by hand, so this can never undo a toggle;
       * the precedence lives in `profile/useProfile.ts` rather than here, so
       * every future settings-from-API case reads one rule in one place.
       *
       * Deliberately before the `profileId` guard: a profile Hypixel will not
       * give an id for still tells us the mode, and the mode is worth having
       * even on the pull that then gives up on the garden.
       */
      if (chosen) applyApiGameMode(chosen.gameMode);

      if (!chosen || !chosen.profileId) return;
      profileId = chosen.profileId;
    }

    const garden = await fetchGarden(profileId, access.key);
    if (!garden.ok) {
      if (garden.error.reason === "auth") writeAccess({ keyState: "invalid", checkedAt: Date.now() });
      return;
    }

    const now = garden.fetchedAt ?? Date.now();
    lastPullAt = now;
    cachedProfileId = access.profileId;

    // A profile with no Garden answers 200 with no garden object at all, which
    // the parser rightly refuses to stamp a time onto because it was handed
    // nothing to read. Here we know better: the request happened and came back
    // clean, so the time is real and the blank is an answer rather than a gap.
    const parsed = parseGreenhouseStats({ garden: garden.value }, access.uuid, now);
    api = parsed.fetchedAt === null ? { ...parsed, fetchedAt: now } : parsed;
    publish();
  } finally {
    busy = false;
  }
}

/**
 * Record the Bioanalysis rank read off the player's accessory bag.
 *
 * The rank is the one this file already defines: 0 none, 1 talisman, 2 ring,
 * 3 artifact. Verified against Hypixel's own item resource, which carries
 * `BIOANALYSIS_TALISMAN` (common), `BIOANALYSIS_RING` (uncommon) and
 * `BIOANALYSIS_ARTIFACT` (rare), and no relic. Best held wins.
 *
 * WHY THIS EXISTS NOW AND DID NOT BEFORE
 * --------------------------------------
 * The note at the top of this file said Bioanalysis was never `api` because
 * answering it means reading the accessory bag and the accessory bag is base64
 * gzip NBT, which this codebase declined to parse. That reasoning was correct
 * for as long as it held, and it no longer holds: `src/nbt` parses those blobs
 * now, so the stat has stopped being unavailable and become merely indirect.
 * The header comment has been corrected rather than left standing, because a
 * comment that documents a limitation the code no longer has is worse than no
 * comment at all.
 *
 * The caller is the accessories layer, which is the module that reads the bag
 * anyway. This is deliberately a setter rather than a fetch: putting the
 * request here would mean two modules pulling the same blob for two reasons,
 * and the accessories page needs the full bag regardless.
 *
 * `null` withdraws the value, and is what to pass when the bag could not be
 * read at all: no key, a private profile, or a blob that would not parse. Do
 * not pass 0 for those. Zero is the real and different claim that the bag was
 * read and holds none of the three, and it is a claim only a successful read is
 * entitled to make.
 *
 * Nothing here writes to storage, in keeping with the rest of this module, and
 * the player's own typed number still wins: this feeds the API half, and
 * `applyManualOverrides` is still the only thing that decides precedence.
 */
export function setApiBioanalysis(rank: number | null): void {
  // Same guard as `readTier`: not `Number(raw)`, and a value outside the known
  // range means the caller is not holding what we think it is, so it is
  // declined rather than displayed. Silently rendering a rank 7 would be the
  // exact confidently-wrong failure the rest of this file exists to prevent.
  if (rank === null || !Number.isFinite(rank) || !Number.isInteger(rank) || rank < 0 || rank > 3) {
    apiBioanalysis = null;
  } else {
    apiBioanalysis = { value: rank, source: "api" };
  }
  publish();
}

/**
 * Record the numbers the player typed.
 *
 * The island layer owns the API half and only the API half. Where the manual
 * half is persisted is the settings panel's business, and it already has a home
 * for it, so this deliberately keeps a session copy rather than inventing a
 * second source of truth for numbers that already have one. Passing a field as
 * `undefined` withdraws the override and lets the API value show through again.
 */
export function setManualGreenhouseStats(next: ManualGreenhouseStats): void {
  manual = { ...next };
  publish();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);

  /*
   * Every subscriber asks, and the TTL answers.
   *
   * The tempting version of this is a "have we started yet" flag that fires one
   * pull for the life of the page. It is wrong: mount the settings panel, close
   * it, come back an hour later and that flag means the numbers on screen are
   * an hour old with nothing left that will ever refresh them. Asking on each
   * mount and letting the freshness check say no is both cheaper to reason
   * about and correct at the hour mark. Concurrent mounts collapse into one
   * request, because the busy flag is set before the first await.
   */
  void refreshGreenhouseStats();

  return () => {
    listeners.delete(fn);
  };
};

/**
 * Keep other tabs in step.
 *
 * Only the credential record matters here, and only because switching account
 * or profile in one tab makes the numbers in another tab belong to somebody
 * else. This listener reads; it never writes.
 *
 * It relies on `apiKey.ts` having already refreshed its own copy by the time
 * this runs, so `currentAccess()` returns the new account and not the old one.
 * That ordering is guaranteed rather than lucky: this module imports that one,
 * so its module body and therefore its listener registration both happen first,
 * and listeners on the same event fire in registration order.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== "wizardsky.apikey.v1") return;
    const access = currentAccess();
    if (access.uuid !== cachedUuid || access.profileId !== cachedProfileId) {
      cachedUuid = access.uuid;
      cachedProfileId = access.profileId;
      forget();
      void refreshGreenhouseStats();
    }
  });
}

/**
 * The greenhouse stats, with the player's own numbers already laid over them.
 *
 * External store rather than component state because the settings panel and
 * anything that estimates time both need these, and two copies of a number that
 * one of them can edit is how a panel ends up disagreeing with the estimate
 * sitting next to it.
 */
export const useGreenhouseStats = (): GreenhouseStats =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Read outside React, for anything that is not a component. */
export const currentGreenhouseStats = (): GreenhouseStats => view;
