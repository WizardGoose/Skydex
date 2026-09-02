import { validateSnapshot } from "./validate";
import { makeKeyedGate } from "./gate";
import {
  buildHypixelRequest,
  fetchProductionHypixelResource,
  hasHypixelApiCredential,
  usesProductionHypixelApi,
} from "./hypixelTransport";
import type { IslandFeed } from "./merge";

/**
 * The Hypixel API feed.
 *
 * This is the half of the island the mod cannot reach on its own: sack totals,
 * straight from Hypixel, for players who have not installed anything. It is
 * strictly a supplement - the API cannot see a chest and never will, which is
 * why the merge is per section rather than per source.
 *
 * Three constraints shape everything here.
 *
 * **The key is a secret and the transport boundary is the only place it is
 * handled.** The hosted site and local Skydex checkouts send no browser
 * credential at all: `hypixelTransport.ts` selects Skydex's narrow API Worker,
 * where the application key is an encrypted secret.
 * Nothing interpolates a key into a URL or error message, and the one place a
 * remote string becomes an error message runs it through `redact` first.
 *
 * **No background polling.** The keyed API is pulled on demand behind a five
 * minute TTL, which lives in the store. There is no timer in this file.
 *
 * **v1 parses only what is plain JSON.** `inv_contents`, `ender_chest_contents`
 * and the backpack blobs are base64 gzip NBT, and a subtly wrong binary parser
 * in a "where is my stuff" tool is worse than an honest blank. Those sections
 * are reported `absent` from this source, and the mod covers them properly.
 * The shape here leaves room for an `api-nbt` source to be added later without
 * anything else moving.
 */

const PROFILES_URL = "https://api.hypixel.net/v2/skyblock/profiles";
const GARDEN_URL = "https://api.hypixel.net/v2/skyblock/garden";
const MUSEUM_URL = "https://api.hypixel.net/v2/skyblock/museum";
const PLAYERDB_URL = "https://playerdb.co/api/player/minecraft/";
const ASHCON_URL = "https://api.ashcon.app/mojang/v2/user/";

/** Requests are cheap and the page should never hang on one. */
const TIMEOUT_MS = 10_000;

export interface HypixelAccount {
  /** Undashed, lower case: the form Hypixel's `members` map is keyed by. */
  uuid: string;
  name: string;
}

export interface ApiProfile {
  profileId: string;
  cuteName: string;
  /** Absent on the wire means a normal profile, which the island types spell `null`. */
  gameMode: string | null;
  selected: boolean;
  /**
   * Sack totals, or `null` when Hypixel omitted the section entirely.
   *
   * That omission is not "you own nothing" - it is how the API says the
   * player's in-game settings do not share their inventory. Collapsing the two
   * would tell someone their sacks are empty when they are simply private.
   */
  sacks: Record<string, number> | null;
}

export type ApiFailure = "auth" | "notFound" | "network" | "server" | "shape";

export interface ApiError {
  reason: ApiFailure;
  message: string;
}

export type ApiResult<T> =
  | { ok: true; value: T; fetchedAt?: number; cacheState?: string }
  | { ok: false; error: ApiError };

/**
 * Belt and braces against the one thing that must never happen.
 *
 * Hypixel's `cause` strings are fixed phrases like "Invalid API key" and have
 * no business containing a key, but this is the single point where a remote
 * string becomes something we display, store in state, and potentially log. The
 * cost of the guarantee is one `replaceAll`.
 */
const redact = (message: string, secret: string): string =>
  secret && message.includes(secret) ? message.replaceAll(secret, "[redacted]") : message;

/**
 * A uuid has two canonical forms here and they belong to two different readers.
 *
 *   undashed  Hypixel's form. It is what `?uuid=` takes and what the `members`
 *             map is keyed by, so it is what goes on the wire.
 *   dashed    the island spec's form. A snapshot's `player.uuid` is pinned
 *             dashed, and since the mod feed and this feed merge into one
 *             store, an API-built snapshot has to match or the merged value's
 *             format would silently depend on which source happened to win.
 *
 * Keeping both as functions rather than threading the original string around
 * means every call site states which reader it is serving.
 */
export const undash = (uuid: string): string => uuid.replace(/-/g, "").toLowerCase();

/** 8-4-4-4-12. Anything that is not 32 hex characters is passed through untouched. */
export const dash = (uuid: string): string => {
  const bare = undash(uuid);
  if (!/^[0-9a-f]{32}$/.test(bare)) return uuid;
  return `${bare.slice(0, 8)}-${bare.slice(8, 12)}-${bare.slice(12, 16)}-${bare.slice(16, 20)}-${bare.slice(20)}`;
};

/** 32 hex characters, dashed or not. Anything else is a name, not a uuid. */
export const looksLikeUuid = (value: string): boolean => /^[0-9a-f]{32}$/.test(undash(value.trim()));

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const withTimeoutTask = async <T>(
  task: (signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> => {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(deadline);
    signal?.removeEventListener("abort", onAbort);
  }
};

const withTimeout = (url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> =>
  withTimeoutTask((timeoutSignal) => fetch(url, { ...init, signal: timeoutSignal }), signal);

/** One authenticated request boundary for every keyed Hypixel endpoint. */
const fetchAuthenticated = async (url: string, key: string, signal?: AbortSignal): Promise<Response> => {
  if (usesProductionHypixelApi()) {
    return withTimeoutTask((timeoutSignal) => fetchProductionHypixelResource(url, timeoutSignal), signal);
  }
  const request = buildHypixelRequest(url, key);
  return withTimeout(request.url, request.init, signal);
};

const responseMetadata = (response: Response): { fetchedAt?: number; cacheState?: string } => {
  const fetchedAtText = response.headers.get("x-skydex-fetched-at");
  const fetchedAt = fetchedAtText === null ? Number.NaN : Number(fetchedAtText);
  const cacheState = response.headers.get("x-skydex-cache");
  return {
    ...(Number.isFinite(fetchedAt) ? { fetchedAt } : {}),
    ...(cacheState ? { cacheState } : {}),
  };
};

/* -------------------------------------------------------------------------- */
/* UUID resolution                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Turn an IGN into a uuid, browser-side.
 *
 * `api.mojang.com` is the obvious choice and is unusable here: it answers 200
 * but sends no `Access-Control-Allow-Origin`, so the browser discards the
 * response. playerdb and ashcon both send `*`, so they are the two that work.
 * A player who would rather not involve either can paste a uuid directly and
 * skip this entirely.
 */
/**
 * Remembers the last answer per name, briefly.
 *
 * The hole this closes is specific and easy to miss. `connect()` resolves the
 * name FIRST and only calls the keyed pull if that succeeded, so a failed
 * resolve never moves the Hypixel cooldown and the button re-enables at once.
 * Somebody fixing a typo therefore hammers playerdb and ashcon as fast as they
 * can click, and because each attempt legitimately fails fast, no
 * success-shaped guard ever trips.
 *
 * Keyed on the name rather than floored globally, because those are different
 * questions. Asking the same wrong name again cannot produce a different
 * answer, so it is replayed from memory for nothing; asking a DIFFERENT name is
 * a new question and goes straight through, which it must, since making a
 * player wait ten seconds to correct a typo would be hostile.
 *
 * Thirty seconds. Long enough to cover a burst of clicking, short enough that a
 * genuinely new account registered mid-session is still findable.
 */
const resolveGate = makeKeyedGate<ApiResult<HypixelAccount>>(30_000);

export async function resolveAccount(input: string, signal?: AbortSignal): Promise<ApiResult<HypixelAccount>> {
  const trimmed = input.trim();
  // Keyed on the trimmed name, so "Steve " and "Steve" are one question. The
  // early shape rejections below never touch the network and so never reach
  // the gate.
  return resolveGate.run(trimmed.toLowerCase(), () => runResolveAccount(trimmed, signal));
}

async function runResolveAccount(input: string, signal?: AbortSignal): Promise<ApiResult<HypixelAccount>> {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: { reason: "shape", message: "Enter a Minecraft username or UUID." } };

  // A pasted uuid needs no lookup at all.
  if (looksLikeUuid(trimmed)) return { ok: true, value: { uuid: undash(trimmed), name: "" } };

  if (!/^[A-Za-z0-9_]{1,16}$/.test(trimmed)) {
    return { ok: false, error: { reason: "shape", message: "That is not a valid Minecraft username or UUID." } };
  }

  try {
    const res = await withTimeout(PLAYERDB_URL + encodeURIComponent(trimmed), {}, signal);
    if (res.ok) {
      const body: unknown = await res.json();
      const player = isObject(body) && isObject(body.data) ? body.data.player : null;
      if (isObject(player)) {
        // `raw_id` is the undashed form, which is what Hypixel expects. `id` is
        // dashed and will not match the `members` map.
        const raw = typeof player.raw_id === "string" ? player.raw_id : "";
        const dashed = typeof player.id === "string" ? player.id : "";
        const uuid = undash(raw || dashed);
        if (looksLikeUuid(uuid)) {
          return { ok: true, value: { uuid, name: typeof player.username === "string" ? player.username : trimmed } };
        }
      }
    }
  } catch {
    // Fall through to the backup. One name service being down is not an error
    // worth showing anybody.
  }

  try {
    const res = await withTimeout(ASHCON_URL + encodeURIComponent(trimmed), {}, signal);
    if (res.ok) {
      const body: unknown = await res.json();
      if (isObject(body) && typeof body.uuid === "string") {
        const uuid = undash(body.uuid);
        if (looksLikeUuid(uuid)) {
          return { ok: true, value: { uuid, name: typeof body.username === "string" ? body.username : trimmed } };
        }
      }
    }
    if (res.status === 404) {
      return { ok: false, error: { reason: "notFound", message: `No Minecraft account named "${trimmed}".` } };
    }
  } catch {
    // Both are down or blocked.
  }

  return {
    ok: false,
    error: {
      reason: "network",
      message: "Could not look up that username. Check your connection, or paste your UUID instead.",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Parsing, kept pure so it can be tested without a network                    */
/* -------------------------------------------------------------------------- */

/** Only finite, non-negative counts survive. A negative sack would poison every sum downstream. */
const readCounts = (value: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!isObject(value)) return out;
  for (const [id, raw] of Object.entries(value)) {
    if (!id) continue;
    // Deliberately not `Number(raw)` on anything: `Number(null)`, `Number("")`
    // and `Number([])` are all 0, which would turn a broken field into a
    // confident zero sack rather than dropping it.
    let n: number;
    if (typeof raw === "number") n = raw;
    else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
    else continue;
    if (!Number.isFinite(n) || n < 0) continue;
    out[id] = n;
  }
  return out;
};

/**
 * Find the sack totals on a profile member.
 *
 * Hypixel has moved this field: older payloads carry `sacks_counts` at the top
 * of the member, newer ones nest it under `inventory`. Both are checked, the
 * nested one preferred when somehow both exist, and neither being present is
 * reported as `null` rather than as an empty object, because the difference is
 * "private" versus "empty".
 */
export function readSacks(member: unknown): Record<string, number> | null {
  if (!isObject(member)) return null;

  const inventory = isObject(member.inventory) ? member.inventory : null;
  if (inventory && isObject(inventory.sacks_counts)) return readCounts(inventory.sacks_counts);
  if (isObject(member.sacks_counts)) return readCounts(member.sacks_counts);

  return null;
}

/**
 * Pull the profile list out of a `/v2/skyblock/profiles` response.
 *
 * Malformed profiles are skipped rather than failing the pull, on the same
 * principle as the chest reader: one bad row must not cost the player the rest.
 */
export function parseProfiles(payload: unknown, uuid: string): ApiProfile[] {
  if (!isObject(payload) || !Array.isArray(payload.profiles)) return [];
  const key = undash(uuid);
  const out: ApiProfile[] = [];

  for (const raw of payload.profiles) {
    if (!isObject(raw)) continue;
    const members = isObject(raw.members) ? raw.members : {};

    // The map is keyed undashed, but normalise both sides rather than trusting it.
    let member: unknown;
    for (const [memberId, value] of Object.entries(members)) {
      if (undash(memberId) === key) {
        member = value;
        break;
      }
    }
    if (member === undefined) continue;

    out.push({
      profileId: typeof raw.profile_id === "string" ? raw.profile_id : "",
      cuteName: typeof raw.cute_name === "string" ? raw.cute_name : "Profile",
      // Absent means normal. Hypixel only sends this field for the odd modes.
      gameMode: typeof raw.game_mode === "string" && raw.game_mode !== "" ? raw.game_mode : null,
      selected: raw.selected === true,
      sacks: readSacks(member),
    });
  }

  return out;
}

/**
 * Which profile to show.
 *
 * An explicit choice from the player wins, because they made it on purpose and
 * having the page snap back to `selected` on every refresh would be maddening.
 * Otherwise the profile Hypixel marks as selected, otherwise the first one.
 */
export function chooseProfile(list: ApiProfile[], preferredId?: string | null): ApiProfile | null {
  if (list.length === 0) return null;
  if (preferredId) {
    const preferred = list.find((p) => p.profileId === preferredId);
    if (preferred) return preferred;
  }
  return list.find((p) => p.selected) ?? list[0];
}

/**
 * Wrap a parsed profile as a feed.
 *
 * Everything the API can tell us about sections is decided here, once. The
 * snapshot goes through the same validator as a mod snapshot so there is
 * exactly one definition of a valid island in this codebase, and the empty
 * `chests` array it necessarily carries is neutralised by `chests: "absent"`.
 */
export function apiFeed(profile: ApiProfile, account: HypixelAccount, at: number): IslandFeed {
  const snapshot = validateSnapshot({
    schema: 1,
    exportedAt: at,
    // Dashed, because the spec pins a snapshot's `player.uuid` dashed and this
    // snapshot sits in the same store as the mod's. `account.uuid` stays
    // undashed for the wire; the two forms serve two different readers.
    player: { uuid: dash(account.uuid), name: account.name },
    profile: { name: profile.cuteName, gameMode: profile.gameMode },
    sacks: profile.sacks ?? {},
    chests: [],
  });

  return {
    source: "api",
    receivedAt: at,
    snapshot,
    sections: {
      sacks:
        profile.sacks === null ? "hidden" : Object.keys(profile.sacks).length > 0 ? "captured" : "empty",
      // Not "empty". The API has never been able to see these and pretending
      // otherwise is the exact failure this whole four-state scheme prevents.
      chests: "absent",
      inventory: "absent",
      enderChest: "absent",
      storage: "absent",
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Refresh policy                                                             */
/* -------------------------------------------------------------------------- */

export interface AutoRefreshInput {
  /** A key and an account are both required before any authed call is possible. */
  hasCredentials: boolean;
  /** True while the mod's live transport is connected. */
  modLive: boolean;
  /** When the last successful pull landed, or null if there has never been one. */
  lastPullAt: number | null;
  now: number;
  ttlMs: number;
}

/**
 * Should the site pull the profile API on its own?
 *
 * Pulled out as a pure function because it is policy, not plumbing, and policy
 * is the part worth pinning down in a test. Three independent reasons to say
 * no, and each one matters:
 *
 *   no credentials  most visitors have no key and want none. An automatic call
 *                   they cannot make is not worth an error message.
 *   mod is live     the mod covers every section the API would answer for, is
 *                   fresher, and has no rate limit. Spending someone's quota to
 *                   fetch a worse copy of data already on screen is pure waste.
 *   inside the TTL  a pull five minutes old is still current enough.
 *
 * A manual refresh bypasses all three. This governs only what the site does
 * unasked.
 */
export function shouldAutoRefresh(input: AutoRefreshInput): boolean {
  if (!input.hasCredentials) return false;
  if (input.modLive) return false;
  if (input.lastPullAt === null) return true;
  return input.now - input.lastPullAt >= input.ttlMs;
}

/* -------------------------------------------------------------------------- */
/* The one authed request                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the player's profiles.
 *
 * Doubles as key validation: a 200 proves the key works, a 403 proves it does
 * not, and there is no reason to spend a second request finding that out.
 *
 * Both the live site and local Skydex checkouts send this request through the
 * allowlisted Worker; no application key exists in the browser or built files.
 */
export async function fetchProfiles(
  account: HypixelAccount,
  key: string,
  signal?: AbortSignal
): Promise<ApiResult<ApiProfile[]>> {
  if (!hasHypixelApiCredential(key)) {
    return { ok: false, error: { reason: "auth", message: "Skydex's Hypixel connection is unavailable right now." } };
  }

  let res: Response;
  try {
    res = await fetchAuthenticated(`${PROFILES_URL}?uuid=${encodeURIComponent(account.uuid)}`, key, signal);
  } catch {
    // Deliberately says nothing about the request. No URL, no headers.
    return {
      ok: false,
      error: { reason: "network", message: "Could not reach the Hypixel API. Check your connection." },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const cause = isObject(body) && typeof body.cause === "string" ? redact(body.cause, key.trim()) : "";

  if (res.status === 403 || res.status === 401) {
    return { ok: false, error: { reason: "auth", message: "Skydex could not authenticate with Hypixel." } };
  }
  if (res.status === 429) {
    return {
      ok: false,
      error: { reason: "server", message: cause || "Hypixel is rate limiting this connection. Try again shortly." },
    };
  }
  if (!res.ok) {
    return { ok: false, error: { reason: "server", message: cause || `Hypixel API responded ${res.status}.` } };
  }
  if (!isObject(body) || body.success !== true) {
    return { ok: false, error: { reason: "shape", message: cause || "Hypixel returned an unexpected response." } };
  }

  const profiles = parseProfiles(body, account.uuid);
  if (profiles.length === 0) {
    return {
      ok: false,
      error: { reason: "notFound", message: "That account has no SkyBlock profiles Hypixel will share." },
    };
  }

  return { ok: true, value: profiles, ...responseMetadata(res) };
}

/* -------------------------------------------------------------------------- */
/* The garden endpoint                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Turn a finished response into one of our failures.
 *
 * The logic is the same shape `fetchProfiles` runs inline, lifted here rather
 * than shared with it. Two endpoints deserve one rule, and the moment there was
 * a second caller the copy stopped being justified. It is a separate function
 * rather than an edit to `fetchProfiles` only because that function is being
 * read by other work in this tree right now; folding the two together is a
 * tidy-up for whoever touches this file next, not a behaviour change to sneak
 * in underneath somebody.
 *
 * `null` means the response was fine. Same redaction guarantee as everywhere
 * else here: nothing that came off the wire reaches a message unredacted, and
 * no URL or header is ever named.
 */
const classifyResponse = (res: Response, body: unknown, key: string): ApiError | null => {
  const cause = isObject(body) && typeof body.cause === "string" ? redact(body.cause, key) : "";

  if (res.status === 403 || res.status === 401) {
    return { reason: "auth", message: "Skydex could not authenticate with Hypixel." };
  }
  if (res.status === 429) {
    return { reason: "server", message: cause || "Hypixel is rate limiting this connection. Try again shortly." };
  }
  if (!res.ok) {
    return { reason: "server", message: cause || `Hypixel API responded ${res.status}.` };
  }
  if (!isObject(body) || body.success !== true) {
    return { reason: "shape", message: cause || "Hypixel returned an unexpected response." };
  }
  return null;
};

/**
 * Fetch one profile's garden.
 *
 * The garden is its own endpoint, not a section of the profile member, which is
 * why greenhouse numbers cost a second request rather than riding along with
 * the sacks pull. It is keyed by *profile* id, not by player uuid: one garden
 * per profile, shared by everybody on it.
 *
 * The query parameter is `profile`, not `profileId`. That is worth a line of
 * its own because the obvious guess is wrong and a wrong parameter name comes
 * back as a perfectly cheerful failure rather than an error. Verified twice:
 * Hypixel's own OpenAPI spec, and the Refit interface EliteFarmers run in
 * production, which spells it `[Get("/skyblock/garden?profile={profileId}")]`.
 *
 * Returns the `garden` object itself, unparsed and typed `unknown`. Every
 * decision about what a field means belongs to `profileStats.ts`, so this
 * function stays a transport and the field names stay in one file.
 */
export async function fetchGarden(
  profileId: string,
  key: string,
  signal?: AbortSignal
): Promise<ApiResult<unknown>> {
  if (!hasHypixelApiCredential(key)) {
    return { ok: false, error: { reason: "auth", message: "Skydex's Hypixel connection is unavailable right now." } };
  }
  if (!profileId.trim()) {
    return { ok: false, error: { reason: "shape", message: "No SkyBlock profile selected." } };
  }

  let res: Response;
  try {
    res = await fetchAuthenticated(`${GARDEN_URL}?profile=${encodeURIComponent(profileId.trim())}`, key, signal);
  } catch {
    return {
      ok: false,
      error: { reason: "network", message: "Could not reach the Hypixel API. Check your connection." },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const failure = classifyResponse(res, body, key.trim());
  if (failure) return { ok: false, error: failure };

  // A profile with no Garden unlocked answers 200 with no `garden` object at
  // all. That is not an error and must not be reported as one: it is the API
  // saying this profile has never been to the Garden, and the parser turns it
  // into the same honest blank as any other absent field.
  const garden = isObject(body) && isObject(body.garden) ? body.garden : null;
  return { ok: true, value: garden, ...responseMetadata(res) };
}

/* -------------------------------------------------------------------------- */
/* The museum endpoint                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Fetch one profile's museum.
 *
 * Its own endpoint, like the garden, and keyed by PROFILE id rather than by
 * player uuid, so the whole co-op shares one museum document with a `members`
 * map inside it. The query parameter is `profile`, the same trap `fetchGarden`
 * documents.
 *
 * Returns `members[uuid]` for the player asked about, untouched and typed
 * `unknown`: what a museum field means belongs to whoever reads it, and this
 * function's job ends at handing over the right slice.
 *
 * A profile that has never opened the museum, or a player whose Museum API
 * toggle is off, answers 200 with no matching member. That is `null`, not an
 * error, and the caller renders it as "not shared" rather than as "empty".
 */
export async function fetchMuseum(
  profileId: string,
  playerUuid: string,
  key: string,
  signal?: AbortSignal
): Promise<ApiResult<unknown>> {
  if (!hasHypixelApiCredential(key)) {
    return { ok: false, error: { reason: "auth", message: "Skydex's Hypixel connection is unavailable right now." } };
  }
  if (!profileId.trim()) {
    return { ok: false, error: { reason: "shape", message: "No SkyBlock profile selected." } };
  }

  let res: Response;
  try {
    res = await fetchAuthenticated(`${MUSEUM_URL}?profile=${encodeURIComponent(profileId.trim())}`, key, signal);
  } catch {
    return {
      ok: false,
      error: { reason: "network", message: "Could not reach the Hypixel API. Check your connection." },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const failure = classifyResponse(res, body, key.trim());
  if (failure) return { ok: false, error: failure };

  const members = isObject(body) && isObject(body.members) ? body.members : null;
  if (!members) return { ok: true, value: null, ...responseMetadata(res) };

  const wanted = undash(playerUuid);
  for (const [memberId, value] of Object.entries(members)) {
    if (undash(memberId) === wanted) return { ok: true, value, ...responseMetadata(res) };
  }
  return { ok: true, value: null, ...responseMetadata(res) };
}

/* -------------------------------------------------------------------------- */
/* The raw member, for readers that need more than sacks                      */
/* -------------------------------------------------------------------------- */

/** What `fetchProfileMember` hands back: the member, plus which profile it came from. */
export interface ProfileMember {
  /**
   * The member object exactly as Hypixel sent it, untouched and typed
   * `unknown` on purpose.
   *
   * Every decision about what a field means belongs to the module that reads
   * it, the same rule `fetchGarden` follows. This function's job ends at
   * "here is the right member of the right profile".
   */
  member: unknown;
  profileId: string;
  cuteName: string;
  gameMode: string | null;
  /** What Hypixel marks as the player's current profile. Exactly one is true. */
  selected: boolean;
  /**
   * The co-op bank balance, from `profile.banking.balance`.
   *
   * Profile level rather than member level, because bank access is shared by
   * everybody on the profile. `null` when Hypixel omitted it, which means the
   * player's Banking API toggle is off and NOT that the bank is empty. The two
   * must stay apart for the same reason `sacks` does: one is a privacy setting
   * and the other is a claim about somebody's coins.
   *
   * Optional rather than required only so that code constructing this shape by
   * hand, which predates the field, keeps compiling. `fetchProfileMembers` is
   * the sole real producer and always sets it, so a reader seeing `undefined`
   * should treat it exactly as it treats `null`.
   */
  bankBalance?: number | null;
}

/**
 * Fetch one profile member in full.
 *
 * WHY THIS EXISTS ALONGSIDE `fetchProfiles`
 * -----------------------------------------
 * `parseProfiles` deliberately keeps only sack totals, because that was the
 * only thing v1 could honestly read: everything else interesting on a member is
 * base64 gzip NBT, and this file's own header explains why a subtly wrong
 * binary parser is worse than a blank. `src/nbt` is that parser now, so the
 * accessory bag and the plain-JSON collection map are both readable, and both
 * live on the member that `parseProfiles` throws away.
 *
 * The obvious fix is to widen `ApiProfile` with the raw member. That is the
 * wrong shape: `ApiProfile` is a small, fully-parsed value that several readers
 * already treat as a complete description of a profile, and hanging an
 * `unknown` off it would quietly make every one of them carry a payload they
 * have no business seeing. So this is a second, narrower reader rather than a
 * widening of the first, and `ApiProfile`, `parseProfiles` and `fetchProfiles`
 * are all untouched.
 *
 * What it must NOT be is a fetch living in the accessories module. The header
 * of this file states that the key is a secret and that this file is the only
 * place it is handled, and that invariant is worth more than saving a function.
 * So the request stays here, with the same header, the same timeout and the
 * same redaction as every other call in this module.
 *
 * `preferredProfileId` follows `chooseProfile`: an explicit choice wins, then
 * the profile Hypixel marks selected, then the first one.
 */
export async function fetchProfileMember(
  account: HypixelAccount,
  key: string,
  preferredProfileId?: string | null,
  signal?: AbortSignal
): Promise<ApiResult<ProfileMember>> {
  const all = await fetchProfileMembers(account, key, signal);
  if (!all.ok) return all;

  // The selection rule is `chooseProfile`'s, spelled out again rather than
  // shared, because that function takes `ApiProfile` and this list is a
  // different shape. Keeping the three steps identical is the point: two
  // readers disagreeing about which profile is "the" profile shows up as
  // numbers from one profile sitting beside numbers from another.
  const chosen =
    (preferredProfileId ? all.value.find((c) => c.profileId === preferredProfileId) : undefined) ??
    all.value.find((c) => c.selected) ??
    all.value[0];

  return {
    ok: true,
    value: chosen,
    ...(all.fetchedAt === undefined ? {} : { fetchedAt: all.fetchedAt }),
    ...(all.cacheState === undefined ? {} : { cacheState: all.cacheState }),
  };
}

/**
 * Fetch EVERY profile's member, in the order Hypixel listed them.
 *
 * Same one request as `fetchProfileMember`, same header, same redaction; the
 * only difference is that nothing is chosen. It exists because the shard
 * importer has to show the player a list and let them switch between profiles,
 * and a reader that picks for you cannot answer "what else is there".
 *
 * `fetchProfileMember` is now a thin choose-one wrapper over this, so there is
 * one request shape and one definition of "a member of a profile" rather than
 * two copies drifting apart.
 */
export async function fetchProfileMembers(
  account: HypixelAccount,
  key: string,
  signal?: AbortSignal
): Promise<ApiResult<ProfileMember[]>> {
  if (!hasHypixelApiCredential(key)) {
    return { ok: false, error: { reason: "auth", message: "Skydex's Hypixel connection is unavailable right now." } };
  }

  let res: Response;
  try {
    res = await fetchAuthenticated(`${PROFILES_URL}?uuid=${encodeURIComponent(account.uuid)}`, key, signal);
  } catch {
    // Says nothing about the request. No URL, no headers, same as everywhere else here.
    return {
      ok: false,
      error: { reason: "network", message: "Could not reach the Hypixel API. Check your connection." },
    };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  const failure = classifyResponse(res, body, key.trim());
  if (failure) return { ok: false, error: failure };

  if (!isObject(body) || !Array.isArray(body.profiles)) {
    return {
      ok: false,
      error: { reason: "notFound", message: "That account has no SkyBlock profiles Hypixel will share." },
    };
  }

  const wanted = undash(account.uuid);

  // Walk the raw list rather than reusing `parseProfiles`, because the whole
  // point is the member object that function drops.
  const candidates: ProfileMember[] = [];
  for (const raw of body.profiles) {
    if (!isObject(raw)) continue;
    const members = isObject(raw.members) ? raw.members : {};
    for (const [memberId, value] of Object.entries(members)) {
      if (undash(memberId) === wanted) {
        const banking = isObject(raw.banking) ? raw.banking : null;
        candidates.push({
          member: value,
          profileId: typeof raw.profile_id === "string" ? raw.profile_id : "",
          cuteName: typeof raw.cute_name === "string" ? raw.cute_name : "Profile",
          // Absent means normal. Hypixel only sends this field for the odd modes.
          gameMode: typeof raw.game_mode === "string" && raw.game_mode !== "" ? raw.game_mode : null,
          selected: raw.selected === true,
          bankBalance: typeof banking?.balance === "number" ? banking.balance : null,
        });
        break;
      }
    }
  }

  if (candidates.length === 0) {
    return {
      ok: false,
      error: { reason: "notFound", message: "That account has no SkyBlock profiles Hypixel will share." },
    };
  }

  return { ok: true, value: candidates, ...responseMetadata(res) };
}
