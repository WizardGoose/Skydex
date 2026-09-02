import { afterEach, describe, expect, it } from "vitest";
import {
  apiFeed,
  chooseProfile,
  dash,
  fetchProfiles,
  looksLikeUuid,
  parseProfiles,
  readSacks,
  shouldAutoRefresh,
  undash,
} from "../hypixel";
import { resetHypixelTransportForTesting } from "../hypixelTransport";
import type { ApiProfile } from "../hypixel";

/**
 * The Hypixel side, parsed without a network.
 *
 * The two things worth being paranoid about are both shape problems rather than
 * logic problems: `sacks_counts` has moved between API versions and the code
 * must find it in either place, and a *missing* `sacks_counts` means "private",
 * which is a completely different claim from "empty".
 */

const UUID = "b876ec32e396476ba1158438d83c67d4";
const DASHED = "b876ec32-e396-476b-a115-8438d83c67d4";

const profilesPayload = (profiles: unknown[]) => ({ success: true, profiles });

afterEach(() => resetHypixelTransportForTesting());

describe("readSacks", () => {
  it("finds sacks nested under inventory", () => {
    expect(readSacks({ inventory: { sacks_counts: { OAK_LOG: 64 } } })).toStrictEqual({ OAK_LOG: 64 });
  });

  it("finds sacks at the top of the member", () => {
    expect(readSacks({ sacks_counts: { OAK_LOG: 64 } })).toStrictEqual({ OAK_LOG: 64 });
  });

  it("prefers the nested shape when both somehow exist", () => {
    const both = { inventory: { sacks_counts: { OAK_LOG: 1 } }, sacks_counts: { OAK_LOG: 999 } };
    expect(readSacks(both)).toStrictEqual({ OAK_LOG: 1 });
  });

  it("returns null when neither exists, which means private and not empty", () => {
    expect(readSacks({ inventory: {} })).toBeNull();
    expect(readSacks({})).toBeNull();
    expect(readSacks(null)).toBeNull();
    expect(readSacks("nope")).toBeNull();
  });

  it("keeps an explicitly empty sack section as empty, not private", () => {
    expect(readSacks({ inventory: { sacks_counts: {} } })).toStrictEqual({});
  });

  it("drops counts that are not finite non-negative numbers", () => {
    const out = readSacks({
      sacks_counts: { GOOD: 12, NEGATIVE: -1, NOT_A_NUMBER: "lots", NULLISH: null, STRINGY: "34" },
    });
    expect(out).toStrictEqual({ GOOD: 12, STRINGY: 34 });
  });
});

describe("uuid handling", () => {
  it("normalises dashed uuids", () => {
    expect(undash(DASHED)).toBe(UUID);
    expect(looksLikeUuid(DASHED)).toBe(true);
    expect(looksLikeUuid(UUID)).toBe(true);
    expect(looksLikeUuid("Steve")).toBe(false);
  });

  it("converts to the dashed spec form and back", () => {
    expect(dash(UUID)).toBe(DASHED);
    expect(dash(DASHED)).toBe(DASHED);
    expect(undash(dash(UUID))).toBe(UUID);
  });

  it("passes anything that is not a uuid through untouched", () => {
    expect(dash("")).toBe("");
    expect(dash("Steve")).toBe("Steve");
  });
});

describe("parseProfiles", () => {
  const payload = profilesPayload([
    {
      profile_id: "p1",
      cute_name: "Apple",
      selected: false,
      members: { [UUID]: { inventory: { sacks_counts: { OAK_LOG: 5 } } } },
    },
    {
      profile_id: "p2",
      cute_name: "Papaya",
      game_mode: "ironman",
      selected: true,
      members: { [UUID]: { sacks_counts: { COBBLESTONE: 64 } } },
    },
  ]);

  it("reads every profile the player is a member of", () => {
    const list = parseProfiles(payload, UUID);
    expect(list).toHaveLength(2);
    expect(list[0]).toStrictEqual({
      profileId: "p1",
      cuteName: "Apple",
      gameMode: null,
      selected: false,
      sacks: { OAK_LOG: 5 },
    });
    expect(list[1].gameMode).toBe("ironman");
    expect(list[1].selected).toBe(true);
  });

  it("treats an absent game_mode as a normal profile", () => {
    expect(parseProfiles(payload, UUID)[0].gameMode).toBeNull();
  });

  it("matches the member map whether the uuid given is dashed or not", () => {
    expect(parseProfiles(payload, DASHED)).toHaveLength(2);
  });

  it("matches a dashed key in the member map too", () => {
    const dashedKeys = profilesPayload([
      { profile_id: "p1", cute_name: "Apple", members: { [DASHED]: { sacks_counts: { OAK_LOG: 1 } } } },
    ]);
    expect(parseProfiles(dashedKeys, UUID)).toHaveLength(1);
  });

  it("marks a profile private when Hypixel omits the section", () => {
    const hidden = profilesPayload([{ profile_id: "p1", cute_name: "Apple", members: { [UUID]: { fairy_soul: 3 } } }]);
    expect(parseProfiles(hidden, UUID)[0].sacks).toBeNull();
  });

  it("skips profiles the player is not a member of, and malformed rows", () => {
    const messy = profilesPayload([
      { profile_id: "p1", cute_name: "Apple", members: { deadbeef: {} } },
      "not an object",
      null,
      { profile_id: "p2", cute_name: "Papaya", members: { [UUID]: { sacks_counts: {} } } },
    ]);
    const list = parseProfiles(messy, UUID);
    expect(list).toHaveLength(1);
    expect(list[0].profileId).toBe("p2");
  });

  it("returns nothing for a response with no profiles", () => {
    expect(parseProfiles({ success: true, profiles: null }, UUID)).toStrictEqual([]);
    expect(parseProfiles(null, UUID)).toStrictEqual([]);
  });
});

describe("chooseProfile", () => {
  const list: ApiProfile[] = [
    { profileId: "p1", cuteName: "Apple", gameMode: null, selected: false, sacks: {} },
    { profileId: "p2", cuteName: "Papaya", gameMode: "ironman", selected: true, sacks: {} },
  ];

  it("defaults to the profile Hypixel marks selected", () => {
    expect(chooseProfile(list)?.profileId).toBe("p2");
  });

  it("lets an explicit choice win over selected", () => {
    expect(chooseProfile(list, "p1")?.profileId).toBe("p1");
  });

  it("ignores a stale explicit choice", () => {
    expect(chooseProfile(list, "gone")?.profileId).toBe("p2");
  });

  it("falls back to the first profile when none is marked", () => {
    const unmarked = list.map((p) => ({ ...p, selected: false }));
    expect(chooseProfile(unmarked)?.profileId).toBe("p1");
  });

  it("returns null for an empty list", () => {
    expect(chooseProfile([])).toBeNull();
  });
});

describe("apiFeed", () => {
  const account = { uuid: UUID, name: "Steve" };
  const base: ApiProfile = { profileId: "p2", cuteName: "Papaya", gameMode: "ironman", selected: true, sacks: {} };

  it("reports every section the API cannot see as absent, never as empty", () => {
    const feed = apiFeed({ ...base, sacks: { OAK_LOG: 12 } }, account, 1000);
    expect(feed.source).toBe("api");
    expect(feed.receivedAt).toBe(1000);
    expect(feed.sections).toStrictEqual({
      sacks: "captured",
      chests: "absent",
      inventory: "absent",
      enderChest: "absent",
      storage: "absent",
    });
    // The snapshot must carry an array to satisfy the type; the section state is
    // what stops it being read as "your island has no chests".
    expect(feed.snapshot.chests).toStrictEqual([]);
    expect(feed.snapshot.sacks).toStrictEqual({ OAK_LOG: 12 });
    expect(feed.snapshot.profile).toStrictEqual({ name: "Papaya", gameMode: "ironman" });
  });

  it("marks private sacks hidden rather than empty", () => {
    const feed = apiFeed({ ...base, sacks: null }, account, 1000);
    expect(feed.sections.sacks).toBe("hidden");
    expect(feed.snapshot.sacks).toStrictEqual({});
  });

  it("marks a genuinely empty sack section empty", () => {
    expect(apiFeed({ ...base, sacks: {} }, account, 1000).sections.sacks).toBe("empty");
  });

  it("stores the dashed uuid in the snapshot, per the island spec", () => {
    // The account carries the undashed form because that is what Hypixel wants.
    // The snapshot must carry the dashed form because that is what the spec
    // pins, and both feeds land in one store.
    expect(apiFeed(base, account, 1000).snapshot.player.uuid).toBe(DASHED);
  });
});

/**
 * The two uuid forms, checked at the seam where they diverge.
 *
 * A stub `fetch` also lets this pin down the thing that must never regress: a
 * browser request reaches only api.skydex.ca and never carries a Hypixel key.
 */
describe("fetchProfiles wire format", () => {
  it("sends the undashed uuid through Skydex and keeps the key out of the request", async () => {
    const calls: { url: string; init: RequestInit | undefined }[] = [];
    const original = globalThis.fetch;
    const SECRET = "d2a1b3c4-secret-key-value";

    globalThis.fetch = ((url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      const body = profilesPayload([
        { profile_id: "p1", cute_name: "Papaya", selected: true, members: { [UUID]: { sacks_counts: { OAK_LOG: 7 } } } },
      ]);
      const fetchedAt = Date.now();
      return Promise.resolve(Response.json({
        success: true,
        uuid: UUID,
        profileId: null,
        fetchedAt,
        resources: {
          profiles: { fetchedAt, cache: "miss", data: body },
          garden: null,
          museum: null,
        },
      }));
    }) as typeof fetch;

    try {
      const res = await fetchProfiles({ uuid: UUID, name: "Steve" }, SECRET);
      expect(res.ok).toBe(true);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toContain("https://api.skydex.ca/v1/hypixel/snapshot");
      expect(calls[0].url).toContain(`uuid=${UUID}`);
      expect(calls[0].url).not.toContain(DASHED);
      // The two things that must never happen.
      expect(calls[0].url).not.toContain(SECRET);
      expect(new Headers(calls[0].init?.headers).get("API-Key")).toBeNull();
      expect(new Headers(calls[0].init?.headers).get("x-skydex-client-id")).toBeTruthy();

      if (!res.ok) return;
      const feed = apiFeed(res.value[0], { uuid: UUID, name: "Steve" }, 1000);
      expect(feed.snapshot.player.uuid).toBe(DASHED);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("reports rejected authentication without echoing the credential", async () => {
    const original = globalThis.fetch;
    const SECRET = "bad-key-1234";
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, cause: "Invalid API key" }), { status: 403 })
      )) as typeof fetch;

    try {
      const res = await fetchProfiles({ uuid: UUID, name: "Steve" }, SECRET);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.reason).toBe("auth");
      expect(res.error.message).toBe("Skydex could not authenticate with Hypixel.");
      expect(res.error.message).not.toContain(SECRET);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("redacts the key if a remote message ever contained it", async () => {
    const original = globalThis.fetch;
    const SECRET = "leaky-key-9999";
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: false, cause: `Key ${SECRET} is throttled` }), { status: 403 })
      )) as typeof fetch;

    try {
      const res = await fetchProfiles({ uuid: UUID, name: "Steve" }, SECRET);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.message).not.toContain(SECRET);
      expect(res.error.message).toBe("Skydex could not authenticate with Hypixel.");
    } finally {
      globalThis.fetch = original;
    }
  });
});

/**
 * When the site is allowed to pull the API without being asked.
 *
 * Policy rather than plumbing, which is why it is a pure function and why it is
 * tested on its own: the expensive mistakes here are spending someone's rate
 * limit to fetch a worse copy of data already on screen, and nagging the
 * majority of visitors who have no key and want none.
 */
describe("shouldAutoRefresh", () => {
  const TTL = 5 * 60 * 1000;
  const base = { hasCredentials: true, modLive: false, lastPullAt: null, now: 1_000_000, ttlMs: TTL };

  it("pulls once when a key is present and nothing has been fetched", () => {
    expect(shouldAutoRefresh(base)).toBe(true);
  });

  it("never pulls without credentials", () => {
    expect(shouldAutoRefresh({ ...base, hasCredentials: false })).toBe(false);
  });

  it("never pulls while the mod is live", () => {
    // The mod covers every section the API would answer for, is fresher, and
    // costs nothing. Spending quota here would buy strictly worse data.
    expect(shouldAutoRefresh({ ...base, modLive: true })).toBe(false);
    expect(shouldAutoRefresh({ ...base, modLive: true, lastPullAt: null })).toBe(false);
    expect(shouldAutoRefresh({ ...base, modLive: true, lastPullAt: 0 })).toBe(false);
  });

  it("respects the five minute TTL", () => {
    const now = base.now;
    expect(shouldAutoRefresh({ ...base, lastPullAt: now - 1000 })).toBe(false);
    expect(shouldAutoRefresh({ ...base, lastPullAt: now - (TTL - 1) })).toBe(false);
    expect(shouldAutoRefresh({ ...base, lastPullAt: now - TTL })).toBe(true);
    expect(shouldAutoRefresh({ ...base, lastPullAt: now - TTL * 2 })).toBe(true);
  });

  it("puts the mod check ahead of the TTL", () => {
    // Even a pull old enough to be stale stays unmade while the mod is live.
    expect(shouldAutoRefresh({ ...base, modLive: true, lastPullAt: base.now - TTL * 10 })).toBe(false);
  });
});
