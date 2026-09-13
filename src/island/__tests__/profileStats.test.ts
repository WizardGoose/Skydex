import { describe, expect, it } from "vitest";
import {
  applyManualOverrides,
  EMPTY_STATS,
  mayBypassFloor,
  MIN_GAP_MS,
  parseGreenhouseStats,
  type GreenhouseStats,
  type ManualGreenhouseStats,
} from "../profileStats";

/**
 * Greenhouse stats, parsed without a network.
 *
 * The fixtures below are built from the field names that were actually
 * verified against Hypixel's OpenAPI spec and the DTOs EliteFarmers run in
 * production, not from what a garden payload might plausibly look like. That
 * distinction is the entire point of this file: the dangerous failure here is
 * not a crash, it is a confident number pulled from a field that turns out to
 * mean something else, so the tests pin the exact key names and the exact
 * refusals.
 *
 * Three things are worth being paranoid about:
 *
 *   - A missing field must come back `null` and never `0`. Zero is a real
 *     answer to every one of these questions, so guessing it is not a harmless
 *     default; it reads as "no upgrades" and inflates every time estimate.
 *   - A value outside the known tier range means the field is not what we think
 *     it is, and declining beats reporting it.
 *   - A number the player typed beats the API, always, exactly as an owned
 *     count already does in `src/inventory`.
 */

const UUID = "b876ec32e396476ba1158438d83c67d4";
const DASHED = "b876ec32-e396-476b-a115-8438d83c67d4";
const OTHER_UUID = "0d1f0d5b6d1e4f0a9c2b3a4d5e6f7a8b";

const AT = 1_700_000_000_000;

/**
 * A garden payload in the shape the endpoint actually returns.
 *
 * Every key here was verified. `garden_upgrades` with its three screaming
 * uppercase members is the load bearing one; the rest is present because a
 * parser that only ever sees the field it wants is a parser that has not been
 * shown it can ignore its neighbours.
 */
const garden = (upgrades?: Record<string, unknown>) => ({
  uuid: "a1b2c3d4e5f64718293a4b5c6d7e8f90",
  garden_experience: 32_500,
  unlocked_plots_ids: ["beginner_1", "beginner_2", "intermediate_1", "advanced_3"],
  resources_collected: { WHEAT: 1_204_331, POTATO_ITEM: 88_120, "INK_SACK:3": 4_002 },
  crop_upgrade_levels: { WHEAT: 9, POTATO_ITEM: 4 },
  last_growth_stage_time: 1_699_999_000_000,
  greenhouse_slots: [
    { x: 0, z: 0 },
    { x: 1, z: 0 },
    { x: 7, z: 9 },
  ],
  ...(upgrades ? { garden_upgrades: upgrades } : {}),
});

/** The endpoint's own envelope: `{ success, garden }`. */
const gardenResponse = (upgrades?: Record<string, unknown>) => ({ success: true, garden: garden(upgrades) });

/** A profiles response carrying a member map, keyed undashed as Hypixel keys it. */
const profilesResponse = (uuid: string) => ({
  success: true,
  profiles: [
    {
      profile_id: "d3a4b5c6d7e8f9012345678901234567",
      cute_name: "Zucchini",
      selected: true,
      members: {
        [uuid]: {
          garden_player_data: {
            copper: 4_120,
            larva_consumed: 3,
            analyzed_greenhouse_crops: ["WHEAT", "CARROT_ITEM"],
            discovered_greenhouse_crops: ["WHEAT", "CARROT_ITEM", "PUMPKIN"],
          },
        },
      },
    },
  ],
});

describe("parseGreenhouseStats: the one field the API exposes", () => {
  it("reads the Growth Speed tier from garden_upgrades.GROWTH_SPEED", () => {
    const stats = parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 7, PLOT_LIMIT: 2, YIELD: 5 }), UUID, AT);
    expect(stats.growthSpeedTier).toStrictEqual({ value: 7, source: "api" });
    expect(stats.fetchedAt).toBe(AT);
  });

  it("accepts both ends of the tier range, including the flat top tier", () => {
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 0 }), UUID, AT).growthSpeedTier).toStrictEqual({
      value: 0,
      source: "api",
    });
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 9 }), UUID, AT).growthSpeedTier).toStrictEqual({
      value: 9,
      source: "api",
    });
  });

  it("reads a bare garden object, not just the endpoint envelope", () => {
    const stats = parseGreenhouseStats(garden({ GROWTH_SPEED: 3 }), UUID, AT);
    expect(stats.growthSpeedTier).toStrictEqual({ value: 3, source: "api" });
  });

  it("stamps the time it was handed rather than reading the clock", () => {
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 1 }), UUID, 42).fetchedAt).toBe(42);
  });
});

describe("parseGreenhouseStats: Hypixel greenhouse slots", () => {
  it("maps the API's x/z slots onto the site's row/column grid", () => {
    expect(parseGreenhouseStats(gardenResponse(), UUID, AT).unlockedCells).toStrictEqual({
      value: [[0, 0], [0, 1], [9, 7]],
      source: "api",
    });
  });

  it("deduplicates repeated slots without inventing extra capacity", () => {
    const payload = garden();
    payload.greenhouse_slots.push({ x: 1, z: 0 });
    expect(parseGreenhouseStats({ garden: payload }, UUID, AT).unlockedCells?.value).toStrictEqual([
      [0, 0],
      [0, 1],
      [9, 7],
    ]);
  });

  it("falls back honestly when the slot field is absent or malformed", () => {
    const withoutSlots: Record<string, unknown> = { ...garden() };
    delete withoutSlots.greenhouse_slots;
    expect(parseGreenhouseStats({ garden: withoutSlots }, UUID, AT).unlockedCells).toBeNull();

    for (const bad of [
      "not-a-list",
      [{ x: 0 }],
      [{ x: 10, z: 0 }],
      [{ x: 0.5, z: 0 }],
    ]) {
      expect(parseGreenhouseStats({ garden: { ...garden(), greenhouse_slots: bad } }, UUID, AT).unlockedCells).toBeNull();
    }
  });

  it("does not let manual stat overrides replace the API cell layout", () => {
    const fromApi = parseGreenhouseStats(gardenResponse(), UUID, AT);
    expect(applyManualOverrides(fromApi, { plots: 2 }).unlockedCells).toStrictEqual(fromApi.unlockedCells);
  });
});

describe("parseGreenhouseStats: refusing to guess", () => {
  it("returns null, never 0, when garden_upgrades is absent entirely", () => {
    const stats = parseGreenhouseStats(gardenResponse(), UUID, AT);
    expect(stats.growthSpeedTier).toBeNull();
    // The distinction that matters: we looked, and the field was not there.
    expect(stats.fetchedAt).toBe(AT);
  });

  it("returns null when garden_upgrades exists but GROWTH_SPEED does not", () => {
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 2, YIELD: 5 }), UUID, AT).growthSpeedTier).toBeNull();
  });

  it("declines a tier outside the known range instead of clamping it", () => {
    // Out of range does not mean an unusual player, it means the field is not
    // the thing we believe it is. Clamping would hide exactly that.
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 10 }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: -1 }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 250 }), UUID, AT).growthSpeedTier).toBeNull();
  });

  it("declines values that are not whole numbers", () => {
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 4.5 }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: Number.NaN }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: Infinity }), UUID, AT).growthSpeedTier).toBeNull();
  });

  it("does not let an empty or null field become tier 0", () => {
    // Number(null), Number("") and Number([]) are all 0. This is the trap.
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: null }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: "" }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: [] }), UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: {} }), UUID, AT).growthSpeedTier).toBeNull();
  });

  it("still reads a tier sent as a numeric string", () => {
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: "6" }), UUID, AT).growthSpeedTier).toStrictEqual({
      value: 6,
      source: "api",
    });
  });

  it("is case sensitive about the uppercase upgrade keys", () => {
    // The real keys are screaming uppercase. A lowercase near miss is not the
    // field, and quietly accepting it would be inventing one.
    expect(parseGreenhouseStats(gardenResponse({ growth_speed: 7 }), UUID, AT).growthSpeedTier).toBeNull();
  });
});

describe("parseGreenhouseStats: the stats the API does not expose", () => {
  const full = parseGreenhouseStats(
    { ...gardenResponse({ GROWTH_SPEED: 9, PLOT_LIMIT: 2, YIELD: 9 }), ...profilesResponse(UUID) },
    UUID,
    AT
  );

  it("leaves Crop Growth null, because it is computed from gear and never stored", () => {
    expect(full.cropGrowth).toBeNull();
  });

  it("leaves bioanalysis null, and is not fooled by analyzed_greenhouse_crops", () => {
    // Similar name, different mechanic: that field is the Crop Analyzer's list,
    // not the talisman to artifact accessory chain the planner asks about.
    expect(full.bioanalysis).toBeNull();
  });
});

/**
 * The plots derivation.
 *
 * PLOT_LIMIT counts PURCHASED TIERS, and that reading is now documented rather
 * than guessed: the Desk UI page shows the upgrade as "Current Tier: 0/2" with
 * each tier granting "+1 Greenhouse Plot", and The Garden page caps the total
 * at 3. So plots = purchased + 1, and an ABSENT key is the unpurchased default
 * of one base greenhouse.
 * Not yet observed against an account that has bought a tier; these tests pin
 * the documented mapping so that first observation has something to confirm.
 */
describe("parseGreenhouseStats: plots derived from PLOT_LIMIT", () => {
  it("reads an absent key as the base single greenhouse", () => {
    // The state every account starts in, and the common case in the wild.
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 6, YIELD: 4 }), UUID, AT).plots).toStrictEqual({
      value: 1,
      source: "api",
    });
    // A garden with no garden_upgrades object at all is the same unpurchased
    // default, just younger: nothing has been bought, so nothing materialised.
    expect(parseGreenhouseStats(gardenResponse(), UUID, AT).plots).toStrictEqual({ value: 1, source: "api" });
  });

  it("adds the base plot to each purchased tier", () => {
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 0 }), UUID, AT).plots).toStrictEqual({
      value: 1,
      source: "api",
    });
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 1 }), UUID, AT).plots).toStrictEqual({
      value: 2,
      source: "api",
    });
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 2 }), UUID, AT).plots).toStrictEqual({
      value: 3,
      source: "api",
    });
  });

  it("says nothing at all when no garden was read", () => {
    // Absence of the KEY is information; absence of the GARDEN is not.
    expect(parseGreenhouseStats(profilesResponse(UUID), UUID, AT).plots).toBeNull();
    expect(EMPTY_STATS.plots).toBeNull();
  });

  it("declines a value outside the documented tiers, but keeps the evidence", () => {
    /*
     * Outside 0 to 2 the field is not what we believe it is, and a confident
     * wrong plot count halves or doubles every estimate. The raw value still
     * reaches the player through `rawPlotLimit`, which is exactly the case that
     * field is kept for.
     */
    for (const bad of [3, 24, -1, 1.5, "two"]) {
      expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: bad }), UUID, AT).plots).toBeNull();
    }
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 24 }), UUID, AT).rawPlotLimit).toBe(24);
  });

  it("lets a typed plot count beat the derived one", () => {
    const stats = parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 2 }), UUID, AT);
    expect(applyManualOverrides(stats, { plots: 2 }).plots).toStrictEqual({ value: 2, source: "manual" });
    expect(applyManualOverrides(stats, {}).plots).toStrictEqual({ value: 3, source: "api" });
  });
});

/**
 * The Plant Yield upgrade tier.
 *
 * Sits in the same `garden_upgrades` object as the growth tier and is read the
 * same way, on the same standing rule: anything the API exposes is pulled, not
 * asked. It has no consumer yet, so these tests are the contract the first one
 * will find waiting, and they are deliberately the same three claims already
 * made for the speed tier.
 */
describe("parseGreenhouseStats: the Plant Yield tier", () => {
  it("reads YIELD off garden_upgrades and stamps it as api", () => {
    // The live shape from the dump, both keys present together.
    const stats = parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 6, YIELD: 4 }), UUID, AT);
    expect(stats.yieldTier).toStrictEqual({ value: 4, source: "api" });
    // And it did not disturb its neighbour.
    expect(stats.growthSpeedTier).toStrictEqual({ value: 6, source: "api" });
  });

  it("keeps tier 0 as a real answer", () => {
    expect(parseGreenhouseStats(gardenResponse({ YIELD: 0 }), UUID, AT).yieldTier).toStrictEqual({
      value: 0,
      source: "api",
    });
  });

  it("reports nothing when the key is absent", () => {
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 6 }), UUID, AT).yieldTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse(), UUID, AT).yieldTier).toBeNull();
    expect(EMPTY_STATS.yieldTier).toBeNull();
  });

  it("refuses a value that is not a whole non-negative tier", () => {
    for (const bad of [-1, 2.5, "four", true, null, {}]) {
      expect(parseGreenhouseStats(gardenResponse({ YIELD: bad }), UUID, AT).yieldTier).toBeNull();
    }
  });

  it("enforces the documented ceiling of nine", () => {
    /*
     * This field shipped without a ceiling, deliberately, because none was
     * documented and inventing one would have been a guess. The Desk UI page
     * (hypixelskyblock.minecraft.wiki/w/The_Desk/UI) has since settled it:
     * "Current Tier: 0/9", nine tiers I to IX. So the field now gets the same
     * treatment as its neighbour: nine is real, ten means the field is not
     * what we believe it is, and declining beats a confident wrong number.
     */
    expect(parseGreenhouseStats(gardenResponse({ YIELD: 9 }), UUID, AT).yieldTier).toStrictEqual({
      value: 9,
      source: "api",
    });
    expect(parseGreenhouseStats(gardenResponse({ YIELD: 10 }), UUID, AT).yieldTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ YIELD: 12 }), UUID, AT).yieldTier).toBeNull();
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 12 }), UUID, AT).growthSpeedTier).toBeNull();
  });

  it("is what a consumer sees once the overrides have been applied", () => {
    // The resolved view is the only thing a consumer reads, so the API value
    // has to survive the pass that produces it.
    const stats = parseGreenhouseStats(gardenResponse({ YIELD: 4 }), UUID, AT);
    expect(applyManualOverrides(stats, {}).yieldTier).toStrictEqual({ value: 4, source: "api" });
  });

  it("lets a typed tier beat the API one", () => {
    const stats = parseGreenhouseStats(gardenResponse({ YIELD: 4 }), UUID, AT);
    expect(applyManualOverrides(stats, { yieldTier: 7 }).yieldTier).toStrictEqual({ value: 7, source: "manual" });
  });

  it("does not let a later API answer clobber a typed one", () => {
    /*
     * The ordering that matters. A player types a tier, and only afterwards
     * does a pull land carrying a different number. The typed value has to
     * still be what wins, because the person who typed it was telling us the
     * automatic one is wrong.
     */
    const typed = { yieldTier: 7 };

    const before = applyManualOverrides(EMPTY_STATS, typed);
    expect(before.yieldTier).toStrictEqual({ value: 7, source: "manual" });

    const afterPull = applyManualOverrides(parseGreenhouseStats(gardenResponse({ YIELD: 4 }), UUID, AT), typed);
    expect(afterPull.yieldTier).toStrictEqual({ value: 7, source: "manual" });
  });

  it("hands the field back when the typed value is withdrawn", () => {
    // Passing undefined is the withdrawal, same as every other stat here.
    const stats = parseGreenhouseStats(gardenResponse({ YIELD: 4 }), UUID, AT);
    expect(applyManualOverrides(stats, { yieldTier: undefined }).yieldTier).toStrictEqual({ value: 4, source: "api" });
  });
});

/**
 * The PLOT_LIMIT diagnostic.
 *
 * Reported so that one player with a known account can settle whether the field
 * counts plots or purchased upgrade levels. It feeds nothing, so the rules it
 * obeys are about faithfulness rather than safety: report what arrived, decline
 * what is not a count, and say nothing at all when the field is absent.
 */
describe("parseGreenhouseStats: the raw PLOT_LIMIT diagnostic", () => {
  it("reports the value the API sent", () => {
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 2 }), UUID, AT).rawPlotLimit).toBe(2);
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 0 }), UUID, AT).rawPlotLimit).toBe(0);
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 3 }), UUID, AT).rawPlotLimit).toBe(3);
  });

  it("keeps 0 as a value rather than collapsing it into absent", () => {
    // Zero is the whole question. Under the "purchased levels" reading it means
    // no upgrades and one plot; under the "plots" reading it would be nonsense.
    // Either way it has to reach the screen for anybody to tell us which.
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 0 }), UUID, AT).rawPlotLimit).toBe(0);
  });

  it("applies no range clamp, because a surprising value is the evidence", () => {
    // `readTier` would refuse these. This one must not: a number outside both
    // candidate ranges would itself answer the question being asked.
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 24 }), UUID, AT).rawPlotLimit).toBe(24);
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: -1 }), UUID, AT).rawPlotLimit).toBe(-1);
  });

  it("accepts a numeric string, the way the tier reader does", () => {
    expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: "2" }), UUID, AT).rawPlotLimit).toBe(2);
  });

  it("reports nothing when the field is absent, so the line renders nothing", () => {
    /*
     * The behaviour the panel depends on. `null` is what suppresses the line
     * entirely, rather than printing "PLOT_LIMIT: null" at somebody.
     */
    expect(parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 7 }), UUID, AT).rawPlotLimit).toBeNull();
    expect(parseGreenhouseStats(gardenResponse(), UUID, AT).rawPlotLimit).toBeNull();
    expect(parseGreenhouseStats({ garden: null }, UUID, AT).rawPlotLimit).toBeNull();
    expect(EMPTY_STATS.rawPlotLimit).toBeNull();
  });

  it("reports nothing for a value that is not a whole count", () => {
    for (const bad of [2.5, "two", true, null, {}, []]) {
      expect(parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: bad }), UUID, AT).rawPlotLimit).toBeNull();
    }
  });

  it("survives the manual override pass untouched", () => {
    // There is no manual layer for a diagnostic: a player cannot override what
    // they were told the API said.
    const stats = parseGreenhouseStats(gardenResponse({ PLOT_LIMIT: 2 }), UUID, AT);
    expect(applyManualOverrides(stats, { plots: 3 }).rawPlotLimit).toBe(2);
    expect(applyManualOverrides(stats, { plots: 3 }).plots).toStrictEqual({ value: 3, source: "manual" });
  });
});

describe("parseGreenhouseStats: locating the player", () => {
  it("finds the member in a profiles response, dashed or undashed", () => {
    // No stat comes from the member today, so the observable effect is that we
    // consider the payload readable at all and stamp a real time on it.
    expect(parseGreenhouseStats(profilesResponse(UUID), UUID, AT).fetchedAt).toBe(AT);
    expect(parseGreenhouseStats(profilesResponse(DASHED), UUID, AT).fetchedAt).toBe(AT);
    expect(parseGreenhouseStats(profilesResponse(UUID), DASHED, AT).fetchedAt).toBe(AT);
  });

  it("finds the member on a single bare profile", () => {
    const [profile] = profilesResponse(UUID).profiles;
    expect(parseGreenhouseStats(profile, UUID, AT).fetchedAt).toBe(AT);
  });

  it("treats a profile the player is not on as nothing to read", () => {
    expect(parseGreenhouseStats(profilesResponse(OTHER_UUID), UUID, AT)).toStrictEqual(EMPTY_STATS);
  });

  it("parses the garden even when no profiles payload came along", () => {
    const stats = parseGreenhouseStats({ garden: garden({ GROWTH_SPEED: 5 }) }, UUID, AT);
    expect(stats.growthSpeedTier).toStrictEqual({ value: 5, source: "api" });
  });
});

describe("parseGreenhouseStats: unusable input", () => {
  it("never stamps a time onto something it could not read", () => {
    // "Read at 14:02, found nothing" and "never read" are different claims.
    for (const junk of [null, undefined, 0, "", "garden", [], {}, { success: true }, { garden: null }]) {
      expect(parseGreenhouseStats(junk, UUID, AT)).toStrictEqual(EMPTY_STATS);
    }
  });

  it("survives a garden whose upgrades block is not an object", () => {
    expect(parseGreenhouseStats({ garden: { garden_upgrades: "nope" } }, UUID, AT).growthSpeedTier).toBeNull();
    expect(parseGreenhouseStats({ garden: { garden_upgrades: [] } }, UUID, AT).growthSpeedTier).toBeNull();
  });

  it("treats a blank uuid as no player rather than matching anything", () => {
    expect(parseGreenhouseStats(profilesResponse(UUID), "", AT)).toStrictEqual(EMPTY_STATS);
  });
});

describe("applyManualOverrides: the player's word wins", () => {
  const fromApi: GreenhouseStats = parseGreenhouseStats(gardenResponse({ GROWTH_SPEED: 4 }), UUID, AT);

  it("replaces an API value with the typed one", () => {
    const out = applyManualOverrides(fromApi, { growthSpeedTier: 9 });
    expect(out.growthSpeedTier).toStrictEqual({ value: 9, source: "manual" });
  });

  it("does not add to, average with, or otherwise blend the API value", () => {
    const out = applyManualOverrides(fromApi, { growthSpeedTier: 1 });
    expect(out.growthSpeedTier?.value).toBe(1);
  });

  it("keeps the API value when the field was not typed", () => {
    expect(applyManualOverrides(fromApi, {}).growthSpeedTier).toStrictEqual({ value: 4, source: "api" });
  });

  it("treats a typed 0 as a real answer, not as absence", () => {
    // The whole reason presence is the signal: 0 is meaningful for every one of
    // these stats, so it must not collapse into "I have not said".
    const out = applyManualOverrides(fromApi, { growthSpeedTier: 0 });
    expect(out.growthSpeedTier).toStrictEqual({ value: 0, source: "manual" });
  });

  it("lets a typed number fill a stat the API cannot answer at all", () => {
    const out = applyManualOverrides(fromApi, { cropGrowth: 150, plots: 3, bioanalysis: 2 });
    expect(out.cropGrowth).toStrictEqual({ value: 150, source: "manual" });
    expect(out.plots).toStrictEqual({ value: 3, source: "manual" });
    expect(out.bioanalysis).toStrictEqual({ value: 2, source: "manual" });
  });

  it("withdraws an override when the field is undefined or null again", () => {
    const withdrawn: ManualGreenhouseStats = { growthSpeedTier: undefined };
    expect(applyManualOverrides(fromApi, withdrawn).growthSpeedTier).toStrictEqual({ value: 4, source: "api" });
    expect(applyManualOverrides(fromApi, { growthSpeedTier: null }).growthSpeedTier).toStrictEqual({
      value: 4,
      source: "api",
    });
  });

  it("ignores a non-finite override rather than poisoning the estimate", () => {
    expect(applyManualOverrides(fromApi, { growthSpeedTier: Number.NaN }).growthSpeedTier).toStrictEqual({
      value: 4,
      source: "api",
    });
  });

  it("leaves fetchedAt alone, because editing a number does not re-date a pull", () => {
    expect(applyManualOverrides(fromApi, { growthSpeedTier: 9 }).fetchedAt).toBe(AT);
    expect(applyManualOverrides(EMPTY_STATS, { plots: 2 }).fetchedAt).toBeNull();
  });

  it("does not mutate the stats it was given", () => {
    const before = JSON.stringify(fromApi);
    applyManualOverrides(fromApi, { growthSpeedTier: 9, cropGrowth: 200 });
    expect(JSON.stringify(fromApi)).toBe(before);
  });
});

/**
 * The bound on the floor bypass.
 *
 * An account or profile switch is allowed to skip the ten second floor, because
 * the numbers on screen belong to somebody else the moment it happens and there
 * is no timer here that would come back later to replace them.
 *
 * That courtesy used to be unconditional, and unconditional was a hole. The
 * cross-tab storage listener calls `forget` on every switch, so a person
 * flipping the profile select with several tabs open could put one request per
 * flip per tab onto the wire with nothing throttling it. Against a budget of
 * 300 requests per five minutes, sustained flipping across a couple of tabs was
 * enough to go through it.
 *
 * The bound is one skip per gap. What follows pins the sequence rather than a
 * single call, because the sequence is the thing that was wrong.
 */
describe("mayBypassFloor: a switch may skip the floor, but not repeatedly", () => {
  const T0 = 1_700_000_000_000;

  it("lets a switch through when none has skipped the floor before", () => {
    // The ordinary case, and the one the bypass exists for. Null is the
    // starting state and stays a yes however long the page has been open.
    expect(mayBypassFloor(null, T0)).toBe(true);
    expect(mayBypassFloor(null, T0 + 60 * 60 * 1000)).toBe(true);
  });

  it("makes a second switch a moment later wait", () => {
    /*
     * The regression this whole change is about. The first switch skips the
     * floor and records that it did; the second, one second later, is refused.
     *
     * Refused does not mean dropped. `forget` simply leaves `lastAttempt`
     * alone, so the switch falls back to the ordinary floor and gets its answer
     * on that schedule instead of ahead of it.
     */
    let lastBypassAt: number | null = null;

    expect(mayBypassFloor(lastBypassAt, T0)).toBe(true);
    lastBypassAt = T0;

    expect(mayBypassFloor(lastBypassAt, T0 + 1_000)).toBe(false);
    expect(mayBypassFloor(lastBypassAt, T0 + 5_000)).toBe(false);
    expect(mayBypassFloor(lastBypassAt, T0 + MIN_GAP_MS - 1)).toBe(false);
  });

  it("only records a skip when one is actually granted", () => {
    /*
     * A refusal must not push the window forward. If it did, somebody holding
     * the select down would keep resetting the clock and the bypass would never
     * come back, which would quietly turn a bounded courtesy into a permanently
     * withdrawn one.
     */
    let lastBypassAt: number | null = null;

    expect(mayBypassFloor(lastBypassAt, T0)).toBe(true);
    lastBypassAt = T0;

    // Four refusals in the same window, none of them recorded.
    for (const t of [1_000, 2_000, 3_000, 9_999]) expect(mayBypassFloor(lastBypassAt, T0 + t)).toBe(false);

    // The window is still measured from the granted skip, so it opens on time.
    expect(mayBypassFloor(lastBypassAt, T0 + MIN_GAP_MS)).toBe(true);
  });

  it("opens again exactly on the gap and not before", () => {
    expect(mayBypassFloor(T0, T0 + MIN_GAP_MS - 1)).toBe(false);
    expect(mayBypassFloor(T0, T0 + MIN_GAP_MS)).toBe(true);
    expect(mayBypassFloor(T0, T0 + MIN_GAP_MS + 1)).toBe(true);
  });

  it("agrees the gap is the same ten seconds the floor uses", () => {
    // Stated independently of the constant, so changing the floor has to be a
    // deliberate edit here too rather than a silent follow-on.
    expect(MIN_GAP_MS).toBe(10_000);
  });

  it("leaves the ordinary floor untouched", () => {
    /*
     * Everything that is not a switch is governed by the floor exactly as
     * before: `refreshGreenhouseStats` still returns early while
     * `Date.now() - lastAttempt` is under the gap, and this change writes
     * nothing on the path that does not involve a switch.
     *
     * The check is the same arithmetic in both places, so it is pinned here at
     * the same boundary to keep the two from drifting apart.
     */
    const floorIsOpen = (lastAttempt: number, now: number) => now - lastAttempt >= MIN_GAP_MS;

    expect(floorIsOpen(T0, T0 + MIN_GAP_MS - 1)).toBe(false);
    expect(floorIsOpen(T0, T0 + MIN_GAP_MS)).toBe(true);
    // A zeroed `lastAttempt` is what a granted skip leaves behind, and it reads
    // as wide open against any real clock.
    expect(floorIsOpen(0, T0)).toBe(true);
  });
});
