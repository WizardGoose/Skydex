import { readCollections } from "../accessories/collections";
import { readProgress } from "../accessories/requirements";
import { RARITY_OFFSET, TIERS } from "../networth/constants";
import { titleCase } from "../networth/helpers";
import { petLevel } from "../networth/petValue";
import {
  collectionSourceGateFor,
  type CollectionSourceGate,
} from "./collectionSourceGate";
import { petItemFallback } from "./petItemMetadata";
import { petStatProfile, type PetAbilityView, type PetStatView } from "./petStats";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const exactCounter = (value: unknown): number | null => {
  const number = typeof value === "number"
    ? value
    : typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(number) && number >= 0 ? number : null;
};

const normalizeId = (value: string): string => value.trim().toUpperCase();
const compactName = (value: string): string => titleCase(value.replace(/^PET_SKIN_/, ""));
const normalizePetSkinName = (value: string, type: string): string => {
  const petType = titleCase(type);
  const start = value.length - petType.length;
  if (start <= 0 || value.slice(start).toLowerCase() !== petType.toLowerCase()) return value;
  return /[\s/-]$/.test(value.slice(0, start)) ? value : `${value.slice(0, start)} ${petType}`;
};

export interface PetPreviewEntry {
  id: string;
  name: string;
  type: string;
  tier: string;
  iconId: string;
  active: boolean;
  level: number | null;
  xp: number | null;
  xpMax: number | null;
  xpPercent: number | null;
  candyUsed: number | null;
  petType: string | null;
  stats: readonly PetStatView[] | null;
  abilities: readonly PetAbilityView[] | null;
  heldItem: { id: string; name: string; tier: string | null } | null;
  skin: { id: string; name: string; tier: string | null } | null;
}

export interface PetsPreviewModel {
  available: boolean;
  entries: readonly PetPreviewEntry[];
  activeId: string | null;
  uniqueTypes: number;
  totalXp: number | null;
  totalCandyUsed: number | null;
  dropped: number;
  partial: boolean;
}

export interface BuildPetsPreviewOptions {
  itemNameFor?: (id: string) => string | null;
  itemTierFor?: (id: string) => string | null;
}

/** Rejoin cached pet identities with the current vendored stat catalogue. */
export const hydratePetsPreviewStats = (model: PetsPreviewModel): PetsPreviewModel => ({
  ...model,
  entries: model.entries.map((entry) => {
    const statProfile = petStatProfile(entry.type, entry.tier, entry.level);
    return {
      ...entry,
      petType: statProfile?.petType ?? null,
      stats: statProfile?.stats ?? null,
      abilities: statProfile?.abilities ?? null,
    };
  }),
});

const PET_TIER_ORDER = new Map(TIERS.map((tier, index) => [tier, index]));

/** Keep Hypixel's pet facts while delegating all level math to the canonical calculator. */
export const buildPetsPreviewModel = (
  rawPets: unknown,
  options: BuildPetsPreviewOptions = {},
): PetsPreviewModel => {
  const unavailable = (partial: boolean): PetsPreviewModel => ({
    available: false,
    entries: [],
    activeId: null,
    uniqueTypes: 0,
    totalXp: null,
    totalCandyUsed: null,
    dropped: 0,
    partial,
  });
  if (rawPets === null || rawPets === undefined) return unavailable(false);
  if (!Array.isArray(rawPets)) return unavailable(true);

  let dropped = 0;
  let malformed = false;
  const entries: PetPreviewEntry[] = [];
  rawPets.forEach((raw, index) => {
    if (!isRecord(raw) || typeof raw.type !== "string" || typeof raw.tier !== "string") {
      dropped += 1;
      return;
    }
    const type = normalizeId(raw.type);
    const tier = normalizeId(raw.tier);
    if (!type || !tier) {
      dropped += 1;
      return;
    }

    const exp = finiteNonNegative(raw.exp);
    const level = exp !== null && tier in RARITY_OFFSET
      ? petLevel({ ...raw, type, tier, exp })
      : null;
    const statProfile = petStatProfile(type, tier, level?.level ?? null);
    const uuid = typeof raw.uuid === "string" && raw.uuid.trim() ? raw.uuid.trim() : null;
    const uniqueId = typeof raw.uniqueId === "string" && raw.uniqueId.trim()
      ? raw.uniqueId.trim()
      : null;
    const heldId = typeof raw.heldItem === "string" && raw.heldItem.trim()
      ? normalizeId(raw.heldItem)
      : null;
    const rawSkin = typeof raw.skin === "string" && raw.skin.trim()
      ? normalizeId(raw.skin)
      : null;
    const skinAssetId = rawSkin === null
      ? null
      : rawSkin.startsWith("PET_SKIN_") ? rawSkin : `PET_SKIN_${rawSkin}`;
    const candyUsed = raw.candyUsed === undefined ? null : finiteNonNegative(raw.candyUsed);
    if (
      exp === null ||
      (raw.active !== undefined && typeof raw.active !== "boolean") ||
      (raw.candyUsed !== undefined && candyUsed === null) ||
      (raw.heldItem !== undefined && raw.heldItem !== null && heldId === null) ||
      (raw.skin !== undefined && raw.skin !== null && rawSkin === null)
    ) malformed = true;

    entries.push({
      id: uuid ?? uniqueId ?? `${type}:${tier}:${index}`,
      name: `${titleCase(type)} Pet`,
      type,
      tier: tier.toLowerCase(),
      iconId: skinAssetId ?? `PET_${type}`,
      active: raw.active === true,
      level: level?.level ?? null,
      xp: exp,
      xpMax: level?.xpMax ?? null,
      xpPercent: level && level.xpMax > 0
        ? Math.min(100, Math.max(0, (level.xp / level.xpMax) * 100))
        : null,
      candyUsed,
      petType: statProfile?.petType ?? null,
      stats: statProfile?.stats ?? null,
      abilities: statProfile?.abilities ?? null,
      heldItem: heldId === null
        ? null
        : {
            id: heldId,
            name: options.itemNameFor?.(heldId) ?? titleCase(heldId.replace(/^PET_ITEM_/, "")),
            tier: options.itemTierFor?.(heldId) ?? petItemFallback(heldId)?.rarity ?? null,
          },
      skin: skinAssetId === null
        ? null
          : {
              id: skinAssetId,
              name: normalizePetSkinName(options.itemNameFor?.(skinAssetId) ?? compactName(skinAssetId), type),
              tier: options.itemTierFor?.(skinAssetId) ?? null,
            },
    });
  });

  entries.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    const rarity = (PET_TIER_ORDER.get(b.tier.toUpperCase()) ?? -1) -
      (PET_TIER_ORDER.get(a.tier.toUpperCase()) ?? -1);
    if (rarity !== 0) return rarity;
    if ((b.level ?? -1) !== (a.level ?? -1)) return (b.level ?? -1) - (a.level ?? -1);
    return a.name.localeCompare(b.name);
  });

  const activeEntries = entries.filter((entry) => entry.active);
  const allXpKnown = entries.every((entry) => entry.xp !== null);
  const allCandyKnown = entries.every((entry) => entry.candyUsed !== null);
  return {
    available: true,
    entries,
    activeId: activeEntries[0]?.id ?? null,
    uniqueTypes: new Set(entries.map((entry) => entry.type)).size,
    totalXp: allXpKnown ? entries.reduce((sum, entry) => sum + (entry.xp ?? 0), 0) : null,
    totalCandyUsed: allCandyKnown
      ? entries.reduce((sum, entry) => sum + (entry.candyUsed ?? 0), 0)
      : null,
    dropped,
    partial: dropped > 0 || malformed || activeEntries.length > 1 ||
      entries.some((entry) => entry.level === null),
  };
};

export interface BestiaryTierDefinition {
  tier: number;
  required: number;
}

export interface BestiaryFamilyDefinition {
  id: string;
  name: string;
  category: string;
  mobIds?: readonly string[];
  iconId?: string;
  iconSrc?: string;
  /** Exact in-game icon for the family location/category. */
  locationIconId?: string;
  locationIconSrc?: string;
  tiers?: readonly BestiaryTierDefinition[];
  /** Exact in-game display colour, not an inferred rarity. */
  gameColor?: string;
  /** Populated only when an upstream source explicitly defines mob rarity. */
  rarity?: string;
  bracket?: number;
  bracketType?: string;
  maxKills?: number;
}

export interface BestiaryPreviewEntry {
  id: string;
  name: string;
  category: string | null;
  iconId: string | null;
  iconSrc: string | null;
  locationIconId: string | null;
  locationIconSrc: string | null;
  gameColor: string | null;
  rarity: string | null;
  bracket: number | null;
  bracketType: string | null;
  maxKills: number | null;
  kills: number;
  tier: number | null;
  maxTier: number | null;
  nextTier: number | null;
  nextRequired: number | null;
  progressPercent: number | null;
}

export interface BestiaryPreviewModel {
  available: boolean;
  entries: readonly BestiaryPreviewEntry[];
  totalKills: number;
  familiesUnlocked: number;
  familiesCompleted: number | null;
  familyTiers: number | null;
  maxFamilyTiers: number | null;
  dropped: number;
  partial: boolean;
}

const definitionMap = <T extends { id: string }>(definitions: readonly T[]): Map<string, T> =>
  new Map(definitions.map((definition) => [normalizeId(definition.id), definition]));

const sortedTiers = <T extends { tier: number; required: number }>(
  tiers: readonly T[] | undefined,
): T[] => (tiers ?? [])
  .filter((tier) => Number.isInteger(tier.tier) && tier.tier >= 0 &&
    Number.isFinite(tier.required) && tier.required >= 0)
  .slice()
  .sort((a, b) => (a.required - b.required) || (a.tier - b.tier));

const bestiaryEntry = (
  id: string,
  kills: number,
  definition: BestiaryFamilyDefinition | null,
): BestiaryPreviewEntry => {
  const tiers = sortedTiers(definition?.tiers);
  const reached = tiers.filter((candidate) => kills >= candidate.required).at(-1) ?? null;
  const next = tiers.find((candidate) => kills < candidate.required) ?? null;
  const currentRequired = reached?.required ?? 0;
  const progressSpan = next ? next.required - currentRequired : 0;
  return {
    id,
    name: definition?.name ?? titleCase(id),
    category: definition?.category ?? null,
    iconId: definition?.iconId?.trim() || null,
    iconSrc: definition?.iconSrc?.trim() || null,
    locationIconId: definition?.locationIconId?.trim() || null,
    locationIconSrc: definition?.locationIconSrc?.trim() || null,
    gameColor: definition?.gameColor?.trim() || null,
    rarity: definition?.rarity?.trim().toLowerCase() || null,
    bracket: Number.isInteger(definition?.bracket) && (definition?.bracket ?? 0) > 0
      ? definition?.bracket ?? null
      : null,
    bracketType: definition?.bracketType?.trim() || null,
    maxKills: Number.isInteger(definition?.maxKills) && (definition?.maxKills ?? 0) > 0
      ? definition?.maxKills ?? null
      : tiers.at(-1)?.required ?? null,
    kills,
    tier: tiers.length > 0 ? reached?.tier ?? 0 : null,
    maxTier: tiers.length > 0 ? Math.max(...tiers.map((tier) => tier.tier)) : null,
    nextTier: next?.tier ?? null,
    nextRequired: next?.required ?? null,
    progressPercent: next && progressSpan > 0
      ? Math.min(100, Math.max(0, ((kills - currentRequired) / progressSpan) * 100))
      : null,
  };
};

/** Raw ids are individual mob variants, so families are combined only from supplied definitions. */
export const buildBestiaryPreviewModel = (
  member: unknown,
  definitions: readonly BestiaryFamilyDefinition[] = [],
): BestiaryPreviewModel => {
  const unavailable = (partial: boolean): BestiaryPreviewModel => ({
    available: false,
    entries: [],
    totalKills: 0,
    familiesUnlocked: 0,
    familiesCompleted: null,
    familyTiers: null,
    maxFamilyTiers: null,
    dropped: 0,
    partial,
  });
  if (!isRecord(member)) return unavailable(false);
  const playerData = isRecord(member.player_data) ? member.player_data : null;
  const bestiary = isRecord(member.bestiary)
    ? member.bestiary
    : isRecord(playerData?.bestiary) ? playerData.bestiary : null;
  if (bestiary === null) return unavailable(false);
  if (!isRecord(bestiary.kills)) return unavailable(true);

  let dropped = 0;
  const rawKills = new Map<string, number>();
  for (const [rawId, rawValue] of Object.entries(bestiary.kills)) {
    const id = normalizeId(rawId);
    const kills = exactCounter(rawValue);
    if (!id || kills === null) {
      dropped += 1;
      continue;
    }
    rawKills.set(id, (rawKills.get(id) ?? 0) + kills);
  }
  const totalKills = [...rawKills.values()].reduce((sum, kills) => sum + kills, 0);
  const entries: BestiaryPreviewEntry[] = [];
  const consumed = new Set<string>();
  const claimed = new Set<string>();
  const familyIds = new Set<string>();

  for (const definition of definitions) {
    const id = normalizeId(definition.id);
    if (!id || familyIds.has(id)) {
      dropped += 1;
      continue;
    }
    familyIds.add(id);
    const mobIds = (definition.mobIds?.length ? definition.mobIds : [definition.id])
      .map(normalizeId)
      .filter(Boolean);
    if (mobIds.length === 0) {
      dropped += 1;
      continue;
    }
    let kills = 0;
    for (const mobId of new Set(mobIds)) {
      if (claimed.has(mobId)) {
        dropped += 1;
        continue;
      }
      claimed.add(mobId);
      if (rawKills.has(mobId)) consumed.add(mobId);
      kills += rawKills.get(mobId) ?? 0;
    }
    entries.push(bestiaryEntry(id, kills, definition));
  }

  for (const [id, kills] of rawKills) {
    if (!consumed.has(id)) entries.push(bestiaryEntry(id, kills, null));
  }

  entries.sort((a, b) => (b.kills - a.kills) || a.name.localeCompare(b.name));
  const allTiersKnown = entries.every((entry) => entry.tier !== null);
  const allMaxTiersKnown = entries.every((entry) => entry.maxTier !== null);
  return {
    available: true,
    entries,
    totalKills,
    familiesUnlocked: entries.filter((entry) => entry.kills > 0).length,
    familiesCompleted: allMaxTiersKnown
      ? entries.filter((entry) => entry.tier === entry.maxTier).length
      : null,
    familyTiers: allTiersKnown
      ? entries.reduce((sum, entry) => sum + (entry.tier ?? 0), 0)
      : null,
    maxFamilyTiers: allMaxTiersKnown
      ? entries.reduce((sum, entry) => sum + (entry.maxTier ?? 0), 0)
      : null,
    dropped,
    partial: dropped > 0 || entries.some((entry) => entry.category === null),
  };
};

export interface CollectionTierDefinition {
  tier: number;
  required: number;
}

export interface CollectionDefinition {
  id: string;
  name: string;
  category: string;
  maxTier?: number;
  tiers?: readonly CollectionTierDefinition[];
}

export interface CollectionPreviewEntry {
  id: string;
  name: string;
  category: string | null;
  amount: number | null;
  unlockedTier: number | null;
  maxTier: number | null;
  isMaxed: boolean | null;
  nextTier: number | null;
  nextRequired: number | null;
  progressPercent: number | null;
  /** Optional only so browser snapshots written before source gates remain readable. */
  sourceGate?: CollectionSourceGate | null;
}

export interface CollectionsPreviewModel {
  available: boolean;
  entries: readonly CollectionPreviewEntry[];
  unlockedCollections: number | null;
  maxedCollections: number | null;
  unlockedTiers: number | null;
  maxTiers: number | null;
  dropped: number;
  partial: boolean;
}

const splitTierId = (value: string): { id: string; tier: number } | null => {
  const match = /^(.*)_(-?\d+)$/.exec(value);
  if (!match || !match[1]) return null;
  const tier = Number(match[2]);
  return Number.isInteger(tier) ? { id: normalizeId(match[1]), tier } : null;
};

/** Parse the keyless official `/v2/resources/skyblock/collections` response. */
export const parseCollectionsResource = (payload: unknown): CollectionDefinition[] | null => {
  if (!isRecord(payload) || !isRecord(payload.collections)) return null;
  const definitions: CollectionDefinition[] = [];
  for (const [categoryId, rawCategory] of Object.entries(payload.collections)) {
    if (!isRecord(rawCategory) || !isRecord(rawCategory.items)) continue;
    const category = typeof rawCategory.name === "string" && rawCategory.name.trim()
      ? rawCategory.name.trim()
      : titleCase(categoryId);
    for (const [rawId, rawItem] of Object.entries(rawCategory.items)) {
      if (!isRecord(rawItem)) continue;
      const id = normalizeId(rawId);
      if (!id) continue;
      const name = typeof rawItem.name === "string" && rawItem.name.trim()
        ? rawItem.name.trim()
        : titleCase(id);
      const tiers: CollectionTierDefinition[] = [];
      if (Array.isArray(rawItem.tiers)) {
        for (const rawTier of rawItem.tiers) {
          if (!isRecord(rawTier)) continue;
          const tier = finiteNonNegative(rawTier.tier);
          const required = finiteNonNegative(rawTier.amountRequired);
          if (tier === null || required === null || !Number.isInteger(tier)) continue;
          tiers.push({ tier, required });
        }
      }
      const explicitMaxTier = finiteNonNegative(rawItem.maxTiers);
      const maxTier = explicitMaxTier !== null && Number.isInteger(explicitMaxTier)
        ? explicitMaxTier
        : tiers.length > 0 ? Math.max(...tiers.map((tier) => tier.tier)) : undefined;
      definitions.push({ id, name, category, maxTier, tiers });
    }
  }
  return definitions.length > 0 ? definitions : null;
};

/** Counts are display values while unlocked tiers come only from Hypixel's evaluated list. */
export const buildCollectionsPreviewModel = (
  member: unknown,
  definitions: readonly CollectionDefinition[] = [],
): CollectionsPreviewModel => {
  const unavailable = (): CollectionsPreviewModel => ({
    available: false,
    entries: [],
    unlockedCollections: null,
    maxedCollections: null,
    unlockedTiers: null,
    maxTiers: null,
    dropped: 0,
    partial: false,
  });
  if (!isRecord(member)) return unavailable();

  const playerData = isRecord(member.player_data) ? member.player_data : null;
  const countsAvailable = isRecord(member.collection);
  const rawTierList = Array.isArray(playerData?.unlocked_coll_tiers)
    ? playerData.unlocked_coll_tiers
    : Array.isArray(member.unlocked_coll_tiers) ? member.unlocked_coll_tiers : null;
  const tiersAvailable = rawTierList !== null;
  if (!countsAvailable && !tiersAvailable) return unavailable();

  const progress = readCollections(member);
  const playerProgress = readProgress(member);
  let dropped = 0;
  if (countsAvailable) {
    for (const [rawId, value] of Object.entries(member.collection as Record<string, unknown>)) {
      if (!normalizeId(rawId) || finiteNonNegative(value) === null) dropped += 1;
    }
  }

  const counts = new Map<string, number>();
  for (const [rawId, amount] of Object.entries(progress.counts)) {
    const id = normalizeId(rawId);
    if (!id) continue;
    if (counts.has(id)) dropped += 1;
    counts.set(id, Math.max(amount, counts.get(id) ?? 0));
  }

  const highestTier = new Map<string, number>();
  for (const rawTier of rawTierList ?? []) {
    if (typeof rawTier !== "string") {
      dropped += 1;
      continue;
    }
    const parsed = splitTierId(rawTier);
    if (!parsed) {
      dropped += 1;
      continue;
    }
    if (parsed.tier < 0) continue;
    highestTier.set(parsed.id, Math.max(parsed.tier, highestTier.get(parsed.id) ?? 0));
  }

  const definitionsById = definitionMap(definitions);
  const ids = new Set<string>([
    ...definitions.map((definition) => normalizeId(definition.id)).filter(Boolean),
    ...counts.keys(),
    ...highestTier.keys(),
  ]);
  const entries: CollectionPreviewEntry[] = [];
  for (const normalizedId of ids) {
    const definition = definitionsById.get(normalizedId) ?? null;
    const tiers = sortedTiers(definition?.tiers);
    const derivedMaxTier = tiers.length > 0 ? Math.max(...tiers.map((tier) => tier.tier)) : null;
    const maxTier = definition?.maxTier !== undefined && Number.isInteger(definition.maxTier) &&
      definition.maxTier >= 0 ? definition.maxTier : derivedMaxTier;
    const amount = countsAvailable ? counts.get(normalizedId) ?? 0 : null;
    const unlockedTier = tiersAvailable ? highestTier.get(normalizedId) ?? 0 : null;
    const next = unlockedTier === null
      ? null
      : tiers.find((candidate) => candidate.tier > unlockedTier) ?? null;
    const id = definition?.id ?? normalizedId;
    entries.push({
      id,
      name: definition?.name ?? titleCase(id),
      category: definition?.category ?? null,
      amount,
      unlockedTier,
      maxTier,
      isMaxed: unlockedTier !== null && maxTier !== null ? unlockedTier >= maxTier : null,
      nextTier: next?.tier ?? null,
      nextRequired: next?.required ?? null,
      progressPercent: next && amount !== null && next.required > 0
        ? Math.min(100, Math.max(0, (amount / next.required) * 100))
        : null,
      sourceGate: collectionSourceGateFor(id, playerProgress),
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));
  const allMaxTiersKnown = entries.every((entry) => entry.maxTier !== null);
  return {
    available: true,
    entries,
    unlockedCollections: tiersAvailable
      ? entries.filter((entry) => (entry.unlockedTier ?? 0) > 0).length
      : null,
    maxedCollections: tiersAvailable && allMaxTiersKnown
      ? entries.filter((entry) => entry.isMaxed).length
      : null,
    unlockedTiers: tiersAvailable
      ? entries.reduce((sum, entry) => sum + (entry.unlockedTier ?? 0), 0)
      : null,
    maxTiers: allMaxTiersKnown
      ? entries.reduce((sum, entry) => sum + (entry.maxTier ?? 0), 0)
      : null,
    dropped,
    partial: dropped > 0 || !countsAvailable || !tiersAvailable ||
      entries.some((entry) => entry.category === null || entry.maxTier === null),
  };
};

export interface ProfilePbcPreviewModels {
  pets: PetsPreviewModel;
  bestiary: BestiaryPreviewModel;
  collections: CollectionsPreviewModel;
}

export interface BuildProfilePbcPreviewModelsInput {
  /** The raw member is consumed here once and must not be retained by the UI. */
  member: unknown;
  /** Already-decoded `pets_data.pets`, normally `parsed.pets` from the same load. */
  pets: unknown;
  petOptions?: BuildPetsPreviewOptions;
  bestiaryDefinitions?: readonly BestiaryFamilyDefinition[];
  collectionDefinitions?: readonly CollectionDefinition[];
}

/** Run this during the authenticated load, cache the models, then discard the raw payload. */
export const buildProfilePbcPreviewModels = (
  input: BuildProfilePbcPreviewModelsInput,
): ProfilePbcPreviewModels => ({
  pets: buildPetsPreviewModel(input.pets, input.petOptions),
  bestiary: buildBestiaryPreviewModel(input.member, input.bestiaryDefinitions),
  collections: buildCollectionsPreviewModel(input.member, input.collectionDefinitions),
});
