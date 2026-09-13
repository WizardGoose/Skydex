import { MAX_QUANTITIES } from "../constants";
import type { InventoryCalculationResult, ShardWithDirectInfo } from "../types/types";

export type ShardProgressStatus = "incomplete" | "maxed" | "unknown";

export interface ShardProgressEntry {
  shard: ShardWithDirectInfo;
  cap: number;
  fused: number | null;
  loose: number | null;
  status: ShardProgressStatus;
}

export interface ShardProgressKnowledge {
  /** True when an absent shard inventory row means zero rather than unreadable. */
  loose: boolean;
  /** True when an absent attribute stack means zero rather than unreadable. */
  attributes: boolean;
}

export interface ShardProgressSummary {
  total: number;
  incomplete: number;
  maxed: number;
  unknown: number;
  looseTypes: number;
  looseTotal: number;
}

export interface InventoryUse {
  shardId: string;
  quantity: number;
}

/** The fused shard count required to max one attribute of this rarity. */
export const shardAttributeCap = (rarity: string): number => {
  const key = rarity.trim().toLowerCase() as keyof typeof MAX_QUANTITIES;
  return MAX_QUANTITIES[key] ?? MAX_QUANTITIES.common;
};

const knownCount = (source: Map<string, number>, id: string, globallyKnown: boolean): number | null => {
  if (!globallyKnown && !source.has(id)) return null;
  const value = source.get(id) ?? 0;
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
};

/**
 * Join catalogue data to the two player-owned shard stores.
 *
 * Fused attributes and loose shards are intentionally separate. A player can
 * hold ten loose shards while still having no progress on that attribute, and
 * collapsing those numbers would make both the collection and the planner lie.
 */
export function buildShardProgress(
  shards: readonly ShardWithDirectInfo[],
  inventory: Map<string, number>,
  ownedAttributes: Map<string, number>,
  knowledge: ShardProgressKnowledge,
): ShardProgressEntry[] {
  return shards.map((shard) => {
    const cap = shardAttributeCap(shard.rarity);
    const fused = knownCount(ownedAttributes, shard.key, knowledge.attributes);
    const loose = knownCount(inventory, shard.key, knowledge.loose);
    const status: ShardProgressStatus = fused === null
      ? "unknown"
      : fused >= cap
        ? "maxed"
        : "incomplete";

    return { shard, cap, fused, loose, status };
  });
}

export function summarizeShardProgress(entries: readonly ShardProgressEntry[]): ShardProgressSummary {
  const summary: ShardProgressSummary = {
    total: entries.length,
    incomplete: 0,
    maxed: 0,
    unknown: 0,
    looseTypes: 0,
    looseTotal: 0,
  };

  for (const entry of entries) {
    summary[entry.status] += 1;
    if ((entry.loose ?? 0) > 0) {
      summary.looseTypes += 1;
      summary.looseTotal += entry.loose ?? 0;
    }
  }

  return summary;
}

/** Remaining output shards needed after the player's fused progress. */
export const remainingForGoal = (goal: number, fused: number | null): number | null => {
  if (fused === null) return null;
  if (!Number.isFinite(goal)) return 0;
  return Math.max(0, Math.floor(goal) - fused);
};

/** Keep saved targets absolute so a later profile sync reduces the work still due. */
export const fusedTargetForAdditional = (additional: number, fused: number | null, cap: number): number | null => {
  if (fused === null || !Number.isFinite(additional)) return null;
  return Math.min(cap, fused + Math.max(1, Math.floor(additional)));
};

/**
 * Inventory the solver actually spent. `remainingInventory` is the same map
 * after substitutions, so the positive difference is the truthful answer.
 */
export function inventoryUsed(
  inventory: Map<string, number>,
  result: Pick<InventoryCalculationResult, "remainingInventory"> | null,
): InventoryUse[] {
  if (!result?.remainingInventory) return [];
  const used: InventoryUse[] = [];
  for (const [shardId, startingRaw] of inventory) {
    const starting = Number.isFinite(startingRaw) ? Math.max(0, startingRaw) : 0;
    const remainingRaw = result.remainingInventory.get(shardId) ?? 0;
    const remaining = Number.isFinite(remainingRaw) ? Math.max(0, remainingRaw) : 0;
    const quantity = Math.max(0, starting - remaining);
    if (quantity > 0) used.push({ shardId, quantity });
  }
  return used.sort((a, b) => b.quantity - a.quantity || a.shardId.localeCompare(b.shardId));
}
