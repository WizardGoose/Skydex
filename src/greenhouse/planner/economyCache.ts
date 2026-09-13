import { getDataset } from "../data/datasetStore";
import type { PlotEconomy } from "./solverPlan";

/**
 * The solver's plot answers, kept across sessions and only ever improved.
 *
 * THE JUMPING THIS EXISTS TO STOP. The plot solver is an anytime search under
 * a wall-clock deadline: its own tests state that "at the default budget the
 * deadline fires at a load-dependent iteration count and two identical runs
 * differ", and the multi-cell packer is a `while (Date.now() < deadline)` loop
 * outright. The answers were cached only in a per-tab Map, so every fresh
 * session re-solved from scratch and could land on a DIFFERENT plot: a
 * different yield, a different crop bill, a different stage clock - and the
 * plan's headline time moved with it. In real use the same plan visibly
 * quoted different day counts on different days.
 *
 * The fix is not to make the search deterministic - the deadline is doing its
 * job of keeping the page responsive on any machine. The fix is to stop
 * throwing the answers away and to stop letting a worse answer replace a
 * better one:
 *
 *   PERSISTED. Answers live under one localStorage key and hydrate on first
 *   read, so a revisit starts from everything every past session ever found.
 *
 *   MONOTONIC. A new solve only replaces the stored answer when it is
 *   strictly better (see `betterEconomy`). The page still runs solves - a
 *   luckier deadline can only improve the plan - but the numbers on screen can
 *   now only tighten, never wander.
 *
 * "BEST FOUND, NOT PROVED OPTIMAL" stays the honest banner: this changes which
 * best-found is shown, from "this session's" to "the best any session found".
 *
 * INVALIDATION is by dataset content. A plot answer is only meaningful for
 * the mutation rules it was solved under, so the store is fingerprinted with a
 * hash of the mutations dataset and a mismatch starts the store empty. The
 * fingerprint is content, not fetch time: the wiki resyncs daily, the rules
 * rarely change, and a resync that changed nothing must not cost the cache.
 */

const STORE_KEY = "skydex.greenhouse.economies.v1";

/** FNV-1a over a string, hex. Cheap, stable, and plenty for a cache tag. */
export const fnv1a = (s: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

/**
 * Is `next` a strictly better plot than `prev` for the same question?
 *
 * The order mirrors what the numbers feed:
 *
 *   YIELD first, higher wins - it is the solve's own objective, and more
 *   spots is fewer rounds for the same demand.
 *
 *   TOTAL CROPS next, fewer wins - a cheaper field to sow and fewer placements
 *   for the player, all else equal.
 *
 *   UNIQUE CROPS last, fewer wins - not a speed change (that bonus is shared
 *   across the greenhouse), but a simpler field when yield and sowing count
 *   are otherwise identical.
 *
 * Ties are NOT better: on equality the stored answer stands, which is what
 * makes the store stable rather than flapping between equivalent plots.
 *
 * `next` of null is never better. Null means "no valid plot" from a solve that
 * may simply have run out of deadline (or a service error - the solve path
 * folds both into null), and adopting it over a real answer would be letting
 * a bad run erase a good one.
 */
export const betterEconomy = (prev: PlotEconomy | null | undefined, next: PlotEconomy | null): boolean => {
  if (!next) return false;
  if (!prev) return true;

  if (next.yield !== prev.yield) return next.yield > prev.yield;

  const bill = (e: PlotEconomy) => Object.values(e.crops).reduce((s, n) => s + n, 0);
  if (bill(next) !== bill(prev)) return bill(next) < bill(prev);

  const uniq = (e: PlotEconomy) => Object.keys(e.crops).length;
  return uniq(next) < uniq(prev);
};

interface StoredEconomies {
  fp: string;
  entries: Record<string, PlotEconomy>;
}

const readStore = (fp: string): Map<string, PlotEconomy | null> => {
  const map = new Map<string, PlotEconomy | null>();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as StoredEconomies;
    if (parsed?.fp !== fp || !parsed.entries) return map;
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (value && typeof value.yield === "number" && value.crops) map.set(key, value);
    }
  } catch {
    // No storage or a corrupt entry; the session just solves as it always did.
  }
  return map;
};

const writeStore = (fp: string, map: Map<string, PlotEconomy | null>) => {
  const entries: Record<string, PlotEconomy> = {};
  // Nulls stay in memory so the UI is not left spinning on a "no plot" answer,
  // but they are never persisted: next session deserves a fresh attempt at a
  // question this one may only have failed by deadline.
  for (const [key, value] of map) if (value) entries[key] = value;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ fp, entries } satisfies StoredEconomies));
  } catch {
    // Optional cache. Losing it costs a re-solve next session, nothing else.
  }
};

/** The live store: fingerprint it was hydrated for, plus the answers. */
let state: { fp: string; mutations: unknown; map: Map<string, PlotEconomy | null> } | null = null;

/**
 * The store for the CURRENT dataset, rebuilt when the dataset object changes.
 *
 * Identity check first, content hash second, same pattern as the service's own
 * dataset memo: a wiki sync that swapped the object without changing the rules
 * lands on the same fingerprint and keeps the map.
 */
const store = (): Map<string, PlotEconomy | null> => {
  const mutations = getDataset().mutations;
  if (state && state.mutations === mutations) return state.map;

  const fp = fnv1a(JSON.stringify(mutations));
  if (state && state.fp === fp) {
    state = { ...state, mutations };
    return state.map;
  }

  state = { fp, mutations, map: readStore(fp) };
  return state.map;
};

/** Map-shaped surface so the hook reads it the way it read its old Map. */
export const solvedEconomies = {
  has: (key: string): boolean => store().has(key),
  get: (key: string): PlotEconomy | null | undefined => store().get(key),
  /**
   * Adopt a fresh solve. Better answers replace, worse ones are dropped, and
   * anything real is written through so the next session starts from it.
   */
  set: (key: string, result: PlotEconomy | null): void => {
    const map = store();
    if (betterEconomy(map.get(key), result)) {
      map.set(key, result);
      if (state) writeStore(state.fp, map);
    } else if (!map.has(key)) {
      // First answer for this key, even a null: remembered in memory so the
      // page stops asking, persisted only if real (writeStore drops nulls).
      map.set(key, result);
    }
  },
  /** Test seam. Resets the memo so a test's storage and dataset are re-read. */
  __resetForTests: (): void => {
    state = null;
  },
};
