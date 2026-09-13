import { describe, expect, it } from "vitest";
import {
  buildSackIndex,
  EMPTY_SACK_INDEX,
  groupSacks,
  liveSackEntries,
  mergeArticleItems,
  parseSackArticle,
  parseSackArticleRows,
  parseSackTable,
  sackDisplayFamily,
  sackFamily,
  sackOf,
  UNSORTED_SACK,
  wikiSection,
  type SackDefinition,
} from "../sacks";
import type { IslandSnapshot, StoredIsland } from "../types";

/**
 * Sack membership, and the zero counts that used to bury it.
 *
 * The membership half is a parser over an article other people edit, so the
 * sample below reproduces the shapes that article really uses - a starred slot
 * template, a literal Large one, cell attributes, a multi-line source column,
 * and an items list that repeats an item another sack already claimed - rather
 * than a tidy table that would only prove the parser works on tidy tables.
 *
 * The zero half is the reported bug: hundreds of entries at zero, shown as
 * pages of items nobody owns. The rule that fixes it is a display filter, and
 * the tests that matter are the ones proving it is only that.
 */

const SAMPLE = `{{Update}}
Prose about sacks, containing a [[Decoy Link]] that is not in any table.

== Tiers ==
{| class="wikitable"
!Size
!Amount
|-
|Beginner
|640
|}

== Types ==
{| class="wikitable"
!Icon
!Name
! Items
!Source
|-
|{{Slot|*Agronomy Sack}}
|[[Agronomy Sack]]
| [[Brown Mushroom]], [[Cactus]], [[Cocoa Beans]], [[Wheat]]
|{{Crafting Table|*Small Agronomy Sack *Medium Agronomy Sack}}
|-
|{{Slot|*Combat Sack}}
|[[Combat Sack]]
|[[Blaze Rod]], [[Bone]], [[String]]
|{{Crafting Table|*Small Combat Sack}}
|-
|{{Slot|*Nether Sack}}
|[[Nether Sack]]
|[[Blaze Rod]], [[Nether Wart]]
|{{Crafting Table|*Small Nether Sack}}
|-
| class="table-section-separator" |{{Slot|Large Enchanted Agronomy Sack}}
|class="table-section-separator" |[[Large Enchanted Agronomy Sack]]
|class="table-section-separator" |[[Enchanted Brown Mushroom]], [[Enchanted Wheat]]
|class="table-section-separator" |{{Crafting Table|Large Enchanted Agronomy Sack}}
|-
|{{Slot|Dungeon Sack}}
|[[Dungeon Sack]]
|[[Superboom TNT]], [[Spirit Leap]]
| class="ct" |[[Bits Shop]]
----{{Bits|14,000}}
|-
|{{Slot|Large Mutations Sack}}
|[[Mutations Sack]]
|[[Choconut]], [[Godseed]]
| class="ct" |{{Crafting Table|*Small Mutations Sack}}
|}

== Bugs ==
Text after the table, with a stray row that must never be read:
|-
|[[Phantom Sack]]
|[[Phantom Item]]
`;

const DEFS = parseSackTable(SAMPLE);

/** A stand-in for the site's item index: display name plus the Hypixel id it maps to. */
const ITEMS = {
  brown_mushroom: { name: "Brown Mushroom", hypixelId: "BROWN_MUSHROOM" },
  blaze_rod: { name: "Blaze Rod", hypixelId: "BLAZE_ROD" },
  superboom: { name: "Superboom TNT", hypixelId: "SUPERBOOM_TNT" },
  choconut: { name: "Choconut", hypixelId: "CHOCONUT" },
  // Known to the site but named by no sack, so it must never acquire one.
  hyperion: { name: "Hyperion", hypixelId: "HYPERION" },
  // No Hypixel id at all: nothing to key on, so it can only ever be skipped.
  nameless: { name: "Wheat", hypixelId: null },
};

const INDEX = buildSackIndex(DEFS, ITEMS);

describe("wikiSection", () => {
  it("takes the named section and stops at the next heading", () => {
    const types = wikiSection(SAMPLE, "Types");
    expect(types).toContain("Agronomy Sack");
    expect(types).not.toContain("Phantom Sack");
    expect(types).not.toContain("Beginner");
  });

  it("returns nothing for a heading the article does not have", () => {
    expect(wikiSection(SAMPLE, "Nonexistent")).toBe("");
  });
});

describe("parseSackTable", () => {
  it("reads every sack row and no others", () => {
    expect(DEFS.map((d) => d.sack)).toEqual([
      "Agronomy Sack",
      "Combat Sack",
      "Nether Sack",
      "Large Enchanted Agronomy Sack",
      "Dungeon Sack",
      "Mutations Sack",
    ]);
  });

  it("takes items from the Items column and never from the Source column", () => {
    const dungeon = DEFS.find((d) => d.sack === "Dungeon Sack") as SackDefinition;
    expect(dungeon.items).toEqual(["Superboom TNT", "Spirit Leap"]);
    expect(dungeon.items).not.toContain("Bits Shop");
  });

  it("reads the icon file, expanding the article's tier marker to the Large variant", () => {
    const byName = new Map(DEFS.map((d) => [d.sack, d.icon]));
    expect(byName.get("Agronomy Sack")).toBe("Large Agronomy Sack");
    expect(byName.get("Dungeon Sack")).toBe("Dungeon Sack");
    expect(byName.get("Mutations Sack")).toBe("Large Mutations Sack");
  });

  it("survives an article with no table at all", () => {
    expect(parseSackTable("just prose")).toEqual([]);
    expect(parseSackTable("")).toEqual([]);
  });

  it("keeps current rows whose Items cell points to a Sack Items tier", () => {
    const current = parseSackTable(`== Types ==
{| class="wikitable"
!Icon
!Name
!Items
!Source
|-
|{{Slot|*Agronomy Sack}}
|[[Agronomy Sack]]
|{{Sack Items|Small Agronomy Sack}}
|{{Crafting Table|*Small Agronomy Sack}}
|}`);

    expect(current).toEqual([
      {
        sack: "Agronomy Sack",
        icon: "Large Agronomy Sack",
        items: [],
        itemsSource: "Small Agronomy Sack",
      },
    ]);
  });
});

/**
 * The per-sack articles, which are where most of the contents actually live.
 *
 * The Types table is a summary and lags: measured against a real 373-entry
 * export it left 27 items unplaced, most of them ordinary Fishing Sack junk
 * that the Fishing Sack article lists and the table does not. Reading the
 * articles took that to 9.
 */
const ARTICLE = `{{Update}}
{{Infobox/Sack

|sack_items_b           =* Clay Ball
* Ink Sac

|rarity_b               = c
|id_b                   = beginner_fishing_sack

|sack_items =
* Agarimoo Tongue
* Alligator Skin
* [[Broken Radar]]
* Ench Cooked Salmon
* Lotus
|id_s = small_fishing_sack

|rarity_s               = u
}}

The '''Fishing Sack''' is a [[Sacks|Sack]].
`;

const CURRENT_ARTICLE = `{{Sack Items Table|
{{Sack Items Row
|sack = Beginner Agronomy Sack
|capacity = 640
|items =
*Brown Mushroom
*Cactus
}}
{{Sack Items Row
|sack = Small Agronomy Sack
|sack2 = Medium Agronomy Sack
|sack3 = Large Agronomy Sack
|capacity = 2,240
|items =
*Wheat
*[[Cocoa Beans]]
*Ench Melon
}}
}}`;

describe("parseSackArticle", () => {
  const items = parseSackArticle(ARTICLE);

  it("reads the bullet list out of the infobox", () => {
    expect(items).toContain("Agarimoo Tongue");
    expect(items).toContain("Alligator Skin");
    expect(items).toContain("Lotus");
  });

  it("reads the beginner tier's list too", () => {
    expect(items).toContain("Clay Ball");
    expect(items).toContain("Ink Sac");
  });

  it("stops at the next parameter rather than swallowing the rest of the infobox", () => {
    expect(items).not.toContain("u");
    expect(items).not.toContain("small_fishing_sack");
    expect(items.some((i) => i.includes("Sack]]"))).toBe(false);
  });

  it("reduces a link to the article it points at", () => {
    expect(items).toContain("Broken Radar");
  });

  /**
   * Seven articles write the enchanted items with the wiki's own abbreviation.
   * Left unexpanded it silently dropped every enchanted fish and several
   * enchanted ores, which looked exactly like the game not having them.
   */
  it("expands the wiki's Ench shorthand to the real item name", () => {
    expect(items).toContain("Enchanted Cooked Salmon");
    expect(items).not.toContain("Ench Cooked Salmon");
  });

  it("has nothing to say about an article with no sack infobox", () => {
    expect(parseSackArticle("just prose")).toEqual([]);
  });

  it("reads the current row format without mixing different tiers", () => {
    const rows = parseSackArticleRows(CURRENT_ARTICLE);
    expect(rows["Beginner Agronomy Sack"]).toEqual(["Brown Mushroom", "Cactus"]);
    expect(rows["Small Agronomy Sack"]).toEqual(["Wheat", "Cocoa Beans", "Enchanted Melon"]);
    expect(rows["Medium Agronomy Sack"]).toEqual(rows["Small Agronomy Sack"]);
    expect(rows["Large Agronomy Sack"]).toEqual(rows["Small Agronomy Sack"]);
  });
});

describe("mergeArticleItems", () => {
  it("adds what the article knows and the table missed", () => {
    const merged = mergeArticleItems(DEFS, { "Agronomy Sack": ["Brown Mushroom", "Melon Slice"] });
    const agronomy = merged.find((d) => d.sack === "Agronomy Sack") as SackDefinition;
    expect(agronomy.items).toContain("Melon Slice");
  });

  it("does not duplicate what both already name", () => {
    const merged = mergeArticleItems(DEFS, { "Agronomy Sack": ["Brown Mushroom"] });
    const agronomy = merged.find((d) => d.sack === "Agronomy Sack") as SackDefinition;
    expect(agronomy.items.filter((i) => i === "Brown Mushroom")).toHaveLength(1);
  });

  it("keeps the table's order, roster and icons", () => {
    const merged = mergeArticleItems(DEFS, { "Agronomy Sack": ["Melon Slice"] });
    expect(merged.map((d) => d.sack)).toEqual(DEFS.map((d) => d.sack));
    expect(merged[0].icon).toBe(DEFS[0].icon);
  });

  it("leaves a sack alone when its article gave nothing", () => {
    const merged = mergeArticleItems(DEFS, {});
    expect(merged).toEqual(DEFS);
  });

  it("uses the exact tier named by a current Sack Items cell", () => {
    const [merged] = mergeArticleItems(
      [{ sack: "Agronomy Sack", icon: "Large Agronomy Sack", items: [], itemsSource: "Small Agronomy Sack" }],
      parseSackArticleRows(CURRENT_ARTICLE)
    );
    expect(merged.items).toEqual(["Wheat", "Cocoa Beans", "Enchanted Melon"]);
  });
});

describe("sackFamily", () => {
  it("folds an enchanted sack onto the sack it shadows", () => {
    expect(sackFamily("Large Enchanted Agronomy Sack")).toBe("Agronomy Sack");
    expect(sackFamily("Enchanted Mining Sack")).toBe("Mining Sack");
  });

  it("leaves every other sack name alone", () => {
    expect(sackFamily("Bronze Trophy Fishing Sack")).toBe("Bronze Trophy Fishing Sack");
    expect(sackFamily("Witch's Sack")).toBe("Witch's Sack");
  });

  it("removes capacity tiers from a content-family label without collapsing trophy tiers", () => {
    expect(sackDisplayFamily("Beginner Combat Sack")).toBe("Combat Sack");
    expect(sackDisplayFamily("Large Combat Sack")).toBe("Combat Sack");
    expect(sackDisplayFamily("Large Enchanted Agronomy Sack")).toBe("Agronomy Sack");
    expect(sackDisplayFamily("Bronze Trophy Fishing Sack")).toBe("Bronze Trophy Fishing Sack");
  });
});

describe("sackOf", () => {
  it("places an id the item index knows", () => {
    expect(sackOf("BROWN_MUSHROOM", INDEX)).toBe("Agronomy Sack");
    expect(sackOf("SUPERBOOM_TNT", INDEX)).toBe("Dungeon Sack");
  });

  it("places an id the item index has never heard of, by the name the id spells", () => {
    // Nothing in ITEMS carries this id; the article's own "Enchanted Brown
    // Mushroom" is reached by prettifying it.
    expect(sackOf("ENCHANTED_BROWN_MUSHROOM", INDEX)).toBe("Agronomy Sack");
  });

  it("places a 1.8 id through the legacy name table", () => {
    // INK_SACK:3 is Cocoa Beans, which the Agronomy row names. Title-casing the
    // id would ask about "Ink Sack 3" and find nothing.
    expect(sackOf("INK_SACK:3", INDEX)).toBe("Agronomy Sack");
  });

  it("gives an item claimed by two sacks to the first that claimed it", () => {
    // Blaze Rod is in Combat and again in Nether. One home, deterministically.
    expect(sackOf("BLAZE_ROD", INDEX)).toBe("Combat Sack");
  });

  it("returns null rather than a guess for an item no sack names", () => {
    expect(sackOf("HYPERION", INDEX)).toBeNull();
    expect(sackOf("SOME_ID_NOBODY_HAS", INDEX)).toBeNull();
  });

  it("returns null for everything while the article has not been read", () => {
    expect(EMPTY_SACK_INDEX.ready).toBe(false);
    expect(sackOf("BROWN_MUSHROOM", EMPTY_SACK_INDEX)).toBeNull();
  });

  it("uses exact source-backed destinations for current sack entries the tables omit", () => {
    const sourceBacked = buildSackIndex([
      { sack: "Mining Sack", icon: "Large Mining Sack", items: [] },
      { sack: "Agronomy Sack", icon: "Large Agronomy Sack", items: [] },
      { sack: "Mutations Sack", icon: "Large Mutations Sack", items: [] },
      { sack: "Slayer Sack", icon: "Large Slayer Sack", items: [] },
      { sack: "Bronze Trophy Fishing Sack", icon: "Bronze Trophy Fishing Sack", items: [] },
      { sack: "Silver Trophy Fishing Sack", icon: "Silver Trophy Fishing Sack", items: [] },
    ], {});

    expect({
      ENCHANTED_NETHERRACK: sackOf("ENCHANTED_NETHERRACK", sourceBacked),
      ENCHANTED_FLINT: sackOf("ENCHANTED_FLINT", sourceBacked),
      ENCHANTED_COAL_BLOCK: sackOf("ENCHANTED_COAL_BLOCK", sourceBacked),
      MUTANT_NETHER_STALK: sackOf("MUTANT_NETHER_STALK", sourceBacked),
      RUBY_VEILSHROOM: sackOf("RUBY_VEILSHROOM", sourceBacked),
      REVENANT_VISCERA: sackOf("REVENANT_VISCERA", sourceBacked),
      OBFUSCATED_FISH_1_BRONZE: sackOf("OBFUSCATED_FISH_1_BRONZE", sourceBacked),
      OBFUSCATED_FISH_1_SILVER: sackOf("OBFUSCATED_FISH_1_SILVER", sourceBacked),
    }).toEqual({
      ENCHANTED_NETHERRACK: "Mining Sack",
      ENCHANTED_FLINT: "Mining Sack",
      ENCHANTED_COAL_BLOCK: "Mining Sack",
      MUTANT_NETHER_STALK: "Agronomy Sack",
      RUBY_VEILSHROOM: "Mutations Sack",
      REVENANT_VISCERA: "Slayer Sack",
      OBFUSCATED_FISH_1_BRONZE: "Bronze Trophy Fishing Sack",
      OBFUSCATED_FISH_1_SILVER: "Silver Trophy Fishing Sack",
    });
  });

  it("does not create an override destination the parsed article does not contain", () => {
    expect(sackOf("ENCHANTED_FLINT", INDEX)).toBeNull();
  });

  /**
   * The Rune Sack is the one sack with no list: its article gives its contents
   * as the single word "Runes" and says in prose that it holds every rune. So
   * membership is a rule, and it is looked up by name rather than hardcoded, so
   * a wiki that drops the sack drops the rule with it.
   */
  it("sends a rune to the Rune Sack", () => {
    const withRunes = buildSackIndex([...DEFS, { sack: "Rune Sack", icon: "Rune Sack", items: ["Runes"] }], ITEMS);
    expect(sackOf("MUSIC_RUNE", withRunes)).toBe("Rune Sack");
    expect(sackOf("ICE_RUNE;3", withRunes)).toBe("Rune Sack");
  });

  it("does not invent a Rune Sack that the article never listed", () => {
    // DEFS has no Rune Sack row, so the rule has nowhere to send anything.
    expect(sackOf("MUSIC_RUNE", INDEX)).toBeNull();
  });

  it("does not mistake an ordinary item for a rune", () => {
    const withRunes = buildSackIndex([...DEFS, { sack: "Rune Sack", icon: "Rune Sack", items: ["Runes"] }], ITEMS);
    expect(sackOf("BROWN_MUSHROOM", withRunes)).toBe("Agronomy Sack");
    expect(sackOf("PRUNE_JUICE", withRunes)).toBeNull();
  });
});

/* ----------------------------------------------------- source-backed rows */

describe("liveSackEntries", () => {
  it("keeps zero counts because they are known-empty entries", () => {
    const entries = liveSackEntries({ BROWN_MUSHROOM: 25600, BLAZE_ROD: 0, CHOCONUT: 4 });
    expect(entries.map((e) => e.id)).toEqual(["BROWN_MUSHROOM", "BLAZE_ROD", "CHOCONUT"]);
    expect(entries.find((entry) => entry.id === "BLAZE_ROD")?.count).toBe(0);
  });

  it("drops a count that could not describe a possession", () => {
    const entries = liveSackEntries({
      GOOD: 1,
      NEGATIVE: -5,
      NOT_FINITE: Number.POSITIVE_INFINITY,
      NOT_A_NUMBER: Number.NaN,
    });
    expect(entries.map((e) => e.id)).toEqual(["GOOD"]);
  });

  it("names each entry the way a player reads it", () => {
    const [entry] = liveSackEntries({ ENCHANTED_BROWN_MUSHROOM: 12 });
    expect(entry.name).toBe("Enchanted Brown Mushroom");
  });

  it("has nothing to show for a section no source has", () => {
    expect(liveSackEntries(undefined)).toEqual([]);
    expect(liveSackEntries(null)).toEqual([]);
    expect(liveSackEntries({})).toEqual([]);
  });

  /**
   * The bug as it actually reaches a user: a snapshot already sitting in this
   * browser, taken before the mod learned to strip zeros. The mod owns history,
   * so that snapshot is not going to be rewritten and must simply display
   * correctly.
   */
  it("renders every valid entry from an old stored snapshot", () => {
    const old: StoredIsland = {
      receivedAt: 1_700_000_000_000,
      snapshot: {
        schema: 1,
        exportedAt: 1_700_000_000_000,
        player: { uuid: "u", name: "Wizard" },
        profile: { name: "Mango", gameMode: null },
        sacks: {
          ENCHANTED_BROWN_MUSHROOM: 25600,
          WHEAT: 0,
          SEEDS: 0,
          POTATO_ITEM: 0,
          BLAZE_ROD: 17,
          BONE: 0,
        },
        chests: [],
      },
    };

    const entries = liveSackEntries(old.snapshot.sacks);
    expect(entries.map((e) => e.id)).toEqual([
      "ENCHANTED_BROWN_MUSHROOM",
      "WHEAT",
      "SEEDS",
      "POTATO_ITEM",
      "BLAZE_ROD",
      "BONE",
    ]);
    expect(Object.keys(old.snapshot.sacks)).toHaveLength(6);
  });

  /**
   * The rule the whole programme has held to: the site owns display and never
   * history. A filter that proves too aggressive has to be fixable in a release
   * rather than by asking the player to re-export their island, which is only true if
   * the stored copy still has everything.
   */
  it("leaves the stored data exactly as it found it", () => {
    const sacks = { ENCHANTED_BROWN_MUSHROOM: 25600, WHEAT: 0, BLAZE_ROD: 17, BONE: 0 };
    const pristine = structuredClone(sacks);
    Object.freeze(sacks);

    const entries = liveSackEntries(sacks);

    expect(entries).toHaveLength(4);
    expect(sacks).toEqual(pristine);
    expect(Object.keys(sacks)).toEqual(Object.keys(pristine));
  });

  it("does not mutate the snapshot it was handed either", () => {
    const snapshot: IslandSnapshot = {
      schema: 1,
      exportedAt: 1,
      player: { uuid: "u", name: "Wizard" },
      profile: { name: "Mango", gameMode: null },
      sacks: { A: 3, B: 0 },
      chests: [],
    };
    const pristine = structuredClone(snapshot);

    liveSackEntries(snapshot.sacks);

    expect(snapshot).toEqual(pristine);
  });
});

/* ------------------------------------------------------------- grouping */

describe("groupSacks", () => {
  const entriesFor = (sacks: Record<string, number>) => liveSackEntries(sacks);

  it("files each item under the sack that owns it, in the article's order", () => {
    const groups = groupSacks(
      entriesFor({ CHOCONUT: 2, BROWN_MUSHROOM: 10, SUPERBOOM_TNT: 5, BLAZE_ROD: 7 }),
      INDEX
    );
    expect(groups.map((g) => g.sack)).toEqual(["Agronomy Sack", "Combat Sack", "Dungeon Sack", "Mutations Sack"]);
    expect(groups.every((g) => g.identified)).toBe(true);
  });

  it("carries the icon the article gave the sack", () => {
    const [agronomy] = groupSacks(entriesFor({ BROWN_MUSHROOM: 10 }), INDEX);
    expect(agronomy.icon).toBe("Large Agronomy Sack");
  });

  it("renders a family whose reported items are all empty", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 10, BLAZE_ROD: 0 }), INDEX);
    expect(groups.map((g) => g.sack)).toEqual(["Agronomy Sack", "Combat Sack"]);
    expect(groups[1].total).toBe(0);
  });

  it("folds the enchanted forms in with their base sack", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 10, ENCHANTED_BROWN_MUSHROOM: 3 }), INDEX);
    expect(groups).toHaveLength(1);
    expect(groups[0].sack).toBe("Agronomy Sack");
    expect(groups[0].rows.map((r) => r.id)).toEqual(["BROWN_MUSHROOM", "ENCHANTED_BROWN_MUSHROOM"]);
  });

  it("sorts each sack biggest first", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 3, ENCHANTED_BROWN_MUSHROOM: 900, CACTUS: 40 }), INDEX);
    expect(groups[0].rows.map((r) => r.count)).toEqual([900, 40, 3]);
    expect(groups[0].total).toBe(943);
  });

  /**
   * The named edge case: an item whose sack cannot be determined is neither
   * dropped nor guessed into the wrong one.
   */
  it("puts an item of unknown sack in a labelled catch-all, last", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 10, HYPERION: 1, SOME_NEW_ITEM: 4 }), INDEX);

    expect(groups.map((g) => g.sack)).toEqual(["Agronomy Sack", UNSORTED_SACK]);

    const catchAll = groups[1];
    expect(catchAll.identified).toBe(false);
    expect(catchAll.icon).toBeNull();
    expect(catchAll.rows.map((r) => r.id).sort()).toEqual(["HYPERION", "SOME_NEW_ITEM"]);
  });

  it("loses nothing: every entry in is an entry out", () => {
    const entries = entriesFor({ BROWN_MUSHROOM: 10, HYPERION: 1, BLAZE_ROD: 2, MYSTERY: 3, CHOCONUT: 4 });
    const groups = groupSacks(entries, INDEX);
    const out = groups.flatMap((g) => g.rows.map((r) => r.id));
    expect(out.slice().sort()).toEqual(entries.map((e) => e.id).sort());
  });

  it("has no catch-all when the article placed everything", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 10, BLAZE_ROD: 2 }), INDEX);
    expect(groups.some((g) => !g.identified)).toBe(false);
  });

  /**
   * Absent is not empty, applied to the membership table itself. Until the
   * article has been read nothing can be placed, and the honest rendering of
   * that is one catch-all rather than a board of sacks we have not earned.
   */
  it("sends everything to the catch-all while the article is unread", () => {
    const groups = groupSacks(entriesFor({ BROWN_MUSHROOM: 10, BLAZE_ROD: 2 }), EMPTY_SACK_INDEX);
    expect(groups).toHaveLength(1);
    expect(groups[0].identified).toBe(false);
    expect(groups[0].rows).toHaveLength(2);
  });

  it("shows nothing at all when there is nothing to show", () => {
    expect(groupSacks([], INDEX)).toEqual([]);
  });
});
