import { describe, it, expect } from "vitest";
import { buildSearchIndex, searchSite, MAX_ROWS } from "../searchIndex";
import { RARITY_TEXT, rarityClass, rarityKey } from "../rarity";
import { SECTION_ENTRIES } from "../sections";
import { normalise } from "../normalise";
import type { Destination, SearchEntry } from "../types";

/**
 * The search is a pure function of its inputs, so all of it is testable
 * without a DOM. Two things are being pinned here.
 *
 * One: the index is a MERGE. Five sources whose names overlap collapse into one
 * list with one row per name, and the row that survives is the one owned by the
 * most specific tool. That rule is the difference between a universal search
 * and three lists stapled together.
 *
 * Two: the destination mapping is the contract the badge prints. A row that
 * says Greenhouse and opens the Items page is a lie told on the one element
 * whose entire job is to say where Enter goes, so every shape of query is
 * checked against the destination it must resolve to.
 */

const SOURCES = {
  assetBase: "/",
  mutations: [
    { id: "choconut", name: "Choconut", rarity: "common" },
    { id: "shadevine", name: "Shadevine", rarity: "epic" },
    { id: "witherbloom", name: "Witherbloom", rarity: "legendary" },
  ],
  targets: [{ id: "rosedragonpet", name: "Rose Dragon Pet" }],
  shards: [
    { key: "C1", name: "Grove", rarity: "common" },
    { key: "L4", name: "Kada Knight", rarity: "Legendary" },
  ],
  items: [
    { id: "HYPERION", name: "Hyperion", tier: "LEGENDARY" },
    { id: "NECRON_HANDLE", name: "Necron's Handle", tier: "EPIC" },
    { id: "CHOCONUT", name: "Choconut", tier: "COMMON" },
    { id: "ENCHANTED_COCOA", name: "Enchanted Cocoa Bean", tier: "UNCOMMON" },
    { id: "CHOCOLATE_BAR", name: "Chocolate Bar", tier: "COMMON" },
    { id: "GROVE", name: "Grove", tier: "COMMON" },
  ],
};

const index = buildSearchIndex(SOURCES);

/** Every row except the wiki row, which is appended rather than ranked. */
const dataRows = (q: string): SearchEntry[] => searchSite(index, q).rows.filter((r) => r.destination !== "wiki");

const destinationOf = (q: string): Destination | undefined => dataRows(q)[0]?.destination;

// ---------------------------------------------------------------------------
// Index construction
// ---------------------------------------------------------------------------

describe("buildSearchIndex", () => {
  it("merges every source into one list", () => {
    // 11 pages + 3 mutations + 1 target + 2 shards + 6 items, less the two
    // names that appear in more than one source.
    const names = index.map((e) => e.name);
    expect(names).toContain("Choconut");
    expect(names).toContain("Hyperion");
    expect(names).toContain("Grove");
    expect(names).toContain("Rose Dragon Pet");
    expect(names).toContain("Greenhouse Planner");
  });

  it("carries all eleven site sections", () => {
    expect(SECTION_ENTRIES).toHaveLength(11);
    for (const s of SECTION_ENTRIES) expect(index.some((e) => e.key === s.key)).toBe(true);
  });

  it("holds one row per name, not one per source", () => {
    const needles = index.map((e) => e.needle);
    expect(new Set(needles).size).toBe(needles.length);
  });

  it("gives a duplicated name to the most specific tool that owns it", () => {
    // Choconut is both a greenhouse mutation and a crafting-index item.
    const choconut = index.filter((e) => e.needle === "choconut");
    expect(choconut).toHaveLength(1);
    expect(choconut[0].destination).toBe("greenhouse");

    // Grove is both a fusion shard and an item. The shard tools win.
    const grove = index.filter((e) => e.needle === "grove");
    expect(grove).toHaveLength(1);
    expect(grove[0].destination).toBe("shards");
  });

  it("never emits an entry with an empty needle", () => {
    expect(index.every((e) => e.needle.length > 0)).toBe(true);
  });

  it("survives every source being absent", () => {
    const bare = buildSearchIndex();
    expect(bare).toHaveLength(SECTION_ENTRIES.length);
    expect(searchSite(bare, "hyperion").rows).toHaveLength(1); // the wiki row
  });

  it("prefixes bundled art with the deploy base", () => {
    const built = buildSearchIndex({ ...SOURCES, assetBase: "/SkyShards/" });
    const mutation = built.find((e) => e.needle === "choconut");
    const shard = built.find((e) => e.needle === "grove");
    expect(mutation?.iconSrc).toBe("/SkyShards/greenhouse/crops/choconut.png");
    expect(shard?.iconSrc).toBe("/SkyShards/shardIcons/C1.png");
  });
});

// ---------------------------------------------------------------------------
// Destination mapping
// ---------------------------------------------------------------------------

describe("destination mapping", () => {
  it("sends a greenhouse mutation to the Greenhouse", () => {
    expect(destinationOf("choco")).toBe("greenhouse");
    expect(dataRows("choco")[0].name).toBe("Choconut");
  });

  it("sends a plain crafting item to Items", () => {
    expect(destinationOf("hyperion")).toBe("items");
    expect(destinationOf("necron")).toBe("items");
  });

  it("sends a fusion shard to Shards", () => {
    expect(destinationOf("kada")).toBe("shards");
  });

  it("sends a plannable target to the Greenhouse", () => {
    expect(destinationOf("rose dragon")).toBe("greenhouse");
  });

  it("sends a page query to the page's own family", () => {
    expect(dataRows("planner")[0]).toMatchObject({ destination: "greenhouse", href: "/greenhouse#planner" });
    expect(dataRows("fusion calc")[0]).toMatchObject({ destination: "shards", href: "/shards" });
    expect(dataRows("dashboard")[0]).toMatchObject({ destination: "site", href: "/dashboard" });
  });

  it("always offers the wiki, and always last", () => {
    const rows = searchSite(index, "hyperion").rows;
    expect(rows[rows.length - 1].destination).toBe("wiki");
    expect(rows[rows.length - 1].external).toBe(true);
    expect(rows[rows.length - 1].href).toBe("https://hypixelskyblock.minecraft.wiki/wiki/Hyperion");
  });

  it("points the wiki row at the top match rather than at the fragment typed", () => {
    const rows = searchSite(index, "choco").rows;
    expect(rows[rows.length - 1].href).toContain("/wiki/Choconut");
  });

  it("falls back to the typed words when nothing on the site matches", () => {
    const rows = searchSite(index, "juju shortbow").rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].destination).toBe("wiki");
    expect(rows[0].href).toBe("https://hypixelskyblock.minecraft.wiki/wiki/Juju_Shortbow");
  });

  it("produces more than one destination for a query that spans tools", () => {
    const kinds = new Set(searchSite(index, "o").rows.map((r) => r.destination));
    expect(kinds.size).toBeGreaterThan(2);
  });

  it("routes each destination to a URL that matches its badge", () => {
    for (const row of searchSite(index, "o").rows) {
      if (row.destination === "greenhouse") expect(row.href.startsWith("/greenhouse")).toBe(true);
      if (row.destination === "items") expect(row.href.startsWith("/items")).toBe(true);
      if (row.destination === "shards") expect(/^\/(fusion|recipes|shards|fusion-lines)/.test(row.href)).toBe(true);
      if (row.destination === "wiki") expect(row.href.startsWith("https://")).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Ranking and capping
// ---------------------------------------------------------------------------

describe("searchSite", () => {
  it("returns nothing at all for an empty query", () => {
    expect(searchSite(index, "").rows).toHaveLength(0);
    expect(searchSite(index, "   ").rows).toHaveLength(0);
  });

  it("ranks an exact name above a name that merely contains it", () => {
    expect(dataRows("grove")[0].name).toBe("Grove");
  });

  it("prefers the shorter name when both start with the query", () => {
    const names = dataRows("choco").map((r) => r.name);
    expect(names[0]).toBe("Choconut");
    expect(names).toContain("Chocolate Bar");
  });

  it("matches through punctuation and case", () => {
    expect(dataRows("necrons handle")[0].name).toBe("Necron's Handle");
    expect(dataRows("NECRON'S HANDLE")[0].name).toBe("Necron's Handle");
  });

  it("finds an item by its hypixel id as well as its name", () => {
    expect(dataRows("enchanted_cocoa")[0].name).toBe("Enchanted Cocoa Bean");
  });

  it("never returns more rows than the cap", () => {
    expect(searchSite(index, "o").rows.length).toBeLessThanOrEqual(MAX_ROWS);
  });

  it("counts the item matches it had to leave out", () => {
    const many = buildSearchIndex({
      assetBase: "/",
      items: Array.from({ length: 40 }, (_, i) => ({ id: `SWORD_${i}`, name: `Sword ${i}`, tier: "RARE" })),
    });
    const out = searchSite(many, "sword");
    expect(out.rows).toHaveLength(MAX_ROWS);
    expect(out.moreInItems).toBe(40 - (MAX_ROWS - 1));
    expect(out.moreHref).toBe("/recipes?q=sword");
  });

  it("offers no overflow when everything fitted", () => {
    expect(searchSite(index, "hyperion").moreInItems).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Rarity
// ---------------------------------------------------------------------------

describe("rarity", () => {
  it("normalises the three spellings the data sources use", () => {
    expect(rarityKey("LEGENDARY")).toBe("legendary");
    expect(rarityKey("legendary")).toBe("legendary");
    expect(rarityKey("Legendary")).toBe("legendary");
    expect(rarityKey("VERY_SPECIAL")).toBe("very-special");
    expect(rarityKey("very special")).toBe("very-special");
  });

  it("returns null rather than guessing a colour", () => {
    expect(rarityKey(null)).toBeNull();
    expect(rarityKey("")).toBeNull();
    expect(rarityKey("ULTRA")).toBeNull();
    expect(rarityClass(null)).toBe("text-slate-200");
  });

  it("has a complete literal class for all ten tiers", () => {
    const tiers = Object.keys(RARITY_TEXT);
    expect(tiers).toHaveLength(10);
    // A template literal would leave a fragment here and Tailwind would emit
    // no rule for it. Every value must be the whole class, spelled out.
    for (const [tier, cls] of Object.entries(RARITY_TEXT)) {
      expect(cls).toBe(`text-rarity-${tier}`);
      expect(cls.includes("$")).toBe(false);
    }
  });

  it("carries the tier through from every source onto the row", () => {
    expect(dataRows("hyperion")[0].rarity).toBe("legendary");
    expect(dataRows("shadevine")[0].rarity).toBe("epic");
    expect(dataRows("kada")[0].rarity).toBe("legendary");
  });
});

describe("normalise", () => {
  it("collapses everything that is not a letter or a digit", () => {
    expect(normalise("Cocoa Beans")).toBe("cocoa beans");
    expect(normalise("cocoa_beans")).toBe("cocoa beans");
    expect(normalise("  COCOA--BEANS ")).toBe("cocoa beans");
    expect(normalise("Necron's Handle")).toBe("necrons handle");
  });
});
