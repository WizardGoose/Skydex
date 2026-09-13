import { headUrl } from "../island/heads";
import type {
  BestiaryFamilyDefinition,
  BestiaryTierDefinition,
} from "./petsBestiaryCollections";

/**
 * Current Bestiary families and bracket ladders from NotEnoughUpdates.
 *
 * Hypixel does not publish a Bestiary resource, while NEU maintains the same
 * family groupings, display colours, mob heads, caps, and brackets used by
 * current profile viewers. The catalogue is fetched and cached by the
 * visitor's browser; no NEU data is bundled into Skydex. Provenance is kept in
 * NOTICE.md.
 */
export const NEU_BESTIARY_URL =
  "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/bestiary.json";

export const BESTIARY_CACHE_KEY = "skydex.bestiary.neu.v1";
export const BESTIARY_CACHE_TTL = 24 * 60 * 60 * 1000;

const TIMEOUT_MS = 10_000;

/**
 * Current Hypixel counter ids that belong to an existing NEU family but are
 * absent from that family's variant list. Keep these exact and evidence-led:
 * a loose name match could silently move kills between unrelated families.
 */
const API_MOB_ALIASES: Readonly<Record<string, string>> = {
  COW_1: "FARMING_COW_1",
  EMERALD_SLIME_15: "EMERALD_SLIME_5",
  ZEALOT_SPECIAL_ENDERMAN_55: "ZEALOT_ENDERMAN_55",
};

const MINECRAFT_COLORS: Readonly<Record<string, string>> = {
  "0": "#000000",
  "1": "#0000aa",
  "2": "#00aa00",
  "3": "#00aaaa",
  "4": "#aa0000",
  "5": "#aa00aa",
  "6": "#ffaa00",
  "7": "#aaaaaa",
  "8": "#555555",
  "9": "#5555ff",
  a: "#55ff55",
  b: "#55ffff",
  c: "#ff5555",
  d: "#ff55ff",
  e: "#ffff55",
  f: "#ffffff",
};

interface CachedBestiaryResource {
  fetchedAt: number;
  payload: unknown;
}

let cached: readonly BestiaryFamilyDefinition[] | null = null;
let inFlight: Promise<readonly BestiaryFamilyDefinition[]> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const positiveInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

const normalizeId = (value: string): string => value.trim().toUpperCase();

const plainMinecraftText = (value: string): string => value.replace(/§[0-9A-FK-OR]/gi, "").trim();

const minecraftTextColor = (value: string): string | null => {
  const match = /§([0-9a-f])/i.exec(value);
  return match ? MINECRAFT_COLORS[match[1].toLowerCase()] ?? null : null;
};

/** Extract one exact Mojang texture hash from NEU's signed property value. */
export const parseBestiaryTextureHash = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const encoded = /^[A-Za-z0-9+/=]+/.exec(value.trim())?.[0]?.replace(/=+$/, "");
  if (!encoded) return null;

  try {
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const decoded = atob(padded);
    return /textures\.minecraft\.net\/texture\/([0-9a-f]{32,64})/i
      .exec(decoded)?.[1]?.toLowerCase() ?? null;
  } catch {
    return null;
  }
};

const readThresholds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(positiveInteger).filter((entry): entry is number => entry !== null))]
    .sort((a, b) => a - b);
};

const tierLadder = (thresholds: readonly number[], cap: number): BestiaryTierDefinition[] => {
  const capped = thresholds.filter((threshold) => threshold <= cap);
  if (!capped.includes(cap)) capped.push(cap);
  return capped.map((required, index) => ({ tier: index + 1, required }));
};

interface BestiaryLocationIcon {
  locationIconId?: string;
  locationIconSrc?: string;
}

const locationIcon = (value: unknown): BestiaryLocationIcon => {
  if (!isRecord(value)) return {};
  const textureHash = parseBestiaryTextureHash(value.texture);
  const rawItem = typeof value.item === "string" ? normalizeId(value.item) : null;
  return {
    locationIconId: rawItem || undefined,
    locationIconSrc: textureHash ? headUrl(textureHash) ?? undefined : undefined,
  };
};

const withApiMobAliases = (mobIds: readonly string[]): string[] => {
  const known = new Set(mobIds);
  for (const [alias, familyVariant] of Object.entries(API_MOB_ALIASES)) {
    if (known.has(familyVariant)) known.add(alias);
  }
  return [...known];
};

const familyDefinitions = (
  rawCategory: Record<string, unknown>,
  category: string,
  categoryIcon: BestiaryLocationIcon,
  brackets: Record<string, unknown>,
  bracketSets: Record<string, unknown>,
): BestiaryFamilyDefinition[] => {
  if (!Array.isArray(rawCategory.mobs)) return [];
  const definitions: BestiaryFamilyDefinition[] = [];

  for (const rawFamily of rawCategory.mobs) {
    if (!isRecord(rawFamily) || !Array.isArray(rawFamily.mobs)) continue;
    const mobIds = withApiMobAliases([...new Set(rawFamily.mobs
      .filter((value): value is string => typeof value === "string")
      .map(normalizeId)
      .filter(Boolean))]);
    if (mobIds.length === 0) continue;

    const cap = positiveInteger(rawFamily.cap);
    const bracket = positiveInteger(rawFamily.bracket);
    if (cap === null || bracket === null) continue;

    const bracketType = typeof rawFamily.bracketType === "string" && rawFamily.bracketType.trim()
      ? rawFamily.bracketType.trim().toUpperCase()
      : null;
    const selectedBracketSet = bracketType && isRecord(bracketSets[bracketType])
      ? bracketSets[bracketType] as Record<string, unknown>
      : brackets;
    const thresholds = readThresholds(selectedBracketSet[String(bracket)]);
    if (thresholds.length === 0) continue;

    const formattedName = typeof rawFamily.name === "string" ? rawFamily.name : mobIds[0];
    const name = plainMinecraftText(formattedName) || mobIds[0];
    const textureHash = parseBestiaryTextureHash(rawFamily.texture);
    const rawItem = typeof rawFamily.item === "string" ? normalizeId(rawFamily.item) : null;

    definitions.push({
      id: mobIds[0],
      name,
      category,
      mobIds,
      iconId: rawItem || mobIds[0],
      iconSrc: textureHash ? headUrl(textureHash) ?? undefined : undefined,
      ...categoryIcon,
      tiers: tierLadder(thresholds, cap),
      bracket,
      bracketType: bracketType ?? undefined,
      maxKills: cap,
      gameColor: minecraftTextColor(formattedName) ?? undefined,
    });
  }

  return definitions;
};

/** Parse NEU's current Bestiary resource into the narrow facts Skydex renders. */
export const parseBestiaryResource = (payload: unknown): BestiaryFamilyDefinition[] | null => {
  if (!isRecord(payload) || !isRecord(payload.brackets)) return null;
  const brackets = payload.brackets;
  const bracketSets = isRecord(payload.bracketSets) ? payload.bracketSets : {};
  const definitions: BestiaryFamilyDefinition[] = [];
  const ids = new Set<string>();

  const append = (category: Record<string, unknown>, fallbackName: string): void => {
    const categoryName = typeof category.name === "string" && category.name.trim()
      ? plainMinecraftText(category.name)
      : fallbackName;
    const categoryIcon = locationIcon(category.icon);
    for (const definition of familyDefinitions(category, categoryName, categoryIcon, brackets, bracketSets)) {
      if (ids.has(definition.id)) continue;
      ids.add(definition.id);
      definitions.push(definition);
    }
  };

  for (const [categoryId, rawCategory] of Object.entries(payload)) {
    if (categoryId === "brackets" || categoryId === "bracketSets" || !isRecord(rawCategory)) continue;
    if (rawCategory.hasSubcategories === true) {
      for (const [subcategoryId, rawSubcategory] of Object.entries(rawCategory)) {
        if (["name", "icon", "hasSubcategories", "mobs"].includes(subcategoryId) || !isRecord(rawSubcategory)) continue;
        append(rawSubcategory, plainMinecraftText(subcategoryId.replace(/_/g, " ")));
      }
    } else {
      append(rawCategory, plainMinecraftText(categoryId.replace(/_/g, " ")));
    }
  }

  return definitions.length > 0 ? definitions : null;
};

const readStoredResource = (): { definitions: BestiaryFamilyDefinition[]; fetchedAt: number } | null => {
  try {
    const raw = localStorage.getItem(BESTIARY_CACHE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as unknown;
    if (!isRecord(stored) || typeof stored.fetchedAt !== "number") return null;
    const definitions = parseBestiaryResource(stored.payload);
    return definitions ? { definitions, fetchedAt: stored.fetchedAt } : null;
  } catch {
    return null;
  }
};

const storeResource = (payload: unknown): void => {
  try {
    const stored: CachedBestiaryResource = { fetchedAt: Date.now(), payload };
    localStorage.setItem(BESTIARY_CACHE_KEY, JSON.stringify(stored));
  } catch {
    // The current response still renders if storage is unavailable or full.
  }
};

/** Load and cache the current family catalogue once per browser session. */
export const loadBestiaryDefinitions = async (): Promise<readonly BestiaryFamilyDefinition[]> => {
  if (cached) return cached;
  if (inFlight) return inFlight;

  const stored = readStoredResource();
  if (stored && Date.now() - stored.fetchedAt < BESTIARY_CACHE_TTL) {
    cached = stored.definitions;
    return cached;
  }

  inFlight = (async () => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(NEU_BESTIARY_URL, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!response.ok) return stored?.definitions ?? [];
      const payload = await response.json() as unknown;
      const definitions = parseBestiaryResource(payload) ?? [];
      if (definitions.length > 0) {
        cached = definitions;
        storeResource(payload);
      }
      return definitions.length > 0 ? definitions : stored?.definitions ?? [];
    } catch {
      return stored?.definitions ?? [];
    } finally {
      clearTimeout(deadline);
      inFlight = null;
    }
  })();

  return inFlight;
};

/** Test seam for the small module cache. */
export const clearBestiaryDefinitionsForTesting = (): void => {
  cached = null;
  inFlight = null;
};
