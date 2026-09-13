/** Retired names are read only during migration; all new keys use Skydex. */
const LEGACY_PREFIX = "skyindex.";
const CURRENT_PREFIX = "skydex.";

export function migrateBrandStorage(storage: Storage): void {
  const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
    .filter((key): key is string => key !== null && key.startsWith(LEGACY_PREFIX));
  for (const key of keys) {
    const value = storage.getItem(key);
    if (value === null) continue;
    const suffix = key.slice(LEGACY_PREFIX.length);
    let target = CURRENT_PREFIX + suffix;
    const current = storage.getItem(target);
    // Current choices win; conflicting older values remain recoverable.
    if (current !== null && current !== value) {
      const backup = `${CURRENT_PREFIX}migration-backup.${suffix}`;
      target = backup;
      for (let i = 1; storage.getItem(target) !== null && storage.getItem(target) !== value; i++) {
        target = `${backup}.${i}`;
      }
    }
    if (storage.getItem(target) !== value) storage.setItem(target, value);
    if (storage.getItem(target) !== value) throw new Error("Skydex storage migration verification failed");
    storage.removeItem(key);
  }
}
