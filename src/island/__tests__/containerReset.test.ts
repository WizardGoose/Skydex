import { describe, expect, it } from "vitest";
import { clearContainerFeed, clearContainerFeeds } from "../containerReset";
import type { IslandFeed } from "../merge";

const feed = (source: "mod" | "api"): IslandFeed => ({
  source,
  receivedAt: 42,
  snapshot: {
    schema: 1,
    exportedAt: 40,
    player: { uuid: "u", name: "Steve" },
    profile: { name: "Papaya", gameMode: "ironman" },
    sacks: { ENCHANTED_MITHRIL: 14_000 },
    chests: [{ pos: [1, 2, 3], name: "Chest", lastSeen: 41, items: [{ id: "MITHRIL", name: "Mithril", count: 8 }] }],
    inventory: [{ id: "A", name: "A", count: 1 }],
    enderChest: [{ id: "B", name: "B", count: 2 }],
    storage: [{ id: "C", name: "C", count: 3 }],
    greenhouse: { observedAt: 41, size: [1, 1], cells: [] },
  },
  sections: {
    sacks: "captured",
    chests: "captured",
    inventory: "captured",
    enderChest: "captured",
    storage: "captured",
  },
});

describe("container snapshot reset", () => {
  it("clears holdings while retaining identity and non-container snapshot data", () => {
    const cleared = clearContainerFeed(feed("mod"));
    expect(cleared.snapshot.player).toEqual({ uuid: "u", name: "Steve" });
    expect(cleared.snapshot.profile).toEqual({ name: "Papaya", gameMode: "ironman" });
    expect(cleared.snapshot.greenhouse).toBeDefined();
    expect(cleared.snapshot.sacks).toEqual({});
    expect(cleared.snapshot.chests).toEqual([]);
    expect(cleared.snapshot.inventory).toBeUndefined();
    expect(cleared.sections).toEqual({
      sacks: "absent",
      chests: "absent",
      inventory: "absent",
      enderChest: "absent",
      storage: "absent",
    });
  });

  it("resets each source without dropping the source or received time", () => {
    const cleared = clearContainerFeeds({ mod: feed("mod"), api: feed("api") });
    expect(cleared.mod?.source).toBe("mod");
    expect(cleared.api?.source).toBe("api");
    expect(cleared.mod?.receivedAt).toBe(42);
    expect(cleared.api?.snapshot.sacks).toEqual({});
  });
});
