import { describe, expect, it, vi } from "vitest";
import {
  handleHypixelApiRequest,
  HYPIXEL_METRIC_FIELDS,
  hypixelApiRoute,
} from "../../../cloudflare/hypixel-api-worker.js";

const UUID = "b876ec32e396476ba1158438d83c67d4";
const DASHED_UUID = "b876ec32-e396-476b-a115-8438d83c67d4";
const PROFILE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CLIENT_ID = "11111111-1111-4111-8111-111111111111";

const limiter = (success = true) => ({ limit: vi.fn(async () => ({ success })) });

const quota = (allowed = true) => {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
    return Response.json(body.action === "reserve"
      ? { ok: true, allowed, remaining: allowed ? 239 : 0, limit: 300, retryAfter: allowed ? 0 : 30 }
      : { ok: true });
  });
  return { binding: { getByName: vi.fn(() => ({ fetch })) }, fetch };
};

const memoryCache = () => {
  const values = new Map<string, Response>();
  return {
    match: vi.fn(async (request: Request) => values.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      values.set(request.url, response.clone());
    }),
    dropFresh: () => {
      for (const key of values.keys()) {
        if (key.includes("tier=fresh")) values.delete(key);
      }
    },
  };
};

const apiRequest = (path: string, headers: HeadersInit = {}) =>
  new Request(`https://api.skydex.ca${path}`, {
    headers: {
      origin: "https://skydex.ca",
      "cf-connecting-ip": "203.0.113.10",
      "x-skydex-client-id": CLIENT_ID,
      ...headers,
    },
  });

const environment = (overrides: Record<string, unknown> = {}) => {
  const quotaBinding = quota();
  return {
    HYPIXEL_API_KEY: "production-secret",
    HYPIXEL_CLIENT_LIMITER: limiter(),
    HYPIXEL_NETWORK_LIMITER: limiter(),
    HYPIXEL_QUOTA: quotaBinding.binding,
    HYPIXEL_METRICS: { writeDataPoint: vi.fn() },
    ...overrides,
  };
};

const handled = async (
  ...args: Parameters<typeof handleHypixelApiRequest>
): Promise<Response> => {
  const response = await handleHypixelApiRequest(...args);
  if (response === null) throw new Error("Expected the Hypixel route to handle this request.");
  return response;
};

const upstream = (url: string) => {
  const endpoint = new URL(url).pathname;
  const headers = {
    "content-type": "application/json",
    "ratelimit-limit": "300",
    "ratelimit-remaining": "299",
    "ratelimit-reset": "42",
    "x-upstream-private": "secret",
  };
  if (endpoint.endsWith("/profiles")) {
    return Response.json({
      success: true,
      profiles: [{ profile_id: PROFILE, selected: true, members: { [UUID]: {} } }],
    }, { headers });
  }
  if (endpoint.endsWith("/garden")) {
    return Response.json({ success: true, garden: { garden_experience: 1 } }, { headers });
  }
  return Response.json({ success: true, members: { [UUID]: {} } }, { headers });
};

describe("production Hypixel API route", () => {
  it("allows only the snapshot and three canonical identifier reads", () => {
    expect(hypixelApiRoute(`/v1/hypixel/snapshot?uuid=${DASHED_UUID}`)).toMatchObject({
      endpoint: "snapshot",
      uuid: UUID,
    });
    expect(hypixelApiRoute(`/v1/hypixel/snapshot?uuid=${UUID}&profile=${PROFILE}`)).toMatchObject({
      endpoint: "snapshot",
      uuid: UUID,
      profileId: PROFILE,
    });
    expect(hypixelApiRoute(`/v1/hypixel/profiles?uuid=${DASHED_UUID}`)).toMatchObject({
      endpoint: "profiles",
      id: UUID,
      upstreamUrl: `https://api.hypixel.net/v2/skyblock/profiles?uuid=${UUID}`,
    });
    expect(hypixelApiRoute(`/v1/hypixel/garden?profile=${PROFILE}`)).toMatchObject({ endpoint: "garden" });
    expect(hypixelApiRoute(`/v1/hypixel/museum?profile=${PROFILE}`)).toMatchObject({ endpoint: "museum" });
    expect(hypixelApiRoute(`/v1/hypixel/player?uuid=${UUID}`)).toEqual({ error: "notFound" });
    expect(hypixelApiRoute(`/v1/hypixel/profiles?uuid=${UUID}&extra=1`)).toEqual({ error: "query" });
    expect(hypixelApiRoute(`/v1/hypixel/profiles?uuid=not-a-uuid`)).toEqual({ error: "query" });
    expect(hypixelApiRoute("/greenhouse/share/code")).toBeNull();
  });

  it("permits Skydex web and local origins, but requires an anonymous browser id", async () => {
    const runtime = { cache: memoryCache(), fetch: vi.fn() as unknown as typeof fetch };
    const deniedOrigin = await handled(
      apiRequest(`/v1/hypixel/profiles?uuid=${UUID}`, { origin: "https://example.com" }),
      environment(),
      undefined,
      runtime,
    );
    const deniedId = await handled(
      apiRequest(`/v1/hypixel/profiles?uuid=${UUID}`, { "x-skydex-client-id": "made-up" }),
      environment(),
      undefined,
      runtime,
    );
    const preflight = await handled(
      new Request(`https://api.skydex.ca/v1/hypixel/snapshot?uuid=${UUID}`, {
        method: "OPTIONS",
        headers: { origin: "http://localhost:5173" },
      }),
      environment(),
      undefined,
      runtime,
    );

    expect(deniedOrigin.status).toBe(403);
    expect(deniedId.status).toBe(403);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("x-skydex-client-id");
    expect(runtime.fetch).not.toHaveBeenCalled();
  });

  it("builds one browser snapshot, adds the key upstream, and reuses the edge cache", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get("API-Key")).toBe("production-secret");
      expect(init.redirect).toBe("manual");
      return upstream(url);
    });
    const env = environment({ HYPIXEL_API_KEY: " \nproduction-secret\t" });

    const first = await handled(
      apiRequest(`/v1/hypixel/snapshot?uuid=${UUID}`),
      env,
      undefined,
      { cache, fetch: fetcher as unknown as typeof fetch },
    );
    const second = await handled(
      apiRequest(`/v1/hypixel/snapshot?uuid=${UUID}`),
      env,
      undefined,
      { cache, fetch: fetcher as unknown as typeof fetch },
    );

    expect(first.status).toBe(200);
    expect(first.headers.get("x-skydex-cache")).toBe("miss");
    expect(first.headers.get("ratelimit-remaining")).toBeNull();
    expect(first.headers.get("x-upstream-private")).toBeNull();
    const body = await first.json() as { profileId: string; resources: Record<string, unknown> };
    expect(body.profileId).toBe(PROFILE);
    expect(body.resources.profiles).toBeTruthy();
    expect(body.resources.garden).toBeTruthy();
    expect(body.resources.museum).toBeTruthy();
    expect(second.headers.get("x-skydex-cache")).toBe("hit");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(env.HYPIXEL_CLIENT_LIMITER.limit).toHaveBeenCalledTimes(3);
    expect(env.HYPIXEL_NETWORK_LIMITER.limit).toHaveBeenCalledTimes(3);
  });

  it("fails closed when either anonymous abuse bucket refuses a cache miss", async () => {
    const fetcher = vi.fn();
    const response = await handled(
      apiRequest(`/v1/hypixel/garden?profile=${PROFILE}`),
      environment({ HYPIXEL_CLIENT_LIMITER: limiter(false) }),
      undefined,
      { cache: memoryCache(), fetch: fetcher as unknown as typeof fetch },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the coordinated global reserve rather than a location-local counter", async () => {
    const deniedQuota = quota(false);
    const fetcher = vi.fn();
    const response = await handled(
      apiRequest(`/v1/hypixel/museum?profile=${PROFILE}`),
      environment({ HYPIXEL_QUOTA: deniedQuota.binding }),
      undefined,
      { cache: memoryCache(), fetch: fetcher as unknown as typeof fetch },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("serves the last good response when a later refresh is limited", async () => {
    const cache = memoryCache();
    const fetcher = vi.fn(async (url: string) => upstream(url));
    const first = await handled(
      apiRequest(`/v1/hypixel/profiles?uuid=${UUID}`),
      environment(),
      undefined,
      { cache, fetch: fetcher as unknown as typeof fetch },
    );
    expect(first.status).toBe(200);
    cache.dropFresh();

    const stale = await handled(
      apiRequest(`/v1/hypixel/profiles?uuid=${UUID}`),
      environment({ HYPIXEL_CLIENT_LIMITER: limiter(false) }),
      undefined,
      { cache, fetch: fetcher as unknown as typeof fetch },
    );

    expect(stale.status).toBe(200);
    expect(stale.headers.get("x-skydex-cache")).toBe("stale");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("keeps aggregate telemetry numeric and strips upstream failures", async () => {
    const metrics = { writeDataPoint: vi.fn() };
    const response = await handled(
      apiRequest(`/v1/hypixel/profiles?uuid=${UUID}`),
      environment({ HYPIXEL_METRICS: metrics }),
      undefined,
      {
        cache: memoryCache(),
        fetch: vi.fn(async () => Response.json(
          { success: false, cause: "Invalid API key production-secret" },
          { status: 403, headers: { "ratelimit-limit": "300", "ratelimit-remaining": "0", "ratelimit-reset": "10" } },
        )),
      },
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("ratelimit-limit")).toBeNull();
    const responseBody = await response.text();
    expect(responseBody).toContain("needs attention");
    expect(responseBody).not.toContain("production-secret");
    expect(responseBody).not.toContain("Invalid API key");
    for (const call of metrics.writeDataPoint.mock.calls) {
      expect(call[0]).toEqual({ doubles: expect.any(Array) });
      expect(call[0].doubles).toHaveLength(HYPIXEL_METRIC_FIELDS.length);
      expect(call[0].doubles.every((value: unknown) => typeof value === "number")).toBe(true);
      expect(JSON.stringify(call[0])).not.toContain(UUID);
      expect(JSON.stringify(call[0])).not.toContain(CLIENT_ID);
      expect(JSON.stringify(call[0])).not.toContain("203.0.113.10");
    }
  });
});
