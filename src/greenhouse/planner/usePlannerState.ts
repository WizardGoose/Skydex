import { useSyncExternalStore } from "react";
import { DEFAULT_SIZING_MODE, type SizingMode } from "./plotSizing";
import type { BioanalysisTier } from "../timeModel";
import { DEFAULT_GROWTH, type GrowthSettings } from "./time";

/**
 * Everything the grind tracker remembers.
 *
 * This is a tool you come back to across days of grinding, so all of it
 * persists: what you are working towards, what you already own, how many
 * plantings of each mutation you have finished, and even which cycle you had
 * open. Reloading should put you back exactly where you left off.
 */

const STORAGE_KEY = "wizardsky.planner.v2";
const LEGACY_KEY = "wizardsky.planner.v1";

export type TargetKind = "item" | "mutation";

export interface PlannerTarget {
  id: string;
  kind: TargetKind;
  qty: number;
}

export interface PlannerOptions {
  showBaseCrops: boolean;
  /** Collapse mutations whose plantings are all done. */
  hideCompleted: boolean;
  /** Show growth-time estimates next to each planting count. */
  showTime: boolean;
  /** Subtract reported holdings from the calculated greenhouse plan. */
  useInventory: boolean;
}

/** Your greenhouse, for turning plantings into wall-clock time. */
export interface GrowthConfig extends GrowthSettings {
  /** Plots you run in parallel. Up to 3 can be unlocked. */
  plots: number;
  /**
   * Best Bioanalysis accessory held. They are an upgrade chain, so only the
   * best one applies, and the buff multiplies spawn chance rather than adding
   * percentage points. Optional so a settings blob written before this
   * existed still loads.
   */
  bioanalysis?: BioanalysisTier;
  /**
   * The Growth Speed tier the player typed, if they have typed one.
   *
   * `speedTier` above is the resolved number: whatever won, mirrored here so the
   * estimates and the slider read one field and a reload keeps showing it. This
   * is the manual layer underneath it, and PRESENCE is the whole signal, exactly
   * as it is for `inventory` below. It is the one greenhouse stat Hypixel
   * actually exposes, so it is the one that can be auto-filled, and without a
   * separate marker a stored 7 the player typed is indistinguishable from a
   * stored 7 the API filled in, which would leave the next API answer free to
   * overwrite their own number.
   *
   * Tier 0 is a real answer, "no upgrades bought", so a stored 0 means that.
   * Absence, and only absence, means "has not said" and hands the field back to
   * the API. Optional, so a settings blob written before this existed still
   * loads and simply has no override. The rule lives in `growthSource.ts`.
   */
  speedTierManual?: number;
  /**
   * The plot count the player typed, if they have typed one.
   *
   * The same arrangement as `speedTierManual` above, for the second stat the API
   * can answer. `plots` is the resolved number, mirrored so a reload keeps
   * showing it; this is the manual layer underneath, and it exists so a stored 3
   * the player chose is distinguishable from a stored 3 the API filled in.
   *
   * The case for it is if anything stronger than the tier's. The tier is read
   * straight off `garden_upgrades.GROWTH_SPEED`, but the plot count is DERIVED
   * from `garden_upgrades.PLOT_LIMIT` through a mapping that is wiki documented
   * and not yet verified against an account that has purchased a tier. A
   * documented reading is not a measurement, so if the mapping is off by one for
   * somebody, this field is the only recourse they have.
   *
   * PRESENCE is the whole signal, exactly as above. A stored 0 is a stated value
   * and absence, and only absence, means "has not said" and hands the field back
   * to the API. Optional, so a settings blob written before this existed still
   * loads and simply has no override. The rule lives in `growthSource.ts`.
   */
  plotsManual?: number;
}

/**
 * Last computed plan, left behind by the Planner.
 *
 * The Dashboard needs plan totals to show where a grind stands, but working
 * them out means a solver call per mutation. Rather than make the home page
 * wait on the network, the Planner records what it worked out and the
 * Dashboard reads it instantly. Labelled as a snapshot wherever shown.
 */
export interface PlanSnapshot {
  /** mutation id -> plantings required. */
  plots: Record<string, number>;
  /** mutation id -> display name, so the Dashboard needs no dataset. */
  names: Record<string, string>;
  /** mutation id -> which cycle it belongs to, so "up next" respects order. */
  cycleOf: Record<string, number>;
  totalPlantings: number;
  cycles: number;
  /** What the plan was for, already formatted. */
  targetLabel: string;
  updatedAt: number;

  /*
   * Everything below is additive. A snapshot written before the time model was
   * wired in has none of it, and the Dashboard renders that snapshot exactly
   * as it always did rather than being migrated or thrown away. Read them with
   * a presence check, never a default.
   */

  /** Honest expected wall clock for the whole plan, in seconds. */
  expectedSeconds?: number;
  /** Conservative upper bound on the same, summing per-mutation p90s. */
  p90Seconds?: number;
  /** mutation id -> leave-N-cycles harvest window. */
  harvestWindow?: Record<string, number>;
  /** mutation id -> expected wall clock for that mutation alone, in seconds. */
  expectedSecondsOf?: Record<string, number>;

  /*
   * The LEFT figures, straight from the estimate model with finished
   * plantings already discounted. The Dashboard used to re-derive its "Time
   * left" by scaling the FULL figures above with its own plantings fraction -
   * a second derivation of a number the model owns, and the reason the
   * Dashboard's clock kept disagreeing with the Planner header (a mismatch
   * repeatedly visible in real use). A display shows these; it never does
   * arithmetic on them.
   */

  /** Expected wall clock still ahead, whole plan. The Planner header's TIME LEFT. */
  expectedSecondsLeft?: number;
  /** Conservative 90% figure for the same. */
  p90SecondsLeft?: number;
  /** mutation id -> expected wall clock still ahead for that mutation alone. */
  expectedSecondsLeftOf?: Record<string, number>;

  /*
   * Unit demand, so a reader can weight progress by units rather than by
   * plantings. `plots` alone cannot do that: a row of 34 plantings for 2,624
   * Choconut and a row of 1 planting for 12 Timestalk are not the same size of
   * job, and stock you already hold is counted in units, not in plantings.
   *
   * Written as a set of three or not at all. A reader missing them weights by
   * plantings and credits no stock at all on that path, which is honest but
   * conservative; a reader given a partial set would trust it and be wrong. See
   * `planUnitMaps` in planEstimates.ts, which is the only thing that builds
   * them and enforces that.
   */

  /** mutation id -> units the plan asked for, before your stock came off. */
  wantedOf?: Record<string, number>;
  /** mutation id -> units still to obtain, after your stock came off. */
  needOf?: Record<string, number>;
  /** mutation id -> units one planting of it yields. */
  perPlotOf?: Record<string, number>;
}

export interface PlannerState {
  targets: PlannerTarget[];
  /**
   * mutation/crop id -> how many you already own, as typed by the player.
   *
   * This is the *manual* half of "already own" and nothing else may write to
   * it. The island feed can also say how many you own, and the planner shows
   * that, but an automatic count is never copied in here: a key being present
   * is precisely what marks a number as the player's own word, and
   * `src/inventory` reads that presence to decide which one wins. Fill this
   * from a sync and you have destroyed the only thing that tells the two apart.
   *
   * A stored 0 therefore means "I have none", which is different from the key
   * being absent, which means "I have not said".
   */
  inventory: Record<string, number>;
  /** mutation id -> plantings completed. */
  progress: Record<string, number>;
  /**
   * Mutations the player has chosen to GROW rather than spend from their stock.
   *
   * A genuine choice the site was making silently. The plan sees 106 Gloomgourd
   * and helpfully spends them, but a player saving those for something else has
   * no way to say so, and the plan they are reading is then for a grind they
   * are not going to run.
   *
   * Keyed by mutation id and PRESENCE IS THE SIGNAL, exactly as `inventory`
   * uses it: a value of `false` is not a thing that gets written, the key is
   * simply absent. Stored as a record rather than an array so it merges
   * additively and reads the same way every other per-mutation map here does.
   */
  growFresh: Record<string, boolean>;
  /**
   * How big to make each plot: the cheapest that can hold the job, or one sized
   * for speed.
   *
   * A PLAN CHOICE, not a display option, which is why it sits out here beside
   * `growFresh` rather than inside `options`. It moves every number on the page.
   *
   * Defaults to "minimal" deliberately: input crops are not consumed when a
   * mutation spawns, so a shortfall costs waiting rather than replanting, and
   * spending the player's crops to buy back wall clock they never asked for is
   * not a trade the site gets to make. `plotSizing.ts` carries the full reasoning.
   *
   * PER MUTATION, and presence is the signal, the same rule `growFresh` and
   * `inventory` follow: only a row deliberately switched to "confident" is
   * written, and switching it back deletes the key rather than storing the
   * default. Wanting one mutation sooner says nothing about the tiers beneath
   * it, so one row's choice must not quietly resize the rest of the plan.
   */
  sizing: Record<string, SizingMode>;
  options: PlannerOptions;
  /** Restores the open cycle and selected mutation across reloads. */
  view: { cycle: number | null; mutation: string | null };
  snapshot: PlanSnapshot | null;
  growth: GrowthConfig;
}

const DEFAULT_STATE: PlannerState = {
  targets: [],
  inventory: {},
  progress: {},
  growFresh: {},
  sizing: {},
  options: { showBaseCrops: true, hideCompleted: false, showTime: true, useInventory: true },
  view: { cycle: null, mutation: null },
  snapshot: null,
  growth: { ...DEFAULT_GROWTH, plots: 1, bioanalysis: "none" },
};

/**
 * Top-level fields this version of the app owns.
 *
 * Anything else found in the stored object was written by a different version
 * and is none of our business, so it is read out, held aside, and written back
 * untouched. This key is the only thing the planner is allowed to touch, and
 * within it we only ever add.
 */
const KNOWN_FIELDS: readonly string[] = ["targets", "inventory", "progress", "growFresh", "sizing", "options", "view", "snapshot", "growth"];

/**
 * The stored bytes, exactly as they sit in storage, or null when there is
 * nothing to read.
 *
 * Split out from the parse below because the store keeps the last string it
 * saw: comparing bytes is how it tells "storage moved under us" from "storage
 * is exactly where we left it", and rebuilding the state object when nothing
 * moved would hand `useSyncExternalStore` a new identity and re-render every
 * consumer for nothing.
 *
 * A read that throws returns null, which means "we cannot see storage" and is
 * deliberately the same answer as "there is nothing stored" only as far as
 * parsing goes. Nothing in the store treats null as permission to overwrite.
 */
const readRawString = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
};

const parseRaw = (raw: string | null): Record<string, unknown> => {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};

/** The stored object as-is, or an empty object if there is nothing usable. */
const readRaw = (): Record<string, unknown> => parseRaw(readRawString());

/** Fields we did not write and do not understand. Preserved verbatim on save. */
export const foreignFields = (raw: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(raw).filter(([key]) => !KNOWN_FIELDS.includes(key)));

/**
 * Write the planner's state back, additively.
 *
 * One key, ever, and only ever by `setItem`. Fields this version does not
 * model are merged in behind ours so data written by a different build
 * survives a session here instead of being deleted by a round trip through
 * `load`.
 *
 * `localStorage.clear()`, `removeItem` and key enumeration must never appear
 * in this file. This is shared browser storage, and everything else in it
 * belongs to somebody else.
 */
export const writeState = (state: PlannerState, foreign: Record<string, unknown> = {}): void => {
  try {
    // Spread order matters: our fields win, theirs are only ever carried.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...foreign, ...state }));
  } catch {
    // Quota or private mode. In-memory state is still correct.
  }
};

/**
 * The stored per-mutation sizing choices, sanitised.
 *
 * Only rows deliberately set to "confident" survive, which is what keeps
 * presence meaningful: a stored "minimal" is the default written down, and
 * carrying it would make an untouched row indistinguishable from a chosen one.
 * Anything that is not a map of modes is not something this build wrote, and it
 * is read as "no choices made" rather than guessed at.
 */
const readSizing = (raw: unknown): Record<string, SizingMode> => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, SizingMode> = {};
  for (const [id, mode] of Object.entries(raw as Record<string, unknown>)) {
    /*
     * Written against DEFAULT_SIZING_MODE rather than against the literal
     * "confident", so this stays right if the default is ever moved. Storing
     * the default is what `setSizing` refuses to do, and dropping it on the way
     * in is the same rule read from the other end.
     */
    if ((mode === "minimal" || mode === "confident") && mode !== DEFAULT_SIZING_MODE) out[id] = mode;
  }
  return out;
};

/** One stored blob, read into the shape this build models. */
const fromRaw = (raw: Record<string, unknown>): PlannerState => {
  try {
    const parsed = raw as Partial<PlannerState>;
    return {
      targets: Array.isArray(parsed.targets) ? parsed.targets : [],
      inventory: parsed.inventory && typeof parsed.inventory === "object" ? parsed.inventory : {},
      progress: parsed.progress && typeof parsed.progress === "object" ? parsed.progress : {},
      growFresh: parsed.growFresh && typeof parsed.growFresh === "object" ? parsed.growFresh : {},
      sizing: readSizing(parsed.sizing),
      options: { ...DEFAULT_STATE.options, ...(parsed.options ?? {}) },
      view: { ...DEFAULT_STATE.view, ...(parsed.view ?? {}) },
      snapshot: parsed.snapshot ?? null,
      growth: { ...DEFAULT_STATE.growth, ...(parsed.growth ?? {}) },
    };
  } catch {
    return DEFAULT_STATE;
  }
};

/**
 * Read the planner out of storage.
 *
 * Still exported, still a plain read, and still the door two callers outside
 * React use: the landing page and the search box's pinned target both ask what
 * you are grinding towards without subscribing to anything.
 */
export const load = (): PlannerState => fromRaw(readRaw());

/**
 * Whether a freshly computed snapshot says anything the stored one does not.
 *
 * Pulled out of `setSnapshot` and pure so the rule can be tested without
 * mounting a page, because getting it wrong is silent in both directions:
 * too eager and the Planner rewrites storage on every render, too reluctant
 * and a player never receives a field a new build started emitting.
 */
export const snapshotUnchanged = (prev: PlanSnapshot | null, next: PlanSnapshot): boolean =>
  Boolean(
    prev &&
      prev.totalPlantings === next.totalPlantings &&
      prev.targetLabel === next.targetLabel &&
      Object.keys(prev.plots).length === Object.keys(next.plots).length &&
      // Times move without the planting count moving - changing Crop Growth or
      // Bioanalysis rewrites every estimate and nothing else - so the estimate
      // has to be part of what counts as "unchanged".
      prev.expectedSeconds === next.expectedSeconds &&
      /*
       * A stored snapshot that predates unit demand is NOT up to date, even
       * when every figure above matches, and this clause is the whole reason
       * the unit maps ever reach a returning player. A snapshot written by the
       * previous build against the same targets and the same settings passes
       * all four comparisons above, so the write would be skipped forever and
       * the Dashboard would sit on the plantings-weighted fallback until the
       * player happened to change a target. That is precisely the silent
       * staleness this guard exists to avoid rather than to cause.
       *
       * One directional check rather than an equality: gaining units is a
       * change worth writing, and an incoming snapshot with none against a
       * stored one that has them is a downgrade, so the richer one stays.
       */
      (next.wantedOf === undefined || prev.wantedOf !== undefined)
  );

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One planner, shared by every page that reads it.
 *
 * This was component state until now, and component state is the wrong shape
 * for a fact that three pages read and two of them write. `useState` gives each
 * caller its own copy of the blob, so the Dashboard, the Planner and the
 * Settings page each held a separate object parsed from the same bytes. Equal
 * on the frame they mounted, and free to drift the moment one of them wrote:
 * toggling a display option on the Settings page left a mounted Dashboard
 * rendering the value it had loaded, and the only thing that ever reconciled
 * the two was a reload.
 *
 * So the same store shape the rest of the site already uses, and for the same
 * reason: one module-level value, one listener set, `useSyncExternalStore` so
 * every subscriber is handed the identical object in the identical render.
 * `profile/useProfile`, `island/useIsland`, `inventory/shardsStore` and
 * `greenhouse/data/datasetStore` are the precedents.
 *
 * The difference, and the whole reason this one was left for last: those are
 * read-through caches and this one is WRITABLE and PERSISTED. Two properties
 * had to survive the move exactly.
 *
 * ## When the write happens
 *
 * The old hook wrote from an effect keyed on the state, so a change landed in
 * storage on the commit after the edit. Here `commit` persists in the same
 * breath as it publishes, which is the same write, one tick earlier: nothing is
 * batched, debounced, queued or deferred, so there is no window in which an
 * edit exists in memory but not on disk. That window is what loses somebody's
 * last click on a navigation, and it is now closed rather than merely short.
 *
 * The mount write is preserved too. The old hook's effect fired on mount as
 * well as on change, which is what promoted a `v1` blob to `v2` and normalised
 * missing defaults simply by visiting a page that read it. `subscribePlanner`
 * does that for the first subscriber, after re-reading, so the write can only
 * ever put back what is already there or better.
 *
 * ## What the write is allowed to touch
 *
 * `foreignFields` is unchanged and still load bearing: fields written by a
 * newer build are read out, held aside, and merged back in behind ours on every
 * save. What is new is WHEN they are captured. The old hook froze them in a ref
 * at mount; here they are re-captured every time the blob is re-read, so a
 * field that arrived from another tab mid session is carried too instead of
 * being dropped by the first write after it landed.
 */

/*
 * Read once, at module load, before anything can write. The state, the fields
 * some other build owns and the bytes they both came from are taken from a
 * single read on purpose: three separate reads could each see a different
 * storage and leave the three disagreeing about what is stored.
 */
const initialRaw = readRawString();
const initialParsed = parseRaw(initialRaw);

let current: PlannerState = fromRaw(initialParsed);

/** Fields some other build owns. Re-read with the state, saved behind it. */
let foreign: Record<string, unknown> = foreignFields(initialParsed);

/**
 * The exact bytes behind `current`.
 *
 * Kept so a re-read can be skipped when nothing moved. `useSyncExternalStore`
 * compares snapshots by identity and `fromRaw` builds a fresh object every
 * time, so re-parsing unchanged bytes would look like a change to every
 * subscriber and re-render the lot.
 */
let lastRaw: string | null = initialRaw;

const listeners = new Set<() => void>();

const notify = () => {
  for (const fn of listeners) fn();
};

const getSnapshot = () => current;

/**
 * The planner as it stands, for the code that is not a component.
 *
 * The counterpart of `currentProfile()` in `profile/useProfile`. `load()` is
 * still there for a caller that wants a fresh read of the bytes; this is for a
 * caller that wants the value everything on screen is currently drawn from.
 */
export const currentPlannerState = (): PlannerState => current;

/**
 * Watch the planner without being a component, the way `subscribeDataset` and
 * `subscribeShards` already let callers do.
 *
 * The first subscriber triggers the catch-up and the mount write in `attach`,
 * so this is not merely an observer hook: it is the same door React comes
 * through, which is what makes it worth testing through.
 */
export const subscribePlanner = (fn: () => void): (() => void) => {
  listeners.add(fn);
  if (listeners.size === 1) attach();
  return () => {
    listeners.delete(fn);
  };
};

/** Take the stored blob as the truth, state and foreign fields together. */
const adopt = (raw: string | null): void => {
  lastRaw = raw;
  const parsed = parseRaw(raw);
  foreign = foreignFields(parsed);
  current = fromRaw(parsed);
};

/**
 * Re-read storage, and say whether anything actually moved.
 *
 * Bytes are compared rather than states, because "the same blob" is a question
 * about storage and answering it without parsing is both cheaper and exact.
 */
const refresh = (): boolean => {
  const raw = readRawString();
  if (raw === lastRaw) return false;
  adopt(raw);
  return true;
};

/**
 * What the old hook did on mount, now done once for the first subscriber.
 *
 * Read first, then write. The read is what makes the write safe: the module
 * level value was taken when this file was first imported, and writing that
 * back blind would let a page opened much later overwrite something a
 * background path had stored in between. The write is what the old effect did
 * on mount, kept because it is what migrates a `v1` blob forward and normalises
 * a blob missing fields this build added, and losing it would move that
 * migration to "whenever they next happen to edit something".
 */
const attach = (): void => {
  if (refresh()) notify();
  writeState(current, foreign);
  lastRaw = readRawString();
};

/**
 * Publish a new state and persist it in the same breath.
 *
 * The identity check is the `useState` bail out, kept deliberately. Every
 * updater below can decline to change anything by returning the state it was
 * given, and React's answer to that was to skip the render and therefore skip
 * the effect and therefore skip the write. `setSnapshot` leans on it hardest:
 * it declines on every recompute that says nothing new, and without this line
 * the Planner would rewrite storage on every render of a plan that had not
 * moved.
 */
const commit = (next: PlannerState): void => {
  if (next === current) return;
  current = next;
  writeState(current, foreign);
  // Re-read rather than assume: a write that hit quota or a locked down browser
  // leaves the old bytes in place, and `lastRaw` has to describe storage as it
  // really is or the next refresh will disagree with it forever.
  lastRaw = readRawString();
  notify();
};

const update = (fn: (prev: PlannerState) => PlannerState): void => commit(fn(current));

/**
 * Pick up a write this tab could not have heard.
 *
 * The body of the cross-tab `storage` listener below, and the same catch up
 * `attach` performs. Exported because a renderer that never subscribes, server
 * rendering above all, has nothing that would otherwise tell it the bytes have
 * changed since this module was imported.
 */
export const refreshPlannerState = (): void => {
  if (refresh()) notify();
};

/*
 * Keep other tabs in step. Two planners open, a planting ticked off in one, and
 * the other follows instead of quietly holding a stale count and then saving it
 * over the top.
 *
 * Only the two keys this module reads. A `storage` event with a null key means
 * some other tab called `clear()`, and this listener deliberately ignores it:
 * adopting an empty storage would wipe a live grind out of memory on the word
 * of code we do not control, and nothing here is willing to do that.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY && e.key !== LEGACY_KEY) return;
    refreshPlannerState();
  });
}

/* -------------------------------------------------------------------------- */
/* The actions                                                                */
/* -------------------------------------------------------------------------- */
//
// Module level, so their identity is fixed for the life of the page. The old
// hook wrapped each one in `useCallback` with an empty dependency list to buy
// exactly that, because `PlannerPage` lists `setGrowth` and `setSnapshot` in
// effect dependency arrays. A module constant is the same guarantee without the
// ceremony.

const addTarget = (id: string, kind: TargetKind): void => {
  update((prev) => (prev.targets.some((t) => t.id === id) ? prev : { ...prev, targets: [...prev.targets, { id, kind, qty: 1 }] }));
};

/**
 * Goal quantities are game counts, not a three-digit UI setting. Keep the
 * lower bound that makes a target meaningful, but do not impose a product cap
 * on values that routinely reach into SkyBlock's billions.
 */
export const normaliseTargetQuantity = (qty: number): number =>
  Number.isFinite(qty) ? Math.max(1, Math.trunc(qty)) : 1;

const setTargetQty = (id: string, qty: number): void => {
  update((prev) => ({
    ...prev,
    targets: prev.targets.map((t) => (t.id === id ? { ...t, qty: normaliseTargetQuantity(qty) } : t)),
  }));
};

const removeTarget = (id: string): void => {
  update((prev) => ({ ...prev, targets: prev.targets.filter((t) => t.id !== id) }));
};

const clearTargets = (): void => update((prev) => ({ ...prev, targets: [] }));

/**
 * Record a number the player typed.
 *
 * A present key means "the player has told us this", and that statement now
 * outranks anything the island feed says - see `inventory` above. Which is why
 * a typed 0 is stored rather than deleted: "I spent them all" is a real answer,
 * and if 0 removed the key the next render would helpfully fill the old island
 * count back in, which is exactly the silent overwrite this whole arrangement
 * exists to prevent.
 *
 * Deleting is now its own action, `clearInventoryEntry`, because deleting and
 * setting to zero mean different things.
 */
const setInventory = (id: string, qty: number): void => {
  update((prev) => {
    const n = Math.max(0, Math.min(99999, Math.floor(qty) || 0));
    if (prev.inventory[id] === n) return prev;
    return { ...prev, inventory: { ...prev.inventory, [id]: n } };
  });
};

/** Drop one typed number, handing that item back to whatever the island says. */
const clearInventoryEntry = (id: string): void => {
  update((prev) => {
    if (!(id in prev.inventory)) return prev;
    const inventory = { ...prev.inventory };
    delete inventory[id];
    return { ...prev, inventory };
  });
};

const clearInventory = (): void => update((prev) => ({ ...prev, inventory: {} }));

/** Record a completed planting (or undo one). */
const bumpProgress = (id: string, delta: number, max?: number): void => {
  update((prev) => {
    const progress = { ...prev.progress };
    const next = Math.max(0, (progress[id] ?? 0) + delta);
    const capped = max === undefined ? next : Math.min(next, max);
    if (capped === 0) delete progress[id];
    else progress[id] = capped;
    return { ...prev, progress };
  });
};

const setProgress = (id: string, value: number, max?: number): void => {
  update((prev) => {
    const progress = { ...prev.progress };
    const n = Math.max(0, Math.floor(value) || 0);
    const capped = max === undefined ? n : Math.min(n, max);
    if (capped === 0) delete progress[id];
    else progress[id] = capped;
    return { ...prev, progress };
  });
};

const clearProgress = (): void => update((prev) => ({ ...prev, progress: {} }));

/**
 * Minimal or Confident, for one mutation. The spend-crops-versus-spend-days
 * choice, the player's to make, and made where the consequence is being read.
 *
 * Deleting on "minimal" rather than storing it keeps PRESENCE as the only
 * signal, the rule `growFresh` and `inventory` already follow here. A row set
 * back to the default is a row with nothing to say, and writing the default
 * down would freeze today's default into storage where a later build could not
 * tell it from a deliberate choice.
 */
const setSizing = (id: string, mode: SizingMode): void =>
  update((prev) => {
    const current = prev.sizing[id] ?? DEFAULT_SIZING_MODE;
    if (current === mode) return prev;
    const sizing = { ...prev.sizing };
    if (mode === DEFAULT_SIZING_MODE) delete sizing[id];
    else sizing[id] = mode;
    return { ...prev, sizing };
  });

/**
 * "Keep mine, grow these instead", per ingredient.
 *
 * Deleting rather than storing `false` keeps PRESENCE as the only signal, the
 * same rule `inventory` and `progress` follow. A key set to false would read as
 * a stated preference to anything that checks with `in` or `Object.keys`, and
 * the whole point of the map is that it lists exactly the ids the player has
 * spoken about.
 */
const setGrowFresh = (id: string, grow: boolean): void => {
  update((prev) => {
    if (Boolean(prev.growFresh[id]) === grow) return prev;
    const growFresh = { ...prev.growFresh };
    if (grow) growFresh[id] = true;
    else delete growFresh[id];
    return { ...prev, growFresh };
  });
};

const setOption = <K extends keyof PlannerOptions>(key: K, value: PlannerOptions[K]): void => {
  update((prev) => ({ ...prev, options: { ...prev.options, [key]: value } }));
};

const setView = (view: Partial<PlannerState["view"]>): void => {
  update((prev) => ({ ...prev, view: { ...prev.view, ...view } }));
};

/** Record the computed plan for the Dashboard. No-op when unchanged. */
const setSnapshot = (snapshot: PlanSnapshot): void => {
  update((prev) => (snapshotUnchanged(prev.snapshot, snapshot) ? prev : { ...prev, snapshot }));
};

const setGrowth = <K extends keyof GrowthConfig>(key: K, value: GrowthConfig[K]): void => {
  update((prev) => ({ ...prev, growth: { ...prev.growth, [key]: value } }));
};

const resetAll = (): void => commit(DEFAULT_STATE);

/**
 * Every way to change the planner, in one fixed object.
 *
 * Spread into what the hook returns so the shape callers destructure is exactly
 * what it always was, while each function keeps one identity for the life of
 * the page rather than being rebuilt per render.
 */
const ACTIONS = {
  addTarget,
  setTargetQty,
  removeTarget,
  clearTargets,
  setInventory,
  clearInventoryEntry,
  clearInventory,
  bumpProgress,
  setProgress,
  clearProgress,
  setGrowFresh,
  setSizing,
  setOption,
  setView,
  setSnapshot,
  setGrowth,
  resetAll,
} as const;

/**
 * The planner, for React.
 *
 * No provider, by design, and the same reason `datasetStore` gives: the
 * Dashboard sits at `/dashboard`, outside the greenhouse provider stack
 * entirely, and still has to read exactly what the Planner reads.
 *
 * `getSnapshot` serves the server render as well. It returns the module value
 * rather than a fresh read, because two components in one render have to be
 * handed the same object and a read per call would give them two equal but
 * distinct copies, which is precisely the bug this store exists to end.
 */
export const usePlannerState = () => {
  const state = useSyncExternalStore(subscribePlanner, getSnapshot, getSnapshot);
  return { state, ...ACTIONS };
};
