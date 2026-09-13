import { useSyncExternalStore } from "react";

/**
 * Skill levelling, from Hypixel's own mouth.
 *
 * SOURCE. `https://api.hypixel.net/v2/resources/skyblock/skills`, a keyless
 * resource endpoint (the same family the item catalogue comes from), carrying
 * every skill's name, level cap and the cumulative XP each level requires.
 * The tables are fetched rather than hardcoded because Hypixel changes them -
 * caps rise, skills appear (HUNTING is younger than most of this codebase) -
 * and a hardcoded ladder is a wrong level waiting silently. Same discipline
 * as the item resource: dynamic, cached, never bundled.
 *
 * CACHE. One localStorage key of our own, 24 hour TTL. Level curves change on
 * game updates, not minute to minute, so a day-old ladder is the right trade
 * against hitting a public endpoint on every visit. The cached copy is served
 * synchronously on load so skill bars do not pop in after first paint.
 *
 * The maths lives here too, as pure functions, so the level arithmetic can be
 * tested against a hand-built ladder without any fetching or rendering.
 */

const SKILLS_URL = "https://api.hypixel.net/v2/resources/skyblock/skills";

/**
 * A NEW key. Nothing else in this browser is touched; the version suffix is in
 * the name so a changed shape can be discarded without collateral.
 */
export const SKILLS_KEY = "skydex.skills.resource.v1";

/** Level curves move on game updates, so a day is fresh enough. */
export const SKILLS_TTL_MS = 24 * 60 * 60 * 1000;

const TIMEOUT_MS = 20_000;

export interface SkillDef {
  /** The resource's key, e.g. `FARMING`. The member payload's `SKILL_FARMING` maps onto it. */
  key: string;
  name: string;
  maxLevel: number;
  /**
   * Cumulative XP thresholds: `thresholds[i]` is the total XP required to
   * hold level `i + 1`. Length equals `maxLevel`.
   */
  thresholds: number[];
}

export type SkillDefs = Record<string, SkillDef>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Parse the resource payload into the compact shape above.
 *
 * Strict on the parts the arithmetic depends on: a skill whose levels are not
 * a strictly increasing ladder of finite numbers is dropped whole, because a
 * malformed ladder does not produce an error, it produces a wrong level with a
 * straight face. Returns null when nothing usable survives, so a truncated
 * download is "no resource" rather than an empty one.
 */
export const parseSkillsPayload = (payload: unknown): SkillDefs | null => {
  if (!isRecord(payload) || !isRecord(payload.skills)) return null;

  const out: SkillDefs = {};
  for (const [key, raw] of Object.entries(payload.skills)) {
    if (!isRecord(raw) || !Array.isArray(raw.levels)) continue;
    const maxLevel = typeof raw.maxLevel === "number" && Number.isInteger(raw.maxLevel) ? raw.maxLevel : 0;
    if (maxLevel <= 0) continue;

    const thresholds: number[] = [];
    let ok = true;
    for (const entry of raw.levels) {
      if (!isRecord(entry) || typeof entry.totalExpRequired !== "number" || !Number.isFinite(entry.totalExpRequired)) {
        ok = false;
        break;
      }
      const value = entry.totalExpRequired;
      if (thresholds.length > 0 && value <= thresholds[thresholds.length - 1]) {
        ok = false;
        break;
      }
      thresholds.push(value);
    }
    if (!ok || thresholds.length === 0) continue;

    out[key] = {
      key,
      name: typeof raw.name === "string" && raw.name ? raw.name : key,
      // The ladder is the ground truth; a cap the ladder does not reach is a
      // cap we cannot draw progress toward, so the shorter of the two wins.
      maxLevel: Math.min(maxLevel, thresholds.length),
      thresholds,
    };
  }

  return Object.keys(out).length > 0 ? out : null;
};

/** `SKILL_FARMING` -> `FARMING`, which is the resource's key. Anything else passes through. */
export const memberSkillKey = (experienceKey: string): string =>
  experienceKey.startsWith("SKILL_") ? experienceKey.slice("SKILL_".length) : experienceKey;

export interface SkillProgress {
  level: number;
  /** XP earned inside the current level. */
  xpInto: number;
  /** XP the current level needs in total, or null when the skill is maxed. */
  xpForNext: number | null;
  maxed: boolean;
}

/**
 * Level from total XP, against a cumulative ladder.
 *
 * Level is the count of thresholds the total has crossed, which handles level
 * zero (nothing crossed) without a special case. The "into" figure is measured
 * from the last crossed threshold, which is what a progress bar wants: SkyCrypt
 * writes it "3.61M / 7M XP" and so do we.
 */
export const skillProgress = (xp: number, def: SkillDef): SkillProgress => {
  const total = Number.isFinite(xp) && xp > 0 ? xp : 0;

  let level = 0;
  while (level < def.maxLevel && total >= def.thresholds[level]) level++;

  const floor = level > 0 ? def.thresholds[level - 1] : 0;
  const maxed = level >= def.maxLevel;
  return {
    level,
    xpInto: total - floor,
    xpForNext: maxed ? null : def.thresholds[level] - floor,
    maxed,
  };
};

/**
 * Which skills count toward the average, spelled out because "skill average"
 * is a convention rather than an API field. The game's own skill menu (and
 * every tool this number will be compared against) averages the levelling
 * skills and leaves out Runecrafting and Social, the two cosmetic tracks with
 * their own tiny caps. Carpentry counts. The list is a filter on the PLAYER'S
 * stated skills, not a required set: a profile that has never touched fishing
 * simply averages over fewer skills rather than being charged a zero we never
 * observed.
 */
const AVERAGE_EXCLUDED = new Set(["RUNECRAFTING", "SOCIAL"]);

/**
 * The average skill level, over the skills the payload states and the resource
 * can level. Null when nothing qualifies, which the caller renders as absent.
 */
export const averageSkillLevel = (skillXp: Record<string, number>, defs: SkillDefs): number | null => {
  let sum = 0;
  let n = 0;
  for (const [key, xp] of Object.entries(skillXp)) {
    const resourceKey = memberSkillKey(key);
    if (AVERAGE_EXCLUDED.has(resourceKey)) continue;
    const def = defs[resourceKey];
    if (!def) continue;
    sum += skillProgress(xp, def).level;
    n++;
  }
  return n > 0 ? sum / n : null;
};

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

interface SkillsState {
  defs: SkillDefs | null;
  /** When the copy in hand was downloaded, by our clock. */
  fetchedAt: number | null;
  status: "idle" | "loading" | "error";
  error: string | null;
}

let state: SkillsState = { defs: null, fetchedAt: null, status: "idle", error: null };
let hydrated = false;
let inFlight = false;
const listeners = new Set<() => void>();

const publish = () => {
  state = { ...state };
  for (const fn of listeners) fn();
};

/** Read the last good copy off disk, once. Never throws; a broken blob is no copy. */
const hydrate = (): void => {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return;
    const defs = parseSkillsPayload({ skills: parsed.skills });
    const fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    if (defs && fetchedAt) state = { ...state, defs, fetchedAt };
  } catch {
    // A corrupt cache costs one refetch, nothing else.
  }
};

const persist = (defs: SkillDefs, fetchedAt: number): void => {
  if (typeof localStorage === "undefined") return;
  try {
    // Stored in the compact parsed shape, not the raw payload: the unlock
    // prose is most of the download and none of the arithmetic.
    const skills: Record<string, unknown> = {};
    for (const def of Object.values(defs)) {
      skills[def.key] = {
        name: def.name,
        maxLevel: def.maxLevel,
        levels: def.thresholds.map((totalExpRequired, i) => ({ level: i + 1, totalExpRequired })),
      };
    }
    localStorage.setItem(SKILLS_KEY, JSON.stringify({ skills, fetchedAt }));
  } catch {
    // Quota. The in-memory copy serves this session.
  }
};

const fresh = (): boolean => state.fetchedAt !== null && Date.now() - state.fetchedAt < SKILLS_TTL_MS;

/**
 * Fetch the resource if the copy in hand is stale. Coalesced, keyless, at most
 * one request a day per browser thanks to the TTL. No API key is attached:
 * resource endpoints do not take one, and the key never travels where it is
 * not needed.
 */
export const requestSkillDefs = (): void => {
  hydrate();
  if (inFlight || fresh()) return;
  inFlight = true;
  state = { ...state, status: "loading", error: null };
  publish();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(SKILLS_URL, { signal: controller.signal })
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`skills resource responded ${res.status}`))))
    .then((body: unknown) => {
      const defs = parseSkillsPayload(body);
      if (!defs) throw new Error("skills resource had no usable ladders");
      const fetchedAt = Date.now();
      state = { defs, fetchedAt, status: "idle", error: null };
      persist(defs, fetchedAt);
    })
    .catch((e: unknown) => {
      // A failed refresh keeps whatever cached ladder we had; stale beats none.
      state = { ...state, status: "error", error: e instanceof Error ? e.message : String(e) };
    })
    .finally(() => {
      clearTimeout(timer);
      inFlight = false;
      publish();
    });
};

const getState = (): SkillsState => state;
const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  hydrate();
  return () => listeners.delete(fn);
};

/** The React face of the store. Callers still fire `requestSkillDefs` from an effect. */
export const useSkillDefs = (): SkillsState => useSyncExternalStore(subscribe, getState, getState);

/** Test seam. The browser never resets the store. */
export const __setSkillDefsForTests = (defs: SkillDefs | null, fetchedAt: number | null = Date.now()): void => {
  hydrated = true;
  state = { defs, fetchedAt, status: "idle", error: null };
  publish();
};
