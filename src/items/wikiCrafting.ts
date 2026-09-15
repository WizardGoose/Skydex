/**
 * Crafting data, fetched from the wiki at runtime.
 * The current crafting_recipes table replaces the former Crafting/Data module.
 *
 * WHY THIS EXISTS
 * ---------------
 * Wiki content is CC BY-NC-SA 3.0. Bundling a derived `recipes.json` and 12 MB
 * of downloaded icons into the build would mean *we* redistribute wiki content,
 * which drags the share-alike clause onto this project and puts 2,000 of the
 * wiki's images in our repo.
 *
 * Fetching at runtime avoids the whole question. The wiki serves its own
 * content to the visitor's browser, exactly as if they had opened the wiki
 * themselves. We ship code, not content. Attribution still applies and is shown
 * in the footer.
 *
 * Two things make this cheap:
 *   - the public crafting API comes back with
 *     `Access-Control-Allow-Origin: *`
 *   - image URLs are derivable from the item name, so icons need no API lookup
 *     at all and are loaded straight from the wiki by the browser
 */

import type { Item, ItemIndex, CollectionUnlock, ItemRequirement, RecipeIngredient } from "./useItemData";
import { adoptResourceItems } from "./itemResource";
import { fetchSkyblockItems } from "./itemsResourceFetch";
import { fetchCraftingBucket } from "./wikiCraftingBucket";

const WIKI = "https://hypixelskyblock.minecraft.wiki";
// v2: v1 only indexed items that appear in a grid recipe, which dropped 25 of
// the 40 greenhouse mutations and with them their Hypixel ids, so nothing the
// player owns could be matched to them. Bumping the key re-parses rather than
// serving those incomplete snapshots for up to a day. Only this derived cache
// is dropped; nothing the user entered lives under it.
// v3: v2 indexed only the 179 of 411 accessories that some recipe happened to
// mention, so the accessories page would have been missing 232 of them, almost
// all of them the uncraftable ones it exists to explain. Bumping the key
// re-parses rather than serving those incomplete snapshots for up to a day.
// Only this derived cache is dropped; nothing the user entered lives under it.
// v4: v3 was written before `requirements` and `stats` were added to the cached
// item, so a v3 snapshot carries neither. It was caught on the built page: the
// accessories page hydrated a same-day v3 cache and reported Combat 10 and
// Other 318, where a fresh index gives Combat 72 and Other 226. Every activity
// group and every Hypixel requirement gate silently degrades for as long as
// that snapshot is served, because both are read off fields the snapshot does
// not have. A payload that gains fields has to gain a key with them; this is
// the same bump v2 and v3 were.
// v6: the cached item now carries Hypixel's `origin` field, which is how the
// accessories page separates Rift accessories from normal ones (measured on
// the live resource: 29 accessories state `origin: "RIFT"`, and it is the only
// signal that gets the Scarf line right, which is dungeon loot wearing rift
// stats). Same rule as v4: a payload that gains a field gains a key, or a
// same-day origin-less snapshot serves rift-less entries for as long as it
// lives. v5 existed for minutes during development: a hot-reloading tab wrote
// a v5 snapshot after the key bump but before the field landed, which is
// exactly the poisoned-cache shape this list exists for, so it is retired the
// same way.
// v7: the cached item now carries `vanilla` (vanilla recipes are excluded
// from the SkyBlock catalogue). The flag
// is read off the crafting module's own `-- Vanilla Recipes` section marker,
// so a v6 snapshot has no way to say which side of that line a recipe came
// from and would keep Acacia Doors in the list for up to a day. Same rule as
// v4 and v6: the payload gained a field, so it gains a key in the same edit.
// v8: v7 repeated v5's accident to the letter, and was caught the same way
// v5's comment predicts: a hot-reloading dev tab wrote a v7 snapshot after
// the key bump but before the vanilla parsing landed, verified in the built
// page (an acacia_door entry under v7 with no `vanilla` flag, TTL-protected
// for a day). Burned, exactly as v5 was.
// v9: `tier` no longer carries Hypixel's "UNOBTAINABLE", which is a flag, not
// a rarity (see the note on `meta` below and the Enchanted Clock collision it
// mispainted). A v8 snapshot still stores it, and a stored tier blocks the
// wiki fill from ever asking, so the rule change bumps the key with it.
// v10: v9 hit the same v5/v7 race - any dev tab open on 5173 hot
// reloads EVERY edit as it lands, so a key bump and its rule arriving as two
// edits is always a window, and a v9 snapshot with the UNOBTAINABLE tier
// still in it was verified on the built page. This bump is a single edit
// with the rule already in the file, which closes the window.
// v11: the parser used to scan a recipe's WHOLE body for slot patterns, which
// reads straight through the `//` that separates alternate recipe variants
// (see the comment on `firstVariant` below) as if every variant belonged to
// one recipe. A v10 snapshot still carries that corruption baked in - the
// built page showed Enchanted Charcoal at 256 Coal + 64 Log against the
// wiki's own stated 128 + 32 - so a v10 snapshot has to be re-parsed, not
// served, for every item with a `//` in its module entry.
// v12: the entry regex required a recipe's QRS string to be followed
// immediately by the entry's closing `}`, so any entry carrying a trailing
// `Output` or `ver` argument (see the comment on `ENTRY` below) was not
// parsed wrong, it was not parsed at all - 29 real keys, Enchanted Paper and
// Haste Block among them, were simply absent with nothing to show it. A v11
// snapshot was built by the same broken regex and is missing every one of
// them; only re-parsing recovers them; a same-day v11 tab is the same
// hot-reload race the v5/v7/v9 notes above describe, and closing it is why
// this bump is its own edit rather than folded into v11's.
// v13: ingredient names are stripped of trailing commas ("Shadow Crux," is
// the wiki's own typo in Cruxmotion, not an item). A v12 snapshot would keep
// serving the comma names for a day, so the payload change bumps the key with
// it, in this same edit, as always.
// v14: the cached item now carries Hypixel's `rift_transferrable` flag as
// `riftTransferable` (Rift_Transferable accessories belong both in the
// Rift and outside it; the accessories page lists those
// pieces in both areas on it). Measured on the live resource (2026-08-03): 68
// items carry the flag, always `true`, 20 of them accessories. Same rule as
// v4 and v6: a payload that gains a field gains a key with it.
// v15: v14 hit the same v5/v7/v9 race, verified in the built page
// minutes after the bump: the key landed one edit ahead of the field parse,
// a dev tab on 5173 hot-reloaded in the gap and wrote a v14 snapshot whose
// entries carry no `riftTransferable` at all, TTL-protected for a day
// (Scarf's Grimoire read back from the v14 blob without the flag). Burned
// exactly as v5, v7 and v9 were; THIS bump is a single edit with the parse
// already in the file, which is the only shape that closes the window.
// v16: fishing nets now survive even when the wiki's crafting module omits
// their output. The concrete miss was Gigantic Fishing Net: Hypixel's live
// item resource states GIGANTIC_FISHING_NET beside Bee Saliva from the same
// update, but Module:Crafting/Data contains Bee Saliva and no Gigantic Fishing
// Net key. A v15 snapshot has already discarded it before search can run, so
// it must be rebuilt rather than kept for the remainder of its one-day TTL.
// v17: recipe-less resource items that share one display name now retain one
// index row per Hypixel id. The live accessory resource currently has five
// Beastmaster Crest ids under the same name; v16 collapsed them to one before
// the accessory catalogue could see them.
// v18: invalidate any v17 snapshot written while that parser fix was arriving
// through hot reload. A partially rebuilt snapshot otherwise survives the
// daily TTL and makes live catalogue counts appear randomly incomplete.
// v19: the Collections drill-down now consumes the recipe attached to each
// tier reward, and module reads use MediaWiki's revision API rather than the
// raw index route. A v18 development snapshot was verified with the Fire
// Talisman unlock present but its recipe absent; retaining it would prevent
// both the revised module read and the article-level material fallback from
// taking effect until the daily TTL expired. No user-entered state lives here.
// v20: vanilla classification no longer treats a Hypixel rarity as proof that
// a Minecraft grid belongs in the SkyBlock recipe catalogue. The explicit
// misplaced SkyBlock cluster is retained, while tiered Crafting Tables and
// diamond tools stay vanilla. Minecraft formatting codes are also removed from
// stored display names. Both changes alter cached item rows, so v19 must retire.
// v21: Gigantic Fishing Net now carries its direct five-part grid recipe. The
// wiki module omits that one output, and the article infobox only exposes its
// flattened Sea Lumies subtotal, which erased the other four ingredients from
// the planner. A v20 snapshot therefore has to be rebuilt rather than serving
// the incomplete fallback for another day.
// v22: the wiki replaced its crafting Lua module with the crafting_recipes
// table. Rebuild the derived index with its current recipes and exact variants.
// v23: retain explicit unavailable flags separately from display rarity.
export const CACHE_KEY = "wizardsky.crafting.v23";
const STALE_KEYS = [
  "wizardsky.crafting.v1",
  "wizardsky.crafting.v2",
  "wizardsky.crafting.v3",
  "wizardsky.crafting.v4",
  "wizardsky.crafting.v5",
  "wizardsky.crafting.v6",
  "wizardsky.crafting.v7",
  "wizardsky.crafting.v8",
  "wizardsky.crafting.v9",
  "wizardsky.crafting.v10",
  "wizardsky.crafting.v11",
  "wizardsky.crafting.v12",
  "wizardsky.crafting.v13",
  "wizardsky.crafting.v14",
  "wizardsky.crafting.v15",
  "wizardsky.crafting.v16",
  "wizardsky.crafting.v17",
  "wizardsky.crafting.v18",
  "wizardsky.crafting.v19",
  "wizardsky.crafting.v20",
  "wizardsky.crafting.v21",
  "wizardsky.crafting.v22",
];

/** Refresh the parsed database at most once a day. */
export const CRAFTING_TTL = 24 * 60 * 60 * 1000;

const stripMinecraftFormatting = (value: string): string => value.replace(/§[0-9a-fk-or]/gi, "").trim();

export const norm = (s: string) => stripMinecraftFormatting(s).toLowerCase().replace(/[^a-z0-9]/g, "");
export const slug = (s: string) =>
  stripMinecraftFormatting(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Genuine SkyBlock recipes currently misplaced below the wiki's vanilla marker. */
const SKYBLOCK_RECIPES_IN_VANILLA_SECTION = new Set(
  [
    "Jacob's Participation Medal",
    "Jalapeno Book",
    "Jasper Power Scroll",
    "Jerry Helmet",
    "Jinxed Voodoo Doll",
    "Juicy Healing Melon",
    "Juicy Nozzle",
    "Juju Shortbow",
    "Jumbo Backpack",
    "Jungle Biome Stick",
  ].map(norm)
);

/**
 * Wiki image URL for an item, built straight from its name.
 *
 * MediaWiki serves `/images/thumb/<File>.png/<px>px-<File>.png` without any
 * API call, so a whole page of icons costs zero lookups. The browser loads
 * them from the wiki directly, so nothing is copied into this project.
 *
 * This is the cheap first guess, not the whole story. It cannot see a reforge
 * prefix ("Rapid Juju Shortbow" has no file of its own) and it cannot follow a
 * file redirect ("Boots of Divan" is drawn with the Golden Boots texture).
 * `wikiImages.ts` layers those two cases on top and is what `ItemIcon` calls.
 */
export const wikiIconUrl = (name: string, px = 64): string => {
  const file = encodeURIComponent(name.replace(/ /g, "_")) + ".png";
  return `${WIKI}/images/thumb/${file}/${px}px-${file}`;
};

/**
 * The wiki's original image asset, without asking its thumbnail service to
 * generate dozens of sizes at once. Dense identity grids such as owned pets
 * can otherwise overwhelm that service and fall through to generic heads even
 * though the exact artwork exists. The browser still scales this file inside
 * ItemIcon's fixed box.
 */
export const wikiImageUrl = (name: string): string => {
  const file = encodeURIComponent(name.replace(/ /g, "_")) + ".png";
  return `${WIKI}/images/${file}`;
};

/** Slots a Quick Recipe Syntax spec covers. Rows A-C, columns 1-3, `*` = all. */
const countSlots = (spec: string): number => {
  const slots = new Set<string>();
  for (const [, rowPart, colPart] of spec.matchAll(/([ABC*])([123]+|\*)/g)) {
    const rows = rowPart === "*" ? ["A", "B", "C"] : [rowPart];
    const cols = colPart === "*" ? ["1", "2", "3"] : colPart.split("");
    for (const r of rows) for (const c of cols) slots.add(r + c);
  }
  return slots.size;
};

/**
 * One slot's contents. Editors write four forms, all of which appear:
 *   "Enchanted Iron Ingot, 64"      item plus per-slot quantity
 *   "Scylla; Hyperion; Valkyrie"    any ONE of these works
 *   "Enchanted Magma Cream, 12; "   both, with trailing junk
 *   "Shadow Crux,"                  a comma with NO quantity after it
 *
 * That last one is a live editor slip, not a hypothetical: Cruxmotion's entry
 * quotes four of its six cruxes with a trailing comma inside the string. The
 * comma is punctuation someone forgot to delete, never part of a name, and
 * keeping it poisoned everything downstream of the name - the built page
 * showed "Shadow Crux," rendered verbatim with a wrong sprite,
 * because no wiki file ends in a comma and the icon ladder fell to a guess.
 * So a name is stripped of trailing commas on every path out of here.
 */
const parseSlotBody = (body: string): { name: string; per: number }[] =>
  body
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((opt) => {
      const comma = opt.lastIndexOf(",");
      if (comma > -1) {
        const tail = opt.slice(comma + 1).trim();
        if (/^\d[\d,]*$/.test(tail)) {
          return { name: opt.slice(0, comma).trim().replace(/\\'/g, "'").replace(/,+\s*$/, ""), per: Number(tail.replace(/,/g, "")) };
        }
      }
      return { name: opt.replace(/\\'/g, "'").replace(/,+\s*$/, "").trim(), per: 1 };
    })
    .filter((o) => !/^\{\d+\}$/.test(o.name.trim())); // unexpanded template params

export interface ParsedRecipe {
  yields: number;
  ingredients: { name: string; qty: number; alternatives: string[] }[];
  /**
   * True when the recipe sits in the module's own `-- Vanilla Recipes`
   * section. That marker is the wiki's classification, not ours: the module
   * is written as SkyBlock recipes first, then the marker, then every plain
   * Minecraft recipe (Acacia Door, Andesite, the wool and carpet colours),
   * then a `-- Templates` block. Measured on the live module 2026-08-03:
   * 1,251 keys before the marker, 303 after it, none on both sides.
   */
  vanilla?: boolean;
}

export const parseCraftingLua = (lua: string): Map<string, ParsedRecipe> => {
  const recipes = new Map<string, ParsedRecipe>();

  /**
   * Section boundaries, straight from the module's own comments. A fixture
   * (or a future rewrite of the module) without the markers parses exactly as
   * before: no vanilla flag, nothing skipped.
   */
  const vanillaAt = lua.indexOf("-- Vanilla Recipes");
  const templatesAt = lua.indexOf("-- Templates");

  /*
   * A table entry is `['Key'] = {'QRS STRING'}`, optionally followed by more
   * named arguments before the closing brace: `, Output = 'X, 8'` or `, ver =
   * 2` are the two shapes the module actually uses. The old pattern required
   * the QRS string's closing quote to be followed immediately by `}`, so any
   * entry carrying one of those extra arguments was not a shorter match, it
   * was NO match: the whole entry, QRS string included, silently never
   * reached the loop body. Measured live 2026-08-03 against the real module:
   * 29 keys carry a trailing argument, among them Enchanted Paper, Haste
   * Block, Diamond Head, Master Skull, Hard Glass and Potted Cactus, and all
   * 29 were absent from the index with no error and no trace - "no recipe"
   * looks identical to "recipe not on a grid" from the outside. The trailing
   * group below is the fix: zero or more `, name = 'string'` / `, name =
   * number` pairs, consumed and kept (as `argsBlob`) rather than discarded,
   * because `Output` is what recovers Haste Block's true yield below.
   */
  const ENTRY = /\['((?:[^'\\]|\\.)+)'\]\s*=\s*\{'((?:[^'\\]|\\.)*)'((?:\s*,\s*[A-Za-z]+\s*=\s*(?:'(?:[^'\\]|\\.)*'|-?\d+))*)\s*\}/g;

  for (const match of lua.matchAll(ENTRY)) {
    const [, rawName, body, argsBlob] = match;
    const rawKey = rawName.replace(/\\'/g, "'");
    if (/test item/i.test(rawKey)) continue;
    if (/^\{\d+\}$/.test(rawKey.trim())) continue;
    /*
     * Keys after `-- Templates` are template definitions ('T:Enchanted',
     * 'T:Sacks'), not items: they exist for other module entries to expand
     * and were leaking into the index as literal items named "T:Enchanted".
     * Same class of non-item as the `{1}` parameter keys already skipped.
     */
    if (templatesAt !== -1 && match.index! >= templatesAt) continue;
    const vanilla = vanillaAt !== -1 && match.index! >= vanillaAt;

    // A recipe key can carry its own yield: ['Agaricus Chumcap, 8'] makes 8.
    let name = rawKey;
    let yields = 1;
    const keyComma = rawKey.lastIndexOf(",");
    if (keyComma > -1) {
      const tail = rawKey.slice(keyComma + 1).trim();
      if (/^\d[\d,]*$/.test(tail)) {
        name = rawKey.slice(0, keyComma).trim();
        yields = Number(tail.replace(/,/g, ""));
      }
    }

    /*
     * The key rarely carries its own yield (`Agaricus Chumcap, 8` above); the
     * module's usual place for it is the trailing `Output` argument instead,
     * e.g. `Output = 'Haste Block, 8'`. Only read when it is unambiguous: a
     * single name (no `;`, which is a list of per-variant outputs such as
     * Diamond Head's seven Golden-Head recipes, and picking one would be a
     * guess about which variant it belongs to) whose name, once its own
     * comma-quantity is stripped, is the SAME item this entry already is.
     * Verified live 2026-08-03 against Haste Block's own infobox
     * (`Output = Haste Block, 8`, matching the wiki's stated 8-per-craft)
     * and against Enchanted Paper's, where the single-name rule correctly
     * declines: its Output is a two-entry list and the wiki's own infobox
     * states the 192-Sugar-Cane recipe yields 1, which is what the existing
     * default already gave it.
     */
    if (yields === 1) {
      const output = argsBlob.match(/Output\s*=\s*'((?:[^'\\]|\\.)*)'/);
      if (output && !output[1].includes(";")) {
        const outComma = output[1].lastIndexOf(",");
        const outTail = outComma > -1 ? output[1].slice(outComma + 1).trim() : "";
        if (/^\d[\d,]*$/.test(outTail)) {
          const outName = output[1].slice(0, outComma).trim().replace(/\\'/g, "'");
          if (norm(outName) === norm(name)) yields = Number(outTail.replace(/,/g, ""));
        }
      }
    }

    /*
     * `//` separates alternate recipe variants, per the module's own header
     * comment ("part 3: animated recipe -- separate each recipe with '//'").
     * Only the first variant is read. Summing every variant, which is what
     * scanning the whole body did, is wrong twice over: when the variants
     * restate the same total in a different slot shape it doubles every
     * shared ingredient (Enchanted Charcoal's two variants each need 128 Coal
     * + 32 Log; merging both gave 256 Coal + 64 Log), and when the variants
     * are genuinely different choices it unions mutually exclusive options
     * into one requirement (Beacon Block's three variants each use ONE of
     * Catalyst, Hyper Catalyst or Eternal Crystal; merging asked for all
     * three at once, on top of tripled Glass and Obsidian). Verified live
     * 2026-08-03 against the items' own infoboxes: Enchanted Charcoal states
     * `mat_cost_bazaar = *128 Coal *32 Oak Wood` and Beacon Block states
     * `ingredients = ... 3 Obsidian, 5 Glass` plus one Nether Star item; both
     * match the first variant exactly and neither matches the summed total.
     */
    const firstVariant = body.split("//")[0];

    const merged = new Map<string, { name: string; qty: number; alternatives: string[] }>();
    for (const [, spec, slotBody] of firstVariant.matchAll(/([ABC*][ABC*123]*)\s+"([^"]+)"/g)) {
      const slots = countSlots(spec);
      if (!slots) continue;

      const options = parseSlotBody(slotBody);
      if (!options.length) continue;

      const primary = options[0];
      const key = norm(primary.name);
      const qty = slots * primary.per;

      const existing = merged.get(key);
      if (existing) existing.qty += qty;
      else merged.set(key, { name: primary.name, qty, alternatives: options.slice(1).map((o) => o.name) });
    }

    if (merged.size) recipes.set(name, { yields, ingredients: [...merged.values()], ...(vanilla ? { vanilla: true } : {}) });
  }

  return recipes;
};

/**
 * Collection tiers that grant an item or its recipe.
 * Shape: ['Acacia Log'] = { [3] = { required = 250, reward = {{ 'X', type = 'Recipe' }} } }
 */
export const parseCollectionLua = (lua: string): Map<string, CollectionUnlock[]> => {
  const unlocks = new Map<string, CollectionUnlock[]>();
  /** Return one Lua table without depending on the editor's indentation. */
  const tableAt = (open: number): string => {
    let depth = 0;
    let quote: "'" | '"' | null = null;
    let escaped = false;
    for (let i = open; i < lua.length; i++) {
      const char = lua[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = null;
        continue;
      }
      if (char === "'" || char === '"') {
        quote = char;
        continue;
      }
      if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) return lua.slice(open + 1, i);
    }
    return lua.slice(open + 1);
  };

  /*
   * The live module contains a top-level collection indented with two tabs
   * while most use one. The previous exact-one-tab matcher skipped that block,
   * then let its rewards bleed into the preceding collection. String-keyed
   * collection tables are found at any indentation and bounded by braces, so
   * formatting can no longer change which collection owns a reward.
   */
  const blocks = [...lua.matchAll(/^[\t ]*\['([^']+)'\]\s*=\s*\{/gm)];

  for (const block of blocks) {
    const collection = block[1];
    const open = lua.indexOf("{", block.index!);
    if (open < 0) continue;
    const body = tableAt(open);

    const tiers = [...body.matchAll(/^[\t ]*\[(\d+)\]\s*=\s*\{/gm)];
    for (const tier of tiers) {
      const tierOpen = body.indexOf("{", tier.index!);
      if (tierOpen < 0) continue;
      // `tableAt` closes over `lua`, so offset this tier back into the source.
      const absoluteTierOpen = open + 1 + tierOpen;
      const rest = tableAt(absoluteTierOpen);
      const requiredStr = rest.match(/\brequired\s*=\s*(\d+)/)?.[1];
      if (!requiredStr) continue;

      for (const [, rewardName, type] of rest.matchAll(/\{\s*'([^']+)',\s*type\s*=\s*'([^']+)'\s*\}/g)) {
        if (type !== "Recipe" && type !== "Trade" && type !== "Dwarven Forge Recipe") continue;
        const k = norm(rewardName);
        if (!unlocks.has(k)) unlocks.set(k, []);
        unlocks.get(k)!.push({
          collection,
          tier: Number(tier[1]),
          required: Number(requiredStr),
          type: type as CollectionUnlock["type"],
        });
      }
    }
  }

  return unlocks;
};

const rawModule = async (page: string, signal?: AbortSignal): Promise<string> => {
  const query = new URLSearchParams({
    action: "query",
    titles: page,
    prop: "revisions",
    rvprop: "content",
    rvslots: "main",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const res = await fetch(`${WIKI}/api.php?${query}`, { signal });
  if (!res.ok) throw new Error(`${page} responded ${res.status}`);
  const body = (await res.json()) as {
    query?: { pages?: { revisions?: { slots?: { main?: { content?: string } } }[] }[] };
  };
  const content = body.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content;
  if (!content) throw new Error(`${page} returned no module content`);
  return content;
};

export interface CraftingRecipeLookup {
  yields: number;
  ingredients: RecipeIngredient[];
}

let liveCraftingRecipes: Map<string, ParsedRecipe> | null = null;
let liveCraftingRecipesInFlight: Promise<Map<string, ParsedRecipe>> | null = null;

const currentCraftingRecipes = async (signal?: AbortSignal): Promise<Map<string, ParsedRecipe>> => {
  try {
    return await fetchCraftingBucket(signal);
  } catch (error) {
    if (signal?.aborted) throw error;
    // Retain compatibility with the former module while the wiki migrates.
    try {
      const recipes = parseCraftingLua(await rawModule("Module:Crafting/Data", signal));
      if (recipes.size) return recipes;
    } catch { /* Keep the current source's error for the existing recovery UI. */ }
    if (signal?.aborted || !import.meta.env.DEV || import.meta.env.MODE === "test") throw error;
    // The local snapshot remains development-only and never enters production.
    return parseCraftingLua((await import("../../data/wiki/modules/Module_Crafting_Data.lua?raw")).default);
  }
};

const collectionModule = async (signal?: AbortSignal): Promise<string> => {
  try {
    return await rawModule("Module:Collection/Data", signal);
  } catch (error) {
    if (!import.meta.env.DEV || import.meta.env.MODE === "test") throw error;
    // Same development-only boundary as `tooltipCraftingModule`: the checked-in
    // snapshot keeps local review representative without changing what ships.
    return (await import("../../data/wiki/modules/Module_Collection_Data.lua?raw")).default;
  }
};

/**
 * Retry the authoritative grid-recipe source for one tooltip.
 *
 * The shared item index normally already carries this data. This seam exists
 * for its honest resource-only fallback: if the larger crafting module failed
 * while the page loaded, opening one recipe may retry it without replacing a
 * grid recipe with an article's fully expanded raw-material total.
 */
export const fetchCraftingRecipe = async (
  name: string,
  signal?: AbortSignal,
): Promise<CraftingRecipeLookup | null> => {
  if (!liveCraftingRecipes) {
    if (!liveCraftingRecipesInFlight) {
      liveCraftingRecipesInFlight = currentCraftingRecipes(signal)
        .then((recipes) => {
          liveCraftingRecipes = recipes;
          return recipes;
        })
        .finally(() => {
          liveCraftingRecipesInFlight = null;
        });
    }
    await liveCraftingRecipesInFlight;
  }

  const parsed = liveCraftingRecipes?.get(name)
    ?? [...(liveCraftingRecipes?.entries() ?? [])].find(([candidate]) => norm(candidate) === norm(name))?.[1]
    ?? null;
  if (!parsed) return null;
  return {
    yields: parsed.yields,
    ingredients: parsed.ingredients.map((ingredient) => ({
      id: slug(ingredient.name),
      name: ingredient.name,
      qty: ingredient.qty,
      ...(ingredient.alternatives.length > 0 ? {
        alternatives: ingredient.alternatives.map((alternative) => ({ id: slug(alternative), name: alternative })),
      } : {}),
    })),
  };
};

export interface CraftingSnapshot {
  fetchedAt: number;
  items: ItemIndex;
  /** Present when the resource index is usable but the wiki recipe layer was unavailable. */
  warning?: string | null;
}

const readCache = (): CraftingSnapshot | null => {
  try {
    for (const k of STALE_KEYS) localStorage.removeItem(k);
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CraftingSnapshot;
    return parsed?.items && parsed.fetchedAt ? parsed : null;
  } catch {
    return null;
  }
};

const writeCache = (snap: CraftingSnapshot) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snap));
  } catch {
    // Payload is a few hundred KB and quotas vary. Losing the cache only
    // means refetching, so this is not worth surfacing.
  }
};

export interface HypixelItem {
  name?: string;
  id: string;
  tier?: string;
  category?: string;
  npc_sell_price?: number;
  /**
   * Requirements Hypixel states for the item, e.g. a slayer level needed to
   * buy or craft it. Present on a minority of items and carried through
   * untouched; see `ItemRequirement` for why it stays loosely typed.
   */
  requirements?: ItemRequirement[];
  /** Stat block, used to tell a farming accessory from a combat one. */
  stats?: Record<string, unknown>;
  /**
   * Where the item comes from, when Hypixel states it. The one value this
   * project consumes is `"RIFT"`, which is Hypixel's own claim that the item
   * is obtained inside the Rift Dimension; the accessories page splits its
   * Rift band on it. Absent on the large majority of items.
   */
  origin?: string;
  /**
   * Hypixel's own statement that the item may cross the dimension boundary:
   * a rift-transferable piece works both inside and outside the Rift. Present
   * (and always `true`) on 68 items as of 2026-08-03, 20 of them accessories;
   * absent everywhere else. Note Hypixel's spelling carries the double r.
   */
  rift_transferrable?: boolean;
  /**
   * Mojang texture property, present on every skull item.
   *
   * Nothing in this module reads it. It is declared so the type tells the truth
   * about what the response carries, because the array is handed to
   * `itemResource`, which does read it.
   */
  skin?: { value?: string } | null;
  /** Exact model id in Hypixel's official SkyBlock resource pack. */
  item_model?: string;
}

/**
 * Hypixel categories whose items belong in the index even with no grid recipe.
 *
 * The index is otherwise built from what the crafting module mentions, which is
 * the right rule for a crafting database and the wrong one for anything the
 * game hands you by another route. Greenhouse mutations are grown, not crafted,
 * so only the 15 of 40 that happen to be an ingredient in some recipe used to
 * survive. The other 25 were dropped along with their Hypixel ids, and that id
 * is the only bridge between an item here and what the player actually owns:
 * the island feed, the API sacks and the shard tally are all keyed by it. So
 * "need / have / missing" silently had nothing to match against and fell back
 * to manual entry.
 *
 * This is Hypixel's own categorisation, read from the resource the index
 * already fetches, so no id is invented and no list is bundled. An item the
 * resource does not name keeps a null `hypixelId`, which is the honest answer.
 *
 * ACCESSORY was added for the same reason, measured rather than assumed. Of the
 * 411 accessories Hypixel lists, only 179 are mentioned anywhere in the
 * crafting module; the other 232 appear in no recipe as either an output or an
 * ingredient and were therefore absent from this index entirely. That is not a
 * long tail of obscure items, it is most of the category, and it is skewed
 * exactly the wrong way: the ones that fall out are the ones with no recipe,
 * which is to say the quest rewards, the Dark Auction items, the mob drops and
 * the event hats. Anita's Talisman, Pesthunter Ring and the Hats of
 * Celebration were all invisible here.
 *
 * The accessories page is a checklist of what a player is missing and where to
 * get it, so an item having no recipe is the reason it belongs on the page, not
 * a reason to drop it. Including the category also makes every accessory
 * linkable from `/items`, which is what the page's cross-links point at.
 */
const RECIPELESS_CATEGORIES = new Set(["MUTATION", "ACCESSORY", "FISHING_NET"]);

/**
 * Exact grid recipes missing from `Module:Crafting/Data`, keyed by Hypixel id.
 *
 * The module remains the primary source and wins whenever it gains the row.
 * This narrow supplement exists because the same omission already forces
 * FISHING_NET outputs into the index above. Without the grid, the article-level
 * material fallback turns Gigantic Fishing Net into only 26,912 Sea Lumies:
 * that is the correctly flattened Lumies branch, but it drops Reinforced
 * Netting, Sublime Silk, Turbo Fishing Net and Flexbone entirely.
 *
 * The five direct ingredients were cross-checked against the current NEU item
 * record, a source Skydex already uses and credits for gaps in public metadata.
 */
const CRAFTING_MODULE_GAPS = new Map<string, ParsedRecipe>([
  [
    "GIGANTIC_FISHING_NET",
    {
      yields: 1,
      ingredients: [
        { name: "Enchanted Sea Lumies", qty: 128, alternatives: [] },
        { name: "Reinforced Netting", qty: 1, alternatives: [] },
        { name: "Sublime Silk", qty: 32, alternatives: [] },
        { name: "Turbo Fishing Net", qty: 1, alternatives: [] },
        { name: "Flexbone", qty: 64, alternatives: [] },
      ],
    },
  ],
]);

/**
 * Whether the item belongs behind the Craftable only filter.
 *
 * Usually the parsed ingredient list is the answer. Fishing nets need one
 * extra signal because the official crafting module currently omits Gigantic
 * Fishing Net altogether even though Hypixel's item resource classifies it
 * with the other progressive fishing nets. Keeping this predicate next to the
 * ingestion exception makes the two halves impossible to drift apart: rescuing
 * the row but hiding it under the default filter would reproduce the same bug
 * one stage later.
 */
export const hasKnownCraftingRecipe = (item: Pick<Item, "recipe" | "category">): boolean =>
  Boolean(item.recipe) || item.category === "FISHING_NET";

/**
 * Turn the three parsed sources into the item index.
 *
 * Pure, so it can be tested without the network.
 */
export const buildItemIndex = (
  recipes: Map<string, ParsedRecipe>,
  unlocks: Map<string, CollectionUnlock[]>,
  hypixelItems: HypixelItem[]
): ItemIndex => {
  const meta = new Map<
    string,
    {
      id: string;
      tier: string | null;
      category: string | null;
      npcSell: number | null;
      requirements: ItemRequirement[] | null;
      stats: Record<string, unknown> | null;
      origin: string | null;
      riftTransferable: boolean;
      unavailable: boolean;
    }
  >();
  for (const it of hypixelItems) {
    if (!it.name) continue;
    const itemName = stripMinecraftFormatting(it.name);
    const k = norm(itemName);
    if (!meta.has(k)) {
      meta.set(k, {
        id: it.id,
        /*
         * "UNOBTAINABLE" is Hypixel's flag for admin relics, not a rarity:
         * nothing on the ladder can render it, so keeping it buys no colour
         * and costs a real one. The concrete casualty was Enchanted Clock:
         * the resource carries ENCHANTED_CLOCK (the admin relic, tier
         * UNOBTAINABLE) and ENCHANTED_TIME_CLOCK (the craftable LEGENDARY
         * item) under the same display name, and first-wins handed the
         * craftable clock the relic's non-rarity, which blocked the wiki
         * tier fill from ever asking. Dropped here, the name resolves to a
         * null tier and the wiki answers Legendary.
         */
        tier: it.tier && it.tier !== "UNOBTAINABLE" ? it.tier : null,
        category: it.category ?? null,
        npcSell: typeof it.npc_sell_price === "number" ? it.npc_sell_price : null,
        requirements: Array.isArray(it.requirements) && it.requirements.length > 0 ? it.requirements : null,
        stats: it.stats && typeof it.stats === "object" ? it.stats : null,
        origin: typeof it.origin === "string" && it.origin ? it.origin : null,
        riftTransferable: it.rift_transferrable === true,
        unavailable: it.tier === "UNOBTAINABLE" || it.tier === "ADMIN",
      });
    }
  }

  /** Wiki variants such as "Aspect of the Leech (Rare)" fall back to the base name. */
  const resolve = (name: string) => {
    const direct = meta.get(norm(name));
    if (direct) return direct;
    const stripped = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
    return stripped !== name ? meta.get(norm(stripped)) ?? null : null;
  };

  const seen = new Set<string>();
  const recipesByDisplayName = new Map<string, ParsedRecipe>();
  for (const [name, r] of recipes) {
    const itemName = stripMinecraftFormatting(name);
    seen.add(itemName);
    if (!recipesByDisplayName.has(itemName)) recipesByDisplayName.set(itemName, r);
    for (const i of r.ingredients) seen.add(stripMinecraftFormatting(i.name));
  }
  // Supplement ingredients must be index rows too, or held-item ids and rarity
  // metadata cannot meet the tree even though the root recipe is now complete.
  for (const recipe of CRAFTING_MODULE_GAPS.values()) {
    for (const ingredient of recipe.ingredients) seen.add(stripMinecraftFormatting(ingredient.name));
  }
  // Names Hypixel itself gives us for things no recipe mentions.
  for (const it of hypixelItems) {
    if (it.name && it.category && RECIPELESS_CATEGORIES.has(it.category)) seen.add(stripMinecraftFormatting(it.name));
  }

  const items: ItemIndex = {};
  for (const name of seen) {
    const id = slug(name);
    const m = resolve(name);
    const r = recipesByDisplayName.get(name) ?? (m ? CRAFTING_MODULE_GAPS.get(m.id) : undefined);

    /*
     * VANILLA, AND THE RESCUE THAT MAKES THE FLAG TRUSTWORTHY
     * -------------------------------------------------------
     * Vanilla recipes are excluded from the SkyBlock catalogue. The module's
     * own section marker
     * is the classifier (see `ParsedRecipe.vanilla`), but it is a page other
     * people edit, and edited it has been: a real SkyBlock cluster (Juju
     * Shortbow, Jasper Power Scroll, and their neighbouring J entries) sits in the
     * vanilla section because someone inserted them alphabetically into the
     * wrong half. So the marker alone would hide a dungeon bow.
     *
     * Hypixel rarity is not a safe rescue signal because SkyBlock assigns
     * rarities to several ordinary Minecraft objects too. The explicit set
     * above follows the current misplaced cluster instead: it keeps the real
     * SkyBlock recipes, including untiered Jerry Helmet and Jungle Biome Stick,
     * without restoring Crafting Table, Ender Chest, or diamond-tool grids.
     */
    const vanilla = Boolean(r?.vanilla) && !SKYBLOCK_RECIPES_IN_VANILLA_SECTION.has(norm(name));

    items[id] = {
      name,
      hypixelId: m?.id ?? null,
      ...(vanilla ? { vanilla: true } : {}),
      tier: m?.tier ?? null,
      ...(m?.unavailable ? { unavailable: true } : {}),
      category: m?.category ?? null,
      npcSell: m?.npcSell ?? null,
      requirements: m?.requirements ?? null,
      stats: m?.stats ?? null,
      origin: m?.origin ?? null,
      ...(m?.riftTransferable ? { riftTransferable: true } : {}),
      yields: r?.yields ?? 1,
      recipe:
        r?.ingredients.map((i) => ({
          id: slug(i.name),
          name: stripMinecraftFormatting(i.name),
          qty: i.qty,
          ...(i.alternatives.length
            ? { alternatives: i.alternatives.map((a) => ({ id: slug(a), name: stripMinecraftFormatting(a) })) }
            : {}),
        })) ?? null,
      ...(unlocks.has(norm(name)) ? { unlocks: unlocks.get(norm(name)) } : {}),
    } as Item;
  }

  /*
   * A display name is not a primary key. Hypixel legitimately gives several
   * resource ids the same visible name (the Beastmaster Crest rarities are a
   * live example). `seen` is name-based because wiki recipes are name-based,
   * but the accessory catalogue and player holdings are id-based. Preserve
   * every recipe-less resource id after the normal wiki-name pass; the first
   * keeps the friendly name slug and colliding ids use their stable Hypixel id
   * as the internal key. Nothing user-facing is renamed.
   */
  const representedIds = new Set(
    Object.values(items)
      .map((item) => item.hypixelId)
      .filter((id): id is string => Boolean(id))
  );
  for (const raw of hypixelItems) {
    if (!raw.id || !raw.name || !raw.category || !RECIPELESS_CATEGORIES.has(raw.category) || representedIds.has(raw.id)) continue;

    const itemName = stripMinecraftFormatting(raw.name);
    const friendlyKey = slug(itemName);
    const key = items[friendlyKey] ? slug(raw.id) : friendlyKey;
    items[key] = {
      name: itemName,
      hypixelId: raw.id,
      tier: raw.tier && raw.tier !== "UNOBTAINABLE" ? raw.tier : null,
      ...(raw.tier === "UNOBTAINABLE" || raw.tier === "ADMIN" ? { unavailable: true } : {}),
      category: raw.category,
      npcSell: typeof raw.npc_sell_price === "number" ? raw.npc_sell_price : null,
      requirements: Array.isArray(raw.requirements) && raw.requirements.length > 0 ? raw.requirements : null,
      stats: raw.stats && typeof raw.stats === "object" ? raw.stats : null,
      origin: typeof raw.origin === "string" && raw.origin ? raw.origin : null,
      ...(raw.rift_transferrable === true ? { riftTransferable: true } : {}),
      yields: 1,
      recipe: null,
      ...(unlocks.has(norm(raw.name)) ? { unlocks: unlocks.get(norm(raw.name)) } : {}),
    } as Item;
    representedIds.add(raw.id);
  }

  // Reverse index: which SkyBlock recipes each item feeds into. Vanilla grids
  // remain parseable source data, but never become user-facing destinations.
  // Capped so staples do not carry a list of hundreds.
  const USED_IN_CAP = 40;
  for (const [id, it] of Object.entries(items)) {
    if (!it.recipe || it.vanilla) continue;
    for (const ing of it.recipe) {
      const target = items[ing.id];
      if (!target) continue;
      if (!target.usedIn) target.usedIn = [];
      if (target.usedIn.length < USED_IN_CAP) target.usedIn.push(id);
      target.usedInTotal = (target.usedInTotal ?? 0) + 1;
    }
  }

  return items;
};

/**
 * Build the whole item index in the browser.
 *
 * Three sources, all CORS-open and all keyless: the wiki's crafting and
 * collection modules, plus Hypixel's item metadata for tier, category and NPC
 * sell price. Nothing here is shipped with the app.
 */
export const fetchCraftingData = async (signal?: AbortSignal): Promise<CraftingSnapshot> => {
  const [crafting, collLua, hypixel] = await Promise.all([
    currentCraftingRecipes(signal)
      .then((recipes) => ({ recipes, error: null as Error | null }))
      .catch((cause: unknown) => ({
        recipes: new Map<string, ParsedRecipe>(),
        error: cause instanceof Error ? cause : new Error("The crafting module could not be read."),
      })),
    collectionModule(signal).catch(() => ""),
    fetchSkyblockItems(signal)
      .then((items) => ({ items }))
      .catch(() => ({ items: [] as unknown[] })),
  ]);

  const resourceItems = (hypixel as { items?: HypixelItem[] }).items ?? [];
  if (!crafting.recipes.size && resourceItems.length === 0) {
    throw crafting.error ?? new Error("The item catalogue could not be read.");
  }

  // The icon ladder needs two more columns of this same response: Hypixel's own
  // display name for ids that do not spell it, and the `skin.value` that draws
  // a player head. Handing the array over here is what keeps that free, since
  // the alternative is a second download of the same few megabytes. This is a
  // publish, not a parse: nothing below depends on it and it cannot throw.
  adoptResourceItems(resourceItems);

  const items = buildItemIndex(
    crafting.recipes,
    collLua ? parseCollectionLua(collLua) : new Map<string, CollectionUnlock[]>(),
    resourceItems
  );

  const snap: CraftingSnapshot = {
    fetchedAt: Date.now(),
    items,
    warning: crafting.error?.message ?? null,
  };
  // A resource-only index keeps profile views useful, but it is not the full
  // crafting database and must not block a later retry behind the daily TTL.
  if (!snap.warning) writeCache(snap);
  return snap;
};

export const readCraftingCache = readCache;
