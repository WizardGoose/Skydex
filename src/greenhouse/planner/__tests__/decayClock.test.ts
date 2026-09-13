import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CropDefinition, MutationDefinition } from "../../types/greenhouse";
import { decayDaysToCycles } from "../../timeModel";
import { buildPlanEstimates, nodeEstimate, type EstimateSettings } from "../planEstimates";
import type { PlotEconomy, SolverPlan, SolverPlanNode } from "../solverPlan";
import { stageSeconds } from "../time";

/**
 * The decay clock, which had never once run.
 *
 * `data.json` states a decay timer for all forty mutations and the terminal
 * tools read that file directly, so `pnpm check` has always had it. The list the
 * PAGES read was assembled separately, in the dataset store, and that assembly
 * simply never copied the field. Every consumer therefore read
 * `mutation.decay ?? 0`, `maxHarvestWindow` found no clock to impose, and the
 * Planner's "capped by decay" label was structurally unreachable: an absent
 * decay makes `maxWindow` infinite, and the label tests `Number.isFinite`.
 *
 * So there are two separate things to pin, and only the first is about the fix:
 *
 *   THE FIELD REACHES THE APP. The store's mutation list carries decay, with a
 *   stated 0 still distinguishable from an absent one.
 *   THE NUMBERS. What that does to the estimates, measured rather than assumed,
 *   including the case where the answer is "nothing" and the margin that makes
 *   it nothing.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const raw = JSON.parse(readFileSync(join(ROOT, "public/greenhouse/data.json"), "utf8")) as {
  crops: Record<string, Omit<CropDefinition, "id">>;
  mutations: Record<string, Omit<MutationDefinition, "id">>;
};

const withIds = <T,>(rec: Record<string, T>, strip = false): Record<string, T & { id: string }> =>
  Object.fromEntries(
    Object.entries(rec).map(([id, v]) => {
      const next = { ...v, id } as T & { id: string; decay?: number };
      if (strip) delete next.decay;
      return [id, next];
    })
  );

type Dataset = { crops: Record<string, CropDefinition>; mutations: Record<string, MutationDefinition> };

/** The dataset as it is. */
const WITH_DECAY = { crops: withIds(raw.crops), mutations: withIds(raw.mutations) } as Dataset;
/** The dataset as the app saw it while the store was dropping the field. */
const WITHOUT_DECAY = { crops: withIds(raw.crops), mutations: withIds(raw.mutations, true) } as Dataset;

/** Solver answers for one full plot, captured from the live solver. */
const ECONOMIES: Record<string, PlotEconomy | null> = {
  choconut: { yield: 72, crops: { cocoa_beans: 26 } },
  lonelily: { yield: 100, crops: {} },
  all_in_aloe: { yield: 16, crops: { magic_jellybean: 1, plantboy_advance: 1, sugar_cane: 4 } },
};

const BARE: EstimateSettings = { cropGrowth: 0, speedTier: 0, uniqueCrops: 0, plots: 1 };

const node = (id: string, need: number, plots: number): SolverPlanNode => ({
  id,
  name: WITH_DECAY.mutations[id]?.name ?? id,
  kind: "mutation",
  need,
  have: 0,
  cycle: 0,
  perPlot: ECONOMIES[id]?.yield,
  plots,
});

const planOf = (nodes: SolverPlanNode[]): SolverPlan => ({
  cycles: [{ index: 0, produce: nodes }],
  baseCrops: [], placed: [],
  manual: [],
  unknown: [],
  pending: [],
  totalPlantings: nodes.reduce((s, n) => s + (n.plots ?? 0), 0),
  depth: 1,
});

/* -------------------------------------------------------------------------- */
/* The field reaches the app                                                  */
/* -------------------------------------------------------------------------- */

type DatasetStore = typeof import("../../data/datasetStore");

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(): string | null {
    return null;
  }
  get length(): number {
    return this.map.size;
  }
}

let store: DatasetStore;

beforeAll(async () => {
  // The store reads the wiki cache and registers a cross-tab listener at module
  // load, so both globals have to stand before the import. `fetch` rejects
  // because nothing here may reach the network: a regressed freshness check
  // should fail loudly rather than quietly pull the real wiki.
  vi.stubGlobal("localStorage", new MemoryStorage());
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in tests")))
  );

  store = await import("../../data/datasetStore");
});

describe("the dataset the pages actually read", () => {
  /**
   * The regression itself. Every mutation the file states a decay for has to
   * arrive at the page with that decay on it, or the clock is off again and
   * nothing else in this file is testing anything.
   */
  it("carries the decay timer for every mutation that has one", () => {
    const listed = new Map(store.getDataset().mutations.map((m) => [m.id, m]));
    const stated = Object.entries(raw.mutations).filter(([, m]) => (m as { decay?: number }).decay);

    expect(stated.length).toBe(37);
    for (const [id, m] of stated) {
      expect(listed.get(id)?.decay).toBe((m as { decay?: number }).decay);
    }
  });

  /**
   * Zero is a claim, absence is silence, and the store must not turn one into
   * the other. Three mutations genuinely never rot, and a `?? 0` here would have
   * written that same 0 over a field nobody had stated, which is how a dataset
   * gap becomes a confident wrong answer.
   */
  it("keeps a stated zero and an unstated value distinguishable", () => {
    const listed = new Map(store.getDataset().mutations.map((m) => [m.id, m]));

    const zeros = Object.entries(raw.mutations).filter(([, m]) => (m as { decay?: number }).decay === 0);
    expect(zeros.length).toBe(3);
    for (const [id] of zeros) {
      expect(listed.get(id)?.decay).toBe(0);
      expect(listed.get(id)?.decay).not.toBeUndefined();
    }

    // And the shape still permits silence, which is what the model reads as
    // "no clock" rather than as "never rots".
    expect(WITHOUT_DECAY.mutations.choconut.decay).toBeUndefined();
  });

  it("states a decay for all forty, so none of them is running on silence", () => {
    const listed = store.getDataset().mutations;
    expect(listed.length).toBe(40);
    expect(listed.filter((m) => typeof m.decay === "number").length).toBe(40);
  });
});

/* -------------------------------------------------------------------------- */
/* What that does to the numbers                                              */
/* -------------------------------------------------------------------------- */

describe("the clock reaches the model", () => {
  /**
   * Choconut and the Cocoa Beans feeding it both have the current 72-hour
   * lifetime. Removing the mutation field must therefore leave the same cap:
   * the base crop's real clock still constrains the reusable layout.
   */
  it("keeps the base crop's finite cap when the mutation clock is absent", () => {
    const withIt = nodeEstimate(node("choconut", 2624, 37), WITH_DECAY, ECONOMIES, BARE)!;
    const without = nodeEstimate(node("choconut", 2624, 37), WITHOUT_DECAY, ECONOMIES, BARE)!;

    const stage = stageSeconds(BARE);
    expect(withIt.maxWindow).toBe(Math.floor(decayDaysToCycles(3, stage)));
    expect(Number.isFinite(withIt.maxWindow)).toBe(true);
    expect(without.maxWindow).toBe(withIt.maxWindow);
  });

  /**
   * A mutation the file says never rots has to come out exactly where it was,
   * down to the second. This is the "changed nothing for the ones it should not
   * change" half, and it is what makes a moved number elsewhere meaningful
   * rather than noise.
   */
  it("leaves a mutation whose own timer is zero exactly where it was", () => {
    expect(WITH_DECAY.mutations.all_in_aloe.decay).toBe(0);

    const withIt = nodeEstimate(node("all_in_aloe", 16, 1), WITH_DECAY, ECONOMIES, BARE)!;
    const without = nodeEstimate(node("all_in_aloe", 16, 1), WITHOUT_DECAY, ECONOMIES, BARE)!;

    expect(withIt.harvestWindow).toBe(without.harvestWindow);
    expect(withIt.expectedSeconds).toBe(without.expectedSeconds);
    expect(withIt.p90Seconds).toBe(without.p90Seconds);
    expect(withIt.windowCappedByDecay).toBe(false);
  });

  /**
   * The cap has to be able to bite, or the plumbing is decorative in a second
   * way. Tightening one timer past the chosen window moves the window and
   * lights the label the Planner shows, which is the behaviour that was
   * unreachable while the field was missing.
   */
  it("caps the window, and says so, once the timer is tighter than the window", () => {
    const tight = {
      ...WITH_DECAY,
      mutations: { ...WITH_DECAY.mutations, choconut: { ...WITH_DECAY.mutations.choconut, decay: 0.25 } },
    };

    const loose = nodeEstimate(node("choconut", 2624, 37), WITH_DECAY, ECONOMIES, BARE)!;
    const capped = nodeEstimate(node("choconut", 2624, 37), tight, ECONOMIES, BARE)!;

    expect(loose.windowCappedByDecay).toBe(false);
    expect(capped.maxWindow).toBeLessThan(loose.harvestWindow);
    expect(capped.harvestWindow).toBe(capped.maxWindow);
    expect(capped.windowCappedByDecay).toBe(true);
    expect(capped.expectedSeconds).toBeGreaterThan(loose.expectedSeconds);
  });

  /**
   * An input that is itself a mutation carries its own clock, and the tightest
   * of the lot wins. All-in Aloe never rots and neither does Magic Jellybean,
   * but PlantBoy Advance does at five days, so the layout dies even though the
   * mutation would not. That is the half most easily missed, and while the field
   * was absent it was missed on every row at once.
   */
  it("takes an input's decay clock when the mutation's own timer is zero", () => {
    expect(WITH_DECAY.mutations.all_in_aloe.decay).toBe(0);
    expect(WITH_DECAY.mutations.plantboy_advance.decay).toBe(5);

    const est = nodeEstimate(node("all_in_aloe", 16, 1), WITH_DECAY, ECONOMIES, BARE)!;
    const stage = stageSeconds(BARE);

    expect(Number.isFinite(est.maxWindow)).toBe(true);
    expect(est.maxWindow).toBe(Math.floor(decayDaysToCycles(5, stage)));

    // And with nobody's clock stated, which is what the app used to see, there
    // is no ceiling on the window at all.
    expect(nodeEstimate(node("all_in_aloe", 16, 1), WITHOUT_DECAY, ECONOMIES, BARE)!.maxWindow).toBe(
      Number.POSITIVE_INFINITY
    );
  });
});

describe("what the fix moved, on today's dataset", () => {
  /**
   * Nothing, and that is a measurement rather than an assumption.
   *
   * The tightest timer in the file is three days, which at the slowest stage
   * clock is eighteen growth cycles, and the longest window any decaying
   * mutation actually wants is fifteen. So every clock sits above every window
   * and no estimate moves. The field was still missing, the label was still
   * unreachable, and a dataset change that closed that margin would have gone
   * out silently; this is the test that would stop it.
   */
  it("changes no estimate, because every clock sits above every window", () => {
    const plan = planOf([node("choconut", 2624, 37), node("lonelily", 280, 3), node("all_in_aloe", 16, 1)]);

    const before = buildPlanEstimates(plan, WITHOUT_DECAY, ECONOMIES, BARE);
    const after = buildPlanEstimates(plan, WITH_DECAY, ECONOMIES, BARE);

    expect(after.total.expectedSeconds).toBe(before.total.expectedSeconds);
    expect(after.total.p90Seconds).toBe(before.total.p90Seconds);

    for (const id of Object.keys(after.byId)) {
      expect(after.byId[id].harvestWindow).toBe(before.byId[id].harvestWindow);
      expect(after.byId[id].expectedSeconds).toBe(before.byId[id].expectedSeconds);
      // Not capped today. The one thing that DID change is that this can now be
      // true at all, rather than being false because nothing was measured.
      expect(after.byId[id].windowCappedByDecay).toBe(false);
    }
  });

  /** The margin itself, pinned. Close it and this fails before a player sees it. */
  it("keeps the tightest decay cap above the longest window in use", () => {
    const stage = stageSeconds({ ...BARE, uniqueCrops: 1 });
    const tightest = Math.floor(decayDaysToCycles(3, stage));
    expect(tightest).toBe(18);

    const longest = Math.max(
      ...Object.keys(ECONOMIES).map((id) => {
        const economy = ECONOMIES[id]!;
        const plots = Math.max(1, Math.ceil(1000 / economy.yield));
        return nodeEstimate(node(id, 1000, plots), WITHOUT_DECAY, ECONOMIES, BARE)?.harvestWindow ?? 0;
      })
    );
    expect(longest).toBeLessThan(tightest);
  });
});
