import { norm } from "./wikiCrafting";

/**
 * Rarity tiers from the wiki, for items Hypixel's resource does not tier.
 *
 * WHY THIS EXISTS
 * ---------------
 * The motivating defect: Accretion Artifact, Accretion Ring and Accretion
 * Talisman uncoloured in the crafting list. The mechanism that colours the
 * list reads rarity from Hypixel's `/resources/skyblock/items`, and the gap is
 * that the resource genuinely lacks these items: measured live 2026-08-03
 * there is no ACCRETION_* id in it at all (it lags the game), and 868 of its
 * 5,549 entries carry no `tier` field, Angler and Farm armor among them. The
 * wiki does state their rarity, as a category on the article: Accretion
 * Talisman carries `Category:Common items`, Sinseeker Scythe `Category:Epic
 * items`, and redirects resolve set pages ("Angler Helmet" redirects to
 * "Angler Armor", which carries the tier for all four pieces).
 *
 * So this asks the wiki, batched fifty titles per request like
 * `materialChain.ts`, only for the names the resource left tierless, and only
 * once a day. A page whose article states no single tier (multi-rarity pets
 * like Ammonite, set pages listing several) stays null, which renders as
 * uncoloured: unknown is never rendered as known.
 *
 * Wiki content is CC BY-NC-SA 3.0, so this follows `wikiCrafting.ts`:
 * fetched at runtime, parsed in the browser, nothing bundled.
 */

const API = "https://hypixelskyblock.minecraft.wiki/api.php";

/** New surface, so a new key. Nothing else in this browser is touched. */
export const TIERS_CACHE_KEY = "skydex.wikiTiers.v1";

/** Rarities change when the game does, not per page view. */
export const TIERS_TTL = 24 * 60 * 60 * 1000;

const BATCH = 50;

/**
 * The game's rarity ladder, as the wiki's category names spell it. These are
 * game terms, not wiki prose. The value is the canonical form the item index
 * already uses (Hypixel's own upper-snake), so `TIER`/`RARITY` lookups hit.
 */
const TIER_CATEGORIES: Record<string, string> = {
  "Common items": "COMMON",
  "Uncommon items": "UNCOMMON",
  "Rare items": "RARE",
  "Epic items": "EPIC",
  "Legendary items": "LEGENDARY",
  "Mythic items": "MYTHIC",
  "Divine items": "DIVINE",
  "Special items": "SPECIAL",
  "Very Special items": "VERY_SPECIAL",
  "Ultimate items": "ULTIMATE",
  "Supreme items": "SUPREME",
  "Admin items": "ADMIN",
};

/**
 * Folded item name -> tier, or null for an article that states no single one.
 * Folded with `norm`, the same key the index matches names on.
 */
export type WikiTierIndex = Record<string, string | null>;

export interface WikiTierCache {
  fetchedAt: number;
  tiers: WikiTierIndex;
}

export const readTierCache = (): WikiTierCache => {
  try {
    const raw = localStorage.getItem(TIERS_CACHE_KEY);
    if (!raw) return { fetchedAt: 0, tiers: {} };
    const parsed = JSON.parse(raw) as WikiTierCache;
    return parsed?.tiers && typeof parsed.fetchedAt === "number" ? parsed : { fetchedAt: 0, tiers: {} };
  } catch {
    return { fetchedAt: 0, tiers: {} };
  }
};

export const writeTierCache = (cache: WikiTierCache) => {
  try {
    localStorage.setItem(TIERS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Optional cache. A full quota only costs a refetch next visit.
  }
};

/** Inside the TTL, a cached null is an answer; outside it, a null is re-askable. */
export const tierCacheFresh = (cache: WikiTierCache): boolean => Date.now() - cache.fetchedAt < TIERS_TTL;

/** The response shape this module reads. Exported for the parser's tests. */
export interface CategoriesResponse {
  query?: {
    normalized?: { from?: string; to?: string }[];
    redirects?: { from?: string; to?: string }[];
    pages?: { title?: string; missing?: boolean; categories?: { title?: string }[] }[];
  };
}

/**
 * One response into name -> tier entries, for the names that were asked.
 *
 * Pure, so the redirect plumbing is testable without a network. Three maps
 * have to be walked back: the API normalises a queried title ("Angler_Helmet"
 * to "Angler Helmet"), may then redirect it ("Angler Helmet" to "Angler
 * Armor"), and reports categories against the final page only. A page with
 * several tier categories states no single rarity and records null: picking
 * one would be a guess wearing a colour.
 */
export const parseTierResponse = (body: CategoriesResponse, asked: readonly string[]): WikiTierIndex => {
  const learned: WikiTierIndex = {};

  const normalized = new Map<string, string>();
  for (const n of body.query?.normalized ?? []) {
    if (n.from && n.to) normalized.set(n.from, n.to);
  }
  const redirected = new Map<string, string>();
  for (const r of body.query?.redirects ?? []) {
    if (r.from && r.to) redirected.set(r.from, r.to);
  }

  const tierByPage = new Map<string, string | null>();
  for (const page of body.query?.pages ?? []) {
    if (!page.title) continue;
    const tiers = new Set<string>();
    for (const c of page.categories ?? []) {
      const bare = (c.title ?? "").replace(/^Category:/, "");
      const tier = TIER_CATEGORIES[bare];
      if (tier) tiers.add(tier);
    }
    tierByPage.set(page.title, tiers.size === 1 ? [...tiers][0] : null);
  }

  for (const name of asked) {
    let title = normalized.get(name) ?? name;
    // Redirects can chain; three hops covers anything a wiki editor writes.
    for (let hop = 0; hop < 3; hop++) {
      const next = redirected.get(title);
      if (!next) break;
      title = next;
    }
    learned[norm(name)] = tierByPage.get(title) ?? null;
  }

  return learned;
};

/**
 * Fetch tiers for the given item names, in batches of 50.
 * Returns only what was learned; callers merge it into their cache. A failed
 * batch is skipped rather than recorded, so an outage is never remembered as
 * "this item has no rarity".
 */
export const fetchWikiTiers = async (names: readonly string[], signal?: AbortSignal): Promise<WikiTierIndex> => {
  const learned: WikiTierIndex = {};
  if (!names.length) return learned;

  for (let i = 0; i < names.length; i += BATCH) {
    const slice = names.slice(i, i + BATCH);

    const url = `${API}?${new URLSearchParams({
      action: "query",
      titles: slice.join("|"),
      prop: "categories",
      cllimit: "500",
      redirects: "1",
      format: "json",
      formatversion: "2",
      origin: "*",
    })}`;

    const res = await fetch(url, { signal });
    if (!res.ok) continue;

    Object.assign(learned, parseTierResponse((await res.json()) as CategoriesResponse, slice));
  }

  return learned;
};
