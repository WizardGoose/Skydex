import { describe, expect, it } from "vitest";
import { deriveSections, mergeFeeds, modFeed } from "../merge";
import type { IslandFeed } from "../merge";
import type { IslandSnapshot } from "../types";

/**
 * The two-feed merge.
 *
 * Everything here is one idea seen from different angles: only a real
 * observation can win a section, we never show less than we hold, and then
 * precedence decides. The dangerous failure is a source that *cannot* see a
 * section - the API and chests - silently outranking one that can, purely
 * because it answered more recently. Several of these tests exist only to pin
 * that down.
 */

const snap = (over: Partial<IslandSnapshot> = {}): IslandSnapshot => ({
  schema: 1,
  exportedAt: 1000,
  player: { uuid: "u", name: "Steve" },
  profile: { name: "Papaya", gameMode: "ironman" },
  sacks: {},
  chests: [],
  ...over,
});

const chest = (n: number) => ({
  pos: [n, 70, n] as [number, number, number],
  name: `Chest ${n}`,
  lastSeen: 500,
  items: [{ id: "OAK_LOG", name: "Oak Log", count: n }],
});

/** An API-shaped feed: sacks only, everything else beyond its reach. */
const api = (receivedAt: number, sacks: Record<string, number> | null): IslandFeed => ({
  source: "api",
  receivedAt,
  snapshot: snap({ sacks: sacks ?? {} }),
  sections: {
    sacks: sacks === null ? "hidden" : Object.keys(sacks).length > 0 ? "captured" : "empty",
    chests: "absent",
    inventory: "absent",
    enderChest: "absent",
    storage: "absent",
  },
});

const apiWithIdentity = (receivedAt: number, profileName: string, playerUuid = "u"): IslandFeed => ({
  ...api(receivedAt, { OAK_LOG: 4 }),
  snapshot: snap({
    player: { uuid: playerUuid, name: "Steve" },
    profile: { name: profileName, gameMode: "ironman" },
  }),
});

describe("deriveSections", () => {
  it("separates absent, empty and captured on the optional sections", () => {
    const sections = deriveSections(snap({ inventory: [], enderChest: [{ id: "A", name: "A", count: 1 }] }));
    expect(sections.inventory).toBe("empty");
    expect(sections.enderChest).toBe("captured");
    expect(sections.storage).toBe("absent");
    expect(sections.sacks).toBe("empty");
    expect(sections.chests).toBe("empty");
  });
});

describe("mergeFeeds", () => {
  it("returns nothing when there are no feeds", () => {
    const merged = mergeFeeds({});
    expect(merged.snapshot).toBeNull();
    expect(merged.sources).toStrictEqual({ mod: null, api: null });
    for (const section of Object.values(merged.sections)) {
      expect(section).toStrictEqual({ state: "absent", source: null, at: null });
    }
  });

  it("passes a single mod feed straight through", () => {
    const merged = mergeFeeds({ mod: modFeed(snap({ sacks: { OAK_LOG: 4 }, chests: [chest(1)] }), 100) });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 4 });
    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sections.sacks).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    expect(merged.sources).toStrictEqual({ mod: 100, api: null });
  });

  it("passes a single api feed through without inventing chests", () => {
    const merged = mergeFeeds({ api: api(100, { OAK_LOG: 4 }) });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 4 });
    expect(merged.sections.chests).toStrictEqual({ state: "absent", source: null, at: null });
    expect(merged.snapshot?.inventory).toBeUndefined();
  });

  it("gives sacks to the mod even when the api answered more recently", () => {
    // Policy, not freshness: the mod reads the real sack screen, while the API
    // only publishes what the player's privacy settings allow.
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 1 } }), 100),
      api: api(200, { OAK_LOG: 999 }),
    });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 1 });
    expect(merged.sections.sacks.source).toBe("mod");
    expect(merged.sections.sacks.at).toBe(100);
  });

  it("falls back to the api for sacks the mod does not have", () => {
    const merged = mergeFeeds({ api: api(200, { OAK_LOG: 999 }) });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 999 });
    expect(merged.sections.sacks.source).toBe("api");
  });

  it("prefers a source with items over one that says verified empty", () => {
    // Never show the player less than we are holding. The mod owns sacks, but
    // an empty mod section is not a reason to hide real data from the API.
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: {} }), 900),
      api: api(100, { OAK_LOG: 4096 }),
    });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 4096 });
    expect(merged.sections.sacks.source).toBe("api");
  });

  it("gives the same section back to the mod when the mod is fresher", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 1 } }), 300),
      api: api(200, { OAK_LOG: 999 }),
    });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 1 });
    expect(merged.sections.sacks.source).toBe("mod");
  });

  it("prefers the mod on an exact timestamp tie", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 1 } }), 200),
      api: api(200, { OAK_LOG: 999 }),
    });
    expect(merged.sections.sacks.source).toBe("mod");
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 1 });
  });

  it("never lets a hidden api section overwrite a real mod section", () => {
    // The API answered far more recently and said "private". That is a
    // statement about permissions, not about the island.
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 42 } }), 100),
      api: api(9_999, null),
    });
    expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 42 });
    expect(merged.sections.sacks).toStrictEqual({ state: "captured", source: "mod", at: 100 });
  });

  it("reports hidden when that is genuinely all anyone knows", () => {
    const merged = mergeFeeds({ api: api(500, null) });
    expect(merged.sections.sacks).toStrictEqual({ state: "hidden", source: "api", at: 500 });
    expect(merged.snapshot?.sacks).toStrictEqual({});
  });

  it("prefers saying hidden over saying not-captured", () => {
    // A mod feed that has never seen sacks would report `empty` by derivation,
    // so use a feed that genuinely lacks the section to isolate the case.
    const blindMod: IslandFeed = {
      source: "mod",
      receivedAt: 100,
      snapshot: snap(),
      sections: { sacks: "absent", chests: "captured", inventory: "absent", enderChest: "absent", storage: "absent" },
    };
    const merged = mergeFeeds({ mod: blindMod, api: api(200, null) });
    expect(merged.sections.sacks.state).toBe("hidden");
  });

  it("never lets the api's blind spots cost the mod its chests", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ chests: [chest(1), chest(2)] }), 100),
      api: api(9_999, { OAK_LOG: 1 }),
    });
    expect(merged.snapshot?.chests).toHaveLength(2);
    expect(merged.sections.chests).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    // …while still taking the sacks the API is fresher on.
    expect(merged.sections.sacks.source).toBe("api");
  });

  it("keeps absent and empty apart on the optional sections", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ inventory: [], enderChest: [{ id: "A", name: "A", count: 2 }] }), 100),
      api: api(200, { OAK_LOG: 1 }),
    });
    expect(merged.snapshot?.inventory).toStrictEqual([]);
    expect(merged.sections.inventory.state).toBe("empty");
    expect(merged.snapshot?.enderChest).toHaveLength(1);
    expect(merged.snapshot?.storage).toBeUndefined();
    expect("storage" in (merged.snapshot ?? {})).toBe(false);
    expect(merged.sections.storage.state).toBe("absent");
  });

  it("takes identity as a block from the freshest feed that knows a name", () => {
    const anonymous: IslandFeed = {
      ...api(500, { OAK_LOG: 1 }),
      snapshot: snap({ player: { uuid: "", name: "" }, profile: { name: "", gameMode: null } }),
    };
    const merged = mergeFeeds({
      mod: modFeed(snap({ player: { uuid: "u", name: "Steve" }, profile: { name: "Papaya", gameMode: "ironman" } }), 100),
      api: anonymous,
    });
    // The nameless feed is fresher, but a profile stitched from two sources
    // belongs to nobody, so the named one supplies the whole block.
    expect(merged.snapshot?.player.name).toBe("Steve");
    expect(merged.snapshot?.profile).toStrictEqual({ name: "Papaya", gameMode: "ironman" });
  });

  it("filters a mismatched feed before it can contribute another account's chests", () => {
    const staleMod = modFeed(snap({
      player: { uuid: "other-account", name: "Old Player" },
      chests: [chest(1)],
    }), 900);
    const currentApi = api(100, { OAK_LOG: 4 });
    const feeds = { mod: staleMod, api: currentApi };
    const merged = mergeFeeds(feeds, {
      identity: { playerUuids: ["u"], profileName: "Papaya", hasConnectedAccount: true },
    });

    expect(merged.snapshot?.player.uuid).toBe("u");
    expect(merged.snapshot?.chests).toStrictEqual([]);
    expect(merged.sections.chests).toStrictEqual({ state: "absent", source: null, at: null });
    expect(merged.sources).toStrictEqual({ mod: null, api: 100 });
    // Filtering is a view concern. The persisted feed remains available for a
    // later identity change or an explicit user clear.
    expect(feeds.mod).toBe(staleMod);
    expect(feeds.mod.snapshot.chests).toHaveLength(1);
  });

  it("keeps a matching mod feed eligible to win the chest section", () => {
    const currentMod = modFeed(snap({ chests: [chest(2)] }), 100);
    const merged = mergeFeeds({ mod: currentMod, api: api(200, { OAK_LOG: 4 }) }, {
      identity: { playerUuids: ["u"], profileName: "Papaya", hasConnectedAccount: true },
    });

    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sections.chests).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    expect(merged.sources).toStrictEqual({ mod: 100, api: 200 });
  });

  it("uses a matching API profile as the anchor when no profile is selected explicitly", () => {
    const staleMod = modFeed(snap({
      profile: { name: "Apple", gameMode: "ironman" },
      chests: [chest(1)],
    }), 900);
    const currentApi = apiWithIdentity(100, "Papaya");
    const feeds = { mod: staleMod, api: currentApi };
    const merged = mergeFeeds(feeds, {
      identity: { playerUuids: ["u"], hasConnectedAccount: true },
    });

    expect(merged.snapshot?.profile.name).toBe("Papaya");
    expect(merged.snapshot?.chests).toStrictEqual([]);
    expect(merged.sources).toStrictEqual({ mod: null, api: 100 });
    expect(feeds.mod).toBe(staleMod);
  });

  it("keeps a same-profile mod feed when the API supplies the selected profile name", () => {
    const currentMod = modFeed(snap({ chests: [chest(2)] }), 100);
    const merged = mergeFeeds({ mod: currentMod, api: apiWithIdentity(200, "Papaya") }, {
      identity: { playerUuids: ["u"], hasConnectedAccount: true },
    });

    expect(merged.snapshot?.profile.name).toBe("Papaya");
    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sections.chests).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    expect(merged.sources).toStrictEqual({ mod: 100, api: 200 });
  });

  it("does not blend mod data when the eligible API profile has no name", () => {
    const currentMod = modFeed(snap({ chests: [chest(2)] }), 100);
    const merged = mergeFeeds({ mod: currentMod, api: apiWithIdentity(200, "") }, {
      identity: { playerUuids: ["u"], hasConnectedAccount: true },
    });

    expect(merged.snapshot?.profile.name).toBe("");
    expect(merged.snapshot?.chests).toStrictEqual([]);
    expect(merged.sections.chests).toStrictEqual({ state: "absent", source: null, at: null });
    expect(merged.sources).toStrictEqual({ mod: null, api: 200 });
  });

  it("does not let a foreign API feed choose the profile anchor", () => {
    const currentMod = modFeed(snap({ chests: [chest(2)] }), 100);
    const merged = mergeFeeds({ mod: currentMod, api: apiWithIdentity(900, "Apple", "other-account") }, {
      identity: { playerUuids: ["u"], hasConnectedAccount: true },
    });

    expect(merged.snapshot?.profile.name).toBe("Papaya");
    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sections.chests).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    expect(merged.sources).toStrictEqual({ mod: 100, api: null });
  });

  it("keeps an explicit caller profile expectation authoritative", () => {
    const currentMod = modFeed(snap({ chests: [chest(2)] }), 100);
    const merged = mergeFeeds({ mod: currentMod, api: apiWithIdentity(200, "Apple") }, {
      identity: { playerUuids: ["u"], profileName: "Papaya", hasConnectedAccount: true },
    });

    expect(merged.snapshot?.profile.name).toBe("Papaya");
    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sections.chests).toStrictEqual({ state: "captured", source: "mod", at: 100 });
    expect(merged.sources).toStrictEqual({ mod: 100, api: null });
  });

  it("withholds all feeds while a connected account is unresolved", () => {
    const merged = mergeFeeds({ mod: modFeed(snap({ chests: [chest(1)] }), 100) }, {
      identity: { playerUuids: [], hasConnectedAccount: true },
    });

    expect(merged.snapshot).toBeNull();
    expect(merged.sources).toStrictEqual({ mod: null, api: null });
    expect(merged.sections.chests).toStrictEqual({ state: "absent", source: null, at: null });
  });

  it("keeps a real mod-only feed when no connected account is selected", () => {
    const merged = mergeFeeds({ mod: modFeed(snap({ chests: [chest(1)] }), 100) }, {
      identity: { playerUuids: [], hasConnectedAccount: false },
    });

    expect(merged.snapshot?.chests).toHaveLength(1);
    expect(merged.sources).toStrictEqual({ mod: 100, api: null });
  });
});

/**
 * Section sourcing policy, pinned by the spec.
 *
 * The API can answer for inventory, ender chest and storage, and the mod can
 * too. Which one wins is not a freshness question: while the mod is live it
 * carries everything, costs nothing and has no rate limit, so it replaces the
 * API outright for those sections. Off the live path a clipboard code omits
 * them entirely, so they fall to the API without needing a rule at all.
 */
describe("section sourcing policy", () => {
  const bag = (n: number) => [{ id: `ITEM_${n}`, name: `Item ${n}`, count: n }];

  /** A hypothetical API feed that can answer for the optional sections. */
  const richApi = (receivedAt: number): IslandFeed => ({
    source: "api",
    receivedAt,
    snapshot: snap({ sacks: { OAK_LOG: 1 }, inventory: bag(1), enderChest: bag(2), storage: bag(3) }),
    sections: {
      sacks: "captured",
      chests: "absent",
      inventory: "captured",
      enderChest: "captured",
      storage: "captured",
    },
  });

  const liveMod = (receivedAt: number) =>
    modFeed(snap({ sacks: { OAK_LOG: 9 }, chests: [chest(1)], inventory: bag(7), enderChest: bag(8), storage: bag(9) }), receivedAt);

  it("lets a live mod replace the api for inventory, ender chest and storage", () => {
    const merged = mergeFeeds({ mod: liveMod(100), api: richApi(9_999) }, { modLive: true });

    for (const key of ["inventory", "enderChest", "storage"] as const) {
      expect(merged.sections[key].source).toBe("mod");
    }
    expect(merged.snapshot?.inventory).toStrictEqual(bag(7));
    expect(merged.snapshot?.enderChest).toStrictEqual(bag(8));
    expect(merged.snapshot?.storage).toStrictEqual(bag(9));
  });

  it("lets the fresher api win those sections when the mod is not live", () => {
    const merged = mergeFeeds({ mod: liveMod(100), api: richApi(9_999) }, { modLive: false });

    for (const key of ["inventory", "enderChest", "storage"] as const) {
      expect(merged.sections[key].source).toBe("api");
    }
    expect(merged.snapshot?.inventory).toStrictEqual(bag(1));
  });

  it("keeps sacks and chests on the mod either way", () => {
    for (const modLive of [true, false]) {
      const merged = mergeFeeds({ mod: liveMod(100), api: richApi(9_999) }, { modLive });
      expect(merged.sections.sacks.source).toBe("mod");
      expect(merged.snapshot?.sacks).toStrictEqual({ OAK_LOG: 9 });
      expect(merged.sections.chests.source).toBe("mod");
      expect(merged.snapshot?.chests).toHaveLength(1);
    }
  });

  it("does not let a section absent from a code overwrite a good one from the api", () => {
    // Clipboard codes now exclude the three optional sections by default, so a
    // pasted mod feed simply has nothing to say about them. That silence must
    // read as "not captured by this source", never as "empty".
    const pastedCode = modFeed(snap({ sacks: { OAK_LOG: 9 }, chests: [chest(1)] }), 9_999);
    const merged = mergeFeeds({ mod: pastedCode, api: richApi(100) }, { modLive: false });

    expect(merged.sections.inventory).toStrictEqual({ state: "captured", source: "api", at: 100 });
    expect(merged.snapshot?.inventory).toStrictEqual(bag(1));
    // Even with the mod live, a section it does not carry cannot be replaced by
    // the mod, because there is nothing there to replace it with.
    const live = mergeFeeds({ mod: pastedCode, api: richApi(100) }, { modLive: true });
    expect(live.sections.inventory.source).toBe("api");
  });

  it("reports a section absent from every source as absent, not empty", () => {
    const pastedCode = modFeed(snap({ sacks: { OAK_LOG: 9 } }), 100);
    const merged = mergeFeeds({ mod: pastedCode, api: api(200, { OAK_LOG: 1 }) });

    expect(merged.sections.inventory.state).toBe("absent");
    expect(merged.snapshot?.inventory).toBeUndefined();
    expect("inventory" in (merged.snapshot ?? {})).toBe(false);
  });

  it("defaults to not-live when no option is passed", () => {
    const merged = mergeFeeds({ mod: liveMod(100), api: richApi(9_999) });
    expect(merged.sections.inventory.source).toBe("api");
  });
});

/**
 * Sacks merge per item, and the reason is a bug this once had.
 *
 * The mod only knows about sack types the player has actually opened. Giving it
 * the whole section, as an earlier version did, meant a live mod HID every sack
 * the API knew about and the player had not opened: running the mod made you
 * see less than running nothing. Union with mod-wins-collisions is what makes
 * adding a source monotonic.
 */
describe("per-item sack merge", () => {
  it("unions both feeds, mod winning the ids they share", () => {
    const merged = mergeFeeds({
      // The player has opened two sacks in game.
      mod: modFeed(snap({ sacks: { OAK_LOG: 1200, COBBLESTONE: 64 } }), 500),
      // The profile has five, with staler counts for the two above.
      api: api(100, { OAK_LOG: 9, COBBLESTONE: 9, DIAMOND: 320, EMERALD: 64, COAL: 4096 }),
    });

    expect(merged.snapshot?.sacks).toStrictEqual({
      // Mod wins the overlap: fresher, read off the real sack screen.
      OAK_LOG: 1200,
      COBBLESTONE: 64,
      // API-only ids survive instead of vanishing.
      DIAMOND: 320,
      EMERALD: 64,
      COAL: 4096,
    });
  });

  it("never shows fewer sacks with the mod running than without it", () => {
    const apiOnly = mergeFeeds({ api: api(100, { A: 1, B: 2, C: 3 }) });
    const withMod = mergeFeeds({
      mod: modFeed(snap({ sacks: { A: 50 } }), 500),
      api: api(100, { A: 1, B: 2, C: 3 }),
    });

    const apiIds = Object.keys(apiOnly.snapshot?.sacks ?? {}).sort();
    const bothIds = Object.keys(withMod.snapshot?.sacks ?? {}).sort();
    expect(bothIds).toStrictEqual(apiIds);
    expect(withMod.snapshot?.sacks.A).toBe(50);
  });

  it("shows the api's items when the mod reports sacks as empty", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: {} }), 9_999),
      api: api(100, { DIAMOND: 320 }),
    });
    expect(merged.snapshot?.sacks).toStrictEqual({ DIAMOND: 320 });
    expect(merged.sections.sacks.state).toBe("captured");
    expect(merged.sections.sacks.source).toBe("api");
    // Only one source actually put anything in, so it is not a blend.
    expect(merged.sections.sacks.contributors).toBeUndefined();
  });

  it("marks the section as a blend only when both sources really contributed", () => {
    const mixed = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 1200 } }), 500),
      api: api(100, { OAK_LOG: 9, DIAMOND: 320 }),
    });
    expect(mixed.sections.sacks.contributors).toStrictEqual([
      { source: "mod", at: 500 },
      { source: "api", at: 100 },
    ]);
    // The dominant source leads, and each half keeps its own clock rather than
    // one timestamp being stretched over both.
    expect(mixed.sections.sacks.source).toBe("mod");
    expect(mixed.sections.sacks.at).toBe(500);
  });

  it("is not a blend when the api added nothing the mod did not already have", () => {
    const merged = mergeFeeds({
      mod: modFeed(snap({ sacks: { OAK_LOG: 1200, DIAMOND: 320 } }), 500),
      api: api(100, { OAK_LOG: 9 }),
    });
    // Every surviving id came from the mod, so calling it "mod + API" would
    // overstate what the API contributed.
    expect(merged.sections.sacks.contributors).toBeUndefined();
    expect(merged.sections.sacks.source).toBe("mod");
  });

  it("reports verified empty when both sources looked and found nothing", () => {
    const merged = mergeFeeds({ mod: modFeed(snap({ sacks: {} }), 500), api: api(100, {}) });
    expect(merged.snapshot?.sacks).toStrictEqual({});
    expect(merged.sections.sacks.state).toBe("empty");
    expect(merged.sections.sacks.contributors).toBeUndefined();
  });

  it("still reports hidden when the api is private and the mod has no sacks at all", () => {
    const blindMod: IslandFeed = {
      source: "mod",
      receivedAt: 100,
      snapshot: snap(),
      sections: { sacks: "absent", chests: "captured", inventory: "absent", enderChest: "absent", storage: "absent" },
    };
    const merged = mergeFeeds({ mod: blindMod, api: api(200, null) });
    expect(merged.sections.sacks).toStrictEqual({ state: "hidden", source: "api", at: 200 });
  });
});

/**
 * The other sections stay whole-section, and that is a decision rather than an
 * oversight. Inventory, ender chest and storage are blob-shaped: splicing two
 * snapshots of the same container together per item would describe a state
 * that never existed at any single moment.
 */
describe("only sacks merge per item", () => {
  const modBag = [{ id: "ROOKIE_HOE", name: "Rookie Hoe", count: 1 }];
  const apiBag = [
    { id: "ROOKIE_HOE", name: "Rookie Hoe", count: 1 },
    { id: "DIAMOND_SWORD", name: "Diamond Sword", count: 1 },
  ];

  const richApi = (receivedAt: number): IslandFeed => ({
    source: "api",
    receivedAt,
    snapshot: snap({ inventory: apiBag, enderChest: apiBag, storage: apiBag }),
    sections: {
      sacks: "absent",
      chests: "absent",
      inventory: "captured",
      enderChest: "captured",
      storage: "captured",
    },
  });

  it("replaces a live mod's inventory wholesale rather than unioning it", () => {
    const merged = mergeFeeds(
      { mod: modFeed(snap({ inventory: modBag, enderChest: modBag, storage: modBag }), 100), api: richApi(9_999) },
      { modLive: true }
    );

    // Exactly the mod's list. The API's extra sword does NOT leak in.
    expect(merged.snapshot?.inventory).toStrictEqual(modBag);
    expect(merged.snapshot?.inventory).toHaveLength(1);
    expect(merged.snapshot?.enderChest).toStrictEqual(modBag);
    expect(merged.snapshot?.storage).toStrictEqual(modBag);
    expect(merged.sections.inventory.contributors).toBeUndefined();
  });

  it("keeps chests mod-only, with nothing to union against", () => {
    const merged = mergeFeeds({ mod: modFeed(snap({ chests: [chest(1)] }), 100), api: api(9_999, { A: 1 }) });
    expect(merged.sections.chests.source).toBe("mod");
    expect(merged.sections.chests.contributors).toBeUndefined();
  });
});
