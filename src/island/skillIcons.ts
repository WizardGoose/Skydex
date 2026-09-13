import { useSyncExternalStore } from "react";

/**
 * Which picture each skill wears, read off the wiki rather than guessed.
 *
 * SOURCE. The wiki's own `Module:Skill/Data` - the Lua table its `{{Skill}}`
 * template renders every skill icon from - fetched raw the same way the sacks
 * module fetches its article (`index.php?action=raw`, CORS-clean, wiki serves
 * its own content to the visitor). That table is the authoritative statement
 * of "Farming's icon is Farming.png", and Farming.png is itself a wiki file
 * redirect to the real art (verified live 2026-08-03: `File:Farming.png`
 * redirects to `Golden_Hoe.png`), which is exactly the redirect ItemIcon's
 * batched title lookup already resolves. So this module ships a mapping and
 * ItemIcon does the drawing; nothing here builds URLs and nothing guesses
 * which item stands for which skill.
 *
 * A skill the table does not name gets no icon, not a guess: the house
 * standing rule, and the same posture the sacks module takes.
 *
 * Cached a day under our own key, like every other slow-moving resource.
 */

const WIKI = "https://hypixelskyblock.minecraft.wiki";
const MODULE_TITLE = "Module:Skill/Data";

/** New surface, new key. Nothing else in this browser is touched. */
export const SKILL_ICONS_KEY = "skydex.skillicons.v1";

/** The template data moves with game updates, not page views. */
export const SKILL_ICONS_TTL = 24 * 60 * 60 * 1000;

const TIMEOUT_MS = 20_000;

/** Lowercased skill name -> the wiki file TITLE (no extension) its icon lives under. */
export type SkillIconMap = Record<string, string>;

/**
 * Parse the Lua data table.
 *
 * Deliberately narrow: entries look like `['farming'] = { ... icon =
 * 'Farming.png', ... }` and the two captures below are the key and the icon
 * file. Anything that does not match contributes nothing rather than a wrong
 * picture, and a page rewrite that breaks the shape yields an empty map, which
 * reads as "no icons" rather than as an exception.
 */
export const parseSkillIconData = (lua: string): SkillIconMap => {
  const out: SkillIconMap = {};
  for (const entry of lua.matchAll(/\['([^']+)'\]\s*=\s*\{([^}]*)\}/g)) {
    const key = entry[1].trim().toLowerCase();
    const icon = entry[2].match(/icon\s*=\s*'([^']+)'/);
    if (!key || !icon) continue;
    // ItemIcon takes a title and derives the file, so the extension comes off.
    const title = icon[1].replace(/\.(png|gif|jpe?g|webp)$/i, "").trim();
    if (title) out[key] = title;
  }
  return out;
};

/* ------------------------------------------------------------------ store */

interface SkillIconsState {
  icons: SkillIconMap | null;
  fetchedAt: number | null;
  status: "idle" | "loading" | "error";
}

let state: SkillIconsState = { icons: null, fetchedAt: null, status: "idle" };
let hydrated = false;
let inFlight = false;
const listeners = new Set<() => void>();

const publish = () => {
  state = { ...state };
  for (const fn of listeners) fn();
};

const hydrate = (): void => {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(SKILL_ICONS_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;
    const record = parsed as { icons?: unknown; fetchedAt?: unknown };
    if (typeof record.fetchedAt !== "number" || typeof record.icons !== "object" || record.icons === null) return;
    const icons: SkillIconMap = {};
    for (const [key, value] of Object.entries(record.icons as Record<string, unknown>)) {
      if (typeof value === "string" && value) icons[key] = value;
    }
    if (Object.keys(icons).length > 0) state = { ...state, icons, fetchedAt: record.fetchedAt };
  } catch {
    // A corrupt cache costs one refetch, nothing else.
  }
};

const persist = (icons: SkillIconMap, fetchedAt: number): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SKILL_ICONS_KEY, JSON.stringify({ icons, fetchedAt }));
  } catch {
    // Quota. The in-memory copy serves this session.
  }
};

const fresh = (): boolean => state.fetchedAt !== null && Date.now() - state.fetchedAt < SKILL_ICONS_TTL;

export const requestSkillIcons = (): void => {
  hydrate();
  if (inFlight || fresh()) return;
  inFlight = true;
  state = { ...state, status: "loading" };
  publish();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(`${WIKI}/index.php?action=raw&title=${encodeURIComponent(MODULE_TITLE)}`, { signal: controller.signal })
    .then((res) => (res.ok ? res.text() : Promise.reject(new Error(`wiki responded ${res.status}`))))
    .then((lua) => {
      const icons = parseSkillIconData(lua);
      if (Object.keys(icons).length === 0) throw new Error("the module stated no icons");
      const fetchedAt = Date.now();
      state = { icons, fetchedAt, status: "idle" };
      persist(icons, fetchedAt);
    })
    .catch(() => {
      // No icons is a cosmetic loss and the rows say nothing false without
      // them, so a failure keeps whatever cache existed and stays quiet.
      state = { ...state, status: "error" };
    })
    .finally(() => {
      clearTimeout(timer);
      inFlight = false;
      publish();
    });
};

const getState = (): SkillIconsState => state;
const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  hydrate();
  return () => listeners.delete(fn);
};

/** The React face. Callers fire `requestSkillIcons` from an effect. */
export const useSkillIcons = (): SkillIconsState => useSyncExternalStore(subscribe, getState, getState);

/** Test seam. The browser never resets the store. */
export const __setSkillIconsForTests = (icons: SkillIconMap | null, fetchedAt: number | null = Date.now()): void => {
  hydrated = true;
  state = { icons, fetchedAt, status: "idle" };
  publish();
};
