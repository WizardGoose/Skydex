import { useSyncExternalStore } from "react";
import { fetchCraftingData, readCraftingCache, CRAFTING_TTL, CACHE_KEY as CRAFTING_KEY } from "./wikiCrafting";
import { prettify } from "../island/format";

/**
 * Crafting database and live prices.
 *
 * Recipes are built from the wiki's Module:Crafting/Data by
 * `tools/build-recipes.mjs` and shipped as a static file. Prices come live
 * from the keyless Hypixel bazaar endpoint, so "is it cheaper to craft or to
 * buy" is answered against the real market rather than a stale snapshot.
 */

export interface RecipeIngredient {
  id: string;
  name: string;
  qty: number;
  /** Items that can stand in for this one. */
  alternatives?: { id: string; name: string }[];
}

/** A collection tier that hands you the item or its recipe. */
export interface CollectionUnlock {
  collection: string;
  tier: number;
  /** Items of that collection needed to reach the tier. */
  required: number;
  type: "Recipe" | "Trade" | "Dwarven Forge Recipe";
}

/**
 * A requirement Hypixel itself attaches to an item.
 *
 * Straight off `/v2/resources/skyblock/items`, which carries a `requirements`
 * array on the items that have one. Deliberately kept as loose key/value data
 * rather than a union: the shapes differ per `type` (a SLAYER entry has
 * `slayer_boss_type` and `level`, a TROPHY_FISHING entry has `trophy_type` and
 * `reward`), and narrowing them belongs to the module that reads them, not to
 * the index that merely carries them.
 */
export interface ItemRequirement {
  type: string;
  [key: string]: unknown;
}

export interface Item {
  name: string;
  hypixelId: string | null;
  /**
   * True when this is a plain Minecraft recipe excluded from the SkyBlock
   * catalogue and recipe planner.
   * Read off the crafting module's own `-- Vanilla Recipes` section, with an
   * explicit rescue for its misplaced SkyBlock cluster; see `buildItemIndex`.
   */
  vanilla?: boolean;
  /**
   * The wiki title the item's IMAGE lives under, when it differs from the
   * display name. The forge table's own icon column states it: the Ammonite
   * pet's row reads `{{Slot|Ammonite Pet}}` while its article is plain
   * "Ammonite", and `File:Ammonite.png` does not exist. Icon call sites pass
   * this as `ItemIcon`'s name when present; article links keep `name`.
   */
  wikiTitle?: string;
  /** Requirements Hypixel states for this item, or null when it states none. */
  requirements?: ItemRequirement[] | null;
  /**
   * Hypixel's stat block, e.g. `{ farming_fortune: 5 }`. Keys arrive in mixed
   * case in the live data, so readers lowercase before matching.
   */
  stats?: Record<string, unknown> | null;
  /**
   * Hypixel's `origin` field, or null when it states none. The one consumer is
   * the accessories page, which reads `"RIFT"` as "obtained inside the Rift"
   * and splits its Rift band on it; measured on the live resource that value
   * appears on 29 accessories and nothing else this project renders.
   */
  origin?: string | null;
  /**
   * True when Hypixel's resource marks the item `rift_transferrable`: it works
   * both inside and outside the Rift. Stored only when true, so an old cache
   * shape reads as "not stated" rather than as a claim. The accessories page
   * lists transferable accessories in both areas on it.
   */
  riftTransferable?: boolean;
  /** Explicit Hypixel availability flag, separate from the display rarity. */
  unavailable?: boolean;
  tier: string | null;
  category: string | null;
  /** What an NPC pays for it. Non-null also proves it is NPC-sellable. */
  npcSell: number | null;
  /** How many one craft produces. */
  yields: number;
  recipe: RecipeIngredient[] | null;
  /** A supplemental recipe does not establish the player unlock requirements. */
  recipeUnlocksUnknown?: boolean;
  /** Collection tiers that grant this item or its recipe. */
  unlocks?: CollectionUnlock[];
  /** Item ids this is an ingredient for, capped for payload size. */
  usedIn?: string[];
  /** True count, which may exceed the capped `usedIn` list. */
  usedInTotal?: number;
}

export type ItemIndex = Record<string, Item>;

/**
 * What `useRecipes` hands back. One shape, one owner, one copy.
 *
 * Named because it is now a store's snapshot rather than four pieces of
 * component state, and `useSyncExternalStore` compares snapshots by identity:
 * every publish has to build exactly one new object and every read has to
 * return that same object until the next publish.
 */
export interface RecipesState {
  items: ItemIndex;
  loading: boolean;
  error: string | null;
  fetchedAt: number | null;
}

/**
 * The item index, built in the browser from the wiki.
 *
 * Nothing wiki-derived ships with this app: the crafting and collection
 * modules are fetched at runtime and parsed here, so the wiki serves its own
 * CC BY-NC-SA content directly to the visitor and we redistribute none of it.
 * See `wikiCrafting.ts` for the reasoning.
 *
 * A cached copy is shown immediately so the page is usable while a refresh
 * happens in the background.
 *
 * WHY THIS IS A STORE AND NOT COMPONENT STATE
 * -------------------------------------------
 * It used to fetch per component, and got away with it only because routing
 * kept the consumers exclusive: one page mounts at a time, so there was never a
 * second copy to disagree with. That is a property of the router, not of this
 * hook, and it does not survive a global search box, a settings surface or a
 * nav pill mounting alongside a page. Two copies of a few hundred kilobytes of
 * item index means two parses, two fetches of the wiki's bandwidth, and two
 * answers to "what does this cost" that can drift apart mid-session.
 *
 * So it follows the same pattern as `profile/useProfile` and `island/useIsland`:
 * one module-level value, one listener set, one in-flight request. Anything
 * read in more than one place has to be genuinely shared.
 *
 * The cache key and the 24 hour TTL are untouched. This is a sharing fix, not a
 * caching change.
 */
let recipes: RecipesState = { items: {}, loading: true, error: null, fetchedAt: null };
const recipeListeners = new Set<() => void>();

const publishRecipes = (next: Partial<RecipesState>) => {
  recipes = { ...recipes, ...next };
  for (const fn of recipeListeners) fn();
};

const getRecipes = (): RecipesState => recipes;

/** Young enough that refetching would buy nothing. Same TTL as before. */
const recipesFresh = () => recipes.fetchedAt !== null && Date.now() - recipes.fetchedAt < CRAFTING_TTL;

let recipesHydrated = false;
let recipesInFlight = false;

/**
 * Read the cache, once, the first time anybody actually looks.
 *
 * Deliberately not done at module load. This module also exports the costing
 * helpers, so a page that only wants `formatCoins` must not be made to parse a
 * few hundred kilobytes of JSON it will never render.
 */
const hydrateRecipes = () => {
  if (recipesHydrated) return;
  recipesHydrated = true;
  const cached = readCraftingCache();
  if (!cached) return;
  publishRecipes({ items: cached.items, fetchedAt: cached.fetchedAt, loading: false });
};

/**
 * Bring the index up to date, at most once at a time.
 *
 * Called on every subscribe rather than only the first, which preserves what
 * the per-component version did: navigating to another consumer after a failed
 * attempt retries. The in-flight guard is what collapses the concurrent case
 * into a single request, and the freshness guard is the original early return.
 */
const ensureRecipes = () => {
  if (recipesInFlight || recipesFresh()) return;
  recipesInFlight = true;

  fetchCraftingData()
    .then((snap) => {
      recipesInFlight = false;
      publishRecipes({
        items: snap.items,
        fetchedAt: snap.warning ? null : snap.fetchedAt,
        loading: false,
        error: snap.warning ?? null,
      });
    })
    .catch((e: Error) => {
      recipesInFlight = false;
      // A cached copy, if we had one, is already on screen and stays there.
      // Nothing in this file ever replaces good data with an error.
      publishRecipes({ loading: false, error: e.message });
    });
};

const subscribeRecipes = (fn: () => void) => {
  recipeListeners.add(fn);
  hydrateRecipes();
  ensureRecipes();
  return () => {
    recipeListeners.delete(fn);
  };
};

// Keep other tabs in step: whichever tab refreshed the index, every tab reads
// the newer copy instead of spending a second fetch on the same bytes. Only
// this key, and only ever a re-read.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== CRAFTING_KEY) return;
    const cached = readCraftingCache();
    if (!cached) return;
    publishRecipes({ items: cached.items, fetchedAt: cached.fetchedAt, loading: false, error: null });
  });
}

/**
 * The store behind `useRecipes`, for readers that are not components.
 *
 * Exported so a test, a tool or a worker can observe the shared value without a
 * React tree. `useRecipes` is a two line wrapper over exactly this.
 */
export const recipesStore = { subscribe: subscribeRecipes, getSnapshot: getRecipes };

export const useRecipes = (): RecipesState => useSyncExternalStore(subscribeRecipes, getRecipes, getRecipes);

export interface BazaarPrice {
  /** What you pay to buy it now. */
  buy: number;
  /** What you get selling it now. */
  sell: number;
}

const BAZAAR_CACHE = "wizardsky.bazaar.v1";
const BAZAAR_TTL = 10 * 60 * 1000;

/** What `useBazaar` hands back. A store snapshot, same three keys as before. */
export interface BazaarState {
  prices: Record<string, BazaarPrice>;
  fetchedAt: number | null;
  error: string | null;
}

interface BazaarCache {
  at: number;
  prices: Record<string, BazaarPrice>;
}

/**
 * Live bazaar prices, keyed by Hypixel item id.
 *
 * Cached for ten minutes. Only about a quarter of craftable items are bazaar
 * tradeable, so a missing price is normal and means "not on bazaar", not
 * "free". Callers must treat undefined as unknown.
 *
 * A store for the same reason `useRecipes` is one, and with a sharper edge:
 * two components fetching separately do not just cost two requests on somebody
 * else's rate limit, they can land on two different price snapshots. The Items
 * page saying "craft" while a panel beside it says "buy" is the exact failure
 * that being a store makes impossible.
 *
 * The key and the ten minute TTL are untouched.
 */
let bazaar: BazaarState = { prices: {}, fetchedAt: null, error: null };
const bazaarListeners = new Set<() => void>();

const publishBazaar = (next: Partial<BazaarState>) => {
  bazaar = { ...bazaar, ...next };
  for (const fn of bazaarListeners) fn();
};

const getBazaar = (): BazaarState => bazaar;

const readBazaarCache = (): BazaarCache | null => {
  try {
    const raw = localStorage.getItem(BAZAAR_CACHE);
    if (!raw) return null;
    const cached = JSON.parse(raw) as BazaarCache;
    return cached?.at ? cached : null;
  } catch {
    // A bad cache is not a price. Refetch.
    return null;
  }
};

const bazaarFresh = () => bazaar.fetchedAt !== null && Date.now() - bazaar.fetchedAt < BAZAAR_TTL;

let bazaarHydrated = false;
let bazaarInFlight = false;

/**
 * Adopt the cached prices, once, if they are still prices.
 *
 * Only a cache inside the TTL is shown, which is what the per-component version
 * did and is right for this feed specifically: a stale item index is still a
 * true index, but an hour old buy order is not a price, and showing it would
 * put a confident wrong number next to a craft-or-buy decision. So a stale
 * bazaar cache is skipped rather than displayed, and the fetch below replaces
 * it. That asymmetry with `useRecipes` is deliberate.
 */
const hydrateBazaar = () => {
  if (bazaarHydrated) return;
  bazaarHydrated = true;
  const cached = readBazaarCache();
  if (!cached || Date.now() - cached.at >= BAZAAR_TTL) return;
  publishBazaar({ prices: cached.prices, fetchedAt: cached.at });
};

const ensureBazaar = () => {
  if (bazaarInFlight || bazaarFresh()) return;
  bazaarInFlight = true;

  fetch("https://api.hypixel.net/v2/skyblock/bazaar")
    .then((r) => {
      if (!r.ok) throw new Error(`Bazaar responded ${r.status}`);
      return r.json();
    })
    .then((j: { products?: Record<string, { quick_status?: { buyPrice?: number; sellPrice?: number } }> }) => {
      bazaarInFlight = false;
      const out: Record<string, BazaarPrice> = {};
      for (const [id, p] of Object.entries(j.products ?? {})) {
        const q = p.quick_status;
        if (!q) continue;
        out[id] = { buy: q.buyPrice ?? 0, sell: q.sellPrice ?? 0 };
      }
      const at = Date.now();
      publishBazaar({ prices: out, fetchedAt: at, error: null });
      try {
        localStorage.setItem(BAZAAR_CACHE, JSON.stringify({ at, prices: out } satisfies BazaarCache));
      } catch {
        // Cache is optional.
      }
    })
    .catch((e: Error) => {
      bazaarInFlight = false;
      // Prices already on screen stay on screen. A failed refresh is a message,
      // never a reason to blank the numbers somebody is reading.
      publishBazaar({ error: e.message });
    });
};

const subscribeBazaar = (fn: () => void) => {
  bazaarListeners.add(fn);
  hydrateBazaar();
  ensureBazaar();
  return () => {
    bazaarListeners.delete(fn);
  };
};

// Keep other tabs in step, and off the API: a tab that just paid for a pull
// publishes it, and the others read it instead of pulling again.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== BAZAAR_CACHE) return;
    const cached = readBazaarCache();
    if (!cached || Date.now() - cached.at >= BAZAAR_TTL) return;
    publishBazaar({ prices: cached.prices, fetchedAt: cached.at, error: null });
  });
}

/** The store behind `useBazaar`, for readers that are not components. */
export const bazaarStore = { subscribe: subscribeBazaar, getSnapshot: getBazaar };

export const useBazaar = (): BazaarState => useSyncExternalStore(subscribeBazaar, getBazaar, getBazaar);

export interface CostNode {
  id: string;
  name: string;
  /** Preferred wiki image title, carried from the item so the tree's icons resolve the same files the list's do. */
  wikiTitle?: string;
  qty: number;
  tier: string | null;
  /** Cheapest total cost for this quantity, or null when unknown. */
  cost: number | null;
  /** What we would actually do here. */
  action: "craft" | "buy" | "unknown";
  /** Buying this quantity outright, when it is on the bazaar. */
  buyCost: number | null;
  /** Crafting it from its ingredients, when every leg is priced. */
  craftCost: number | null;
  /**
   * What an NPC would pay for this quantity, or null when the item has no
   * known NPC price.
   *
   * This is a valuation, not a purchase option. You cannot buy this back from
   * a shop at this figure, so it never feeds the craft-or-buy decision and
   * never becomes `cost`. It exists because on Ironman the bazaar is gone and
   * a tree with no numbers at all is harder to read than one measured in the
   * only currency the mode still has.
   */
  npcValue: number | null;
  children: CostNode[];
  alternatives?: { id: string; name: string }[];
}

/**
 * Expand an item into a costed crafting tree.
 *
 * At each node we compare buying outright against crafting from parts and take
 * whichever is cheaper, which is the decision you actually make in game.
 * A node whose price is unknown stays "unknown" rather than being treated as
 * free, so an unpriceable branch cannot make a tree look cheap.
 */
export const buildCostTree = (
  id: string,
  qty: number,
  items: ItemIndex,
  prices: Record<string, BazaarPrice>,
  /**
   * Ironman has no Bazaar and no Auction House, so buying is never available.
   * Every branch is expanded to the bottom and cost is measured in raw
   * materials rather than coins.
   */
  ironman = false,
  seen: Set<string> = new Set(),
  depth = 0,
  /**
   * The name the RECIPE stated for this ingredient, carried down so an item
   * the index has never heard of still wears its real name. Without it a
   * missing entry rendered its normalized lookup key - the visible bug
   * was "ruby_veilshroom" sitting in the Accretion Talisman tree where
   * "Ruby Veilshroom" belongs. The key is a lookup device, never a label.
   */
  statedName?: string
): CostNode => {
  const item = items[id];
  const name = item?.name ?? statedName ?? prettify(id);
  const hypixelId = item?.hypixelId ?? null;

  const unit = ironman ? null : hypixelId ? prices[hypixelId]?.buy ?? null : null;
  const buyCost = unit !== null ? unit * qty : null;

  /**
   * NPC valuation is computed in both modes because it costs nothing and the
   * Ironman view needs it. A null `npcSell` means the item is not NPC
   * sellable, or we have no figure for it. Either way it stays null and is
   * rendered as unknown; treating it as 0 would quietly claim a stack of
   * enchanted diamonds is worthless.
   */
  const npcUnit = item?.npcSell ?? null;

  const node: CostNode = {
    id,
    name,
    ...(item?.wikiTitle ? { wikiTitle: item.wikiTitle } : {}),
    qty,
    tier: item?.tier ?? null,
    cost: buyCost,
    action: buyCost !== null ? "buy" : "unknown",
    buyCost,
    craftCost: null,
    npcValue: npcUnit !== null ? npcUnit * qty : null,
    children: [],
  };

  // Depth guard, and never recurse through an item already on this path.
  if (!item?.recipe || seen.has(id) || depth > 12) return node;

  const branch = new Set(seen).add(id);
  const crafts = Math.ceil(qty / Math.max(1, item.yields));

  let craftTotal = 0;
  let allPriced = true;

  for (const ing of item.recipe) {
    const candidates = [{ id: ing.id, name: ing.name }, ...(ing.alternatives ?? [])].filter(
      (candidate, index, all) => all.findIndex((entry) => entry.id === candidate.id) === index
    );
    const costed = candidates.map((candidate) =>
      buildCostTree(candidate.id, ing.qty * crafts, items, prices, ironman, branch, depth + 1, candidate.name)
    );
    const child = costed.reduce((best, candidate) => {
      if (best.cost === null && candidate.cost !== null) return candidate;
      if (candidate.cost !== null && best.cost !== null && candidate.cost < best.cost) return candidate;
      return best;
    });
    const alternatives = candidates.filter((candidate) => candidate.id !== child.id);
    if (alternatives.length > 0) child.alternatives = alternatives;
    node.children.push(child);
    if (child.cost === null) allPriced = false;
    else craftTotal += child.cost;
  }

  node.craftCost = allPriced ? craftTotal : null;

  if (node.craftCost !== null && (buyCost === null || node.craftCost < buyCost)) {
    node.cost = node.craftCost;
    node.action = "craft";
  } else if (buyCost !== null) {
    node.cost = buyCost;
    node.action = "buy";
  }

  return node;
};

/**
 * Flatten a tree into the raw materials you actually have to obtain.
 *
 * A leaf is anything we would not craft: on Ironman that means everything with
 * no recipe, and on a normal profile it also includes branches we decided to
 * buy. This is the shopping list, or on Ironman the farming list.
 */
export const collectRawMaterials = (node: CostNode, into: Map<string, { name: string; qty: number }> = new Map()) => {
  const isLeaf = node.children.length === 0 || node.action === "buy";
  if (isLeaf) {
    const prev = into.get(node.id);
    into.set(node.id, { name: node.name, qty: (prev?.qty ?? 0) + node.qty });
    return into;
  }
  for (const c of node.children) collectRawMaterials(c, into);
  return into;
};

export interface NpcRollup {
  /** Total NPC value of the materials we have a price for. */
  total: number;
  /** How many distinct materials contributed to that total. */
  known: number;
  /** How many had no NPC price and are therefore missing from it. */
  unknown: number;
}

/**
 * NPC valuation of a gather list.
 *
 * Materials with no NPC price are counted, not guessed. A total that silently
 * skipped them would read as the whole list's worth while actually being a
 * fraction of it, so the caller gets the count and can say "plus N unpriced"
 * instead of overstating. Same rule as the bazaar tree: unknown is unknown,
 * never zero.
 */
export const sumNpcValue = (materials: { id: string; qty: number }[], items: ItemIndex): NpcRollup => {
  let total = 0;
  let known = 0;
  let unknown = 0;

  for (const m of materials) {
    const npc = items[m.id]?.npcSell ?? null;
    if (npc === null) {
      unknown += 1;
      continue;
    }
    total += npc * m.qty;
    known += 1;
  }

  return { total, known, unknown };
};

/** 1.2M, 45.3k, 812 */
export const formatCoins = (n: number | null): string => {
  if (n === null || !isFinite(n)) return "?";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toLocaleString();
};
