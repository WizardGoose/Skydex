import { wikiArticleUrl } from "../ui/wikiUrl";
import { normalise, titleCase } from "./normalise";
import { rarityKey } from "./rarity";
import { SECTION_ENTRIES } from "./sections";
import type { Destination, SearchEntry, SearchOutcome } from "./types";

/**
 * The universal search, as a pure function over plain data.
 *
 * Nothing in this file touches React, the DOM, the network or localStorage.
 * Building the index and running a query are both ordinary functions of their
 * arguments, which is what lets the whole thing be tested in the node
 * environment the rest of this project's tests run in. The React layer that
 * feeds it lives next door in `useSiteIndex.ts` and does nothing but fetch.
 *
 * WHAT IS IN THE INDEX
 * --------------------
 *   items       the crafting index, roughly 2,200 entries, tier-coloured
 *   mutations   the 40 greenhouse mutations
 *   targets     the things worth grinding towards that consume a mutation
 *   shards      the 189 fusion shards
 *   sections    the site's own pages
 *
 * WHY DEDUPE IS BY NAME AND NOT BY ID
 * -----------------------------------
 * The same word is frequently a row in more than one dataset. Choconut is a
 * greenhouse mutation AND an item in the crafting index; a shard name can also
 * be an item. Ids do not collide because they come from different namespaces,
 * so an id-based dedupe would leave the list showing one word three times with
 * three different badges, which is exactly the noise a universal search exists
 * to remove.
 *
 * So the merge is by normalised name and the winner is the most specific tool
 * that owns the thing. Choconut resolves to the Planner rather than to a
 * crafting row, because when you are looking up Choconut what you want is the
 * grow order. The precedence is stated once, in DEST_RANK, and the tests pin
 * it.
 */

/** Which destination survives when two datasets name the same thing. */
const DEST_RANK: Record<Destination, number> = {
  site: 5,
  greenhouse: 4,
  shards: 3,
  items: 2,
  wiki: 1,
};

/** Rows the dropdown shows, wiki row included. */
export const MAX_ROWS = 8;

/* ------------------------------------------------------------------------ *
 * Building
 * ------------------------------------------------------------------------ */

/** The shape each source has to be flattened to before it can be indexed. */
export interface IndexSources {
  /** Crafting index rows: `{ id, name, tier }`. */
  items: { id: string; name: string; tier: string | null }[];
  /** Greenhouse mutations: `{ id, name, rarity }`. */
  mutations: { id: string; name: string; rarity: string | null }[];
  /** Plannable end goals that consume a mutation: `{ id, name }`. */
  targets: { id: string; name: string }[];
  /** Fusion shards: `{ key, name, rarity }` where key is the C1/U3 form. */
  shards: { key: string; name: string; rarity: string | null }[];
  /** Prefix for bundled art, i.e. Vite's BASE_URL. Trailing slash included. */
  assetBase: string;
}

const EMPTY: IndexSources = { items: [], mutations: [], targets: [], shards: [], assetBase: "/" };

/**
 * Every source flattened, merged and deduped into one searchable list.
 *
 * Each source fills its own bucket, and the buckets are then drained in
 * DEST_RANK order. The first entry to claim a normalised name keeps it, so
 * precedence is stated exactly once, up in DEST_RANK, rather than being an
 * accident of the order these loops happen to be written in. Sections are
 * drained ahead of everything because a page always beats a piece of data with
 * the same name.
 */
export const buildSearchIndex = (sources: Partial<IndexSources> = {}): SearchEntry[] => {
  const { items, mutations, targets, shards, assetBase } = { ...EMPTY, ...sources };

  const buckets: Record<Destination, SearchEntry[]> = { site: [], greenhouse: [], shards: [], items: [], wiki: [] };

  /* Mutations. The crop art is bundled, so it is handed over as `iconSrc` and
     the wiki image is only asked for if that 404s. */
  for (const m of mutations) {
    buckets.greenhouse.push({
      key: `greenhouse:${m.id}`,
      name: m.name,
      destination: "greenhouse",
      href: `/greenhouse#planner?target=${encodeURIComponent(m.id)}`,
      rarity: rarityKey(m.rarity),
      iconName: m.name,
      iconSrc: `${assetBase}greenhouse/crops/${m.id}.png`,
      hint: "Mutation",
      weight: 40,
      needle: normalise(m.name),
      aliases: normalise(m.id),
    });
  }

  /* Targets. Crafted from mutations, so the Planner is the better destination
     than the crafting page even though most of them are also items. */
  for (const t of targets) {
    buckets.greenhouse.push({
      key: `greenhouse:target:${t.id}`,
      name: t.name,
      destination: "greenhouse",
      href: `/greenhouse#planner?target=${encodeURIComponent(t.id)}`,
      rarity: null,
      iconName: t.name,
      iconId: t.id,
      hint: "Target",
      weight: 30,
      needle: normalise(t.name),
      aliases: "",
    });
  }

  /* Shards. Art is bundled under the C1/U3 key rather than under the name. */
  for (const s of shards) {
    buckets.shards.push({
      key: `shards:${s.key}`,
      name: s.name,
      destination: "shards",
      href: `/shards?q=${encodeURIComponent(s.name)}`,
      rarity: rarityKey(s.rarity),
      iconName: s.name,
      iconSrc: `${assetBase}shardIcons/${s.key}.png`,
      hint: "Shard",
      weight: 20,
      needle: normalise(s.name),
      aliases: normalise(s.key),
    });
  }

  /* Items. The largest source by two orders of magnitude, and the least
     specific, so it fills whatever names are left. */
  for (const it of items) {
    buckets.items.push({
      key: `items:${it.id}`,
      name: it.name,
      destination: "items",
      href: `/recipes?q=${encodeURIComponent(it.name)}`,
      rarity: rarityKey(it.tier),
      iconName: it.name,
      iconId: it.id,
      weight: 0,
      needle: normalise(it.name),
      aliases: normalise(it.id),
    });
  }

  const order = (Object.keys(buckets) as Destination[]).sort((a, b) => DEST_RANK[b] - DEST_RANK[a]);

  const seen = new Set<string>();
  const out: SearchEntry[] = [];
  for (const entry of [...SECTION_ENTRIES, ...order.flatMap((d) => buckets[d])]) {
    if (!entry.needle || seen.has(entry.needle)) continue;
    seen.add(entry.needle);
    out.push(entry);
  }

  return out;
};

/* ------------------------------------------------------------------------ *
 * Searching
 * ------------------------------------------------------------------------ */

/**
 * How well one entry answers one query. Zero means it does not, and zero is
 * the only value that excludes a row, so the bands below are all above it.
 *
 * The bands are wide apart because they are qualitatively different answers,
 * not a smooth similarity: an exact name is what you meant, a prefix is almost
 * certainly what you meant, a word inside the name is plausible, and a hit that
 * only shows up in an alias is a rescue. Nothing here is fuzzy: no edit
 * distance, no transposition tolerance. A typo returns the wiki row, which is
 * the honest answer for "I do not know what this is called".
 */
export const scoreEntry = (entry: SearchEntry, q: string): number => {
  const n = entry.needle;
  let base = 0;

  if (n === q) base = 1000;
  else if (n.startsWith(q)) base = 800;
  else if (n.includes(` ${q}`)) base = 620;
  else if (n.includes(q)) base = 420;
  else if (entry.aliases) {
    if (entry.aliases === q || entry.aliases.startsWith(`${q} `)) base = 300;
    else if (entry.aliases.includes(` ${q}`) || entry.aliases.startsWith(q)) base = 220;
    else if (entry.aliases.includes(q)) base = 140;
  }

  if (base === 0) return 0;

  /* Shorter names win ties. "Choconut" should beat "Choconut Cluster" for the
     query "choco", and length is the only signal available that says so. */
  return base + entry.weight - Math.min(entry.name.length, 48) * 0.5;
};

/**
 * Run a query.
 *
 * The wiki row is appended rather than ranked, and it is always present, which
 * is deliberate on both counts. Always present because the wiki is the answer
 * to every question this site cannot answer, and last because it is the one
 * result that leaves the site. It points at the top match's name when there is
 * one, so "choco" offers the Choconut article rather than an article called
 * Choco that does not exist.
 */
export const searchSite = (index: SearchEntry[], rawQuery: string, limit = MAX_ROWS): SearchOutcome => {
  const q = normalise(rawQuery);
  if (!q) return { rows: [], moreInItems: 0, moreHref: "/recipes" };

  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of index) {
    const score = scoreEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  /* One slot is reserved for the wiki row, so the data rows get the rest. */
  const dataRows = scored.slice(0, Math.max(0, limit - 1)).map((s) => s.entry);

  const itemMatches = scored.reduce((n, s) => n + (s.entry.destination === "items" ? 1 : 0), 0);
  const itemsShown = dataRows.reduce((n, e) => n + (e.destination === "items" ? 1 : 0), 0);

  const wikiName = dataRows[0]?.name ?? titleCase(rawQuery);
  const wikiRow: SearchEntry = {
    key: `wiki:${wikiName}`,
    name: wikiName,
    destination: "wiki",
    href: wikiArticleUrl(wikiName),
    external: true,
    rarity: dataRows[0]?.rarity ?? null,
    iconName: wikiName,
    iconSrc: dataRows[0]?.iconSrc,
    /* No hint. The badge already says Wiki and carries the external-link
       glyph, so a note beside it would only repeat what the badge just said. */
    weight: 0,
    needle: normalise(wikiName),
    aliases: "",
  };

  return {
    rows: [...dataRows, wikiRow],
    moreInItems: Math.max(0, itemMatches - itemsShown),
    moreHref: `/recipes?q=${encodeURIComponent(rawQuery.trim())}`,
  };
};
