import { useSyncExternalStore } from "react";
import bundledJson from "../../../public/greenhouse/data.json";
import { withMutationIds } from "../planner/mutationBridge";
import { readCraftingCache } from "../../items/wikiCrafting";
import { CACHE_KEY as WIKI_CACHE_KEY, MAX_AGE_MS, SYNC_REFUSED, applyWikiMutations, fetchWikiMutations, readCache, type WikiSnapshot } from "./wikiSync";
import type { FieldChange, WikiMutation } from "./wikiSync";
import type { CropDefinition, MutationDefinition } from "../types/greenhouse";
import type { ItemIndex } from "../../items/useItemData";

/**
 * The greenhouse dataset: one build, one home.
 *
 * The bundled `data.json` is the floor and the wiki is the ceiling. Everything
 * on this site that says what a mutation IS - its rarity, its size, the ground
 * it grows on, what it needs adjacent - has to be reading the same overlaid
 * answer, because the moment two pages assemble that answer separately they
 * start disagreeing in front of the player.
 *
 * That is not hypothetical. It is exactly how the Dashboard and the Planner
 * came to report different owned counts for the same mutation: three places
 * each built their own mutation list, and only one of them applied the wiki
 * overlay or reached the crafting index for the Hypixel id that island counts
 * are matched on. A mutation the crafting index had never heard of read as
 * "you own none" on one page and its true count on the other. Same data, same
 * player, different assembly.
 *
 * So the assembly happens here, once:
 *
 *   bundled data.json  the floor. Ships with the app, always present, works
 *                      offline, and is what the first paint is drawn from so
 *                      there is no loading gate on a dataset we already have.
 *   wiki overlay       the ceiling. Cached in localStorage, refreshed in the
 *                      background when it goes stale, and never able to make
 *                      things worse: `applyWikiMutations` only touches the
 *                      fields the wiki table actually carries, and a field it
 *                      cannot parse keeps the bundled value.
 *   crafting index     the id bridge. Read from its own cache rather than
 *                      fetched, then filled in from mutation NAMES for the ids
 *                      it does not cover. Consumers get one bridge instead of
 *                      each deciding whether to bother with the index.
 *
 * This is a module-level store rather than a context on purpose. The Dashboard
 * lives at `/dashboard`, outside the greenhouse provider stack entirely, so a
 * context could never have been the single home - reaching it would have meant
 * either wrapping the whole app or letting the page build its own copy, which
 * is the thing that broke. A store is readable from anywhere and needs no
 * provider, and `useSyncExternalStore` keeps every subscriber on the same
 * snapshot in the same render.
 *
 * Nothing here ever writes a key the player owns. The only storage this
 * touches is the wiki's own derived cache, and it only reads it.
 */

// ---------------------------------------------------------------------------
// The shape of data.json
// ---------------------------------------------------------------------------
//
// Declared here rather than beside a consumer because the file is the store's
// input and every consumer is downstream of it. `greenhouseDataService`
// re-exports these under their original names, so nothing that already imports
// them from there had to change.

export interface EffectDefinition {
  name: string;
  description: string;
}

export interface CropDataJSON {
  name: string;
  size: number;
  /** PRIMARY growth surface. */
  ground: string;
  /** Every listed surface. Present only if the wiki ever lists several for a crop. */
  grounds?: string[];
  growth_stages: number | null;
  positive_buffs: string[];
  negative_buffs: string[];
}

export interface MutationRequirementJSON {
  crop: string;
  count: number;
}

export interface MutationDataJSON {
  name: string;
  size: number;
  /** PRIMARY growth surface, first listed by the wiki. */
  ground: string;
  /** Every listed surface, present only on multi-surface rows (Lonelily). */
  grounds?: string[];
  requirements: MutationRequirementJSON[];
  special?: string;
  rarity: string;
  growth_stages: number | null;
  decay: number;
  positive_buffs: string[];
  negative_buffs: string[];
  drops: Record<string, number>;
  harvest_info?: string;
  growing_info?: string;
}

export interface GreenhouseDataJSON {
  crops: Record<string, CropDataJSON>;
  mutations: Record<string, MutationDataJSON>;
  effects: Record<string, EffectDefinition>;
}

/**
 * TypeScript infers a distinct literal type per entry from a JSON import, which
 * makes `Object.entries` hand back a forty-way union that no consumer wants to
 * think about. One cast at the door, and everything past this line is typed.
 */
const BUNDLED = bundledJson as unknown as GreenhouseDataJSON;

// ---------------------------------------------------------------------------
// What subscribers see
// ---------------------------------------------------------------------------

export interface GreenhouseWikiState {
  /** When the wiki data in use was fetched. Null means bundled copy only. */
  fetchedAt: number | null;
  syncing: boolean;
  error: string | null;
  /** What the wiki changed relative to the bundled data. */
  changes: FieldChange[];
}

export interface GreenhouseDataset {
  /** Every plantable thing, mutations included, exactly as the pages expect. */
  crops: CropDefinition[];
  mutations: MutationDefinition[];
  /** The whole file with the wiki overlay applied, for lookups by id. */
  raw: GreenhouseDataJSON;
  /**
   * Site id to Hypixel id, for matching island counts.
   *
   * The crafting index answers wherever it has an answer and the mutation's
   * own name fills the rest, which is the precedence `withMutationIds` pins.
   * Carrying it here is what lets a page stop deciding that for itself.
   */
  bridge: Record<string, { hypixelId: string | null }>;
  /**
   * Kept for the consumers that gate on it. Always false in practice: the
   * bundled dataset is a static import, so there is never a moment where this
   * store has nothing to show. A page that renders a spinner on it simply
   * never renders one.
   */
  isLoading: boolean;
  error: string | null;
  wiki: GreenhouseWikiState;
}

/**
 * Names the wiki might use, mapped to the ids this app already uses.
 *
 * Built from the bundled file rather than from the current merge, because its
 * job is to recognise a wiki row as something we already know about. Feeding
 * it the merged list would let one bad parse rename an id and then keep
 * matching the wrong row forever.
 */
const KNOWN_NAMES = (() => {
  const map = new Map<string, string>();
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [id, c] of Object.entries(BUNDLED.crops)) map.set(norm(c.name), id);
  for (const [id, m] of Object.entries(BUNDLED.mutations)) map.set(norm(m.name), id);
  map.set(norm("Melon Slice"), "melon");
  return map;
})();

/**
 * Turn the file into the two arrays the pages consume.
 *
 * A mutation appears twice on purpose: once as a mutation, and once as a crop
 * so it can be planted as an ingredient for a higher tier. That duplication is
 * the original behaviour and load bearing for the designer palette.
 */
const buildLists = (mutationSource: Record<string, MutationDataJSON>) => {
  const crops: CropDefinition[] = [];
  const mutations: MutationDefinition[] = [];

  for (const [id, crop] of Object.entries(BUNDLED.crops)) {
    crops.push({
      id,
      name: crop.name,
      size: crop.size,
      priority: 0,
      ground: crop.ground,
      growth_stages: crop.growth_stages,
      positive_buffs: crop.positive_buffs,
      negative_buffs: crop.negative_buffs,
      isMutation: false,
    });
  }

  for (const [id, mutation] of Object.entries(mutationSource)) {
    mutations.push({
      id,
      name: mutation.name,
      size: mutation.size,
      ground: mutation.ground,
      grounds: mutation.grounds,
      requirements: mutation.requirements,
      special: mutation.special,
      rarity: mutation.rarity,
      // A wiki row that states no growth-stage count leaves this null, which
      // `MutationDefinition` does not model. Zero is what every consumer
      // already reads a missing value as; a null would have been a lie in the
      // shape of a number.
      growth_stages: mutation.growth_stages ?? 0,
      /*
       * The decay clock, carried straight through.
       *
       * This line is the whole reason decay had never once applied in the app.
       * `data.json` states a decay for all forty mutations, and the terminal
       * tools read that file directly and have always had it, but the list the
       * PAGES read was assembled here and simply never copied the field. So
       * `planEstimates` read `mutation.decay ?? 0` against an undefined every
       * time, `maxHarvestWindow` found no clock to impose, and a harvest window
       * the Planner labelled "capped by decay" was in fact capped by nothing.
       * Twenty three mutations carry a three day timer; those were the rows
       * most able to be optimistic.
       *
       * Passed through rather than defaulted with `?? 0`, and the difference
       * matters. A stated 0 means "this one genuinely never rots", which three
       * mutations really are. An absent field means nobody told us, and the
       * model's reading of that is "no clock", which is the same behaviour but
       * NOT the same claim. Defaulting here would turn silence into an
       * assertion, and this file has just been bitten by the reverse of that.
       */
      decay: mutation.decay,
      positive_buffs: mutation.positive_buffs,
      negative_buffs: mutation.negative_buffs,
      drops: mutation.drops,
    });

    crops.push({
      id,
      name: mutation.name,
      size: mutation.size,
      priority: 0,
      ground: mutation.ground,
      grounds: mutation.grounds,
      growth_stages: mutation.growth_stages,
      positive_buffs: mutation.positive_buffs,
      negative_buffs: mutation.negative_buffs,
      isMutation: true,
    });
  }

  return { crops, mutations };
};

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

let raw: GreenhouseDataJSON = BUNDLED;
let lists = buildLists(BUNDLED.mutations);
let wiki: GreenhouseWikiState = { fetchedAt: null, syncing: false, error: null, changes: [] };
let error: string | null = null;

/**
 * The bridge, rebuilt whenever the mutation list is.
 *
 * `readCraftingCache` is a localStorage read, never a fetch. The index is
 * fetched by the pages that actually need recipes, and this store has no
 * business pulling a few hundred kilobytes over the wire just so a dashboard
 * can count what you own - especially when the name-derived fallback already
 * covers all forty mutations on its own. A warm cache upgrades the ids; a cold
 * one costs nothing and loses nothing.
 */
const buildBridge = (mutations: MutationDefinition[]) => {
  const index: ItemIndex = readCraftingCache()?.items ?? {};
  return withMutationIds(
    index,
    mutations.map((m) => ({ id: m.id, name: m.name }))
  );
};

let bridge = buildBridge(lists.mutations);

/**
 * `useSyncExternalStore` compares snapshots by identity and will loop forever
 * if `getSnapshot` builds a fresh object each call, so the view is rebuilt only
 * when something actually changed.
 */
let view: GreenhouseDataset = {
  crops: lists.crops,
  mutations: lists.mutations,
  raw,
  bridge,
  isLoading: false,
  error,
  wiki,
};

const listeners = new Set<() => void>();

const publish = () => {
  view = { crops: lists.crops, mutations: lists.mutations, raw, bridge, isLoading: false, error, wiki };
  for (const fn of listeners) fn();
};

/** Overlay a wiki snapshot onto the bundled data and rebuild everything downstream. */
const applySnapshot = (wikiMutations: Record<string, WikiMutation>, at: number) => {
  const { merged, changes } = applyWikiMutations(BUNDLED.mutations, wikiMutations);
  raw = { ...BUNDLED, mutations: merged };
  lists = buildLists(merged);
  bridge = buildBridge(lists.mutations);
  wiki = { ...wiki, fetchedAt: at, changes };
};

/** Publish a snapshot fetched by another in-app surface in this same tab. */
export const publishWikiSnapshot = (snapshot: Pick<WikiSnapshot, "mutations" | "fetchedAt">): void => {
  applySnapshot(snapshot.mutations, snapshot.fetchedAt);
  error = null;
  wiki = { ...wiki, syncing: false, error: null };
  publish();
};
/** Read whatever the last wiki fetch left behind, from this tab or another. */
const adoptCache = (): boolean => {
  try {
    const cached = readCache();
    if (!cached) return false;
    applySnapshot(cached.mutations, cached.fetchedAt);
    return true;
  } catch (e) {
    // The bundled data is already standing, so a bad cache is not fatal.
    error = e instanceof Error ? e.message : "Failed to read the cached wiki data";
    return false;
  }
};

adoptCache();
view = { crops: lists.crops, mutations: lists.mutations, raw, bridge, isLoading: false, error, wiki };

// ---------------------------------------------------------------------------
// The wiki refresh
// ---------------------------------------------------------------------------

/**
 * Set once the automatic refresh has been considered, so mounting a second
 * greenhouse page does not fire a second request. A forced refresh from the
 * status widget bypasses it, which is the whole point of that button.
 */
let attempted = false;

const runRefresh = () => {
  wiki = { ...wiki, syncing: true, error: null };
  publish();

  fetchWikiMutations(KNOWN_NAMES)
    .then((snapshot) => {
      publishWikiSnapshot(snapshot);
    })
    .catch((e: Error) => {
      // The bundled copy, and possibly a cached wiki copy, is already on
      // screen. A failed refresh is worth reporting and never worth discarding
      // good data over.
      wiki = { ...wiki, syncing: false, error: e.message === SYNC_REFUSED ? null : e.message };
      publish();
    });
};

/** Refresh if the cached copy is stale or missing. At most once per page life. */
const ensureFresh = () => {
  if (typeof window === "undefined") return;
  if (attempted || wiki.syncing) return;
  attempted = true;

  const cached = readCache();
  if (cached && Date.now() - cached.fetchedAt < MAX_AGE_MS) return;
  runRefresh();
};

/** The status widget's button. Skips the freshness check, never the in-flight one. */
export const refreshWiki = () => {
  if (typeof window === "undefined" || wiki.syncing) return;
  attempted = true;
  runRefresh();
};

// ---------------------------------------------------------------------------
// Subscription
// ---------------------------------------------------------------------------

export const subscribeDataset = (fn: () => void) => {
  listeners.add(fn);
  if (listeners.size === 1) ensureFresh();
  return () => {
    listeners.delete(fn);
  };
};

export const getDataset = (): GreenhouseDataset => view;

/**
 * Keep other tabs in step.
 *
 * A wiki refresh in one tab writes the shared cache, and every other tab
 * adopts it here rather than fetching the same page again. Only that one key,
 * and only ever a re-read - nothing in this listener writes anything.
 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== WIKI_CACHE_KEY) return;
    if (adoptCache()) publish();
  });
}

/**
 * The dataset, for React.
 *
 * No provider, by design: the Dashboard sits outside the greenhouse provider
 * stack and still has to read exactly what the Planner reads.
 */
export const useGreenhouseDataset = (): GreenhouseDataset =>
  useSyncExternalStore(subscribeDataset, getDataset, getDataset);

/**
 * The dataset, for the code that is not a component.
 *
 * Resolved rather than fetched: the bundled copy is a static import, so it is
 * ready before anyone can ask. Asking still kicks the background refresh, so a
 * non-component caller gets the same freshening a mounted page would.
 */
export const datasetReady = (): Promise<GreenhouseDataJSON> => {
  ensureFresh();
  return Promise.resolve(view.raw);
};
