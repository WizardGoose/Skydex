import { useSyncExternalStore } from "react";
import { prettify } from "./format";
import { norm } from "../items/wikiCrafting";
import { requestItemResource, resourceNameFor } from "../items/itemResource";

/**
 * Which sack holds what.
 *
 * WHY THIS IS FETCHED AND NOT BUNDLED
 * -----------------------------------
 * The membership table is the wiki's `Sacks` article, and wiki content is
 * CC BY-NC-SA 3.0. Copying six hundred item names out of it into this repo
 * would be us redistributing wiki content, which is the exact thing
 * `items/wikiCrafting.ts` exists to avoid. So this does what that file does:
 * fetches the page at runtime, parses it in the browser, and ships code rather
 * than content. The wiki serves its own article to the visitor, as if they had
 * opened it themselves.
 *
 * The page comes back from `index.php?action=raw` with
 * `Access-Control-Allow-Origin: *`, the same endpoint and the same terms the
 * crafting module already uses, so this adds a request and no new arrangement.
 *
 * NOTHING HERE GUESSES
 * --------------------
 * Every fact in this file is read off the article: the sack names, the item
 * lists, the display order, and even the icon file name. Where the article is
 * silent the answer is null and the item lands in the catch-all group, which is
 * labelled as exactly that. A wrong sack is worse than an unsorted one, because
 * the player would go and look in it.
 */

const WIKI = "https://hypixelskyblock.minecraft.wiki";

/** The article. Its `== Types ==` table is the whole source. */
export const SACK_PAGE = "Sacks";

/** New surface, so a new key. Nothing else in this browser is touched. */
export const SACKS_CACHE_KEY = "skydex.sacks.v1";

/** The article changes with game updates, not with page views. */
export const SACKS_TTL = 24 * 60 * 60 * 1000;

/** Where an item goes when the article does not place it. Never a guess, and never dropped. */
export const UNSORTED_SACK = "Sack not identified";

/** One row of the article's `== Types ==` table. */
export interface SackDefinition {
  /** The sack's article name, from the Name column, e.g. `Agronomy Sack`. */
  sack: string;
  /** The wiki file the row's icon uses, e.g. `Large Agronomy Sack`. Null when the row has none. */
  icon: string | null;
  /** Item article names, verbatim, in the order the row lists them. */
  items: string[];
}

/* ---------------------------------------------------------------- parsing */

/**
 * Slice a `== Heading ==` section out of wikitext.
 *
 * Matched on the trimmed line rather than with a built regex, because the
 * heading text is data and interpolating data into a pattern is how a stray
 * bracket turns a parser into a syntax error.
 */
export const wikiSection = (wikitext: string, heading: string): string => {
  const lines = wikitext.split("\n");
  const start = lines.findIndex((l) => l.trim() === `== ${heading} ==`);
  if (start === -1) return "";

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const t = lines[i].trim();
    // A level-two heading ends the section. Deeper ones are still inside it.
    if (t.startsWith("==") && !t.startsWith("===")) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
};

/**
 * Article names from every `[[link]]` in a cell.
 *
 * The target is the part before any pipe, so `[[Odger#Novice|Novice]]` yields
 * the target rather than the label. Only ever called on the Name and Items
 * columns, so the Source column's shop and NPC links never reach it.
 */
const linkTargets = (cell: string): string[] => {
  const out: string[] = [];
  for (const m of cell.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const target = m[1].split("|")[0].trim();
    if (target) out.push(target);
  }
  return out;
};

/**
 * Split one table row into its cells.
 *
 * A cell starts at a line beginning with a single `|`; anything else is a
 * continuation of the cell above it, which is what keeps a multi-line Source
 * column (`----{{Bits|14,000}}`) attached to its own cell instead of starting a
 * new one. A leading HTML attribute (`class="ct" |`) is stripped, because
 * several rows carry one and it is presentation rather than content.
 */
const rowCells = (row: string): string[] => {
  const cells: string[] = [];
  let current: string | null = null;

  for (const line of row.split("\n")) {
    const startsCell =
      line.startsWith("|") && !line.startsWith("|-") && !line.startsWith("|}") && !line.startsWith("|+");
    if (startsCell) {
      if (current !== null) cells.push(current);
      current = line.slice(1);
    } else if (current !== null) {
      current += `\n${line}`;
    }
  }
  if (current !== null) cells.push(current);

  return cells.map((c) => c.replace(/^\s*[a-zA-Z-]+\s*=\s*"[^"]*"\s*\|/, "").trim());
};

/**
 * The icon file a row draws itself with.
 *
 * The Icon column is `{{Slot|<file>}}`, and a leading `*` is the article's own
 * marker for "this sack has Small/Medium/Large tiers", in which case the file
 * on the wiki is the Large one. That convention is the article's, not ours, so
 * reading it here is sourcing rather than guessing, and it resolves every row.
 */
const slotIcon = (cell: string): string | null => {
  const m = cell.match(/\{\{Slot\|([^}|]+)/);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  return raw.startsWith("*") ? `Large ${raw.slice(1).trim()}` : raw;
};

/**
 * Parse the article's `== Types ==` table.
 *
 * A row needs a name and at least one item to mean anything, so the header row
 * and the section stub fall out by having neither. Deliberately forgiving:
 * this reads a page other people edit, and a malformed row should cost that row
 * rather than the whole feature.
 */
export const parseSackTable = (wikitext: string): SackDefinition[] => {
  const types = wikiSection(wikitext, "Types");
  if (!types) return [];

  const out: SackDefinition[] = [];
  for (const row of types.split(/\n\|-[^\n]*\n/)) {
    const cells = rowCells(row);
    if (cells.length < 3) continue;

    const sack = linkTargets(cells[1])[0];
    const items = linkTargets(cells[2]);
    if (!sack || items.length === 0) continue;

    out.push({ sack, icon: slotIcon(cells[0]), items });
  }
  return out;
};

/**
 * Item names from one sack's own article.
 *
 * WHY THE TABLE IS NOT ENOUGH
 * ---------------------------
 * The `Sacks` article's Types table is a summary and is edited as one, so it
 * lags. Measured against a real 373-entry sack export: the table alone left 27
 * items unplaced, and most of them were ordinary Fishing Sack contents. The
 * Fishing row lists 18 items; the Fishing Sack article's own infobox lists 42,
 * including every piece of fishing junk the table omits. Across all 30 rows the
 * articles carry 686 items against the table's 613.
 *
 * So the articles are the authority and the table supplies the roster, the
 * order and the icons. Both are read, and the union is used, because each
 * occasionally carries something the other has dropped.
 *
 * `Infobox/Sack` states contents as `sack_items = * Name` bullet lists, with a
 * `sack_items_b` variant for the beginner tier. Bullets are plain names rather
 * than links, so this strips the light wiki markup that does appear and takes
 * the text.
 */
export const parseSackArticle = (wikitext: string): string[] => {
  const out: string[] = [];
  let inParam = false;

  for (const line of wikitext.split("\n")) {
    const start = line.match(/^\|\s*sack_items[a-z_]*\s*=(.*)$/i);
    if (start) {
      inParam = true;
      // Some articles put the first bullet on the parameter line itself.
      for (const piece of start[1].split("*")) {
        const t = piece.trim();
        if (t) out.push(t);
      }
      continue;
    }
    if (!inParam) continue;

    const t = line.trim();
    // Any other parameter, or the end of the template, closes this one.
    if (t.startsWith("|") || t.startsWith("}}")) {
      inParam = false;
      continue;
    }
    if (t.startsWith("*")) out.push(t.replace(/^\*+/, "").trim());
  }

  return out
    .map((s) =>
      s
        // `[[Target|Label]]` and `[[Target]]` both reduce to the target.
        .replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1")
        .replace(/\{\{[^}]*\}\}/g, "")
        .trim()
    )
    // Seven of the articles write the enchanted items as "Ench Cooked Salmon"
    // rather than "Enchanted Cooked Salmon". That is the wiki's own shorthand
    // for one word, expanded here rather than matched around, because no item
    // in the game is actually named "Ench something" and leaving it unexpanded
    // silently dropped every enchanted fish and several enchanted ores.
    .map((s) => s.replace(/^Ench\s+/i, "Enchanted "))
    .filter((s) => s !== "" && !s.startsWith("<"));
};

/**
 * Fold each sack's article contents into its table row.
 *
 * A union rather than a replacement, and the table's order is preserved, so the
 * roster, the display order and the icons all still come from the one place
 * that states them for every sack at once.
 */
export const mergeArticleItems = (
  defs: readonly SackDefinition[],
  articles: Readonly<Record<string, string[]>>
): SackDefinition[] =>
  defs.map((def) => {
    const extra = articles[def.sack];
    if (!extra || extra.length === 0) return def;

    const seen = new Set(def.items.map((i) => i.toLowerCase()));
    const items = [...def.items];
    for (const item of extra) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
    return { ...def, items };
  });

/* ----------------------------------------------------------------- index */

/**
 * The enchanted sacks folded onto the sack they shadow.
 *
 * `Large Enchanted Agronomy Sack` holds the enchanted forms of exactly what
 * `Agronomy Sack` holds, and a player thinks of both as "the farming sack".
 * Keeping them apart would split farming across two boxes and double the number
 * of groups on screen for no gain, so the enchanted rows fold into their base.
 *
 * Only that one prefix folds. `Bronze Trophy Fishing Sack` and its silver twin
 * stay separate even though the article gives them identical contents, because
 * they are separate sacks with separate sources and we have no evidence they
 * should merge beyond them looking alike.
 */
export const sackFamily = (sack: string): string => sack.replace(/^(Large )?Enchanted /, "");

export interface SackFamily {
  /** The base sack name, e.g. `Agronomy Sack`. */
  sack: string;
  /** Wiki file name for the family's icon, or null when no row supplied one. */
  icon: string | null;
}

export interface SackIndex {
  /** Families in the order the article lists them. */
  families: SackFamily[];
  /** Normalised item article name -> family. */
  byName: Map<string, string>;
  /** Hypixel item id -> family, resolved through the site's item index. */
  byId: Map<string, string>;
  /** False until the article has been parsed, so the UI can say so rather than imply "no sack". */
  ready: boolean;
}

export const EMPTY_SACK_INDEX: SackIndex = {
  families: [],
  byName: new Map(),
  byId: new Map(),
  ready: false,
};

/**
 * Turn parsed rows into lookups.
 *
 * FIRST MENTION WINS, AND IT HAS TO
 * ---------------------------------
 * Sixty of the article's items appear in more than one sack: Blaze Rod is in
 * Combat and in Nether, Oil Barrel is in three. An item shown under two headings
 * would have its count read twice by anyone totalling the column, so each item
 * gets exactly one home and the first row that claims it keeps it. The article's
 * order runs from the general sacks to the specialised ones, so first mention is
 * also the sack a player is most likely to reach for.
 *
 * The id map is built by walking the site's item index once and asking whether
 * the article names that item, so an id is only ever attached to a sack through
 * a name the wiki actually used. Nothing is derived from an id's spelling here;
 * that fallback lives in `sackOf`, where it is a last resort rather than the
 * rule.
 */
export const buildSackIndex = (
  defs: readonly SackDefinition[],
  items: Readonly<Record<string, { name: string; hypixelId: string | null }>>
): SackIndex => {
  const families: SackFamily[] = [];
  const seen = new Set<string>();
  const byName = new Map<string, string>();

  for (const def of defs) {
    const family = sackFamily(def.sack);
    if (!seen.has(family)) {
      seen.add(family);
      families.push({ sack: family, icon: def.icon });
    }
    for (const item of def.items) {
      const key = norm(item);
      if (key && !byName.has(key)) byName.set(key, family);
    }
  }

  const byId = new Map<string, string>();
  for (const item of Object.values(items)) {
    if (!item?.hypixelId || !item.name) continue;
    const family = byName.get(norm(item.name));
    if (family && !byId.has(item.hypixelId)) byId.set(item.hypixelId, family);
  }

  return { families, byName, byId, ready: defs.length > 0 };
};

/**
 * Sacks whose membership is a rule rather than a list.
 *
 * The Rune Sack's article gives its contents as the single word "Runes" and
 * then says in prose that it "holds 64 of each rune (including separate
 * tiers)". There is no list to match against, so the rule is read off that
 * sentence: an item that is a rune belongs to the Rune Sack.
 *
 * The sack is looked up by name in the parsed index rather than hardcoded, so
 * if the wiki renames or removes it the rule quietly stops applying instead of
 * inventing a group nothing else knows about.
 */
const RUNE_SACK = "Rune Sack";
const isRune = (id: string, display: string): boolean =>
  /(^|_)RUNE(_|$)/i.test(id) || /\brune\b/i.test(display);

/**
 * The sack that holds this id, or null when nothing we can read says.
 *
 * THE RUNGS, AND WHY THEY ARE IN THIS ORDER
 * -----------------------------------------
 * Authoritative first, heuristic last. That ordering is the whole defence
 * against filing something under a plausible but wrong sack, which is worse
 * than leaving it unfiled because the player would go and look in it.
 *
 *   1. the id map, built from names the wiki itself used
 *   2. Hypixel's own display name for the id, from the item resource. This is
 *      the rung that fixes the mismatches, and there are a lot of them:
 *      `GARDEN_CHEESE_FUEL` is "Tasty Cheese", `LOTUS_SILVER` is "Silver
 *      Lotus", `DIVER_FRAGMENT` is "Emperor's Skull". No amount of
 *      title-casing reaches any of those, and guessing at them is exactly how
 *      an item ends up in the wrong sack.
 *   3. the name the id spells, via `prettify`, which routes the 1.8 pairs
 *      through the legacy table first so `INK_SACK:3` asks about Cocoa Beans
 *      rather than about "Ink Sack 3"
 *   4. the rune rule, for the one sack that has no list
 *
 * Every rung is an exact match on a normalised name. None of them strips a
 * suffix or takes a nearest neighbour, so a rung that fails leaves the item
 * unplaced rather than placing it somewhere plausible. `LOTUS_SILVER` resolves
 * to Fishing Sack because the wiki names "Silver Lotus" there, not because
 * anything cut `_SILVER` off and matched the bare Lotus.
 */
export const sackOf = (id: string, index: SackIndex): string | null => {
  const direct = index.byId.get(id);
  if (direct) return direct;

  const resource = resourceNameFor(id);
  if (resource) {
    const hit = index.byName.get(norm(resource));
    if (hit) return hit;
  }

  const display = prettify(id);
  const spelled = index.byName.get(norm(display));
  if (spelled) return spelled;

  if (isRune(id, resource ?? display) && index.families.some((f) => f.sack === RUNE_SACK)) return RUNE_SACK;

  return null;
};

/* --------------------------------------------------------------- display */

export interface SackEntry {
  id: string;
  name: string;
  count: number;
}

/**
 * The sack entries worth showing, which is the ones the player actually has.
 *
 * WHY THIS IS A DISPLAY FILTER
 * ----------------------------
 * A sack the player has never put anything in still arrives as an entry with a
 * count of zero, and there are hundreds of them: the section became pages of
 * items nobody owns, which buried the ones they do. The mod now strips them
 * before export, but that fixes only snapshots taken from here on, and the one
 * already sitting in this browser still has them.
 *
 * So the filter lives here, on the way to the screen, exactly like
 * `chrome.withoutChrome`. The stored snapshot keeps every entry it arrived
 * with, because the mod owns history and the site owns display, and because a
 * display rule that turns out to be wrong has to be fixable in a release rather
 * than by asking the player to export their island again.
 *
 * Nothing here writes: the input is read through `Object.entries` and a new
 * array comes out. Freezing the input and running this changes nothing, which
 * is the property the tests assert.
 *
 * A count that is not a positive finite number is not shown, and that includes
 * a negative. There is no such thing as owing a sack items, so a negative is
 * corruption rather than a possession, and showing it would state something
 * about the player's storage that cannot be true.
 *
 * THE NAME, AND WHY IT IS NOT JUST `prettify`
 * --------------------------------------------
 * Found live on this board: `ENCHANTED_NETHER_STALK` prettifying to "Enchanted
 * Nether Stalk" while the NPC sell row three sections up, reading the same id
 * out of the item resource, calls it "Enchanted Nether Wart" - the name
 * Hypixel's own API and the wiki article both use. Same bug on `LOTUS_SILVER`
 * ("Lotus Silver" instead of "Silver Lotus"), `DIVER_FRAGMENT` ("Diver
 * Fragment" instead of "Emperor's Skull") and `BOB_OMB` ("Bob Omb" instead of
 * "Bob-omb"). `sackOf` below already reaches past `prettify` for exactly this
 * reason when it decides which sack an id belongs to; the row's own label has
 * to take the same rung, or the board can file an item correctly and still
 * misname it. `resourceNameFor` is the live Hypixel item resource this file
 * already imports for that purpose, and it returns null (falling straight
 * back to `prettify`) for every id `prettify` already gets right.
 */
export const liveSackEntries = (sacks: Readonly<Record<string, number>> | null | undefined): SackEntry[] => {
  if (!sacks) return [];

  const out: SackEntry[] = [];
  for (const [id, count] of Object.entries(sacks)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    out.push({ id, name: resourceNameFor(id) ?? prettify(id), count });
  }
  return out;
};

export interface SackGroup {
  /** Family name, or `UNSORTED_SACK` for the catch-all. */
  sack: string;
  /** Wiki file for the icon, null for the catch-all and for a family the article gave none. */
  icon: string | null;
  /** False only for the catch-all, so the UI can label it rather than dress it up as a sack. */
  identified: boolean;
  rows: SackEntry[];
  /** Sum of the group's counts. */
  total: number;
}

/**
 * Group entries under the sack that owns them.
 *
 * Families come out in the article's order so the board reads the same way
 * twice running, and a family nobody owns anything from is not rendered at all:
 * an empty Dragon Sack heading is a row of furniture, not information.
 *
 * The catch-all is always last and is only present when something landed in it.
 * It exists because dropping an unplaceable item would be the one unforgivable
 * failure for a page whose job is telling somebody where their things are, and
 * because filing it under a guessed sack would be worse still.
 */
export const groupSacks = (entries: readonly SackEntry[], index: SackIndex): SackGroup[] => {
  const buckets = new Map<string, SackEntry[]>();
  const unsorted: SackEntry[] = [];

  for (const entry of entries) {
    const family = index.ready ? sackOf(entry.id, index) : null;
    if (!family) {
      unsorted.push(entry);
      continue;
    }
    const bucket = buckets.get(family);
    if (bucket) bucket.push(entry);
    else buckets.set(family, [entry]);
  }

  const byCount = (a: SackEntry, b: SackEntry) => b.count - a.count || a.name.localeCompare(b.name);
  const out: SackGroup[] = [];

  for (const family of index.families) {
    const rows = buckets.get(family.sack);
    if (!rows || rows.length === 0) continue;
    rows.sort(byCount);
    out.push({
      sack: family.sack,
      icon: family.icon,
      identified: true,
      rows,
      total: rows.reduce((n, r) => n + r.count, 0),
    });
  }

  if (unsorted.length > 0) {
    unsorted.sort(byCount);
    out.push({
      sack: UNSORTED_SACK,
      icon: null,
      identified: false,
      rows: unsorted,
      total: unsorted.reduce((n, r) => n + r.count, 0),
    });
  }

  return out;
};

/* ----------------------------------------------------------------- store */

export interface SackDefsState {
  defs: SackDefinition[];
  fetchedAt: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Cache shape version, inside the value rather than in the key.
 *
 * The key name is fixed forever, so a shape change is expressed here. A cached
 * value from before the per-sack articles were read is simply not accepted, and
 * a refetch replaces it. Nothing is ever removed: an unreadable or outdated
 * value is left exactly where it is and overwritten only on a successful fetch.
 */
const CACHE_SHAPE = 2;

interface SackCache {
  v?: number;
  fetchedAt: number;
  defs: SackDefinition[];
}

let state: SackDefsState = { defs: [], fetchedAt: null, loading: true, error: null };
const listeners = new Set<() => void>();
let hydrated = false;
let inFlight = false;

const publish = (patch: Partial<SackDefsState>) => {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
};

const readCache = (): SackCache | null => {
  try {
    const raw = localStorage.getItem(SACKS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SackCache;
    if (!Array.isArray(parsed?.defs) || typeof parsed.fetchedAt !== "number") return null;
    // An older shape is treated as absent, which triggers a refetch. It is not
    // deleted, because nothing in this file deletes.
    return parsed.v === CACHE_SHAPE ? parsed : null;
  } catch {
    return null;
  }
};

const writeCache = (cache: SackCache) => {
  try {
    localStorage.setItem(SACKS_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A full quota only costs a refetch next visit, which is not worth a
    // message on a page about storage.
  }
};

const hydrate = () => {
  if (hydrated || typeof localStorage === "undefined") return;
  hydrated = true;
  const cached = readCache();
  if (cached) publish({ defs: cached.defs, fetchedAt: cached.fetchedAt, loading: false });
};

const fresh = () => state.fetchedAt !== null && Date.now() - state.fetchedAt < SACKS_TTL;

/**
 * Every sack's article, in one request.
 *
 * MediaWiki's `action=query&prop=revisions` takes up to 50 titles at a time and
 * returns each page's wikitext, so 30 sack articles cost one round trip rather
 * than 30. That matters: this runs in a visitor's browser against somebody
 * else's wiki, and thirty requests to be polite about is thirty chances to be
 * rude with.
 *
 * A title the API cannot give us is simply absent from the result, and its sack
 * keeps whatever the summary table said. Missing articles degrade the grouping
 * rather than breaking it.
 */
const fetchArticles = async (titles: readonly string[]): Promise<Record<string, string[]>> => {
  const out: Record<string, string[]> = {};

  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const url =
      `${WIKI}/api.php?action=query&format=json&prop=revisions&rvprop=content&rvslots=main` +
      `&titles=${encodeURIComponent(batch.join("|"))}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`sack articles responded ${res.status}`);
    const body = (await res.json()) as {
      query?: { pages?: Record<string, { title?: string; revisions?: { slots?: { main?: { "*"?: string } } }[] }> };
    };

    for (const page of Object.values(body.query?.pages ?? {})) {
      const text = page.revisions?.[0]?.slots?.main?.["*"];
      if (page.title && text) out[page.title] = parseSackArticle(text);
    }
  }

  return out;
};

const ensure = () => {
  if (inFlight || fresh() || typeof fetch === "undefined") return;
  inFlight = true;

  // The id-to-name bridge is what places the items whose id does not spell
  // their name. Asking early means it is usually already there by the time a
  // grouping is computed; the call is cached and batched, so this is cheap.
  requestItemResource();

  (async () => {
    const res = await fetch(`${WIKI}/index.php?title=${encodeURIComponent(SACK_PAGE)}&action=raw`);
    if (!res.ok) throw new Error(`${SACK_PAGE} responded ${res.status}`);

    const table = parseSackTable(await res.text());
    if (table.length === 0) throw new Error("the Sacks article listed no sacks");

    // A failure here costs the extra contents, not the grouping, so the summary
    // table's answer is kept rather than the whole feature failing.
    let defs = table;
    try {
      defs = mergeArticleItems(table, await fetchArticles(table.map((d) => d.sack)));
    } catch {
      defs = table;
    }
    return defs;
  })()
    .then((defs) => {
      inFlight = false;
      const fetchedAt = Date.now();
      writeCache({ v: CACHE_SHAPE, fetchedAt, defs });
      publish({ defs, fetchedAt, loading: false, error: null });
    })
    .catch((e: Error) => {
      inFlight = false;
      // Whatever was cached stays on screen. Nothing here replaces good data
      // with an error, so a flaky network degrades to a stale grouping rather
      // than to no grouping.
      publish({ loading: false, error: e.message });
    });
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  hydrate();
  ensure();
  return () => {
    listeners.delete(fn);
  };
};

const getSnapshot = () => state;

// Whichever tab refreshed the article, the others read the newer copy rather
// than spending a second fetch on the same bytes. Only this key, and only ever
// a re-read; nothing is written or removed from here.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== SACKS_CACHE_KEY) return;
    const cached = readCache();
    if (cached) publish({ defs: cached.defs, fetchedAt: cached.fetchedAt, loading: false, error: null });
  });
}

/** The store behind `useSackDefinitions`, for readers that are not components. */
export const sackDefsStore = { subscribe, getSnapshot };

export const useSackDefinitions = (): SackDefsState => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
