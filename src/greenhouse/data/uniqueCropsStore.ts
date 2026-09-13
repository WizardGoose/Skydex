import { useSyncExternalStore } from "react";

/**
 * The greenhouse-wide unique-crop count, in one place.
 *
 * Hypixel applies this bonus across every Greenhouse plot. A solved field only
 * describes one layout, so counting its crop keys is not evidence for this
 * value and used to make otherwise identical fields run on different clocks.
 * This stated count is therefore the timing authority for every field, layout
 * preview and mod countdown until the site can read the complete Greenhouse.
 *
 * STORAGE. The legacy key is read once, as a seed, and never written again.
 * That is the whole of the demotion: the old key is frozen exactly as the last
 * build that owned it left it, so an older build still finds what it expects
 * and nothing the player set is lost. Its name is kept forever either way -
 * leaving a stale key costs nothing and removing one destroys data. The live
 * value persists under this module's own key instead, which is what keeps the
 * slider surviving a reload while the legacy key stops being an authority.
 */

/** Frozen. Read at most once, at module load, and never written. */
const LEGACY_KEY = "skyshards-unique-crops";

/** This store's own home. New key, new namespace. */
const KEY = "skydex.greenhouse.uniqueCrops";

/** The in-game slider runs 0 to 12. Zero means the bonus is off, not absent. */
const MIN = 0;
const MAX = 12;

const clamp = (n: number) => Math.min(MAX, Math.max(MIN, Math.trunc(n)));

const parse = (raw: string | null): number | null => {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return typeof value === "number" && Number.isFinite(value) ? clamp(value) : null;
  } catch {
    return null;
  }
};

/**
 * This store's key first, the legacy key only if this store has never written.
 *
 * Ordering is the demotion. Once there is a value here the legacy key is not
 * consulted again, so a value the player changes today cannot be overruled
 * tomorrow by whatever an older build happened to leave behind.
 */
const readFromDisk = (): number => {
  if (typeof localStorage === "undefined") return 0;
  try {
    const own = parse(localStorage.getItem(KEY));
    if (own !== null) return own;
    return parse(localStorage.getItem(LEGACY_KEY)) ?? 0;
  } catch {
    // Private mode, a locked-down browser, a corrupt value. Zero is the same
    // answer a first-time visitor gets, and the bonus being off is the safe
    // direction to be wrong in: it under-promises growth speed rather than
    // over-promising it.
    return 0;
  }
};

let value = readFromDisk();
const listeners = new Set<() => void>();

const publish = () => {
  for (const fn of listeners) fn();
};

export const subscribeUniqueCrops = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getUniqueCrops = (): number => value;

export const setUniqueCrops = (next: number) => {
  const clamped = clamp(next);
  if (clamped === value) return;
  value = clamped;
  try {
    localStorage.setItem(KEY, JSON.stringify(clamped));
  } catch {
    // The in-memory value still drives this session; only persistence is lost.
  }
  publish();
};

/** Two tabs, one slider. Only our key, and only ever a re-read. */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = readFromDisk();
    if (next === value) return;
    value = next;
    publish();
  });
}

export const useUniqueCrops = (): number => useSyncExternalStore(subscribeUniqueCrops, getUniqueCrops, getUniqueCrops);
