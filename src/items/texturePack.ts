import { ensureTextureDatabaseMigration } from "../storage/migrateTextureDatabase";
import {
  packKeyCandidates,
  type PackCounts,
  type PackTextureFrame,
  type ParsedPack,
} from "./texturePackParse";

/**
 * The user's local texture-pack stack.
 *
 * Packs are parsed in the browser, stored in IndexedDB and exposed to item
 * icons through object URLs. No archive or texture leaves the visitor's own
 * browser. The stack is ordered highest priority first; a disabled pack stays
 * saved but contributes nothing until it is enabled again.
 *
 * Version 2 adds `packs` and `pack-textures` stores beside the version 1
 * singleton stores. Hydration migrates that singleton into an enabled
 * priority-1 entry, then clears the legacy records so an existing visitor does
 * not carry two copies of the same art.
 */

const DB_NAME = "skydex-texturepack";
const DB_VERSION = 2;
const LEGACY_TEXTURES = "textures";
const LEGACY_META = "meta";
const STORE_PACKS = "packs";
const STORE_PACK_TEXTURES = "pack-textures";
const PACK_ID_INDEX = "packId";

/**
 * A tiny localStorage pointer, never texture data. Its spelling is frozen for
 * compatibility; presence means the IndexedDB stack should be hydrated.
 */
export const PACK_FLAG_KEY = "skydex.texturepack.v1";

/** The original public manifest shape, retained for existing readers. */
export interface PackManifest {
  name: string;
  description: string | null;
  counts: PackCounts;
  loadedAt: number;
}

/** One saved pack plus the controls that place it in the stack. */
export interface TexturePackEntry extends PackManifest {
  id: string;
  enabled: boolean;
  /** Zero is highest priority. */
  priority: number;
}

const plainManifest = (entry: PackManifest): PackManifest => ({
  name: entry.name,
  description: entry.description,
  counts: entry.counts,
  loadedAt: entry.loadedAt,
});

interface TextureRecord {
  key: string;
  data: Uint8Array;
  path: string;
  source: "catharsis" | "hypixel" | "vanilla";
  frame?: PackTextureFrame;
}

interface StackTextureRecord extends TextureRecord {
  packId: string;
}

interface PackMemory {
  manifest: TexturePackEntry;
  blobs: Map<string, Blob>;
  frames: Map<string, PackTextureFrame>;
  urls: Map<string, string>;
  urlFrames: Map<string, PackTextureFrame>;
}

/* -------------------------------------------------------------------------- */
/* Store state                                                                */
/* -------------------------------------------------------------------------- */

let packs: PackMemory[] = [];
/** Dev/private official-pack baseline. Every enabled user pack wins over it. */
let runtimeBlobs: Map<string, Blob> | null = null;
const runtimeUrls = new Map<string, string>();
let runtimeFrames = new Map<string, PackTextureFrame>();
const runtimeUrlFrames = new Map<string, PackTextureFrame>();
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
let version = 0;
const listeners = new Set<() => void>();

const notify = (): void => {
  version++;
  for (const listener of listeners) listener();
};

const revokePack = (pack: PackMemory): void => {
  for (const url of pack.urls.values()) URL.revokeObjectURL(url);
  pack.urls.clear();
  pack.urlFrames.clear();
};

const revokeAll = (): void => {
  for (const pack of packs) revokePack(pack);
};

const revokeRuntime = (): void => {
  for (const url of runtimeUrls.values()) URL.revokeObjectURL(url);
  runtimeUrls.clear();
  runtimeUrlFrames.clear();
};

const readFlag = (): boolean => {
  try {
    return localStorage.getItem(PACK_FLAG_KEY) !== null;
  } catch {
    return false;
  }
};

const writeFlag = (entries: readonly TexturePackEntry[]): void => {
  try {
    if (entries.length === 0) {
      localStorage.removeItem(PACK_FLAG_KEY);
      return;
    }
    localStorage.setItem(
      PACK_FLAG_KEY,
      JSON.stringify({
        count: entries.length,
        packs: entries.map(({ id, name, enabled, priority, counts, loadedAt }) => ({
          id,
          name,
          enabled,
          priority,
          recognised: counts.recognised,
          loadedAt,
        })),
      }),
    );
  } catch {
    // IndexedDB remains authoritative; the pointer only controls next boot.
  }
};

/* -------------------------------------------------------------------------- */
/* IndexedDB                                                                  */
/* -------------------------------------------------------------------------- */

const openDb = (): Promise<IDBDatabase> =>
  ensureTextureDatabaseMigration().then(() => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      // Keep the old stores long enough to migrate a version 1 singleton.
      if (!db.objectStoreNames.contains(LEGACY_TEXTURES)) {
        db.createObjectStore(LEGACY_TEXTURES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(LEGACY_META)) {
        db.createObjectStore(LEGACY_META, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PACKS)) {
        db.createObjectStore(STORE_PACKS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_PACK_TEXTURES)) {
        const textureStore = db.createObjectStore(STORE_PACK_TEXTURES, {
          keyPath: ["packId", "key"],
        });
        textureStore.createIndex(PACK_ID_INDEX, "packId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("indexedDB open failed"));
  }));

const txDone = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("indexedDB transaction failed"));
  });

const readAll = <T>(db: IDBDatabase, store: string): Promise<T[]> =>
  new Promise((resolve, reject) => {
    const request = db.transaction(store, "readonly").objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error("indexedDB read failed"));
  });

const deletePackTextures = (store: IDBObjectStore, packId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const request = store.index(PACK_ID_INDEX).openCursor(IDBKeyRange.only(packId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("indexedDB delete failed"));
  });

const deleteDatabase = (): Promise<void> =>
  new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });

const normaliseEntries = (stored: TexturePackEntry[]): TexturePackEntry[] =>
  stored
    .filter(
      (entry) =>
        typeof entry?.id === "string" &&
        typeof entry.name === "string" &&
        typeof entry.loadedAt === "number" &&
        typeof entry.counts === "object" &&
        entry.counts !== null,
    )
    .sort((a, b) => (Number.isFinite(a.priority) ? a.priority : 0) - (Number.isFinite(b.priority) ? b.priority : 0))
    .map((entry, priority) => ({
      ...entry,
      enabled: entry.enabled !== false,
      priority,
    }));

const memoryFromRecords = (
  manifest: TexturePackEntry,
  records: readonly StackTextureRecord[],
): PackMemory => {
  const blobs = new Map<string, Blob>();
  const frames = new Map<string, PackTextureFrame>();
  for (const record of records) {
    if (record.packId !== manifest.id || !record.key || !record.data) continue;
    blobs.set(record.key, new Blob([record.data as BlobPart], { type: "image/png" }));
    if (record.frame) frames.set(record.key, record.frame);
  }
  return { manifest, blobs, frames, urls: new Map(), urlFrames: new Map() };
};

const migrateLegacy = async (
  db: IDBDatabase,
  manifest: TexturePackEntry,
  records: readonly TextureRecord[],
): Promise<void> => {
  const transaction = db.transaction(
    [STORE_PACKS, STORE_PACK_TEXTURES, LEGACY_TEXTURES, LEGACY_META],
    "readwrite",
  );
  const complete = txDone(transaction);
  transaction.objectStore(STORE_PACKS).put(manifest);
  const textureStore = transaction.objectStore(STORE_PACK_TEXTURES);
  for (const record of records) textureStore.put({ ...record, packId: manifest.id } satisfies StackTextureRecord);
  transaction.objectStore(LEGACY_TEXTURES).clear();
  transaction.objectStore(LEGACY_META).clear();
  await complete;
};

/** Hydrate once. A missing flag keeps the no-pack path out of IndexedDB. */
const hydrate = (): Promise<void> => {
  if (hydrated) return Promise.resolve();
  if (hydrationPromise) return hydrationPromise;
  if (typeof indexedDB === "undefined" || !readFlag()) {
    hydrated = true;
    return Promise.resolve();
  }

  hydrationPromise = (async () => {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
      let entries = normaliseEntries(await readAll<TexturePackEntry>(db, STORE_PACKS));
      let records = await readAll<StackTextureRecord>(db, STORE_PACK_TEXTURES);

      if (entries.length === 0) {
        const [legacyRecords, legacyMetas] = await Promise.all([
          readAll<TextureRecord>(db, LEGACY_TEXTURES),
          readAll<{ id: string } & PackManifest>(db, LEGACY_META),
        ]);
        const legacy = legacyMetas.find((candidate) => candidate.id === "manifest");
        if (legacy) {
          const base = plainManifest(legacy);
          const migrated: TexturePackEntry = {
            ...base,
            id: `legacy-${base.loadedAt}`,
            enabled: true,
            priority: 0,
          };
          await migrateLegacy(db, migrated, legacyRecords);
          entries = [migrated];
          records = legacyRecords.map((record) => ({ ...record, packId: migrated.id }));
        }
      }

      packs = entries.map((entry) => memoryFromRecords(entry, records));
      writeFlag(entries);
    } catch {
      // The wiki image ladder remains the complete fallback for this session.
      packs = [];
    } finally {
      db?.close();
      hydrated = true;
      hydrationPromise = null;
      notify();
    }
  })();

  return hydrationPromise;
};

/* -------------------------------------------------------------------------- */
/* Lookup                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Resolve by PACK priority first, then by the item's stable key candidates.
 * This ordering is load-bearing: a high-priority pack's name fallback must
 * beat a lower-priority pack's exact-id match, otherwise the priority control
 * would lie whenever two formats identify the same item differently.
 */
export const packTextureSrc = (
  id?: string | null,
  name?: string | null,
  itemModel?: string | null,
): string | undefined => {
  const candidates = packKeyCandidates(id, name, itemModel);
  for (const pack of packs) {
    if (!pack.manifest.enabled) continue;
    for (const key of candidates) {
      const blob = pack.blobs.get(key);
      if (!blob) continue;
      let url = pack.urls.get(key);
      if (!url) {
        url = URL.createObjectURL(blob);
        pack.urls.set(key, url);
        const frame = pack.frames.get(key);
        if (frame) pack.urlFrames.set(url, frame);
      }
      return url;
    }
  }

  for (const key of candidates) {
    const blob = runtimeBlobs?.get(key);
    if (!blob) continue;
    let url = runtimeUrls.get(key);
    if (!url) {
      url = URL.createObjectURL(blob);
      runtimeUrls.set(key, url);
      const frame = runtimeFrames.get(key);
      if (frame) runtimeUrlFrames.set(url, frame);
    }
    return url;
  }
  return undefined;
};

export const packTextureFrame = (src: string): PackTextureFrame | undefined => {
  for (const pack of packs) {
    const frame = pack.urlFrames.get(src);
    if (frame) return frame;
  }
  return runtimeUrlFrames.get(src);
};

/** Backwards-compatible view of the current highest-priority pack. */
export const packManifest = (): PackManifest | null => {
  const entry = packs[0]?.manifest;
  return entry ? plainManifest(entry) : null;
};

/** Ordered highest priority first. Returned objects cannot mutate the store. */
export const texturePackEntries = (): TexturePackEntry[] =>
  packs.map(({ manifest }) => ({ ...manifest }));

/** Total enabled textures before conflict resolution. */
export const packTextureCount = (): number =>
  packs.reduce((total, pack) => total + (pack.manifest.enabled ? pack.blobs.size : 0), 0);

/* -------------------------------------------------------------------------- */
/* Mutations                                                                  */
/* -------------------------------------------------------------------------- */

const tight = (bytes: Uint8Array): Uint8Array =>
  bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes : bytes.slice();

const createPackId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `pack-${crypto.randomUUID()}`;
  return `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

/** Add a pack at priority 1 without replacing any pack already saved. */
export const adoptTexturePack = async (parsed: ParsedPack, fileName: string): Promise<PackManifest> => {
  await hydrate();
  const entry: TexturePackEntry = {
    id: createPackId(),
    name: fileName,
    description: parsed.description,
    counts: parsed.counts,
    loadedAt: Date.now(),
    enabled: true,
    priority: 0,
  };
  const existing = packs.map((pack, index) => ({
    ...pack,
    manifest: { ...pack.manifest, priority: index + 1 },
  }));

  const db = await openDb();
  try {
    const transaction = db.transaction([STORE_PACKS, STORE_PACK_TEXTURES], "readwrite");
    const complete = txDone(transaction);
    const packStore = transaction.objectStore(STORE_PACKS);
    packStore.put(entry);
    for (const pack of existing) packStore.put(pack.manifest);
    const textureStore = transaction.objectStore(STORE_PACK_TEXTURES);
    for (const [key, texture] of parsed.textures) {
      textureStore.put({
        packId: entry.id,
        key,
        data: tight(texture.data),
        path: texture.path,
        source: texture.source,
        frame: texture.frame,
      } satisfies StackTextureRecord);
    }
    await complete;
  } finally {
    db.close();
  }

  const records: StackTextureRecord[] = [...parsed.textures].map(([key, texture]) => ({
    packId: entry.id,
    key,
    data: texture.data,
    path: texture.path,
    source: texture.source,
    frame: texture.frame,
  }));
  packs = [memoryFromRecords(entry, records), ...existing];
  writeFlag(texturePackEntries());
  notify();

  return plainManifest(entry);
};

export const setTexturePackEnabled = async (id: string, enabled: boolean): Promise<void> => {
  await hydrate();
  const index = packs.findIndex((pack) => pack.manifest.id === id);
  if (index === -1 || packs[index].manifest.enabled === enabled) return;
  const next = { ...packs[index].manifest, enabled };

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_PACKS, "readwrite");
    const complete = txDone(transaction);
    transaction.objectStore(STORE_PACKS).put(next);
    await complete;
  } finally {
    db.close();
  }

  packs = packs.map((pack, position) =>
    position === index ? { ...pack, manifest: next } : pack,
  );
  writeFlag(texturePackEntries());
  notify();
};

/** Move one place: -1 raises priority, +1 lowers it. */
export const moveTexturePack = async (id: string, direction: -1 | 1): Promise<void> => {
  await hydrate();
  const index = packs.findIndex((pack) => pack.manifest.id === id);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= packs.length) return;

  const reordered = [...packs];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const next = reordered.map((pack, priority) => ({
    ...pack,
    manifest: { ...pack.manifest, priority },
  }));

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_PACKS, "readwrite");
    const complete = txDone(transaction);
    const store = transaction.objectStore(STORE_PACKS);
    for (const pack of next) store.put(pack.manifest);
    await complete;
  } finally {
    db.close();
  }

  packs = next;
  writeFlag(texturePackEntries());
  notify();
};

/** Remove one pack. Calling without an id preserves the old remove-all API. */
export const removeTexturePack = async (id?: string): Promise<void> => {
  await hydrate();
  if (id === undefined) {
    writeFlag([]);
    revokeAll();
    packs = [];
    hydrated = true;
    notify();
    await deleteDatabase();
    return;
  }

  const removed = packs.find((pack) => pack.manifest.id === id);
  if (!removed) return;
  const remaining = packs
    .filter((pack) => pack !== removed)
    .map((pack, priority) => ({ ...pack, manifest: { ...pack.manifest, priority } }));

  const db = await openDb();
  try {
    const transaction = db.transaction([STORE_PACKS, STORE_PACK_TEXTURES], "readwrite");
    const complete = txDone(transaction);
    const packStore = transaction.objectStore(STORE_PACKS);
    packStore.delete(id);
    for (const pack of remaining) packStore.put(pack.manifest);
    await deletePackTextures(transaction.objectStore(STORE_PACK_TEXTURES), id);
    await complete;
  } finally {
    db.close();
  }

  revokePack(removed);
  packs = remaining;
  writeFlag(texturePackEntries());
  notify();
  if (packs.length === 0) await deleteDatabase();
};

/** Same-session baseline without touching the user's saved stack. */
export const adoptRuntimeTexturePack = (parsed: ParsedPack): void => {
  revokeRuntime();
  const next = new Map<string, Blob>();
  const nextFrames = new Map<string, PackTextureFrame>();
  for (const [key, texture] of parsed.textures) {
    next.set(key, new Blob([texture.data as BlobPart], { type: "image/png" }));
    if (texture.frame) nextFrames.set(key, texture.frame);
  }
  runtimeBlobs = next;
  runtimeFrames = nextFrames;
  notify();
};

/** Subscribing is the only action that starts hydration. */
export const subscribeTexturePack = (listener: () => void): (() => void) => {
  listeners.add(listener);
  void hydrate();
  return () => listeners.delete(listener);
};

export const texturePackVersion = (): number => version;

const EMPTY_COUNTS: PackCounts = {
  files: 0,
  recognised: 0,
  catharsis: 0,
  hypixel: 0,
  vanilla: 0,
  unresolved: 0,
  special: 0,
  ignored: 0,
  ignoredClasses: [],
};

/** Existing single-pack test seam. */
export const __setTexturePackForTests = (
  seed?: Map<string, Blob>,
  manifest?: PackManifest | null,
  seedFrames?: Map<string, PackTextureFrame>,
): void => {
  revokeAll();
  revokeRuntime();
  packs = seed
    ? [
        {
          manifest: {
            id: "test-pack",
            name: manifest?.name ?? "Test pack",
            description: manifest?.description ?? null,
            counts: manifest?.counts ?? EMPTY_COUNTS,
            loadedAt: manifest?.loadedAt ?? 0,
            enabled: true,
            priority: 0,
          },
          blobs: seed,
          frames: seedFrames ?? new Map(),
          urls: new Map(),
          urlFrames: new Map(),
        },
      ]
    : [];
  runtimeBlobs = null;
  runtimeFrames = new Map();
  hydrated = true;
  hydrationPromise = null;
  version++;
};

export interface TexturePackTestSeed {
  manifest: TexturePackEntry;
  textures: Map<string, Blob>;
  frames?: Map<string, PackTextureFrame>;
}

/** Multi-pack test seam. Not used by the app. */
export const __setTexturePackStackForTests = (seeds: readonly TexturePackTestSeed[]): void => {
  revokeAll();
  revokeRuntime();
  packs = [...seeds]
    .sort((a, b) => a.manifest.priority - b.manifest.priority)
    .map(({ manifest, textures, frames }, priority) => ({
      manifest: { ...manifest, priority },
      blobs: textures,
      frames: frames ?? new Map(),
      urls: new Map(),
      urlFrames: new Map(),
    }));
  runtimeBlobs = null;
  runtimeFrames = new Map();
  hydrated = true;
  hydrationPromise = null;
  version++;
};
