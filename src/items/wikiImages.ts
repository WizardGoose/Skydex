/**
 * Resolving an item image to a wiki URL.
 *
 * WHY THIS EXISTS
 * ---------------
 * `wikiCrafting.wikiIconUrl` derives an image URL straight from the display
 * name, which costs zero lookups and is right for most items. It is wrong in
 * two specific, common ways:
 *
 *   1. REFORGE PREFIXES. "Rapid Juju Shortbow" is a Juju Shortbow that has been
 *      reforged. The wiki has no `Rapid_Juju_Shortbow.png`; it has
 *      `Juju_Shortbow.png`. Same for "Withered Hyperion", "Heroic Aspect of the
 *      Dragons", and every other reforged weapon or armour piece.
 *
 *   2. SHARED TEXTURES. "Boots of Divan" reuses the Golden Boots texture, so
 *      `File:Boots of Divan.png` on the wiki is a redirect to
 *      `Golden_Boots.png`. The derived path cannot see through a redirect, so
 *      it 404s; only the API can tell us where the file really lives.
 *
 *   3. DECORATION. The game decorates the name it hands us. Upgraded dungeon
 *      gear gains a run of trailing U+272A stars, runes gain a leading U+25C6,
 *      some gear gains U+269A or a private-use glyph from the game's own font,
 *      and a pet arrives as "[Lvl 1] Enderman". None of that is in a wiki
 *      title, and it stacks with case 1.
 *
 * THE CHAIN
 * ---------
 * Each step is only paid for when the cheaper one above it has actually failed,
 * so a page of ordinary items still costs zero API requests:
 *
 *   1. the derived URL for each rung of `nameLadder`, most specific first
 *      (free; rung zero alone is right about 90% of the time)
 *   2. a batched `imageinfo` lookup over those same rungs, cached
 *      (one request per ~50 misses, and the only thing that sees a redirect)
 *   3. the caller's `lateSrc`, if it gave one
 *   4. the caller's own fallback (initials or a blank tile)
 *
 * The free rungs run before the API on purpose. A reforged or star-decorated
 * item is by far the most common miss, and cleaning the name resolves it
 * without touching the network beyond the image itself.
 *
 * Measured against a real island snapshot of 651 distinct names: 488 resolved
 * with only the reforge cut, 514 with the full ladder, and the 103 names that
 * a raw `File:<name>.png` probe called missing went from 46 to 78.
 *
 * Nothing is bundled. Every URL here points at the wiki, which serves its own
 * CC BY-NC-SA content directly to the visitor's browser. See `wikiCrafting.ts`
 * for why that matters.
 */

import { wikiIconUrl } from "./wikiCrafting";
import { legacyWikiTitle } from "./legacyIds";
import { prettify } from "../island/format";

const API = "https://hypixelskyblock.minecraft.wiki/api.php";

/**
 * The one key this module owns. Holds resolved thumbnail URLs and proven
 * misses, nothing the user typed. Never enumerated, never cleared.
 */
// v2: mob and NPC renders on the official wiki are frequently GIF files.
// A v1 null only proved that the PNG spelling was absent, so it cannot be
// reused after adding the GIF rung.
const CACHE_KEY = "wizardsky.icons.v2";

/** MediaWiki caps a titles query at 50; every logical title asks PNG + GIF. */
const BATCH = 25;

/** Long enough to collect a whole grid of misses into one request. */
const DEBOUNCE_MS = 120;

/**
 * Every reforge in the game, extracted from `data/wiki/modules/Module_Reforge_Data.lua`
 * in this repo (the wiki's own `Module:Reforge/Data`, which is the list the
 * wiki itself renders its reforge tables from). 155 entries, which is all of
 * them across armour, swords, ranged weapons, tools, fishing rods, equipment,
 * belts and accessories.
 *
 * These are game terms, not prose. Nothing here is wiki content in the sense
 * that images and article text are.
 */
export const REFORGE_PREFIXES: readonly string[] = [
  "Ambered", "Ancient", "Astute", "Auspicious", "Awkward", "Beady", "Bizarre", "Blazing",
  "Blended", "Blessed", "Blood-Soaked", "Bloodshot", "Bloody", "Blooming", "Bountiful",
  "Brilliant", "Bulky", "Bustling", "Buzzing", "Calcified", "Candied", "Chomp", "Clean",
  "Coldfused", "Colossal", "Cubic", "Deadly", "Deep Fried", "Demonic", "Dimensional", "Dirty",
  "Double-Bit", "Earthy", "Empowered", "Epic", "Erudite", "Excellent", "Fabled", "Fair",
  "Fanged", "Fast", "Festive", "Fierce", "Fine", "Fleet", "Forceful", "Fortified", "Fortunate",
  "Fruitful", "Gentle", "Geometric", "Giant", "Gilded", "Glacial", "Glistening", "Godly",
  "Grand", "Great", "Greater Spook", "Green Thumb", "Groovy", "Hasty", "Headstrong", "Heated",
  "Heavy", "Hefty", "Heroic", "Honored", "Hurtful", "Hyper", "Itchy", "Jaded", "Jerry's",
  "Keen", "Legendary", "Light", "Loving", "Lucky", "Lumberjack's", "Lunar", "Lush", "Lustrous",
  "Magnetic", "Mantid", "Menacing", "Mithraic", "Moil", "Moonglade", "Mossy", "Mythic", "Neat",
  "Necrotic", "Odd", "Ominous", "Overpriced", "Peasant's", "Perfect", "Pitchin'", "Pleasant",
  "Precise", "Pretty", "Prospector's", "Pure", "Rapid", "Refined", "Reinforced", "Renowned",
  "Rich", "Ridiculous", "Robust", "Rooted", "Royal", "Rugged", "Salty", "Scraped", "Shaded",
  "Sharp", "Shiny", "Silky", "Simple", "Smart", "Snowy", "Soft", "Spicy", "Spiked",
  "Spiritual", "Squeaky", "Stained", "Stellar", "Stiff", "Strange", "Strengthened", "Strong",
  "Sturdy", "Submerged", "Sunny", "Superior", "Suspicious", "Sweet", "Thorny", "Titanic",
  "Toil", "Trashy", "Treacherous", "Undead", "Unpleasant", "Unreal", "Unyielding", "Vivid",
  "Warped", "Waxed", "Wise", "Withered", "Zealous", "Zooming",
];

const REFORGE_SET = new Set(REFORGE_PREFIXES.map((r) => r.toLowerCase()));

/** "Deep Fried", "Greater Spook" and "Green Thumb" are the only two-word ones. */
const MAX_REFORGE_WORDS = 2;

/**
 * Cut a leading reforge off a name, or return null when there is none.
 *
 * NOT MANGLING REAL ITEMS
 * -----------------------
 * 115 of the 1,591 items in the crafting module legitimately start with a word
 * that is also a reforge: "Strong Dragon Boots", "Superior Dragon Helmet",
 * "Light Blue Wool", "Suspicious Stew", "Royal Jelly", "Perfect Boots - Tier I".
 * A blind strip would send every one of them to the wrong image.
 *
 * Two things keep them safe. The membership test means only a real reforge is
 * ever considered, and more importantly the caller tries the UNCUT name first
 * and only reaches the cut one after the browser has actually 404d. All six
 * names above resolve at step 1, so this function's answer is never used for
 * them. The cut is a fallback, never a replacement.
 *
 * Longest match wins, so "Deep Fried Fish" loses both words rather than one.
 * A name that is nothing but a reforge is left alone; there would be nothing
 * left to look up.
 */
export const stripReforge = (name: string): string | null => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;

  for (let take = Math.min(MAX_REFORGE_WORDS, words.length - 1); take >= 1; take--) {
    if (!REFORGE_SET.has(words.slice(0, take).join(" ").toLowerCase())) continue;
    const rest = words.slice(take).join(" ").trim();
    return rest || null;
  }

  return null;
};

/**
 * Does this string look like an id rather than something a player would read?
 *
 * Call sites pass whatever they have. `ItemsPage` falls back to a slug when an
 * item is not in the index (`items[u]?.name ?? u`), and the island surfaces
 * carry Hypixel ids like `ENCHANTED_BREAD`. Both are underscore joined with no
 * spaces, which no display name ever is.
 */
const looksLikeId = (s: string): boolean => /^[A-Za-z0-9-]+(?:[_:][A-Za-z0-9-]+)+$/.test(s);

/**
 * The name to resolve an image for, given whatever the caller had.
 *
 * Prefers the display name, prettifies it when it is really an id, and falls
 * back to the id when there is no name at all. `prettify` is the island's, so
 * ids read the same everywhere.
 */
export const itemDisplayName = (name?: string | null, id?: string | null): string => {
  const raw = (name ?? "").trim();
  if (raw) return looksLikeId(raw) ? prettify(raw) : raw;
  const fromId = (id ?? "").trim();
  return fromId ? prettify(fromId) : "";
};

/**
 * Star glyphs the game appends to an upgraded dungeon item.
 *
 * Exactly the two that occur in a real island snapshot: 93 of U+272A and 2 of
 * U+2726 across 652 distinct names. Deliberately not widened to every star-ish
 * codepoint, because the trailing strip is the one that could eat a real name.
 */
const STAR_GLYPHS = "\u272a\u2726";
const TRAILING_STARS = new RegExp(`[\\s${STAR_GLYPHS}]+$`);

/** "Rapid Juju Shortbow" with four U+272A stars appended -> "Rapid Juju Shortbow". */
export const stripTrailingStars = (name: string): string => name.replace(TRAILING_STARS, "");

/**
 * Drop decoration from the front of a name.
 *
 * The game prefixes rune items with U+25C6, some equipment with U+269A, and a
 * few things with private-use characters from its own font (U+E010, U+E068).
 * None of those are in the wiki's file title.
 *
 * Letters, digits and quotes are kept, so `"Fragranced" Brown Mushroom "Paste"`
 * keeps its opening quote and is not mangled. So is an opening square bracket,
 * because it opens the `[Lvl N]` tag that the next rung reads.
 */
export const stripLeadingGlyphs = (name: string): string =>
  name.replace(/^[^\p{L}\p{N}"'[\u2018\u201c]+/u, "");

/** "[Lvl 1] Enderman" -> "Enderman". */
export const stripPetLevel = (name: string): string => name.replace(/^\[\s*Lvl\s*\d+\s*\]\s*/i, "");

/**
 * The four grades a trophy fish is caught at.
 *
 * They ride on the id rather than in the name: the profile counts
 * `MOLDFIN_SILVER` and `BLESSED_FROG_BRONZE`, and there is one wiki article per
 * fish covering every grade. Some surfaces show the grade shouted in the name
 * instead ("Exploding Frog GOLD"), so the match is case insensitive.
 */
const TROPHY_TIERS = new Set(["bronze", "silver", "gold", "diamond"]);

/**
 * Cut a trailing grade off a name, or null when the last word is not one.
 *
 * NOT MANGLING REAL ITEMS
 * -----------------------
 * "Enchanted Gold" and "Enchanted Diamond" end in a grade word and are not
 * trophy fish, and "Lotus Silver" is a real id whose actual name is "Silver
 * Lotus", so a blind strip would send all three somewhere wrong. Two things
 * keep them safe, and they are the same two that protect `stripReforge`.
 *
 * The caller tries the uncut name first, so anything that resolves as-is never
 * reaches this. And this sits BELOW the resource name rung, which is Hypixel's
 * own answer for that exact id, so "Lotus Silver" has already become "Silver
 * Lotus" before a grade is ever considered. Measured over the live island
 * export: all three lotus grades resolve to their own article, and no name that
 * resolved before this rung existed resolves to a different image with it.
 */
export const stripTrophyTier = (name: string): string | null => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  if (!TROPHY_TIERS.has(words[words.length - 1].toLowerCase())) return null;
  return words.slice(0, -1).join(" ");
};

/**
 * The same name with one space turned into a hyphen, every way round.
 *
 * An id cannot say where a hyphen goes: `STEAMING_HOT_FLOUNDER` is filed as
 * "Steaming-Hot Flounder", and the underscore that became a space in the middle
 * should have become a hyphen. There is no rule that knows which one, so this
 * offers each position and lets the wiki decide, exactly as `runeTitles` does
 * with a rune level. "Steaming Hot-Flounder" names no file and costs one 404.
 *
 * Deliberately only ever ONE hyphen, and deliberately only called for a name
 * that already lost a trophy grade. Every position of every count would be
 * exponential, and a grade is the one signal that says this is a trophy fish,
 * where the hyphenated spellings actually live. An ordinary item never reaches
 * this and never pays for it.
 */
export const hyphenVariants = (name: string): string[] => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [];

  const out: string[] = [];
  for (let i = 1; i < words.length; i++) {
    const joined = [...words];
    joined.splice(i - 1, 2, `${words[i - 1]}-${words[i]}`);
    out.push(joined.join(" "));
  }
  return out;
};

/** A rune level, written either way the game writes it. */
const LEVEL = /^(?:\d+|[IVXLC]+)$/;

/**
 * Wiki articles worth trying for a legacy rune id, best first.
 *
 * A rune arrives as `RUNE_ZAP_1`, which `prettify` reads as "Rune Zap 1". The
 * wiki files it under "Zap Rune", so the type and the noun have to swap and the
 * level has to go. Multi word types work the same way: `RUNE_WHITE_SPIRAL_1` is
 * the White Spiral Rune and `RUNE_ZOMBIE_SLAYER_1` the Zombie Slayer Rune.
 *
 * WHY THIS RETURNS SEVERAL AND GUESSES NONE
 * -----------------------------------------
 * `RUNE_BLOOD_2_1` is real, and so is `RUNE_BLOOD_2_2`. Read against the 38
 * rune ids in a real profile, the trailing number is the level and "BLOOD_2" is
 * the type, but the type itself ends in a digit, so there is no way to tell
 * from the string alone how many trailing numbers are level. Rather than pick
 * one and be wrong, this peels them one at a time and offers an article at each
 * depth: "Blood 2 Rune" first, then "Blood Rune". The wiki decides. A depth
 * that names no file simply 404s and costs one request, and the level really is
 * absent from every rune article, so the last rung is the one that lands.
 *
 * Capped at three peels, which is one more than any real id needs.
 */
export const runeTitles = (name: string): string[] => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2 || words[0].toLowerCase() !== "rune") return [];

  let rest = words.slice(1);
  const titles: string[] = [];
  for (let peel = 0; peel < 3 && rest.length; peel++) {
    titles.push(`${rest.join(" ")} Rune`);
    if (!LEVEL.test(rest[rest.length - 1])) break;
    rest = rest.slice(0, -1);
  }
  return titles;
};

/**
 * "Snow Rune I" -> "Snow Rune", or null when this is not a levelled rune.
 *
 * The other half of the rune problem. When the mod supplies a name rather than
 * an id it reads "U+25C6 Snow Rune I", and the leading glyph is already handled
 * a rung above; what is left is the tier numeral, which no rune article carries.
 *
 * Deliberately narrow: the word before the numeral must be "Rune". Plenty of
 * real items end in a numeral that belongs to them, "Acacia Minion I" and
 * "Perfect Boots - Tier I" among them, and both have their own wiki file. A
 * general trailing-numeral cut would put those at risk for no gain.
 */
export const stripRuneLevel = (name: string): string | null => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;
  if (!LEVEL.test(words[words.length - 1])) return null;
  if (words[words.length - 2].toLowerCase() !== "rune") return null;
  return words.slice(0, -1).join(" ");
};

/**
 * Words a title keeps in lower case, which `prettify` cannot know.
 *
 * `CAN_OF_WORMS` becomes "Can Of Worms" and the wiki files it as "Can of
 * Worms". MediaWiki only ever capitalises the first letter of a title, so the
 * rest is case sensitive and the derived URL misses by exactly one letter.
 */
const MINOR_WORDS = new Set(["of", "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "from", "with", "by"]);

/**
 * Lower case the joining words of a title, or null when none needed it.
 *
 * WHY THIS IS WORTH A RUNG AT ALL
 * -------------------------------
 * The API lookup already resolves these, because the wiki carries a redirect
 * from the shouted form. But that lookup only runs after every derived URL has
 * really 404d in the browser, which is a visible blank tile followed by a batch
 * request. This rung turns those into an image that paints on the first try.
 *
 * The first word is never touched, since MediaWiki capitalises it regardless,
 * and a word already lower case is left alone so a name that was correct stays
 * byte for byte identical and is deduped away.
 */
export const lowerJoiningWords = (name: string): string | null => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return null;

  let changed = false;
  const out = words.map((word, i) => {
    if (i === 0 || !MINOR_WORDS.has(word.toLowerCase()) || word === word.toLowerCase()) return word;
    changed = true;
    return word.toLowerCase();
  });

  return changed ? out.join(" ") : null;
};

/**
 * Every name worth trying for this item, most specific first.
 *
 * WHY A LADDER
 * ------------
 * The failures stack rather than being alternatives. "Calcified Silver Hunter
 * Helmet" followed by two U+272A stars carries a reforge AND trailing stars.
 * "Fierce Shadow Assassin Helmet" arrives with a U+269A in front AND four
 * stars behind AND a reforge. Applying each transform to the raw name on its
 * own resolves neither, so the transforms compose: each rung is the rung above
 * it with one more thing removed.
 *
 * Rung zero is the name exactly as the game gave it, decoration and all, minus
 * only surrounding whitespace (which no wiki title can carry anyway). That is
 * what keeps a legitimate item safe: a name that resolves as-is never reaches
 * a cleaned rung, because nothing below is tried until the browser has really
 * 404d above it. Measured over 651 real names, no name that resolved before
 * the ladder existed resolves to a different image with it.
 *
 * A `[Lvl N]` prefix is the signal that this is a pet, so both the pet article
 * and the bare creature name are tried, in that order. Measured on the real
 * snapshot: all four pets have a `<Name> Pet` file, only three have a bare one.
 *
 * ONE FUNNEL, AND THE ORDER INSIDE IT
 * -----------------------------------
 * Everything that has ever needed a different name goes through here, and the
 * order is the whole safety argument:
 *
 *   1. the name as given, then with decoration removed, then with the reforge
 *      cut, which is what the game showed and is right most of the time
 *   2. `resourceName`, Hypixel's own name for this id. AUTHORITATIVE, so it
 *      outranks every guess below it. `LOTUS_SILVER` is "Silver Lotus", and
 *      without this rung the grade cut below would answer "Lotus", which is a
 *      real but different item. A wrong picture is worse than no picture,
 *      because the player will act on it
 *   3. the shape rules, each of which composes over every stem above: a trophy
 *      grade off the end, a rune type swapped around its noun, joining words
 *      put back in lower case. A reforged item can also be graded, so they run
 *      over the reforge-cut stem too
 *   4. the legacy gemstone article, last because "Fine" is both a gemstone
 *      quality and a real reforge and the reforge cut already covers that case
 *
 * Measured over the 1,027 distinct entries in a live island export: 832 of them
 * reached a wiki file before, 1,011 do now, and none of the 832 changed which
 * file it reaches.
 */
export const nameLadder = (display: string, resourceName?: string | null): string[] => {
  const rungs: string[] = [];
  const push = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (t && !rungs.includes(t)) rungs.push(t);
  };

  if (!display.trim()) return rungs;
  push(display);

  let cleaned = stripTrailingStars(display).trim();
  push(cleaned);

  cleaned = stripLeadingGlyphs(cleaned).trim();
  push(cleaned);

  const pet = stripPetLevel(cleaned).trim();
  if (pet && pet !== cleaned) {
    push(`${pet} Pet`);
    push(pet);
    cleaned = pet;
  }

  const base = stripReforge(cleaned);
  if (base) push(base);

  const resource = (resourceName ?? "").trim();
  if (resource) {
    push(resource);
    push(stripReforge(resource));
  }

  // Every stem the cuts above produced, so the shape rules compose with them
  // rather than only ever seeing the raw name.
  const stems = base ? [cleaned, base] : [cleaned];
  if (resource) stems.push(resource);

  for (const stem of stems) {
    for (const title of runeTitles(stem)) push(title);
    push(stripRuneLevel(stem));
    const graded = stripTrophyTier(stem);
    push(graded);
    push(lowerJoiningWords(stem));
    if (graded) {
      push(lowerJoiningWords(graded));
      // Only trophy fish spell themselves with a hyphen, and only a grade says
      // this is one, so this is the one place the variants are worth trying.
      for (const variant of hyphenVariants(graded)) push(variant);
    }
  }

  const article = legacyWikiTitle(cleaned);
  if (article) push(article);

  /*
   * LAST rung, deliberately: a parenthetical variant falls back to its base
   * name. "Enchanted Book (Bobbin' Time III)" has no wiki file of its own and
   * never will - the wiki draws every book with File:Enchanted Book.png - and
   * the same goes for the Beastmaster Crest tiers and recipe-variant entries
   * like "Blessed Bait (Alternative)". The visible failure was a column
   * of grey initials where books belong. Ordered last so an item whose
   * parenthetical form DOES have its own file always resolves to it first;
   * this rung only ever fires when everything specific has already missed,
   * and a variant's base-item picture is the right picture for it.
   */
  for (const stem of stems) {
    const m = stem.match(/^(.+?)\s*\([^)]*\)\s*$/);
    if (m) push(m[1]);
  }

  return rungs;
};

/**
 * Steps 1 and 2: the free candidates, best first.
 * Deduped, because a name that needs no cleaning yields the same URL twice.
 */
export const derivedCandidates = (display: string, px = 64, resourceName?: string | null): string[] => {
  if (!display) return [];
  const urls: string[] = [];
  for (const name of nameLadder(display, resourceName)) {
    const url = wikiIconUrl(name, px);
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
};

/**
 * Step 3: the titles worth asking the API about, best first.
 *
 * The same ladder, so the API gets a fair shot at every cleaned form rather
 * than only the raw one. That matters: `Silver Hunter Helmet` and
 * `Shadow Assassin Leggings` have no file of their own but both resolve
 * through a redirect, and neither is reachable from the raw name.
 *
 * The uncut name still comes first. "Perfect Boots - Tier I" has no derived
 * image and no `Boots - Tier I` either, but the API resolves the full title
 * through a redirect to `Diamond_Boots.png`.
 */
export const lookupTitles = (display: string, resourceName?: string | null): string[] =>
  display ? nameLadder(display, resourceName) : [];

/**
 * Cache key for a title. MediaWiki treats underscores as spaces, so we do too.
 *
 * Case is folded, which is very slightly coarser than MediaWiki (it only
 * uppercases the first letter). Two titles differing solely in the case of a
 * later letter would share an entry, which at worst serves one item the other
 * one's image. No such pair exists in the item set, and the alternative is
 * missing every cache hit where a caller capitalised differently.
 */
const titleKey = (title: string): string => title.trim().replace(/_/g, " ").replace(/\s+/g, " ").toLowerCase();

/** title key -> thumbnail URL, or null for a title the wiki proved it has no file for. */
type IconIndex = Record<string, string | null>;

let cache: IconIndex | null = null;

const readCache = (): IconIndex => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as IconIndex) : {};
  } catch {
    // No localStorage (tests, private mode) or corrupt JSON. An empty cache
    // only means we look things up again.
    return {};
  }
};

const writeCache = (index: IconIndex) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(index));
  } catch {
    // Optional cache. Quota or a blocked store is not worth surfacing.
  }
};

const ensureCache = (): IconIndex => (cache ??= readCache());

/**
 * Ask the wiki where these files actually live.
 *
 * `imageinfo` follows file redirects, which is the whole point: it is the only
 * way to learn that "Boots of Divan" is drawn with the Golden Boots texture.
 * Returns only what was learned; a title the API reports as missing comes back
 * as null so it is never asked about twice.
 */
export const fetchIconUrls = async (titles: string[], px = 64, signal?: AbortSignal): Promise<IconIndex> => {
  const learned: IconIndex = {};
  if (!titles.length) return learned;

  for (let i = 0; i < titles.length; i += BATCH) {
    const slice = titles.slice(i, i + BATCH);

    const fileTitles = slice.flatMap((title) => {
      const file = title.replace(/ /g, "_");
      return [`File:${file}.png`, `File:${file}.gif`];
    });
    const url = `${API}?${new URLSearchParams({
      action: "query",
      titles: fileTitles.join("|"),
      prop: "imageinfo",
      iiprop: "url",
      iiurlwidth: String(px),
      format: "json",
      formatversion: "2",
      origin: "*",
    })}`;

    // A network or server failure is NOT a proven miss. Skipping the slice
    // leaves those titles unknown, so a later mount retries them instead of
    // remembering an outage as "this item has no picture".
    const res = await fetch(url, { signal });
    if (!res.ok) continue;

    const json = (await res.json()) as {
      query?: { pages?: { title?: string; missing?: boolean; imageinfo?: { thumburl?: string; url?: string }[] }[] };
    };

    for (const page of json.query?.pages ?? []) {
      if (!page.title) continue;
      // Comes back as "File:Boots of Divan.png"; we key on the bare name.
      const bare = page.title.replace(/^File:/i, "").replace(/\.(?:png|gif)$/i, "");
      const info = page.imageinfo?.[0];
      const key = titleKey(bare);
      const resolved = info?.thumburl ?? info?.url;
      if (resolved) learned[key] = resolved;
      else if (!(key in learned)) learned[key] = null;
    }

    // Anything the API did not echo back at all is a miss too.
    for (const t of slice) {
      const k = titleKey(t);
      if (!(k in learned)) learned[k] = null;
    }
  }

  return learned;
};

/**
 * What we know about ONE title right now.
 *
 *   string    the API resolved it (possibly through a redirect), use it
 *   null      the wiki proved it has no file under this exact title
 *   undefined nobody has asked yet
 *
 * This is the per-rung read `chooseIconSource` decides from. It exists because
 * the blended per-item read below cannot say WHICH rung an answer belongs to,
 * and that blindness is what made every session re-walk the whole 404 ladder:
 * a cached answer was only consulted after every derived guess had failed in
 * the browser again, hundreds of 404s the console dutifully reported.
 * Knowing the answer per title
 * means a proven miss skips its guess and a cached hit is used on first paint.
 */
export const readTitle = (title: string): string | null | undefined => ensureCache()[titleKey(title)];

/**
 * What we know about this item's image right now, blended across its titles.
 *
 *   string    resolved, use it
 *   null      the wiki has no file under any of its titles
 *   undefined nobody has asked yet
 */
export const readIcon = (display: string, resourceName?: string | null): string | null | undefined => {
  const index = ensureCache();
  let unknown = false;

  for (const title of lookupTitles(display, resourceName)) {
    const value = index[titleKey(title)];
    if (typeof value === "string") return value;
    if (value === undefined) unknown = true;
  }

  return unknown ? undefined : null;
};

const queue = new Set<string>();
const inFlight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let version = 0;

const notify = () => {
  version++;
  for (const cb of listeners) cb();
};

const flush = async () => {
  timer = null;

  const index = ensureCache();
  const titles = [...queue].filter((t) => {
    const k = titleKey(t);
    return !(k in index) && !inFlight.has(k);
  });
  queue.clear();
  if (!titles.length) return;

  for (const t of titles) inFlight.add(titleKey(t));

  try {
    const learned = await fetchIconUrls(titles);
    if (Object.keys(learned).length) {
      Object.assign(index, learned);
      writeCache(index);
      notify();
    }
  } catch {
    // Offline or aborted. Leaving these titles uncached means the next mount
    // asks again, which is what we want for a transient failure.
  } finally {
    for (const t of titles) inFlight.delete(titleKey(t));
  }
};

/**
 * Queue an API lookup for an item whose free candidates have all failed.
 *
 * Callers fire this from an error handler, never on first paint, so a grid of
 * ordinary items never reaches the network beyond its images. Requests coalesce
 * across every icon on the page into batches of 50.
 */
export const requestIcon = (display: string, resourceName?: string | null): void => {
  if (!display) return;
  const index = ensureCache();

  let queued = false;
  for (const title of lookupTitles(display, resourceName)) {
    const k = titleKey(title);
    if (k in index || inFlight.has(k)) continue;
    queue.add(title);
    queued = true;
  }

  if (!queued || timer !== null) return;
  timer = setTimeout(() => void flush(), DEBOUNCE_MS);
};

/**
 * Resolved URLs we have handed out, mapped back to the title they answer for.
 *
 * Exists for exactly one reason: a cached URL can rot (the wiki renames a
 * file), and when its image errors the component only knows the URL. This map
 * is how `reportIconFailure` finds the cache entry to evict so the next render
 * asks the wiki afresh instead of trusting a dead answer forever.
 */
const resolvedUrlTitles = new Map<string, string>();

/**
 * A cached answer failed to load in the browser. Evict it so the title goes
 * back to being a question, which makes the very next render re-guess and
 * re-ask. Self-healing for renamed wiki files; a no-op for every URL that was
 * never a cached answer (derived guesses fail routinely and mean nothing).
 */
export const reportIconFailure = (url: string): void => {
  const key = resolvedUrlTitles.get(url);
  if (!key) return;
  const index = ensureCache();
  if (index[key] !== url) return;
  delete index[key];
  writeCache(index);
};

/**
 * Which image an icon should be showing right now.
 *
 * Pure decision logic over an injected cache read, so the ordering rules can
 * be tested without a DOM. `ItemIcon` owns the rendering; this owns the
 * decision.
 *
 * ORDER, AND WHY IT IS NOT NEGOTIABLE
 * -----------------------------------
 *   1. `src`, the caller's own better asset
 *   2. `packSrc`, the user's loaded texture pack (see the param note)
 *   3. the name ladder, most specific first, ONE decision per rung:
 *        cached URL   use it and stop, nothing below is more specific
 *        proven miss  skip the rung entirely, its guess can only 404
 *        never asked  try the free derived guess in the browser
 *   4. `lateSrc`, the caller's last resort, normally a player head render
 *
 * The per-rung read is the 404 fix. The old shape kept every derived guess in
 * front of a single blended API answer, so a browser that had proven all of
 * them dead last week proved it all over again on every visit, and the console
 * filled with the receipts. Now a proven miss never guesses again and a cached
 * hit paints first try; the only 404s left are genuinely new questions, paid
 * once per browser ever.
 *
 * The wiki sources still come before `lateSrc` because they are licensed,
 * cached and consistent, so a third-party render never pre-empts one.
 * `lateSrc` also waits while any rung is an open question with a lookup
 * pending: settling for a head render at that moment would beat a real result
 * that is about to arrive. A proven `null` on every rung is an answer, and
 * then the head is next without a single guess being fired.
 *
 * `lateSrc` IS TERMINAL
 * ---------------------
 * mc-heads.net answers an unknown hash with 200 and a default Steve head rather
 * than a 404, so `onError` never fires for it and a wrong looking head cannot be
 * detected by status or recovered from. There is deliberately no rung after it.
 * That is only the right trade because the hash is never guessed: it comes from
 * the item's own `skin.value` in Hypixel's resource, so it is the texture the
 * game itself draws. See `itemResource.ts`.
 */
export const chooseIconSource = ({
  display,
  failed,
  src,
  packSrc,
  resourceSrc,
  lateSrc,
  known,
  px,
  resourceName,
}: {
  display: string;
  failed: readonly string[];
  src?: string;
  /**
   * The loaded texture pack's answer for this item, when the user has one
   * (see items/texturePack.ts). Sits between `src` and the wiki ladder:
   * below `src` because a caller that supplied its own asset knows
   * something this module does not, above the ladder because the rule for
   * the feature is that a pack the user chose to load WINS over
   * the wiki icon (the pack is cached on the user's side only, so nothing
   * is redistributed). It is an object URL over the user's own
   * copy, so a failure (a revoked URL after removal) falls through the
   * ordinary `failed` machinery to the ladder, and with no pack loaded it
   * is undefined and this function is byte-identical to before.
   */
  packSrc?: string;
  /** Exact in-game texture from Hypixel's item resource. */
  resourceSrc?: string;
  lateSrc?: string;
  /**
   * Per-title cache read, normally `readTitle`: a URL, `null` for a proven
   * miss, `undefined` for a title nobody has asked about. Omitting it means
   * "nothing is known", which is exactly the first-visit behaviour.
   */
  known?: (title: string) => string | null | undefined;
  px?: number;
  /** Hypixel's own name for the item's id, when it has one the id cannot reach. */
  resourceName?: string | null;
}): { current: string | null; exhausted: boolean; needLookup: boolean } => {
  const order: string[] = [];
  const add = (u?: string) => {
    if (u && !order.includes(u)) order.push(u);
  };
  /** The derived guesses whose titles are still open questions. */
  const unknown: string[] = [];

  add(src);
  add(packSrc);
  add(resourceSrc);
  if (display) {
    for (const title of nameLadder(display, resourceName)) {
      const answer = known?.(title);
      if (typeof answer === "string") {
        // The API's word for this exact rung. Remembered against its title so
        // a dead URL can be evicted, then used; rungs below are less specific
        // by construction and have nothing better to offer.
        resolvedUrlTitles.set(answer, titleKey(title));
        add(answer);
        break;
      }
      if (answer === null) continue;
      const url = wikiIconUrl(title, px);
      add(url);
      if (!unknown.includes(url)) unknown.push(url);
    }
  }

  const exhausted = order.every((u) => failed.includes(u));
  /**
   * ANY open question that failed in the browser earns the batched API ask,
   * not just the case where all of them fail. The all-failed rule left a slow
   * leak, measured live: "Legendary Ring of Love" 404s its raw guess, then
   * the reforge-cut guess paints, so under all-failed the raw title never got
   * asked about, never got cached null, and re-404ed once per session
   * forever. One batched ask settles it permanently, and the ask also covers
   * the ladder's other open titles in the same request, so the next session
   * skips even the guesses that would have worked.
   */
  const needLookup = unknown.some((u) => failed.includes(u));
  const awaitingWiki = exhausted && unknown.length > 0;

  let current = order.find((u) => !failed.includes(u)) ?? null;
  if (!current && lateSrc && !awaitingWiki && !failed.includes(lateSrc)) current = lateSrc;

  return { current, exhausted, needLookup };
};

/** Re-render hook for React. Bumps whenever a batch lands. */
export const subscribeIcons = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export const iconVersion = (): number => version;

/** Test seam. Not used by the app; the cache is never cleared in the browser. */
export const __resetIconCacheForTests = (seed?: IconIndex) => {
  cache = seed ? { ...seed } : {};
  queue.clear();
  inFlight.clear();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

export { titleKey as __titleKey };
