/**
 * The Profile section's navigation state.
 *
 * The URL is the durable, navigable part of the state. The session copy is a
 * short-lived fallback for a remount, HMR, or a route entry that did not carry
 * a `tab` parameter. Keeping the two jobs separate is what lets browser back
 * and forward replay the URL without turning a stale session preference into a
 * permanent default.
 */

export const PROFILE_TAB_PARAM = "tab";
export const PROFILE_TAB_STORAGE_KEY = "wizardsky.profile.tab.v1";
export const PROFILE_TAB_TTL_MS = 5 * 60 * 1000;

export const PROFILE_TABS = [
  "gear",
  "accessories",
  "pets",
  "minions",
  "inventory",
  "skills",
  "network",
  "rift",
  "crimson",
  "garden",
  "museum",
  "bestiary",
  "collections",
  "dungeons",
  "coop",
] as const;
export type ProfileTab = (typeof PROFILE_TABS)[number];

export const DEFAULT_PROFILE_TAB: ProfileTab = "gear";

/**
 * `networth` is the established URL value in IslandPage while `network` is the
 * legacy internal key. Read both, keep writing the established URL spelling,
 * and present the tab as Net Worth without forcing a route migration.
 */
const URL_TAB_VALUES: Record<ProfileTab, string> = {
  gear: "gear",
  accessories: "accessories",
  pets: "pets",
  minions: "minions",
  inventory: "inventory",
  skills: "skills",
  network: "networth",
  rift: "rift",
  crimson: "crimson-isle",
  garden: "garden",
  museum: "museum",
  bestiary: "bestiary",
  collections: "collections",
  dungeons: "dungeons",
  coop: "profile-coop",
};

const URL_TAB_ALIASES: Record<string, ProfileTab> = {
  gear: "gear",
  accessories: "accessories",
  pets: "pets",
  minions: "minions",
  inventory: "inventory",
  skills: "skills",
  network: "network",
  networth: "network",
  rift: "rift",
  crimson: "crimson",
  "crimson-isle": "crimson",
  garden: "garden",
  museum: "museum",
  bestiary: "bestiary",
  collections: "collections",
  dungeons: "dungeons",
  coop: "coop",
  "profile-coop": "coop",
};

/**
 * The durable URL keeps Garden and Dungeons as their own destinations, while
 * the visible Profile navigation groups both beneath Skills. This preserves
 * old links and browser history without making three peer tabs describe one
 * progression family.
 */
export type ProfilePrimaryTab = Exclude<ProfileTab, "garden" | "dungeons">;

export const profilePrimaryTab = (tab: ProfileTab): ProfilePrimaryTab =>
  tab === "garden" || tab === "dungeons" ? "skills" : tab;

export interface ProfileTabStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
}

export interface RememberedProfileTab {
  tab: ProfileTab;
  selectedAt: number;
}

const removeStoredTab = (storage: ProfileTabStorage, key: string): void => {
  try {
    storage.removeItem?.(key);
  } catch {
    // A locked-down sessionStorage should not stop the URL tab from working.
  }
};

/** The browser's sessionStorage, or null in SSR/tests/private-mode failures. */
export const profileTabStorage = (): ProfileTabStorage | null => {
  try {
    const storage = (globalThis as typeof globalThis & { sessionStorage?: ProfileTabStorage }).sessionStorage;
    return storage ?? null;
  } catch {
    return null;
  }
};

/** Turn a URL or storage spelling into the one Profile tab vocabulary. */
export const normaliseProfileTab = (value: string | null | undefined): ProfileTab | null => {
  if (!value) return null;
  return URL_TAB_ALIASES[value.trim().toLowerCase()] ?? null;
};

/** The URL spelling for a canonical Profile tab. */
export const profileTabUrlValue = (tab: ProfileTab): string => URL_TAB_VALUES[tab];

/** Read only a valid, unexpired session preference. */
export const readRememberedProfileTab = (
  storage: ProfileTabStorage | null | undefined,
  now = Date.now()
): RememberedProfileTab | null => {
  if (!storage) return null;

  try {
    const raw = storage.getItem(PROFILE_TAB_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      removeStoredTab(storage, PROFILE_TAB_STORAGE_KEY);
      return null;
    }

    const value = parsed as { tab?: unknown; selectedAt?: unknown };
    const tab = normaliseProfileTab(typeof value.tab === "string" ? value.tab : null);
    const selectedAt = typeof value.selectedAt === "number" ? value.selectedAt : Number.NaN;
    const age = now - selectedAt;

    // A future timestamp is just as untrustworthy as an expired one. It can
    // otherwise keep a bad/copy-forward clock alive indefinitely.
    if (!tab || !Number.isFinite(selectedAt) || age < 0 || age >= PROFILE_TAB_TTL_MS) {
      removeStoredTab(storage, PROFILE_TAB_STORAGE_KEY);
      return null;
    }

    return { tab, selectedAt };
  } catch {
    removeStoredTab(storage, PROFILE_TAB_STORAGE_KEY);
    return null;
  }
};

/** Remember a deliberate tab selection for this browser session. */
export const rememberProfileTab = (
  storage: ProfileTabStorage | null | undefined,
  tab: ProfileTab,
  selectedAt = Date.now()
): RememberedProfileTab => {
  const value = { tab, selectedAt } satisfies RememberedProfileTab;
  try {
    storage?.setItem(PROFILE_TAB_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // The URL navigation remains the source of truth when storage is blocked.
  }
  return value;
};

const asSearchParams = (search: string | URLSearchParams): URLSearchParams =>
  search instanceof URLSearchParams ? new URLSearchParams(search) : new URLSearchParams(search.replace(/^\?/, ""));

/** Read a canonical Profile tab from an existing query string. */
export const profileTabFromSearch = (search: string | URLSearchParams): ProfileTab | null =>
  normaliseProfileTab(asSearchParams(search).get(PROFILE_TAB_PARAM));

/** Preserve every unrelated query parameter while changing only Profile's tab. */
export const setProfileTabInSearch = (search: string | URLSearchParams, tab: ProfileTab): string => {
  const next = asSearchParams(search);
  next.set(PROFILE_TAB_PARAM, profileTabUrlValue(tab));
  const encoded = next.toString();
  return encoded ? `?${encoded}` : "";
};

/**
 * The one operation a tab click needs: renew the session timestamp and push the
 * URL value. The caller can pass the returned search string to React Router's
 * `setSearchParams`, which keeps the selection in browser history.
 */
export const selectProfileTab = (
  search: string | URLSearchParams,
  tab: ProfileTab,
  storage: ProfileTabStorage | null | undefined,
  selectedAt = Date.now()
): string => {
  rememberProfileTab(storage, tab, selectedAt);
  return setProfileTabInSearch(search, tab);
};

/**
 * URL wins when it names a valid tab. The five-minute window applies to the
 * session fallback only; otherwise a back/forward URL entry would stop working
 * merely because the user spent five minutes reading another page.
 */
export const resolveProfileTab = (
  search: string | URLSearchParams,
  storage: ProfileTabStorage | null | undefined,
  now = Date.now()
): ProfileTab => profileTabFromSearch(search) ?? readRememberedProfileTab(storage, now)?.tab ?? DEFAULT_PROFILE_TAB;
