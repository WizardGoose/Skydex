import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchEntry } from "../types";

/**
 * The search history.
 *
 * Three things are being pinned, and all three are things that would be quietly
 * wrong rather than loudly broken.
 *
 * One: the key. `skydex.searches.v1`, spelled out below, so a rename fails
 * here rather than in somebody's browser six months from now with their history
 * orphaned under the old name.
 *
 * Two: the cap and the dedupe. A history that grows without bound is a memory
 * leak in localStorage, and a history that lists the same thing four times has
 * spent four of its six rows saying one thing.
 *
 * Three: that clearing names exactly one key. This project has already lost
 * real work to one storage mistake, and a "clear" that enumerates is how that
 * happens. The stub below throws on `clear`, on `key` and on `length`, so any
 * code that reaches for them fails the test rather than somebody's data.
 */

/** The literal key. Not built, not derived from the site name, not migrated. */
const KEY = "skydex.searches.v1";

const store = new Map<string, string>();
const removed: string[] = [];

const stub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => {
    removed.push(k);
    store.delete(k);
  },
  clear: () => {
    throw new Error("clear() is not allowed from the search history");
  },
  key: () => {
    throw new Error("key enumeration is not allowed from the search history");
  },
  get length(): number {
    throw new Error("key enumeration is not allowed from the search history");
  },
};

(globalThis as unknown as { localStorage: unknown }).localStorage = stub;

/** A fresh copy of the module, so its module-level read sees the stub above. */
const fresh = () => {
  vi.resetModules();
  return import("../recentSearches");
};

const entry = (over: Partial<SearchEntry> & { key: string; name: string }): SearchEntry => ({
  destination: "items",
  href: `/items?q=${encodeURIComponent(over.name)}`,
  rarity: null,
  iconName: over.name,
  weight: 0,
  needle: over.name.toLowerCase(),
  aliases: "",
  ...over,
});

beforeEach(() => {
  store.clear();
  removed.length = 0;
});

describe("the key", () => {
  it("is the literal skydex key and nothing else", async () => {
    const { RECENT_KEY, RECENT_LIMIT, pushRecent } = await fresh();

    expect(RECENT_KEY).toBe(KEY);
    expect(RECENT_LIMIT).toBe(6);

    pushRecent(entry({ key: "items:HYPERION", name: "Hyperion" }));
    expect([...store.keys()]).toStrictEqual([KEY]);
  });

  it("writes a shape that reads back as the same rows", async () => {
    const one = await fresh();
    one.pushRecent(
      entry({
        key: "greenhouse:choconut",
        name: "Choconut",
        destination: "greenhouse",
        href: "/greenhouse#planner?target=choconut",
        rarity: "common",
        iconSrc: "/greenhouse/crops/choconut.png",
      })
    );

    // A reload is a fresh module reading the same bytes.
    const two = await fresh();
    const [row] = two.parseRecent(JSON.parse(store.get(KEY) as string) as unknown);

    expect(row.key).toBe("greenhouse:choconut");
    expect(row.name).toBe("Choconut");
    expect(row.destination).toBe("greenhouse");
    expect(row.href).toBe("/greenhouse#planner?target=choconut");
    expect(row.rarity).toBe("common");
    expect(row.iconSrc).toBe("/greenhouse/crops/choconut.png");
  });
});

describe("the cap of six", () => {
  it("keeps the six newest and drops the oldest", async () => {
    const { mergeRecent, toRecent, RECENT_LIMIT } = await fresh();

    let list = mergeRecent([], toRecent(entry({ key: "a", name: "A" })));
    for (const name of ["B", "C", "D", "E", "F", "G", "H"]) {
      list = mergeRecent(list, toRecent(entry({ key: name.toLowerCase(), name })));
    }

    expect(list).toHaveLength(RECENT_LIMIT);
    // Newest first, and the two oldest are gone rather than the two newest.
    expect(list.map((r) => r.name)).toStrictEqual(["H", "G", "F", "E", "D", "C"]);
  });

  it("caps what it writes as well as what it holds", async () => {
    const { pushRecent } = await fresh();

    for (const name of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      pushRecent(entry({ key: name.toLowerCase(), name }));
    }

    const written = JSON.parse(store.get(KEY) as string) as { name: string }[];
    expect(written).toHaveLength(6);
    expect(written[0].name).toBe("H");
  });

  it("refuses to read more than six back, whatever is in storage", async () => {
    const { parseRecent } = await fresh();

    const oversized = Array.from({ length: 20 }, (_, i) => ({
      key: `k${i}`,
      name: `N${i}`,
      href: "/items",
      destination: "items",
      rarity: null,
      iconName: `N${i}`,
    }));

    expect(parseRecent(oversized)).toHaveLength(6);
  });
});

describe("dedupe", () => {
  it("moves a repeat to the front instead of adding a second copy", async () => {
    const { pushRecent, mergeRecent, toRecent } = await fresh();

    pushRecent(entry({ key: "items:HYPERION", name: "Hyperion" }));
    pushRecent(entry({ key: "greenhouse:choconut", name: "Choconut", destination: "greenhouse" }));
    pushRecent(entry({ key: "items:HYPERION", name: "Hyperion" }));

    const written = JSON.parse(store.get(KEY) as string) as { key: string }[];
    expect(written.map((r) => r.key)).toStrictEqual(["items:HYPERION", "greenhouse:choconut"]);

    // Same rule in the pure helper, which is what the store is built on.
    const list = mergeRecent(
      [toRecent(entry({ key: "x", name: "X" })), toRecent(entry({ key: "y", name: "Y" }))],
      toRecent(entry({ key: "y", name: "Y" }))
    );
    expect(list.map((r) => r.key)).toStrictEqual(["y", "x"]);
  });

  it("dedupes on the way in from storage too", async () => {
    const { parseRecent } = await fresh();

    const rows = parseRecent([
      { key: "dupe", name: "First", href: "/items", destination: "items", rarity: null, iconName: "First" },
      { key: "dupe", name: "Second", href: "/items", destination: "items", rarity: null, iconName: "Second" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("First");
  });
});

describe("reading a hostile blob", () => {
  it("drops the bad rows and keeps the good ones", async () => {
    const { parseRecent } = await fresh();

    const rows = parseRecent([
      null,
      "not a row",
      { key: "", name: "No key", href: "/items", destination: "items" },
      { key: "no-name", href: "/items", destination: "items" },
      { key: "bad-dest", name: "Wrong", href: "/items", destination: "elsewhere" },
      { key: "ok", name: "Fine", href: "/items", destination: "items", iconName: "Fine" },
    ]);

    expect(rows.map((r) => r.key)).toStrictEqual(["ok"]);
  });

  it("returns nothing at all for something that is not a list", async () => {
    const { parseRecent } = await fresh();
    expect(parseRecent({ key: "a" })).toStrictEqual([]);
    expect(parseRecent(null)).toStrictEqual([]);
    expect(parseRecent("[]")).toStrictEqual([]);
  });

  it("neutralises a rarity this build does not know", async () => {
    const { parseRecent, toEntry } = await fresh();

    const [row] = parseRecent([
      { key: "k", name: "Thing", href: "/items", destination: "items", rarity: "ultra", iconName: "Thing" },
    ]);

    // Null, not "ultra". A class name that does not exist renders as inherited
    // colour with nothing anywhere to say why, which is the failure `rarity.ts`
    // is written to prevent.
    expect(row.rarity).toBeNull();
    expect(toEntry(row).rarity).toBeNull();
  });

  it("survives an unreadable value rather than throwing on load", async () => {
    store.set(KEY, "{not json");
    const { useRecentSearches } = await fresh();
    expect(typeof useRecentSearches).toBe("function");
    // The module loaded, which is the whole assertion: `read()` runs in the
    // module body and a throw there would take the search box down with it.
  });
});

describe("clearing", () => {
  it("names exactly one key and leaves everything else alone", async () => {
    store.set("wizardsky.planner.v2", JSON.stringify({ targets: [{ id: "rose_dragon_pet", kind: "item", qty: 1 }] }));
    store.set("wizardsky.apikey.v1", JSON.stringify({ key: "redacted" }));

    const { pushRecent, clearRecent } = await fresh();
    pushRecent(entry({ key: "items:HYPERION", name: "Hyperion" }));
    clearRecent();

    expect(removed).toStrictEqual([KEY]);
    expect(store.has(KEY)).toBe(false);
    expect(store.has("wizardsky.planner.v2")).toBe(true);
    expect(store.has("wizardsky.apikey.v1")).toBe(true);
  });
});

describe("row conversion", () => {
  it("carries everything a row draws and nothing the ranker needs", async () => {
    const { toRecent } = await fresh();

    const row = toRecent(
      entry({
        key: "site:/dashboard",
        name: "Grind dashboard",
        destination: "site",
        href: "/dashboard",
        glyph: "dashboard",
        hint: "Page",
        weight: 60,
        aliases: "dashboard home progress",
      })
    );

    expect(row.glyph).toBe("dashboard");
    expect(row.destination).toBe("site");
    // Search machinery is not storage.
    expect("weight" in row).toBe(false);
    expect("aliases" in row).toBe(false);
    expect("needle" in row).toBe(false);
    expect("hint" in row).toBe(false);
  });

  it("rebuilds a searchable entry, with the hint supplied by the list", async () => {
    const { toRecent, toEntry } = await fresh();

    const back = toEntry(toRecent(entry({ key: "greenhouse:choconut", name: "Choconut", destination: "greenhouse" })), "Your target");

    expect(back.hint).toBe("Your target");
    expect(back.needle).toBe("choconut");
    expect(back.destination).toBe("greenhouse");
  });
});
