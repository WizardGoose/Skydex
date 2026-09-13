import type { MinionFamilyProgress } from "../../profile/minions";
import type { MinionCatalogueMaterial, MinionCatalogueTier } from "../../profile/minionsCatalogue";

export type MinionTierState = "crafted" | "missing" | "unavailable";
export type MinionTierRequirementState = "known" | "unavailable" | "not-applicable";

export interface MinionTierLadderEntry {
  tier: number;
  data: MinionCatalogueTier;
  state: MinionTierState;
  requirementState: MinionTierRequirementState;
  materials: readonly MinionCatalogueMaterial[];
}

export interface MinionMaterialTotal extends MinionCatalogueMaterial {
  tiers: readonly number[];
}

const provenMaterials = (materials: readonly MinionCatalogueMaterial[]): readonly MinionCatalogueMaterial[] => (
  materials.filter((material) => (
    material.name.trim().length > 0
    && Number.isFinite(material.amount)
    && material.amount > 0
  ))
);

const materialKey = (material: MinionCatalogueMaterial): string => (
  `${material.kind ?? "material"}:${material.name.trim().toLowerCase()}`
);

const combineMaterials = (
  materials: readonly MinionCatalogueMaterial[],
): readonly MinionCatalogueMaterial[] => {
  const combined = new Map<string, MinionCatalogueMaterial>();
  for (const material of materials) {
    const key = materialKey(material);
    const current = combined.get(key);
    combined.set(key, current
      ? { ...current, amount: current.amount + material.amount }
      : { ...material });
  }
  return [...combined.values()];
};

/**
 * The bundled Wiki module records ordinary crafting costs per surrounding
 * slot. A normal Minion recipe uses all eight surrounding slots, while the
 * centre tool/Minion and NPC exchange rows are already complete quantities.
 * A Coin row also proves an exchange because the Wiki snapshot's few
 * multi-NPC exchanges cannot be represented by the catalogue's string field.
 */
export const minionTierMaterials = (
  tier: MinionCatalogueTier,
): readonly MinionCatalogueMaterial[] => {
  const materials = provenMaterials(tier.materials);
  const exchange = tier.npc !== null || materials.some((material) => material.name.trim().toLowerCase() === "coin");
  return combineMaterials(
    materials.map((material) => (
      !exchange && material.kind !== "requirement"
      ? { ...material, amount: material.amount * 8 }
      : material
    )),
  );
};

export const minionRemainingMaterialTotals = (
  tiers: readonly MinionTierLadderEntry[],
): readonly MinionMaterialTotal[] => {
  const totals = new Map<string, MinionMaterialTotal>();
  for (const tier of tiers) {
    if (tier.requirementState !== "known") continue;
    for (const material of tier.materials) {
      const key = materialKey(material);
      const current = totals.get(key);
      totals.set(key, current
        ? {
            ...current,
            amount: current.amount + material.amount,
            tiers: [...current.tiers, tier.tier],
          }
        : { ...material, tiers: [tier.tier] });
    }
  }
  return [...totals.values()];
};

/**
 * Project one selected family into the complete catalogue order.
 *
 * The profile proves the highest crafted tier, while the bundled catalogue
 * proves each tier's incremental requirement. A missing or zero-only material
 * list stays unavailable rather than becoming a false "free upgrade" claim.
 */
export const buildMinionTierLadder = (
  entry: MinionFamilyProgress,
): readonly MinionTierLadderEntry[] => entry.family.tiers.map((data, index) => {
  const tier = index + 1;
  const state: MinionTierState = entry.currentTier === null
    ? "unavailable"
    : tier <= entry.currentTier ? "crafted" : "missing";
  const materials = minionTierMaterials(data);
  const requirementState: MinionTierRequirementState = state === "crafted"
    ? "not-applicable"
    : state === "missing" && materials.length > 0 ? "known" : "unavailable";
  return { tier, data, state, requirementState, materials };
});

export const initialMinionTierDisclosure = (
  entry: MinionFamilyProgress,
): number | null => buildMinionTierLadder(entry).find((tier) => tier.state === "missing")?.tier ?? null;
