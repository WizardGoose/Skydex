import { useCallback, useSyncExternalStore } from "react";
import { decodeIslandCode } from "./code";
import { decodeFeeds, encodeFeeds, ISLAND_KEY } from "./storage";
import { applyLiveMessage, applyLivePayload, EVENTS_PATH, ISLAND_EVENT } from "./live";
import { mergeFeeds, modFeed } from "./merge";
import { apiFeed, chooseProfile, fetchProfiles, shouldAutoRefresh } from "./hypixel";
import { currentAccess, hasApiProfileAccess, writeAccess } from "./apiKey";
import { makeGate } from "./gate";
import { applyApiGameMode } from "../profile/useProfile";
import type { FeedSet, MergedIsland } from "./merge";
import type { ApiProfile, HypixelAccount } from "./hypixel";
import type { IslandSnapshot, StoredIsland } from "./types";
import { isCompanionLinked, subscribeCompanionLink } from "./companionLink";
import { createCompanionTransportGate } from "./companionTransportGate";

/**
 * The island store: two feeds, one view.
 *
 * The companion mod arrives over a localhost server and the Hypixel API arrives
 * over an authenticated fetch, and they are kept as separate feeds right up
 * until the moment they are read. `merge.ts` folds them into a single
 * `IslandSnapshot`, which is what every consumer sees - the Items page, the
 * sack lookup, this page. Nothing downstream has to know there are two sources,
 * and `sections` carries the provenance for the one place that does care.
 *
 * The two sources are fetched on completely different terms, and the asymmetry
 * is deliberate:
 *
 *   mod  unauthenticated, local, free. Preferred as a Server-Sent Events
 *        stream, which the browser parses natively so the mod can push the
 *        moment a chest changes instead of us asking twice a minute whether
 *        anything happened. Falls back to the older poll (5 s while healthy,
 *        30 s while not) if the stream will not open. Either way it starts only
 *        after the player explicitly links the mod in Settings and a consumer
 *        subscribes, then stops on unlink or with the last subscriber.
 *   api  authenticated, remote, rate limited, and someone else's server. Never
 *        polled. Pulled on demand behind a five minute TTL, with a floor
 *        between attempts so a frustrated click cannot become a burst.
 *
 * Exactly one mod transport runs at a time. The stream is tried first; a
 * failure closes it before polling starts, and polling never upgrades back
 * mid-subscription. That last rule is what stops a mod that serves `/v1/health`
 * but not `/v1/events` from flapping between the two every five seconds.
 */

/** The mod binds 127.0.0.1 only, never 0.0.0.0. Same host string on both ends. */
const ORIGIN = "http://127.0.0.1:27916";

const LIVE_MS = 5_000;
const OFFLINE_MS = 30_000;
/* Refused connections cannot be silenced from script: every probe against a
   closed port writes its own console line. So an absent mod backs off, 30s
   doubling to this ceiling, and the tab regaining focus probes immediately -
   which is both quieter over an idle evening and FASTER at noticing the mod
   the moment the player alt-tabs back from starting it. */
const OFFLINE_MAX_MS = 300_000;
let offlineStreak = 0;

/**
 * Per-request ceiling for the mod. Short on purpose: a hung socket must never
 * stall the loop, because a stalled loop looks exactly like a working one with
 * nothing new to say.
 */
const TIMEOUT_MS = 2_500;

/** How long an API pull stays fresh, and the floor between two attempts. */
const API_TTL = 5 * 60 * 1000;
const API_MIN_GAP = 10_000;

/**
 * `live`    the mod is answering; its numbers are current.
 * `offline` no mod, but something is stored - a mod snapshot, an API pull, or both.
 * `empty`   nothing at all.
 */
export type IslandStatus = "live" | "offline" | "empty";

export type ApiStatus = "idle" | "loading" | "error";

export interface IslandState {
  /**
   * The merged view wrapped the way it always was: `receivedAt` is when the
   * freshest feed landed. Kept for the header's "snapshot from…" line.
   */
  stored: StoredIsland | null;
  snapshot: IslandSnapshot | null;
  merged: MergedIsland;
  status: IslandStatus;
  /** The mod version from /v1/health, when it is live and reports one. */
  modVersion: string | null;
  /**
   * The last thing that went *wrong*, which is not the same as "the mod is not
   * running". A closed port is expected; a code that failed to decode, or a
   * live payload that failed validation, is worth telling the player about.
   */
  lastError: string | null;
  apiStatus: ApiStatus;
  apiError: string | null;
  /** This session's profile list, for the switcher. Not persisted; a refresh repopulates it. */
  apiProfiles: ApiProfile[];
}

const readFromDisk = (): FeedSet => {
  if (typeof localStorage === "undefined") return {};
  try {
    return decodeFeeds(localStorage.getItem(ISLAND_KEY));
  } catch {
    return {};
  }
};

// Read once, at module load, before anything can possibly write. That ordering
// is what makes the v1 -> v2 migration safe: a legacy blob is always parsed
// forward before the first write could replace it.
let feeds: FeedSet = readFromDisk();
let merged: MergedIsland = mergeFeeds(feeds);

/**
 * Recompute the merged view.
 *
 * The merge now depends on whether the mod is live, because live mod data
 * replaces the API for the sections both can supply. Liveness and feeds change
 * at different moments, so this runs from one place and every publish goes
 * through it rather than each call site remembering to pass the flag.
 */
const recompute = () => {
  merged = mergeFeeds(feeds, { modLive: status === "live" });
};

let status: IslandStatus = merged.snapshot ? "offline" : "empty";
let lastError: string | null = null;
let apiStatus: ApiStatus = "idle";
let apiError: string | null = null;
let apiProfiles: ApiProfile[] = [];
let modVersion: string | null = null;

const asStored = (): StoredIsland | null => {
  if (!merged.snapshot) return null;
  return { receivedAt: Math.max(merged.sources.mod ?? 0, merged.sources.api ?? 0), snapshot: merged.snapshot };
};

/**
 * `useSyncExternalStore` compares snapshots by identity and loops forever if
 * `getSnapshot` builds a fresh object each call, so the view is rebuilt only
 * when something actually changed.
 */
let view: IslandState = {
  stored: asStored(),
  snapshot: merged.snapshot,
  merged,
  status,
  modVersion,
  lastError,
  apiStatus,
  apiError,
  apiProfiles,
};

const listeners = new Set<() => void>();

const publish = () => {
  recompute();
  view = {
    stored: asStored(),
    snapshot: merged.snapshot,
    merged,
    status,
    modVersion,
    lastError,
    apiStatus,
    apiError,
    apiProfiles,
  };
  for (const fn of listeners) fn();
};

const getSnapshot = () => view;

/**
 * The last thing written to disk, and the yardstick for "did anything change".
 *
 * Seeded from what was already on disk so the very first live message, which
 * almost always repeats the stored snapshot verbatim, is recognised as a no-op
 * instead of being treated as news.
 */
let lastEncoded: string | null = (() => {
  try {
    return feeds.mod || feeds.api ? encodeFeeds(feeds) : null;
  } catch {
    return null;
  }
})();

/**
 * Persist the feeds and recompute the merge. Touches exactly one key, ever.
 *
 * WHY THIS COMPARES BEFORE IT COMMITS
 * -----------------------------------
 * The mod pushes a snapshot on every capture, and the fallback poll asks for
 * one every five seconds whether or not anything moved. Both used to land here
 * unconditionally, so a player standing still still cost a full serialisation
 * of the whole island to `localStorage`, a rebuilt merge, and a re-render of
 * every chest grid on the page, four times a minute. That is the reported
 * "refreshing": not a reload, but the whole board rebuilt underneath the player.
 *
 * The comparison is the serialised form, which costs nothing extra because it
 * is the exact string that was going to be written anyway. It is also an exact
 * deep comparison rather than a heuristic on timestamps, so a snapshot that
 * differs only in `exportedAt` is still correctly seen as different, and one
 * that repeats byte for byte is correctly seen as nothing.
 *
 * Returns whether the feeds actually changed, so the caller can decide whether
 * a publish is warranted.
 */
const setFeeds = (next: FeedSet): boolean => {
  const encoded = next.mod || next.api ? encodeFeeds(next) : null;
  if (encoded === lastEncoded) {
    // Identical content. Keep the objects we already have, so every identity
    // downstream stays put and nothing re-renders.
    return false;
  }

  lastEncoded = encoded;
  feeds = next;
  recompute();
  try {
    if (encoded !== null) localStorage.setItem(ISLAND_KEY, encoded);
    else localStorage.removeItem(ISLAND_KEY);
  } catch {
    // Private mode, quota, a locked-down browser. The in-memory copy still
    // drives this session; only persistence across reloads is lost.
  }
  return true;
};

// ---------------------------------------------------------------------------
// The mod transport: stream first, poll second
// ---------------------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | null = null;
let stream: EventSource | null = null;
/**
 * Set once the stream has failed for this subscription, so polling never tries
 * to upgrade back. Cleared by `stop`, so the next mount gets a fresh attempt.
 */
let streamFailed = false;
/**
 * Bumped every time the transport stops. An in-flight request or a late stream
 * event that arrives after the last subscriber left carries a stale generation
 * and is discarded, so a navigation away cannot resurrect the timer, reopen a
 * connection, or write state nobody is watching.
 */
let generation = 0;

/**
 * Accept a snapshot from either transport. One gate, one assembly step.
 *
 * Publishes only when it has something new to say. Three things count as new:
 * the data changed, we have only just come online, or an error that was being
 * shown has cleared. A repeat of what is already on screen publishes nothing,
 * which is what stops the five second poll from rebuilding the page four times
 * a minute while the player is standing still.
 */
const acceptLive = (result: ReturnType<typeof applyLivePayload>, mine: number) => {
  if (mine !== generation) return;

  const wasLive = status === "live";
  status = "live";

  if (result.error) {
    // Reported and ignored. `result.feeds` is the object we passed in, so there
    // is no path here that could have replaced stored data.
    if (lastError === result.error && wasLive) return;
    lastError = result.error;
    publish();
    return;
  }

  const changed = setFeeds(result.feeds);
  const clearing = lastError !== null;
  lastError = null;

  if (changed || clearing || !wasLive) publish();
};

/** `fetch` with a hard deadline, because a localhost server can still hang. */
const getJson = async (path: string): Promise<unknown> => {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ORIGIN}${path}`, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${path} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(deadline);
  }
};

/* The focus recheck that makes the backoff safe: coming back to the tab is
   exactly the moment the mod is most likely to have just been started. */
if (typeof window !== "undefined") {
  window.addEventListener("focus", () => {
    if (timer === null || offlineStreak === 0) return;
    clearTimeout(timer);
    offlineStreak = 0;
    timer = setTimeout(() => void tick(generation), 250);
  });
}

const schedule = (ms: number, mine: number) => {
  if (mine !== generation) return;
  timer = setTimeout(() => void tick(mine), ms);
};

const tick = async (mine: number) => {
  if (mine !== generation) return;

  let healthy = false;
  let version: string | null = null;
  try {
    const health = (await getJson("/v1/health")) as { ok?: unknown; mod?: unknown } | null;
    healthy = health?.ok === true;
    // `mod` is the mod's version string. Read opportunistically and never
    // required: a build that stops sending it, or sends something other than a
    // string, must not affect whether we consider the mod alive.
    if (healthy && typeof health?.mod === "string" && health.mod) version = health.mod;
  } catch {
    healthy = false;
  }

  if (mine !== generation) return;

  if (!healthy) {
    // The overwhelmingly common case: no mod installed. Not an error, not worth
    // a message, and above all not a reason to drop stored data.
    const next: IslandStatus = merged.snapshot ? "offline" : "empty";
    if (status !== next || modVersion !== null) {
      status = next;
      modVersion = null;
      publish();
    }
    schedule(Math.min(OFFLINE_MS * 2 ** offlineStreak, OFFLINE_MAX_MS), mine);
    offlineStreak += 1;
    return;
  }

  offlineStreak = 0;
  modVersion = version;

  try {
    const payload = await getJson("/v1/island");
    if (mine !== generation) return;
    // Down the same funnel a stream message takes. Validation runs on every
    // poll, not just the first: the mod is young and a bad build must not be
    // able to replace good data with nonsense.
    acceptLive(applyLivePayload(feeds, payload, Date.now()), mine);
  } catch (e) {
    if (mine !== generation) return;
    // Health said yes but the island endpoint did not deliver. That is a real
    // fault worth surfacing, unlike a closed port.
    status = "live";
    lastError = e instanceof Error ? e.message : String(e);
    publish();
  }

  schedule(LIVE_MS, mine);
};

/**
 * Open the Server-Sent Events stream.
 *
 * `EventSource` reconnects on its own after a transient drop, which is exactly
 * what we do not want when the mod is simply not installed: it would retry a
 * closed port forever. So the first error closes it for good and hands over to
 * polling, and `streamFailed` makes that handover one-way for the rest of this
 * subscription.
 */
const openStream = (mine: number) => {
  let source: EventSource;
  try {
    source = new EventSource(`${ORIGIN}${EVENTS_PATH}`);
  } catch {
    streamFailed = true;
    void tick(mine);
    return;
  }
  stream = source;

  source.addEventListener(ISLAND_EVENT, (event) => {
    if (mine !== generation) return;
    acceptLive(applyLiveMessage(feeds, (event as MessageEvent<unknown>).data, Date.now()), mine);
  });

  source.addEventListener("open", () => {
    if (mine !== generation) return;
    status = "live";
    publish();
    // The stream carries snapshots but not the mod's version, and the badge
    // should read the same whichever transport won. One request, not a poll.
    void getJson("/v1/health")
      .then((health) => {
        const mod = (health as { mod?: unknown } | null)?.mod;
        if (mine !== generation || typeof mod !== "string" || !mod) return;
        modVersion = mod;
        publish();
      })
      .catch(() => {
        // The badge just says "Live" without a version. Not worth a message.
      });
  });

  source.addEventListener("error", () => {
    if (mine !== generation) return;
    source.close();
    if (stream === source) stream = null;
    // One-way: polling from here until this subscription ends.
    streamFailed = true;
    void tick(mine);
  });
};

const start = () => {
  if (typeof window === "undefined") return;
  if (!isCompanionLinked()) return;
  if (timer !== null || stream !== null) return;
  // Stream first. Only one transport ever runs, and polling is what we fall
  // back to rather than what we start with.
  if (typeof EventSource !== "undefined" && !streamFailed) openStream(generation);
  else void tick(generation);
};

const stop = () => {
  generation++;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (stream !== null) {
    stream.close();
    stream = null;
  }
  // A fresh mount deserves a fresh attempt at the better transport.
  streamFailed = false;
  modVersion = null;
  // Whatever we learned about the mod is no longer being refreshed, so stop
  // claiming it is live. There is nobody left to notify, but the view has to be
  // correct before the next mount reads it.
  const next: IslandStatus = merged.snapshot ? "offline" : "empty";
  if (status !== next) {
    status = next;
    publish();
  }
};

const transportGate = createCompanionTransportGate(
  { getSnapshot: isCompanionLinked, subscribe: subscribeCompanionLink },
  start,
  stop,
);

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  const releaseTransport = transportGate.request();
  return () => {
    listeners.delete(fn);
    releaseTransport();
  };
};

// ---------------------------------------------------------------------------
// The Hypixel pull. On demand only.
// ---------------------------------------------------------------------------

/**
 * The Hypixel pull's gate: in-flight attach plus the ten second floor.
 *
 * The credential and TTL checks stay in `refreshApi` because they decide
 * WHETHER to ask at all; the gate decides how often the asking may happen. The
 * thunk closes over the account and key that passed those checks.
 *
 * `pendingPull` is how the thunk receives them. A gate task takes no arguments
 * by design, and stashing them here rather than rebuilding a gate per call
 * keeps one gate, therefore one floor, for the life of the module.
 */
let pendingPull: { account: HypixelAccount; key: string } | null = null;

const apiGate = makeGate(async () => {
  const job = pendingPull;
  if (!job) return;
  await runApiPull(job.account, job.key);
}, API_MIN_GAP);

/**
 * When the manual button is allowed to fire again.
 *
 * Published so the button can say so instead of silently ignoring a click.
 * Nothing here changes when a request is permitted; it only makes the existing
 * rule visible.
 */
export const apiCooldownUntil = (): number => apiGate.cooldownUntil();

/**
 * Pull sacks from the Hypixel API.
 *
 * Doubles as key validation: this is the only authenticated call the site
 * makes, a 200 proves the key works and a 403 proves it does not, so spending a
 * second request to find that out separately would be waste on someone else's
 * rate limit.
 *
 * `force` is the refresh button. It skips the TTL but not the floor between
 * attempts, because a button that fires a request per click is a button that
 * gets somebody's key throttled.
 */
const refreshApi = async (force = false): Promise<void> => {
  const access = currentAccess();

  if (!hasApiProfileAccess(access)) {
    // Only complain when a person asked. The page calls this unforced on mount,
    // and telling the majority of visitors - who have no key and want none -
    // that they are missing one would be nagging, not helping.
    if (force) {
      apiStatus = "error";
      apiError = "Complete your Hypixel connection in Settings first.";
      publish();
    }
    return;
  }

  // An unasked pull has to clear the policy gate: no pull while the mod is
  // live, and none inside the TTL. A manual refresh skips the gate entirely,
  // because the player looking at the button knows something we do not.
  if (
    !force &&
    !shouldAutoRefresh({
      hasCredentials: true,
      modLive: status === "live",
      lastPullAt: feeds.api?.receivedAt ?? null,
      now: Date.now(),
      ttlMs: API_TTL,
    })
  ) {
    return;
  }

  /*
   * Attach or refuse, in `gate.ts`. A second click while a pull is in the air
   * gets that pull rather than issuing another, and a click inside the floor
   * starts nothing without moving the window. Set the job first: the gate may
   * run the thunk synchronously up to its first await.
   */
  pendingPull = { account: { uuid: access.uuid, name: access.name }, key: access.key };
  await apiGate.run();
};

/**
 * The pull itself, with the guards already passed.
 *
 * Split out so that `apiInFlight` can hold exactly one promise per request. The
 * body is unchanged from when it lived inline; only the guards moved out.
 */
const runApiPull = async (account: HypixelAccount, key: string): Promise<void> => {
  apiStatus = "loading";
  apiError = null;
  publish();

  {
    // The key that passed the guard, not one re-read now, so the request uses
    // the credential the caller was actually checked against.
    const res = await fetchProfiles(account, key);

    if (!res.ok) {
      // Only an auth failure says anything about the key itself. A network blip
      // or a 502 leaves the previous verdict exactly where it was.
      if (res.error.reason === "auth") writeAccess({ keyState: "invalid", checkedAt: Date.now() });
      apiStatus = "error";
      apiError = res.error.message;
      publish();
      return;
    }

    const fetchedAt = res.fetchedAt ?? Date.now();
    writeAccess({ keyState: "valid", checkedAt: fetchedAt });
    apiProfiles = res.value;

    const profile = chooseProfile(res.value, currentAccess().profileId);
    if (!profile) {
      apiStatus = "error";
      apiError = "Hypixel returned no usable profile for that account.";
      publish();
      return;
    }

    /*
     * The profile carries the game mode, so a pull that reaches here has just
     * learned whether this is an Ironman account. Apply it.
     *
     * Without this call the auto-detect only ever ran for people who opened
     * the Settings page, because that was the other caller. Somebody who lives
     * on the Island page pulled their profile, held the answer in hand, and
     * was still asked to set the toggle by hand.
     *
     * `applyApiGameMode` owns the precedence, not this call site: it refuses to
     * touch a mode the player has already chosen, and refuses to guess at all
     * for a mode it does not confidently recognise.
     */
    applyApiGameMode(profile.gameMode);

    setFeeds({ ...feeds, api: apiFeed(profile, account, fetchedAt) });
    apiStatus = "idle";
    apiError = null;
    publish();
  }
};

/**
 * Switch which SkyBlock profile the API feed describes.
 *
 * Rebuilt at the *existing* feed's timestamp rather than at now: the player
 * changed which profile they are looking at, not when the data was fetched, and
 * re-dating it to now would let a stale pull outrank a fresher mod snapshot in
 * the merge for no reason at all.
 */
const selectApiProfile = (profileId: string) => {
  writeAccess({ profileId });
  const profile = apiProfiles.find((p) => p.profileId === profileId);
  if (!profile) return;
  const access = currentAccess();
  const at = feeds.api?.receivedAt ?? Date.now();
  setFeeds({ ...feeds, api: apiFeed(profile, { uuid: access.uuid, name: access.name }, at) });
  publish();
};

// Keep other tabs in step: paste a code in one, the island page in the other
// updates. Only our key, and only ever a re-read.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== ISLAND_KEY) return;

    // Another tab wrote. Read it back and compare on the same yardstick the
    // write path uses, because with the page open twice every capture fires
    // this in the other tab, and re-reading a snapshot we already have would
    // rebuild that tab's whole board for nothing.
    const next = readFromDisk();
    let encoded: string | null;
    try {
      encoded = next.mod || next.api ? encodeFeeds(next) : null;
    } catch {
      encoded = null;
    }

    const wasStatus = status;
    const changed = encoded !== lastEncoded;

    if (changed) {
      lastEncoded = encoded;
      feeds = next;
      recompute();
    }
    if (status !== "live") status = merged.snapshot ? "offline" : "empty";

    if (changed || status !== wasStatus) publish();
  });
}

/**
 * Read the island, feed it, or clear it.
 *
 * `snapshot` is the merged view and its shape has not changed: anything written
 * against a single-source `IslandSnapshot` - `sackLookup` included - keeps
 * working untouched. Provenance is additive, in `sections`.
 *
 * `applyCode` both throws and records `lastError`, which looks redundant but is
 * not: the throw lets the paste box `await` it and react, while `lastError`
 * keeps the message on screen across the re-renders that follow.
 *
 * `clear` is deliberately reachable only from a button. Nothing in this file
 * ever discards the player's data on its own - not on a failed poll, not on an
 * unreadable payload, not on a schema mismatch.
 */
export const useIsland = () => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const applyCode = useCallback(async (code: string): Promise<IslandSnapshot> => {
    try {
      const snapshot = await decodeIslandCode(code);
      setFeeds({ ...feeds, mod: modFeed(snapshot, Date.now()) });
      if (status !== "live") status = "offline";
      lastError = null;
      publish();
      return snapshot;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      publish();
      throw e;
    }
  }, []);

  const clear = useCallback(() => {
    setFeeds({});
    apiProfiles = [];
    if (status !== "live") status = "empty";
    lastError = null;
    apiError = null;
    apiStatus = "idle";
    publish();
  }, []);

  const refresh = useCallback((force = false) => refreshApi(force), []);
  const selectProfile = useCallback((profileId: string) => selectApiProfile(profileId), []);

  return {
    stored: state.stored,
    snapshot: state.snapshot,
    /** Per-section provenance: which source a section came from, when, and in what state. */
    sections: state.merged.sections,
    /** When each feed last landed, or null if that source has never reported. */
    sources: state.merged.sources,
    status: state.status,
    modVersion: state.modVersion,
    lastError: state.lastError,
    apiStatus: state.apiStatus,
    apiError: state.apiError,
    apiProfiles: state.apiProfiles,
    applyCode,
    refreshApi: refresh,
    selectProfile,
    clear,
  };
};
