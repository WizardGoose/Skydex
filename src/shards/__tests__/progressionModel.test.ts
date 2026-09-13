import { describe, expect, it } from "vitest";
import type { InventoryCalculationResult, ShardWithDirectInfo } from "../../types/types";
import {
  buildShardProgress,
  inventoryUsed,
  remainingForGoal,
  fusedTargetForAdditional,
  shardAttributeCap,
  summarizeShardProgress,
} from "../progressionModel";

const shard = (key: string, rarity: ShardWithDirectInfo["rarity"]): ShardWithDirectInfo => ({
  key,
  id: key,
  name: key,
  family: "Forest",
  type: "Mob",
  rarity,
  fuse_amount: 1,
  internal_id: `SHARD_${key}`,
  rate: 1,
  isDirect: true,
});

describe("shard progression", () => {
  it("uses the rarity-specific fused caps", () => {
    expect(shardAttributeCap("common")).toBe(96);
    expect(shardAttributeCap("Uncommon")).toBe(64);
    expect(shardAttributeCap("rare")).toBe(48);
    expect(shardAttributeCap("epic")).toBe(32);
    expect(shardAttributeCap("legendary")).toBe(24);
  });

  it("keeps unreadable progress distinct from a confirmed zero", () => {
    const entries = buildShardProgress(
      [shard("C1", "common"), shard("R1", "rare")],
      new Map([["C1", 4]]),
      new Map([["C1", 12]]),
      { loose: false, attributes: false },
    );

    expect(entries[0]).toMatchObject({ loose: 4, fused: 12, status: "incomplete" });
    expect(entries[1]).toMatchObject({ loose: null, fused: null, status: "unknown" });

    const confirmed = buildShardProgress(
      [shard("R1", "rare")],
      new Map(),
      new Map(),
      { loose: true, attributes: true },
    );
    expect(confirmed[0]).toMatchObject({ loose: 0, fused: 0, status: "incomplete" });
  });

  it("merges zero and partial progress without losing their actual fused counts", () => {
    const entries = buildShardProgress(
      [shard("C1", "common"), shard("R1", "rare"), shard("L1", "legendary")],
      new Map([["C1", 7]]),
      new Map([["R1", 12], ["L1", 24]]),
      { loose: true, attributes: true },
    );
    expect(summarizeShardProgress(entries)).toStrictEqual({
      total: 3,
      incomplete: 2,
      maxed: 1,
      unknown: 0,
      looseTypes: 1,
      looseTotal: 7,
    });
  });

  it("subtracts fused progress from the chosen goal without inventing unknown progress", () => {
    expect(remainingForGoal(48, 12)).toBe(36);
    expect(remainingForGoal(12, 48)).toBe(0);
    expect(remainingForGoal(48, null)).toBeNull();
  });

  it("shows 42 to fuse at Max with six Abyssal Lanternfish already fused", () => {
    const cap = shardAttributeCap("rare");
    expect(remainingForGoal(cap, 6)).toBe(42);
    expect(fusedTargetForAdditional(42, 6, cap)).toBe(48);
    expect(fusedTargetForAdditional(100, 6, cap)).toBe(48);
    expect(remainingForGoal(48, 7)).toBe(41);
  });

  it("adds one more rather than immediately completing a partially fused goal", () => {
    const target = fusedTargetForAdditional(1, 6, 96)!;
    expect(target).toBe(7);
    expect(remainingForGoal(target, 6)).toBe(1);
    expect(fusedTargetForAdditional(1, null, 96)).toBeNull();
    expect(remainingForGoal(fusedTargetForAdditional(1, 96, 96)!, 96)).toBe(0);
  });

  it("reports only the inventory the chosen route consumed", () => {
    const result = {
      remainingInventory: new Map([["C1", 3], ["R1", 2]]),
    } as Pick<InventoryCalculationResult, "remainingInventory">;
    expect(inventoryUsed(new Map([["C1", 8], ["R1", 2], ["L1", 1]]), result)).toStrictEqual([
      { shardId: "C1", quantity: 5 },
      { shardId: "L1", quantity: 1 },
    ]);
  });
});
