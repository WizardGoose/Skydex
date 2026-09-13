import { describe, it, expect, beforeEach, vi } from "vitest";
import { betterEconomy, fnv1a, solvedEconomies } from "../economyCache";
import { emptySpread, jointP90 } from "../planEstimates";
import type { PlotEconomy } from "../solverPlan";

/**
 * The two halves of the "time estimate jumps around / yeah right" fix.
 *
 * ECONOMY CACHE: the plot solver is an anytime search under a wall-clock
 * deadline, so a re-solve on a loaded machine lands on a different plot and
 * the plan's headline time moves with it. The cache persists answers and
 * replaces them only with strictly better ones, so the number can tighten but
 * never wander.
 *
 * JOINT P90: the plan's "90% within" used to sum per-row p90s, pricing every
 * row unlucky at once. The joint figure is tested here at the helper level;
 * the plan-shaped assertions live in planEstimates.test.ts.
 */

const eco = (yield_: number, crops: Record<string, number>): PlotEconomy => ({ yield: yield_, crops });

describe("betterEconomy", () => {
  it("prefers more yield above everything", () => {
    expect(betterEconomy(eco(50, { a: 90 }), eco(51, { a: 99, b: 99 }))).toBe(true);
    expect(betterEconomy(eco(51, { a: 99, b: 99 }), eco(50, { a: 1 }))).toBe(false);
  });

  it("breaks a yield tie by fewer placements, then fewer crop types", () => {
    // A field's crop variety does not change its clock; the unique-crop bonus
    // is greenhouse-wide. Fewer physical placements therefore wins first.
    expect(betterEconomy(eco(50, { a: 10, b: 10 }), eco(50, { a: 30 }))).toBe(false);
    expect(betterEconomy(eco(50, { a: 30 }), eco(50, { a: 10, b: 10 }))).toBe(true);
    expect(betterEconomy(eco(50, { a: 30 }), eco(50, { a: 20 }))).toBe(true);

    // On an equal bill, fewer kinds is the simpler field.
    expect(betterEconomy(eco(50, { a: 10, b: 10 }), eco(50, { a: 20 }))).toBe(true);
  });

  it("keeps the stored answer on an exact tie, so equal plots cannot flap", () => {
    expect(betterEconomy(eco(50, { a: 30 }), eco(50, { a: 30 }))).toBe(false);
  });

  it("never lets a null replace a real answer, and lets anything replace nothing", () => {
    expect(betterEconomy(eco(1, { a: 1 }), null)).toBe(false);
    expect(betterEconomy(null, eco(1, { a: 1 }))).toBe(true);
    expect(betterEconomy(undefined, eco(1, { a: 1 }))).toBe(true);
  });
});

describe("solvedEconomies persistence", () => {
  /** A localStorage that behaves like one, since node's global has no methods. */
  const fakeStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
      dump: () => map,
    };
  };

  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
    vi.stubGlobal("localStorage", storage);
    solvedEconomies.__resetForTests();
  });

  it("survives a session boundary: what one session solved, the next starts from", () => {
    solvedEconomies.set("choconut", eco(72, { melon: 20 }));
    expect(solvedEconomies.get("choconut")).toEqual(eco(72, { melon: 20 }));

    // A new session is a fresh in-memory state over the same storage.
    solvedEconomies.__resetForTests();
    expect(solvedEconomies.has("choconut")).toBe(true);
    expect(solvedEconomies.get("choconut")).toEqual(eco(72, { melon: 20 }));
  });

  it("a worse re-solve does not move the stored answer - the number cannot wander", () => {
    solvedEconomies.set("choconut", eco(72, { melon: 20 }));
    solvedEconomies.set("choconut", eco(68, { melon: 18 }));
    expect(solvedEconomies.get("choconut")).toEqual(eco(72, { melon: 20 }));

    solvedEconomies.set("choconut", eco(75, { melon: 22 }));
    expect(solvedEconomies.get("choconut")).toEqual(eco(75, { melon: 22 }));
  });

  it("remembers a null in memory but never writes it to disk", () => {
    solvedEconomies.set("jerryflower", null);
    // In memory: the page stops re-asking this session.
    expect(solvedEconomies.has("jerryflower")).toBe(true);
    expect(solvedEconomies.get("jerryflower")).toBeNull();

    // Next session: absent, so the question gets a fresh attempt - this
    // session's null may only have been a deadline that fired too soon.
    solvedEconomies.__resetForTests();
    expect(solvedEconomies.has("jerryflower")).toBe(false);
  });

  it("writes under its own single key and touches nothing else", () => {
    storage.setItem("wizardsky.apikey.v1", "not ours to touch");
    solvedEconomies.set("choconut", eco(72, { melon: 20 }));
    expect(storage.getItem("wizardsky.apikey.v1")).toBe("not ours to touch");
    const keys = [...storage.dump().keys()];
    expect(keys.sort()).toEqual(["skydex.greenhouse.economies.v1", "wizardsky.apikey.v1"]);
  });
});

describe("fnv1a", () => {
  it("is stable and separates different content", () => {
    expect(fnv1a("abc")).toBe(fnv1a("abc"));
    expect(fnv1a("abc")).not.toBe(fnv1a("abd"));
  });
});

describe("jointP90", () => {
  it("says nothing about no rows", () => {
    expect(jointP90(emptySpread())).toBe(0);
  });

  it("passes a single row's exact figure through untouched, even below its mean", () => {
    // The tight-binomial case hasSpread documents: mean 9.018 rounds, p90 at 9.
    expect(jointP90({ expected: 901.8, variance: 100, maxP90: 900, rows: 1 })).toBe(900);
  });

  it("prices a sum by its combined spread, not by everything unlucky at once", () => {
    const acc = { expected: 100, variance: 400, maxP90: 60, rows: 4 };
    // mean + 1.2816 x sqrt(400) = 100 + 25.63
    expect(jointP90(acc)).toBeCloseTo(100 + 1.2815515655446004 * 20, 6);
  });

  it("never sits below the mean or below any member's own p90", () => {
    // One heavy row dominates: the total pointwise dominates it, so its exact
    // p90 floors the joint figure whatever the normal approximation says.
    expect(jointP90({ expected: 100, variance: 1, maxP90: 140, rows: 2 })).toBe(140);
    expect(jointP90({ expected: 100, variance: 0, maxP90: 0, rows: 3 })).toBe(100);
  });
});
