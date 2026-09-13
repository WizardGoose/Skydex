import { describe, expect, it } from "vitest";
import { EMPTY_STATS, parseGreenhouseStats } from "../profileStats";
import type { GreenhouseStats } from "../profileStats";
import { resolveGrowth, resolveSpeedTier } from "../../greenhouse/planner/growthSource";
import { stageSeconds } from "../../greenhouse/planner/time";
import type { GrowthSettings } from "../../greenhouse/planner/time";

/**
 * The Growth Speed auto-fill, end to end.
 *
 * Everything between the garden endpoint and the number on screen is pure, so
 * the whole chain can be walked in one file with no network and no React:
 *
 *   garden payload -> parseGreenhouseStats -> resolveGrowth -> stageSeconds
 *                                                           -> the "from API" chip
 *
 * The individual links are already tested. What was NOT tested is that they
 * join up, and joining up is the part that quietly regresses: each half can
 * stay green while the tier stops reaching the estimate, which is exactly the
 * failure that prompted this. So the assertions here are deliberately about the
 * seams rather than about any one function.
 *
 * The one thing this file cannot prove is that the pull is ever invoked. That
 * is a subscription question, not a data question, and it is recorded at the
 * bottom of this file as the trigger note.
 */

/** A garden payload in the envelope the live path actually builds. */
const gardenPayload = (tier?: unknown) => ({
  garden: {
    garden_experience: 32_500,
    unlocked_plots_ids: ["beginner_1", "beginner_2"],
    ...(tier === undefined ? {} : { garden_upgrades: { GROWTH_SPEED: tier } }),
  },
});

const UUID = "b876ec32e396476ba1158438d83c67d4";
const AT = 1_700_000_000_000;

/**
 * The planner's growth settings, in the shape both the panel and the estimate
 * read. `speedTier` is the stored mirror; `speedTierManual` is the typed layer,
 * and its PRESENCE is the override signal.
 */
type Growth = GrowthSettings & { speedTierManual?: number };

const baseGrowth: Growth = { cropGrowth: 100, speedTier: 0, uniqueCrops: 12 };

/**
 * The "from API" chip's rule, mirrored from `GreenhouseSettings.tsx` lines 114
 * to 115.
 *
 * Re-expressed rather than imported because it is a module-local const in a
 * component file. Kept here because the claim it makes is the one worth
 * pinning: the chip may only say "api" when the value the estimate is running
 * on is the same number the API supplied. A chip that says api over a number
 * the player typed, or over a number nothing supplied, is the failure.
 */
const chipSaysApi = (stats: GreenhouseStats | null, live: number): boolean => {
  const stat = stats?.growthSpeedTier;
  return Boolean(stat && stat.source === "api" && stat.value === live);
};

describe("the garden payload reaches the parsed stats", () => {
  it("reads GROWTH_SPEED off garden_upgrades and stamps it as api", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    expect(stats.growthSpeedTier).toStrictEqual({ value: 7, source: "api" });
    expect(stats.fetchedAt).toBe(AT);
  });

  it("keeps tier 0 as a real answer rather than an absent one", () => {
    // "No upgrades bought" is a genuine state and must not collapse into null,
    // or the auto-fill would silently decline to answer for everybody who has
    // not started upgrading yet.
    const stats = parseGreenhouseStats(gardenPayload(0), UUID, AT);
    expect(stats.growthSpeedTier).toStrictEqual({ value: 0, source: "api" });
  });

  it("declines a tier outside the range the formula knows", () => {
    // Out of range means the field is not what we think it is, and declining
    // beats putting a confident wrong number into a time estimate.
    for (const bad of [10, -1, 1.5, "seven", null]) {
      expect(parseGreenhouseStats(gardenPayload(bad), UUID, AT).growthSpeedTier).toBeNull();
    }
  });

  it("treats a profile with no garden as read but empty", () => {
    // The endpoint answers 200 with no garden object for a profile that has
    // never been to the Garden. That is an answer, not a failure.
    const stats = parseGreenhouseStats({ garden: null }, UUID, AT);
    expect(stats.growthSpeedTier).toBeNull();
  });
});

describe("the parsed tier reaches the estimate", () => {
  it("auto-fills a tier the player has not typed", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    expect(resolveSpeedTier(baseGrowth, stats)).toBe(7);
    expect(resolveGrowth(baseGrowth, stats).speedTier).toBe(7);
  });

  it("makes the stage time actually move, which is the whole point", () => {
    /*
     * The seam that matters. It is possible for the chip to light up while the
     * estimate still runs on the stored tier, because they are two reads of what
     * ought to be one number. Comparing the two stage times proves the resolved
     * growth is what `stageSeconds` was handed.
     */
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    const resolved = resolveGrowth(baseGrowth, stats);

    const withApi = stageSeconds(resolved);
    const withoutApi = stageSeconds(baseGrowth);

    expect(withApi).toBeLessThan(withoutApi);
    // 14400 / (1 + 0.025*12 + 0.0025*100 + 0.05*7), the wiki formula as
    // implemented in time.ts. Stated as a number so a change to the model has
    // to be a deliberate edit here.
    expect(withApi).toBeCloseTo(14400 / 1.9, 6);
    expect(withoutApi).toBeCloseTo(14400 / 1.55, 6);
  });

  it("honours the flat top tier rather than extrapolating the per tier step", () => {
    const stats = parseGreenhouseStats(gardenPayload(9), UUID, AT);
    const resolved = resolveGrowth(baseGrowth, stats);
    expect(stageSeconds(resolved)).toBeCloseTo(14400 / 2.05, 6);
  });

  it("lights the chip on the same number the estimate ran on", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    const resolved = resolveGrowth(baseGrowth, stats);
    expect(chipSaysApi(stats, resolved.speedTier)).toBe(true);
  });
});

describe("precedence: a typed tier still wins", () => {
  const typed: Growth = { ...baseGrowth, speedTierManual: 3 };

  it("runs the estimate on the typed tier, not the API one", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    const resolved = resolveGrowth(typed, stats);
    expect(resolved.speedTier).toBe(3);
    expect(stageSeconds(resolved)).toBeCloseTo(14400 / 1.7, 6);
  });

  it("does not claim the typed number came from the API", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    const resolved = resolveGrowth(typed, stats);
    expect(chipSaysApi(stats, resolved.speedTier)).toBe(false);
  });

  it("treats a typed 0 as an override and not as an absent field", () => {
    const stats = parseGreenhouseStats(gardenPayload(7), UUID, AT);
    const resolved = resolveGrowth({ ...baseGrowth, speedTierManual: 0 }, stats);
    expect(resolved.speedTier).toBe(0);
    expect(chipSaysApi(stats, resolved.speedTier)).toBe(false);
  });
});

/**
 * The state this regression test covers.
 *
 * A key can be present while no garden pull has ever succeeded, because the
 * pull is only invoked where something subscribes to the store. Nothing is
 * wrong with the data path in that state, and that is precisely the problem:
 * the Speed tier row sits on its stored value with no chip, which is visually
 * identical to the three rows that are manual by design and stay that way.
 */
describe("no pull has happened", () => {
  it("leaves the stored tier in force and shows no chip", () => {
    const resolved = resolveGrowth({ ...baseGrowth, speedTier: 5 }, EMPTY_STATS);
    expect(resolved.speedTier).toBe(5);
    expect(chipSaysApi(EMPTY_STATS, resolved.speedTier)).toBe(false);
  });

  it("is distinguishable from a pull that found no garden", () => {
    /*
     * The distinction the affordance hint has to key off: `fetchedAt` is the
     * only thing separating "never asked" from "asked, and this profile has no
     * Garden", and the two deserve different sentences.
     *
     * Worth being precise about WHERE that distinction is made, because it is
     * not where you would first look. The parser refuses to stamp a time onto a
     * payload it was handed nothing to read, so a null garden comes back as
     * EMPTY_STATS with `fetchedAt` still null, indistinguishable from silence.
     * The store is what knows better: the request happened and came back clean,
     * so `refreshGreenhouseStats` stamps the time itself on the way past.
     *
     * Both halves are pinned here. Anything reading `fetchedAt` as "we asked"
     * is reading a value the store supplies, not one the parser does.
     */
    const neverAsked = EMPTY_STATS;
    const askedAndBlank = parseGreenhouseStats({ garden: null }, UUID, AT);

    expect(neverAsked.fetchedAt).toBeNull();
    expect(askedAndBlank.growthSpeedTier).toBeNull();
    expect(askedAndBlank.fetchedAt).toBeNull();

    // The store's own rule, mirrored from `refreshGreenhouseStats`. This is the
    // line that turns a clean blank into an answer.
    const published = askedAndBlank.fetchedAt === null ? { ...askedAndBlank, fetchedAt: AT } : askedAndBlank;
    expect(published.fetchedAt).toBe(AT);
    expect(published.growthSpeedTier).toBeNull();
  });
});
