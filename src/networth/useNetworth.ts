import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { currentAccess, hasApiProfileAccess } from "../island/apiKey";
import { fetchMuseum, fetchProfileMembers } from "../island/hypixel";
import { makeGate } from "../island/gate";
import { loadCatalogue } from "./catalogue";
import { loadPrices, pricesCooldownUntil, pricesState, subscribePrices } from "./prices";
import { parseMemberItems, parseMemberLoadouts, readCoinBalances, type MemberLoadouts } from "./parseItems";
import { EMPTY_FACTS, readProfileFacts, type ProfileFacts } from "../island/profileFacts";
import { calculateNetworth } from "./profileNetworth";
import { valueIslandChests } from "./islandChests";
import { RULES_VERSION } from "./constants";
import { isRecord } from "./helpers";
import type { ChestValue } from "./islandChests";
import type { ParsedItems } from "./profileNetworth";
import type { Catalogue, CoinBalances, NetworthResult, PriceMap } from "./types";
import type { IslandChest } from "../island/types";

/**
 * The Networth section's data.
 *
 * Two layers, split because they change at different rates and cost different
 * amounts. The SOURCES layer is a network round trip plus a few hundred
 * kilobytes of NBT decoding, and it is cached in a module store so remounting
 * the page costs nothing. The VALUATION layer is pure arithmetic over what the
 * sources produced, so it re-runs freely whenever the island snapshot changes
 * and the chests need revaluing.
 *
 * Everything the section can honestly say about missing data is decided here
 * rather than in the component, because the difference between "you own
 * nothing" and "Hypixel is not telling us" is a data question, and a component
 * that has to infer it will eventually infer it wrongly.
 */

/** What Hypixel is and is not sharing. Each of these turns into a sentence on screen. */
export interface Coverage {
  /** The Inventory API toggle. Off means inventory, ender chest, storage and bags are all absent. */
  inventoryShared: boolean;
  /** The Banking API toggle. Off means the co-op bank is invisible, not zero. */
  bankShared: boolean;
  /** The Museum API toggle, or a profile that has never donated. */
  museumShared: boolean;
  /** The Personal Vault, which has its own toggle. */
  vaultShared: boolean;
  /** True once the item catalogue is in hand. Without it, stars and gemstones cannot be priced. */
  catalogueLoaded: boolean;
}

interface Sources {
  items: ParsedItems;
  coins: CoinBalances;
  prices: PriceMap;
  catalogue: Catalogue;
  coverage: Coverage;
  /**
   * The plain-JSON profile facts (skill XP, first join, fairy souls), read
   * off the same member object the item parse consumed. Kept beside the items
   * because they arrive together and age together.
   */
  facts: ProfileFacts;
  /** The wardrobe, equipment wardrobe and named loadouts, for the Gear tab. */
  gearLoadouts: MemberLoadouts;
  profileName: string;
  gameMode: string | null;
  /** When the profile was pulled, by our clock. */
  fetchedAt: number;
}

export type NetworthStatus = "idle" | "needsKey" | "loading" | "ready" | "error";

interface StoreState {
  sources: Sources | null;
  status: NetworthStatus;
  error: string | null;
  /** Bumped on every successful load, so the valuation layer knows to re-run. */
  version: number;
}

let state: StoreState = { sources: null, status: "idle", error: null, version: 0 };
const listeners = new Set<() => void>();

const publish = () => {
  state = { ...state };
  for (const fn of listeners) fn();
};

/**
 * Subscribing here also subscribes to the price store.
 *
 * The identity bump is load bearing rather than cosmetic. `useSyncExternalStore`
 * compares snapshots by identity, so a price-only change (loading, an error, a
 * fresher copy) would notify and then be discarded as "nothing changed" if the
 * object came back identical. Bumping identity without bumping `version` is
 * what lets the price line re-render while the valuation, which is keyed on
 * `version`, stays exactly where it was.
 */
const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  const unsubscribePrices = subscribePrices(() => {
    state = { ...state };
    fn();
  });
  return () => {
    listeners.delete(fn);
    unsubscribePrices();
  };
};

const getState = (): StoreState => state;

/** How long a pulled profile stays good before an unforced load would refetch it. */
const PROFILE_TTL_MS = 5 * 60 * 1000;

/**
 * One gate for the whole source load, so a double click is one round trip.
 * Same gate module as every other network caller in this project.
 */
const SOURCES_MIN_GAP_MS = 10_000;

const hasBlob = (value: unknown): boolean => isRecord(value) && typeof value.data === "string" && value.data !== "";

/**
 * Can this browser make the call at all?
 *
 * Read synchronously rather than discovered by the load, because the load runs
 * in an effect and an effect runs after the first paint. Waiting for it would
 * put a meaningless "nothing yet" on screen for a frame before the panel could
 * say the real thing, which for the majority of visitors, who have no key and
 * want none, is the only frame they would see.
 */
const hasCredentials = (): boolean => {
  const access = currentAccess();
  return hasApiProfileAccess(access);
};

const runLoad = async (): Promise<void> => {
  const access = currentAccess();
  if (!hasApiProfileAccess(access)) {
    state = { ...state, status: "needsKey", error: null };
    publish();
    return;
  }

  state = { ...state, status: "loading", error: null };
  publish();

  const members = await fetchProfileMembers({ uuid: access.uuid, name: access.name }, access.key);
  if (!members.ok) {
    state = { ...state, status: "error", error: members.error.message };
    publish();
    return;
  }

  // The same three-step choice `chooseProfile` makes, so the Networth section
  // and the rest of the Island page are never looking at different profiles.
  const chosen =
    (access.profileId ? members.value.find((c) => c.profileId === access.profileId) : undefined) ??
    members.value.find((c) => c.selected) ??
    members.value[0];

  // Prices and the catalogue are keyless and independent of the profile, so
  // they run alongside the museum call rather than after it.
  const [museum, prices, catalogue] = await Promise.all([
    fetchMuseum(chosen.profileId, access.uuid, access.key),
    loadPrices(),
    loadCatalogue(),
  ]);

  if (!prices) {
    state = { ...state, status: "error", error: pricesState().error ?? "The price list could not be loaded." };
    publish();
    return;
  }

  const museumData = museum.ok ? museum.value : null;
  const fetchedAt = Math.min(
    members.fetchedAt ?? Date.now(),
    museum.ok ? museum.fetchedAt ?? Date.now() : Number.POSITIVE_INFINITY,
  );
  const member = isRecord(chosen.member) ? chosen.member : {};
  const inventory = isRecord(member.inventory) ? member.inventory : {};

  const items = await parseMemberItems(chosen.member, museumData, { catalogue });
  const gearLoadouts = await parseMemberLoadouts(chosen.member);

  state = {
    sources: {
      items,
      coins: readCoinBalances(chosen.member, chosen.bankBalance),
      prices: prices.prices,
      catalogue,
      coverage: {
        // Read off the payload, not off the parsed result. An inventory that
        // decoded to nothing and an inventory Hypixel never sent look identical
        // once parsed, and only one of them is the player's own doing.
        inventoryShared: hasBlob(inventory.inv_contents),
        bankShared: chosen.bankBalance !== null,
        museumShared: museumData !== null,
        vaultShared: hasBlob(inventory.personal_vault_contents),
        catalogueLoaded: Object.keys(catalogue).length > 0,
      },
      facts: readProfileFacts(chosen.member),
      gearLoadouts,
      profileName: chosen.cuteName,
      gameMode: chosen.gameMode,
      fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
    },
    status: "ready",
    error: null,
    version: state.version + 1,
  };
  publish();
};

const gate = makeGate(runLoad, SOURCES_MIN_GAP_MS);

/** When the refresh button may fire again. The later of the two floors involved. */
export const networthCooldownUntil = (): number => Math.max(gate.cooldownUntil(), pricesCooldownUntil());

/**
 * Test seam, matching `setPricesForTesting` and `setCatalogueForTesting`.
 *
 * The panel's populated branch is the half that renders numbers, and there is
 * no way to reach it without either a network round trip or a door like this
 * one. Nothing in the app calls it.
 */
export const setSourcesForTesting = (sources: {
  items: ParsedItems;
  coins: CoinBalances;
  prices: PriceMap;
  catalogue: Catalogue;
  coverage: Coverage;
  facts?: ProfileFacts;
  gearLoadouts?: MemberLoadouts;
  profileName?: string;
  gameMode?: string | null;
}): void => {
  state = {
    sources: {
      ...sources,
      facts: sources.facts ?? EMPTY_FACTS,
      gearLoadouts: sources.gearLoadouts ?? EMPTY_LOADOUTS,
      profileName: sources.profileName ?? "Test",
      gameMode: sources.gameMode ?? null,
      fetchedAt: Date.now(),
    },
    status: "ready",
    error: null,
    version: state.version + 1,
  };
  publish();
};

/**
 * The parsed profile without the valuation.
 *
 * The Island page's gear and pet sections need the decoded containers and
 * nothing else, and the valuation is the expensive half of `useNetworth`. This
 * reads the same store, so the page and the panel are always looking at the
 * same pull, and it deliberately does NOT trigger a load: the NetworthPanel on
 * the same page owns that, and two components racing the same gate would be
 * two of everything for no data.
 */
export interface ParsedProfileView {
  parsed: ParsedItems | null;
  /** Skill XP, first join and fairy souls, from the same pull. Null before it. */
  facts: ProfileFacts | null;
  /** The wardrobe, equipment wardrobe and named loadouts. Empty until a pull lands. */
  gearLoadouts: MemberLoadouts;
  /** When the profile was pulled, by our clock. Null before the first pull. */
  fetchedAt: number | null;
  coverage: Coverage | null;
  status: NetworthStatus;
}

/** One stable empty, so a disconnected render does not mint fresh objects per frame and defeat downstream memos. */
const EMPTY_LOADOUTS: MemberLoadouts = {
  armorSets: [],
  equipmentSets: [],
  wornEquipment: [null, null, null, null],
  equippedEquipmentSetId: null,
  loadouts: [],
};

export const useParsedProfile = (): ParsedProfileView => {
  const store = useSyncExternalStore(subscribe, getState, getState);
  return {
    parsed: store.sources?.items ?? null,
    facts: store.sources?.facts ?? null,
    gearLoadouts: store.sources?.gearLoadouts ?? EMPTY_LOADOUTS,
    fetchedAt: store.sources?.fetchedAt ?? null,
    coverage: store.sources?.coverage ?? null,
    status: store.status === "idle" ? (hasCredentials() ? "loading" : "needsKey") : store.status,
  };
};

export interface NetworthView {
  result: NetworthResult | null;
  /**
   * The parsed profile containers as decoded, before valuation.
   *
   * The valuation's category lists drop zero-priced rows on purpose, which is
   * right for a coin figure and wrong for a profile viewer: a wardrobe piece
   * nobody would pay for is still hanging in the wardrobe. The gear and pet
   * sections of the Island page read this instead, so what they show is what
   * the profile holds rather than what the market rates.
   */
  parsed: ParsedItems | null;
  /** When the profile behind `parsed` was pulled, by our clock. Null before the first pull. */
  fetchedAt: number | null;
  /** Per chest, for the drilldown. Empty when the mod has not reported any. */
  chests: ChestValue[];
  status: NetworthStatus;
  error: string | null;
  coverage: Coverage | null;
  profileName: string | null;
  /** When the price list in use was downloaded. Null when there is none. */
  pricesAt: number | null;
  pricesFrom: "network" | "storage" | null;
  pricesError: string | null;
  pricesLoading: boolean;
  /** Which upstream ruleset this port tracks, so the number can name its own rules. */
  rulesVersion: string;
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * The Networth section's whole data surface.
 *
 * `chests` is a prop rather than something this reaches for, because the Island
 * page already merges the mod and API feeds and there must be exactly one
 * merged island in this codebase. Passing it in keeps the merge where it lives.
 */
export const useNetworth = (chests: readonly IslandChest[]): NetworthView => {
  const store = useSyncExternalStore(subscribe, getState, getState);
  const prices = pricesState();

  // One unforced load on arrival. It is a no-op without profile access, and a no-op
  // again inside the TTL, so a visit costs at most one profile pull.
  useEffect(() => {
    const sources = state.sources;
    if (sources && Date.now() - sources.fetchedAt < PROFILE_TTL_MS) return;
    void gate.run();
  }, []);

  const refresh = useCallback(async (force = false) => {
    const sources = state.sources;
    if (!force && sources && Date.now() - sources.fetchedAt < PROFILE_TTL_MS) return;
    // A manual refresh gets fresh prices too. Stale prices under a button
    // labelled Refresh would be the wrong kind of surprise.
    if (force) await loadPrices(true);
    await gate.run();
  }, []);

  const { result, chestValues } = useMemo(() => {
    const sources = store.sources;
    if (!sources) return { result: null, chestValues: [] as ChestValue[] };

    const chestData = valueIslandChests(chests, sources.prices, sources.catalogue);
    const items: ParsedItems = { ...sources.items, island_chests: chestData.items };
    return {
      result: calculateNetworth(items, sources.coins, {
        prices: sources.prices,
        catalogue: sources.catalogue,
      }),
      chestValues: chestData.chests,
    };
    // `version` rather than `sources`, because the store publishes a new object
    // on every notification (including price-store ones) and the valuation is
    // the expensive half.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version, chests]);

  return {
    result,
    parsed: store.sources?.items ?? null,
    fetchedAt: store.sources?.fetchedAt ?? null,
    chests: chestValues,
    // `idle` is the state before the effect has run, and it is never worth
    // showing: either there is no profile connection and the answer is already
    // known, or there is one and a load is a tick away.
    status: store.status === "idle" ? (hasCredentials() ? "loading" : "needsKey") : store.status,
    error: store.error,
    coverage: store.sources?.coverage ?? null,
    profileName: store.sources?.profileName ?? null,
    pricesAt: prices.snapshot?.fetchedAt ?? null,
    pricesFrom: prices.snapshot?.from ?? null,
    pricesError: prices.error,
    pricesLoading: prices.status === "loading",
    rulesVersion: RULES_VERSION,
    refresh,
  };
};
