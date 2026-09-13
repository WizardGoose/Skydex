export interface PetItemFallback {
  rarity: string;
  effect: string | null;
}

/**
 * Profile pet-item ids that Hypixel currently omits from its public item
 * resource. Keeping this in one projection helper prevents the Gear pet card
 * and the Pets page from disagreeing about the same attached item.
 */
const PET_ITEM_FALLBACKS: Readonly<Record<string, PetItemFallback>> = {
  GREEN_BANDANA: {
    rarity: "epic",
    effect: "§7Grants §a+4 §6☘ Farming Fortune §7for each Garden Level.",
  },
};

export const petItemFallback = (id: string | null | undefined): PetItemFallback | null => {
  const key = (id ?? "").trim().toUpperCase().replace(/^PET_ITEM_/, "");
  return key ? PET_ITEM_FALLBACKS[key] ?? null : null;
};
