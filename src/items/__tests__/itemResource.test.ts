import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  RESOURCE_CACHE_KEY,
  __setItemResourceForTests,
  adoptResourceItems,
  buildResourceIndex,
  resourceHashFor,
  resourceHeadSrcFor,
  resourceItemModelFor,
  resourceCategoryFor,
  resourceNameFor,
  subscribeItemResource,
} from "../itemResource";
import type { ResourceItem } from "../itemResource";

/**
 * The map that lets an icon reach a name the id does not spell, and a head
 * render for anything with a skull texture.
 *
 * Everything here is pure or pure plus one localStorage write. The behaviours
 * worth guarding are the ones that would quietly put the WRONG picture on a
 * tile: a name kept for the wrong id, or a texture hash invented out of a value
 * that did not contain one.
 */

/** A real `skin.value`, built the way Mojang builds them. */
const skinValue = (hash: string): string =>
  Buffer.from(JSON.stringify({ textures: { SKIN: { url: `http://textures.minecraft.net/texture/${hash}` } } })).toString(
    "base64"
  );

/** 64 hex characters, the length the real ones are. */
const HASH = "e4a1f0b6c3d29e8f7a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f";

/** A localStorage that behaves like one, since node's global has no methods. */
const fakeStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
};

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
  vi.stubGlobal("localStorage", storage);
  __setItemResourceForTests({});
});

describe("buildResourceIndex", () => {
  it("keeps a name the id cannot reach", () => {
    const index = buildResourceIndex([
      { id: "LOTUS_SILVER", name: "Silver Lotus" },
      { id: "ENCHANTED_ENDSTONE", name: "Enchanted End Stone" },
      { id: "BOB_OMB", name: "Bob-omb" },
      { id: "ARCHITECT_FIRST_DRAFT", name: "Architect's First Draft" },
    ]);

    expect(index.LOTUS_SILVER).toEqual({ n: "Silver Lotus" });
    expect(index.ENCHANTED_ENDSTONE).toEqual({ n: "Enchanted End Stone" });
    expect(index.BOB_OMB).toEqual({ n: "Bob-omb" });
    expect(index.ARCHITECT_FIRST_DRAFT).toEqual({ n: "Architect's First Draft" });
  });

  it("drops a name prettify already produces, because it would hold nothing", () => {
    const index = buildResourceIndex([
      { id: "ENCHANTED_BREAD", name: "Enchanted Bread" },
      { id: "JUJU_SHORTBOW", name: "Juju Shortbow" },
    ]);

    expect(index.ENCHANTED_BREAD).toBeUndefined();
    expect(index.JUJU_SHORTBOW).toBeUndefined();
  });

  it("strips the colour codes Hypixel leaves in a handful of names", () => {
    // 22 of the live names carry one. No wiki title contains either half of it.
    const index = buildResourceIndex([
      { id: "WARTS_STEW", name: "§cMushroom & Warts Stew" },
      { id: "QUEST_COOKIE", name: "Booster Cookie §8(Quest)" },
    ]);

    expect(index.WARTS_STEW?.n).toBe("Mushroom & Warts Stew");
    expect(index.QUEST_COOKIE?.n).toBe("Booster Cookie (Quest)");
  });

  it("pulls the texture hash out of a real skin value", () => {
    const index = buildResourceIndex([{ id: "SNOW_SNOWGLOBE", name: "Snow Globe", skin: { value: skinValue(HASH) } }]);
    expect(index.SNOW_SNOWGLOBE?.h).toBe(HASH);
  });

  it("keeps a hash even when the name needs no entry of its own", () => {
    const index = buildResourceIndex([{ id: "SNOW_GLOBE", name: "Snow Globe", skin: { value: skinValue(HASH) } }]);
    expect(index.SNOW_GLOBE).toEqual({ h: HASH });
  });

  it("keeps Hypixel's exact item model even when the name needs no entry", () => {
    const model = "hypixel_skyblock:item/island_relevant/foraging_3/accessories/lumberjack/lumberjack_talisman";
    const index = buildResourceIndex([
      { id: "LUMBERJACK_TALISMAN", name: "Lumberjack Talisman", item_model: model },
    ]);

    expect(index.LUMBERJACK_TALISMAN).toEqual({ m: model });
  });

  it("keeps Hypixel categories for item-heavy Profile organisation", () => {
    const index = buildResourceIndex([
      { id: "MUSEUM_SWORD", name: "Museum Sword", category: "SWORD" },
      { id: "ORDINARY_SWORD", name: "Ordinary Sword" },
    ]);

    expect(index.MUSEUM_SWORD).toEqual({ c: "SWORD" });
    expect(index.ORDINARY_SWORD).toBeUndefined();
    __setItemResourceForTests(index);
    expect(resourceCategoryFor("MUSEUM_SWORD")).toBe("SWORD");
    expect(resourceCategoryFor("ORDINARY_SWORD")).toBeNull();
  });

  it("invents no hash out of a value that does not carry one", () => {
    const index = buildResourceIndex([
      { id: "A", name: "Alpha Item", skin: { value: "not base64 at all !!!" } },
      { id: "B", name: "Bravo Item", skin: { value: Buffer.from("plain text").toString("base64") } },
      { id: "C", name: "Charlie Item", skin: { value: Buffer.from(JSON.stringify({ textures: {} })).toString("base64") } },
      { id: "D", name: "Delta Item", skin: { value: "" } },
      { id: "E", name: "Echo Item", skin: null },
    ]);

    for (const id of ["A", "B", "C", "D", "E"]) expect(index[id]?.h).toBeUndefined();
  });

  it("never serves UNOBTAINABLE as a tier; it is a flag, not a rarity", () => {
    // The admin relic ENCHANTED_CLOCK shares its display name with the real
    // LEGENDARY ENCHANTED_TIME_CLOCK; storing the flag as a tier let it
    // shadow the real rarity through the by-name index.
    const index = buildResourceIndex([
      { id: "ENCHANTED_CLOCK", name: "Enchanted Clock", tier: "UNOBTAINABLE" },
      { id: "ENCHANTED_TIME_CLOCK", name: "Enchanted Clock", tier: "LEGENDARY" },
    ]);
    expect(index.ENCHANTED_CLOCK).toBeUndefined();
    expect(index.ENCHANTED_TIME_CLOCK?.t).toBe("legendary");
  });

  it("skips an entry with nothing worth remembering, and one with no id", () => {
    const index = buildResourceIndex([
      { id: "ENCHANTED_BREAD", name: "Enchanted Bread" },
      { name: "No Id At All" } as ResourceItem,
      {} as ResourceItem,
    ]);
    expect(Object.keys(index)).toHaveLength(0);
  });
});

describe("reading the store", () => {
  it("answers null until something has been adopted", () => {
    expect(resourceNameFor("LOTUS_SILVER")).toBeNull();
    expect(resourceHashFor("LOTUS_SILVER")).toBeNull();
    expect(resourceHeadSrcFor("LOTUS_SILVER")).toBeUndefined();
    expect(resourceItemModelFor("LOTUS_SILVER")).toBeNull();
  });

  it("serves the exact Hypixel item model once adopted", () => {
    const model = "hypixel_skyblock:item/island_relevant/foraging_3/accessories/lumberjack/lumberjack_talisman";
    adoptResourceItems([{ id: "LUMBERJACK_TALISMAN", name: "Lumberjack Talisman", item_model: model }]);
    expect(resourceItemModelFor("lumberjack_talisman")).toBe(model);
  });

  it("answers with Hypixel's name once it has", () => {
    adoptResourceItems([{ id: "LOTUS_SILVER", name: "Silver Lotus" }]);
    expect(resourceNameFor("LOTUS_SILVER")).toBe("Silver Lotus");
  });

  it("takes a slug as well as an id, because the pages pass both", () => {
    // ItemsPage hands ItemIcon `enchanted_endstone`; the island hands it the id.
    adoptResourceItems([{ id: "ENCHANTED_ENDSTONE", name: "Enchanted End Stone" }]);
    expect(resourceNameFor("enchanted_endstone")).toBe("Enchanted End Stone");
    expect(resourceNameFor("ENCHANTED_ENDSTONE")).toBe("Enchanted End Stone");
  });

  it("answers null for an id it has never seen, rather than guessing", () => {
    adoptResourceItems([{ id: "LOTUS_SILVER", name: "Silver Lotus" }]);
    expect(resourceNameFor("SOMETHING_ELSE")).toBeNull();
    expect(resourceNameFor("")).toBeNull();
    expect(resourceNameFor(null)).toBeNull();
    expect(resourceNameFor(undefined)).toBeNull();
  });

  it("builds a head URL only from a hash that is really a hash", () => {
    adoptResourceItems([
      { id: "GOOD", name: "Good Head", skin: { value: skinValue(HASH) } },
      { id: "PLAIN", name: "Plain Item" },
    ]);
    expect(resourceHeadSrcFor("GOOD")).toBe(`https://mc-heads.net/head/${HASH}/64`);
    expect(resourceHeadSrcFor("PLAIN")).toBeUndefined();
  });

  it("confirms an id exists only when the resource actually carries it", async () => {
    const { resourceHasId } = await import("../itemResource");
    adoptResourceItems([{ id: "PET_AMMONITE", name: "Ammonite", tier: "COMMON" }]);
    // A real pet entry always survives the reduction: prettify("PET_AMMONITE")
    // is "Pet Ammonite", not "Ammonite", so the name is stored.
    expect(resourceHasId("PET_AMMONITE")).toBe(true);
    expect(resourceHasId("PET_BEJEWELED_COLLAR")).toBe(false);
    expect(resourceHasId("")).toBe(false);
    expect(resourceHasId(null)).toBe(false);
  });

  it("ignores an empty response rather than blanking a map it already has", () => {
    adoptResourceItems([{ id: "LOTUS_SILVER", name: "Silver Lotus" }]);
    adoptResourceItems([]);
    adoptResourceItems([{ id: "NOTHING_INTERESTING", name: "Nothing Interesting" }]);
    expect(resourceNameFor("LOTUS_SILVER")).toBe("Silver Lotus");
  });

  it("adopting is what publishes, so a subscriber hears about a real update", () => {
    let heard = 0;
    const stop = subscribeItemResource(() => heard++);
    adoptResourceItems([{ id: "LOTUS_SILVER", name: "Silver Lotus" }]);
    expect(heard).toBe(1);
    stop();
  });

  it("writes what it learned under its own key and touches nothing else", () => {
    storage.setItem("wizardsky.crafting.v3", "someone else's data");
    adoptResourceItems([{ id: "LOTUS_SILVER", name: "Silver Lotus" }]);

    const raw = storage.getItem(RESOURCE_CACHE_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string) as { entries: Record<string, { n?: string }> };
    expect(parsed.entries.LOTUS_SILVER).toEqual({ n: "Silver Lotus" });

    // The one key it owns, and no reaching into anybody else's.
    expect(storage.getItem("wizardsky.crafting.v3")).toBe("someone else's data");
    expect(storage.length).toBe(2);
  });
});

/**
 * Hydration happens on the first read, and `ItemIcon` reads during render, so
 * the first read of the whole app happens mid render.
 *
 * That makes one property load bearing: hydrating must NOT notify. Telling every
 * other subscriber to update while React is rendering is "cannot update a
 * component while rendering a different component", and with
 * `useSyncExternalStore` it also changes the snapshot underneath the render that
 * is in progress. The value still has to be there for the caller that triggered
 * it, because it is synchronous.
 *
 * A fresh module is imported so the store is genuinely unhydrated, which the
 * test seam cannot express: it sets `hydrated` on purpose.
 */
describe("hydrating from the cache during a render", () => {
  const freshModule = async () => {
    vi.resetModules();
    return import("../itemResource");
  };

  it("returns the cached value on the very first read and tells nobody", async () => {
    const store = fakeStorage();
    store.setItem(
      // The exported constant, not a literal: seeding a superseded key is
      // exactly what a key bump is supposed to invalidate, and this test is
      // about hydration, not about which key is current.
      RESOURCE_CACHE_KEY,
      JSON.stringify({ fetchedAt: Date.now(), entries: { LOTUS_SILVER: { n: "Silver Lotus" } } })
    );
    vi.stubGlobal("localStorage", store);

    const mod = await freshModule();
    let heard = 0;
    const stop = mod.subscribeItemResource(() => heard++);
    const versionBefore = mod.itemResourceVersion();

    // This is the render-time read.
    expect(mod.resourceNameFor("LOTUS_SILVER")).toBe("Silver Lotus");

    expect(heard).toBe(0);
    expect(mod.itemResourceVersion()).toBe(versionBefore);
    stop();
  });

  it("survives a cache that is missing, corrupt or the wrong shape", async () => {
    for (const seeded of [null, "not json at all", JSON.stringify({ nope: true }), JSON.stringify([1, 2, 3])]) {
      const store = fakeStorage();
      if (seeded !== null) store.setItem(RESOURCE_CACHE_KEY, seeded);
      vi.stubGlobal("localStorage", store);

      const mod = await freshModule();
      expect(mod.resourceNameFor("LOTUS_SILVER")).toBeNull();
      expect(mod.resourceHeadSrcFor("LOTUS_SILVER")).toBeUndefined();
    }
  });
});
