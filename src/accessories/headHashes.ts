import { useSyncExternalStore } from "react";
import { headUrl } from "../island/heads";
import { fetchItemResourceItems } from "../items/itemResourceFetch";

/**
 * Player-head texture hashes for accessories, read from Hypixel's own resource.
 *
 * WHY THIS EXISTS
 * ---------------
 * A large slice of the accessory catalogue is `player_head` items with a custom
 * skin, and the wiki has no image file for most of them. Those are exactly the
 * tiles that come out blank, and the run of Campfire badges is the visible case:
 * all 58 of them, none with a wiki file under any rung of the name ladder.
 *
 * Hypixel already ships what draws them. Every skull entry in
 * `/v2/resources/skyblock/items` carries a `skin.value`, which is the standard
 * Mojang texture property: base64 of a small JSON document whose
 * `textures.SKIN.url` ends in the texture hash. That hash is all MCHeads needs,
 * and MCHeads is already how the Island page draws heads and is already
 * credited in NOTICE.md and in the footer.
 *
 * MEASURED, NOT ASSUMED
 * ---------------------
 * Against the live resource on 2026-08-02: 5,549 items, 411 of them accessories,
 * 390 of those carrying a `skin`. All 390 base64-decode to JSON with a
 * `textures.SKIN.url` ending in a 64 character hex hash. Zero failed to parse.
 * Of the 407 entries the catalogue actually builds, 386 carry a hash.
 *
 * WHERE THIS SITS IN THE CHAIN, AND WHY IT IS LAST
 * ------------------------------------------------
 * It is handed to `ItemIcon` as `lateSrc`, which is the final rung before the
 * blank or initials fallback. The wiki sources keep first refusal because they
 * are licensed, cached and already working, and `chooseIconSource` additionally
 * makes `lateSrc` wait for a lookup that is still in flight, so a head render
 * can never pre-empt a real wiki result that is about to land.
 *
 * That rung is TERMINAL. mc-heads.net answers an unknown hash with 200 and a
 * default Steve head rather than a 404, so `onError` will never fire for it and
 * a wrong-looking head cannot be detected or recovered from. That is the right
 * trade only because the hash is not guessed: it comes from the item's own entry
 * in Hypixel's resource, so it is the texture the game itself draws.
 *
 * WHAT THIS COSTS, HONESTLY
 * -------------------------
 * One extra GET of the item resource, lazily, and only for a visitor who opens
 * the accessories page. `wikiCrafting.fetchCraftingData` already pulls the same
 * URL but keeps only name, tier, category and NPC price, and that parser lives
 * in a module this layer does not own. The resource answers
 * `cache-control: public, max-age=0` with a `Last-Modified`, so the browser
 * revalidates rather than refetching the body, and what is kept here is the
 * derived id-to-hash map alone, cached for a day. A return visit inside the day
 * costs no request at all.
 *
 * Nothing is bundled. The hash comes from an API we already talk to and the
 * render comes from MCHeads over the network, exactly as the wiki images do.
 */

/**
 * The one key this module owns. Holds derived texture hashes, nothing the user
 * entered. New key, so it is `skydex.*` rather than the frozen `wizardsky.*`.
 */
export const HEADS_CACHE_KEY = "skydex.accessories.heads.v1";

/** Same freshness as the item index. Textures change when the game does. */
export const HEADS_TTL = 24 * 60 * 60 * 1000;

/** One entry of the item resource, as far as this module cares. */
export interface SkinnedItem {
  id: string;
  /** Present on skull items. `signature` also rides along and is not used. */
  skin?: { value?: string } | null;
}

/** Hypixel item id to texture hash. Only ids that have one appear. */
export type HeadIndex = Record<string, string>;

/**
 * The texture URL, as it appears inside a decoded skin value.
 *
 * Anchored on the hex hash rather than on the host, because Mojang has served
 * this from more than one hostname over the years and the hash is the part we
 * actually use. The character class is the guard: a value that is not hex never
 * becomes a URL, and `headUrl` screens it a second time on the way out.
 */
const TEXTURE_URL = /\/texture\/([0-9a-f]{32,64})\/?$/i;

/**
 * Pull the texture hash out of a base64 `skin.value`, or null if there is none.
 *
 * Pure and total. Every failure mode returns null rather than throwing: a value
 * that is not base64, that does not decode to JSON, that decodes to JSON with no
 * texture, or that carries a URL which is not a texture URL. A null here simply
 * means this item gets no late rung, which is the state it was already in.
 *
 * `atob` gives one character per byte, so a non-ASCII `profileName` would come
 * back mangled. It does not matter and is not worth decoding around: the only
 * field read is the texture URL, which is ASCII by construction, and a mangled
 * name still parses as a JSON string.
 */
export const hashFromSkinValue = (value: string): string | null => {
  try {
    const parsed = JSON.parse(atob(value)) as { textures?: { SKIN?: { url?: string } } };
    const url = parsed?.textures?.SKIN?.url;
    if (typeof url !== "string") return null;
    const found = TEXTURE_URL.exec(url);
    return found ? found[1].toLowerCase() : null;
  } catch {
    return null;
  }
};

/**
 * Build the id-to-hash map from the raw item list.
 *
 * Pure, so the whole rule is testable without a network. Items with no skin, or
 * with one that does not yield a hash, are simply absent: an id that is not in
 * the map is an item with no head render, not an item with a broken one.
 */
export const buildHeadIndex = (items: readonly SkinnedItem[]): HeadIndex => {
  const index: HeadIndex = {};
  for (const item of items) {
    if (!item?.id) continue;
    const value = item.skin?.value;
    if (typeof value !== "string" || !value) continue;
    const hash = hashFromSkinValue(value);
    if (hash) index[item.id] = hash;
  }
  return index;
};

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

interface HeadCache {
  fetchedAt: number;
  heads: HeadIndex;
}

let index: HeadIndex = {};
let fetchedAt: number | null = null;
let hydrated = false;
let inFlight = false;
const listeners = new Set<() => void>();

const notify = () => {
  for (const fn of listeners) fn();
};

const readCache = (): HeadCache | null => {
  try {
    const raw = localStorage.getItem(HEADS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HeadCache;
    return parsed?.heads && typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    // No storage, or a corrupt entry. Either way we look it up again.
    return null;
  }
};

const writeCache = (cache: HeadCache) => {
  try {
    localStorage.setItem(HEADS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Optional cache. Losing it only means one more request tomorrow.
  }
};

/**
 * Adopt the cached map, once, the first time anybody actually looks.
 *
 * A stale map is still shown rather than dropped. Unlike a price, a texture hash
 * does not go wrong with age: the worst a day-old map can do is miss an
 * accessory Hypixel added this morning, which is the same blank tile that
 * existed before any of this.
 */
const hydrate = () => {
  if (hydrated) return;
  hydrated = true;
  const cached = readCache();
  if (!cached) return;
  index = cached.heads;
  fetchedAt = cached.fetchedAt;
  notify();
};

const fresh = () => fetchedAt !== null && Date.now() - fetchedAt < HEADS_TTL;

const ensure = () => {
  if (inFlight || fresh()) return;
  inFlight = true;

  fetchItemResourceItems()
    .then((items) => {
      inFlight = false;
      const built = buildHeadIndex(items as SkinnedItem[]);
      // An empty result is a bad response, not a game with no skulls. Keeping
      // what we already had means a malformed payload cannot blank the page.
      if (Object.keys(built).length === 0) return;
      index = built;
      fetchedAt = Date.now();
      writeCache({ fetchedAt, heads: index });
      notify();
    })
    .catch(() => {
      inFlight = false;
      // No head rung for this session. Every affected tile falls back to the
      // initials it showed before, which is not an error worth a banner.
    });
};

const subscribeHeads = (fn: () => void) => {
  listeners.add(fn);
  hydrate();
  ensure();
  return () => {
    listeners.delete(fn);
  };
};

/** The texture hash for a Hypixel item id, or null when it has none. */
export const headHashFor = (hypixelId?: string | null): string | null =>
  hypixelId ? index[hypixelId] ?? null : null;

/**
 * The head render URL for a Hypixel item id, ready to hand to `ItemIcon`.
 *
 * `undefined` rather than null, because that is what `lateSrc` takes and an
 * absent prop is the honest way to say there is no last resort for this item.
 */
export const headSrcFor = (hypixelId?: string | null): string | undefined => {
  const hash = headHashFor(hypixelId);
  if (!hash) return undefined;
  return headUrl(hash) ?? undefined;
};

/**
 * The same, as a hook, which is also what starts the fetch.
 *
 * Every tile subscribing is deliberate and is the pattern `ItemIcon` already
 * uses for the wiki lookup store: the listener set is a `Set` of closures and
 * the snapshot is a string, so a grid of 407 subscribers costs one map lookup
 * each and re-renders only the tiles whose value actually changed.
 */
export const useHeadSrc = (hypixelId?: string | null): string | undefined =>
  useSyncExternalStore(
    subscribeHeads,
    () => headSrcFor(hypixelId),
    () => headSrcFor(hypixelId)
  );

/** Test seam. Not used by the app; the store is never reset in the browser. */
export const __setHeadsForTests = (seed?: HeadIndex, at?: number) => {
  index = seed ? { ...seed } : {};
  fetchedAt = at ?? null;
  hydrated = true;
  inFlight = false;
};
