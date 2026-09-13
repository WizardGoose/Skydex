/**
 * The owned-items read API.
 *
 * One question - "what does the player already have" - answered from the island
 * feed, the shard suite's tally and the numbers the player typed, with the
 * provenance kept so the UI can say where each figure came from.
 */
export { buildOwned, describeSources, dominantSource, SOURCE_LABEL } from "./aggregate";
export type { OwnedInput } from "./aggregate";
export { useOwned } from "./useOwned";
export type { UseOwnedOptions } from "./useOwned";
export { shardBridge, getShards, subscribeShards } from "./shardsStore";
export type { ShardCounts } from "./shardsStore";
export { getShardIds, subscribeShardIds } from "./shardIds";
export type { OwnedEntry, OwnedIndex, OwnedSource, SourceCount } from "./types";
export {
  clearManagedInventory,
  getInventoryManagement,
  setManagedAttributes,
  setManagedDisabledShards,
  setManagedInventory,
  setManagedSourceEnabled,
  subscribeInventoryManagement,
  useInventoryManagement,
  MANAGED_HOLDING_SOURCES,
} from "./managementStore";
export type { InventoryManagementState } from "./managementStore";
export { greenhouseHoldingsItems } from "./greenhouseItems";
