import type { ItemIndex } from "../items/useItemData";
import { norm } from "../items/wikiCrafting";
import { isPlayerItem } from "../items/itemAvailability";
import { resourceIdFor, resourceNameFor, resourceTierFor, resourceCategoryFor } from "../items/itemResource";

/** Exact internal/Hypixel identity wins. Never substitute another named variant. */
export function resolveLinkedItem(
  items: ItemIndex,
  params: URLSearchParams,
  adminNames?: ReadonlySet<string>,
): string | null {
  const id = params.get("item");
  const name = params.get("q");
  const entries = Object.entries(items).filter(([, item]) => isPlayerItem(item.name, item.hypixelId, adminNames));
  if (id) {
    const hit = entries.find(([key, item]) => key === id || item.hypixelId?.toUpperCase() === id.toUpperCase());
    if (hit) return hit[0];
    // Some callers hold a name slug rather than a resource ID.
    const alias = entries.find(([key, item]) => norm(key) === norm(id) && (!name || norm(item.name) === norm(name)));
    if (alias) return alias[0];
    return null;
  }
  const matches = name ? entries.filter(([, item]) => norm(item.name) === norm(name)) : [];
  return matches.length === 1 ? matches[0][0] : null;
}

/** Keep a linked, non-craftable item visible even when the crafting index omits it. */
export function includeLinkedItem(items: ItemIndex, params: URLSearchParams): ItemIndex {
  const id = params.get("item");
  const label = params.get("q");
  if (!id || !label || resolveLinkedItem(items, params) || !isPlayerItem(label, id)) return items;
  const hypixelId = resourceIdFor(id);
  const name = resourceNameFor(hypixelId) ?? label;
  if (!isPlayerItem(name, hypixelId)) return items;
  return { ...items, [id]: {
    name, hypixelId, tier: resourceTierFor(hypixelId)?.toUpperCase() ?? null,
    category: resourceCategoryFor(hypixelId), npcSell: null, yields: 1, recipe: null,
  } };
}
