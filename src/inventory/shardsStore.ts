/**
 * A read-only mirror of the shard suite's inventory.
 *
 * The fusion calculator has kept its own tally since long before this module
 * existed, under the bare `inventory` key, written by `utilities/localStorage`
 * and owned entirely by that suite. Nothing here renames it, migrates it or
 * writes to it. This file opens it, reads it, and hands the numbers on.
 *
 * Following the store pattern the rest of the site uses (`profile/useProfile`,
 * `island/useIsland`): one module-level current value, one listener set, and a
 * cross-tab `storage` listener. The value's identity only changes when the
 * contents actually change, because `useSyncExternalStore` compares snapshots
 * by identity and a fresh object per read is an infinite render loop.
 *
 * One deliberate extra: the store also re-reads when the first subscriber
 * attaches. The shard suite writes this key from a plain `useEffect` with no
 * store behind it, so a same-tab write raises no event anybody can hear. The
 * realistic flow is "set your shards on the calculator, then open the planner",
 * and re-reading on mount is what makes that flow work without this module
 * reaching into the calculator or polling a key it does not own.
 */

/** The shard suite's key. Not ours. Read only, never written, never renamed. */
const SHARDS_KEY = "inventory";

export type ShardCounts = Record<string, number>;

const EMPTY: ShardCounts = {};

/**
 * Merge a complete shard read into the shared legacy inventory object without
 * treating that object as shard-only storage. The catalogue is the authority
 * for which keys belong to the shard suite: known shard keys are replaced,
 * while every other key (including an explicit zero) remains untouched.
 *
 * This is deliberately pure. The caller owns the writable management store;
 * keeping the merge here lets the read bridge and the import path agree on the
 * same key classification without making this mirror a second writer.
 */
export const mergeShardInventory = (
  existing: ReadonlyMap<string, number>,
  knownShardKeys: Iterable<string>,
  replacement: Iterable<readonly [string, number]>,
): Map<string, number> => {
  const known = new Set(knownShardKeys);
  const next = new Map<string, number>();

  for (const [key, amount] of existing) {
    if (!known.has(key)) next.set(key, amount);
  }
  for (const [key, amount] of replacement) {
    if (known.has(key)) next.set(key, amount);
  }

  return next;
};

const read = (): ShardCounts => {
  if (typeof localStorage === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(SHARDS_KEY);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;

    const out: ShardCounts = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n)) out[key] = n;
    }
    return out;
  } catch {
    // A key we do not own, written by code we do not control. An unreadable
    // value means this source has nothing to say, not that the player owns none.
    return EMPTY;
  }
};

const same = (a: ShardCounts, b: ShardCounts): boolean => {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
};

let current: ShardCounts = read();
const listeners = new Set<() => void>();

/** Re-read from disk, and notify only if something actually moved. */
const refresh = () => {
  const next = read();
  if (same(current, next)) return;
  current = next;
  for (const fn of listeners) fn();
};

export const subscribeShards = (fn: () => void) => {
  listeners.add(fn);
  // First subscriber picks up anything written while nothing was mounted.
  if (listeners.size === 1) refresh();
  return () => {
    listeners.delete(fn);
  };
};

export const getShards = (): ShardCounts => current;

// Keep other tabs in step: set your shards on the calculator in one, the
// planner in the other follows. Only this key, and only ever a re-read.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== SHARDS_KEY) return;
    refresh();
  });
}

/**
 * Bridge shard keys to Hypixel ids.
 *
 * The shard dataset carries `internal_id` (`SHARD_GROVE`) alongside the key the
 * suite stores counts under (`C1`), which is the same `hypixelId` bridge the
 * item index uses. A caller that already has the shard list loaded passes it
 * through here; one that does not simply omits the bridge, and the shard tally
 * contributes nothing rather than guessing.
 */
export const shardBridge = (shards: { key: string; internal_id?: string | null }[]): Record<string, string | null> =>
  Object.fromEntries(shards.map((s) => [s.key, s.internal_id ?? null]));
