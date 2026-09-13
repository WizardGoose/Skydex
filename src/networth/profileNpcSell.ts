import type { ItemIndex } from "../items/useItemData";
import { stripMinecraftFormatting } from "../ui/itemTooltipModel";
import { categoryLabel } from "./format";
import { npcSellSummary, type NpcCountedItem, type NpcSellSummary, type NpcSellSource } from "./npcSell";
import type { ParsedItems } from "./profileNetworth";
import type { BasicItem, RawItem } from "./types";

const NON_ITEM_CATEGORIES = new Set(["pets", "essence"]);

const finitePositive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

const basicItem = (entry: unknown): NpcCountedItem | null => {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as Partial<BasicItem>;
  const count = finitePositive(value.amount);
  if (typeof value.id !== "string" || !value.id || count === null) return null;
  return { id: value.id, name: value.id, count };
};

const rawItem = (entry: unknown): NpcCountedItem | null => {
  if (!entry || typeof entry !== "object") return null;
  const value = entry as RawItem & { id?: unknown };
  const extraId = value.tag?.ExtraAttributes?.id;
  const id = typeof extraId === "string" && extraId
    ? extraId
    : typeof value.id === "string" && value.id
      ? value.id
      : null;
  const count = finitePositive(value.Count);
  if (!id || count === null) return null;

  const display = value.tag?.display?.Name;
  const name = typeof display === "string" ? stripMinecraftFormatting(display).trim() : "";
  return { id, name: name || id, count };
};

/**
 * Build the NPC-value view from the same decoded profile containers used by
 * live Networth, plus independently captured sources such as island chests or
 * mod fallbacks when the Inventory API is unavailable. This is deliberately
 * separate from market valuation: it counts physical stacks, then applies only
 * Hypixel's published NPC sell prices. Pets
 * and essence are not sellable item stacks and never become guessed zero-value
 * rows.
 */
export const profileNpcSellSummary = (
  parsed: ParsedItems | null,
  itemIndex: ItemIndex,
  supplementalSources: readonly NpcSellSource[] = [],
): NpcSellSummary | null => {
  if (Object.keys(itemIndex).length === 0) return null;
  if (!parsed && supplementalSources.length === 0) return null;

  const sources: NpcSellSource[] = [];
  if (parsed) {
    for (const [category, entries] of Object.entries(parsed)) {
      if (NON_ITEM_CATEGORIES.has(category) || !Array.isArray(entries)) continue;
      const items = entries
        .map((entry) => category === "sacks" ? basicItem(entry) : rawItem(entry))
        .filter((entry): entry is NpcCountedItem => entry !== null);
      if (items.length > 0) sources.push({ label: categoryLabel(category), items });
    }
  }
  sources.push(...supplementalSources.filter((source) => source.items.length > 0));

  const resourceById = new Map<string, { name: string; npcSell: number | null }>();
  for (const item of Object.values(itemIndex)) {
    if (item.hypixelId) resourceById.set(item.hypixelId, { name: item.name, npcSell: item.npcSell });
  }

  return npcSellSummary(
    sources,
    (id) => resourceById.get(id)?.npcSell ?? null,
    (id) => resourceById.get(id)?.name ?? null,
  );
};
