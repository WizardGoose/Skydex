import { describe, expect, it } from "vitest";
import { mergeShardInventory } from "../shardsStore";

describe("mergeShardInventory", () => {
  it("replaces known shard keys while preserving generic holdings and zeroes", () => {
    const existing = new Map([
      ["WHEAT", 4],
      ["C1", 96],
      ["C2", 0],
      ["CUSTOM_ITEM", 0],
    ]);

    const merged = mergeShardInventory(
      existing,
      ["C1", "C2"],
      [["C1", 3], ["C2", 0]],
    );

    expect(merged).toEqual(new Map([
      ["WHEAT", 4],
      ["CUSTOM_ITEM", 0],
      ["C1", 3],
      ["C2", 0],
    ]));
  });

  it("removes stale known shards when a complete read has no row for them", () => {
    const merged = mergeShardInventory(
      new Map([["WHEAT", 0], ["C1", 96], ["C2", 3]]),
      ["C1", "C2"],
      [],
    );

    expect(merged).toEqual(new Map([["WHEAT", 0]]));
  });

  it("does not add a row outside the known shard catalogue", () => {
    const merged = mergeShardInventory(
      new Map([["WHEAT", 4]]),
      ["C1"],
      [["C1", 2], ["UNKNOWN_SHARD", 9]],
    );

    expect(merged).toEqual(new Map([["WHEAT", 4], ["C1", 2]]));
  });
});
