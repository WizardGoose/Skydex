import { afterEach, describe, expect, it, vi } from "vitest";
import {
  anonymousHypixelClientId,
  buildHypixelRequest,
  fetchProductionHypixelResource,
  readCachedHypixelResource,
  hasHypixelApiCredential,
  resetHypixelTransportForTesting,
  usesProductionHypixelApi,
} from "../hypixelTransport";

const UUID = "b876ec32e396476ba1158438d83c67d4";

describe("Hypixel request transport", () => {
  afterEach(() => {
    resetHypixelTransportForTesting();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("loads through the phone preview without secure-context APIs or persistent storage", async () => {
    vi.stubEnv("DEV", true);
    vi.stubGlobal("window", { location: { origin: "http://192.168.1.42:7070" } });
    vi.stubGlobal("caches", undefined);
    const randomValues = globalThis.crypto.getRandomValues.bind(globalThis.crypto);
    vi.stubGlobal("crypto", { getRandomValues: randomValues });
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new DOMException("Storage unavailable", "SecurityError"); },
      setItem: () => { throw new DOMException("Storage unavailable", "SecurityError"); },
    });
    const profiles = { success: true, profiles: [] };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({
      success: true, uuid: UUID, profileId: null,
      resources: { profiles: { fetchedAt: Date.now(), cache: "miss", data: profiles } },
    }));
    vi.stubGlobal("fetch", fetcher);
    const clientId = anonymousHypixelClientId();
    expect(clientId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(anonymousHypixelClientId()).toBe(clientId);
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`;
    const first = await fetchProductionHypixelResource(url, new AbortController().signal);
    const second = await fetchProductionHypixelResource(url, new AbortController().signal);
    expect(await first.json()).toEqual(profiles);
    expect(await second.json()).toEqual(profiles);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(`http://192.168.1.42:7070/__skydex-profile/v1/hypixel/snapshot?uuid=${UUID}`);
  });

  it("keeps published pages on the hosted API even at a private address", () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("window", { location: { origin: "http://192.168.1.42:4180" } });
    const request = buildHypixelRequest(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`, "");
    expect(request.url).toBe(`https://api.skydex.ca/v1/hypixel/profiles?uuid=${UUID}`);
  });

  it("keeps the approved production key out of the browser request", () => {
    const request = buildHypixelRequest(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`,
      "visitor-secret",
      true,
    );

    expect(request.url).toBe(`https://api.skydex.ca/v1/hypixel/profiles?uuid=${UUID}`);
    expect(new Headers(request.init.headers).get("x-skydex-client-id")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(new Headers(request.init.headers).get("API-Key")).toBeNull();
    expect(JSON.stringify(request)).not.toContain("visitor-secret");
  });

  it("retains an explicit direct authenticated seam for transport tests", () => {
    const request = buildHypixelRequest(
      `https://api.hypixel.net/v2/skyblock/garden?profile=${UUID}`,
      " local-secret ",
      false,
    );

    expect(request.url).toBe(`https://api.hypixel.net/v2/skyblock/garden?profile=${UUID}`);
    expect(new Headers(request.init.headers).get("API-Key")).toBe("local-secret");
    expect(new Headers(request.init.headers).get("x-skydex-client-id")).toBeNull();
  });

  it("requires a personal key only when the explicit direct seam is selected", () => {
    expect(usesProductionHypixelApi(true)).toBe(true);
    expect(usesProductionHypixelApi(false)).toBe(false);
    expect(hasHypixelApiCredential("", true)).toBe(true);
    expect(hasHypixelApiCredential("", false)).toBe(false);
    expect(hasHypixelApiCredential("key", false)).toBe(true);
  });

  it("cannot turn a new authenticated endpoint into an accidental production proxy", () => {
    expect(() =>
      buildHypixelRequest(`https://api.hypixel.net/v2/player?uuid=${UUID}`, "", true),
    ).toThrow("Unsupported authenticated Hypixel endpoint.");
  });

  it("seeds profiles, garden, and museum from one browser snapshot request", async () => {
    const profileId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const now = Date.now();
    const profiles = {
      success: true,
      profiles: [{ profile_id: profileId, selected: true, members: { [UUID]: {} } }],
    };
    const garden = { success: true, garden: { garden_experience: 10 } };
    const museum = { success: true, members: { [UUID]: {} } };
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      void _input;
      void _init;
      return Response.json({
        success: true,
        uuid: UUID,
        profileId,
        fetchedAt: now,
        resources: {
          profiles: { fetchedAt: now, cache: "miss", data: profiles },
          garden: { fetchedAt: now, cache: "miss", data: garden },
          museum: { fetchedAt: now, cache: "miss", data: museum },
        },
      });
    });
    vi.stubGlobal("fetch", fetcher);

    const signal = new AbortController().signal;
    const profileResponse = await fetchProductionHypixelResource(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`,
      signal,
    );
    const gardenResponse = await fetchProductionHypixelResource(
      `https://api.hypixel.net/v2/skyblock/garden?profile=${profileId}`,
      signal,
    );
    const museumResponse = await fetchProductionHypixelResource(
      `https://api.hypixel.net/v2/skyblock/museum?profile=${profileId}`,
      signal,
    );

    expect(await profileResponse.json()).toEqual(profiles);
    expect(await gardenResponse.json()).toEqual(garden);
    expect(await museumResponse.json()).toEqual(museum);
    expect(gardenResponse.headers.get("x-skydex-cache")).toBe("browser-hit");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0][0])).toBe(
      `https://api.skydex.ca/v1/hypixel/snapshot?uuid=${UUID}`,
    );
  });

  it("does not multiply requests when a snapshot is temporarily partial", async () => {
    const profileId = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    const now = Date.now();
    const profiles = {
      success: true,
      profiles: [{ profile_id: profileId, selected: true, members: { [UUID]: {} } }],
    };
    const fetcher = vi.fn(async () => Response.json({
      success: true,
      uuid: UUID,
      profileId,
      fetchedAt: now,
      resources: {
        profiles: { fetchedAt: now, cache: "hit", data: profiles },
        garden: null,
        museum: null,
      },
    }));
    vi.stubGlobal("fetch", fetcher);

    const signal = new AbortController().signal;
    await fetchProductionHypixelResource(
      `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`,
      signal,
    );
    const museum = await fetchProductionHypixelResource(
      `https://api.hypixel.net/v2/skyblock/museum?profile=${profileId}`,
      signal,
    );

    expect(museum.status).toBe(503);
    expect(museum.headers.get("retry-after")).toBe("60");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("restores an older matching profile immediately without promoting its age", async () => {
    const fetchedAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
    const body = { success: true, profiles: [{ profile_id: UUID, members: { [UUID]: {} } }] };
    vi.stubGlobal("caches", { open: async () => ({ match: async (request: Request) =>
      request.url.includes(`id=${UUID}`) ? Response.json(body, { headers: { "x-skydex-fetched-at": String(fetchedAt) } }) : undefined,
    }) });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const cached = await readCachedHypixelResource(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`);
    expect(cached?.headers.get("x-skydex-cache")).toBe("browser-stale");
    expect(cached?.headers.get("x-skydex-fetched-at")).toBe(String(fetchedAt));
    expect(await cached?.json()).toEqual(body);
    expect(await readCachedHypixelResource("https://api.hypixel.net/v2/skyblock/profiles?uuid=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not wait indefinitely on an unavailable browser cache", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("caches", { open: () => new Promise(() => {}) });
    const pending = readCachedHypixelResource(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBeNull();
  });

  it("does not let one component cancel a shared snapshot needed by another", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      finish = resolve;
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
    }));
    vi.stubGlobal("fetch", fetcher);
    const first = new AbortController();
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`;
    const a = fetchProductionHypixelResource(url, first.signal);
    const cancelled = expect(a).rejects.toThrow();
    const b = fetchProductionHypixelResource(url, new AbortController().signal);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    first.abort();
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(false);
    finish(Response.json({ success: true, uuid: UUID, profileId: UUID, resources: { profiles: { fetchedAt: Date.now(), cache: "miss", data: { success: true, profiles: [] } } } }));
    expect((await b).status).toBe(200);
    await cancelled;
  });
});
