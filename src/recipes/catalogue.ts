import type { Item, ItemIndex } from "../items/useItemData";

/**
 * SkyBlock owns this catalogue. A row must be an actual SkyBlock recipe output
 * or an item recognised by Hypixel, never a vanilla grid or wiki placeholder.
 */
export const isSkyBlockCatalogueItem = (
  item: Pick<Item, "vanilla" | "recipe" | "hypixelId">
): boolean => item.vanilla !== true && (item.recipe !== null || item.hypixelId !== null);

/**
 * Keep vanilla items available as named materials while preventing their
 * Minecraft crafting grids from expanding inside a SkyBlock recipe plan.
 */
export const buildSkyBlockPlanningIndex = (items: ItemIndex): ItemIndex => {
  let next: ItemIndex | null = null;

  for (const [id, item] of Object.entries(items)) {
    if (!item.vanilla || !item.recipe) continue;
    if (!next) next = { ...items };
    next[id] = { ...item, recipe: null };
  }

  return next ?? items;
};
