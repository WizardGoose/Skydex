import { describe, it, expect } from "vitest";
import { fetchProfileMember } from "../hypixel";
import { resetHypixelTransportForTesting } from "../hypixelTransport";

/**
 * The raw member reader.
 *
 * `parseProfiles` keeps only sack totals, so anything that wants the accessory
 * bag or the collection map has to come through here. Two things are worth
 * pinning down, and neither is the happy path:
 *
 *   - it must pick the SAME profile `chooseProfile` would pick, because two
 *     readers disagreeing about which profile is "the" profile is a bug that
 *     shows up as numbers from one profile sitting beside numbers from another
 *   - it must send no Hypixel key from the browser, which is the invariant
 *     `hypixel.ts` states in its own header and the reason this request lives
 *     in that file rather than in the accessories module
 */

const UUID = "b876ec32e396476ba1158438d83c67d4";
const ACCOUNT = { uuid: UUID, name: "Wizard" };

/** Save/restore around a stubbed fetch, matching the convention in hypixel.test.ts. */
const withFetch = async <T>(
  handler: (url: string, init: RequestInit | undefined) => Response,
  run: () => Promise<T>
): Promise<T> => {
  const original = globalThis.fetch;
  resetHypixelTransportForTesting();
  globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const response = handler(String(url), init);
    if (!response.ok) return response;
    const data = await response.json();
    const fetchedAt = Date.now();
    return Response.json({
      success: true,
      uuid: UUID,
      profileId: null,
      fetchedAt,
      resources: {
        profiles: { fetchedAt, cache: "miss", data },
        garden: null,
        museum: null,
      },
    });
  }) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
    resetHypixelTransportForTesting();
  }
};

const payload = (profiles: unknown[]) => new Response(JSON.stringify({ success: true, profiles }), { status: 200 });

const member = (tag: string) => ({ talisman_bag: { data: tag } });

describe("fetchProfileMember", () => {
  it("returns the member exactly as Hypixel sent it", async () => {
    const result = await withFetch(
      () => payload([{ profile_id: "p1", cute_name: "Papaya", selected: true, members: { [UUID]: member("BAG1") } }]),
      () => fetchProfileMember(ACCOUNT, "key")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Untouched: the whole contract is that this function does not interpret.
    expect(result.value.member).toStrictEqual({ talisman_bag: { data: "BAG1" } });
    expect(result.value.profileId).toBe("p1");
    expect(result.value.cuteName).toBe("Papaya");
  });

  it("keeps the key out of the Skydex browser request", async () => {
    const SECRET = "d2a1b3c4-secret-key-value";
    let seenUrl = "";
    let seenInit: RequestInit | undefined;

    await withFetch(
      (url, init) => {
        seenUrl = url;
        seenInit = init;
        return payload([{ profile_id: "p1", selected: true, members: { [UUID]: member("BAG1") } }]);
      },
      () => fetchProfileMember(ACCOUNT, SECRET)
    );

    expect(seenUrl).toContain(UUID);
    expect(seenUrl).toContain("https://api.skydex.ca/v1/hypixel/snapshot");
    expect(seenUrl).not.toContain(SECRET);
    expect(new Headers(seenInit?.headers).get("API-Key")).toBeNull();
    expect(new Headers(seenInit?.headers).get("x-skydex-client-id")).toBeTruthy();
  });

  it("prefers an explicitly chosen profile over the selected one", async () => {
    const result = await withFetch(
      () =>
        payload([
          { profile_id: "p1", selected: true, members: { [UUID]: member("SELECTED") } },
          { profile_id: "p2", selected: false, members: { [UUID]: member("CHOSEN") } },
        ]),
      () => fetchProfileMember(ACCOUNT, "key", "p2")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileId).toBe("p2");
    expect(result.value.member).toStrictEqual({ talisman_bag: { data: "CHOSEN" } });
  });

  it("falls back to the selected profile, then to the first", async () => {
    const selected = await withFetch(
      () =>
        payload([
          { profile_id: "p1", selected: false, members: { [UUID]: member("FIRST") } },
          { profile_id: "p2", selected: true, members: { [UUID]: member("SELECTED") } },
        ]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(selected.ok && selected.value.profileId).toBe("p2");

    const first = await withFetch(
      () =>
        payload([
          { profile_id: "p1", selected: false, members: { [UUID]: member("FIRST") } },
          { profile_id: "p2", selected: false, members: { [UUID]: member("SECOND") } },
        ]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(first.ok && first.value.profileId).toBe("p1");
  });

  it("ignores a profile the player is not a member of", async () => {
    const other = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const result = await withFetch(
      () =>
        payload([
          { profile_id: "p1", selected: true, members: { [other]: member("SOMEONE_ELSE") } },
          { profile_id: "p2", selected: false, members: { [UUID]: member("MINE") } },
        ]),
      () => fetchProfileMember(ACCOUNT, "key")
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileId).toBe("p2");
    expect(result.value.member).toStrictEqual({ talisman_bag: { data: "MINE" } });
  });

  it("matches the member map whether or not it is dashed", async () => {
    const dashed = "b876ec32-e396-476b-a115-8438d83c67d4";
    const result = await withFetch(
      () => payload([{ profile_id: "p1", selected: true, members: { [dashed]: member("BAG1") } }]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(result.ok && result.value.profileId).toBe("p1");
  });

  it("reads the game mode, which is the only place it appears", async () => {
    const result = await withFetch(
      () =>
        payload([
          { profile_id: "p1", selected: true, game_mode: "ironman", members: { [UUID]: member("BAG1") } },
        ]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(result.ok && result.value.gameMode).toBe("ironman");

    // Absent means a normal profile, spelled null rather than "".
    const normal = await withFetch(
      () => payload([{ profile_id: "p1", selected: true, members: { [UUID]: member("BAG1") } }]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(normal.ok && normal.value.gameMode).toBeNull();
  });

  it("reports rejected authentication rather than an empty bag", async () => {
    const result = await withFetch(
      () => new Response(JSON.stringify({ success: false, cause: "Invalid API key" }), { status: 403 }),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe("auth");
  });

  it("does not repeat a credential if Hypixel ever echoes it back", async () => {
    const SECRET = "d2a1b3c4-secret-key-value";
    const result = await withFetch(
      () => new Response(JSON.stringify({ success: false, cause: `Invalid API key ${SECRET}` }), { status: 403 }),
      () => fetchProfileMember(ACCOUNT, SECRET)
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).not.toContain(SECRET);
    expect(result.error.message).toBe("Skydex could not authenticate with Hypixel.");
  });

  it("works without a personal key", async () => {
    let called = false;
    const result = await withFetch(
      () => {
        called = true;
        return payload([{ profile_id: "p1", selected: true, members: { [UUID]: member("BAG1") } }]);
      },
      () => fetchProfileMember(ACCOUNT, "   ")
    );
    expect(called).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("says not found when the account has no profiles it shares", async () => {
    const result = await withFetch(
      () => payload([]),
      () => fetchProfileMember(ACCOUNT, "key")
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe("notFound");
  });

  it("treats a network failure as network, saying nothing about the request", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("boom"))) as typeof fetch;
    try {
      const result = await fetchProfileMember(ACCOUNT, "key");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.reason).toBe("network");
      expect(result.error.message).not.toContain("hypixel.net");
    } finally {
      globalThis.fetch = original;
    }
  });
});
