/**
 * Every constant the time model leans on, with its source.
 *
 * The rule for this file: a number is either CITED, with the page and section
 * it came from, or it is ASSUMED, in which case it says so out loud and names
 * the playtest that would settle it. Nothing gets to be here just because it
 * felt about right.
 *
 * Keep each assumption beside the constant it governs so behavior and
 * provenance cannot drift apart.
 */

/** How a constant earned its place. */
export type Provenance = "cited" | "assumed";

export interface SourcedValue<T> {
  value: T;
  provenance: Provenance;
  /** Where it came from, or for assumptions, why and how to settle it. */
  source: string;
}

// ---------------------------------------------------------------------------
// CITED
// ---------------------------------------------------------------------------

/**
 * The spawn roll happens on the growth-cycle tick, and the greenhouse ticks
 * everything at once. This is the fact the whole model hangs on: it makes the
 * interval between rolls exactly one growth stage.
 */
export const ROLL_CADENCE: SourcedValue<"growth-cycle"> = {
  value: "growth-cycle",
  provenance: "cited",
  source:
    'Changelog/2025/December 15/0, section "Mutations": "Whether it actually spreads onto the middle plot ' +
    'depends on the growth cycle, which triggers every few hours in the Greenhouse and updates all crops and ' +
    'mutations simultaneously." Growth cycle == growth stage per Changelog/2025/December 12: "The base time ' +
    'per growth cycle: 3 -> 4 hours", matching Greenhouse section Growth Stage.',
};

/** Baseline growth stage, before any bonus. Mirrors planner/time.ts. */
export const BASE_STAGE_SECONDS: SourcedValue<number> = {
  value: 14400,
  provenance: "cited",
  source: 'Greenhouse section Growth Stage ("Growth Stages start out taking 4 hours baseline"); Changelog/2025/December 12.',
};

/**
 * Decay timers are in DAYS. Mutations keep their own timers, while base crops
 * share the fixed 72-hour timer introduced on August 20, 2026.
 */
export const DECAY_UNIT: SourcedValue<"days"> = {
  value: "days",
  provenance: "cited",
  source:
    'Dead Plant: "the decay mechanic will turn most fully grown mutation into Dead Plants after a few days, ' +
    'even if fully hydrated or placed by the player. Different mutations can have different decay timers. The ' +
    'lowest is 3 days, and certain mutations do not have any decay at all." Corroborated by ' +
    'Changelog/2026/February 2: "Increased Noctilume\'s decay period from 5 to 6 days."',
};

/** Base crops expire 72 hours after they are planted. */
export const BASE_CROP_DECAY_DAYS: SourcedValue<number> = {
  value: 3,
  provenance: "cited",
  source:
    'Hypixel SkyBlock August 20, 2026 patch notes, Greenhouse section: "Base crops now decay after 72 hours."',
};

/**
 * Bioanalysis accessories multiply mutation chance rather than adding
 * percentage points. Proven arithmetically by staff: 15% x 1.15 = 17.25%.
 *
 * It is an upgrade chain, so only the best one you hold applies.
 */
export const BIOANALYSIS_MULTIPLIER: Record<"none" | "talisman" | "ring" | "artifact", SourcedValue<number>> = {
  none: { value: 1, provenance: "cited", source: "No accessory held." },
  talisman: {
    value: 1.05,
    provenance: "cited",
    source: 'Bioanalysis Talisman: "increases the chance for crops to mutate in the Greenhouse by +5%".',
  },
  ring: {
    value: 1.1,
    provenance: "cited",
    source: 'Bioanalysis Ring: "...by +10%".',
  },
  artifact: {
    value: 1.15,
    provenance: "cited",
    source:
      'Bioanalysis Artifact: "...by +15%". Multiplicative, per staff (pikachuflare, Mutations section References): ' +
      '"Ashwreath\'s Mutation chance is confirmed as 15%... with the Bioanalysis Artifact buff, it should be 17.25%." ' +
      "15 x 1.15 = 17.25 exactly, so the +15% is a multiplier, not 15 percentage points.",
  },
};

/**
 * Internal spawn weights, leaked by Hypixel staff.
 *
 * These are ground truth in a way the wiki's percentage column is not - see
 * CROP_SUPPORT_RULE. A weight of 0 means the mutation is never rolled for and
 * only exists through a special mechanic.
 */
export const MUTATION_WEIGHTS: SourcedValue<Record<string, number>> = {
  provenance: "cited",
  source:
    "Hypixel staff mrkeith, July 24 2026, quoted in full as ref `mrkeith` on Mutations. " +
    '"weight of 0 means special conditions required". Re-verified against the live page: no weight has changed.',
  value: {
    dustgrain: 30,
    witherbloom: 30,
    ashwreath: 30,
    cindershade: 25,
    gloomgourd: 30,
    lonelily: 6,
    soggybud: 25,
    veilshroom: 30,
    thornshade: 25,
    scourroot: 30,
    do_not_eat_shroom: 25,
    choconut: 30,
    chocoberry: 25,
    creambloom: 25,
    shadevine: 30,
    duskbloom: 25,
    snoozling: 25,
    plantboy_advance: 25,
    thunderling: 25,
    noctilume: 25,
    magic_jellybean: 25,
    all_in_aloe: 25,
    puffercloud: 25,
    zombud: 25,
    fleshtrap: 25,
    blastberry: 25,
    turtlellini: 25,
    coalroot: 25,
    chloronite: 25,
    devourer: 20,
    glasscorn: 20,
    chorus_fruit: 25,
    startlevine: 25,
    stoplight_petal: 25,
    phantomleaf: 20,
    cheesebite: 25,
    timestalk: 20,
    godseed: 5,
    jerryflower: 0,
    shellfruit: 0,
  },
};

/**
 * Items that appear in spreading conditions but are not crops for the purpose
 * of the crop-support scaling.
 *
 * Fire is the only one in the whole table. Staff explicitly ruled the two
 * other candidates back IN: "Lonelily is special case, fermento and dead
 * plants are indeed crops" (pikachuflare, Mutations section References).
 */
export const NON_CROP_REQUIREMENTS: SourcedValue<string[]> = {
  value: ["fire"],
  provenance: "cited",
  source:
    'pikachuflare (staff), Mutations section References: "Since Fire isn\'t a crop..." and "fermento and dead plants ' +
    "are indeed crops\". Fire is the only non-crop item in any Spreading Conditions field on the page.",
};

// ---------------------------------------------------------------------------
// ASSUMED - each of these names the playtest that would settle it
// ---------------------------------------------------------------------------

/**
 * How the crop-support scaling divides up.
 *
 * Staff gave exactly one worked example: Ashwreath needs 2 Nether Wart + 2
 * Fire, and because Fire is not a crop its chance is "only supported by the 2
 * netherwarts (25% + 25% = 50%), 30% * 50% = 15%".
 *
 * Two rules fit that sentence and there is no second data point to separate
 * them, because Fire is the only non-crop in the entire table:
 *
 *   "share"  each required item is worth 1/(total required), so support is
 *            cropRequired / totalRequired. Ashwreath: 2/4 = 50%.
 *   "quarter" each crop touching the spot is worth a flat 25%, denominator
 *            pinned at 4. Ashwreath: 2 x 25% = 50%.
 *
 * They agree on Ashwreath and disagree everywhere else. Choconut needs just 2
 * Cocoa Beans: "share" says 2/2 = 100% support and a 30% chance, "quarter"
 * says 2 x 25% = 50% support and a 15% chance - a factor of two on the single
 * most-planted mutation in the game.
 *
 * The wiki cannot resolve this. Its percentage column is not evidence: every
 * value except Ashwreath's was typed in by an editor on 2026-07-27 as
 * weight/100, which silently assumes "share".
 *
 * We default to "share" because it reproduces the published table, and because
 * assuming the optimistic branch keeps this model's correction attributable to
 * the mechanics we did verify rather than to a coin-flip on this one.
 *
 * PLAYTEST TO SETTLE IT: sow a full plot of Choconut (2 Cocoa Beans per spot),
 * note the spot count S, leave it exactly one growth cycle, and count how many
 * Choconut spawned. Expected S x 0.30 under "share", S x 0.15 under "quarter".
 * With S = 72 that is 21.6 vs 10.8 - one cycle tells them apart, and a handful
 * of cycles makes it certain.
 */
export const CROP_SUPPORT_RULE: SourcedValue<"share" | "quarter"> = {
  value: "share",
  provenance: "assumed",
  source:
    "Only Ashwreath's 15% is staff-confirmed; both the 'share' and 'quarter' rules reproduce it. Every other " +
    "percentage on the Mutations page is an editor's arithmetic on the weight (Lunaynx, 2026-07-27), not a " +
    "measurement. Settle by counting one cycle's Choconut spawns on a full plot.",
};

/**
 * One spawn roll per empty spot per growth cycle.
 *
 * The changelog says a plot "has a chance to spread" on the growth cycle, but
 * never says how many rolls a spot gets per cycle, nor whether a spot that
 * failed re-rolls at the same rate next cycle. The model treats rolls as
 * independent and identically distributed, which is the standard reading and
 * the only one that makes the published percentages mean anything.
 *
 * PLAYTEST: on a plot of known spot count, record spawns cycle by cycle. If
 * rolls are i.i.d. at rate p, the count of still-empty spots should fall
 * geometrically - empty_n ~ S(1-p)^n. A visibly faster or slower fall-off
 * means either multiple rolls per cycle or a pity/escalation mechanic.
 */
export const ROLLS_PER_SPOT_PER_CYCLE: SourcedValue<number> = {
  value: 1,
  provenance: "assumed",
  source:
    "Changelog/2025/December 15/0 pins the roll to the growth cycle but never states rolls-per-spot-per-cycle " +
    "nor that failures are memoryless. Settle by checking the empty-spot count decays as S(1-p)^n.",
};

/**
 * What happens when several mutations could spawn on the same spot.
 *
 * The Mutations table header says outright that its numbers "assume no other
 * mutations can spawn on the same empty spot", and then never says what the
 * numbers become when they can. Changelog/2026/February 4 muddies it further:
 * "Gave Zombud and Godseed priority over other crops in mutating" - priority
 * is a separate mechanism from weight, so it is not a plain weighted lottery.
 *
 * The model sidesteps this rather than guessing. The planner solves one target
 * mutation per plot and strips unused crops, so in practice only the target is
 * eligible and the listed chance applies unmodified. Shared or multi-target
 * layouts are outside what this model can honestly cost.
 *
 * PLAYTEST: only needed if the planner ever grows multi-target plots.
 */
export const CONTENTION_MODEL: SourcedValue<"single-target-only"> = {
  value: "single-target-only",
  provenance: "assumed",
  source:
    "Wiki states the no-contention caveat but not the contended behaviour; the Feb 4 'priority' changelog rules " +
    "out a simple weight lottery. Valid because solved plots are single-target with unused crops removed.",
};

/**
 * Longest a planting can be left in the ground, in growth cycles.
 *
 * Two separate clocks cap this and the model takes the tighter one:
 *
 *  - a mutation that has already spawned starts its own decay timer, so
 *    waiting too long to harvest loses the earliest spawns to Dead Plants
 *  - any input that is itself a mutation decays on the same schedule, so the
 *    layout stops being valid once its feeders rot
 *
 * Decay days are cited; converting them to cycles is arithmetic on the stage
 * timer. What is ASSUMED is that the decay clock starts when the mutation
 * becomes fully grown, and that nothing refreshes it.
 *
 * PLAYTEST: spawn a Choconut, note the cycle, and watch for the Dead Plant.
 * Three days at a 4h stage is ~18 cycles. The Plant Diagnostics Tool shows the
 * remaining decay time in game, which makes this a read rather than a stopwatch.
 */
export const DECAY_CLOCK_START: SourcedValue<"fully-grown"> = {
  value: "fully-grown",
  provenance: "assumed",
  source:
    'Dead Plant says decay turns "fully grown mutation" into Dead Plants, but Soggybud ("decay before they ' +
    'finish growing") and All-in Aloe ("does not decay while growing or after being placed") both imply the ' +
    "clock can run during growth too. Read the remaining time off the Plant Diagnostics Tool to settle it.",
};

/**
 * Water is assumed perfect.
 *
 * Greenhouse section Water Level: "If a crop has negative Water Level during a
 * Growth Stage, it has a chance not to advance to the next stage." The chance
 * is not quantified anywhere, so the model cannot price it. Every estimate
 * here therefore assumes crops stay watered; a dry plot is strictly slower.
 *
 * PLAYTEST: not worth measuring - keep the plot watered and the assumption holds.
 */
export const WATER_PENALTY: SourcedValue<number> = {
  value: 0,
  provenance: "assumed",
  source:
    "Greenhouse section Water Level states a stall chance at negative water but never quantifies it. Modelled as zero, " +
    "i.e. estimates assume a watered plot and are optimistic if it dries out.",
};

/** Days to growth cycles, for turning a decay timer into a harvest-window cap. */
export const decayDaysToCycles = (decayDays: number, stageSeconds: number): number =>
  decayDays <= 0 ? Number.POSITIVE_INFINITY : (decayDays * 86400) / stageSeconds;
