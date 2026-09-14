import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRecipes } from "../../items/useItemData";
import type { ItemIndex } from "../../items/useItemData";
import {
  itemResourceVersion,
  requestItemResource,
  resourceTierFor,
  subscribeItemResource,
} from "../../items/itemResource";
import {
  fetchWikiTiers,
  readTierCache,
  tierCacheFresh,
  writeTierCache,
  type WikiTierCache,
} from "../../items/wikiTiers";
import { wikiIconUrl, norm, slug } from "../../items/wikiCrafting";

/**
 * Things worth grinding towards that consume greenhouse mutations.
 *
 * Built at runtime rather than shipped. Most targets fall out of the crafting
 * index for free: any recipe with a mutation in its ingredient list is a
 * target. A few notable ones are not crafted on a grid at all, so their
 * ingredient lists are read from their wiki page on demand.
 *
 * Nothing wiki-derived is bundled with the app, which keeps the CC BY-NC-SA
 * share-alike clause off this project. See `items/wikiCrafting.ts`.
 */

const WIKI = "https://hypixelskyblock.minecraft.wiki";

/**
 * Targets the crafting grid does not cover.
 *
 * These are page names, not content. Their ingredient lists are fetched from
 * the wiki when the planner loads.
 *
 * "Ludleth" used to be in this list and is gone because Ludleth is an NPC,
 * not an item: the Rose Dragon is what he sells. The NPC's
 * page carries the same `{{RD|...}}` price rows as the pet he sells, so the
 * ingredient gate alone could not tell the seller from the thing sold and the
 * planner offered a person as something to grow. The Rose Dragon Pet article
 * carries its own price rows, so nothing was lost by dropping the vendor. The
 * `isNpcPage` guard below is the mechanism that keeps the mistake from coming
 * back through a future addition.
 */
const NON_CRAFTED_PAGES = ["Rose Dragon Pet"];

export interface TargetIngredient {
  name: string;
  qty: number;
  mutation: string | null;
  crop: string | null;
}

export interface CatalogueTarget {
  id: string;
  name: string;
  source: "crafting" | "infobox";
  wiki: string;
  ingredients: TargetIngredient[];
  /** Game-owned colour and inventory bridge, when Hypixel's item row supplies them. */
  rarity: string | null;
  hypixelId: string | null;
}

/** Icons come straight from the wiki, so there is no local icon path. */
export const itemIconPath = (target: CatalogueTarget): string | null => wikiIconUrl(target.name);

/*
 * v3, bumped in the same edit that changed what may be in the payload: a v2
 * cache written before the NPC guard can carry Ludleth for up to a day, and a
 * filter that only runs at fetch time cannot reach into it. New key, old key
 * left alone, per the storage rules.
 */
const CACHE_KEY = "wizardsky.targets.v4";
const TTL = 24 * 60 * 60 * 1000;

/**
 * Is this article about a person rather than a thing?
 *
 * The wiki answers this in its own voice: every page opens with an infobox
 * template whose name states what kind of subject it is. Ludleth's page opens
 * `{{Infobox/Character ...}}`; Rose Dragon Pet's opens `{{Infobox/Pet}}` and
 * `{{Infobox/Item ...}}`. So the classification is read off the template
 * names, not off a list of names to exclude: a page whose every infobox is a
 * character-family one is an NPC article, whatever it is called, and an NPC
 * is not a grind target no matter how many `{{RD|...}}` price rows its shop
 * section carries.
 *
 * A page with no infobox at all is NOT rejected here. Absence says "we could
 * not classify", not "this is a person", and the mutation-ingredient gate in
 * the fetch still stands between such a page and the catalogue.
 */
export const isNpcPage = (wikitext: string): boolean => {
  const kinds = [...wikitext.matchAll(/\{\{\s*Infobox\/([A-Za-z_ ]+)/g)].map(([, k]) => k.trim().toLowerCase());
  if (kinds.length === 0) return false;
  return kinds.every((k) => k === "character" || k === "npc");
};

/** Parse mutation costs from both generations of the wiki's item templates. */
export const parseInfoboxIngredients = (wikitext: string): { name: string; qty: number }[] => {
  const merged = new Map<string, { name: string; qty: number }>();
  const add = (nameRaw: string, qtyRaw?: string) => {
    const name = nameRaw.trim();
    if (!name) return;
    const qty = qtyRaw ? Number(qtyRaw.replace(/,/g, "")) : 1;
    const key = norm(name);
    const previous = merged.get(key);
    if (!previous) merged.set(key, { name, qty });
    else previous.qty = Math.max(previous.qty, qty);
  };

  // Legacy mutation rows are still present on older articles and caches.
  for (const [, qtyRaw, nameRaw] of wikitext.matchAll(/\{\{RD\|\s*([\d,]+)?\s*([^}|]+?)\s*\}\}/g)) {
    add(nameRaw, qtyRaw);
  }

  // Current articles state purchase ingredients in the Infobox/Item `buy`
  // field as `{{Item|Condensed Helianthus|amount=5}}`. Restricting the scan to
  // that field avoids treating unrelated item mentions elsewhere on the page
  // as costs.
  const lines = wikitext.split("\n");
  let buy = "";
  let reading = false;
  for (const line of lines) {
    if (/^\|\s*buy\s*=/.test(line)) {
      reading = true;
      buy += `${line.replace(/^\|\s*buy\s*=/, "")}\n`;
      continue;
    }
    if (reading && (/^\|\s*[A-Za-z_]+\s*=/.test(line) || /^\s*\}\}\s*$/.test(line))) break;
    if (reading) buy += `${line}\n`;
  }
  for (const match of buy.matchAll(/\{\{Item\|([^}|]+)(?:\|([^}]*))?\}\}/g)) {
    const amount = match[2]?.match(/(?:^|\|)\s*amount\s*=\s*([\d,]+)/i)?.[1];
    add(match[1], amount);
  }
  return [...merged.values()];
};

/**
 * Resolve every mutation consumed anywhere below one crafting target.
 *
 * The old catalogue only checked the target's immediate recipe. That kept a
 * mutation-crafted intermediate visible but dropped every item made from that
 * intermediate. Walking the same recipe graph used by Crafting makes the
 * planner catalogue complete without maintaining another item list.
 */
export const mutationIngredientsFor = (
  items: ItemIndex,
  targetId: string,
  mutationSet: ReadonlySet<string>
): TargetIngredient[] => {
  const totals = new Map<string, number>();

  const visit = (id: string, required: number, path: ReadonlySet<string>) => {
    if (mutationSet.has(id)) {
      totals.set(id, (totals.get(id) ?? 0) + required);
      return;
    }
    if (path.has(id)) return;

    const item = items[id];
    if (!item?.recipe?.length) return;
    const crafts = Math.ceil(required / Math.max(1, item.yields));
    const nextPath = new Set(path);
    nextPath.add(id);
    for (const ingredient of item.recipe) visit(ingredient.id, ingredient.qty * crafts, nextPath);
  };

  visit(targetId, 1, new Set());
  return [...totals.entries()].map(([id, qty]) => ({
    name: items[id]?.name ?? id.replace(/_/g, " "),
    qty,
    mutation: id,
    crop: null,
  }));
};

export const useTargetCatalogue = (
  mutationIds: string[] = [],
  { enabled = true }: { enabled?: boolean } = {},
) => {
  const { items, loading: recipesLoading } = useRecipes(enabled);
  const [nonCrafted, setNonCrafted] = useState<CatalogueTarget[]>([]);
  const [wikiTiers, setWikiTiers] = useState<WikiTierCache>(() => readTierCache());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const resourceVersion = useSyncExternalStore(
    subscribeItemResource,
    itemResourceVersion,
    itemResourceVersion,
  );

  useEffect(() => {
    if (!enabled) return;
    requestItemResource();
  }, [enabled]);

  const mutationSet = useMemo(() => new Set(mutationIds), [mutationIds]);

  // ---- crafted targets, free from the crafting index --------------------
  const crafted = useMemo(() => {
    if (!mutationSet.size) return [];
    const out: CatalogueTarget[] = [];

    for (const [id, it] of Object.entries(items)) {
      if (!it.recipe) continue;
      if (mutationSet.has(id)) continue;
      const resolvedMutations = mutationIngredientsFor(items, id, mutationSet);
      if (!resolvedMutations.length) continue;

      const usesMutationDirectly = it.recipe.some((ing) => mutationSet.has(ing.id));

      out.push({
        id,
        name: it.name,
        source: "crafting",
        wiki: `${WIKI}/w/${encodeURIComponent(it.name.replace(/ /g, "_"))}`,
        rarity: it.tier,
        hypixelId: it.hypixelId,
        ingredients: usesMutationDirectly
          ? it.recipe.map((ing) => ({
              name: ing.name,
              qty: ing.qty,
              mutation: mutationSet.has(ing.id) ? ing.id : null,
              crop: null,
            }))
          : resolvedMutations,
      });
    }

    return out;
  }, [items, mutationSet]);

  // ---- the handful that are not crafted on a grid -----------------------
  useEffect(() => {
    if (!enabled || !mutationSet.size) return;
    const controller = new AbortController();

    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { at: number; targets: CatalogueTarget[] };
        if (cached.at && Date.now() - cached.at < TTL) {
          setNonCrafted(cached.targets);
          setLoading(false);
          return;
        }
      }
    } catch {
      // Fall through and refetch.
    }

    Promise.all(
      NON_CRAFTED_PAGES.map(async (page): Promise<CatalogueTarget | null> => {
        const url = `${WIKI}/api.php?${new URLSearchParams({
          action: "parse",
          page,
          prop: "wikitext",
          format: "json",
          formatversion: "2",
          origin: "*",
        })}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) return null;
        const json = (await res.json()) as { parse?: { wikitext?: string } };
        const wikitext = json.parse?.wikitext;
        if (!wikitext) return null;

        /*
         * The mechanism, applied where the data enters: a vendor's article
         * never becomes a target, however item-shaped its price list looks.
         */
        if (isNpcPage(wikitext)) return null;

        const ingredients = parseInfoboxIngredients(wikitext).map((ing) => ({
          ...ing,
          mutation: mutationSet.has(slug(ing.name)) ? slug(ing.name) : null,
          crop: null,
        }));

        if (!ingredients.some((i) => i.mutation)) return null;

        return {
          id: slug(page),
          name: page,
          source: "infobox",
          wiki: `${WIKI}/w/${encodeURIComponent(page.replace(/ /g, "_"))}`,
          ingredients,
          rarity: items[slug(page)]?.tier ?? null,
          hypixelId: items[slug(page)]?.hypixelId ?? null,
        };
      })
    )
      .then((results) => {
        if (controller.signal.aborted) return;
        const found = results.filter((r): r is CatalogueTarget => Boolean(r));
        setNonCrafted(found);
        setLoading(false);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), targets: found }));
        } catch {
          // Cache is optional.
        }
      })
      .catch((err: Error) => {
        if (controller.signal.aborted) return;
        setError(err.message);
        setLoading(false);
      });

    return () => controller.abort();
  }, [enabled, items, mutationSet]);

  const targets = useMemo(
    () => {
      void resourceVersion;
      return [...crafted, ...nonCrafted]
        .map((target) => {
          const hypixelId = items[target.id]?.hypixelId ?? target.hypixelId ?? null;
          const resourceTier = resourceTierFor(hypixelId) ?? resourceTierFor(target.name);
          return {
            ...target,
            rarity: items[target.id]?.tier
              ?? target.rarity
              ?? (resourceTier ? resourceTier.toUpperCase() : null)
              ?? wikiTiers.tiers[norm(target.name)]
              ?? null,
            hypixelId,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [crafted, items, nonCrafted, resourceVersion, wikiTiers],
  );

  useEffect(() => {
    if (!enabled || !targets.length) return;
    const fresh = tierCacheFresh(wikiTiers);
    const ask = targets
      .filter((target) => !target.rarity)
      .map((target) => target.name)
      .filter((name) => {
        const known = wikiTiers.tiers[norm(name)];
        return known === undefined || (known === null && !fresh);
      });
    if (!ask.length) return;

    const controller = new AbortController();
    fetchWikiTiers(ask, controller.signal)
      .then((learned) => {
        if (controller.signal.aborted || !Object.keys(learned).length) return;
        setWikiTiers((previous) => {
          const next: WikiTierCache = {
            fetchedAt: Date.now(),
            tiers: { ...previous.tiers, ...learned },
          };
          writeTierCache(next);
          return next;
        });
      })
      .catch(() => {
        // A missing network answer remains visually unknown rather than guessed.
      });

    return () => controller.abort();
  }, [enabled, targets, wikiTiers]);

  /*
   * `items` is handed back rather than kept private because it is the only
   * bridge between a greenhouse mutation id and its Hypixel id, and the planner
   * needs that bridge to read island counts. Calling `useRecipes` a second time
   * up in the page would work, but on a cold cache it is a second fetch of the
   * same few hundred kilobytes for data this hook already has in hand.
   */
  return { targets, items, loading: loading || recipesLoading, error };
};
