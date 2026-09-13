import { allocateCraftingTree, type AllocationCountSource, type AllocationInventory, type CraftingAllocation } from "../items/craftingAllocation";
import type { Item, ItemIndex } from "../items/useItemData";
import { slug } from "../items/wikiCrafting";
import type { OwnedIndex } from "../inventory";
import type { ParsedItems } from "../networth/profileNetworth";
import { parseCraftedGenerators as parseCraftedGeneratorsBase } from "./craftedGenerators";
import type { CraftedGeneratorProfile } from "./craftedGenerators";

import {
  MINION_CATALOGUE,
  MINION_CATALOGUE_PROVENANCE,
  type MinionCatalogueEntry,
  type MinionCatalogueMaterial,
  type MinionCatalogueTier,
} from "./minionsCatalogue";

export type { CraftedGeneratorProfile } from "./craftedGenerators";

export const parseCraftedGenerators = (member: unknown): CraftedGeneratorProfile =>
  parseCraftedGeneratorsBase(member, MINION_CATALOGUE.map((entry) => entry.id));

export type MinionCompletion = "complete" | "incomplete" | "unavailable";

export interface MinionFamilyProgress {
  family: MinionCatalogueEntry;
  currentTier: number | null;
  maxTier: number;
  tiersRemaining: number | null;
  completion: MinionCompletion;
  remainingTiers: readonly { tier: number; data: MinionCatalogueTier }[];
}

export interface MinionProgressSummary {
  totalFamilies: number;
  craftedFamilies: number | null;
  completedFamilies: number | null;
  available: boolean;
}

export interface MinionMaterialShortage {
  id: string;
  name: string;
  required: number;
  allocated: number;
  remaining: number;
  known: boolean;
}

export interface MinionPlan {
  familyId: string;
  fromTier: number;
  throughTier: number;
  requirements: readonly { tier: number; materials: readonly MinionCatalogueMaterial[] }[];
  allocation: CraftingAllocation;
  shortages: readonly MinionMaterialShortage[];
}

export const minionProgress = (
  profile: CraftedGeneratorProfile,
  catalogue: readonly MinionCatalogueEntry[] = MINION_CATALOGUE
): readonly MinionFamilyProgress[] => catalogue.map((family) => {
  const maxTier = family.tiers.length;
  const recorded = profile.available ? profile.highestByFamily[family.id] ?? 0 : null;
  const currentTier = recorded === null ? null : Math.min(maxTier, Math.max(0, recorded));
  const remainingTiers = currentTier === null ? null : Math.max(0, maxTier - currentTier);
  const completion: MinionCompletion = currentTier === null ? "unavailable" : currentTier >= maxTier ? "complete" : "incomplete";
  return {
    family,
    currentTier,
    maxTier,
    tiersRemaining: remainingTiers,
    completion,
    remainingTiers: currentTier === null ? [] : family.tiers.slice(currentTier).map((data, index) => ({ tier: currentTier + index + 1, data })),
  };
});

export const minionProgressSummary = (progress: readonly MinionFamilyProgress[]): MinionProgressSummary => {
  const available = progress.every((entry) => entry.completion !== "unavailable");
  return {
    totalFamilies: progress.length,
    craftedFamilies: available ? progress.filter((entry) => (entry.currentTier ?? 0) > 0).length : null,
    completedFamilies: available ? progress.filter((entry) => entry.completion === "complete").length : null,
    available,
  };
};

const materialId = (name: string): string => slug(name);

const planItem = (name: string, recipe: Item["recipe"]): Item => ({
  name,
  hypixelId: null,
  tier: null,
  category: "minion-material-plan",
  npcSell: null,
  yields: 1,
  recipe,
});

/**
 * Plan one explicitly selected family. Keeping one family selected at a time
 * is deliberate: a global "upgrade every family" total would silently spend
 * the same held enchanted item twice. The returned ledger is the source of
 * truth for both the path and the residual shortage list.
 */
export const planMinionFamily = (
  entry: MinionFamilyProgress,
  items: ItemIndex,
  inventory: AllocationInventory | null
): MinionPlan | null => {
  if (entry.currentTier === null || entry.tiersRemaining === 0) return null;
  const requirements = entry.remainingTiers.map(({ tier, data }) => ({ tier, materials: data.materials }));
  const recipe = requirements.flatMap(({ materials }) => materials.filter((material) => material.amount > 0).map((material) => ({
    id: materialId(material.name),
    name: material.name,
    qty: material.amount,
  })));
  const syntheticId = `__minion_plan_${entry.family.id}`;
  const planItems: ItemIndex = {
    ...items,
    [syntheticId]: planItem(`${entry.family.name} minion upgrade plan`, recipe),
  };
  const allocation = allocateCraftingTree(syntheticId, 1, planItems, inventory ?? {});
  return {
    familyId: entry.family.id,
    fromTier: entry.currentTier + 1,
    throughTier: entry.maxTier,
    requirements,
    allocation,
    shortages: allocation.remaining,
  };
};

/** The holdings sources available to the selected-family material planner. */
export interface MinionHoldings {
  inventory: AllocationCountSource;
  /** True when at least one source can answer counts; false means unavailable, not zero. */
  known: boolean;
  /** Short provenance labels for the UI. */
  labels: readonly string[];
  /** True when the keyed profile exposed its item containers. */
  apiVisible: boolean;
}

const MINION_API_CATEGORIES = ["inventory", "enderchest", "storage", "sacks"] as const;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const rawApiItem = (value: unknown): { id: string; count: number } | null => {
  const entry = record(value);
  if (!entry) return null;
  const basicId = typeof entry.id === "string" ? entry.id : null;
  const basicAmount = typeof entry.amount === "number" ? entry.amount : null;
  if (basicId && basicAmount !== null && Number.isFinite(basicAmount) && basicAmount > 0) {
    return { id: basicId, count: basicAmount };
  }
  const tag = record(entry.tag);
  const extra = record(tag?.ExtraAttributes);
  const rawId = typeof extra?.id === "string" ? extra.id : null;
  if (!rawId) return null;
  const count = typeof entry.Count === "number" && Number.isFinite(entry.Count) ? entry.Count : 1;
  return count > 0 ? { id: rawId, count } : null;
};

/**
 * Merge mod-captured holdings with API-visible inventory/sacks/storage.
 *
 * The mod view wins per item when it has a count, so a profile pulled from the
 * API and a matching mod snapshot cannot silently double the same stack. API
 * data fills the gaps for items the mod has not captured. When the inventory API
 * toggle is private, the API half stays unknown rather than manufacturing zeros.
 */
export const buildMinionHoldings = (
  items: ItemIndex,
  owned: OwnedIndex | null,
  parsed: ParsedItems | null,
  inventoryShared: boolean
): MinionHoldings => {
  const byHypixel = new Map<string, string>();
  for (const [id, item] of Object.entries(items)) {
    if (item.hypixelId) byHypixel.set(item.hypixelId.toLowerCase(), id);
  }

  const apiCounts = new Map<string, Map<string, number>>();
  const apiVisible = parsed !== null && inventoryShared;
  if (apiVisible) {
    for (const category of MINION_API_CATEGORIES) {
      const counts = new Map<string, number>();
      apiCounts.set(category, counts);
      for (const entry of parsed[category] ?? []) {
        const parsedEntry = rawApiItem(entry);
        if (!parsedEntry) continue;
        const id = items[parsedEntry.id]
          ? parsedEntry.id
          : byHypixel.get(parsedEntry.id.toLowerCase()) ?? slug(parsedEntry.id);
        counts.set(id, (counts.get(id) ?? 0) + parsedEntry.count);
      }
    }
  }

  const sourceForCategory: Record<string, string> = {
    inventory: "island.inventory",
    enderchest: "island.enderChest",
    storage: "island.storage",
    sacks: "island.sacks",
  };
  const inventory: AllocationCountSource = {
    count: (id: string) => {
      const captured = owned?.count(id);
      const entry = owned?.get(id);
      // A manual value is an explicit replacement and outranks every feed.
      if (entry?.overridden && typeof captured === "number") return captured;
      // Keep simple test/detached readers honest when they expose count()
      // without the richer get() provenance.
      if (typeof captured === "number" && !entry) return captured;
      let total = typeof captured === "number" ? captured : 0;
      let known = typeof captured === "number";
      for (const category of MINION_API_CATEGORIES) {
        if (!apiVisible) break;
        const source = sourceForCategory[category];
        if (entry?.sources.some((itemSource) => itemSource.source === source)) continue;
        total += apiCounts.get(category)?.get(id) ?? 0;
        known = true;
      }
      return known || apiVisible ? total : undefined;
    },
  };
  const labels = [
    ...(owned?.sources ?? []).map((source) => source.replace(/^island\./, "")),
    ...(apiVisible ? ["Hypixel API"] : []),
  ];
  return { inventory, known: Boolean(owned?.has || apiVisible), labels: [...new Set(labels)], apiVisible };
};

export { MINION_CATALOGUE, MINION_CATALOGUE_PROVENANCE };