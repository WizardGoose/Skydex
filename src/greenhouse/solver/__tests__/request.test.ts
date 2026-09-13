import { describe, expect, it } from "vitest";

import {
  FULL_PLOT,
  isShippedConfiguration,
  requirementGoal,
  shippedSolveOptions,
  solveGoal,
  solveGoals,
  tuningKeysSet,
} from "../request.ts";
import { canonicalRequest } from "../../solverClient/cacheKey.ts";
import {
  isPrecomputableRequest,
  precomputeCanonical,
  precomputeGoal,
} from "../../solverClient/precomputeProfile.ts";
import {
  FULL_GRID,
  greenhouseCellCacheSuffix,
  greenhouseCellKey,
  PRUNE_UNUSED_CROPS,
} from "../../planner/useSolvedLayout.ts";

/**
 * The Planner showed Soggybud 46 while the economies table showed 51 for the
 * same mutation on the same grid, and at the same time tools/solver-parity.mjs
 * graded six mutations at 71 that the shipped precompute recorded at 72. Both
 * were one disease: several callers each spelling the same question their own
 * way, and one of them quietly passing a seed nobody ships.
 *
 * These tests are the part of the fix that cannot rot. A shared builder that
 * nothing checks is a convention, and conventions lose to the next call site
 * added in a hurry.
 */
describe("one canonical request", () => {
  it("phrases a maximize goal the one way", () => {
    expect(solveGoal("gloomgourd")).toEqual({
      mutation: "gloomgourd",
      maximize: true,
      count: null,
    });
  });

  it("switches to target mode when a size is asked for, which is a different question", () => {
    expect(solveGoal("soggybud", 2)).toEqual({
      mutation: "soggybud",
      maximize: false,
      count: 2,
    });
  });

  /**
   * `count: null` rather than an omitted field is load bearing, not style. The
   * cache key canonicalises the goal, so an absent field and an explicit null
   * are different strings and would miss each other.
   */
  it("spells the empty count explicitly, because the cache key can tell the difference", () => {
    expect(Object.keys(solveGoal("gloomgourd")).sort()).toEqual(["count", "maximize", "mutation"]);
    expect(solveGoal("gloomgourd").count).toBeNull();
  });

  it("asks for one when a requirement grid asks what it takes at all", () => {
    expect(requirementGoal("gloomgourd")).toEqual({
      mutation: "gloomgourd",
      maximize: false,
      count: 1,
    });
  });

  it("builds a multi-target request out of the same single-target phrasing", () => {
    expect(solveGoals(["a", "b"])).toEqual([solveGoal("a"), solveGoal("b")]);
  });
});

describe("the full plot is one list", () => {
  it("covers all 100 cells exactly once", () => {
    expect(FULL_PLOT).toHaveLength(100);
    expect(new Set(FULL_PLOT.map(([r, c]) => `${r},${c}`)).size).toBe(100);
  });

  /**
   * Four copies of this literal existed, one of them built by a different
   * function in a component file. They agreed by luck. The cache and the
   * shipped precompute both key on the exact cell list, so a copy that drifted
   * would have stopped hitting them silently rather than failing.
   */
  it("is the same list the planner sends", () => {
    expect(FULL_GRID).toBe(FULL_PLOT);
  });

  it("is the same list the precompute was built against", () => {
    expect(canonicalRequest(FULL_PLOT, [solveGoal("gloomgourd")], shippedSolveOptions(true))).toBe(
      precomputeCanonical("gloomgourd", true)
    );
  });

  it("keeps a profile cell shape stable without sharing the full-grid cache", () => {
    const profileCells: [number, number][] = [[9, 7], [0, 1], [0, 0], [0, 1]];
    expect(greenhouseCellKey(profileCells)).toBe("0.1.97");
    expect(greenhouseCellKey([...profileCells].reverse())).toBe("0.1.97");
    expect(greenhouseCellCacheSuffix(profileCells)).toBe("@cells:0.1.97");
    expect(greenhouseCellCacheSuffix(FULL_GRID)).toBe("");
  });
});

describe("no shipping caller tunes the search", () => {
  it("treats an untouched request as the shipped configuration", () => {
    expect(isShippedConfiguration({})).toBe(true);
    expect(isShippedConfiguration(shippedSolveOptions(true))).toBe(true);
    expect(tuningKeysSet(shippedSolveOptions(true))).toEqual([]);
  });

  /**
   * The exact defect this module was written for. tools/solver-parity.mjs
   * passed `seed: 20260802`; on the shipped seed those same six mutations
   * reach 72 rather than 71, so six recorded FAILURES were a measurement of a
   * solver nobody runs.
   */
  it.each(["seed", "iterations", "timeBudgetMs"])("refuses a request carrying %s", (key) => {
    expect(isShippedConfiguration({ [key]: 1 })).toBe(false);
    expect(tuningKeysSet({ [key]: 1 })).toEqual([key]);
  });

  it("names every tuning key that is set, so the error is worth reading", () => {
    expect(tuningKeysSet({ seed: 1, timeBudgetMs: 2, removeUnusedCrops: true }).sort()).toEqual([
      "seed",
      "timeBudgetMs",
    ]);
  });

  /**
   * `removeUnusedCrops` varies by intent and is deliberately NOT tuning: it
   * only drops crops no placed spawn needs, so it cannot move a yield.
   */
  it("does not count the pruning intent as tuning", () => {
    expect(isShippedConfiguration({ removeUnusedCrops: true })).toBe(true);
    expect(isShippedConfiguration({ removeUnusedCrops: false })).toBe(true);
  });
});

describe("the planner's own request reaches the shipped precompute", () => {
  /**
   * The point of the precompute is that the Planner's opening burst costs no
   * solver time. That only holds if the request the Planner actually builds is
   * the one the asset is filed under, which is a fact about two call sites
   * agreeing rather than an argument anyone can check by reading.
   */
  it("is precomputable exactly as the planner sends it", () => {
    const goals = [solveGoal("gloomgourd")];
    const options = shippedSolveOptions(PRUNE_UNUSED_CROPS);
    expect(isPrecomputableRequest(FULL_GRID, goals, options)).toBe(true);
    expect(canonicalRequest(FULL_GRID, goals, options)).toBe(
      precomputeCanonical("gloomgourd", PRUNE_UNUSED_CROPS)
    );
  });

  it("uses the same goal the precompute build used", () => {
    expect(precomputeGoal("gloomgourd")).toEqual(solveGoal("gloomgourd"));
  });

  /**
   * A right-sized plot is a different question, so it must MISS the precompute
   * rather than be served a maximized layout that costs more than the plan says.
   */
  it("stops being precomputable the moment a size is asked for", () => {
    expect(isPrecomputableRequest(FULL_GRID, [solveGoal("soggybud", 2)], shippedSolveOptions(true))).toBe(
      false
    );
  });

  /**
   * A dimension that cannot change the answer is not part of the question.
   *
   * Two options learned this the expensive way. `uniqueCrops` is a growth-rate
   * setting the search never reads, and a priority is a tie-break BETWEEN
   * targets that does nothing when there is only one. Both were keyed anyway,
   * on the reasoning that "inert" is an argument and a key is a fact. The
   * consequence was not a wasted cache slot, it was a wrong number on screen:
   * a request carrying either one is not the canonical request, so it missed
   * the shipped precompute and fell back to a cold search, and Ashwreath came
   * back 51 where the build ships 52.
   *
   * `uniqueCrops` is gone from the type, so the compiler enforces that one.
   * Priorities are real on a multi-target solve, so they are normalised rather
   * than removed, and these hold the normalisation in place.
   */
  it("does not let a single-target priority fork the question", () => {
    const goals = [solveGoal("gloomgourd")];
    expect(canonicalRequest(FULL_PLOT, goals, { priorities: { gloomgourd: 7 } })).toBe(
      canonicalRequest(FULL_PLOT, goals)
    );
    expect(isPrecomputableRequest(FULL_PLOT, goals, { priorities: { gloomgourd: 7 } })).toBe(true);
  });

  it("still keys priorities when there is more than one target, where they are real", () => {
    const goals = solveGoals(["gloomgourd", "dustgrain"]);
    expect(canonicalRequest(FULL_PLOT, goals, { priorities: { gloomgourd: 7 } })).not.toBe(
      canonicalRequest(FULL_PLOT, goals)
    );
  });

  it("stops being precomputable on a partial grid", () => {
    expect(
      isPrecomputableRequest(FULL_PLOT.slice(0, 42), [solveGoal("gloomgourd")], shippedSolveOptions(true))
    ).toBe(false);
  });
});
