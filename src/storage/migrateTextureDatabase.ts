/** Copy the retired database before allowing any writes to the current one. */
const LEGACY_DATABASE = "skyindex-texturepack";
const CURRENT_DATABASE = "skydex-texturepack";
let migration: Promise<void> | undefined;

function openExisting(factory: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const request = factory.open(name);
    request.onupgradeneeded = () => {
      absent = true;
      request.transaction!.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => absent ? resolve(null) : reject(request.error);
  });
}

async function copyDatabase(source: IDBDatabase, factory: IDBFactory, name: string): Promise<void> {
  const names = Array.from(source.objectStoreNames);
  const stores = await Promise.all(names.map(storeName => new Promise<{
    name: string; keyPath: string | string[] | null; autoIncrement: boolean;
    indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[];
    keys: IDBValidKey[]; values: unknown[];
  }>((resolve, reject) => {
    const transaction = source.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const keys = store.getAllKeys();
    const values = store.getAll();
    const indexes = Array.from(store.indexNames, indexName => {
      const index = store.index(indexName);
      return { name: index.name, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
    });
    transaction.oncomplete = () => resolve({ name: storeName, keyPath: store.keyPath,
      autoIncrement: store.autoIncrement, indexes, keys: keys.result, values: values.result });
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  })));
  const target = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(name, source.version);
    request.onupgradeneeded = () => {
      for (const spec of stores) {
        const store = request.result.createObjectStore(spec.name,
          { keyPath: spec.keyPath, autoIncrement: spec.autoIncrement });
        for (const index of spec.indexes) store.createIndex(index.name, index.keyPath,
          { unique: index.unique, multiEntry: index.multiEntry });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  let committed = false;
  try {
    if (names.length === 0) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = target.transaction(names, "readwrite");
      for (const spec of stores) {
        const store = transaction.objectStore(spec.name);
        spec.values.forEach((value, i) => spec.keyPath === null
          ? store.put(value, spec.keys[i]) : store.put(value));
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
    committed = true;
  } finally {
    target.close();
    if (!committed && names.length !== 0) {
      // An interrupted first copy must not masquerade as a newer saved stack.
      await new Promise<void>((resolve, reject) => {
        const request = factory.deleteDatabase(name);
        request.onsuccess = () => resolve();
        request.onerror = request.onblocked = () => reject(new Error("Could not roll back texture migration"));
      });
    }
  }
}

export async function migrateTextureDatabase(factory: IDBFactory = indexedDB): Promise<void> {
  const source = await openExisting(factory, LEGACY_DATABASE);
  if (!source) return;
  try {
    const current = await openExisting(factory, CURRENT_DATABASE);
    if (current) {
      current.close();
      // Never replace a newer pack stack. Preserve the entire older database.
      await copyDatabase(source, factory, `${CURRENT_DATABASE}-migration-backup-${crypto.randomUUID()}`);
    } else {
      await copyDatabase(source, factory, CURRENT_DATABASE);
    }
  } finally { source.close(); }
  // Only a committed copy permits removal. Another open tab may defer deletion.
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(LEGACY_DATABASE);
    request.onsuccess = request.onblocked = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function ensureTextureDatabaseMigration(): Promise<void> {
  return migration ??= migrateTextureDatabase().catch(error => {
    migration = undefined;
    throw error;
  });
}
