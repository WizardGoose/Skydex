import { modifierLabel } from "../../networth/format";
import type { NpcSellRow, NpcSellSummary } from "../../networth/npcSell";
import type { ValuedItem } from "../../networth/types";
import { itemLabel, romanLevel } from "../../ui/itemTooltipModel";

export interface NpcCategoryItem {
  row: NpcSellRow;
  count: number;
  total: number;
}

export interface NpcCategory {
  key: string;
  label: string;
  total: number;
  items: readonly NpcCategoryItem[];
}

/** Keep the official resource lookup on the raw Hypixel item id, never a valuation price key. */
export const networthItemIconId = (item: ValuedItem): string => {
  if (!item.isPet || !item.petData) return item.id.trim() || item.customId.trim();
  const skin = item.petData.skin;
  if (skin) return skin.startsWith("PET_SKIN_") ? skin : `PET_SKIN_${skin}`;
  return `PET_${item.petData.type}`;
};

/** Wiki/resource lookups need the pet's real name, not its valuation label. */
export const networthItemIconName = (item: ValuedItem): string => {
  if (!item.isPet || !item.petData) return item.name;
  const type = item.petData.type
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${type} Pet`;
};

/** The skin is expressed by the texture itself; repeating it in the label is noise. */
export const networthItemDisplayName = (item: ValuedItem): string =>
  item.name.replace(/\s*\(skinned\)\s*/gi, " ").replace(/\s+/g, " ").trim();

/** Turn the price service's enchant id into the name and level players see in-game. */
export const enchantmentDisplayName = (id: string): string => {
  const match = id.trim().match(/^(.*)_(\d+)$/);
  if (!match) return itemLabel(id);
  return `${itemLabel(match[1])} ${romanLevel(Number(match[2]))}`;
};

const isEnchantmentCalculation = (type: string): boolean =>
  type === "ENCHANT" || type === "ENCHANTMENT" || type === "ENCHANTMENT_UPGRADE";

export const marketBreakdown = (item: ValuedItem): readonly { key: string; label: string; detail: string; value: number }[] => [
  { key: "base", label: "Base item", detail: item.count > 1 ? `${item.count.toLocaleString()} in stack` : "Item price", value: item.basePrice },
  ...item.calculation.map((entry, index) => ({
    key: `${entry.type}-${entry.id}-${index}`,
    label: modifierLabel(entry.type),
    detail: [
      isEnchantmentCalculation(entry.type) ? enchantmentDisplayName(entry.id) : null,
      entry.type === "PET_ITEM" ? modifierLabel(entry.id.replace(/^PET_ITEM_/, "")) : null,
      entry.star ? `Star ${entry.star}` : null,
      entry.count > 1 ? `×${entry.count.toLocaleString()}` : null,
    ].filter(Boolean).join(" · ") || entry.id,
    value: entry.price,
  })),
];

export const buildNpcNetworthCategories = (summary: NpcSellSummary): readonly NpcCategory[] => {
  const categories = new Map<string, NpcCategoryItem[]>();
  for (const row of summary.rows) {
    for (const source of row.sources) {
      const label = source.label.trim() || "Unknown source";
      const items = categories.get(label) ?? [];
      items.push({ row, count: source.count, total: row.unit * source.count });
      categories.set(label, items);
    }
  }
  return [...categories].map(([label, items]) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    label,
    total: items.reduce((sum, item) => sum + item.total, 0),
    items: [...items].sort((left, right) => right.total - left.total || left.row.name.localeCompare(right.row.name)),
  })).sort((left, right) => right.total - left.total || left.label.localeCompare(right.label));
};
