import type { Item, ItemIndex } from "../items/useItemData";
import { norm, slug } from "../items/wikiCrafting";
import { MINION_CATALOGUE, type MinionCatalogueEntry } from "../profile/minionsCatalogue";
import { minionTierMaterials } from "../profile-view/profile-sections/minionTierLadder";
import { resourceIdFor, resourceTierFor } from "../items/itemResource";
const MINION_TIERS = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

export const minionItemName = (family: Pick<MinionCatalogueEntry, "wikiTitle">, tier: number): string =>
  `${family.wikiTitle} ${MINION_TIERS[tier] ?? tier}`;

export function findMinionTier(name: string) {
  for (const family of MINION_CATALOGUE) {
    const index = family.tiers.findIndex((_, i) => norm(minionItemName(family, i + 1)) === norm(name));
    if (index >= 0) return { family, tier: index + 1, data: family.tiers[index] };
  }
  return null;
}

/** The same bundled tier costs used by Profile, including the centre input. */
export function includeMinionItems(source: ItemIndex): ItemIndex {
  const items = { ...source };
  const byName = new Map(Object.entries(source).map(([id, item]) => [norm(item.name), id]));
  const itemId = (name: string) => byName.get(norm(name)) ?? slug(name);
  const ensure = (name: string, wikiTitle?: string): Item => {
    const id = itemId(name);
    return items[id] ??= { name, wikiTitle, hypixelId: null, tier: null, category: null, npcSell: null, yields: 1, recipe: null };
  };
  for (const family of MINION_CATALOGUE) {
    family.tiers.forEach((data, index) => {
      const name = minionItemName(family, index + 1);
      const original = ensure(name, family.wikiTitle);
      const materials = [...minionTierMaterials(data)];
      const exchange = data.npc !== null || materials.some(material => material.name.toLowerCase() === "coin");
      if (index > 0 && materials.length && !materials.some(material => / minion [IVX]+$/i.test(material.name))) {
        materials.push({ name: minionItemName(family, index), amount: 1, kind: "requirement" });
      }
      for (const material of materials) ensure(material.name);
      items[itemId(name)] = {
        ...original,
        category: original.category ?? "MINION",
        hypixelId: original.hypixelId ?? resourceIdFor(name),
        tier: original.tier ?? resourceTierFor(name)?.toUpperCase() ?? null,
        recipeUnlocksUnknown: original.recipeUnlocksUnknown ?? (!original.recipe && !original.unlocks?.length),
        // Exchanges and acquisition-only first tiers never become free crafts.
        recipe: original.recipe ?? (!exchange && materials.length ? materials.map(material => ({
          id: itemId(material.name), name: material.name, qty: material.amount,
        })) : null),
      };
    });
    for (const [name, materials] of Object.entries(family.recipes)) {
      const original = ensure(name);
      for (const material of materials) ensure(material.name);
      if (!original.recipe && materials.length) items[itemId(name)] = {
        ...original, recipe: materials.map(material => ({ id: itemId(material.name), name: material.name, qty: material.amount })),
      };
    }
  }
  return items;
}
