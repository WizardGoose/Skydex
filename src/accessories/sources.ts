import { parseUpgradeEdges, type UpgradeEdge } from "./chains";
import { obtainRegion } from "./wikitext";
import { parseLocationSignals, type LocationIndex } from "./locations";
import type { EventKey } from "./skyblockCalendar";
/**
 * Where each accessory comes from.
 *
 * This is the point of the page. SkyCrypt tells you an accessory is missing and
 * stops; the actual work, finding out whether the thing is crafted, bought,
 * dropped or handed over at the end of a quest, happens on the wiki in another
 * tab. Putting that answer on the tile is the whole feature.
 *
 * TWO SOURCES OF TRUTH, AND ONLY ONE OF THEM IS OURS
 * --------------------------------------------------
 * Craftability we know authoritatively: the wiki's `Module:Crafting/Data` is
 * already parsed into the shared item index, so "a grid recipe exists" is a
 * fact we hold rather than a phrase we matched. Everything else lives in prose
 * on the item's wiki article, so it has to be read at runtime and classified by
 * keyword, which is a fundamentally less certain business.
 *
 * That asymmetry is why `wiki` exists as a category. It does not mean "found on
 * the wiki", it means we could not classify this one honestly. Every rule below
 * is written to fail into that bucket rather than to guess, because a guess
 * dressed as a source is worse than an admission: a player who is told an item
 * is a mob drop when it is a quest reward goes and farms a mob for an evening.
 *
 * NOTHING IS BUNDLED
 * ------------------
 * Wiki content is CC BY-NC-SA. The articles are fetched by the visitor's own
 * browser at runtime and only the resulting one-word classification is cached,
 * exactly as `wikiCrafting.ts` and `materialChain.ts` do. See the long note at
 * the top of `wikiCrafting.ts` for the full reasoning.
 */

const API = "https://hypixelskyblock.minecraft.wiki/api.php";

/**
 * A NEW cache key, namespaced to the site's current name.
 *
 * Nothing else reads or writes it, and no existing `wizardsky.*` key is touched
 * by this module, so a visitor who has never opened this page cannot lose
 * anything by its existence.
 */
// v2: v1 cached only the source classification. The same articles also state
// accessory upgrade chains, and reading them costs nothing extra on a request
// we were already making, so the cached payload now carries both. Bumping the
// key refills it once rather than serving source-only snapshots for a day.
// v3: the same articles also name the merchant or zone you get the item from,
// and resolving those names is what gives most of the catalogue an activity. So
// the cached payload now carries the extracted signals and the resolved
// name -> activity index alongside the sources and upgrade edges. Bumping the
// key refills it once rather than serving location-less snapshots for a day.
// v5: an event item now also records WHICH event its article names, because
// the actionable border needs to ask the calendar whether that event is
// running right now, and "event" alone cannot be asked anything. Same bump
// reasoning as v2 and v3: refill once rather than serve event-less snapshots
// for a day. v4 existed for minutes during development: a hot-reloading tab
// wrote a v4 snapshot after the key bump but before the events field landed,
// which is exactly the poisoned-cache shape this list exists for, so it is
// retired the same way.
// v6: event, Dark Auction and quest evidence now outrank a merchant field.
// v7: the official Year of the Witch marker is `Exclusive|Year/Witch`, not the
// rendered "Year of the Witch" wording. Refill the short-lived v6 snapshots
// rather than retain their Witch merchant classifications for a day.
export const SOURCE_CACHE_KEY = "skydex.accessories.wiki.v7";
const STALE_SOURCE_KEYS = [
  "skydex.accessories.sources.v1",
  "skydex.accessories.wiki.v2",
  "skydex.accessories.wiki.v3",
  "skydex.accessories.wiki.v4",
  "skydex.accessories.wiki.v5",
  "skydex.accessories.wiki.v6",
];

/** Same day-long freshness the crafting index uses. Sources change rarely. */
export const SOURCE_TTL = 24 * 60 * 60 * 1000;

/** The wiki API takes 50 titles per query, same as `materialChain.ts`. */
const BATCH = 50;

export type SourceCategory =
  | "craftable"
  | "quest"
  | "darkAuction"
  | "shop"
  | "event"
  | "mobDrop"
  | "wiki";

/**
 * Keyword rules, in priority order.
 *
 * Order is the whole design here. An accessory can legitimately match several
 * of these (a Dark Auction item is also, loosely, "bought"), so the list runs
 * from the most specific and least ambiguous claim to the most general:
 *
 *   dark auction   a named, unmistakable venue. One phrase, no false friends.
 *   quest          an NPC hands it over. Distinct from a shop even though both
 *                  involve an NPC, so it has to be tested before `shop`.
 *   event          a timed occasion. Tested before `mobDrop` and `shop` because
 *                  event items are usually also dropped or sold *during* the
 *                  event, and the event is the thing that actually gates you.
 *   mob drop       something has to die.
 *   shop           the weakest and broadest, so it goes last. "Sold" appears in
 *                  the prose of items that are not shop items at all, which is
 *                  precisely why it may not pre-empt anything above it.
 *
 * Patterns are deliberately narrow. Each one is a phrase a wiki editor actually
 * writes in an obtain or source line, not a single suggestive word: `/shop/`
 * alone would match "cannot be sold in any shop" and classify an unobtainable
 * item as a shop purchase.
 */
type SourceRule = { category: SourceCategory; pattern: RegExp };

/** These routes describe the gate itself, so they outrank a merchant field. */
const SPECIFIC_RULES: readonly SourceRule[] = [
  { category: "darkAuction", pattern: /dark\s*auction/i },
  {
    category: "quest",
    pattern: /\b(quest|questline|quest\s*line)\b|\breward(?:ed)?\s+(?:for|from)\s+(?:the\s+)?[a-z ]*quest/i,
  },
  {
    category: "event",
    pattern:
      /\b(spooky\s*festival|new\s*year|season\s*of\s*jerry|jerry'?s\s*workshop|winter\s*island|travelling\s*zoo|traveling\s*zoo|year(?:\s+of\s+the\s+|\s*\/\s*)witch|bingo|hoppity|easter|halloween|christmas|advent|anniversary|carnival|event)\b/i,
  },
];

/** General prose routes, checked after the exact structured merchant field. */
const GENERAL_RULES: readonly SourceRule[] = [
  {
    /*
     * Plurals matter here more than they look.
     *
     * The region a section extractor returns includes that section's SUBSECTION
     * HEADINGS, and on this wiki the heading is very often the whole answer:
     * `=== Mob Drops ===` above a body that is nothing but a `{{Drop Sources}}`
     * template. An editor writing that heading is stating the category
     * outright, which is better evidence than any sentence.
     *
     * So the vocabulary here is the vocabulary of those headings, and every one
     * of them takes an optional `s`. Getting that wrong is silent: `mob\s*drop`
     * followed by `\b` does NOT match "Mob Drops", because the boundary is
     * blocked by the plural, and the item then reports as unclassifiable with
     * its category written in plain English one line above.
     */
    category: "mobDrop",
    pattern:
      /\b(drops?\s+(?:by|from)|dropped\s+(?:by|from)|mob\s*drops?|rare\s*drops?|slayer\s*drops?|boss\s*drops?|drop\s*sources?|killing)\b/i,
  },
  {
    /*
     * Every alternative here names an ACQUISITION, not merely a shop.
     *
     * A bare `\bshop\b` was tried and is wrong, which the test suite catches:
     * "cannot be sold in any shop" is a sentence about an unobtainable item and
     * it matches. The negation stripper below removes that particular sentence,
     * but the pattern should not be relying on it, so the phrases are anchored
     * to a preposition or a verb that means somebody hands it over.
     */
    category: "shop",
    pattern:
      /\b(shop\s*purchase|sold\s+(?:by|at|in)|bought\s+(?:from|at|in)|purchas(?:e|ed|able)\s+(?:from|at|in)|buy\s+(?:it\s+)?from|available\s+(?:from|at)|merchant|npc\s*shop|bazaar)\b/i,
  },
];

/**
 * Sentences that say a thing is NOT obtainable some way.
 *
 * Wiki prose is full of these, and every one of them is a trap for a keyword
 * matcher: "cannot be sold in any shop", "no longer obtainable", "this item is
 * not dropped by any mob". Each contains the exact words that would otherwise
 * classify it, and each means the opposite.
 *
 * Dropping the whole clause rather than trying to invert it is deliberate. We
 * are not trying to understand the sentence, only to avoid being misled by it,
 * and an item whose only mention of a shop is a denial should fall through to
 * "See wiki" rather than acquire a category from a negation.
 */
const NEGATION = /\b(cannot|can't|can\s+not|could\s+not|never|no\s+longer|not\s+(?:be\s+)?(?:sold|bought|obtained|obtainable|dropped|craft\w*|purchas\w*)|unobtainable|untradeable)\b/i;

/** Split into clauses and drop the ones that deny rather than describe. */
const withoutDenials = (text: string): string =>
  text
    .split(/(?<=[.;:!?])\s+|\n+|\*/)
    .filter((clause) => !NEGATION.test(clause))
    .join("\n");

/*
 * `obtainRegion` moved to `wikitext.ts` so `locations.ts` can read the same
 * region without the two modules having to import each other in a cycle.
 * Re-exported here because it was part of this module's surface before the
 * move, and both `index.ts` and the source tests import it from here.
 */
export { obtainRegion };

/**
 * Classify one article.
 *
 * Pure and exported so every rule above can be tested without a network, which
 * matters because these rules are the part of this page most likely to be wrong
 * and most likely to be quietly edited later.
 *
 * `null` rather than `"wiki"` on a miss: this function's job is to say what it
 * recognised, and the decision to render an unrecognised item as "See wiki" is
 * the caller's. Keeping those separate means a future second classifier can be
 * tried after this one without either of them having to know about the other.
 */
export function classifyFromWikitext(wikitext: string): SourceCategory | null {
  if (!wikitext.trim()) return null;

  const region = withoutDenials(obtainRegion(wikitext));
  /*
   * Event exclusivity banners and the introductory sentence sit above the
   * first section on the official wiki, outside `Obtaining`. That lead is
   * narrow enough to trust for an event declaration while still excluding
   * later History and Trivia sections.
   */
  const lead = withoutDenials(wikitext.split(/^={2,}\s/m, 1)[0] ?? "");

  /*
   * A venue, quest or timed event is the actual gate, even when the item is
   * handed over by a merchant. The wiki screenshots that exposed this were a
   * Year of the Witch item sold by Agnes and an Anniversary legacy item.
  */
  for (const rule of SPECIFIC_RULES) {
    const evidence = rule.category === "event" ? `${region}\n${lead}` : region;
    if (rule.pattern.test(evidence)) return rule.category;
  }

  /*
   * The structured merchant field is then consulted before general prose,
   * because it is a fact rather than a phrase.
   *
   * `Infobox/Accessory` carries `|merchant = Junker Joel` and `|buy = ...` on
   * items you buy from an NPC. An editor filling that field in is making a
   * direct machine-readable claim, and reading it is both more reliable than
   * keyword matching a sentence and immune to how the sentence is worded.
   *
   * Only the shop case is done this way, and deliberately so: it is the only
   * category the infobox has a dedicated field for. Inventing structural rules
   * for the others by squinting at adjacent fields would be exactly the
   * guessing this module refuses to do.
   */
  const merchant = wikitext.match(/\|\s*merchant\s*=\s*([^\n|}]+)/i)?.[1]?.trim();
  if (merchant && !/^(n|no|none)$/i.test(merchant)) return "shop";

  for (const rule of GENERAL_RULES) {
    if (rule.pattern.test(region)) return rule.category;
  }
  return null;
}

/**
 * WHICH event an event item belongs to, named as a calendar key.
 *
 * The event RULE above answers "a timed occasion gates this", which was enough
 * when the border only carried a category. The actionable border asks a harder
 * question, "is that occasion running right now", and the calendar can only
 * answer it for an event it can name. So the same obtain region is read again
 * for the specific vocabulary of each fixed-window event, most specific first
 * ("Season of Jerry" contains "Jerry", so it must be tested before the
 * workshop pattern that looks for him).
 *
 * `unknown` is the deliberate floor, twice over. An article that says "during
 * the Great Spook" or "while Mining Fiesta is active" names an event Hypixel
 * schedules by announcement rather than by the calendar, and an article whose
 * event we simply cannot name is in the same honest position: in both cases
 * nobody can compute "live right now" from the clock, so the key is `unknown`
 * and `isEventLive` refuses with "unknown", which never lights a border.
 */
const EVENT_KEY_RULES: readonly { key: EventKey; pattern: RegExp }[] = [
  { key: "spookyFestival", pattern: /\b(spooky\s*festival|fear\s*mongerer)\b/i },
  { key: "seasonOfJerry", pattern: /\bseason\s*of\s*jerry\b/i },
  { key: "jerryWorkshop", pattern: /\b(jerry'?s\s*workshop|winter\s*island)\b/i },
  { key: "newYear", pattern: /\bnew\s*year/i },
  { key: "travelingZoo", pattern: /\b(travell?ing\s*zoo|oringo)\b/i },
  // Decidable since the calendar learned Bingo's real-world window (first
  // seven days of each month, per the Bingo article). Before that, a bingo
  // mention honestly fell through to `unknown`.
  { key: "bingo", pattern: /\bbingo\b/i },
];

export function eventKeyFromWikitext(wikitext: string): EventKey {
  const region = withoutDenials(obtainRegion(wikitext));
  for (const rule of EVENT_KEY_RULES) {
    if (rule.pattern.test(region)) return rule.key;
  }
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* The cache                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * name -> category, or null for "the wiki was asked and told us nothing".
 *
 * Caching the nulls is the point. Without it, every visit re-fetches several
 * hundred articles to relearn that they are unclassifiable, which is both slow
 * and rude to a wiki that is serving us for free. Same reasoning as the null
 * entries in `materialChain.ts`.
 */
export type SourceIndex = Record<string, SourceCategory | null>;

/** accessory name -> the merchant and zone names its article gave us. */
export type LocationSignals = Record<string, string[]>;

/**
 * accessory name -> which calendar event its article names.
 *
 * Only populated for articles the classifier read as `event`, because the key
 * is meaningless for anything else, and `unknown` inside it is a real answer
 * rather than a gap: the article is about an event we cannot put on the
 * calendar.
 */
export type EventIndex = Record<string, EventKey>;

/** Everything one pass over the accessory articles learns. */
export interface WikiFacts {
  sources: SourceIndex;
  upgrades: UpgradeEdge[];
  /**
   * Where each accessory is acquired, as raw `npc:`/`zone:` names.
   *
   * Read on the same pass and for the same reason the upgrade edges are: the
   * article is already in hand, so extracting this costs nothing, and doing it
   * anywhere else would mean a second pass over four hundred articles.
   */
  locations: LocationSignals;
  /** Which calendar event each event item belongs to. Same free pass. */
  events: EventIndex;
}

interface SourceCache {
  fetchedAt: number;
  sources: SourceIndex;
  upgrades?: UpgradeEdge[];
  locations?: LocationSignals;
  /** The resolved answer, so a return visit costs no requests at all. */
  locationGroups?: LocationIndex;
  events?: EventIndex;
}

export const readSourceCache = (): SourceCache | null => {
  try {
    for (const k of STALE_SOURCE_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(SOURCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SourceCache;
    return parsed?.sources && parsed.fetchedAt ? parsed : null;
  } catch {
    return null;
  }
};

export const writeSourceCache = (cache: SourceCache): void => {
  try {
    localStorage.setItem(SOURCE_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A few tens of kilobytes, and quotas vary. Losing it costs a refetch and
    // nothing else, so it is not worth telling anybody about.
  }
};

/* -------------------------------------------------------------------------- */
/* The fetch                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Read every fact one pass over the accessory articles can give us.
 *
 * Batched fifty at a time against the same MediaWiki endpoint `materialChain.ts`
 * uses, so a page of four hundred accessories costs eight requests rather than
 * four hundred. Returns only what was newly learned; the caller merges.
 *
 * A failed batch is skipped rather than thrown. One bad request must not cost
 * the visitor the other seven, and an accessory with no answer simply shows
 * "See wiki", which is the honest rendering of not knowing anyway.
 */
export async function fetchWikiFacts(names: readonly string[], signal?: AbortSignal): Promise<WikiFacts> {
  const sources: SourceIndex = {};
  const upgrades: UpgradeEdge[] = [];
  const locations: LocationSignals = {};
  const events: EventIndex = {};
  if (names.length === 0) return { sources, upgrades, locations, events };

  for (let i = 0; i < names.length; i += BATCH) {
    const slice = names.slice(i, i + BATCH);

    const url = `${API}?${new URLSearchParams({
      action: "query",
      titles: slice.join("|"),
      prop: "revisions",
      rvprop: "content",
      rvslots: "main",
      format: "json",
      formatversion: "2",
      origin: "*",
    })}`;

    try {
      const res = await fetch(url, { signal });
      if (!res.ok) continue;

      const json = (await res.json()) as {
        query?: { pages?: { title: string; revisions?: { slots?: { main?: { content?: string } } }[] }[] };
      };

      for (const page of json.query?.pages ?? []) {
        const text = page.revisions?.[0]?.slots?.main?.content;
        sources[page.title] = text ? classifyFromWikitext(text) : null;
        // Same response, second fact. The upgrade chain is stated in the
        // infobox of the very article we fetched to classify the source, so
        // reading it here is free and reading it anywhere else would cost a
        // second pass over 407 articles.
        if (text) upgrades.push(...parseUpgradeEdges(page.title, text));
        // Same response, third fact: the merchant and zone names that say what
        // part of the game this belongs to. See `locations.ts`.
        if (text) locations[page.title] = parseLocationSignals(text);
        // Same response, fourth fact: which calendar event an event item
        // belongs to, so the border can ask whether it is running right now.
        if (text && sources[page.title] === "event") {
          events[page.title] = eventKeyFromWikitext(text);
        }
      }
    } catch {
      if (signal?.aborted) return { sources, upgrades, locations, events };
      continue;
    }

    for (const name of slice) {
      if (!(name in sources)) sources[name] = null;
    }
  }

  return { sources, upgrades, locations, events };
}

/**
 * The final answer for one accessory.
 *
 * Craftable wins outright and without a wiki call, because a recipe in the
 * index is a fact rather than a keyword match. Only then does the wiki's
 * opinion matter, and if it has none the answer is `wiki`, which the page
 * renders as "See wiki" rather than as a seventh confident category.
 */
export function resolveSource(craftable: boolean, learned: SourceCategory | null | undefined): SourceCategory {
  if (craftable) return "craftable";
  return learned ?? "wiki";
}
