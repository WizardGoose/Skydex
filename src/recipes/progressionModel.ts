import { isPlayerItem } from "../items/itemAvailability";
import type { CheckedRequirement, PlayerProgress } from "../accessories/requirements";
import { checkRequirement, readRequirement } from "../accessories/requirements";
import type { OwnedIndex } from "../inventory";
import type { CollectionPreviewEntry } from "../profile/petsBestiaryCollections";
import {
  resolveCollectionSourceGate,
  type CollectionSourceAccess,
  type CollectionSourceGate,
} from "../profile/collectionSourceGate";
import type { CollectionUnlock, Item, RecipeIngredient } from "../items/useItemData";
import type { ForgeRecipe } from "../items/wikiForge";
import { norm, slug } from "../items/wikiCrafting";

export type RecipeMethodKind = "craft" | "forge";
export type RecipeAccessStatus = "unlocked" | "locked" | "unknown";
export type RecipeMaterialStatus = "ready" | "missing" | "unknown";
export type RecipeGateState = "met" | "unmet" | "unknown";

export interface CollectionProgress {
  id: string;
  name: string;
  amount: number | null;
  unlockedTier: number | null;
  evaluatedTierLagging: boolean;
  sourceGate: CollectionSourceGate | null;
}

export type CollectionProgressIndex = ReadonlyMap<string, CollectionProgress>;

export interface RecipeAccessGate {
  id: string;
  kind: "collection" | "requirement" | "forge";
  label: string;
  detail: string;
  how: string;
  state: RecipeGateState;
  current: number | null;
  target: number | null;
  progressPercent: number | null;
  progressLabel: string | null;
  alternative: boolean;
  sourceAccess?: CollectionSourceAccess | null;
}

export interface RecipeMethod {
  kind: RecipeMethodKind;
  label: string;
  ingredients: readonly RecipeIngredient[];
  yields: number;
  forge: ForgeRecipe | null;
  accessStatus: RecipeAccessStatus;
  accessGates: readonly RecipeAccessGate[];
  materialStatus: RecipeMaterialStatus;
  missingItems: number | null;
  missingTypes: number | null;
}

export interface RecipeBookEntry {
  id: string;
  item: Item;
  methods: readonly RecipeMethod[];
  preferredMethod: RecipeMethod;
  accessStatus: RecipeAccessStatus;
  materialStatus: RecipeMaterialStatus;
  searchText: string;
}

export interface RecipeBookSummary {
  total: number;
  unlocked: number;
  locked: number;
  unknown: number;
  ready: number;
  missing: number;
  holdingsUnknown: number;
}

export const buildCollectionProgressIndex = (
  entries: readonly CollectionPreviewEntry[] | null,
): CollectionProgressIndex | null => {
  if (!entries) return null;
  const index = new Map<string, CollectionProgress>();
  for (const entry of entries) {
    const progress: CollectionProgress = {
      id: entry.id,
      name: entry.name,
      amount: entry.amount,
      unlockedTier: entry.unlockedTier,
      evaluatedTierLagging: entry.amount !== null
        && entry.unlockedTier !== null
        && entry.nextRequired !== null
        && entry.amount >= entry.nextRequired,
      sourceGate: entry.sourceGate ?? null,
    };
    index.set(norm(entry.id), progress);
    index.set(norm(entry.name), progress);
  }
  return index;
};

const collectionGate = (
  unlock: CollectionUnlock,
  collections: CollectionProgressIndex | null,
  alternative: boolean,
  tradingAllowed: boolean | null,
): RecipeAccessGate => {
  const progress = collections?.get(norm(unlock.collection)) ?? null;
  const currentTier = progress?.unlockedTier ?? null;
  const amount = progress?.amount ?? null;
  const tierMet = currentTier !== null && currentTier >= unlock.tier;
  const countMet = amount !== null && amount >= unlock.required;
  const met = tierMet || countMet;
  const evaluatedTierLagging = progress?.evaluatedTierLagging ?? false;
  const state: RecipeGateState = met
    ? "met"
    : currentTier === null || evaluatedTierLagging
      ? "unknown"
      : "unmet";
  const progressCurrent = amount;
  const progressTarget = unlock.required;
  const progressPercent = progressCurrent === null || progressTarget <= 0
    ? null
    : Math.min(100, Math.max(0, (progressCurrent / progressTarget) * 100));
  const remaining = amount === null ? null : Math.max(0, unlock.required - amount);
  const sourceAccess = resolveCollectionSourceGate(progress?.sourceGate, tradingAllowed);
  const detail = state === "unknown"
    ? amount === null
      ? `${unlock.required.toLocaleString()} ${unlock.collection} collection is required; this profile has no collection value.`
      : evaluatedTierLagging
        ? `${amount.toLocaleString()} / ${unlock.required.toLocaleString()} is recorded. Hypixel's evaluated tier list is behind this collection total, so Skydex cannot safely call the recipe locked.`
        : `${amount.toLocaleString()} ${unlock.collection} collection is recorded, but this profile has no evaluated collection tier.`
    : state === "met"
      ? countMet && !tierMet && currentTier !== null
        ? `${amount.toLocaleString()} collected clears the listed ${unlock.required.toLocaleString()} requirement. Hypixel's evaluated tier list has not caught up.`
        : `${unlock.collection} ${unlock.tier} is unlocked${amount === null ? "." : ` at ${amount.toLocaleString()} collected.`}`
      : `${amount?.toLocaleString() ?? "0"} / ${unlock.required.toLocaleString()} collected${remaining === null ? "." : `, ${remaining.toLocaleString()} remaining.`}`;
  const collectionHow = state === "unknown" && evaluatedTierLagging
    ? `Check the in-game Recipe Book. If it is still locked, collect ${remaining?.toLocaleString() ?? "more"} more ${unlock.collection}.`
    : `Collect ${unlock.collection} until collection tier ${unlock.tier}.`;
  const sourceHow = sourceAccess && progress?.sourceGate?.requirement.state !== "met"
    ? sourceAccess.how
    : null;
  return {
    id: `collection:${norm(unlock.collection)}:${unlock.tier}`,
    kind: "collection",
    label: `${unlock.collection} ${unlock.tier}`,
    detail,
    how: [sourceHow, collectionHow].filter(Boolean).join(" "),
    state,
    current: progressCurrent,
    target: progressTarget,
    progressPercent,
    progressLabel: progressCurrent === null
      ? null
      : `${progressCurrent.toLocaleString()} / ${progressTarget.toLocaleString()}`,
    alternative,
    sourceAccess,
  };
};

const requirementGate = (requirement: CheckedRequirement): RecipeAccessGate => {
  const target = Number(requirement.threshold.replace(/[^0-9.-]+/g, ""));
  const current = requirement.have === null ? null : Number(requirement.have.replace(/[^0-9.-]+/g, ""));
  const numericTarget = Number.isFinite(target) ? target : null;
  const numericCurrent = Number.isFinite(current) ? current : null;
  return {
    id: `requirement:${requirement.raw}:${requirement.target}:${requirement.threshold}`,
    kind: "requirement",
    label: [requirement.target, requirement.threshold].filter(Boolean).join(" "),
    detail: requirement.state === "unknown"
      ? "This requirement is listed, but the selected profile cannot verify it yet."
      : requirement.state === "met"
        ? `Profile requirement met${requirement.have ? ` at ${requirement.have}` : ""}.`
        : `Current progress: ${requirement.have ?? "not started"}.`,
    how: requirement.how,
    state: requirement.state,
    current: numericCurrent,
    target: numericTarget,
    progressPercent: numericCurrent === null || numericTarget === null || numericTarget <= 0
      ? null
      : Math.min(100, Math.max(0, (numericCurrent / numericTarget) * 100)),
    progressLabel: numericCurrent === null || numericTarget === null
      ? null
      : `${numericCurrent.toLocaleString()} / ${numericTarget.toLocaleString()}`,
    alternative: false,
  };
};

const forgeGate = (label: string, how: string): RecipeAccessGate => ({
  id: `forge:${norm(label)}`,
  kind: "forge",
  label,
  detail: "The Forge recipe lists this requirement, but the selected profile projection cannot verify it yet.",
  how,
  state: "unknown",
  current: null,
  target: null,
  progressPercent: null,
  progressLabel: null,
  alternative: false,
});

const checkedRequirements = (item: Item, progress: PlayerProgress): CheckedRequirement[] =>
  (item.requirements ?? [])
    .map(readRequirement)
    .filter((requirement): requirement is NonNullable<typeof requirement> => requirement !== null)
    .map((requirement) => checkRequirement(requirement, progress));

const accessForMethod = (
  item: Item,
  kind: RecipeMethodKind,
  forge: ForgeRecipe | null,
  collections: CollectionProgressIndex | null,
  progress: PlayerProgress,
  tradingAllowed: boolean | null,
): { status: RecipeAccessStatus; gates: RecipeAccessGate[] } => {
  const unlockType = kind === "craft" ? "Recipe" : "Dwarven Forge Recipe";
  const unlocks = (item.unlocks ?? []).filter((unlock) => unlock.type === unlockType);
  const alternative = unlocks.length > 1;
  const collectionGates = unlocks.map((unlock) => collectionGate(unlock, collections, alternative, tradingAllowed));
  const requirements = checkedRequirements(item, progress);
  const gates: RecipeAccessGate[] = [
    ...collectionGates,
    ...requirements.map(requirementGate),
  ];

  if (kind === "forge" && forge) {
    const hasHotmRequirement = requirements.some((requirement) => requirement.kind === "heartOfTheMountain");
    if (forge.hotm !== null && !hasHotmRequirement) {
      gates.push(forgeGate(`Heart of the Mountain ${forge.hotm}`, `Reach Heart of the Mountain tier ${forge.hotm}.`));
    }
    const normalizedRequirement = norm(forge.requirement ?? "");
    const requirementCovered = !normalizedRequirement
      || collectionGates.some((gate) => normalizedRequirement.includes(norm(gate.label.split(/\s+\d+$/)[0])))
      || (forge.hotm !== null && /heart of the mountain|hotm/.test(normalizedRequirement));
    if (forge.requirement && !requirementCovered) {
      gates.push(forgeGate(forge.requirement, `Meet the Forge requirement: ${forge.requirement}.`));
    }
  }

  const collectionState: RecipeGateState = collectionGates.length === 0
    ? "met"
    : collectionGates.some((gate) => gate.state === "met")
      ? "met"
      : collectionGates.every((gate) => gate.state === "unmet")
        ? "unmet"
        : "unknown";
  const requiredGates = gates.filter((gate) => !gate.alternative);
  const hasUnmet = collectionState === "unmet" || requiredGates.some((gate) => gate.state === "unmet");
  const hasUnknown = Boolean(item.recipeUnlocksUnknown) || collectionState === "unknown" || requiredGates.some((gate) => gate.state === "unknown");
  return {
    status: hasUnmet ? "locked" : hasUnknown ? "unknown" : "unlocked",
    gates,
  };
};

const materialStatus = (
  ingredients: readonly RecipeIngredient[],
  owned: OwnedIndex,
): { status: RecipeMaterialStatus; missingItems: number | null; missingTypes: number | null } => {
  if (!owned.has) return { status: "unknown", missingItems: null, missingTypes: null };
  let missingItems = 0;
  let missingTypes = 0;
  for (const ingredient of ingredients) {
    const candidates = [ingredient, ...(ingredient.alternatives ?? [])];
    const held = candidates.reduce((sum, candidate) => sum + (owned.count(candidate.id) ?? 0), 0);
    const missing = Math.max(0, ingredient.qty - held);
    if (missing > 0) {
      missingItems += missing;
      missingTypes += 1;
    }
  }
  return {
    status: missingTypes === 0 ? "ready" : "missing",
    missingItems,
    missingTypes,
  };
};

const METHOD_RANK: Record<RecipeAccessStatus, number> = { unlocked: 0, unknown: 2, locked: 3 };
const MATERIAL_RANK: Record<RecipeMaterialStatus, number> = { ready: 0, missing: 1, unknown: 2 };

const preferredMethod = (methods: readonly RecipeMethod[]): RecipeMethod =>
  [...methods].sort((left, right) =>
    METHOD_RANK[left.accessStatus] - METHOD_RANK[right.accessStatus]
    || MATERIAL_RANK[left.materialStatus] - MATERIAL_RANK[right.materialStatus]
    || (left.kind === "craft" ? -1 : 1)
  )[0];

const aggregateAccess = (methods: readonly RecipeMethod[]): RecipeAccessStatus => {
  if (methods.some((method) => method.accessStatus === "unlocked")) return "unlocked";
  if (methods.every((method) => method.accessStatus === "locked")) return "locked";
  return "unknown";
};

const aggregateMaterials = (methods: readonly RecipeMethod[]): RecipeMaterialStatus => {
  if (methods.some((method) => method.materialStatus === "ready")) return "ready";
  if (methods.every((method) => method.materialStatus === "missing")) return "missing";
  return "unknown";
};

export interface BuildRecipeBookInput {
  items: Readonly<Record<string, Item>>;
  sourceItems: Readonly<Record<string, Item>>;
  forgeRecipes: readonly ForgeRecipe[];
  collections: CollectionProgressIndex | null;
  owned: OwnedIndex;
  playerProgress: PlayerProgress;
  tradingAllowed?: boolean | null;
  adminNames?: ReadonlySet<string>;
}

export const buildRecipeBook = ({
  items,
  sourceItems,
  forgeRecipes,
  collections,
  owned,
  playerProgress,
  tradingAllowed = true,
  adminNames,
}: BuildRecipeBookInput): RecipeBookEntry[] => {
  const forgeByName = new Map(forgeRecipes.map((recipe) => [norm(recipe.name), recipe]));
  const entries: RecipeBookEntry[] = [];
  for (const [id, item] of Object.entries(items)) {
    if (item.vanilla || !isPlayerItem(item.name, item.hypixelId, adminNames)) continue;
    const gridRecipe = sourceItems[id]?.recipe ?? null;
    const forge = forgeByName.get(norm(item.name)) ?? null;
    if (!gridRecipe && !forge) continue;
    const methods: RecipeMethod[] = [];
    if (gridRecipe) {
      const access = accessForMethod(item, "craft", null, collections, playerProgress, tradingAllowed);
      const materials = materialStatus(gridRecipe, owned);
      methods.push({
        kind: "craft",
        label: "Crafting",
        ingredients: gridRecipe,
        yields: Math.max(1, item.yields),
        forge: null,
        accessStatus: access.status,
        accessGates: access.gates,
        materialStatus: materials.status,
        missingItems: materials.missingItems,
        missingTypes: materials.missingTypes,
      });
    }
    if (forge) {
      const ingredients = forge.ingredients.map((ingredient) => ({
        id: slug(ingredient.name),
        name: ingredient.name,
        qty: ingredient.qty,
      }));
      const access = accessForMethod(item, "forge", forge, collections, playerProgress, tradingAllowed);
      const materials = materialStatus(ingredients, owned);
      methods.push({
        kind: "forge",
        label: "Forge",
        ingredients,
        yields: 1,
        forge,
        accessStatus: access.status,
        accessGates: access.gates,
        materialStatus: materials.status,
        missingItems: materials.missingItems,
        missingTypes: materials.missingTypes,
      });
    }
    if (methods.length === 0) continue;
    const preferred = preferredMethod(methods);
    entries.push({
      id,
      item,
      methods,
      preferredMethod: preferred,
      accessStatus: aggregateAccess(methods),
      materialStatus: aggregateMaterials(methods),
      searchText: [
        item.name,
        item.hypixelId,
        item.wikiTitle,
        item.category,
        item.tier,
        ...methods.flatMap((method) => [
          method.label,
          method.forge?.section,
          method.forge?.requirement,
          ...method.ingredients.flatMap((ingredient) => [
            ingredient.name,
            ingredient.id,
            ...(ingredient.alternatives ?? []).flatMap((alternative) => [alternative.name, alternative.id]),
          ]),
          ...method.accessGates.flatMap((gate) => [gate.label, gate.detail, gate.how]),
        ]),
      ].filter(Boolean).join(" ").toLowerCase(),
    });
  }
  return entries.sort((left, right) => left.item.name.localeCompare(right.item.name));
};

export const summarizeRecipeBook = (entries: readonly RecipeBookEntry[]): RecipeBookSummary => ({
  total: entries.length,
  unlocked: entries.filter((entry) => entry.accessStatus === "unlocked").length,
  locked: entries.filter((entry) => entry.accessStatus === "locked").length,
  unknown: entries.filter((entry) => entry.accessStatus === "unknown").length,
  ready: entries.filter((entry) => entry.accessStatus === "unlocked" && entry.materialStatus === "ready").length,
  missing: entries.filter((entry) => entry.accessStatus === "unlocked" && entry.materialStatus === "missing").length,
  holdingsUnknown: entries.filter((entry) => entry.accessStatus === "unlocked" && entry.materialStatus === "unknown").length,
});
