/**
 * Select and cache the authenticated Hypixel transport without changing the
 * parsers that consume it.
 *
 * Production asks api.skydex.ca for one profile snapshot. The snapshot fills
 * a small browser cache with the profiles, garden, and museum responses, so
 * page changes reuse the same data instead of spending another network or
 * Hypixel request. The hosted site and a local Skydex checkout use the same
 * keyless public product path; the direct-key branch exists only as an
 * explicit low-level test seam and is never selected by the app.
 */

export interface HypixelRequest {
  url: string;
  init: RequestInit;
}

type ResourceName = "profiles" | "garden" | "museum";

interface ResourceRoute {
  endpoint: ResourceName;
  id: string;
}

interface CachedResource {
  body: string;
  fetchedAt: number;
  cacheState: string;
}

interface SnapshotResource {
  fetchedAt: number;
  cache: string;
  data: unknown;
}

interface ProductionSnapshot {
  success: true;
  uuid: string;
  profileId: string | null;
  fetchedAt: number;
  resources: {
    profiles: SnapshotResource;
    garden: SnapshotResource | null;
    museum: SnapshotResource | null;
  };
}

interface FailedRequest {
  status: number;
  body: string;
  headers: [string, string][];
}

type SnapshotLoad = { ok: true } | { ok: false; failure: FailedRequest };

const PRODUCTION_API_ORIGIN = "https://api.skydex.ca";
const CLIENT_ID_KEY = "skydex.client.v1";
const BROWSER_CACHE_NAME = "skydex-hypixel-v1";
const MAX_BROWSER_RESOURCES = 36;
const STALE_MS = 24 * 60 * 60 * 1000;

const RESOURCE_TTL_MS: Record<ResourceName, number> = {
  profiles: 5 * 60 * 1000,
  garden: 10 * 60 * 1000,
  museum: 30 * 60 * 1000,
};

const PRODUCTION_ENDPOINTS: Readonly<Record<string, { endpoint: ResourceName; parameter: string }>> = {
  "/v2/skyblock/profiles": { endpoint: "profiles", parameter: "uuid" },
  "/v2/skyblock/garden": { endpoint: "garden", parameter: "profile" },
  "/v2/skyblock/museum": { endpoint: "museum", parameter: "profile" },
};

const memoryResources = new Map<string, CachedResource>();
const profileOwners = new Map<string, string>();
const pendingSnapshots = new Map<string, Promise<SnapshotLoad>>();
let sessionClientId = "";

/** Reset module caches between isolated transport tests. */
export const resetHypixelTransportForTesting = (): void => {
  memoryResources.clear();
  profileOwners.clear();
  pendingSnapshots.clear();
  sessionClientId = "";
};

const canonicalId = (value: string | null): string | null => {
  const id = (value ?? "").replaceAll("-", "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : null;
};

const validClientId = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const randomClientId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** A stable anonymous browser id. It contains no key and grants no privilege. */
export const anonymousHypixelClientId = (): string => {
  if (validClientId(sessionClientId)) return sessionClientId;
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY) ?? "";
    if (validClientId(stored)) {
      sessionClientId = stored;
      return stored;
    }
  } catch {
    // A session-only id is sufficient when browser storage is unavailable.
  }
  sessionClientId = randomClientId();
  try {
    localStorage.setItem(CLIENT_ID_KEY, sessionClientId);
  } catch {
    // Keep the in-memory id for this tab.
  }
  return sessionClientId;
};

const productionHeaders = (): HeadersInit => ({
  accept: "application/json",
  "x-skydex-client-id": anonymousHypixelClientId(),
});

export const usesProductionHypixelApi = (production = true): boolean => production;

export const hasHypixelApiCredential = (
  key: string,
  production = true,
): boolean => usesProductionHypixelApi(production) || key.trim() !== "";

const resourceRoute = (upstreamUrl: string): ResourceRoute => {
  const upstream = new URL(upstreamUrl);
  const definition = PRODUCTION_ENDPOINTS[upstream.pathname];
  if (!definition) throw new Error("Unsupported authenticated Hypixel endpoint.");
  const id = canonicalId(upstream.searchParams.get(definition.parameter));
  if (!id || [...upstream.searchParams.keys()].length !== 1) {
    throw new Error("Invalid authenticated Hypixel request.");
  }
  return { endpoint: definition.endpoint, id };
};

export const buildHypixelRequest = (
  upstreamUrl: string,
  key: string,
  production = true,
): HypixelRequest => {
  const upstream = new URL(upstreamUrl);

  if (usesProductionHypixelApi(production)) {
    const route = resourceRoute(upstreamUrl);
    const definition = PRODUCTION_ENDPOINTS[upstream.pathname];
    const url = new URL(`/v1/hypixel/${route.endpoint}`, PRODUCTION_API_ORIGIN);
    url.searchParams.set(definition.parameter, route.id);
    return {
      url: url.toString(),
      init: { cache: "no-store", headers: productionHeaders() },
    };
  }

  return {
    url: upstream.toString(),
    init: {
      cache: "no-store",
      headers: { accept: "application/json", "API-Key": key.trim() },
    },
  };
};

const resourceKey = (route: ResourceRoute): string => `${route.endpoint}:${route.id}`;

const browserCacheRequest = (route: ResourceRoute): Request => {
  const url = new URL(`/__browser-cache/${route.endpoint}`, PRODUCTION_API_ORIGIN);
  url.searchParams.set("id", route.id);
  return new Request(url.toString(), { method: "GET" });
};

const browserCache = async (): Promise<Cache | null> => {
  try {
    return globalThis.caches?.open ? await globalThis.caches.open(BROWSER_CACHE_NAME) : null;
  } catch {
    return null;
  }
};

const responseFor = (resource: CachedResource, cacheState = resource.cacheState): Response =>
  new Response(resource.body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-skydex-cache": cacheState,
      "x-skydex-fetched-at": String(resource.fetchedAt),
    },
  });

const rememberProfileOwners = (body: string, uuid: string) => {
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { profiles?: unknown }).profiles)) return;
    for (const profile of (parsed as { profiles: unknown[] }).profiles) {
      if (!profile || typeof profile !== "object") continue;
      const profileId = canonicalId(String((profile as { profile_id?: unknown }).profile_id ?? ""));
      if (profileId) profileOwners.set(profileId, uuid);
    }
  } catch {
    // A malformed value will be rejected by its normal parser after return.
  }
};

const trimMemoryResources = () => {
  if (memoryResources.size <= MAX_BROWSER_RESOURCES) return;
  const oldest = [...memoryResources.entries()]
    .sort((left, right) => left[1].fetchedAt - right[1].fetchedAt)
    .slice(0, memoryResources.size - MAX_BROWSER_RESOURCES);
  for (const [key] of oldest) memoryResources.delete(key);
};

const prunePersistentCache = async (cache: Cache) => {
  try {
    const now = Date.now();
    const records = await Promise.all((await cache.keys()).map(async (request) => {
      const response = await cache.match(request);
      return {
        request,
        fetchedAt: Number(response?.headers.get("x-skydex-fetched-at")) || 0,
      };
    }));
    const expired = records.filter((record) => now - record.fetchedAt > STALE_MS);
    await Promise.all(expired.map((record) => cache.delete(record.request)));
    const retained = records
      .filter((record) => !expired.includes(record))
      .sort((left, right) => right.fetchedAt - left.fetchedAt);
    await Promise.all(retained.slice(MAX_BROWSER_RESOURCES).map((record) => cache.delete(record.request)));
  } catch {
    // The in-memory cache still handles this session.
  }
};

const writeBrowserResource = async (
  route: ResourceRoute,
  data: unknown,
  fetchedAt: number,
  cacheState: string,
) => {
  const resource: CachedResource = { body: JSON.stringify(data), fetchedAt, cacheState };
  memoryResources.set(resourceKey(route), resource);
  trimMemoryResources();
  if (route.endpoint === "profiles") rememberProfileOwners(resource.body, route.id);

  const cache = await browserCache();
  if (!cache) return;
  try {
    await cache.put(browserCacheRequest(route), responseFor(resource));
    await prunePersistentCache(cache);
  } catch {
    // Browser storage is an optimisation. The in-memory copy remains valid.
  }
};

const readBrowserResource = async (
  route: ResourceRoute,
  allowStale: boolean,
): Promise<Response | null> => {
  const now = Date.now();
  let resource = memoryResources.get(resourceKey(route)) ?? null;

  if (!resource) {
    const cache = await browserCache();
    try {
      const stored = cache ? await cache.match(browserCacheRequest(route)) : null;
      if (stored) {
        const body = await stored.text();
        const fetchedAt = Number(stored.headers.get("x-skydex-fetched-at"));
        if (Number.isFinite(fetchedAt)) {
          resource = {
            body,
            fetchedAt,
            cacheState: stored.headers.get("x-skydex-cache") ?? "browser-hit",
          };
          memoryResources.set(resourceKey(route), resource);
          if (route.endpoint === "profiles") rememberProfileOwners(body, route.id);
        }
      }
    } catch {
      resource = null;
    }
  }

  if (!resource) return null;
  const age = now - resource.fetchedAt;
  if (age <= RESOURCE_TTL_MS[route.endpoint]) return responseFor(resource, "browser-hit");
  if (allowStale && age <= STALE_MS) return responseFor(resource, "browser-stale");
  return null;
};

const failedRequest = async (response: Response): Promise<FailedRequest> => ({
  status: response.status,
  body: await response.text(),
  headers: [...response.headers.entries()],
});

const failedResponse = (failure: FailedRequest): Response =>
  new Response(failure.body, { status: failure.status, headers: failure.headers });

const isSnapshotResource = (value: unknown): value is SnapshotResource => {
  if (!value || typeof value !== "object") return false;
  const resource = value as Partial<SnapshotResource>;
  return Number.isFinite(resource.fetchedAt) && typeof resource.cache === "string" && resource.data !== undefined;
};

const isProductionSnapshot = (value: unknown): value is ProductionSnapshot => {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<ProductionSnapshot>;
  return snapshot.success === true
    && canonicalId(snapshot.uuid ?? null) !== null
    && isSnapshotResource(snapshot.resources?.profiles);
};

const storeSnapshot = async (snapshot: ProductionSnapshot) => {
  const uuid = canonicalId(snapshot.uuid);
  if (!uuid) return;
  await writeBrowserResource(
    { endpoint: "profiles", id: uuid },
    snapshot.resources.profiles.data,
    snapshot.resources.profiles.fetchedAt,
    snapshot.resources.profiles.cache,
  );

  const profileId = canonicalId(snapshot.profileId);
  if (!profileId) return;
  profileOwners.set(profileId, uuid);
  const writes: Promise<void>[] = [];
  if (isSnapshotResource(snapshot.resources.garden)) {
    writes.push(writeBrowserResource(
      { endpoint: "garden", id: profileId },
      snapshot.resources.garden.data,
      snapshot.resources.garden.fetchedAt,
      snapshot.resources.garden.cache,
    ));
  }
  if (isSnapshotResource(snapshot.resources.museum)) {
    writes.push(writeBrowserResource(
      { endpoint: "museum", id: profileId },
      snapshot.resources.museum.data,
      snapshot.resources.museum.fetchedAt,
      snapshot.resources.museum.cache,
    ));
  }
  await Promise.all(writes);
};

const loadSnapshot = (
  uuid: string,
  profileId: string | undefined,
  signal: AbortSignal,
): Promise<SnapshotLoad> => {
  const key = `${uuid}:${profileId ?? "selected"}`;
  const existing = pendingSnapshots.get(key);
  if (existing) return existing;

  const pending = (async (): Promise<SnapshotLoad> => {
    const url = new URL("/v1/hypixel/snapshot", PRODUCTION_API_ORIGIN);
    url.searchParams.set("uuid", uuid);
    if (profileId) url.searchParams.set("profile", profileId);
    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: productionHeaders(),
      signal,
    });
    if (!response.ok) return { ok: false, failure: await failedRequest(response) };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        failure: { status: 502, body: JSON.stringify({ success: false }), headers: [] },
      };
    }
    if (!isProductionSnapshot(body)) {
      return {
        ok: false,
        failure: { status: 502, body: JSON.stringify({ success: false }), headers: [] },
      };
    }
    await storeSnapshot(body);
    return { ok: true };
  })();

  pendingSnapshots.set(key, pending);
  pending.finally(() => pendingSnapshots.delete(key)).catch(() => undefined);
  return pending;
};

const transientFailure = (status: number): boolean => status === 429 || status >= 500;

/**
 * Fetch a production resource through the shared snapshot cache.
 *
 * A profiles read seeds all three resources for the selected profile. A later
 * request for another profile asks for one new snapshot and then seeds that
 * profile's garden and museum together.
 */
export const fetchProductionHypixelResource = async (
  upstreamUrl: string,
  signal: AbortSignal,
): Promise<Response> => {
  const route = resourceRoute(upstreamUrl);
  const fresh = await readBrowserResource(route, false);
  if (fresh) return fresh;
  const stale = await readBrowserResource(route, true);

  const uuid = route.endpoint === "profiles" ? route.id : profileOwners.get(route.id);
  if (uuid) {
    let snapshot: SnapshotLoad;
    try {
      snapshot = await loadSnapshot(uuid, route.endpoint === "profiles" ? undefined : route.id, signal);
    } catch {
      if (stale) return stale;
      throw new Error("Could not reach the Skydex profile API.");
    }
    if (snapshot.ok) {
      const seeded = await readBrowserResource(route, true);
      if (seeded) return seeded;
      // A snapshot can still be useful when one optional upstream read was
      // limited. Do not immediately turn that partial answer into another
      // snapshot plus an individual retry, which would spend more of the same
      // constrained allowance.
      return Response.json(
        { success: false, cause: "Skydex could not refresh that profile data." },
        { status: 503, headers: { "cache-control": "no-store", "retry-after": "60" } },
      );
    } else {
      if (stale && transientFailure(snapshot.failure.status)) return stale;
      return failedResponse(snapshot.failure);
    }
  }

  const request = buildHypixelRequest(upstreamUrl, "", true);
  let response: Response;
  try {
    response = await fetch(request.url, { ...request.init, signal });
  } catch {
    if (stale) return stale;
    throw new Error("Could not reach the Skydex profile API.");
  }
  if (!response.ok) {
    if (stale && transientFailure(response.status)) return stale;
    return response;
  }

  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return new Response(body, { status: 502, headers: response.headers });
  }
  const fetchedAt = Number(response.headers.get("x-skydex-fetched-at"));
  if (Number.isFinite(fetchedAt)) {
    await writeBrowserResource(
      route,
      parsed,
      fetchedAt,
      response.headers.get("x-skydex-cache") ?? "miss",
    );
  }
  return new Response(body, { status: response.status, headers: response.headers });
};
