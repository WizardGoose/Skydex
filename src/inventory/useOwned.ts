import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useIsland } from "../island/useIsland";
import { getShards, subscribeShards } from "./shardsStore";
import { getShardIds, subscribeShardIds } from "./shardIds";
import { buildOwned } from "./aggregate";
import type { OwnedIndex } from "./types";
import { useInventoryManagement } from "./managementStore";
import { useEnsureProfileSources, useParsedProfile } from "../networth/useNetworth";

/**
 * What the player owns, from everywhere the site knows to look.
 *
 * Read-only by construction. `useIsland` owns the island feeds, the shard suite
 * owns its tally, and the caller owns whatever manual numbers it passes in;
 * this hook subscribes to all three and returns a view. There is no setter
 * here and there should never be one, because the moment this writes back it
 * becomes a second author of data somebody else is already responsible for.
 *
 * Subscribing to `useIsland` is what starts the companion mod's transport, the
 * same as on the Island and Items pages. That is intended: a page asking what
 * the player owns is a page that wants the live answer.
 *
 * The shard tally is in that union too, and it arrives by itself: a caller no
 * longer has to know the shard suite exists, or hand over a bridge, to see
 * shards counted. What it does not do is make every caller pay for that. The
 * bridge is fetched only once the player's tally has something in it, so a
 * profile with no shards recorded costs exactly what it did before.
 */
export interface UseOwnedOptions {
  /**
   * The site's item index, or any record carrying `hypixelId`. This is the
   * bridge between our keys and Hypixel's, and without it nothing from the
   * island or the shard tally can be matched to anything.
   */
  items: Record<string, { hypixelId: string | null }>;
  /**
   * The player's typed numbers, keyed by the site's item key. Whatever is in
   * here wins over every automatic source, always. Pass the store that already
   * persists them rather than a copy, so precedence is decided against the
   * same object that gets saved.
   */
  manual?: Record<string, number> | null;
  /**
   * Shard key to Hypixel id, from `shardBridge`.
   *
   * Optional, and normally left out. A caller that already has the shard list
   * in hand - the fusion pages do - passes it here and the bridge costs
   * nothing; everybody else omits it and `shardIds` resolves itself from the
   * dataset, lazily, and only once the player's tally has something in it. See
   * `shardIds.ts` for why that second path is deferred rather than eager.
   */
  shardIds?: Record<string, string | null> | null;
}

/** The unsubscribe half of a subscription that was never really made. */
const noUnsubscribe = () => {};

export const useOwned = ({ items, manual = null, shardIds = null }: UseOwnedOptions): OwnedIndex => {
  useEnsureProfileSources();
  const { snapshot, sections } = useIsland();
  const profile = useParsedProfile();
  const { enabledSources, inventory: managedInventory } = useInventoryManagement();
  const shardCounts = useSyncExternalStore(subscribeShards, getShards, getShards);

  /*
   * A caller that passed its own bridge must not also trigger the lazy load:
   * subscribing is what asks for the dataset, so when the answer is already in
   * hand we subscribe to nothing at all rather than fetching 2.2 MB to arrive
   * at the same map.
   */
  const supplied = shardIds != null;
  const subscribe = useCallback((fn: () => void) => (supplied ? noUnsubscribe : subscribeShardIds(fn)), [supplied]);
  const discovered = useSyncExternalStore(subscribe, getShardIds, getShardIds);

  const ids = shardIds ?? discovered;

  // Generic local overrides belong to the same shared holdings store as the
  // source toggles. A page-specific manual layer remains useful for the
  // greenhouse planner, but it wins only for keys it explicitly names.
  const effectiveManual = useMemo(() => {
    const shared = Object.fromEntries(managedInventory);
    return manual ? { ...shared, ...manual } : shared;
  }, [managedInventory, manual]);

  return useMemo(
    () =>
      buildOwned({
        items,
        island: { snapshot, sections },
        profile: profile.parsed && profile.coverage && profile.fetchedAt !== null
          ? {
              parsed: profile.parsed,
              inventoryShared: profile.coverage.inventoryShared,
              sacksShared: profile.coverage.sacksShared,
              vaultShared: profile.coverage.vaultShared,
              museumShared: profile.coverage.museumShared,
              fetchedAt: profile.fetchedAt,
            }
          : null,
        shards: ids ? { counts: shardCounts, ids } : null,
        manual: effectiveManual,
        // This set contains only the five island-container switches. The
        // allocator keeps the legacy shard source separate and always includes
        // it when the bridge is available.
        enabledSources,
      }),
    [items, snapshot, sections, profile.parsed, profile.coverage, profile.fetchedAt, shardCounts, ids, effectiveManual, enabledSources]
  );
};
