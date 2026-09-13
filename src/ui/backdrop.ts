/**
 * The player's own backdrop image.
 *
 * Same shape as the texture-pack store, for the same reasons: the IMAGE BYTES
 * live in IndexedDB (localStorage would need base64 and megabyte strings), a
 * small localStorage FLAG says one is set so the boot path can decide cheaply,
 * and everything is client-side only. Nothing is uploaded anywhere.
 *
 * The image reaches the page through one seam: `--sd-bg` on the root element,
 * which `.sd-backdrop__img` reads with the shipped hub render as its
 * fallback. Clearing the override is removing the property.
 */

const DB_NAME = "skydex-backdrop";
const DB_VERSION = 1;
const STORE = "files";
const KEY = "backdrop";

/** Flag only. The bytes are in IndexedDB. */
export const BACKDROP_FLAG_KEY = "skydex.backdrop.v1";

/** Fired after every save or clear, so the shell re-applies without a reload. */
export const BACKDROP_UPDATED_EVENT = "skydex:backdrop-updated";

/** Fired when framing changes, without needlessly reloading the image bytes. */
export const BACKDROP_PREFERENCES_UPDATED_EVENT = "skydex:backdrop-preferences-updated";

/** Lightweight presentation choices. The image bytes continue to live in IDB. */
export const BACKDROP_PREFERENCES_KEY = "skydex.backdrop.preferences.v1";

export type BackdropHorizontalFocus = "left" | "center" | "right";
export type BackdropVerticalFocus = "top" | "center" | "bottom";

export interface BackdropPreferences {
  v: 1;
  horizontal: BackdropHorizontalFocus;
  vertical: BackdropVerticalFocus;
  shade: number;
}

export const DEFAULT_BACKDROP_PREFERENCES: BackdropPreferences = {
  v: 1,
  horizontal: "center",
  vertical: "center",
  shade: 12,
};

/** Anything larger is almost certainly a mistake, and blob URLs are not free. */
export const MAX_BACKDROP_BYTES = 12 * 1024 * 1024;

export interface BackdropFlag {
  v: 1;
  name: string;
  size: number;
  type: string;
}

const isHorizontalFocus = (value: unknown): value is BackdropHorizontalFocus =>
  value === "left" || value === "center" || value === "right";

const isVerticalFocus = (value: unknown): value is BackdropVerticalFocus =>
  value === "top" || value === "center" || value === "bottom";

const clampShade = (value: unknown): number => {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.min(40, Math.max(8, Math.round(number))) : DEFAULT_BACKDROP_PREFERENCES.shade;
};

export const readBackdropPreferences = (): BackdropPreferences => {
  try {
    const raw = localStorage.getItem(BACKDROP_PREFERENCES_KEY);
    if (!raw) return DEFAULT_BACKDROP_PREFERENCES;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as { v?: unknown }).v !== 1) {
      return DEFAULT_BACKDROP_PREFERENCES;
    }
    const candidate = parsed as Partial<BackdropPreferences>;
    return {
      v: 1,
      horizontal: isHorizontalFocus(candidate.horizontal) ? candidate.horizontal : DEFAULT_BACKDROP_PREFERENCES.horizontal,
      vertical: isVerticalFocus(candidate.vertical) ? candidate.vertical : DEFAULT_BACKDROP_PREFERENCES.vertical,
      shade: clampShade(candidate.shade),
    };
  } catch {
    return DEFAULT_BACKDROP_PREFERENCES;
  }
};

export const saveBackdropPreferences = (next: Omit<BackdropPreferences, "v">): BackdropPreferences => {
  const preferences: BackdropPreferences = {
    v: 1,
    horizontal: isHorizontalFocus(next.horizontal) ? next.horizontal : DEFAULT_BACKDROP_PREFERENCES.horizontal,
    vertical: isVerticalFocus(next.vertical) ? next.vertical : DEFAULT_BACKDROP_PREFERENCES.vertical,
    shade: clampShade(next.shade),
  };
  try {
    localStorage.setItem(BACKDROP_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // The current visit still receives the update through the event below.
  }
  window.dispatchEvent(new Event(BACKDROP_PREFERENCES_UPDATED_EVENT));
  return preferences;
};

export const applyBackdropPreferences = (
  preferences: BackdropPreferences = readBackdropPreferences(),
  root: HTMLElement = document.documentElement,
): void => {
  root.style.setProperty("--sd-bg-position-x", preferences.horizontal);
  root.style.setProperty("--sd-bg-position-y", preferences.vertical);
  root.style.setProperty("--sd-scrim", (preferences.shade / 100).toFixed(2));
};

export const clearAppliedBackdropPreferences = (root: HTMLElement = document.documentElement): void => {
  root.style.removeProperty("--sd-bg-position-x");
  root.style.removeProperty("--sd-bg-position-y");
  root.style.removeProperty("--sd-scrim");
};

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });

/*
 * Resolves on the TRANSACTION, not on the request.
 *
 * A successful `put` request only means IndexedDB accepted the write, not that
 * it kept it: the transaction can still abort afterwards, most plausibly on a
 * storage quota, and the bytes are then gone. Resolving on request success
 * reported those saves as successful, and `saveBackdrop` went on to write the
 * localStorage flag claiming an image was set - leaving the boot path looking
 * for a blob that was never committed, which reads as a backdrop that silently
 * reverts. `oncomplete` is the only event that means durable.
 *
 * Same shape as `txDone` in `src/items/texturePack.ts`, for the same reason.
 */
const tx = <T>(db: IDBDatabase, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    req.onerror = () => reject(req.error ?? new Error("indexedDB request failed"));
    t.oncomplete = () => resolve(req.result);
    t.onabort = t.onerror = () => reject(t.error ?? new Error("indexedDB transaction failed"));
  });

export const readBackdropFlag = (): BackdropFlag | null => {
  try {
    const raw = localStorage.getItem(BACKDROP_FLAG_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || (parsed as { v?: unknown }).v !== 1) return null;
    return parsed as BackdropFlag;
  } catch {
    return null;
  }
};

/**
 * The stored image as an object URL, or null when none is set (or the blob is
 * gone while the flag survived, which reads as "none" rather than an error).
 * The caller owns the URL's lifetime.
 */
export const loadBackdropUrl = async (): Promise<string | null> => {
  if (readBackdropFlag() === null) return null;
  try {
    const db = await openDb();
    const blob = await tx<Blob | undefined>(db, "readonly", (store) => store.get(KEY) as IDBRequest<Blob | undefined>);
    db.close();
    return blob instanceof Blob ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
};

export const saveBackdrop = async (file: File): Promise<void> => {
  if (!file.type.startsWith("image/")) throw new Error("That file is not an image.");
  if (file.size > MAX_BACKDROP_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 12 MB.`);
  }
  const db = await openDb();
  try {
    // Throws if the transaction aborts, which skips the flag write below on
    // purpose: the flag is a claim that bytes exist, and it must not outlive
    // the bytes.
    await tx(db, "readwrite", (store) => store.put(file, KEY));
  } finally {
    db.close();
  }
  const flag: BackdropFlag = { v: 1, name: file.name, size: file.size, type: file.type };
  try {
    localStorage.setItem(BACKDROP_FLAG_KEY, JSON.stringify(flag));
  } catch {
    // The image is committed; only the cheap boot-path hint failed to persist.
    // The next save rewrites it, and until then the backdrop is simply not
    // restored on reload rather than half-restored.
  }
  window.dispatchEvent(new Event(BACKDROP_UPDATED_EVENT));
};

export const clearBackdrop = async (): Promise<void> => {
  try {
    const db = await openDb();
    await tx(db, "readwrite", (store) => store.delete(KEY));
    db.close();
  } catch {
    /* The flag is the authority; a failed delete leaves orphan bytes that the
       next save overwrites. */
  }
  localStorage.removeItem(BACKDROP_FLAG_KEY);
  window.dispatchEvent(new Event(BACKDROP_UPDATED_EVENT));
};
