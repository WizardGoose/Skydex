import { makeGate } from "../island/gate";
import type { PriceMap } from "./types";

/**
 * The price list, fetched at runtime and never bundled.
 *
 * SOURCE. `https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json`,
 * a flat `{ ITEM_ID: coins }` map of about 747 KB covering bazaar products,
 * auction lowest-BIN items and pets in one payload. It is regenerated every
 * fifteen minutes and it answers with `Access-Control-Allow-Origin: *`, which
 * is what makes a static site able to read it with no backend at all.
 *
 * WHY IT IS NOT BUNDLED, and this is a licensing point rather than a size one.
 * The Prices repository carries no licence file. Fetching it in the visitor's
 * own browser is the same thing every bot using SkyHelper does and involves no
 * redistribution by us; shipping a copy inside our build would be
 * redistributing somebody's unlicensed work. So there is no snapshot in this
 * repository, the build contains no prices, and `tools/networth-parity.mjs`
 * downloads its own copy at run time rather than committing one.
 *
 * WHY THE CACHE IS SHORT. Fifteen minutes is how often the file changes, so a
 * twenty minute floor means at most one refetch per file generation and a
 * number on screen that is never more than a generation stale. The UI shows the
 * age rather than implying freshness, because a price is a claim about a moment.
 */

const PRICES_URL = "https://raw.githubusercontent.com/SkyHelperBot/Prices/main/pricesV2.json";

/**
 * A NEW key. Nothing else in this browser is touched, and in particular the
 * island snapshot and the API key are read-only as far as this module is
 * concerned. The version suffix is inside the name because the shape may change
 * and a stale shape must be discardable without taking anything else with it.
 */
export const PRICES_KEY = "skydex.networth.prices.v1";

/** Upstream regenerates every fifteen minutes. See the note above. */
export const PRICES_TTL_MS = 20 * 60 * 1000;

/** The floor between attempts, including manual ones. A refresh button is not a fetch loop. */
const PRICES_MIN_GAP_MS = 15_000;

const TIMEOUT_MS = 20_000;

export interface PricesSnapshot {
  prices: PriceMap;
  /** When this copy was downloaded, by our clock. */
  fetchedAt: number;
  /** Where it came from, so the UI can say "cached" honestly. */
  from: "network" | "storage";
}

export type PricesStatus = "idle" | "loading" | "error";

export interface PricesState {
  snapshot: PricesSnapshot | null;
  status: PricesStatus;
  error: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Only finite, non-negative numbers survive.
 *
 * A negative or NaN price would not fail loudly, it would quietly poison one
 * category's total and look like a valuation bug for the rest of the session.
 * Filtering at the door is one pass over a map we are already parsing.
 */
const readPriceMap = (payload: unknown): PriceMap | null => {
  if (!isObject(payload)) return null;
  const out: PriceMap = {};
  let kept = 0;
  for (const [id, raw] of Object.entries(payload)) {
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) continue;
    out[id] = raw;
    kept++;
  }
  // A price file with a handful of entries is a truncated download or an error
  // page that happened to parse, not a price file.
  return kept > 100 ? out : null;
};

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

let state: PricesState = { snapshot: null, status: "idle", error: null };
const listeners = new Set<() => void>();

const publish = () => {
  for (const fn of listeners) fn();
};

export const subscribePrices = (fn: () => void): (() => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const pricesState = (): PricesState => state;

/** Read the last good copy off disk. Never throws; a broken blob is simply no copy. */
export const readCachedPrices = (): PricesSnapshot | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PRICES_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    const prices = readPriceMap(parsed.prices);
    const fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    if (!prices || !fetchedAt) return null;
    return { prices, fetchedAt, from: "storage" };
  } catch {
    return null;
  }
};

const writeCachedPrices = (snapshot: PricesSnapshot): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PRICES_KEY, JSON.stringify({ prices: snapshot.prices, fetchedAt: snapshot.fetchedAt }));
  } catch {
    // Quota. The in-memory copy still works for this session, and losing the
    // cache costs one refetch next time rather than the feature.
  }
};

/** True when the copy in hand is old enough to be worth replacing. */
export const pricesAreStale = (snapshot: PricesSnapshot | null, now = Date.now()): boolean =>
  snapshot === null || now - snapshot.fetchedAt >= PRICES_TTL_MS;

/* -------------------------------------------------------------------------- */
/* The fetch                                                                  */
/* -------------------------------------------------------------------------- */

const fetchPrices = async (): Promise<PricesSnapshot | null> => {
  state = { ...state, status: "loading", error: null };
  publish();

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(PRICES_URL, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      state = { ...state, status: "error", error: `The price list answered ${response.status}.` };
      publish();
      return null;
    }

    const prices = readPriceMap(await response.json());
    if (!prices) {
      state = { ...state, status: "error", error: "The price list arrived in a shape we could not read." };
      publish();
      return null;
    }

    const snapshot: PricesSnapshot = { prices, fetchedAt: Date.now(), from: "network" };
    writeCachedPrices(snapshot);
    state = { snapshot, status: "idle", error: null };
    publish();
    return snapshot;
  } catch {
    state = {
      ...state,
      status: "error",
      // Deliberately says nothing about the request itself, same rule the
      // Hypixel module follows. Nothing here has a secret in it, and the habit
      // is worth keeping uniform.
      error: "Could not reach the price list. Check your connection.",
    };
    publish();
    return null;
  } finally {
    clearTimeout(deadline);
  }
};

/**
 * One gate for the whole module, so a click storm is one request.
 *
 * This is `src/island/gate.ts`, the same gate the Hypixel pull uses, and it is
 * reused rather than reimplemented for the reason that file's own header gives:
 * this project has already paid twice for two copies of one idea drifting apart.
 */
const gate = makeGate(fetchPrices, PRICES_MIN_GAP_MS);

/** When the refresh button is allowed to fire again. Published so it can say so. */
export const pricesCooldownUntil = (): number => gate.cooldownUntil();

/**
 * Get prices, doing as little work as the situation allows.
 *
 * Memory, then disk, then the network, and the network only when what we have
 * is stale or the caller forced it. A visitor who opened the page five minutes
 * ago and came back costs nobody a request.
 */
export const loadPrices = async (force = false): Promise<PricesSnapshot | null> => {
  if (!state.snapshot) {
    const cached = readCachedPrices();
    if (cached) {
      state = { ...state, snapshot: cached };
      publish();
    }
  }

  if (!force && !pricesAreStale(state.snapshot)) return state.snapshot;

  const fresh = await gate.run();
  // `undefined` from the gate means the floor refused it, which is not a
  // failure: the copy already in hand is the honest answer.
  return fresh ?? state.snapshot;
};

/** Test seam. Sets the in-memory copy without touching the network or disk. */
export const setPricesForTesting = (prices: PriceMap, fetchedAt = Date.now()): void => {
  state = { snapshot: { prices, fetchedAt, from: "network" }, status: "idle", error: null };
  publish();
};
