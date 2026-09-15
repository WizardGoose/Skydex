import { hashFromSkinValue } from "../accessories/headHashes";
import { fetchSkyblockItems } from "./itemsResourceFetch";
import { headUrl } from "../island/heads";
import { prettify } from "../island/format";

/**
 * Hypixel's own item resource, reduced to the two things an icon needs.
 *
 * WHY THIS EXISTS
 * ---------------
 * The icon ladder derives every candidate title from the name it was handed.
 * That works while the name is recoverable from the id, and there is a whole
 * class of items where it simply is not:
 *
 *   LOTUS_SILVER              is "Silver Lotus", not "Lotus Silver"
 *   ENCHANTED_ENDSTONE        is "Enchanted End Stone"
 *   GLOWSTONE_DUST_DISTILLATE is "Glowstone Distillate"
 *   ARCHITECT_FIRST_DRAFT     is "Architect's First Draft"
 *   BOB_OMB                   is "Bob-omb"
 *   DIVER_FRAGMENT            is "Emperor's Skull"
 *
 * No amount of splitting, title casing or suffix stripping reaches any of
 * those, and inventing a rule that tried would be guessing. Hypixel already
 * publishes the answer: `/v2/resources/skyblock/items` is the table the game
 * builds its own tooltips from, so the name in it is the name on the player's
 * screen. Measured over the live island export, 118 of 1,027 distinct entries
 * resolve to a wiki file only because this map exists.
 *
 * The same response carries `skin.value` on every skull item, which is the
 * standard Mojang texture property. That yields a head render for 2,765 of the
 * 5,549 items, and a head render cannot 404, so it is the rung that makes a
 * tile impervious to having no picture at all.
 *
 * WHAT IT COSTS, HONESTLY
 * -----------------------
 * Nothing, on the common path. `wikiCrafting.fetchCraftingData` already pulls
 * this exact URL for tier, category and NPC price, so it hands the parsed array
 * straight to `adoptResourceItems` and no second request happens. The lazy
 * `requestItemResource` below is only for a surface that renders icons without
 * ever building the crafting index, and even that is deferred until an icon has
 * really exhausted its free rungs.
 *
 * WHAT IS KEPT, AND WHY IT IS NOT EVERYTHING
 * ------------------------------------------
 * A name is stored only when `prettify(id)` does not already produce it, which
 * drops 1,506 of the 5,549 entries and takes the cache from 432 KB to 346 KB.
 * The rule is not a size trick, it is the definition of this map: it exists to
 * hold the names an id cannot recover, and an entry equal to `prettify(id)`
 * holds nothing. A future change to `prettify` would only cost us a rung we
 * could have derived anyway, never a wrong one, and the key is versioned.
 *
 * Nothing is bundled. The names and hashes come from an API this app already
 * talks to, and the head render is fetched by the visitor's browser exactly as
 * the wiki images are.
 */

/** The resource, as far as this module cares. */
export interface ResourceItem {
  id?: string;
  name?: string;
  /** Rarity tier, e.g. "EPIC". Hypixel states it for nearly every item. */
  tier?: string;
  /** Hypixel item category. */
  category?: string;
  /** Present on skull items. `signature` also rides along and is not used. */
  skin?: { value?: string } | null;
  /** Exact model id used by Hypixel's official SkyBlock resource pack. */
  item_model?: string;
}

/** What is worth remembering about one item. Every field is optional. */
export interface ResourceEntry {
  /** Hypixel's display name, only when `prettify(id)` does not reach it. */
  n?: string;
  /** Mojang texture hash for a skull item. */
  h?: string;
  /**
   * Rarity tier, lower-cased. Added for the forge-only items (Gemstone
   * Chamber rendered uncoloured): they are absent from the crafting
   * module, so the resource is the only place their rarity is stated.
   */
  t?: string;
  /** Exact official-pack model id, e.g. `hypixel_skyblock:item/...`. */
  m?: string;
  /** Hypixel's item category, used to organise item-heavy Profile surfaces. */
  c?: string;
}

export type ResourceIndex = Record<string, ResourceEntry>;

/** New key, so it is `skydex.*` rather than the frozen `wizardsky.*`. */
// v2: v1 was written before `t` (tier) existed, so a v1 snapshot would serve
// colourless forge items for up to a day. A payload that gains fields gains a
// key with it - the same lesson the crafting cache learned at its v4.
// v3: v2 proved the lesson twice. The key bump and the tier-storing code
// landed as two separate edits, a dev tab reloaded between them, and a
// tierless snapshot was written UNDER THE NEW KEY, where the TTL then
// protected it for a day. The bump has to ship in the same change as the
// field it announces; since v2 did not, it is burned.
// v4: `t` no longer stores Hypixel's "UNOBTAINABLE", which is a flag rather
// than a rarity: no colour token exists for it, and via the Enchanted Clock
// name collision (ENCHANTED_CLOCK the admin relic vs ENCHANTED_TIME_CLOCK
// the craftable LEGENDARY, same display name) it painted a real item with a
// non-rarity that blocked the wiki tier fill. A v3 snapshot still carries
// those entries, so the rule change bumps the key in the same edit.
// v5: v4 was written by a hot-reloading dev tab in the window between the
// key bump and the rule landing (the same race the crafting cache documents
// at its v5, v7 and v9), verified on the built page: a v4 snapshot with
// `t: "unobtainable"` entries still in it. This bump is one edit with the
// rule already in place, which closes the window.
// v6: Hypixel now states `item_model` for custom-model items. Keeping that
// exact path lets the official pack resolve icons without guessing from a
// display name, so the reduced cache gains `m` in the same key bump.
export const RESOURCE_CACHE_KEY = "skydex.items.resource.v8";
const STALE_RESOURCE_KEYS = [
  "skydex.items.resource.v1",
  "skydex.items.resource.v2",
  "skydex.items.resource.v3",
  "skydex.items.resource.v4",
  "skydex.items.resource.v5",
  "skydex.items.resource.v6",
  "skydex.items.resource.v7",
];

/** Same freshness as the item index. Names and textures change when the game does. */
export const RESOURCE_TTL = 24 * 60 * 60 * 1000;



/**
 * Strip the colour codes Hypixel leaves in 22 of the names.
 *
 * `WARTS_STEW` arrives as "§cMushroom & Warts Stew". The codes are two
 * characters, a section sign and one of the 22 formatting letters, and no wiki
 * title contains either half.
 */
const stripColour = (s: string): string => s
  .replace(/§[0-9a-fk-or]/gi, "")
  .replace(/%{1,2}[a-z_]+%%/gi, "")
  .trim();

/**
 * Reduce the raw resource to the map above.
 *
 * Pure, so the whole rule is testable without a network. An item with neither a
 * surprising name nor a skin contributes no entry at all: absent means "nothing
 * here that the id did not already tell you", never "broken".
 */
export const buildResourceIndex = (items: readonly ResourceItem[]): ResourceIndex => {
  const index: ResourceIndex = {};

  for (const item of items) {
    const id = item?.id;
    if (!id) continue;

    const entry: ResourceEntry = {};

    const name = stripColour(item.name ?? "");
    if (name && name !== prettify(id)) entry.n = name;

    const value = item.skin?.value;
    if (typeof value === "string" && value) {
      const hash = hashFromSkinValue(value);
      if (hash) entry.h = hash;
    }

    // "UNOBTAINABLE" is a flag, not a rarity; see the v4 note on the cache
    // key. Nothing can render it and via a shared display name it can shadow
    // a real item's real tier, so it is not a tier this map will ever serve.
    if (typeof item.tier === "string" && item.tier && item.tier !== "UNOBTAINABLE") entry.t = item.tier.toLowerCase();

    if (typeof item.item_model === "string" && item.item_model.trim()) {
      entry.m = item.item_model.trim();
    }

    if (typeof item.category === "string" && item.category.trim()) {
      entry.c = item.category.trim().toUpperCase();
    }

    if (entry.n || entry.h || entry.t || entry.m || entry.c) index[id] = entry;
  }

  return index;
};

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

interface ResourceCache {
  fetchedAt: number;
  entries: ResourceIndex;
}

let index: ResourceIndex = {};
let fetchedAt: number | null = null;
let hydrated = false;
let inFlight = false;
let version = 0;
const listeners = new Set<() => void>();

const notify = () => {
  version++;
  for (const fn of listeners) fn();
};

const readCache = (): ResourceCache | null => {
  try {
    const raw = localStorage.getItem(RESOURCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResourceCache;
    return parsed?.entries && typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    // No storage, or a corrupt entry. Either way we look it up again.
    return null;
  }
};

const writeCache = (cache: ResourceCache) => {
  try {
    localStorage.setItem(RESOURCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Optional cache, and the biggest thing this app stores. Losing it to a
    // quota costs one more request tomorrow and nothing else, so it is not
    // worth surfacing and must never be worth throwing.
  }
};

/**
 * Adopt the cached map, once, the first time anybody actually looks.
 *
 * A stale map is shown rather than dropped, for the same reason a texture hash
 * can be: unlike a price, a name does not go wrong with age. The worst a day
 * old map can do is miss an item Hypixel added this morning, which is the blank
 * tile that existed before any of this.
 *
 * DELIBERATELY SILENT
 * -------------------
 * This does NOT notify, and that is not an oversight. `ItemIcon` reads through
 * `resourceNameFor` during render, so this runs during render, and telling
 * every other subscriber to update at that moment is React's "cannot update a
 * component while rendering a different component". No notification is needed
 * either: it is synchronous, so the component that triggered it sees the map on
 * the very render that asked, and every component in that same pass reads the
 * same hydrated map. Only `adoptResourceItems` publishes, and it is only ever
 * reached from a promise callback or an effect.
 */
const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  // Own derived cache only, same policy as the crafting and solver caches:
  // a superseded snapshot of OUR parse is ours to remove; nothing the user
  // entered ever lives under these keys.
  try {
    for (const key of STALE_RESOURCE_KEYS) localStorage.removeItem(key);
  } catch {
    // No storage. Nothing to tidy.
  }
  const cached = readCache();
  if (!cached) return;
  index = cached.entries;
  fetchedAt = cached.fetchedAt;
};

const fresh = () => fetchedAt !== null && Date.now() - fetchedAt < RESOURCE_TTL;

/**
 * Take the array `fetchCraftingData` has already downloaded.
 *
 * This is the path that keeps the whole feature free. It is also why the fetch
 * below is lazy rather than eager: on every surface that builds the item index,
 * this lands first and `requestItemResource` then has nothing to do.
 *
 * An empty array is a bad response, not a game with no items, so it is ignored
 * rather than allowed to blank a map we already have.
 */
export const adoptResourceItems = (items: readonly ResourceItem[]): void => {
  hydrate();
  if (!items.length) return;

  const built = buildResourceIndex(items);
  if (Object.keys(built).length === 0) return;

  index = built;
  tierByFoldedName = null;
  fetchedAt = Date.now();
  writeCache({ fetchedAt, entries: index });
  notify();
};

/**
 * Fetch the resource ourselves, for a surface that never builds the item index.
 *
 * Callers fire this from an exhausted icon, never on first paint, so a page of
 * ordinary items never reaches it. Guarded on both freshness and an in-flight
 * request, so a grid of a hundred exhausted tiles still costs one request.
 */
export const requestItemResource = (): void => {
  hydrate();
  if (inFlight || fresh()) return;
  inFlight = true;

  fetchSkyblockItems()
    .then((items) => {
      adoptResourceItems(items as ResourceItem[]);
    })
    .catch(() => {
      // No resource rungs this session. Every affected tile falls back to the
      // wiki chain it had before, which is not an error worth a banner.
    })
    .finally(() => {
      inFlight = false;
    });
};

/**
 * The entry for an id, tolerating the two shapes callers actually pass.
 *
 * `ItemsPage` hands `ItemIcon` a slug (`enchanted_bread`) while the island
 * surfaces hand it a Hypixel id (`ENCHANTED_BREAD`), so both are tried. That is
 * safe rather than lucky: a slug is built from a display name, so when it
 * uppercases into some other item's id at all, it is because the two share that
 * name. Measured across the whole resource there are 129 such pairs and every
 * one of them resolves to the same name, for example `STARRED_ADAPTIVE_BOOTS`
 * and `ADAPTIVE_BOOTS` are both "Adaptive Boots". None of them can produce a
 * different item's name.
 */
const entryFor = (id?: string | null): ResourceEntry | null => {
  const raw = (id ?? "").trim();
  if (!raw) return null;
  hydrate();
  // The third try is for display names ("Gemstone Chamber", "Ruby Drill
  // TX-15"): no real id carries a space or a hyphen, so folding both into
  // underscores can only ever reach an id the name itself denotes, never
  // collide with a different one.
  return index[raw] ?? index[raw.toUpperCase()] ?? index[raw.replace(/[\s-]+/g, "_").toUpperCase()] ?? null;
};

/** Same folding the crafting module uses; declared here so no import cycle. */
const foldName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Tier by DISPLAY NAME, for the ids no rule can derive.
 *
 * "Mithril Drill SX-R226" is `MITHRIL_DRILL_1`; nothing about the name says
 * so. But the resource entry for that id carries the name (it is exactly the
 * kind prettify cannot produce, so `n` is stored), and it carries the tier,
 * so the two sides meet here. Built lazily, invalidated whenever the map is
 * replaced. Two ids sharing a display name are variants of one item
 * (measured: all 129 such pairs agree), so first-wins is not a gamble.
 */
let tierByFoldedName: Map<string, string> | null = null;

const tierNameIndex = (): Map<string, string> => {
  if (tierByFoldedName) return tierByFoldedName;
  hydrate();
  tierByFoldedName = new Map();
  for (const entry of Object.values(index)) {
    if (!entry.n || !entry.t) continue;
    const key = foldName(stripColour(entry.n));
    if (!tierByFoldedName.has(key)) tierByFoldedName.set(key, entry.t);
  }
  return tierByFoldedName;
};

/**
 * Hypixel's own name for an id, or null when the id already tells you.
 *
 * Null is the important half of the contract, exactly as in `legacyIds`: it
 * means the caller keeps whatever it had, so this map can only ever add a rung
 * and never take one away.
 */
export const resourceNameFor = (id?: string | null): string | null => {
  const name = entryFor(id)?.n;
  return name ? stripColour(name) || null : null;
};

/** The texture hash for an id, or null when it has none. */
export const resourceHashFor = (id?: string | null): string | null => entryFor(id)?.h ?? null;

/** Exact model path for the official Hypixel pack, or null when none is stated. */
export const resourceItemModelFor = (id?: string | null): string | null => entryFor(id)?.m ?? null;

/** Hypixel's category for an item id, or null when the resource does not state one. */
export const resourceCategoryFor = (id?: string | null): string | null => entryFor(id)?.c ?? null;

/**
 * Whether the resource has anything at all on this id.
 *
 * The index this reads is the REDUCED one, so strictly this answers "does the
 * resource state something the id itself does not" (a surprising name, a skin,
 * a tier), not bare presence. That is exactly right for its one caller: the
 * forge merge asking whether `PET_AMMONITE` is a real Hypixel id. A pet entry
 * can never be reduced away, because `prettify("PET_AMMONITE")` is "Pet
 * Ammonite" while Hypixel names the item "Ammonite", so the name survives the
 * reduction whenever the id exists at all. Measured live 2026-08-03: the items
 * resource carries no PET_<name> id for any of the nine forge pets (pets live
 * outside `/resources/skyblock/items`), so today this answers false for all of
 * them and the guard simply keeps every guessed id off the index. If Hypixel
 * ever lists them, they resolve on the next daily refresh with no code change.
 */
export const resourceHasId = (id?: string | null): boolean => entryFor(id) !== null;

/** Resolve catalogue slugs and exact display names to a real Hypixel identity. */
export const resourceIdFor = (idOrName?: string | null): string | null => {
  const raw = (idOrName ?? "").trim();
  if (!raw) return null;
  hydrate();
  for (const key of [raw, raw.toUpperCase(), raw.replace(/[\s-]+/g, "_").toUpperCase()]) {
    if (index[key]) return key;
  }
  const name = foldName(stripColour(raw));
  const matches = Object.entries(index).filter(([id, entry]) => foldName(stripColour(entry.n ?? prettify(id))) === name);
  // A display name shared by variants cannot identify the exact item.
  return matches.length === 1 ? matches[0][0] : null;
};

/**
 * The rarity tier for an id or a display name, lower-cased, or null.
 *
 * Null keeps the same contract as the name: the caller keeps whatever tier
 * it already has, so this can only ever colour something grey, never
 * recolour something the crafting index already knew.
 */
export const resourceTierFor = (idOrName?: string | null): string | null => {
  const direct = entryFor(idOrName)?.t;
  if (direct) return direct;
  const raw = (idOrName ?? "").trim();
  if (!raw) return null;
  const byName = tierNameIndex().get(foldName(raw));
  if (byName) return byName;
  // Hypixel's own convention, not a guess: every gemstone item's id says GEM
  // where the wiki (and the screen) says Gemstone - PERFECT_JADE_GEM is
  // "Perfect Jade Gemstone". The alias still only ever READS the resource,
  // so a name the convention does not really cover simply stays null.
  if (/\sGemstone$/i.test(raw)) {
    const gem = raw.replace(/\sGemstone$/i, " Gem");
    return entryFor(gem)?.t ?? tierNameIndex().get(foldName(gem)) ?? null;
  }
  return null;
};

/**
 * The head render URL for an id, ready to hand to `ItemIcon` as `lateSrc`.
 *
 * `undefined` rather than null, because that is what `lateSrc` takes and an
 * absent prop is the honest way to say there is no last resort for this item.
 */
export const resourceHeadSrcFor = (id?: string | null): string | undefined => {
  const hash = resourceHashFor(id);
  if (!hash) return undefined;
  return headUrl(hash) ?? undefined;
};

/** Re-render hook for React. Bumps whenever the map is replaced. */
export const subscribeItemResource = (fn: () => void): (() => void) => {
  listeners.add(fn);
  hydrate();
  return () => {
    listeners.delete(fn);
  };
};

export const itemResourceVersion = (): number => version;

/** Test seam. Not used by the app; the store is never reset in the browser. */
export const __setItemResourceForTests = (seed?: ResourceIndex, at?: number) => {
  index = seed ? { ...seed } : {};
  fetchedAt = at ?? null;
  hydrated = true;
  inFlight = false;
  version++;
};
