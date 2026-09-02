import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHypixelRequest,
  fetchProductionHypixelResource,
  hasHypixelApiCredential,
  resetHypixelTransportForTesting,
  usesProductionHypixelApi,
} from "../hypixelTransport";

const UUID = "b876ec32e396476ba1158438d83c67d4";

describe("Hypixel request transport", () => {
  afterEach(() => {
    resetHypixelTransportForTesting();
    vi.unstubAllGlobals();
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
});
