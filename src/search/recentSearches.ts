import { useSyncExternalStore } from "react";
import { normalise } from "./normalise";
import { rarityKey, type RarityKey } from "./rarity";
import type { Destination, GlyphKey, SearchEntry } from "./types";

/**
 * The last few things you actually opened from the search box.
 *
 * WHY THIS STORES RESULTS AND NOT QUERY STRINGS
 * ---------------------------------------------
 * "Recent searches" in most apps is a list of the words you typed. That is the
 * wrong shape here, and the brief says so without saying so: the rows have to
 * carry an icon, a name in its rarity colour and a destination badge, and a raw
 * query string has none of those. "choco" is not a thing with a rarity; the
 * Choconut row you picked is. So what gets remembered is the row you committed
 * to, which is also the more useful thing to hand back: one keystroke and Enter
 * returns you to where you were, rather than to a word you then have to search
 * again.
 *
 * WHY THE ROW IS DENORMALISED INTO STORAGE
 * ----------------------------------------
 * The obvious version stores only the entry key and looks the rest up in the
 * index. But the index is fetched, and the dropdown opens the instant the field
 * is focused, which on a cold visit is well before the crafting index has
 * landed. A key-only history would render an empty panel for the first second
 * of every visit, which is precisely the moment the feature exists for. So the
 * row is stored whole. The cost is that a renamed item keeps its old name in
 * the history until you open it again, which is a fair price and self-healing.
 *
 * STORAGE
 * -------
 * One key, `skydex.searches.v1`, under the new prefix. Nothing else in this
 * file names a storage key, nothing here enumerates keys, and the only removal
 * is `removeItem` of that one literal, from the Clear affordance the person
 * pressed themselves. The `wizardsky.*` keys are not read, not written and not
 * migrated by this module.
 */

/** The one key this module owns. New keys take the `skydex.` prefix. */
export const RECENT_KEY = "skydex.searches.v1";

/** Six rows. Enough to be a memory, short enough to stay a glance. */
export const RECENT_LIMIT = 6;

/**
 * A remembered row.
 *
 * Deliberately a subset of `SearchEntry`: the fields a row needs to draw and to
 * navigate, and none of the fields the ranker needs. `needle`, `aliases` and
 * `weight` are search machinery and would be dead weight in storage, so they
 * are rebuilt on the way back out.
 */
export interface RecentSearch {
  /** `SearchEntry.key`. The identity used for dedupe, so one thing is one row. */
  key: string;
  name: string;
  href: string;
  destination: Destination;
  external?: boolean;
  rarity: RarityKey | null;
  iconName: string;
  iconId?: string;
  iconSrc?: string;
  glyph?: GlyphKey;
}

const DESTINATIONS = ["items", "greenhouse", "shards", "wiki", "site"] as const satisfies readonly Destination[];

const GLYPHS = [
  "dashboard",
  "planner",
  "solver",
  "designer",
  "items",
  "island",
  "fusion",
  "recipes",
  "owned",
  "lines",
  "guide",
] as const satisfies readonly GlyphKey[];

const isDestination = (v: unknown): v is Destination => (DESTINATIONS as readonly string[]).includes(v as string);
const isGlyph = (v: unknown): v is GlyphKey => (GLYPHS as readonly string[]).includes(v as string);

/* ------------------------------------------------------------------------ *
 * Pure conversions and merging. No storage, no React, no window.
 * ------------------------------------------------------------------------ */

/** A search result, reduced to what a remembered row needs. */
export const toRecent = (entry: SearchEntry): RecentSearch => ({
  key: entry.key,
  name: entry.name,
  href: entry.href,
  destination: entry.destination,
  ...(entry.external ? { external: true } : {}),
  rarity: entry.rarity,
  iconName: entry.iconName,
  ...(entry.iconId ? { iconId: entry.iconId } : {}),
  ...(entry.iconSrc ? { iconSrc: entry.iconSrc } : {}),
  ...(entry.glyph ? { glyph: entry.glyph } : {}),
});

/**
 * A remembered row, back in the shape the dropdown draws.
 *
 * `hint` is passed in rather than stored because it is a label about *this
 * list*, not a property of the thing. The same Choconut row says "Mutation" in
 * results and can say "Your target" when it is pinned.
 */
export const toEntry = (recent: RecentSearch, hint?: string): SearchEntry => ({
  key: recent.key,
  name: recent.name,
  destination: recent.destination,
  href: recent.href,
  external: recent.external,
  rarity: recent.rarity,
  iconName: recent.iconName,
  iconId: recent.iconId,
  iconSrc: recent.iconSrc,
  glyph: recent.glyph,
  hint,
  weight: 0,
  needle: normalise(recent.name),
  aliases: "",
});

/**
 * Put one row at the front.
 *
 * Dedupe is by `key`, and re-picking something MOVES it rather than adding a
 * second copy, because a history that lists Choconut four times has spent four
 * of its six rows saying one thing. Newest first, then the cap, so the row that
 * falls off is always the oldest.
 */
export const mergeRecent = (list: RecentSearch[], next: RecentSearch, limit = RECENT_LIMIT): RecentSearch[] =>
  [next, ...list.filter((r) => r.key !== next.key)].slice(0, Math.max(0, limit));

/**
 * Read a stored blob defensively.
 *
 * Everything is re-validated rather than trusted, including the rarity, which
 * goes back through `rarityKey` so a tier this build does not know renders in
 * the neutral colour instead of producing a class name that does not exist.
 * Anything malformed is dropped row by row: one bad row must not cost the other
 * five.
 */
export const parseRecent = (raw: unknown, limit = RECENT_LIMIT): RecentSearch[] => {
  if (!Array.isArray(raw)) return [];

  const out: RecentSearch[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const r = item as Record<string, unknown>;

    if (typeof r.key !== "string" || !r.key) continue;
    if (typeof r.name !== "string" || !r.name) continue;
    if (typeof r.href !== "string" || !r.href) continue;
    if (!isDestination(r.destination)) continue;
    if (seen.has(r.key)) continue;
    seen.add(r.key);

    out.push({
      key: r.key,
      name: r.name,
      href: r.href,
      destination: r.destination,
      ...(r.external === true ? { external: true } : {}),
      rarity: typeof r.rarity === "string" ? rarityKey(r.rarity) : null,
      iconName: typeof r.iconName === "string" && r.iconName ? r.iconName : r.name,
      ...(typeof r.iconId === "string" && r.iconId ? { iconId: r.iconId } : {}),
      ...(typeof r.iconSrc === "string" && r.iconSrc ? { iconSrc: r.iconSrc } : {}),
      ...(isGlyph(r.glyph) ? { glyph: r.glyph } : {}),
    });

    if (out.length >= limit) break;
  }

  return out;
};

/* ------------------------------------------------------------------------ *
 * The store
 * ------------------------------------------------------------------------ */

const EMPTY: RecentSearch[] = [];

const read = (): RecentSearch[] => {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return EMPTY;
    return parseRecent(JSON.parse(raw) as unknown);
  } catch {
    return EMPTY;
  }
};

let current: RecentSearch[] = read();
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/**
 * `useSyncExternalStore` compares by identity, so the array reference only
 * changes when the contents actually change. A fresh array per read is an
 * infinite render loop, which the rest of the site's stores learned first.
 */
const getSnapshot = () => current;

const publish = (next: RecentSearch[]) => {
  current = next;
  for (const fn of listeners) fn();
};

/** Remember a row. Called when a result is opened, by keyboard or by click. */
export const pushRecent = (entry: SearchEntry): void => {
  const next = mergeRecent(current, toRecent(entry));
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Quota, private mode, a locked-down browser. The in-memory list is still
    // correct for this session; only survival across reloads is lost.
  }
  publish(next);
};

/**
 * Forget the history.
 *
 * Names exactly one literal key, the one this module created. There is no
 * `clear()` and no key enumeration anywhere in this file, so this cannot reach
 * a planner target, an island snapshot or anything else in shared storage.
 */
export const clearRecent = (): void => {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Nothing to do. The in-memory list is emptied either way.
  }
  publish(EMPTY);
};

// Keep other tabs in step, the same way every other store on this site does.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== RECENT_KEY) return;
    publish(read());
  });
}

export const useRecentSearches = (): RecentSearch[] => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
