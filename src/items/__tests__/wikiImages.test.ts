import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REFORGE_PREFIXES,
  __resetIconCacheForTests,
  __titleKey,
  derivedCandidates,
  fetchIconUrls,
  hyphenVariants,
  itemDisplayName,
  chooseIconSource,
  lookupTitles,
  lowerJoiningWords,
  nameLadder,
  readIcon,
  runeTitles,
  stripLeadingGlyphs,
  stripPetLevel,
  stripReforge,
  stripRuneLevel,
  stripTrailingStars,
  stripTrophyTier,
} from "../wikiImages";
import { wikiIconUrl } from "../wikiCrafting";

/**
 * Everything under test here is pure, or pure plus one `fetch` we stub. The
 * two behaviours worth guarding are the ones that would silently ruin a whole
 * page of icons if they regressed: cutting a reforge off something that was
 * never reforged, and asking the wiki about a name it has already told us it
 * does not have.
 */

const THUMB = "https://hypixelskyblock.minecraft.wiki/images/thumb";

describe("stripReforge", () => {
  it("cuts a real reforge prefix", () => {
    expect(stripReforge("Rapid Juju Shortbow")).toBe("Juju Shortbow");
    expect(stripReforge("Withered Hyperion")).toBe("Hyperion");
    expect(stripReforge("Heroic Aspect of the Dragons")).toBe("Aspect of the Dragons");
    expect(stripReforge("Necrotic Wither Goggles")).toBe("Wither Goggles");
  });

  it("is case insensitive about the prefix", () => {
    expect(stripReforge("rapid juju shortbow")).toBe("juju shortbow");
    expect(stripReforge("RAPID Juju Shortbow")).toBe("Juju Shortbow");
  });

  it("takes the longest matching prefix, so two-word reforges lose both words", () => {
    expect(stripReforge("Deep Fried Fishing Rod")).toBe("Fishing Rod");
    expect(stripReforge("Greater Spook Cloak")).toBe("Cloak");
    expect(stripReforge("Green Thumb Hoe")).toBe("Hoe");
  });

  it("leaves a name alone when the first word is not a reforge", () => {
    expect(stripReforge("Boots of Divan")).toBeNull();
    expect(stripReforge("Juju Shortbow")).toBeNull();
    expect(stripReforge("Enchanted Bread")).toBeNull();
  });

  it("never strips a name down to nothing", () => {
    // A bare reforge word, or a name that is only a reforge, has no base left.
    expect(stripReforge("Light")).toBeNull();
    expect(stripReforge("Perfect")).toBeNull();
    expect(stripReforge("Deep Fried")).toBeNull();
    expect(stripReforge("  Rapid  ")).toBeNull();
    expect(stripReforge("")).toBeNull();
  });

  it("does not mangle a legitimate item whose name starts with a reforge word", () => {
    // 115 real items begin with a word that is also a reforge. The uncut URL is
    // always tried first, so the cut answer below is never reached for any of
    // them; all six of these resolve at the derived URL on the live wiki.
    const legit = [
      "Strong Dragon Boots",
      "Superior Dragon Helmet",
      "Wise Dragon Leggings",
      "Light Blue Wool",
      "Suspicious Stew",
      "Royal Jelly",
    ];

    for (const name of legit) {
      expect(derivedCandidates(name)[0]).toBe(wikiIconUrl(name));
      expect(lookupTitles(name)[0]).toBe(name);
    }
  });

  it("carries the whole reforge list, apostrophes and hyphens intact", () => {
    expect(REFORGE_PREFIXES).toHaveLength(155);
    expect(REFORGE_PREFIXES).toContain("Rapid");
    expect(REFORGE_PREFIXES).toContain("Withered");
    expect(REFORGE_PREFIXES).toContain("Heroic");
    expect(REFORGE_PREFIXES).toContain("Jerry's");
    expect(REFORGE_PREFIXES).toContain("Blood-Soaked");
    expect(new Set(REFORGE_PREFIXES).size).toBe(REFORGE_PREFIXES.length);
  });
});

/**
 * The names below are the real ones, taken from a live island snapshot.
 * Only the display strings are reproduced here; no player, profile or
 * inventory data is copied into the repo.
 *
 * Measured over the 651 distinct names in that snapshot, the only non-ASCII
 * decoration the game actually emits is:
 *   U+272A x93 and U+2726 x2   trailing stars
 *   U+25C6 x6, U+269A x2, U+E010, U+E068 x4   leading glyphs
 *   U+2192 / U+2190 / U+00AB / U+00BB x16 each   page-nav arrows
 *   U+2122 x4   trademark sign, mid-name, which must survive
 */
describe("name cleaning, measured against the real island snapshot", () => {
  it("strips a run of trailing stars", () => {
    expect(stripTrailingStars("Rapid Juju Shortbow \u272a\u272a\u272a\u272a")).toBe("Rapid Juju Shortbow");
    expect(stripTrailingStars("Jaded Helmet of Divan \u2726")).toBe("Jaded Helmet of Divan");
    expect(stripTrailingStars("Soul Whip \u272a\u272a")).toBe("Soul Whip");
  });

  it("leaves a starless name alone", () => {
    expect(stripTrailingStars("Juju Shortbow")).toBe("Juju Shortbow");
    expect(stripTrailingStars("Hilt of True Ice")).toBe("Hilt of True Ice");
  });

  it("strips leading decoration, including private-use glyphs", () => {
    expect(stripLeadingGlyphs("\u25c6 Blood Rune I")).toBe("Blood Rune I");
    expect(stripLeadingGlyphs("\u269a Brilliant Adaptive Belt")).toBe("Brilliant Adaptive Belt");
    expect(stripLeadingGlyphs("\ue010 Flawless Ruby Gemstone")).toBe("Flawless Ruby Gemstone");
    expect(stripLeadingGlyphs("\ue068 Fabled Daedalus Blade")).toBe("Fabled Daedalus Blade");
    expect(stripLeadingGlyphs("\u00ab First Page")).toBe("First Page");
    expect(stripLeadingGlyphs("\u2190 Previous Page")).toBe("Previous Page");
  });

  it("keeps a leading quote, so a quoted name is not mangled", () => {
    // The strip has to stop at a quote or this name loses its opening one.
    const quoted = '"Fragranced" Brown Mushroom "Paste"';
    expect(stripLeadingGlyphs(quoted)).toBe(quoted);
    expect(nameLadder(quoted)).toEqual([quoted]);
    expect(stripLeadingGlyphs("\u2018Odd\u2019 Sack")).toBe("\u2018Odd\u2019 Sack");
  });

  it("keeps a leading bracket, which the pet rung still needs to read", () => {
    expect(stripLeadingGlyphs("[Lvl 1] Enderman")).toBe("[Lvl 1] Enderman");
  });

  it("keeps a mid-name symbol", () => {
    // InfiniVacuum carries a trademark sign that is part of the wiki title.
    expect(stripLeadingGlyphs("InfiniVacuum\u2122 Hooverius")).toBe("InfiniVacuum\u2122 Hooverius");
    expect(nameLadder("Beady InfiniVacuum\u2122 Hooverius")).toEqual([
      "Beady InfiniVacuum\u2122 Hooverius",
      "InfiniVacuum\u2122 Hooverius",
    ]);
  });

  it("strips a pet level tag", () => {
    expect(stripPetLevel("[Lvl 1] Enderman")).toBe("Enderman");
    expect(stripPetLevel("[Lvl 100] Golden Dragon")).toBe("Golden Dragon");
    expect(stripPetLevel("Enderman")).toBe("Enderman");
  });
});

describe("the candidate ladder", () => {
  it("composes stars, glyphs and reforge, which is how the real failures stack", () => {
    // Every rung here is required: this name has all three at once.
    expect(nameLadder("\u269a Fierce Shadow Assassin Helmet \u272a\u272a\u272a\u272a")).toEqual([
      "\u269a Fierce Shadow Assassin Helmet \u272a\u272a\u272a\u272a",
      "\u269a Fierce Shadow Assassin Helmet",
      "Fierce Shadow Assassin Helmet",
      "Shadow Assassin Helmet",
    ]);
  });

  it("composes stars and reforge", () => {
    expect(nameLadder("Calcified Silver Hunter Helmet \u272a\u272a")).toEqual([
      "Calcified Silver Hunter Helmet \u272a\u272a",
      "Calcified Silver Hunter Helmet",
      "Silver Hunter Helmet",
    ]);
  });

  it("composes a private-use glyph, stars and reforge", () => {
    expect(nameLadder("\ue068 Gilded Midas' Sword \u272a\u272a\u272a\u272a\u272a")).toEqual([
      "\ue068 Gilded Midas' Sword \u272a\u272a\u272a\u272a\u272a",
      "\ue068 Gilded Midas' Sword",
      "Gilded Midas' Sword",
      "Midas' Sword",
    ]);
  });

  it("tries the pet article before the bare creature name", () => {
    // Measured: all four pets in the snapshot have a "<Name> Pet" file, but
    // only three have a bare one, so the pet form has to come first.
    expect(nameLadder("[Lvl 1] Enderman")).toEqual(["[Lvl 1] Enderman", "Enderman Pet", "Enderman"]);
    expect(nameLadder("[Lvl 1] Ghoul")).toEqual(["[Lvl 1] Ghoul", "Ghoul Pet", "Ghoul"]);
  });

  it("always puts the raw name first, which is what keeps real items safe", () => {
    for (const name of ["Strong Dragon Boots", "Light Blue Wool", "Suspicious Stew", "Royal Jelly"]) {
      expect(nameLadder(name)[0]).toBe(name);
      expect(derivedCandidates(name)[0]).toBe(wikiIconUrl(name));
    }
  });

  it("adds no rungs to a name that needs no cleaning", () => {
    expect(nameLadder("Juju Shortbow")).toEqual(["Juju Shortbow"]);
    expect(nameLadder("Boots of Divan")).toEqual(["Boots of Divan"]);
    expect(nameLadder("hsiF ehT gorF")).toEqual(["hsiF ehT gorF"]);
    expect(derivedCandidates("Juju Shortbow")).toHaveLength(1);
  });

  it("never emits a duplicate or an empty rung", () => {
    const samples = [
      "\u25c6 Blood Rune I",
      "Jaded Helmet of Divan \u2726",
      "Rapid Juju Shortbow \u272a\u272a\u272a\u272a",
      "\u272a\u272a",
      "   ",
      "",
    ];
    for (const s of samples) {
      const ladder = nameLadder(s);
      expect(new Set(ladder).size).toBe(ladder.length);
      for (const rung of ladder) expect(rung.trim()).toBe(rung);
      expect(ladder.every(Boolean)).toBe(true);
    }
  });

  it("feeds the API the cleaned names too, not just the raw one", () => {
    // The cleaned form is the only one that resolves for these: both go
    // through a wiki redirect to a different file.
    expect(lookupTitles("Calcified Silver Hunter Helmet \u272a\u272a")).toContain("Silver Hunter Helmet");
    expect(lookupTitles("Fierce Shadow Assassin Leggings \u272a\u272a\u272a\u272a\u272a")).toContain(
      "Shadow Assassin Leggings"
    );
  });

  it("keeps the derived URLs and the API titles in lockstep", () => {
    for (const name of ["\u269a Fierce Shadow Assassin Helmet \u272a\u272a", "[Lvl 1] Squid", "Boots of Divan"]) {
      expect(derivedCandidates(name)).toEqual(lookupTitles(name).map((t) => wikiIconUrl(t)));
    }
  });
});

/**
 * Every decorated name in the snapshot's miss list, so the classification is
 * pinned rather than sampled. If the game adds a glyph we do not handle, the
 * last rung keeps its decoration and this fails.
 */
describe("the full decorated set from the island snapshot", () => {
  const DECORATED = [
    "Calcified Silver Hunter Helmet \u272a\u272a",
    "Fabled Reaper Falchion \u272a\u272a\u272a\u272a\u272a",
    "Fervor Boots \u272a\u272a",
    "Fierce Shadow Assassin Boots \u272a\u272a\u272a\u272a\u272a",
    "Fierce Shadow Assassin Leggings \u272a\u272a\u272a\u272a\u272a",
    "Heroic Midas Staff \u272a\u272a\u272a\u272a\u272a",
    "Jaded Helmet of Divan \u2726",
    "Loving Young Dragon Chestplate \u272a\u272a\u272a\u272a\u272a",
    "Moonglade Figstone Splitter \u272a\u272a\u272a\u272a\u272a",
    "Necrotic Necromancer Lord Boots \u272a\u272a\u272a\u272a\u272a",
    "Necrotic Storm's Leggings \u272a\u272a\u272a\u272a",
    "Necrotic Wither Goggles \u272a\u272a\u272a\u272a\u272a",
    "Necrotic Young Dragon Boots \u272a\u272a\u272a\u272a",
    "Necrotic Young Dragon Leggings \u272a\u272a\u272a\u272a",
    "Pitchin' Inferno Rod \u272a\u272a\u272a",
    "Plasmaflux Power Orb \u2726",
    "Rapid Juju Shortbow \u272a\u272a\u272a\u272a",
    "Rapid Spider Shortbow \u272a\u272a\u272a\u272a\u272a",
    "Soul Whip \u272a\u272a",
    "Titanic Super Heavy Chestplate \u272a\u272a\u272a\u272a",
    "\u25c6 Blood Rune I",
    "\u25c6 Crowned Rune III",
    "\u25c6 Lava Rune I",
    "\u25c6 Snow Rune I",
    "\u269a Brilliant Adaptive Belt \u272a\u272a\u272a\u272a\u272a",
    "\u269a Fierce Shadow Assassin Helmet \u272a\u272a\u272a\u272a",
    "\ue010 Flawless Ruby Gemstone",
    "\ue068 Fabled Daedalus Blade",
    "\ue068 Gilded Midas' Sword \u272a\u272a\u272a\u272a\u272a",
    "\ue068 Heroic Glacial Scythe",
    "\ue068 Heroic Spirit Sceptre \u272a\u272a\u272a\u272a\u272a",
    "[Lvl 1] Armadillo",
    "[Lvl 1] Enderman",
    "[Lvl 1] Ghoul",
    "[Lvl 1] Squid",
    "\u00ab First Page",
    "\u2190 Previous Page",
  ];

  /**
   * Anything outside letters, digits and the punctuation that really does
   * turn up inside an item name. The trademark sign is allowed because
   * "InfiniVacuum\u2122 Hooverius" is the wiki's own title.
   */
  const DECORATION = /[^\p{L}\p{N} '\-.,()"\u2122]|^\[\s*Lvl/u;

  it("recognises every one of them as decorated in the first place", () => {
    expect(DECORATED.filter((n) => DECORATION.test(n))).toHaveLength(DECORATED.length);
  });

  it("cleans the decoration off every one of them", () => {
    for (const name of DECORATED) {
      const ladder = nameLadder(name);
      expect(ladder[0], `${name} must still be tried raw first`).toBe(name);
      expect(ladder.length, `${name} produced no cleaned rung`).toBeGreaterThan(1);
      expect(DECORATION.test(ladder[ladder.length - 1]), `${name} kept decoration in its last rung`).toBe(
        false
      );
    }
  });

  /**
   * Inventory-GUI controls, not items. They are in the snapshot because the
   * island extractor captures the whole open screen, and no cleaning should
   * conjure an icon for them. Filtering them out belongs to the extractor, so
   * this pins that we leave them alone rather than guessing at a base name.
   */
  it("does not invent a base name for page-nav chrome", () => {
    expect(nameLadder("Next Page \u2192")).toEqual(["Next Page \u2192"]);
    expect(nameLadder("Last Page \u00bb")).toEqual(["Last Page \u00bb"]);
    // A leading arrow is decoration like any other, so these two do get
    // cleaned. Neither cleaned form has a wiki file, so both stay honest
    // misses rather than borrowing another item's picture.
    expect(nameLadder("\u00ab First Page")).toEqual(["\u00ab First Page", "First Page"]);
    expect(nameLadder("\u2190 Previous Page")).toEqual(["\u2190 Previous Page", "Previous Page"]);
  });
});

/**
 * The ordering rules `ItemIcon` renders from. Kept pure so they can be checked
 * without a DOM, which the node test environment does not have.
 */
describe("chooseIconSource", () => {
  const THUMB_JUJU = `${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`;
  const THUMB_RAPID = `${THUMB}/Rapid_Juju_Shortbow.png/64px-Rapid_Juju_Shortbow.png`;
  const HEAD = "https://mc-heads.net/head/abc123";
  const LOCAL = "/greenhouse/carrot.png";

  /** A per-title cache, the shape `readTitle` answers in. */
  const knownOf =
    (entries: Record<string, string | null>) =>
    (title: string): string | null | undefined =>
      entries[__titleKey(title)];

  it("shows the caller's own asset before anything from the wiki", () => {
    const { current } = chooseIconSource({ display: "Carrot", failed: [], src: LOCAL });
    expect(current).toBe(LOCAL);
  });

  it("walks the ladder as rungs fail", () => {
    const first = chooseIconSource({ display: "Rapid Juju Shortbow", failed: [] });
    expect(first.current).toBe(THUMB_RAPID);
    expect(first.exhausted).toBe(false);
    expect(first.needLookup).toBe(false);

    const second = chooseIconSource({ display: "Rapid Juju Shortbow", failed: [THUMB_RAPID] });
    expect(second.current).toBe(THUMB_JUJU);
    expect(second.exhausted).toBe(false);
    // One failed question already earns the batched ask. Waiting for all of
    // them to fail left the failed title unasked forever whenever a lower
    // guess painted, and it re-404ed every session (measured live).
    expect(second.needLookup).toBe(true);

    const spent = chooseIconSource({
      display: "Rapid Juju Shortbow",
      failed: [THUMB_RAPID, THUMB_JUJU],
    });
    expect(spent.current).toBeNull();
    expect(spent.exhausted).toBe(true);
    expect(spent.needLookup).toBe(true);
  });

  it("uses a cached answer on first paint, with no guess fired at all", () => {
    // THE 404 FIX, as a contract. The old shape re-tried the derived guess in
    // front of a cached answer on every visit, so the console refilled with
    // the same 404s each session. A cached rung now answers immediately.
    const api = `${THUMB}/Golden_Boots.png/64px-Golden_Boots.png`;
    const { current, needLookup } = chooseIconSource({
      display: "Boots of Divan",
      failed: [],
      known: knownOf({ [__titleKey("Boots of Divan")]: api }),
    });
    expect(current).toBe(api);
    expect(needLookup).toBe(false);
  });

  it("skips the guess for a title the wiki has proven missing", () => {
    // "Rapid Juju Shortbow" was asked about last week and the wiki said no.
    // Its derived URL can only 404, so the ladder starts at the next rung.
    const { current } = chooseIconSource({
      display: "Rapid Juju Shortbow",
      failed: [],
      known: knownOf({ [__titleKey("Rapid Juju Shortbow")]: null }),
    });
    expect(current).toBe(THUMB_JUJU);
  });

  it("still asks for a lookup while a cached rung paints, if fresher rungs above it died", () => {
    // The cut title resolved through the API once; the raw title has never
    // been asked and its guess just failed. The cached image shows now, and
    // the open question above it still deserves its one real ask.
    const api = `${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`;
    const { current, needLookup } = chooseIconSource({
      display: "Rapid Juju Shortbow",
      failed: [THUMB_RAPID],
      known: knownOf({ [__titleKey("Juju Shortbow")]: api }),
    });
    expect(current).toBe(api);
    expect(needLookup).toBe(true);
  });

  it("holds lateSrc back while a wiki lookup is still in flight", () => {
    // An unanswered title is a question, not an answer. Settling for a head
    // render now would beat a real result that is about to arrive.
    const { current } = chooseIconSource({
      display: "Boots of Divan",
      failed: [`${THUMB}/Boots_of_Divan.png/64px-Boots_of_Divan.png`],
      lateSrc: HEAD,
    });
    expect(current).toBeNull();
  });

  it("uses lateSrc once the wiki has said it has nothing, without guessing first", () => {
    const { current, exhausted, needLookup } = chooseIconSource({
      display: "Boots of Divan",
      failed: [],
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBe(HEAD);
    // Nothing was offered and nothing is left to ask: the proven misses cost
    // zero requests, which is the other half of the 404 fix.
    expect(exhausted).toBe(true);
    expect(needLookup).toBe(false);
  });

  it("uses lateSrc when even the cached answer failed to load", () => {
    const api = `${THUMB}/Golden_Boots.png/64px-Golden_Boots.png`;
    const { current } = chooseIconSource({
      display: "Boots of Divan",
      failed: [api],
      lateSrc: HEAD,
      known: knownOf({ [__titleKey("Boots of Divan")]: api }),
    });
    expect(current).toBe(HEAD);
  });

  it("never lets lateSrc pre-empt an untried wiki guess", () => {
    const { current } = chooseIconSource({
      display: "Juju Shortbow",
      failed: [],
      lateSrc: HEAD,
    });
    expect(current).toBe(THUMB_JUJU);
  });

  it("never lets lateSrc pre-empt the caller's own asset either", () => {
    const { current } = chooseIconSource({
      display: "Carrot",
      failed: [],
      src: LOCAL,
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBe(LOCAL);
  });

  it("falls through to the caller's fallback when lateSrc itself fails", () => {
    // mc-heads answers an unknown hash with 200 and a Steve head, so this only
    // happens on a real network failure. Initials beat a broken image.
    const { current } = chooseIconSource({
      display: "Boots of Divan",
      failed: [HEAD],
      lateSrc: HEAD,
      known: () => null,
    });
    expect(current).toBeNull();
  });

  it("still offers lateSrc when there is no usable name at all", () => {
    const { current } = chooseIconSource({ display: "", failed: [], lateSrc: HEAD });
    expect(current).toBe(HEAD);
  });

  it("reports nothing at all when there is no name and no late source", () => {
    const { current, exhausted, needLookup } = chooseIconSource({ display: "", failed: [] });
    expect(current).toBeNull();
    expect(exhausted).toBe(true);
    expect(needLookup).toBe(false);
  });
});

describe("itemDisplayName", () => {
  it("prettifies a Hypixel id", () => {
    expect(itemDisplayName("ENCHANTED_BREAD")).toBe("Enchanted Bread");
    expect(itemDisplayName(undefined, "ENCHANTED_BREAD")).toBe("Enchanted Bread");
    expect(itemDisplayName("", "HYPERION")).toBe("Hyperion");
  });

  it("prettifies a slug id, which is what pages fall back to", () => {
    expect(itemDisplayName("juju_shortbow")).toBe("Juju Shortbow");
    expect(itemDisplayName(undefined, "aspect_of_the_dragons")).toBe("Aspect Of The Dragons");
  });

  it("prefers a real display name and leaves it untouched", () => {
    expect(itemDisplayName("Boots of Divan", "BOOTS_OF_DIVAN")).toBe("Boots of Divan");
    expect(itemDisplayName("Aspect of the Dragons")).toBe("Aspect of the Dragons");
    expect(itemDisplayName("Jerry's Sword")).toBe("Jerry's Sword");
    expect(itemDisplayName("Blood-Soaked Coins")).toBe("Blood-Soaked Coins");
  });

  it("returns an empty string when it has nothing to work with", () => {
    expect(itemDisplayName()).toBe("");
    expect(itemDisplayName("   ", null)).toBe("");
  });
});

describe("derivedCandidates", () => {
  it("builds the wiki thumbnail path from the name", () => {
    expect(derivedCandidates("Juju Shortbow")).toEqual([
      `${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`,
    ]);
  });

  it("offers the uncut name first and the reforge-cut name second", () => {
    expect(derivedCandidates("Rapid Juju Shortbow")).toEqual([
      `${THUMB}/Rapid_Juju_Shortbow.png/64px-Rapid_Juju_Shortbow.png`,
      `${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`,
    ]);
  });

  it("gives one candidate when there is no reforge to cut", () => {
    expect(derivedCandidates("Boots of Divan")).toHaveLength(1);
  });

  it("honours a pixel size", () => {
    expect(derivedCandidates("Juju Shortbow", 32)[0]).toBe(`${THUMB}/Juju_Shortbow.png/32px-Juju_Shortbow.png`);
  });

  it("survives names with punctuation", () => {
    // encodeURIComponent leaves an apostrophe alone, and the wiki accepts it.
    expect(derivedCandidates("Jerry's Sword")[0]).toBe(`${THUMB}/Jerry's_Sword.png/64px-Jerry's_Sword.png`);
    expect(derivedCandidates("Blood-Soaked Coins")[0]).toBe(
      `${THUMB}/Blood-Soaked_Coins.png/64px-Blood-Soaked_Coins.png`,
    );
  });

  it("has nothing to offer for an empty name", () => {
    expect(derivedCandidates("")).toEqual([]);
  });
});

describe("lookupTitles", () => {
  it("asks about the uncut title first", () => {
    // "Perfect Boots - Tier I" has no derived image and no "Boots - Tier I"
    // either, but the full title redirects to Diamond_Boots.png on the wiki.
    expect(lookupTitles("Perfect Boots - Tier I")).toEqual(["Perfect Boots - Tier I", "Boots - Tier I"]);
    expect(lookupTitles("Boots of Divan")).toEqual(["Boots of Divan"]);
  });
});

describe("the icon cache", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    __resetIconCacheForTests();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("reports an unknown name as unknown, not as a miss", () => {
    expect(readIcon("Boots of Divan")).toBeUndefined();
  });

  it("remembers a resolved url", () => {
    __resetIconCacheForTests({ [__titleKey("Boots of Divan")]: `${THUMB}/Golden_Boots.png/64px-Golden_Boots.png` });
    expect(readIcon("Boots of Divan")).toBe(`${THUMB}/Golden_Boots.png/64px-Golden_Boots.png`);
  });

  it("remembers a miss so a known-bad name is never requested again", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          query: {
            pages: [
              { title: "File:Nonexistent Item.png", missing: true },
            ],
          },
        }),
        { status: 200 },
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const learned = await fetchIconUrls(["Nonexistent Item"]);
    expect(learned).toEqual({ "nonexistent item": null });

    __resetIconCacheForTests(learned);

    // Proven miss, so the answer is null (a decision) rather than undefined
    // (a question). `ItemIcon` only enqueues on undefined, so this name never
    // reaches the API a second time.
    expect(readIcon("Nonexistent Item")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records a miss for a title the API does not echo back at all", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 })) as unknown as typeof fetch;

    expect(await fetchIconUrls(["Ghost Item"])).toEqual({ "ghost item": null });
  });

  it("does not remember a network failure as a miss", async () => {
    globalThis.fetch = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;

    const learned = await fetchIconUrls(["Boots of Divan"]);
    expect(learned).toEqual({});

    __resetIconCacheForTests(learned);
    // Still a question, so the next mount asks again.
    expect(readIcon("Boots of Divan")).toBeUndefined();
  });

  it("keys the resolved url off the title the API echoed, underscores and all", async () => {
    const body = {
      query: {
        pages: [
          {
            title: "File:Boots of Divan.png",
            imageinfo: [{ thumburl: `${THUMB}/Golden_Boots.png/64px-Golden_Boots.png?01936` }],
          },
        ],
      },
    };
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

    __resetIconCacheForTests(await fetchIconUrls(["Boots_of_Divan"]));
    expect(readIcon("Boots of Divan")).toBe(`${THUMB}/Golden_Boots.png/64px-Golden_Boots.png?01936`);
  });

  it("counts a hit on the reforge-cut title as a hit for the whole item", () => {
    __resetIconCacheForTests({
      [__titleKey("Rapid Juju Shortbow")]: null,
      [__titleKey("Juju Shortbow")]: `${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`,
    });
    expect(readIcon("Rapid Juju Shortbow")).toBe(`${THUMB}/Juju_Shortbow.png/64px-Juju_Shortbow.png`);
  });

  it("only calls it a miss once every title has been ruled out", () => {
    __resetIconCacheForTests({ [__titleKey("Rapid Juju Shortbow")]: null });
    // The cut title has not been asked about yet.
    expect(readIcon("Rapid Juju Shortbow")).toBeUndefined();

    __resetIconCacheForTests({
      [__titleKey("Rapid Juju Shortbow")]: null,
      [__titleKey("Juju Shortbow")]: null,
    });
    expect(readIcon("Rapid Juju Shortbow")).toBeNull();
  });

  it("batches 25 logical titles so PNG and GIF requests stay under MediaWiki's 50-title cap", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const names = Array.from({ length: 120 }, (_, i) => `Item ${i}`);
    const learned = await fetchIconUrls(names);

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(Object.keys(learned)).toHaveLength(120);
  });

  it("asks for File: titles with underscores, as MediaWiki wants them", async () => {
    let requested = "";
    globalThis.fetch = (async (input: string) => {
      requested = String(input);
      return new Response(JSON.stringify({ query: { pages: [] } }), { status: 200 });
    }) as unknown as typeof fetch;

    await fetchIconUrls(["Boots of Divan"], 64);

    const url = requested;
    expect(decodeURIComponent(url)).toContain("titles=File:Boots_of_Divan.png");
    expect(url).toContain("iiurlwidth=64");
    expect(url).toContain("origin=*");
  });
});

/**
 * The classes added after the first coverage pass, each read off the live
 * island export rather than imagined. The rule for all of them is the one
 * `stripReforge` established: the uncut name is tried first, so a cut is only
 * ever reached once the browser has really failed above it, and a cut that
 * cannot be made confidently is not made at all.
 */
describe("stripTrophyTier", () => {
  it("cuts the grade off a trophy fish id", () => {
    expect(stripTrophyTier("Moldfin Silver")).toBe("Moldfin");
    expect(stripTrophyTier("Blessed Frog Bronze")).toBe("Blessed Frog");
    expect(stripTrophyTier("Steaming Hot Flounder Diamond")).toBe("Steaming Hot Flounder");
  });

  it("reads the grade however the surface wrote it", () => {
    // The id path title-cases it; the name path leaves it upper case.
    expect(stripTrophyTier("Exploding Frog GOLD")).toBe("Exploding Frog");
    expect(stripTrophyTier("Obfuscated-1 DIAMOND")).toBe("Obfuscated-1");
  });

  it("leaves a name whose last word is not a grade alone", () => {
    expect(stripTrophyTier("Juju Shortbow")).toBeNull();
    expect(stripTrophyTier("Golden Fish")).toBeNull();
  });

  it("never strips a name down to nothing", () => {
    expect(stripTrophyTier("Gold")).toBeNull();
    expect(stripTrophyTier("  Silver  ")).toBeNull();
  });

  it("does not get to answer for the items that merely look graded", () => {
    // "Enchanted Gold" is an ingot and "Lotus Silver" is the Silver Lotus. The
    // cut itself is blind, so what protects them is the ladder: the raw name
    // comes first, and Hypixel's own name comes before any cut.
    const gold = nameLadder("Enchanted Gold", "Enchanted Gold Ingot");
    expect(gold[0]).toBe("Enchanted Gold");
    expect(gold[1]).toBe("Enchanted Gold Ingot");

    const lotus = nameLadder("Lotus Silver", "Silver Lotus");
    expect(lotus.indexOf("Silver Lotus")).toBeLessThan(lotus.indexOf("Lotus"));
  });
});

describe("hyphenVariants", () => {
  it("offers one hyphen at a time, every position", () => {
    expect(hyphenVariants("Steaming Hot Flounder")).toEqual(["Steaming-Hot Flounder", "Steaming Hot-Flounder"]);
    expect(hyphenVariants("Blessed Frog")).toEqual(["Blessed-Frog"]);
  });

  it("has nothing to offer for a single word", () => {
    expect(hyphenVariants("Moldfin")).toEqual([]);
    expect(hyphenVariants("   ")).toEqual([]);
  });

  it("only reaches the ladder through a trophy grade, so ordinary items never pay for it", () => {
    // No grade, no variants. This is what keeps the rung off every other item.
    expect(nameLadder("Juju Shortbow")).toEqual(["Juju Shortbow"]);
    expect(nameLadder("Aspect of the Dragons")).toEqual(["Aspect of the Dragons"]);

    // STEAMING_HOT_FLOUNDER_BRONZE is filed as "Steaming-Hot Flounder", and an
    // id cannot say where the hyphen goes, so both positions are offered.
    expect(nameLadder("Steaming Hot Flounder Bronze")).toEqual([
      "Steaming Hot Flounder Bronze",
      "Steaming Hot Flounder",
      "Steaming-Hot Flounder",
      "Steaming Hot-Flounder",
    ]);
  });
});

describe("runeTitles", () => {
  it("swaps the type around the noun and drops the level", () => {
    // RUNE_ZAP_1 prettifies to "Rune Zap 1"; the wiki files it as "Zap Rune".
    expect(runeTitles("Rune Zap 1")).toEqual(["Zap 1 Rune", "Zap Rune"]);
    expect(runeTitles("Rune Ice 3")).toEqual(["Ice 3 Rune", "Ice Rune"]);
  });

  it("keeps a multi word rune type whole", () => {
    expect(runeTitles("Rune White Spiral 1")).toEqual(["White Spiral 1 Rune", "White Spiral Rune"]);
    expect(runeTitles("Rune Zombie Slayer 1")).toEqual(["Zombie Slayer 1 Rune", "Zombie Slayer Rune"]);
  });

  it("peels one number at a time when the type itself ends in one", () => {
    // RUNE_BLOOD_2_1 is real, and so is RUNE_BLOOD_2_2. Nothing in the string
    // says how many trailing numbers are level, so both depths are offered and
    // the wiki decides. "Blood Rune" is the file that exists.
    expect(runeTitles("Rune Blood 2 1")).toEqual(["Blood 2 1 Rune", "Blood 2 Rune", "Blood Rune"]);
  });

  it("ignores a name that is not a rune id", () => {
    expect(runeTitles("Runebook")).toEqual([]);
    expect(runeTitles("Rune")).toEqual([]);
    expect(runeTitles("Blood Rune I")).toEqual([]);
  });
});

describe("stripRuneLevel", () => {
  it("drops the tier numeral the mod puts on a rune name", () => {
    expect(stripRuneLevel("Snow Rune I")).toBe("Snow Rune");
    expect(stripRuneLevel("Blood Rune II")).toBe("Blood Rune");
    expect(stripRuneLevel("Crowned Rune 3")).toBe("Crowned Rune");
  });

  it("only fires when the word before the numeral is Rune", () => {
    // Both of these have their own wiki file and must not be cut.
    expect(stripRuneLevel("Acacia Minion I")).toBeNull();
    expect(stripRuneLevel("Perfect Boots - Tier I")).toBeNull();
    expect(stripRuneLevel("Rune II")).toBeNull();
  });
});

describe("lowerJoiningWords", () => {
  it("puts back the case prettify could not know about", () => {
    expect(lowerJoiningWords("Can Of Worms")).toBe("Can of Worms");
    expect(lowerJoiningWords("Horn Of Taurus")).toBe("Horn of Taurus");
  });

  it("never touches the first word, which MediaWiki capitalises anyway", () => {
    expect(lowerJoiningWords("The Art Of War")).toBe("The Art of War");
  });

  it("returns null when nothing needed changing, so no duplicate rung appears", () => {
    expect(lowerJoiningWords("Boots of Divan")).toBeNull();
    expect(lowerJoiningWords("Juju Shortbow")).toBeNull();
    expect(nameLadder("Boots of Divan")).toEqual(["Boots of Divan"]);
  });
});

describe("the ladder with Hypixel's own name for the id", () => {
  it("puts the authoritative name above every guess but below the raw one", () => {
    const ladder = nameLadder("Lotus Silver", "Silver Lotus");
    expect(ladder[0]).toBe("Lotus Silver");
    expect(ladder[1]).toBe("Silver Lotus");
    expect(ladder).toContain("Lotus");
    expect(ladder.indexOf("Silver Lotus")).toBeLessThan(ladder.indexOf("Lotus"));
  });

  it("reaches names no rule could have derived from the id", () => {
    expect(nameLadder("Architect First Draft", "Architect's First Draft")).toContain("Architect's First Draft");
    expect(nameLadder("Enchanted Endstone", "Enchanted End Stone")).toContain("Enchanted End Stone");
    expect(nameLadder("Diver Fragment", "Emperor's Skull")).toContain("Emperor's Skull");
  });

  it("adds nothing when there is no resource name", () => {
    expect(nameLadder("Juju Shortbow", null)).toEqual(["Juju Shortbow"]);
    expect(nameLadder("Juju Shortbow", "")).toEqual(["Juju Shortbow"]);
    expect(nameLadder("Juju Shortbow", "Juju Shortbow")).toEqual(["Juju Shortbow"]);
  });

  it("composes the shape rules over the resource name as well", () => {
    const ladder = nameLadder("Blessed Frog Bronze", "Blessed Frog Trophy");
    expect(ladder).toContain("Blessed Frog Trophy");
    expect(ladder).toContain("Blessed Frog");
  });

  it("keeps the derived URLs and the API titles in lockstep with it too", () => {
    expect(derivedCandidates("Lotus Silver", 64, "Silver Lotus")).toEqual(
      lookupTitles("Lotus Silver", "Silver Lotus").map((t) => wikiIconUrl(t))
    );
  });

  it("still emits no duplicate and no empty rung", () => {
    const samples: [string, string | null][] = [
      ["Rune Blood 2 1", null],
      ["◆ Snow Rune I", null],
      ["Moldfin Silver", null],
      ["Can Of Worms", "Can of Worms"],
      ["Lotus Silver", "Silver Lotus"],
      ["", "Silver Lotus"],
      ["Calcified Silver Hunter Helmet ✪✪", "Silver Hunter Helmet"],
    ];
    for (const [display, resource] of samples) {
      const ladder = nameLadder(display, resource);
      expect(new Set(ladder).size).toBe(ladder.length);
      for (const rung of ladder) expect(rung.trim()).toBe(rung);
      expect(ladder.every(Boolean)).toBe(true);
    }
  });
});

/**
 * The composition cases, spelled out end to end. Each of these needed more than
 * one normalisation at once, which is the whole reason the rules live in one
 * funnel instead of being tried in parallel.
 */
describe("composition across the whole funnel", () => {
  it("a decorated, levelled rune needs the glyph off and the numeral off", () => {
    expect(nameLadder("◆ Snow Rune I")).toEqual(["◆ Snow Rune I", "Snow Rune I", "Snow Rune"]);
  });

  it("a legacy rune id needs the level peeled and the noun moved", () => {
    // `stripRuneLevel` deliberately declines here, because the word before the
    // trailing numeral is "2" rather than "Rune". Peeling is `runeTitles`' job
    // on this shape, and it is the rung that lands.
    expect(nameLadder("Rune Blood 2 1")).toEqual(["Rune Blood 2 1", "Blood 2 1 Rune", "Blood 2 Rune", "Blood Rune"]);
  });

  it("a reforged trophy fish needs the reforge cut and the grade cut", () => {
    // "Blessed" is a real reforge as well as half of this fish's name, so both
    // readings are offered and the one with a file wins.
    const ladder = nameLadder("Blessed Frog Bronze");
    expect(ladder).toEqual(["Blessed Frog Bronze", "Frog Bronze", "Blessed Frog", "Blessed-Frog", "Frog"]);
    // The one that has a file is the one that wins, and it is above the rest.
    expect(ladder.indexOf("Blessed Frog")).toBeLessThan(ladder.indexOf("Blessed-Frog"));
  });

  it("a starred, reforged item still resolves exactly as it did before", () => {
    expect(nameLadder("Calcified Silver Hunter Helmet ✪✪")).toEqual([
      "Calcified Silver Hunter Helmet ✪✪",
      "Calcified Silver Hunter Helmet",
      "Silver Hunter Helmet",
    ]);
  });
});

describe("chooseIconSource with a head render", () => {
  const HEAD = "https://mc-heads.net/head/abc123/64";

  it("keeps the head behind every wiki rung", () => {
    const { current } = chooseIconSource({ display: "Juju Shortbow", failed: [], lateSrc: HEAD });
    expect(current).toBe(wikiIconUrl("Juju Shortbow"));
  });

  it("reaches the head once the wiki has answered no on every rung", () => {
    const { current } = chooseIconSource({ display: "Juju Shortbow", failed: [], lateSrc: HEAD, known: () => null });
    expect(current).toBe(HEAD);
  });

  it("waits for a lookup still in flight rather than settling for the head", () => {
    const failed = derivedCandidates("Juju Shortbow");
    const { current } = chooseIconSource({ display: "Juju Shortbow", failed, lateSrc: HEAD });
    expect(current).toBeNull();
  });

  it("puts the resource name's rungs in front of the head as well", () => {
    const failed = derivedCandidates("Lotus Silver");
    const { current } = chooseIconSource({
      display: "Lotus Silver",
      failed,
      lateSrc: HEAD,
      resourceName: "Silver Lotus",
    });
    expect(current).toBe(wikiIconUrl("Silver Lotus"));
  });
});

/**
 * The parenthetical last rung: a variant with no file of its own falls back
 * to its base item's picture, and only after everything specific has missed.
 * The visible failure was a column of grey "EN" initials where
 * enchanted books belong - the wiki draws every book variant with
 * File:Enchanted Book.png, and the ladder never tried it.
 */
describe("parenthetical variants fall back to the base name, last", () => {
  it("ends the book ladder on the plain book", () => {
    const rungs = nameLadder("Enchanted Book (Bobbin' Time III)");
    expect(rungs[0]).toBe("Enchanted Book (Bobbin' Time III)");
    expect(rungs[rungs.length - 1]).toBe("Enchanted Book");
  });

  it("covers the other variant families the same way", () => {
    expect(nameLadder("Beastmaster Crest (Legendary)")).toContain("Beastmaster Crest");
    expect(nameLadder("Blessed Bait (Alternative)")).toContain("Blessed Bait");
  });

  it("adds nothing for a name with no parenthetical", () => {
    expect(nameLadder("Enchanted Book")).toEqual(["Enchanted Book"]);
  });
});
