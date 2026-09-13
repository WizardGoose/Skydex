/**
 * The last successfully parsed Hypixel profile, kept in this browser only.
 *
 * A page refresh should not be a new authenticated API request. The decoded
 * profile is substantially larger than a preference, so it belongs in
 * IndexedDB rather than localStorage. One record is kept: changing account,
 * profile, or credential changes the non-secret identity fingerprint and the
 * old record is ignored until the next successful pull replaces it.
 *
 * The raw API key is never accepted by this module and therefore cannot be
 * written accidentally. `identity` is the short fingerprint produced by
 * `identityTokenForAccess`.
 */

const DB_NAME = "skydex-profile-snapshot";
const DB_VERSION = 1;
const STORE = "snapshots";
const RECORD_KEY = "latest";
const STORAGE_OPERATION_TIMEOUT_MS = 1_500;

export const PROFILE_SNAPSHOT_TTL_MS = 5 * 60 * 1000;

export interface CacheableProfileSnapshot {
  identity: string;
  fetchedAt: number;
}

interface StoredProfileSnapshot<T extends CacheableProfileSnapshot> {
  key: typeof RECORD_KEY;
  version: 2;
  identity: string;
  fetchedAt: number;
  value: T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Pure record guard, exported so the cache boundary can be pinned in tests. */
export const profileSnapshotValue = <T extends CacheableProfileSnapshot>(
  stored: unknown,
  identity: string,
): T | null => {
  // Shape 1 was written after sack counters at zero had already been removed,
  // so it cannot distinguish an empty sack item from an unknown one. Reject it
  // once and let the ordinary profile load replace it with the lossless shape.
  if (!isRecord(stored) || stored.version !== 2 || stored.identity !== identity) return null;
  if (typeof stored.fetchedAt !== "number" || !Number.isFinite(stored.fetchedAt)) return null;
  if (!isRecord(stored.value)) return null;
  const value = stored.value as unknown as T;
  if (value.identity !== identity || value.fetchedAt !== stored.fetchedAt) return null;
  return value;
};

export const profileSnapshotIsFresh = (
  snapshot: CacheableProfileSnapshot | null,
  now = Date.now(),
): boolean => snapshot !== null && now - snapshot.fetchedAt < PROFILE_SNAPSHOT_TTL_MS;

const openDb = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    let settled = false;
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    const deadline = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("profile snapshot database timed out"));
    }, STORAGE_OPERATION_TIMEOUT_MS);
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      reject(error);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onsuccess = () => {
      // A timed-out open may still complete later. Close that orphaned handle
      // instead of keeping the database alive after the live request moved on.
      if (settled) {
        request.result.close();
        return;
      }
      settled = true;
      clearTimeout(deadline);
      resolve(request.result);
    };
    request.onerror = () => fail(request.error ?? new Error("profile snapshot database could not open"));
    request.onblocked = () => fail(new Error("profile snapshot database was blocked"));
  });

const requestInStore = <T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;
  const transaction = db.transaction(STORE, mode);
  const request = run(transaction.objectStore(STORE));
  const deadline = setTimeout(() => {
    if (settled) return;
    settled = true;
    try {
      transaction.abort();
    } catch {
      // It may have completed between the timeout and abort. Either way the
      // optional cache has already yielded to the live request.
    }
    reject(new Error("profile snapshot transaction timed out"));
  }, STORAGE_OPERATION_TIMEOUT_MS);
  const fail = (error: Error): void => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    reject(error);
  };
  request.onerror = () => fail(request.error ?? new Error("profile snapshot request failed"));
  transaction.oncomplete = () => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    resolve(request.result);
  };
  transaction.onabort = transaction.onerror = () => fail(
    transaction.error ?? new Error("profile snapshot transaction failed"),
  );
});

/** Read the matching last-good profile. Storage failure is a cache miss. */
export const readProfileSnapshot = async <T extends CacheableProfileSnapshot>(
  identity: string,
): Promise<T | null> => {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    try {
      const stored = await requestInStore<unknown>(db, "readonly", (store) => store.get(RECORD_KEY));
      return profileSnapshotValue<T>(stored, identity);
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
};

/** Replace the one local snapshot. A quota failure never breaks the live view. */
export const writeProfileSnapshot = async <T extends CacheableProfileSnapshot>(value: T): Promise<void> => {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    await requestInStore(db, "readwrite", (store) => store.put({
      key: RECORD_KEY,
      version: 2,
      identity: value.identity,
      fetchedAt: value.fetchedAt,
      value,
    } satisfies StoredProfileSnapshot<T>));
  } finally {
    db.close();
  }
};
