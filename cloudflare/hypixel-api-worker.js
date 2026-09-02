/*
 * Skydex's narrow production Hypixel gateway.
 *
 * The browser can request only the three SkyBlock reads Skydex understands, or
 * one snapshot that composes those reads. The production key is added only to
 * the server-to-server request. Successful data is cached in fresh and stale
 * tiers; only a real cache miss spends anonymous-client, network, and global
 * quota. No upstream header, API key, IP, browser id, player id, or profile id
 * is written to analytics.
 */

const ROUTE_PREFIX = "/v1/hypixel";
const UPSTREAM_ORIGIN = "https://api.hypixel.net";
const API_HOST = "api.skydex.ca";
const INTERNAL_CACHE_ORIGIN = "https://hypixel-cache.skydex.internal";
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const STALE_TTL_SECONDS = 24 * 60 * 60;

const ENDPOINTS = {
  profiles: { path: "/v2/skyblock/profiles", parameter: "uuid", ttl: 5 * 60 },
  garden: { path: "/v2/skyblock/garden", parameter: "profile", ttl: 10 * 60 },
  museum: { path: "/v2/skyblock/museum", parameter: "profile", ttl: 30 * 60 },
};

// Analytics Engine receives this ordered numeric vector and nothing derived
// from a visitor or Minecraft account.
export const HYPIXEL_METRIC_FIELDS = [
  "request",
  "freshHit",
  "cacheMiss",
  "staleServed",
  "clientBlocked",
  "networkBlocked",
  "globalBlocked",
  "upstreamRequest",
  "upstream429",
  "quotaLimit",
  "quotaRemaining",
  "quotaResetSeconds",
];

const baseResponseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow",
};

const allowedOrigin = (origin) => {
  if (origin === "https://skydex.ca" || origin === "https://www.skydex.ca") return origin;
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin ?? "")) return origin;
  return null;
};

const corsHeaders = (request) => {
  const origin = allowedOrigin(request.headers.get("origin"));
  if (!origin) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-expose-headers": "x-skydex-cache, x-skydex-fetched-at",
    vary: "Origin",
  };
};

const responseHeaders = (request, extra = {}) => ({
  ...baseResponseHeaders,
  ...corsHeaders(request),
  ...extra,
});

const jsonError = (request, status, cause, extraHeaders = {}) =>
  Response.json(
    { success: false, cause },
    { status, headers: responseHeaders(request, extraHeaders) },
  );

const canonicalId = (value) => {
  const id = String(value ?? "").replaceAll("-", "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(id) ? id : null;
};

const oneParameter = (parameters, name, required = true) => {
  const values = parameters.getAll(name);
  if (values.length === 0 && !required) return undefined;
  if (values.length !== 1) return null;
  return canonicalId(values[0]);
};

/** Parse only the snapshot and exact single-resource reads Skydex owns. */
export const hypixelApiRoute = (input) => {
  const url = input instanceof URL ? input : new URL(String(input), `https://${API_HOST}`);
  if (!url.pathname.startsWith(`${ROUTE_PREFIX}/`)) return null;

  const endpointName = url.pathname.slice(`${ROUTE_PREFIX}/`.length);
  if (endpointName === "snapshot") {
    const keys = [...new Set(url.searchParams.keys())];
    if (keys.some((key) => key !== "uuid" && key !== "profile")) return { error: "query" };
    const uuid = oneParameter(url.searchParams, "uuid");
    const profileId = oneParameter(url.searchParams, "profile", false);
    if (!uuid || profileId === null) return { error: "query" };
    return { endpoint: "snapshot", uuid, profileId };
  }

  const endpoint = ENDPOINTS[endpointName];
  if (!endpoint) return { error: "notFound" };
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== endpoint.parameter) return { error: "query" };
  const id = oneParameter(url.searchParams, endpoint.parameter);
  if (!id) return { error: "query" };

  const upstreamUrl = new URL(endpoint.path, UPSTREAM_ORIGIN);
  upstreamUrl.searchParams.set(endpoint.parameter, id);
  return { endpoint: endpointName, id, upstreamUrl: upstreamUrl.toString() };
};

const cacheRequest = (endpoint, id, tier) => {
  const url = new URL(`/hypixel/${endpoint}`, INTERNAL_CACHE_ORIGIN);
  url.searchParams.set("id", id);
  url.searchParams.set("tier", tier);
  return new Request(url, { method: "GET" });
};

const metric = (env, values = {}) => {
  if (!env?.HYPIXEL_METRICS?.writeDataPoint) return;
  try {
    env.HYPIXEL_METRICS.writeDataPoint({
      doubles: HYPIXEL_METRIC_FIELDS.map((field) => {
        const value = Number(values[field] ?? 0);
        return Number.isFinite(value) ? value : 0;
      }),
    });
  } catch {
    // Metrics are deliberately best effort and can never break profile data.
  }
};

const rateLimit = async (limiter, key) => {
  if (!limiter?.limit) return false;
  try {
    return (await limiter.limit({ key })).success === true;
  } catch {
    return false;
  }
};

const opaqueNetworkKey = async (request) => {
  const address = request.headers.get("cf-connecting-ip") ?? "unavailable";
  const bytes = new TextEncoder().encode(`skydex-network:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const quotaStub = (env) => env?.HYPIXEL_QUOTA?.getByName?.("hypixel-production-key") ?? null;

const quotaCall = async (env, body) => {
  const stub = quotaStub(env);
  if (!stub?.fetch) return null;
  try {
    const response = await stub.fetch("https://quota.skydex.internal/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    const result = await response.json();
    return result && typeof result === "object" ? result : null;
  } catch {
    return null;
  }
};

const reserveQuota = (env) => quotaCall(env, { action: "reserve", now: Date.now() });

const observeQuota = (env, headers) => {
  const limitText = headers.get("ratelimit-limit");
  const remainingText = headers.get("ratelimit-remaining");
  const resetText = headers.get("ratelimit-reset");
  if (limitText === null || remainingText === null || resetText === null) return Promise.resolve();
  const limit = Number(limitText);
  const remaining = Number(remainingText);
  const resetSeconds = Number(resetText);
  if (![limit, remaining, resetSeconds].every(Number.isFinite)) return Promise.resolve();
  return quotaCall(env, {
    action: "observe",
    now: Date.now(),
    limit,
    remaining,
    resetSeconds,
  }).then(() => undefined);
};

const schedule = async (context, promise) => {
  if (context?.waitUntil) {
    context.waitUntil(promise);
    return;
  }
  await promise;
};

const parsedCachedResponse = async (response, cacheState) => {
  if (!response) return null;
  try {
    const body = await response.text();
    const data = JSON.parse(body);
    const fetchedAt = Number(response.headers.get("x-skydex-fetched-at"));
    if (!data || typeof data !== "object" || data.success !== true || !Number.isFinite(fetchedAt)) return null;
    return { data, body, fetchedAt, cacheState };
  } catch {
    return null;
  }
};

const boundedJson = async (response) => {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("response too large");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("response too large");
  const body = new TextDecoder().decode(bytes);
  return { body, data: JSON.parse(body) };
};

const cacheResource = async (cache, endpoint, id, resource) => {
  const definition = ENDPOINTS[endpoint];
  const common = {
    "content-type": "application/json; charset=utf-8",
    "x-skydex-fetched-at": String(resource.fetchedAt),
  };
  await Promise.all([
    cache.put(
      cacheRequest(endpoint, id, "fresh"),
      new Response(resource.body, {
        headers: { ...common, "cache-control": `public, max-age=${definition.ttl}` },
      }),
    ),
    cache.put(
      cacheRequest(endpoint, id, "stale"),
      new Response(resource.body, {
        headers: { ...common, "cache-control": `public, max-age=${STALE_TTL_SECONDS}` },
      }),
    ),
  ]);
};

const staleOrError = (request, stale, status, cause, extraHeaders = {}) => {
  if (stale) return { resource: { ...stale, cacheState: "stale" } };
  return { error: jsonError(request, status, cause, extraHeaders) };
};

const loadResource = async (endpoint, id, request, env, context, runtime) => {
  const cache = runtime.cache ?? globalThis.caches?.default;
  if (!cache?.match || !cache?.put) {
    return { error: jsonError(request, 503, "Skydex's profile cache is unavailable.") };
  }

  const fresh = await parsedCachedResponse(
    await cache.match(cacheRequest(endpoint, id, "fresh")),
    "hit",
  );
  if (fresh) {
    metric(env, { request: 1, freshHit: 1 });
    return { resource: fresh };
  }

  const stale = await parsedCachedResponse(
    await cache.match(cacheRequest(endpoint, id, "stale")),
    "stale",
  );
  metric(env, { request: 1, cacheMiss: 1 });

  const clientId = request.headers.get("x-skydex-client-id");
  const clientAllowed = await rateLimit(env?.HYPIXEL_CLIENT_LIMITER, `client:${clientId}`);
  if (!clientAllowed) {
    metric(env, { clientBlocked: 1, staleServed: stale ? 1 : 0 });
    return staleOrError(request, stale, 429, "Skydex is spacing out profile refreshes.", { "retry-after": "60" });
  }

  const networkKey = await opaqueNetworkKey(request);
  const networkAllowed = await rateLimit(env?.HYPIXEL_NETWORK_LIMITER, `network:${networkKey}`);
  if (!networkAllowed) {
    metric(env, { networkBlocked: 1, staleServed: stale ? 1 : 0 });
    return staleOrError(request, stale, 429, "Skydex is spacing out profile refreshes.", { "retry-after": "60" });
  }

  const reservation = await reserveQuota(env);
  if (!reservation?.ok || reservation.allowed !== true) {
    metric(env, {
      globalBlocked: 1,
      staleServed: stale ? 1 : 0,
      quotaLimit: reservation?.limit,
      quotaRemaining: reservation?.remaining,
    });
    const retryAfter = String(Math.max(1, Number(reservation?.retryAfter) || 60));
    return staleOrError(request, stale, 503, "Skydex is waiting for fresh Hypixel capacity.", {
      "retry-after": retryAfter,
    });
  }

  const definition = ENDPOINTS[endpoint];
  const upstreamUrl = new URL(definition.path, UPSTREAM_ORIGIN);
  upstreamUrl.searchParams.set(definition.parameter, id);
  const fetcher = runtime.fetch ?? globalThis.fetch;
  // Dashboard pastes can carry an invisible newline. Keep it out of the
  // outbound header without ever exposing or otherwise transforming the value.
  const credential = String(env.HYPIXEL_API_KEY).trim();
  let upstream;
  try {
    upstream = await fetcher(upstreamUrl.toString(), {
      method: "GET",
      headers: { accept: "application/json", "API-Key": credential },
      // Workers intentionally does not implement redirect="error". Manual
      // preserves the same security boundary because the 3xx response reaches
      // the non-success branch below and is never followed.
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    metric(env, { staleServed: stale ? 1 : 0, upstreamRequest: 1 });
    return staleOrError(request, stale, 502, "Skydex could not reach Hypixel. Try again shortly.");
  }

  const observed = observeQuota(env, upstream.headers);
  await schedule(context, observed);
  const quotaLimit = Number(upstream.headers.get("ratelimit-limit"));
  const quotaRemaining = Number(upstream.headers.get("ratelimit-remaining"));
  const quotaResetSeconds = Number(upstream.headers.get("ratelimit-reset"));
  metric(env, {
    upstreamRequest: 1,
    upstream429: upstream.status === 429 ? 1 : 0,
    quotaLimit,
    quotaRemaining,
    quotaResetSeconds,
  });

  if (upstream.status === 401 || upstream.status === 403) {
    return staleOrError(request, stale, 502, "Skydex's Hypixel connection needs attention.");
  }
  if (upstream.status === 429) {
    const retryAfter = upstream.headers.get("retry-after") ?? "60";
    return staleOrError(request, stale, 503, "Skydex is waiting for fresh Hypixel capacity.", {
      "retry-after": retryAfter,
    });
  }
  if (!upstream.ok) {
    return staleOrError(request, stale, 502, "Hypixel could not answer that Skydex profile request.");
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return staleOrError(request, stale, 502, "Hypixel returned an unexpected response.");
  }

  let body;
  let data;
  try {
    ({ body, data } = await boundedJson(upstream));
  } catch {
    return staleOrError(request, stale, 502, "Hypixel returned an unexpected response.");
  }
  if (!data || typeof data !== "object" || data.success !== true) {
    return staleOrError(request, stale, 502, "Hypixel returned an unexpected response.");
  }

  const resource = { data, body, fetchedAt: Date.now(), cacheState: "miss" };
  await schedule(context, cacheResource(cache, endpoint, id, resource));
  return { resource };
};

const selectedProfileId = (profilesBody, uuid, preferredProfileId) => {
  if (!Array.isArray(profilesBody?.profiles)) return null;
  const profiles = profilesBody.profiles.filter((profile) => {
    if (!profile || typeof profile !== "object") return false;
    const members = profile.members && typeof profile.members === "object" ? profile.members : {};
    return Object.keys(members).some((memberId) => canonicalId(memberId) === uuid);
  });
  const preferred = preferredProfileId
    ? profiles.find((profile) => canonicalId(profile.profile_id) === preferredProfileId)
    : null;
  const chosen = preferred ?? profiles.find((profile) => profile.selected === true) ?? profiles[0];
  return canonicalId(chosen?.profile_id);
};

const publicResource = (resource) => resource ? {
  fetchedAt: resource.fetchedAt,
  cache: resource.cacheState,
  data: resource.data,
} : null;

const snapshotResponse = async (route, request, env, context, runtime) => {
  const profilesResult = await loadResource("profiles", route.uuid, request, env, context, runtime);
  if (profilesResult.error) return profilesResult.error;
  const profiles = profilesResult.resource;
  const profileId = selectedProfileId(profiles.data, route.uuid, route.profileId);

  let garden = null;
  let museum = null;
  if (profileId) {
    const [gardenResult, museumResult] = await Promise.all([
      loadResource("garden", profileId, request, env, context, runtime),
      loadResource("museum", profileId, request, env, context, runtime),
    ]);
    garden = gardenResult.resource ?? null;
    museum = museumResult.resource ?? null;
  }

  const resources = [profiles, garden, museum].filter(Boolean);
  const cacheState = resources.some((resource) => resource.cacheState === "stale")
    ? "stale"
    : resources.some((resource) => resource.cacheState === "miss") ? "miss" : "hit";
  const fetchedAt = Math.min(...resources.map((resource) => resource.fetchedAt));

  return Response.json({
    success: true,
    uuid: route.uuid,
    profileId,
    fetchedAt,
    resources: {
      profiles: publicResource(profiles),
      garden: publicResource(garden),
      museum: publicResource(museum),
    },
  }, {
    headers: responseHeaders(request, {
      "x-skydex-cache": cacheState,
      "x-skydex-fetched-at": String(fetchedAt),
    }),
  });
};

const directResponse = async (route, request, env, context, runtime) => {
  const result = await loadResource(route.endpoint, route.id, request, env, context, runtime);
  if (result.error) return result.error;
  const resource = result.resource;
  return new Response(resource.body, {
    status: 200,
    headers: responseHeaders(request, {
      "x-skydex-cache": resource.cacheState,
      "x-skydex-fetched-at": String(resource.fetchedAt),
    }),
  });
};

/** Handle the API hostname/path, or return null for the layout Worker. */
export const handleHypixelApiRequest = async (request, env, context, runtime = {}) => {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(`${ROUTE_PREFIX}/`)) return null;

  const origin = allowedOrigin(request.headers.get("origin"));
  if (!origin) return jsonError(request, 403, "That origin cannot use the Skydex profile API.");

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "access-control-allow-headers": "accept, x-skydex-client-id",
        "access-control-allow-methods": "GET, OPTIONS",
        "access-control-max-age": "86400",
      },
    });
  }
  if (request.method !== "GET") {
    return jsonError(request, 405, "Only GET is allowed on this Skydex API route.", { allow: "GET, OPTIONS" });
  }

  const route = hypixelApiRoute(url);
  if (!route || route.error === "notFound") return jsonError(request, 404, "That Skydex API route does not exist.");
  if (route.error) return jsonError(request, 400, "That Skydex API request is not valid.");

  const clientId = request.headers.get("x-skydex-client-id") ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId)) {
    return jsonError(request, 403, "This request is missing its anonymous Skydex browser id.");
  }
  if (!String(env?.HYPIXEL_API_KEY ?? "").trim()) {
    return jsonError(request, 503, "Skydex's Hypixel connection is not configured.");
  }

  return route.endpoint === "snapshot"
    ? snapshotResponse(route, request, env, context, runtime)
    : directResponse(route, request, env, context, runtime);
};
