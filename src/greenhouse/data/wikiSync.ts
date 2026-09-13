/**
 * Live wiki sync.
 *
 * The app ships a bundled copy of the mutation data, but the wiki is the real
 * source of truth. Rather than a build step or a scheduled job, the site
 * fetches the wiki's Mutations page itself and patches anything that changed.
 *
 * This is cheap enough to do in the browser: the page is ~30 KB of wikitext,
 * about 7 KB over the wire, and comes back in roughly a third of a second.
 * The wiki sends `access-control-allow-origin: *`, so no proxy is involved.
 *
 * The parser is the same one used offline by `tools/wiki-to-dataset.mjs`,
 * which reproduces the bundled dataset with zero field disagreements across
 * all 40 mutations. Nothing here invents data: if a field cannot be parsed the
 * bundled value is kept.
 */

import { makeGate } from "../../island/gate";

const API = "https://hypixelskyblock.minecraft.wiki/api.php";

/**
 * Exported because the dataset store listens for this key on the `storage`
 * event, which is how a wiki refresh in one tab reaches the other tabs. A
 * listener that hardcoded the string would be a second copy of it, and the
 * whole point of that store is that a fact has one home.
 */
// v2: snapshots now carry `grounds` (every growth surface, not just the
// first). A v1 snapshot lacks the field, and the house rule is that a payload
// shape change bumps the key in the same edit rather than trusting every
// reader to be defensive about a shape that no longer exists. The overlay IS
// still defensive about it (see `applyWikiMutations`), but that is belt and
// braces, not the mechanism.
export const CACHE_KEY = "wizardsky.wikidata.v2";
const STALE_CACHE_KEYS = ["wizardsky.wikidata.v1"];

/** How stale a cached copy may get before we quietly refresh it. */
export const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface WikiMutation {
  name: string;
  size: number;
  /**
   * The PRIMARY growth surface: the first one the wiki lists. Kept as a single
   * string because ~18 call sites (the soil-texture lookup, per-cell titles)
   * want exactly one surface to draw, and the first listed is the honest pick.
   */
  ground: string;
  /**
   * EVERY growth surface the row lists, in the wiki's order. The old regex
   * captured only the first `{{ID|...}}` on the line and silently dropped the
   * rest after the comma, which is how Lonelily ("Farmland, Dirt" on the wiki)
   * shipped as farmland-only. Always at least `[ground]`.
   */
  grounds: string[];
  rarity: string;
  /** Null when the row does not state it. Never overwrite a known value with a guess. */
  growth_stages: number | null;
  requirements: { crop: string; count: number }[];
}

export interface WikiSnapshot {
  fetchedAt: number;
  mutations: Record<string, WikiMutation>;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const RARITIES = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];

/**
 * Parse the Mutations page.
 *
 * Three things bite, all learned the hard way:
 *  - the final row has no following {{Slot|, so it must stop at the table
 *    terminator or it swallows the rest of the page and picks up a stray rarity
 *  - <ref> footnotes contain decoy requirements ("in practice this can be
 *    achieved using 2x Snoozling") that are commentary, not requirements
 *  - requirements appear in two markups, {{RD|4x Ashwreath}} and the plain
 *    link form 4x [[Witherbloom]], sometimes on the same line
 */
export const parseWikiMutations = (wikitext: string, knownNames: Map<string, string>): Record<string, WikiMutation> => {
  const idFor = (name: string) => knownNames.get(norm(name)) ?? slug(name);

  const clean = (s: string) => s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, " ").replace(/<!--[\s\S]*?-->/g, " ");

  const out: Record<string, WikiMutation> = {};
  const hits = [...wikitext.matchAll(/\{\{Slot\|([^}]+)\}\}/g)];

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index!;
    const nextRow = i + 1 < hits.length ? hits[i + 1].index! : wikitext.length;
    const tableEnd = wikitext.indexOf("\n|}", start);
    const end = tableEnd > start && tableEnd < nextRow ? tableEnd : nextRow;

    const name = hits[i][1].trim();
    const t = clean(wikitext.slice(start, end));

    const rarity = RARITIES.find((r) => t.includes(`{{${r}}}`));
    const size = t.match(/'''Size:'''\s*(\d+)\s*x\s*\d+/i);
    /*
     * The whole Growth Surface LINE first, then every identity template on it.
     * Capturing one template in a single regex is exactly the bug that cost
     * Lonelily its second surface: the wiki writes multi-surface rows as
     * `{{Item|Farmland}}, {{Item|Dirt}}` and a lone capture stops at the comma.
     */
    const groundLine = t.match(/'''Growth Surface:'''([^\n]*)/i);
    const grounds = groundLine
      ? [...groundLine[1].matchAll(/\{\{(?:ID|Item)\|([^}|]+)(?:\|[^}]*)?\}\}/g)].map((m) => slug(m[1]))
      : [];
    if (!rarity || !size || grounds.length === 0) continue; // not a mutation row

    // Growth stages sit in the column right after the spawn-chance template.
    const stages = t.match(/\{\{Chance\|[^}]*\}\}[\s\S]{0,40}?\|\s*class="ct"\s*\|\s*(\d+)/);

    const requirements: { crop: string; count: number }[] = [];
    const seen = new Set<string>();
    const add = (cropName: string, count: string) => {
      const crop = idFor(cropName);
      if (seen.has(crop)) return;
      seen.add(crop);
      requirements.push({ crop, count: Number(count) });
    };

    const spread = t.match(/'''Spreading Conditions:'''([^\n]*)/i);
    if (spread) {
      for (const m of spread[1].matchAll(/\{\{RD\|\s*(\d+)x\s*([^}]+?)\s*\}\}/g)) add(m[2], m[1]);
      for (const m of spread[1].matchAll(/\{\{Item\|\s*([^}|]+)([^}]*)\}\}/g)) {
        const amount = m[2].match(/\|\s*amount\s*=\s*(\d+)/i);
        if (amount) add(m[1], amount[1]);
      }
      for (const m of spread[1].matchAll(/(\d+)x\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) add(m[2], m[1]);
    }

    out[idFor(name)] = {
      name,
      size: Number(size[1]),
      ground: grounds[0],
      grounds,
      rarity: rarity.toLowerCase(),
      growth_stages: stages ? Number(stages[1]) : null,
      requirements,
    };
  }

  return out;
};

export const readCache = (): WikiSnapshot | null => {
  try {
    // Same tidy-up sources.ts does: a retired key is dead weight in a quota
    // somebody else shares, so it goes the first time anything reads here.
    for (const k of STALE_CACHE_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WikiSnapshot;
    return parsed?.mutations && parsed.fetchedAt ? parsed : null;
  } catch {
    return null;
  }
};

const writeCache = (snapshot: WikiSnapshot) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Cache is an optimisation. Losing it just means fetching again.
  }
};

/**
 * How long between manual wiki syncs.
 *
 * Ten seconds, the same floor the Hypixel pull uses, because the reason is the
 * same: a button that fires a request per click is a button somebody will click
 * three times. The wiki is not rate limited the way a keyed API is, but it is
 * somebody else's server and a burst of identical parse requests is rude
 * whether or not anyone is counting.
 */
const SYNC_MIN_GAP_MS = 10_000;

/**
 * The gate every wiki sync goes through, manual or automatic.
 *
 * Deliberately at the transport rather than in the button. The settings page
 * had `disabled={syncing}`, which is React state: it lags a tick, so two clicks
 * in the same tick both passed it, and its `setState` guard only skipped the
 * state update while the fetch went out regardless. There are also two callers
 * (this page and `datasetStore`), so a guard in either one would leave the
 * other open. One gate here covers both by construction.
 *
 * Attaching callers may have passed different `knownNames` maps. That is
 * correct here rather than merely tolerable: the request is for one shared wiki
 * page, both callers build the same name map from the same bundled dataset, and
 * the result is written to the one shared cache either way.
 */
const syncGate = makeGate(() => runFetchWikiMutations(pendingSync.names, pendingSync.signal), SYNC_MIN_GAP_MS);

let pendingSync: { names: Map<string, string>; signal?: AbortSignal } = { names: new Map() };

/** When the next manual sync is allowed. For a button that wants to say so. */
export const syncCooldownUntil = (): number => syncGate.cooldownUntil();

/**
 * Fetch and cache the wiki's mutation table.
 *
 * Rejects with `SYNC_REFUSED` when the floor turned the call away, so a caller
 * can tell "we did not ask" from "we asked and it failed" and say something
 * different about each. Refusal is not an error state worth showing as one.
 */
export const SYNC_REFUSED = "sync-refused";
export const WIKI_REFRESH_BLOCKED = "Live wiki refresh blocked by Cloudflare challenge";

export const fetchWikiMutations = async (
  knownNames: Map<string, string>,
  signal?: AbortSignal
): Promise<WikiSnapshot> => {
  pendingSync = { names: knownNames, signal };
  const snapshot = await syncGate.run();
  if (snapshot === undefined) throw new Error(SYNC_REFUSED);
  return snapshot;
};

const runFetchWikiMutations = async (
  knownNames: Map<string, string>,
  signal?: AbortSignal
): Promise<WikiSnapshot> => {
  const url = `${API}?${new URLSearchParams({
    action: "parse",
    page: "Mutations",
    prop: "wikitext",
    format: "json",
    formatversion: "2",
    origin: "*",
  })}`;

  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.headers.get("Cf-Mitigated")?.toLowerCase() === "challenge") {
      throw new Error(WIKI_REFRESH_BLOCKED);
    }
    throw new Error(`Wiki responded ${res.status}`);
  }

  const json = (await res.json()) as { parse?: { wikitext?: string } };
  const wikitext = json.parse?.wikitext;
  if (!wikitext) throw new Error("Wiki returned no page content");

  const mutations = parseWikiMutations(wikitext, knownNames);
  if (Object.keys(mutations).length === 0) throw new Error("Parsed no mutations from the wiki");

  const snapshot: WikiSnapshot = { fetchedAt: Date.now(), mutations };
  writeCache(snapshot);
  return snapshot;
};

export interface FieldChange {
  id: string;
  name: string;
  field: string;
  from: string;
  to: string;
}

/**
 * Overlay wiki values onto the bundled dataset.
 *
 * Only the fields the wiki table actually carries are touched, so buffs,
 * decay, drops and prose from the bundled copy survive untouched. Every change
 * is reported so the UI can say what moved rather than silently differing.
 */
export const applyWikiMutations = <T extends object>(
  bundled: Record<string, T>,
  wiki: Record<string, WikiMutation>
): { merged: Record<string, T>; changes: FieldChange[] } => {
  const merged: Record<string, T> = { ...bundled };
  const changes: FieldChange[] = [];

  const reqKey = (reqs: { crop: string; count: number }[]) =>
    [...reqs]
      .map((r) => `${r.count}x ${r.crop}`)
      .sort()
      .join(", ") || "none";

  for (const [id, w] of Object.entries(wiki)) {
    const base = bundled[id];
    if (!base) {
      // A brand new mutation on the wiki. Take it, flagged.
      merged[id] = { ...(w as unknown as T) };
      changes.push({ id, name: w.name, field: "added", from: "-", to: w.name });
      continue;
    }

    const next = { ...base } as T;
    const baseRecord = base as unknown as Record<string, unknown>;

    const check = (field: keyof WikiMutation & string, fromVal: unknown, toVal: unknown) => {
      if (String(fromVal) === String(toVal)) return;
      changes.push({ id, name: w.name, field, from: String(fromVal), to: String(toVal) });
      (next as Record<string, unknown>)[field] = toVal;
    };

    check("rarity", baseRecord.rarity, w.rarity);
    check("size", baseRecord.size, w.size);
    check("ground", baseRecord.ground, w.ground);
    /*
     * The full surface list, compared as a joined key because two arrays are
     * never `String`-equal. A bundled record without `grounds` reads as its
     * one `ground`, so the 39 single-surface mutations produce no change row
     * and Lonelily produces exactly one.
     */
    const baseGrounds = (baseRecord.grounds as string[] | undefined) ?? [String(baseRecord.ground ?? "")];
    // `?? [w.ground]` is defence, not the plan: the cache key bump retires
    // ground-only snapshots, but a hand-built snapshot (tests, tooling) that
    // states one ground still deserves a sane reading rather than a throw.
    const wikiGrounds = w.grounds ?? [w.ground];
    if (baseGrounds.join(", ") !== wikiGrounds.join(", ")) {
      changes.push({ id, name: w.name, field: "grounds", from: baseGrounds.join(", "), to: wikiGrounds.join(", ") });
      (next as Record<string, unknown>).grounds = wikiGrounds;
    }
    // Jerryflower has no spawn-chance column for the regex to anchor on, so a
    // miss here means "the row does not say", not "zero".
    if (w.growth_stages !== null) check("growth_stages", baseRecord.growth_stages, w.growth_stages);

    const baseRequirements = Array.isArray(baseRecord.requirements)
      ? baseRecord.requirements as { crop: string; count: number }[]
      : [];
    if (reqKey(baseRequirements) !== reqKey(w.requirements)) {
      changes.push({ id, name: w.name, field: "requirements", from: reqKey(baseRequirements), to: reqKey(w.requirements) });
      (next as Record<string, unknown>).requirements = w.requirements;
    }

    merged[id] = next;
  }

  return { merged, changes };
};
