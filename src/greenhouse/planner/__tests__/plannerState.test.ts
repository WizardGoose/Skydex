import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import LandingPage from "../../../pages/LandingPage";
import {
  foreignFields,
  load,
  normaliseTargetQuantity,
  refreshPlannerState,
  snapshotUnchanged,
  writeState,
  type PlanSnapshot,
  type PlannerState,
} from "../usePlannerState";

/**
 * The storage contract and the snapshot contract.
 *
 * Both exist because breaking either loses a player's grind. The planner owns
 * exactly one key and only ever adds to it, and the landing page's resume
 * card has to keep rendering a snapshot written by a build that predates the
 * time model.
 */

/** The literal key, spelled out so a rename fails here rather than in the wild. */
const KEY = "wizardsky.planner.v2";

/**
 * A localStorage that screams if anything reaches for the destructive calls.
 *
 * A previous pass at this feature shipped a `localStorage.clear()`, which took
 * every other tool's data with it. Nothing in the planner may enumerate,
 * remove or clear, so those paths throw rather than quietly succeed.
 */
const store = new Map<string, string>();
const stub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: () => {
    throw new Error("removeItem is not allowed from planner code");
  },
  clear: () => {
    throw new Error("clear() is not allowed from planner code");
  },
  key: () => {
    throw new Error("key enumeration is not allowed from planner code");
  },
  get length() {
    throw new Error("key enumeration is not allowed from planner code");
  },
};
(globalThis as unknown as { localStorage: unknown }).localStorage = stub;

/** A blob as some other build left it: our fields, plus one we know nothing about. */
const EXISTING = {
  targets: [{ id: "rose_dragon_pet", kind: "item", qty: 1 }],
  inventory: { choconut: 40 },
  progress: { dustgrain: 3 },
  options: { showBaseCrops: false, hideCompleted: true, showTime: true },
  view: { cycle: 2, mutation: "dustgrain" },
  growth: { cropGrowth: 120, speedTier: 5, uniqueCrops: 0, plots: 2 },
  snapshot: {
    plots: { dustgrain: 6, choconut: 7 },
    names: { dustgrain: "Dustgrain", choconut: "Choconut" },
    cycleOf: { dustgrain: 0, choconut: 0 },
    totalPlantings: 13,
    cycles: 1,
    targetLabel: "Rose Dragon Pet",
    updatedAt: 1_700_000_000_000,
  },
  // Not ours. Written by a build this one has never met.
  islandLayoutDraft: { rows: 4, note: "keep me" },
  someFutureFlag: true,
};

beforeEach(() => {
  store.clear();
  store.set(KEY, JSON.stringify(EXISTING));
});

describe("settings persistence", () => {
  it("reads the fields it knows and defaults the ones it added", () => {
    const state = load();

    expect(state.growth.cropGrowth).toBe(120);
    expect(state.growth.plots).toBe(2);
    // Bioanalysis did not exist when this blob was written.
    expect(state.growth.bioanalysis).toBe("none");
    expect(state.options.hideCompleted).toBe(true);
    expect(state.inventory).toEqual({ choconut: 40 });
  });

  /**
   * The manual layers are presence-signalled, so storage has to carry the
   * DIFFERENCE between a typed number and no typed number, not just a number.
   *
   * `plotsManual` is the one that arrived last and the one that is easiest to
   * get wrong, because the obvious mistake is giving it a default. A default
   * would make every blob look like it carried an override and would pin the
   * Plots control away from the API forever. This blob predates the field, so
   * the key has to come back absent rather than as a 1.
   */
  it("leaves an absent manual layer absent rather than defaulting it", () => {
    const growth = load().growth;

    expect("plotsManual" in growth).toBe(false);
    expect(growth.plotsManual).toBeUndefined();
    expect("speedTierManual" in growth).toBe(false);
  });

  /**
   * And the value that a truthiness check would eat. A typed 0 is a stated
   * count, so it has to survive a write and a read as a 0 rather than
   * evaporating into "has not said" and handing the field back to the API.
   */
  it("round trips a typed plot count of 0", () => {
    const state = load();
    writeState(
      { ...state, growth: { ...state.growth, plotsManual: 0 } },
      foreignFields(JSON.parse(store.get(KEY)!))
    );

    const after = JSON.parse(store.get(KEY)!);
    expect(after.growth.plotsManual).toBe(0);
    // Foreign fields and the neighbouring settings are untouched by the new key.
    expect(after.growth.speedTier).toBe(5);
    expect(after.islandLayoutDraft).toEqual({ rows: 4, note: "keep me" });

    const reloaded = load().growth;
    expect(reloaded.plotsManual).toBe(0);
    expect("plotsManual" in reloaded).toBe(true);
  });

  it("writes a new setting without disturbing the existing ones", () => {
    const state = load();
    writeState({ ...state, growth: { ...state.growth, bioanalysis: "artifact" } }, foreignFields(JSON.parse(store.get(KEY)!)));

    const after = JSON.parse(store.get(KEY)!);
    expect(after.growth.bioanalysis).toBe("artifact");
    expect(after.growth.cropGrowth).toBe(120);
    expect(after.growth.speedTier).toBe(5);
    expect(after.growth.plots).toBe(2);
    expect(after.targets).toEqual(EXISTING.targets);
    expect(after.inventory).toEqual(EXISTING.inventory);
    expect(after.progress).toEqual(EXISTING.progress);
    expect(after.view).toEqual(EXISTING.view);
  });

  /** The whole point of `foreignFields`. */
  it("carries fields it does not understand straight through", () => {
    const raw = JSON.parse(store.get(KEY)!);
    const foreign = foreignFields(raw);

    expect(foreign).toEqual({ islandLayoutDraft: { rows: 4, note: "keep me" }, someFutureFlag: true });

    writeState(load(), foreign);

    const after = JSON.parse(store.get(KEY)!);
    expect(after.islandLayoutDraft).toEqual({ rows: 4, note: "keep me" });
    expect(after.someFutureFlag).toBe(true);
  });

  it("survives a full read and write round trip with nothing lost", () => {
    const before = JSON.parse(store.get(KEY)!);
    writeState(load(), foreignFields(before));
    const after = JSON.parse(store.get(KEY)!);

    for (const key of Object.keys(before)) expect(after).toHaveProperty(key);
  });

  it("touches one key and only one key", () => {
    store.set("wizardsky.island.v1", "someone else's data");
    writeState(load(), foreignFields(JSON.parse(store.get(KEY)!)));

    expect([...store.keys()].sort()).toEqual(["wizardsky.island.v1", KEY]);
    expect(store.get("wizardsky.island.v1")).toBe("someone else's data");
  });

  it("does not fall over on a corrupt value", () => {
    store.set(KEY, "{not json");
    expect(() => load()).not.toThrow();
    expect(load().targets).toEqual([]);
  });
});

describe("snapshot forward compatibility", () => {
  /**
   * A static render subscribes to nothing, so nothing would have told the
   * planner store that this test moved the bytes underneath it. `refreshPlannerState`
   * is the same catch-up the first subscriber and the cross-tab listener do,
   * called here because a server render has neither.
   */
  /*
   * The reader here is the LANDING PAGE's resume card - the surface that
   * actually ships. It used to be the full dashboard board (DashboardPage),
   * since pulled back to this one compact card; the board itself was
   * deleted at the release cleanup. The card reads the same snapshot
   * through the same shared planEstimates functions, so the forward
   * compatibility contract is unchanged; only the rendered surface shrank -
   * one target line, a bar, and the model's own left-clock. The board-only
   * assertions (up-next list, whole-grind figure, harvest windows) died with
   * the board.
   */
  const render = () => {
    refreshPlannerState();
    return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(LandingPage)));
  };

  /**
   * The old snapshot has no `expectedSeconds`, no `p90Seconds` and no
   * `expectedSecondsLeft`. It must still render: the grind and the bar, and
   * simply no clock.
   */
  it("renders a snapshot written before the time model existed", () => {
    const html = render();

    expect(html).toContain("Rose Dragon Pet");
    expect(html).toContain("Continue in the Planner");
    // Nothing invented where there is no data.
    expect(html).not.toMatch(/~\d/);
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
    expect(html).not.toContain("instant");
  });

  it("shows the time once a snapshot carries it", () => {
    const snapshot: PlanSnapshot = {
      ...(EXISTING.snapshot as PlanSnapshot),
      expectedSeconds: 125_193_600,
      p90Seconds: 127_699_200,
      expectedSecondsLeft: 60_480_000, // 700d still ahead
      p90SecondsLeft: 63_072_000,
      harvestWindow: { dustgrain: 5, choconut: 4 },
      expectedSecondsOf: { dustgrain: 86_400_000, choconut: 38_793_600 },
      expectedSecondsLeftOf: { dustgrain: 43_200_000, choconut: 38_793_600 },
    };
    store.set(KEY, JSON.stringify({ ...EXISTING, snapshot }));

    const html = render();

    expect(html).toContain("~700d"); // the model's OWN left figure, untouched
    expect(html).toContain("left");
    expect(html).not.toContain("NaN");
  });

  /**
   * The card shows the estimate model's own LEFT figure and never does
   * arithmetic on the full ones. The old version of this test pinned the
   * opposite - a plantings-fraction discount derived on the page - and that
   * second derivation is exactly why this clock kept disagreeing with the
   * Planner header (a mismatch repeatedly visible in real use). A snapshot
   * that carries only the FULL figures gets no clock at all: showing nothing
   * beats re-deriving a number the model owns.
   */
  it("shows the model's left figure verbatim, and no clock without one", () => {
    const withLeft: PlanSnapshot = {
      ...(EXISTING.snapshot as PlanSnapshot),
      expectedSecondsLeft: 7 * 86_400,
    };
    store.set(KEY, JSON.stringify({ ...EXISTING, snapshot: withLeft }));
    expect(render()).toContain("~7d");

    const fullOnly: PlanSnapshot = {
      ...(EXISTING.snapshot as PlanSnapshot),
      expectedSeconds: 100,
      expectedSecondsOf: { dustgrain: 6 * 86_400, choconut: 4 * 86_400 },
    };
    store.set(KEY, JSON.stringify({ ...EXISTING, snapshot: fullOnly }));
    expect(render()).not.toMatch(/~\d/);
  });

  it("renders no resume card with no snapshot at all", () => {
    store.set(KEY, JSON.stringify({ ...EXISTING, snapshot: null }));
    const html = render();
    // The landing page still stands; the card simply is not there.
    expect(html).not.toContain("Continue in the Planner");
    expect(html).not.toContain("NaN");
  });
});

/**
 * The sizing choice, stored per mutation.
 *
 * It is a plan choice rather than a display option, so it persists, and it is
 * PER ROW because the choice is per row: wanting two Soggybud sooner says
 * nothing about the eleven tiers underneath them. Presence is the signal, the
 * same rule `growFresh` and `inventory` follow, so an untouched row stays
 * distinguishable from one deliberately set back to the default.
 */
describe("per-mutation sizing", () => {
  it("starts empty, which reads as minimal everywhere", () => {
    expect(load().sizing).toEqual({});
  });

  it("stores only the rows deliberately switched", () => {
    const state = { ...load(), sizing: { soggybud: "confident" as const } };
    writeState(state, foreignFields(JSON.parse(store.get(KEY)!)));

    expect(load().sizing).toEqual({ soggybud: "confident" });
    // And the blob it shares a key with is untouched.
    expect(JSON.parse(store.get(KEY)!).islandLayoutDraft).toEqual({ rows: 4, note: "keep me" });
  });

  it("drops a stored default rather than carrying it", () => {
    /*
     * A row written as "minimal" is today's default written down. Carrying it
     * would make an untouched row indistinguishable from a chosen one, and
     * would freeze this build's default into storage where a later build could
     * not tell the two apart.
     */
    store.set(KEY, JSON.stringify({ ...EXISTING, sizing: { soggybud: "minimal", gloomgourd: "confident" } }));
    expect(load().sizing).toEqual({ gloomgourd: "confident" });
  });

  it("reads a value it does not model as no choice at all", () => {
    // Including the single global mode an earlier cut of this feature stored.
    for (const stored of ["confident", 7, null, ["soggybud"], { soggybud: "fastest" }]) {
      store.set(KEY, JSON.stringify({ ...EXISTING, sizing: stored }));
      expect(load().sizing).toEqual({});
    }
  });
});

describe("the state shape", () => {
  it("keeps billion-scale goal quantities instead of capping them at 999", () => {
    expect(normaliseTargetQuantity(2_000_000_000)).toBe(2_000_000_000);
    expect(normaliseTargetQuantity(4.9)).toBe(4);
    expect(normaliseTargetQuantity(0)).toBe(1);
  });

  /** Every field added to the snapshot has to be optional, or old blobs break. */
  it("keeps the new snapshot fields optional", () => {
    const old: PlanSnapshot = {
      plots: {},
      names: {},
      cycleOf: {},
      totalPlantings: 0,
      cycles: 0,
      targetLabel: "",
      updatedAt: 0,
    };
    const state: PlannerState = { ...load(), snapshot: old };

    expect(state.snapshot?.expectedSeconds).toBeUndefined();
    expect(state.snapshot?.harvestWindow).toBeUndefined();
    expect(state.snapshot?.wantedOf).toBeUndefined();
    expect(state.snapshot?.needOf).toBeUndefined();
    expect(state.snapshot?.perPlotOf).toBeUndefined();
  });
});

describe("when a recomputed snapshot is worth storing", () => {
  const BASE: PlanSnapshot = {
    plots: { choconut: 34, dustgrain: 7 },
    names: { choconut: "Choconut", dustgrain: "Dustgrain" },
    cycleOf: { choconut: 0, dustgrain: 0 },
    totalPlantings: 41,
    cycles: 2,
    targetLabel: "Rose Dragon Pet",
    updatedAt: 1,
    expectedSeconds: 100,
  };
  const WITH_UNITS: PlanSnapshot = {
    ...BASE,
    updatedAt: 2,
    wantedOf: { choconut: 2624, dustgrain: 470 },
    needOf: { choconut: 2379, dustgrain: 470 },
    perPlotOf: { choconut: 72, dustgrain: 72 },
  };

  it("does nothing when genuinely nothing moved", () => {
    expect(snapshotUnchanged(BASE, { ...BASE, updatedAt: 999 })).toBe(true);
  });

  /**
   * The rollout case, and the reason the clause exists. A returning player's
   * stored snapshot was written by the previous build against the same targets
   * and the same settings, so every other comparison passes. Without this the
   * unit maps would never be written and their Dashboard would stay on the
   * plantings-weighted fallback indefinitely.
   */
  it("stores a snapshot that has gained unit demand", () => {
    expect(snapshotUnchanged(BASE, WITH_UNITS)).toBe(false);
  });

  it("does not churn once the stored snapshot already has them", () => {
    expect(snapshotUnchanged(WITH_UNITS, { ...WITH_UNITS, updatedAt: 999 })).toBe(true);
  });

  /** A build that cannot state units must not strip them from a richer snapshot. */
  it("keeps the richer snapshot rather than downgrading it", () => {
    expect(snapshotUnchanged(WITH_UNITS, BASE)).toBe(true);
  });

  it("still notices the things it always noticed", () => {
    expect(snapshotUnchanged(BASE, { ...BASE, totalPlantings: 42 })).toBe(false);
    expect(snapshotUnchanged(BASE, { ...BASE, targetLabel: "Godseed" })).toBe(false);
    expect(snapshotUnchanged(BASE, { ...BASE, expectedSeconds: 200 })).toBe(false);
    expect(snapshotUnchanged(BASE, { ...BASE, plots: { choconut: 34 } })).toBe(false);
    expect(snapshotUnchanged(null, BASE)).toBe(false);
  });
});
