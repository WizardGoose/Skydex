export type WardrobeKind = "armour" | "equipment";

export interface WardrobeSlotPresentation {
  id: string;
  label: string;
}

const ARMOUR_SLOTS: readonly WardrobeSlotPresentation[] = [
  { id: "helmet", label: "Helmet" },
  { id: "chestplate", label: "Chestplate" },
  { id: "leggings", label: "Leggings" },
  { id: "boots", label: "Boots" },
];

/*
 * Hypixel's profile API preserves these as EQUIPMENT_SLOT_1..4. The SkyBlock
 * Wiki names their in-game categories Necklace, Cloak, Belt, and Gloves or
 * Bracelets, in that order; the fourth slot accepts either item category.
 */
const EQUIPMENT_SLOTS: readonly WardrobeSlotPresentation[] = [
  { id: "necklace", label: "Necklace" },
  { id: "cloak", label: "Cloak" },
  { id: "belt", label: "Belt" },
  { id: "gloves-or-bracelets", label: "Gloves or Bracelets" },
];

const WARDROBE_PAGE_SIZE = 9;
const WARDROBE_PAGE_COUNT = 3;

export interface WardrobePresentation {
  capacity: number;
  pages: readonly string[];
  slots: readonly WardrobeSlotPresentation[];
}

/** The two wardrobes share the in-game nine-set page structure and capacity. */
export const wardrobePresentation = (kind: WardrobeKind): WardrobePresentation => ({
  capacity: WARDROBE_PAGE_SIZE * WARDROBE_PAGE_COUNT,
  pages: Array.from({ length: WARDROBE_PAGE_COUNT }, (_, index) => `Page ${index + 1}`),
  slots: kind === "armour" ? ARMOUR_SLOTS : EQUIPMENT_SLOTS,
});
