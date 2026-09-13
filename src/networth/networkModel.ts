import type { SectionProvenance } from "../island/merge";
import { CATEGORY_ORDER, categoryLabel } from "./format";
import type { Coverage } from "./useNetworth";
import type { CategoryResult, NetworthResult, ValuedItem } from "./types";

export type NetworkCategoryState = "available" | "empty" | "private" | "unavailable";

export interface NetworkCategoryIcon {
  name: string;
  id: string;
}

export interface NetworkCategoryView {
  key: string;
  label: string;
  icon: NetworkCategoryIcon;
  source: "api" | "mod";
  state: NetworkCategoryState;
  total: number | null;
  itemCount: number;
  items: readonly ValuedItem[];
}

/**
 * Category chrome is global metadata, not profile data. These are the same
 * Minecraft objects used by the Profile Inventory selector wherever a source
 * does not provide an item to use as the heading glyph.
 */
export const NETWORK_CATEGORY_ICONS: Readonly<Record<string, NetworkCategoryIcon>> = {
  island_chests: { name: "Chest", id: "CHEST" },
  inventory: { name: "SkyBlock Menu", id: "NETHER_STAR" },
  enderchest: { name: "Ender Chest", id: "ENDER_CHEST" },
  storage: { name: "Jumbo Backpack", id: "JUMBO_BACKPACK" },
  accessories: { name: "Talisman", id: "TALISMAN" },
  armor: { name: "Diamond Chestplate", id: "DIAMOND_CHESTPLATE" },
  equipment: { name: "Necklace", id: "POWER_WITHER_CLOAK" },
  wardrobe: { name: "Diamond Chestplate", id: "DIAMOND_CHESTPLATE" },
  pets: { name: "Wolf", id: "WOLF" },
  sacks: { name: "Large Mining Sack", id: "LARGE_MINING_SACK" },
  essence: { name: "Wither Essence", id: "WITHER_ESSENCE" },
  // "Museum" resolves to a wiki article screenshot, not an item texture.
  museum: { name: "Painting", id: "PAINTING" },
  personal_vault: { name: "Personal Bank Item", id: "PERSONAL_BANK_ITEM" },
  fishing_bag: { name: "Fishing Sack", id: "FISHING_SACK" },
  potion_bag: { name: "Potion Bag", id: "POTION_BAG" },
  sacks_bag: { name: "Large Mining Sack", id: "LARGE_MINING_SACK" },
  quiver: { name: "Quiver", id: "QUIVER" },
  candy_inventory: { name: "Candy", id: "CANDY" },
  carnival_mask_inventory: { name: "Carnival Mask", id: "CARNIVAL_MASK" },
  farming_toolkit: { name: "Farming Toolkit", id: "FARMING_TOOLKIT" },
  hunting_toolkit: { name: "Hunting Toolkit", id: "HUNTING_TOOLKIT" },
};
const INVENTORY_DEPENDENT = new Set([
  "inventory",
  "enderchest",
  "storage",
  "accessories",
  "armor",
  "equipment",
  "wardrobe",
  "pets",
  "sacks",
  "essence",
  "fishing_bag",
  "potion_bag",
  "sacks_bag",
  "quiver",
  "candy_inventory",
  "carnival_mask_inventory",
  "farming_toolkit",
  "hunting_toolkit",
]);

const resultState = (result: CategoryResult | undefined): NetworkCategoryState => {
  if (!result) return "unavailable";
  return result.total > 0 || result.items.length > 0 ? "available" : "empty";
};

const stateFor = (
  key: string,
  result: CategoryResult | undefined,
  coverage: Coverage | null,
  chestProvenance: SectionProvenance
): NetworkCategoryState => {
  if (key === "island_chests") {
    if (chestProvenance.state !== "captured" && chestProvenance.state !== "empty") return "unavailable";
    return resultState(result);
  }
  if (key === "museum" && coverage?.museumShared === false) return "private";
  if (key === "personal_vault" && coverage?.vaultShared === false) return "private";
  if (INVENTORY_DEPENDENT.has(key) && coverage?.inventoryShared === false) return "private";
  return resultState(result);
};

/**
 * Convert the calculator's raw category map into display state once. A panel
 * can therefore say "private", "unavailable", "empty", or show a real total
 * without guessing from an empty item array.
 */
export const buildNetworkCategories = (
  result: NetworthResult,
  coverage: Coverage | null,
  chestProvenance: SectionProvenance
): NetworkCategoryView[] => {
  const keys = [...CATEGORY_ORDER, ...Object.keys(result.types).filter((key) => !CATEGORY_ORDER.includes(key))];
  return keys.map((key) => {
    const category = result.types[key];
    const state = stateFor(key, category, coverage, chestProvenance);
    return {
      key,
      label: categoryLabel(key),
      icon: NETWORK_CATEGORY_ICONS[key] ?? { name: categoryLabel(key), id: key },
      source: key === "island_chests" ? "mod" : "api",
      state,
      total: state === "private" || state === "unavailable" ? null : category?.total ?? 0,
      itemCount: category?.items.length ?? 0,
      items: category?.items ?? [],
    };
  });
};

export const networkCategoryStatusLabel = (category: NetworkCategoryView): string => {
  if (category.state === "private") return "Private";
  if (category.state === "unavailable") return "Unavailable";
  if (category.state === "empty") return "Empty";
  return `${category.itemCount.toLocaleString()} item${category.itemCount === 1 ? "" : "s"}`;
};
