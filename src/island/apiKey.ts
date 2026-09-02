import { useCallback, useSyncExternalStore } from "react";
import { undash } from "./hypixel";
import { hasHypixelApiCredential, usesProductionHypixelApi } from "./hypixelTransport";

/**
 * The saved Hypixel account and legacy credential migration.
 *
 * Skydex.ca and local Skydex checkouts use the approved application key behind
 * the production Worker and never ask for a visitor's key. The old personal
 * credential fields remain only long enough to read and remove records written
 * by an earlier version. No normal application path writes or sends them.
 *
 * The account and profile choice ride in the same existing record to preserve
 * upgrades. On first load, any personal key left by an older Skydex version is
 * removed while those account choices are retained.
 */

const KEY = "wizardsky.apikey.v1";

export type KeyState = "unchecked" | "valid" | "invalid";

export interface ApiAccess {
  key: string;
  /**
   * What the last authenticated call proved. Never a guess: `unchecked` until a
   * real request has come back, because telling someone their key is fine
   * before asking Hypixel is just an opinion.
   */
  keyState: KeyState;
  checkedAt: number | null;
  /**
   * When the key stops working, as a `YYYY-MM-DD` calendar date, or null when
   * the player has not said.
   *
   * Typed in rather than fetched, because Hypixel does not publish it. The
   * `/key` endpoint that used to answer this was deprecated in June 2023 and
   * removed that August, and nothing replaced it: the current spec at
   * api.hypixel.net lists 35 paths and none of them is a key endpoint. The
   * `RateLimit-*` response headers Hypixel points at instead do carry the limit
   * and the remaining budget, but not an expiry date, and they are unreadable
   * here anyway. api.hypixel.net sends no `Access-Control-Expose-Headers`, so
   * on a cross origin response script can only see the seven headers the fetch
   * spec safelists, and no rate limit header is among them. They are on the
   * wire and visible to curl; `headers.get` returns null for them in a browser.
   *
   * So a field the player fills in is the honest option. A countdown invented
   * from nothing is not, and a proxy to read the headers would mean handing
   * somebody else's key to a server, which is the one thing this must not do.
   *
   * Optional in the strong sense. Null is a normal, permanent state and nothing
   * in the UI asks twice.
   */
  keyExpiresOn: string | null;
  /** Undashed, the form Hypixel's `members` map is keyed by. */
  uuid: string;
  name: string;
  /** The profile the player switched to, if they did. Null means follow Hypixel's `selected`. */
  profileId: string | null;
}

/** Drop every visitor-credential field while preserving the chosen account. */
export const withoutPersonalApiKey = (access: ApiAccess): ApiAccess => ({
  ...access,
  key: "",
  keyState: "unchecked",
  checkedAt: null,
  keyExpiresOn: null,
});

const BLANK: ApiAccess = {
  key: "",
  keyState: "unchecked",
  checkedAt: null,
  keyExpiresOn: null,
  uuid: "",
  name: "",
  profileId: null,
};

/* -------------------------------------------------------------------------- */
/* Key expiry                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * How close to the end counts as worth saying something about.
 *
 * Two days, because that is long enough to still be a weekend away from the
 * dashboard and short enough that the warning means something. Above this the
 * countdown is shown but stays grey; a number that turns amber four weeks out
 * is a number people learn to ignore.
 */
export const EXPIRY_WARN_MS = 48 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type ExpiryState = "fine" | "soon" | "expired";

export interface KeyExpiry {
  /** Milliseconds until the key dies. Zero or negative once it has. */
  msLeft: number;
  /** Whole hours left, floored. Drives the wording under two days. */
  hoursLeft: number;
  /** Whole days left, floored. Drives the wording above two days. */
  daysLeft: number;
  state: ExpiryState;
}

/**
 * `YYYY-MM-DD`, and genuinely that date.
 *
 * The shape test alone would accept `2026-02-30`, so the parsed date is read
 * back and compared. `new Date(2026, 1, 30)` silently becomes the 2nd of March,
 * and a countdown that quietly moved someone's deadline is worse than no
 * countdown.
 */
const parseCalendarDate = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  // Local midnight, not UTC. The player typed a date off their own calendar and
  // the countdown has to agree with the calendar they typed it from.
  const at = new Date(year, month - 1, day);
  if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day) return null;
  return at;
};

/**
 * How long is left, or null when there is nothing to count.
 *
 * Anchored to the *start* of the named day rather than the end. A key dated the
 * 4th is treated as gone the moment the 4th begins, which is the conservative
 * reading and the right direction to be wrong in: warning half a day early
 * costs nothing, and telling somebody their key is fine on the morning it dies
 * is the exact failure this is here to prevent.
 *
 * Pure, and takes `now` as an argument, so the thresholds are testable without
 * a clock.
 */
export const readExpiry = (iso: string | null, now: number): KeyExpiry | null => {
  if (!iso) return null;
  const at = parseCalendarDate(iso);
  if (at === null) return null;

  const msLeft = at.getTime() - now;
  return {
    msLeft,
    hoursLeft: Math.floor(msLeft / HOUR_MS),
    daysLeft: Math.floor(msLeft / DAY_MS),
    // Strictly under the threshold, so exactly two days out is still `fine`.
    state: msLeft <= 0 ? "expired" : msLeft < EXPIRY_WARN_MS ? "soon" : "fine",
  };
};

/**
 * The countdown as a person would say it.
 *
 * Hours under two days, days above it. Precision matters exactly when the
 * deadline is close, and "expires in 31 days" is a more useful sentence than
 * "expires in 748 hours".
 */
export const expiryLabel = (expiry: KeyExpiry): string => {
  if (expiry.state === "expired") return "key expired";
  if (expiry.msLeft < HOUR_MS) return "expires within the hour";
  if (expiry.state === "soon") return `expires in ${expiry.hoursLeft} ${expiry.hoursLeft === 1 ? "hour" : "hours"}`;
  return `expires in ${expiry.daysLeft} ${expiry.daysLeft === 1 ? "day" : "days"}`;
};

/**
 * How far ahead of a freshly typed key its date is stamped.
 *
 * Hypixel issues keys with a 48 hour life and this writes 47, an hour short,
 * so the countdown gives up before the credential does. The two ways to be
 * wrong are not worth the same: doubting a key early costs one re-paste,
 * while trusting a dead one costs a request that fails in the middle of
 * whatever the player was doing.
 */
const STAMP_AHEAD_MS = 47 * HOUR_MS;

/**
 * The calendar date to stamp beside a key that was just typed in.
 *
 * The field holds `YYYY-MM-DD` and nothing finer, so the 47th hour has to land
 * on some day, and it lands on the UTC one: this is the instant 47 hours out,
 * read as a UTC calendar date.
 *
 * That rounding is the whole subtlety, and it is worth stating plainly because
 * `readExpiry` counts down to LOCAL midnight of the day named here. The margin
 * a reader actually sees therefore moves with their offset and with the hour
 * they pasted at. The stamp names the LOCAL calendar day, the same clock the
 * countdown reads, so the countdown always ends at or before the forty-seven
 * hour mark and never trusts a key past its real death; the remainder of the
 * hour of slack is simply given up. A field that cannot hold hours cannot
 * promise hours; what it can promise is that the key is never trusted on a
 * day it might already be dead.
 *
 * Pure, and takes `now`, so the arithmetic pins down in a test without a
 * clock. The same bargain `readExpiry` makes.
 */
export const stampExpiry = (now: number): string => {
  const at = new Date(now + STAMP_AHEAD_MS);
  const pad = (n: number) => String(n).padStart(2, "0");
  return at.getFullYear() + "-" + pad(at.getMonth() + 1) + "-" + pad(at.getDate());
};

const read = (): ApiAccess => {
  if (typeof localStorage === "undefined") return BLANK;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return BLANK;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return BLANK;
    const p = parsed as Partial<Record<keyof ApiAccess, unknown>>;
    return {
      key: typeof p.key === "string" ? p.key : "",
      keyState: p.keyState === "valid" || p.keyState === "invalid" ? p.keyState : "unchecked",
      checkedAt: typeof p.checkedAt === "number" && Number.isFinite(p.checkedAt) ? p.checkedAt : null,
      // Absent on every record written before this field existed, which is why
      // it is read defensively and never written back as anything but a valid
      // date or null. Nothing is migrated and no other key is touched.
      keyExpiresOn:
        typeof p.keyExpiresOn === "string" && parseCalendarDate(p.keyExpiresOn) !== null ? p.keyExpiresOn : null,
      uuid: typeof p.uuid === "string" ? undash(p.uuid) : "",
      name: typeof p.name === "string" ? p.name : "",
      profileId: typeof p.profileId === "string" && p.profileId ? p.profileId : null,
    };
  } catch {
    return BLANK;
  }
};

let current: ApiAccess = read();

/*
 * The live site stopped needing visitor credentials once the production key
 * was approved. Remove that obsolete secret at the first safe opportunity,
 * but keep the account and selected profile the player already chose.
 */
if (usesProductionHypixelApi() && (current.key || current.keyExpiresOn || current.keyState !== "unchecked")) {
  current = withoutPersonalApiKey(current);
  try {
    if (current.uuid) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch {
    // In-memory sanitisation still prevents the old key from being used.
  }
}

const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const getSnapshot = () => current;

const persist = () => {
  try {
    // Only ever this key, and only ever the fields above.
    if (current.key || current.uuid) localStorage.setItem(KEY, JSON.stringify(current));
    else localStorage.removeItem(KEY);
  } catch {
    // In-memory is authoritative for the session either way.
  }
};

/** Read the credential outside React, for the store that actually makes the call. */
export const currentAccess = (): ApiAccess => current;

/** Can this build ask for this saved account's authenticated profile data? */
export const hasApiProfileAccess = (access: Pick<ApiAccess, "key" | "uuid"> = current): boolean =>
  Boolean(access.uuid && hasHypixelApiCredential(access.key));

/**
 * Patch the record.
 *
 * Changing the key resets `keyState` unless the caller is explicitly reporting
 * a check result, because a key that has not been tried is unchecked by
 * definition and carrying the previous verdict forward would be a lie.
 *
 * A new key drops the old expiry date for the same reason. The date described
 * the credential that was there before; keeping it would leave a countdown on
 * screen that belongs to a key nobody is using any more, which is worse than
 * having no countdown at all. A caller setting both at once is honoured.
 */
export const writeAccess = (patch: Partial<ApiAccess>) => {
  const keyChanged = patch.key !== undefined && patch.key !== current.key;
  current = {
    ...current,
    ...patch,
    ...(keyChanged && patch.keyState === undefined ? { keyState: "unchecked" as KeyState, checkedAt: null } : {}),
    ...(keyChanged && patch.keyExpiresOn === undefined ? { keyExpiresOn: null } : {}),
  };
  if (patch.uuid !== undefined) current.uuid = undash(current.uuid);
  // Normalised at the boundary, the same way the uuid is, so every reader
  // downstream can take the field at face value. Anything that is not a real
  // calendar date becomes null rather than sitting in state as a date-shaped
  // string that no countdown can use.
  if (current.keyExpiresOn !== null && parseCalendarDate(current.keyExpiresOn) === null) current.keyExpiresOn = null;
  persist();
  for (const fn of listeners) fn();
};

/** Forget this connection. Removes exactly this one browser-storage record. */
export const clearAccess = () => {
  current = BLANK;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do; the in-memory copy is already blank.
  }
  for (const fn of listeners) fn();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    current = read();
    for (const fn of listeners) fn();
  });
}

/**
 * The uuid to store beside a newly typed name.
 *
 * `uuid` and `name` are two halves of one identity: the uuid was resolved FOR
 * that name. A writer that changes only the name leaves a record that names one
 * player and points at another, and nothing downstream can tell. It is worse
 * than inert, because `importPlayerProfile` skips the name service whenever the
 * typed name matches the stored one and imports whatever the stored uuid points
 * at: one player's shard counts arriving over another player's data, with no
 * error at any point.
 *
 * So the stored uuid survives only while the name still names it. Dropping it
 * otherwise costs nothing, because an empty uuid is exactly what sends the
 * import back through `resolveAccount` to derive the right one from the name.
 *
 * Compared without case, which is the comparison the import path itself makes.
 * Minecraft names resolve regardless of case, so a recased name is the same
 * account and its uuid is still good.
 */
export const uuidForName = (account: Pick<ApiAccess, "uuid" | "name">, typed: string): string =>
  account.name && account.name.toLowerCase() === typed.toLowerCase() ? account.uuid : "";

export const useApiAccess = () => {
  const access = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setKey = useCallback((key: string) => writeAccess({ key }), []);
  const setAccount = useCallback((uuid: string, name: string) => writeAccess({ uuid, name }), []);
  const setProfileId = useCallback((profileId: string | null) => writeAccess({ profileId }), []);
  /** An empty field is a cleared field. `writeAccess` rejects anything malformed. */
  const setExpiresOn = useCallback((iso: string) => writeAccess({ keyExpiresOn: iso.trim() || null }), []);
  const clear = useCallback(() => clearAccess(), []);

  return { access, setKey, setAccount, setProfileId, setExpiresOn, clear };
};
