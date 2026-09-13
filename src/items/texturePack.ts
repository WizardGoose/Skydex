import { ensureTextureDatabaseMigration } from "../storage/migrateTextureDatabase";
import { packKeyCandidates, type PackCounts, type ParsedPack } from "./texturePackParse";

/**
 * The loaded texture pack: storage, hydration, and the one lookup ItemIcon
 * makes.
 *
 * USER-SIDE CACHING, WHICH IS THE WHOLE DESIGN
 * ---------------------------------------------
 * A custom texture pack is cached on the user's side, violating nothing.
 * The pack lives in the visitor's own browser and nowhere else:
 * parsed client-side (texturePackParse.ts), stored in this site's own
 * IndexedDB database, served back to <img> tags as object URLs. Nothing is
 * uploaded, nothing is redistributed, and removing the pack removes every
 * byte of it.
 *
 * WHY INDEXEDDB AND NOT LOCALSTORAGE
 * ----------------------------------
 * A pack's textures run to tens of megabytes, which localStorage cannot
 * hold and this codebase's storage rules would not allow it to anyway.
 * IndexedDB is the browser's store for exactly this: binary blobs, its own
 * database under this site's namespace ("skydex-texturepack"), touching
 * nothing else. localStorage carries exactly ONE tiny key,
 * `skydex.texturepack.v1`, a manifest pointer whose real job is the
 * no-pack fast path: when it is absent, this module never opens IndexedDB
 * at all, so a visitor who never loaded a pack pays nothing - not even a
 * database creation - and the site behaves byte-identically to before this
 * feature existed. The key is never enumerated alongside others and holds
 * no texture data, per the house storage rules.
 *
 * SCHEMA
 * ------
 * Database "skydex-texturepack", version 1, two object stores:
 *
 *   textures   keyPath "key"; { key, data: Uint8Array, path, source }
 *              one record per recognised item texture
 *   meta       keyPath "id"; a single record id "manifest" carrying
 *              { name, description, counts, loadedAt }
 *
 * A schema change bumps DB_VERSION and rebuilds in onupgradeneeded; the
 * stores hold only a derived copy of the user's own zip, so a rebuild costs
 * one re-upload at worst.
 *
 * THE LOOKUP CONTRACT
 * -------------------
 * `packTextureSrc` is synchronous over an in-memory map hydrated once from
 * IndexedDB, because ItemIcon decides its source during render and cannot
 * await. Before hydration lands it answers undefined, which ItemIcon reads
 * as "the pack has nothing", falls through to the wiki ladder, and then
 * re-renders when the hydration notify fires - the same arrival shape as
 * the item resource. Object URLs are created lazily, one per key on first
 * ask, and revoked when the pack is removed or replaced.
 */

const DB_NAME = "skydex-texturepack";
const DB_VERSION = 1;
const STORE_TEXTURES = "textures";
const STORE_META = "meta";

/**
 * The one localStorage key this module owns. A tiny manifest pointer, never
 * texture data; absent means "no pack, never open the database".
 */
export const PACK_FLAG_KEY = "skydex.texturepack.v1";

export interface PackManifest {
  /** The zip's file name, which is the only name the user actually chose. */
  name: string;
  /** pack.mcmeta description, flattened, or null. */
  description: string | null;
  counts: PackCounts;
  loadedAt: number;
}

interface TextureRecord {
  key: string;
  data: Uint8Array;
  path: string;
  source: "catharsis" | "vanilla";
}

/* -------------------------------------------------------------------------- */
/* Store state                                                                */
/* -------------------------------------------------------------------------- */

let blobs: Map<string, Blob> | null = null;
let urls = new Map<string, string>();
let manifest: PackManifest | null = null;
let hydrating = false;
let hydratedFlag = false;
let version = 0;
const listeners = new Set<() => void>();

const notify = () => {
  version++;
  for (const fn of listeners) fn();
};

const readFlag = (): boolean => {
  try {
    return localStorage.getItem(PACK_FLAG_KEY) !== null;
  } catch {
    // No storage (tests, private mode): no flag, no pack, no database.
    return false;
  }
};

const writeFlag = (m: PackManifest | null) => {
  try {
    if (m === null) localStorage.removeItem(PACK_FLAG_KEY);
    else localStorage.setItem(PACK_FLAG_KEY, JSON.stringify({ name: m.name, recognised: m.counts.recognised, loadedAt: m.loadedAt }));
  } catch {
    // Optional pointer. The IndexedDB copy is the real one; losing the flag
    // only means the next visit does not hydrate until a pack is loaded again.
  }
};

/* -------------------------------------------------------------------------- */
/* IndexedDB plumbing, promisified just enough                                */
/* -------------------------------------------------------------------------- */

const openDb = (): Promise<IDBDatabase> =>
  ensureTextureDatabaseMigration().then(() => new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      // Version 1 creates both stores; a future version bump rebuilds here.
      if (!db.objectStoreNames.contains(STORE_TEXTURES)) db.createObjectStore(STORE_TEXTURES, { keyPath: "key" });
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  }));

const txDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("indexedDB transaction failed"));
  });

const readAll = <T>(db: IDBDatabase, store: string): Promise<T[]> =>
  new Promise((resolve, reject) => {
    const req = db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error("indexedDB read failed"));
  });

/* -------------------------------------------------------------------------- */
/* Hydration                                                                  */
/* -------------------------------------------------------------------------- */

const revokeAll = () => {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls = new Map();
};

/**
 * Load the stored pack into memory, once, and only when the flag says there
 * is one. Fired from the subscribe path (an effect, never render), so the
 * notify on landing is safe. A failed hydration leaves the site exactly as
 * it is without a pack, which is a working site.
 */
const hydrate = (): void => {
  if (hydratedFlag || hydrating || typeof indexedDB === "undefined") return;
  if (!readFlag()) {
    hydratedFlag = true;
    return;
  }
  hydrating = true;

  openDb()
    .then(async (db) => {
      const [records, metas] = await Promise.all([
        readAll<TextureRecord>(db, STORE_TEXTURES),
        readAll<{ id: string } & PackManifest>(db, STORE_META),
      ]);
      db.close();

      const map = new Map<string, Blob>();
      for (const r of records) {
        if (r?.key && r?.data) map.set(r.key, new Blob([r.data as BlobPart], { type: "image/png" }));
      }
      blobs = map;
      manifest = metas.find((m) => m.id === "manifest") ?? null;
      hydratedFlag = true;
      hydrating = false;
      // A manifest with zero textures is still a state the Settings page
      // must be able to show honestly, so the notify fires for either.
      if (map.size || manifest) notify();
    })
    .catch(() => {
      // A blocked or broken database serves no textures this session. The
      // wiki ladder is untouched, so every icon still resolves as it did
      // before this feature existed.
      hydratedFlag = true;
      hydrating = false;
    });
};

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The pack's texture for this item, as an object URL, or undefined.
 *
 * Synchronous by contract (ItemIcon reads it during render), so it answers
 * from the in-memory map only. Key order is the matching rule: the hypixel
 * id first, the display name second - see `packKeyCandidates`.
 */
export const packTextureSrc = (id?: string | null, name?: string | null): string | undefined => {
  if (!blobs || blobs.size === 0) return undefined;
  for (const key of packKeyCandidates(id, name)) {
    const blob = blobs.get(key);
    if (!blob) continue;
    let url = urls.get(key);
    if (!url) {
      url = URL.createObjectURL(blob);
      urls.set(key, url);
    }
    return url;
  }
  return undefined;
};

/** The manifest of the loaded pack, for the Settings summary. Null when none. */
export const packManifest = (): PackManifest | null => manifest;

/** How many textures are usable right now (0 until hydration lands). */
export const packTextureCount = (): number => blobs?.size ?? 0;

/**
 * Adopt a freshly parsed pack: replace the stored one, publish to memory.
 *
 * The write is clear-then-put in one transaction per store, so a failed
 * write cannot leave half of the old pack under the new manifest. Memory is
 * updated only after the transaction completes; until then the old pack
 * keeps serving, which is the honest state of the store.
 */
export const adoptTexturePack = async (parsed: ParsedPack, fileName: string): Promise<PackManifest> => {
  const next: PackManifest = {
    name: fileName,
    description: parsed.description,
    counts: parsed.counts,
    loadedAt: Date.now(),
  };

  /*
   * Tight copies, not views. The parser hands back subarray views over the
   * whole archive where a file was stored uncompressed (the .cats raw
   * case), and IndexedDB's structured clone serialises a typed array's
   * ENTIRE backing buffer, not the window the view shows. Writing the view
   * of a 16x16 icon would store the whole multi-megabyte archive with it,
   * once per record. `slice()` copies exactly the bytes the texture is.
   */
  const tight = (u: Uint8Array): Uint8Array =>
    u.byteOffset === 0 && u.byteLength === u.buffer.byteLength ? u : u.slice();

  const db = await openDb();
  try {
    const tx = db.transaction([STORE_TEXTURES, STORE_META], "readwrite");
    const texStore = tx.objectStore(STORE_TEXTURES);
    texStore.clear();
    for (const [key, tex] of parsed.textures) {
      texStore.put({ key, data: tight(tex.data), path: tex.path, source: tex.source } satisfies TextureRecord);
    }
    const metaStore = tx.objectStore(STORE_META);
    metaStore.clear();
    metaStore.put({ id: "manifest", ...next });
    await txDone(tx);
  } finally {
    db.close();
  }

  revokeAll();
  const map = new Map<string, Blob>();
  for (const [key, tex] of parsed.textures) map.set(key, new Blob([tex.data as BlobPart], { type: "image/png" }));
  blobs = map;
  manifest = next;
  hydratedFlag = true;
  writeFlag(next);
  notify();
  return next;
};

/**
 * Remove the pack outright: both stores emptied, the flag gone, every
 * object URL revoked. The database itself is deleted rather than left
 * empty, so a visitor who tried the feature once is not carrying an empty
 * database around forever.
 */
export const removeTexturePack = async (): Promise<void> => {
  writeFlag(null);
  revokeAll();
  blobs = null;
  manifest = null;
  hydratedFlag = true;
  notify();

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    // Blocked (another tab holding a connection) still resolves: the flag
    // is already gone, so nothing will hydrate from the leftover database
    // and the next adopt overwrites it wholesale.
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
};

/** Re-render hook for React. Subscribing is what kicks hydration. */
export const subscribeTexturePack = (fn: () => void): (() => void) => {
  listeners.add(fn);
  hydrate();
  return () => {
    listeners.delete(fn);
  };
};

export const texturePackVersion = (): number => version;

/** Test seam. Not used by the app. */
export const __setTexturePackForTests = (seed?: Map<string, Blob>, m?: PackManifest | null) => {
  revokeAll();
  blobs = seed ?? null;
  manifest = m ?? null;
  hydratedFlag = true;
  hydrating = false;
  version++;
};
