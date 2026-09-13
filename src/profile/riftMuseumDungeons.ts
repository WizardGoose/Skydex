import type { Coverage } from "../networth/useNetworth";
import type { ParsedItems } from "../networth/profileNetworth";
import type { Catalogue, CatalogueEntry, NetworthResult, RawItem, ValuedItem } from "../networth/types";
import type { ProfileStatusView } from "./profileStatus";
import { stripMinecraftFormatting } from "../ui/itemTooltipModel";
import { tierFromGearLore } from "../networth/gear";
import { readNbtBlob } from "../nbt/blob";
import { simplifyItemSlots } from "../networth/nbtSimplify";

export type ProfileSectionState =
  | "loading"
  | "private"
  | "never-opened"
  | "unavailable"
  | "empty"
  | "partial"
  | "populated";

export interface ProfileValueRow {
  key: string;
  label: string;
  value: number | string;
  detail?: string | null;
}

export interface RiftTimecharmRow {
  key: string;
  label: string;
  timestamp: number | null;
  visits: number | null;
}

export type RiftQuestState = "complete" | "in-progress" | "locked" | "unknown";

export interface RiftQuestRow {
  key: string;
  label: string;
  state: RiftQuestState;
  detail?: string | null;
}

export interface RiftPreviewProjection {
  /** Null means the API did not expose this field. An empty array is real empty progress. */
  currencies?: readonly ProfileValueRow[] | null;
  stats?: readonly ProfileValueRow[] | null;
  quests?: readonly RiftQuestRow[] | null;
  itemSurfaces?: readonly RiftItemSurface[] | null;
  activePet?: RiftPetRow | null;
  inventoryAvailable?: boolean;
  petAvailable?: boolean;
}

export type RiftItemSurfaceKey = "armor" | "equipment" | "inventory" | "ender_chest";
export type RiftItemSurfaceState = "available" | "empty" | "unavailable";

export interface RiftItemRow {
  key: string;
  id: string | null;
  name: string;
  count: number;
  tier: string | null;
  lore: readonly string[];
}

export interface RiftItemSurface {
  key: RiftItemSurfaceKey;
  label: string;
  state: RiftItemSurfaceState;
  /** Exact decoded NBT slot sequence; null entries are real empty slots. */
  slots: readonly (RiftItemRow | null)[];
}

export interface RiftPetRow {
  type: string;
  tier: string | null;
  experience: number | null;
  candyUsed: number | null;
  foundSoulPieces: number | null;
}

export interface RiftItemProjection {
  itemSurfaces: readonly RiftItemSurface[];
  activePet: RiftPetRow | null;
  inventoryPresent: boolean;
  petPresent: boolean;
}

export interface RiftPreviewModel {
  state: ProfileSectionState;
  /** Permanent +11 MP flag, retained here so cached bags keep the same total. */
  consumedPrism?: boolean;
  timecharms: readonly RiftTimecharmRow[];
  currencies: readonly ProfileValueRow[];
  stats: readonly ProfileValueRow[];
  quests: readonly RiftQuestRow[];
  missingFields: readonly ("timecharms" | "currencies" | "stats" | "quests" | "inventory" | "pet")[];
  /** Optional so snapshots written before Rift inventory decoding stay readable. */
  itemSurfaces?: readonly RiftItemSurface[];
  /** Optional for the same cache compatibility boundary as itemSurfaces. */
  activePet?: RiftPetRow | null;
}

export interface MuseumDonationRow {
  key: string;
  id: string | null;
  name: string;
  /** Hypixel's item category when the resource states one. Optional for old cached models. */
  category?: string | null;
  count: number;
  tier: string | null;
  lore: readonly string[];
  value: number | null;
}

export interface MuseumCompletion {
  completed: number;
  total: number;
}

export type MuseumDonationKind = "standard" | "special";

export type MuseumPayloadState = "encoded" | "structured" | "empty" | "unknown";

/**
 * One entry from the authenticated Museum endpoint. The item contents stay
 * opaque here because they are compressed NBT and are decoded by the item
 * parser. The metadata itself is safe to retain and lets the profile UI keep
 * standard, special, and borrowed entries distinct.
 */
export interface MuseumDonationGroup {
  key: string;
  label: string;
  /** Exact item identity when Hypixel supplies one. Opaque special blobs leave this null. */
  itemId: string | null;
  itemName: string | null;
  kind: MuseumDonationKind;
  borrowed: boolean | null;
  donatedAt: number | null;
  payload: MuseumPayloadState;
  itemCount: number | null;
}

export interface MuseumApiProjection {
  present: boolean;
  /** Hypixel's reported Museum value, not a client-side recalculation. */
  value: number | null;
  /** Hypixel's reported appraisal flag. */
  appraisal: boolean | null;
  itemGroups: readonly MuseumDonationGroup[];
  specialDonations: readonly MuseumDonationGroup[];
  missingFields: readonly ("value" | "appraisal" | "items" | "special")[];
}

export type MuseumCollectionUnitState = "donated" | "borrowed" | "missing";

export interface MuseumCollectionItem {
  id: string;
  name: string;
  category: string | null;
  tier: string | null;
  /** Catalogue stats remain available even when a borrowed item's NBT is not ours to decode. */
  stats?: Readonly<Record<string, number>> | null;
  aliases: readonly string[];
  donation: MuseumDonationRow | null;
  /** The actual upgraded or alternate item that satisfied this entry. */
  acceptedBy?: string | null;
}

/** One actual Museum donation unit: either one item or Hypixel's exact set bundle. */
export interface MuseumCollectionUnit {
  key: string;
  label: string;
  kind: "item" | "set";
  museumCategory: string | null;
  items: readonly MuseumCollectionItem[];
  state: MuseumCollectionUnitState;
  donatedAt: number | null;
  /** A higher collection unit that satisfies this lower-tier entry. */
  acceptedBy?: string | null;
}

export interface MuseumPreviewModel {
  state: ProfileSectionState;
  donations: readonly MuseumDonationRow[];
  value: number | null;
  completion: MuseumCompletion | null;
  partial: boolean;
  api: MuseumApiProjection | null;
  /** Optional so profile snapshots from before catalogue-backed Museum units remain readable. */
  collectionUnits?: readonly MuseumCollectionUnit[];
}

export interface MuseumPreviewInput {
  parsed?: ParsedItems | null;
  result: NetworthResult | null;
  coverage: Pick<Coverage, "museumShared"> | null;
  /** Raw `fetchMuseum` member/profile payload, consumed and never retained. */
  museum?: unknown;
  /** Preferred sanitized endpoint projection for cached profile state. */
  api?: MuseumApiProjection | null;
  /** Current Hypixel catalogue. Its museum_data defines exact bundles and the Missing list. */
  catalogue?: Catalogue | null;
  /** The existing fetcher cannot distinguish private from never-opened. A caller with that fact may supply it. */
  sourceState?: Exclude<ProfileSectionState, "loading" | "partial" | "populated" | "empty">;
  completion?: MuseumCompletion | null;
  itemNameFor?: (id: string) => string | null;
  itemCategoryFor?: (id: string) => string | null;
}

export interface DungeonFloorRow {
  key: string;
  label: string;
  attempts: number | null;
  completions: number | null;
  bestTimeMs: number | null;
  bestScore: number | null;
  mobsKilled: number | null;
  mostMobsKilled: number | null;
  mostHealing: number | null;
  watcherKills: number | null;
  fastestTimeS: number | null;
  fastestTimeSPlus: number | null;
}

export interface DungeonRunRow {
  key: string;
  label: string;
  timeMs: number | null;
  detail?: string | null;
}

export interface DungeonClassRow {
  key: string;
  label: string;
  level: number | null;
  experience: number | null;
}

export interface DungeonRewardRow {
  key: string;
  label: string;
  state: "claimed" | "available" | "locked" | "unknown";
  detail?: string | null;
}

export interface DungeonTypeSummary {
  key: string;
  label: string;
  experience: number | null;
  highestFloor: number | null;
  completedRuns: number | null;
}

export interface DungeonFloorGroup {
  key: "catacombs" | "master_catacombs";
  label: "Normal" | "Master";
  experience: number | null;
  highestFloor: number | null;
  completedRuns: number | null;
  floors: readonly DungeonFloorRow[];
}

export interface DungeonsPreviewModel {
  state: ProfileSectionState;
  catacombsExperience: number | null;
  highestFloor: number | null;
  dungeonTypes: readonly DungeonTypeSummary[];
  secretsFound: number | null;
  selectedClass: string | null;
  essence: readonly ProfileValueRow[];
  stats: readonly ProfileValueRow[];
  floors: readonly DungeonFloorRow[];
  bestRuns: readonly DungeonRunRow[];
  classes: readonly DungeonClassRow[];
  collection: readonly ProfileValueRow[];
  rewards: readonly DungeonRewardRow[];
  partial: boolean;
  /** Optional so cached snapshots written before the Normal/Master projection remain readable. */
  floorGroups?: readonly DungeonFloorGroup[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const finiteInteger = (value: unknown): number | null => {
  const number = finiteNonNegative(value);
  return number !== null && Number.isInteger(number) ? number : null;
};

const titleCaseKey = (value: string): string => value
  .replace(/^RIFT_TROPHY_/, "")
  .replace(/^FLOOR_/, "Floor ")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase())
  .trim();

const readNumericEntries = (value: unknown, excluded: ReadonlySet<string> = new Set()): ProfileValueRow[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    if (excluded.has(key)) return [];
    const number = finiteNonNegative(raw);
    return number === null ? [] : [{ key, label: titleCaseKey(key), value: number }];
  });
};

const readRiftCurrencies = (member: Record<string, unknown>, rift: Record<string, unknown>): ProfileValueRow[] | null => {
  const memberCurrencies = isRecord(member.currencies) ? member.currencies : null;
  if (memberCurrencies && hasOwn(memberCurrencies, "motes_purse")) {
    const motes = finiteNonNegative(memberCurrencies.motes_purse);
    return motes === null ? [] : [{ key: "motes_purse", label: "Motes", value: motes }];
  }
  for (const key of ["currencies", "currency"]) {
    if (!hasOwn(rift, key)) continue;
    const value = rift[key];
    if (typeof value === "number") {
      const amount = finiteNonNegative(value);
      return amount === null ? [] : [{ key, label: titleCaseKey(key), value: amount }];
    }
    if (isRecord(value)) return readNumericEntries(value);
  }
  if (hasOwn(rift, "motes")) {
    const motes = finiteNonNegative(rift.motes);
    if (motes !== null) return [{ key: "motes", label: "Motes", value: motes }];
  }
  return null;
};

const readRiftStats = (rift: Record<string, unknown>): ProfileValueRow[] | null => {
  const rows = readNumericEntries(rift, new Set(["gallery", "currencies", "currency", "motes", "quests", "quest", "inventory"]));
  return rows.length > 0 ? rows : null;
};

const readRiftProgress = (member: Record<string, unknown>, rift: Record<string, unknown>): ProfileValueRow[] | null => {
  const rows: ProfileValueRow[] = [];
  const push = (key: string, label: string, value: unknown) => {
    const number = finiteNonNegative(value);
    if (number !== null) rows.push({ key, label, value: number });
  };
  const riftStats = isRecord(member.player_stats) && isRecord(member.player_stats.rift)
    ? member.player_stats.rift
    : null;
  if (riftStats && hasOwn(riftStats, "lifetime_motes_earned")) {
    push("lifetime_motes_earned", "Lifetime Motes earned", riftStats.lifetime_motes_earned);
  }
  const castle = isRecord(rift.castle) ? rift.castle : null;
  if (castle && hasOwn(castle, "grubber_stacks")) push("grubber_stacks", "McGrubber Burger stacks", castle.grubber_stacks);
  const enigma = isRecord(rift.enigma) ? rift.enigma : null;
  if (enigma && Array.isArray(enigma.found_souls)) rows.push({ key: "found_souls", label: "Enigma Souls found", value: enigma.found_souls.length });
  const deadCats = isRecord(rift.dead_cats) ? rift.dead_cats : null;
  if (deadCats && Array.isArray(deadCats.found_cats)) rows.push({ key: "found_cats", label: "Soul Pieces found", value: deadCats.found_cats.length });
  const native = readRiftStats(rift) ?? [];
  const seen = new Set(rows.map((row) => row.key));
  rows.push(...native.filter((row) => !seen.has(row.key)));
  return rows.length > 0 ? rows : null;
};

const readRiftTimecharms = (rift: Record<string, unknown>): RiftTimecharmRow[] | null => {
  const gallery = isRecord(rift.gallery) ? rift.gallery : null;
  if (!gallery || !Array.isArray(gallery.secured_trophies)) return null;
  const seen = new Set<string>();
  const rows: RiftTimecharmRow[] = [];
  for (const raw of gallery.secured_trophies) {
    if (!isRecord(raw) || typeof raw.type !== "string") continue;
    const key = raw.type.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      label: titleCaseKey(key),
      timestamp: finiteNonNegative(raw.timestamp),
      visits: finiteNonNegative(raw.visits),
    });
  }
  return rows;
};

/**
 * Project only the Rift structures the API has explicitly exposed. The
 * optional projection keeps currencies, stats, and quests owned by their
 * eventual field reader instead of guessing at similarly named counters.
 */
export const buildRiftPreviewModel = (
  member: unknown,
  projection: RiftPreviewProjection = {},
): RiftPreviewModel => {
  const record = isRecord(member) ? member : null;
  const rift = record && isRecord(record.rift) ? record.rift : null;
  if (!record || !rift) {
    return {
      state: "unavailable",
      consumedPrism: record ? false : undefined,
      timecharms: [],
      currencies: [],
      stats: [],
      quests: [],
      missingFields: ["timecharms", "currencies", "stats", "quests", "inventory", "pet"],
      itemSurfaces: projection.itemSurfaces ?? [],
      activePet: projection.activePet ?? null,
    };
  }

  const timecharms = readRiftTimecharms(rift);
  const access = isRecord(rift.access) ? rift.access : null;
  const consumedPrism = access?.consumed_prism === true;
  const nativeCurrencies = readRiftCurrencies(record, rift);
  const nativeStats = readRiftProgress(record, rift);
  const currencies = projection.currencies ?? nativeCurrencies ?? [];
  const stats = projection.stats ?? nativeStats ?? [];
  const quests = projection.quests ?? [];
  const itemSurfaces = projection.itemSurfaces ?? [];
  const activePet = projection.activePet ?? null;
  const missingFields: ("timecharms" | "currencies" | "stats" | "quests" | "inventory" | "pet")[] = [];
  if (timecharms === null) missingFields.push("timecharms");
  if (nativeCurrencies === null && (projection.currencies === undefined || projection.currencies === null)) missingFields.push("currencies");
  if (nativeStats === null && (projection.stats === undefined || projection.stats === null)) missingFields.push("stats");
  if (projection.quests === undefined || projection.quests === null) missingFields.push("quests");
  if (projection.itemSurfaces === undefined || projection.itemSurfaces === null || projection.inventoryAvailable === false) missingFields.push("inventory");
  if (projection.activePet === undefined || projection.petAvailable === false) missingFields.push("pet");

  const hasRows = (timecharms?.length ?? 0) + currencies.length + stats.length + quests.length
    + itemSurfaces.reduce((sum, surface) => sum + surface.slots.filter(Boolean).length, 0)
    + (activePet ? 1 : 0) > 0;
  const state: ProfileSectionState = missingFields.length > 0
    ? hasRows ? "partial" : "unavailable"
    : hasRows ? "populated" : "empty";

  return {
    state,
    consumedPrism,
    timecharms: timecharms ?? [],
    currencies,
    stats,
    quests,
    missingFields,
    itemSurfaces,
    activePet,
  };
};

const rawItemId = (item: RawItem): string | null => {
  const id = item.tag?.ExtraAttributes?.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  return typeof item.id === "string" && item.id.trim() ? item.id.trim() : null;
};

const rawItemName = (item: RawItem, itemNameFor?: (id: string) => string | null): string => {
  const id = rawItemId(item);
  const resolved = id ? itemNameFor?.(id) : null;
  if (resolved?.trim()) return stripMinecraftFormatting(resolved).trim();
  const formatted = item.tag?.display?.Name;
  if (typeof formatted === "string" && formatted.trim()) return stripMinecraftFormatting(formatted).trim();
  return id ? titleCaseKey(id) : "Unknown item";
};

const rawItemCount = (item: RawItem): number => {
  const count = finiteInteger(item.Count);
  return count !== null && count > 0 ? count : 1;
};

const riftBlob = (value: unknown): string | null => {
  if (!isRecord(value) || typeof value.data !== "string" || !value.data.trim()) return null;
  return value.data;
};

const riftItemRow = (
  item: RawItem,
  index: number,
  itemNameFor?: (id: string) => string | null,
): RiftItemRow => {
  const id = rawItemId(item);
  const lore = Array.isArray(item.tag?.display?.Lore)
    ? item.tag.display.Lore.filter((line): line is string => typeof line === "string")
    : [];
  return {
    key: `${id ?? "unknown"}-${index}`,
    id,
    name: rawItemName(item, itemNameFor),
    count: rawItemCount(item),
    tier: tierFromGearLore(lore)?.toLowerCase() ?? null,
    lore,
  };
};

const RIFT_ITEM_SURFACES: readonly { key: RiftItemSurfaceKey; field: string; label: string }[] = [
  { key: "armor", field: "inv_armor", label: "Rift Armour" },
  { key: "equipment", field: "equipment_contents", label: "Rift Equipment" },
  { key: "inventory", field: "inv_contents", label: "Rift Inventory" },
  { key: "ender_chest", field: "ender_chest_contents", label: "Rift Ender Chest" },
];

/** Decode the four Rift inventory blobs the v2 member payload actually exposes. */
export const buildRiftItemProjection = async (
  member: unknown,
  itemNameFor?: (id: string) => string | null,
  signal?: AbortSignal,
): Promise<RiftItemProjection> => {
  const record = isRecord(member) ? member : null;
  const rift = record && isRecord(record.rift) ? record.rift : null;
  const inventory = rift && isRecord(rift.inventory) ? rift.inventory : null;
  const itemSurfaces = await Promise.all(RIFT_ITEM_SURFACES.map(async ({ key, field, label }): Promise<RiftItemSurface> => {
    const blob = inventory ? riftBlob(inventory[field]) : null;
    if (!blob) return { key, label, state: "unavailable", slots: [] };
    try {
      const document = await readNbtBlob(blob, signal);
      const slots = simplifyItemSlots(document.value).map((item, index) => item ? riftItemRow(item, index, itemNameFor) : null);
      return { key, label, state: slots.some(Boolean) ? "available" : "empty", slots };
    } catch {
      return { key, label, state: "unavailable", slots: [] };
    }
  }));

  const deadCats = rift && isRecord(rift.dead_cats) ? rift.dead_cats : null;
  const montezuma = deadCats && isRecord(deadCats.montezuma) ? deadCats.montezuma : null;
  const petType = typeof montezuma?.type === "string" && montezuma.type.trim() && montezuma.type !== "UNKNOWN"
    ? montezuma.type.trim().toUpperCase()
    : null;
  const activePet: RiftPetRow | null = petType ? {
    type: petType,
    tier: typeof montezuma?.tier === "string" && montezuma.tier.trim() ? montezuma.tier.trim().toLowerCase() : null,
    experience: finiteNonNegative(montezuma?.exp),
    candyUsed: finiteNonNegative(montezuma?.candyUsed),
    foundSoulPieces: Array.isArray(deadCats?.found_cats) ? deadCats.found_cats.length : null,
  } : null;

  return {
    itemSurfaces,
    activePet,
    inventoryPresent: inventory !== null,
    petPresent: Boolean(deadCats && hasOwn(deadCats, "montezuma")),
  };
};

const valuedById = (items: readonly ValuedItem[]): Map<string, number[]> => {
  const values = new Map<string, number[]>();
  for (const item of items) {
    const bucket = values.get(item.id) ?? [];
    bucket.push(item.price);
    values.set(item.id, bucket);
  }
  return values;
};

const nextValue = (values: Map<string, number[]>, id: string | null): number | null => {
  if (!id) return null;
  const bucket = values.get(id);
  if (!bucket || bucket.length === 0) return null;
  return bucket.shift() ?? null;
};

type MuseumApiField = "value" | "appraisal" | "items" | "special";

const EMPTY_MUSEUM_API_PROJECTION: MuseumApiProjection = {
  present: false,
  value: null,
  appraisal: null,
  itemGroups: [],
  specialDonations: [],
  missingFields: ["value", "appraisal", "items", "special"],
};

const hasOwn = (record: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const payloadState = (value: unknown): { payload: MuseumPayloadState; itemCount: number | null } => {
  if (Array.isArray(value)) {
    return { payload: value.length === 0 ? "empty" : "structured", itemCount: value.length };
  }
  if (!isRecord(value)) return { payload: "unknown", itemCount: null };
  if (typeof value.data === "string") {
    return { payload: value.data.trim() ? "encoded" : "empty", itemCount: null };
  }
  const directItems = value.items;
  if (Array.isArray(directItems)) {
    return { payload: directItems.length === 0 ? "empty" : "structured", itemCount: directItems.length };
  }
  const count = finiteInteger(value.count);
  if (count !== null && count >= 0) return { payload: count === 0 ? "empty" : "structured", itemCount: count };
  return { payload: Object.keys(value).length === 0 ? "empty" : "structured", itemCount: null };
};

const museumPayloadRecord = (value: unknown): Record<string, unknown> | null => {
  if (!isRecord(value)) return null;
  if (isRecord(value.profile)) return value.profile;
  const knownFields: readonly MuseumApiField[] = ["value", "appraisal", "items", "special"];
  return knownFields.some((field) => hasOwn(value, field)) ? value : null;
};

const museumGroup = (
  key: string,
  kind: MuseumDonationKind,
  value: unknown,
  index?: number,
): MuseumDonationGroup => {
  const record = isRecord(value) ? value : null;
  const payload = payloadState(record?.items ?? value);
  const displayKey = key.trim() || `${kind}-${(index ?? 0) + 1}`;
  const explicitLabel = typeof record?.name === "string" && record.name.trim()
    ? record.name.trim()
    : typeof record?.display_name === "string" && record.display_name.trim()
      ? record.display_name.trim()
      : null;
  const explicitItemId = typeof record?.item_id === "string" && record.item_id.trim()
    ? record.item_id.trim()
    : typeof record?.itemId === "string" && record.itemId.trim()
      ? record.itemId.trim()
      : typeof record?.id === "string" && record.id.trim()
        ? record.id.trim()
        : null;
  const itemId = kind === "standard" ? displayKey : explicitItemId;
  return {
    key: displayKey,
    label: explicitLabel ?? titleCaseKey(displayKey),
    itemId,
    itemName: explicitLabel ?? (itemId ? titleCaseKey(itemId) : null),
    kind,
    borrowed: typeof record?.borrowing === "boolean" ? record.borrowing : null,
    donatedAt: finiteNonNegative(record?.donated_time),
    payload: payload.payload,
    itemCount: payload.itemCount,
  };
};

/**
 * Project the authenticated `/v2/skyblock/museum` response without retaining
 * its compressed item blobs. Both the current documented `{ profile: ... }`
 * envelope and the member object returned by the local fetcher are accepted.
 */
export const buildMuseumApiProjection = (museum: unknown): MuseumApiProjection => {
  const profile = museumPayloadRecord(museum);
  if (!profile) return EMPTY_MUSEUM_API_PROJECTION;

  const missingFields: MuseumApiField[] = [];
  const value = finiteNonNegative(profile.value);
  if (value === null) missingFields.push("value");
  const appraisal = typeof profile.appraisal === "boolean" ? profile.appraisal : null;
  if (appraisal === null) missingFields.push("appraisal");

  const itemEntries = isRecord(profile.items) ? Object.entries(profile.items) : null;
  if (itemEntries === null) missingFields.push("items");
  const itemGroups = (itemEntries ?? []).map(([key, entry]) => museumGroup(key, "standard", entry));

  const specialEntries = Array.isArray(profile.special) ? profile.special : null;
  if (specialEntries === null) missingFields.push("special");
  const specialDonations = (specialEntries ?? []).flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const explicitKey = typeof entry.id === "string" && entry.id.trim()
      ? entry.id.trim()
      : typeof entry.key === "string" && entry.key.trim()
        ? entry.key.trim()
        : `special-${index + 1}`;
    return [museumGroup(explicitKey, "special", entry, index)];
  });

  return {
    present: true,
    value,
    appraisal,
    itemGroups,
    specialDonations,
    missingFields,
  };
};

const normalizeMuseumKey = (value: string): string => value.trim().toUpperCase();

const museumCollectionItem = (
  catalogueKey: string,
  entry: CatalogueEntry,
  donationsById: ReadonlyMap<string, MuseumDonationRow>,
): MuseumCollectionItem => {
  const id = entry.id?.trim() || catalogueKey;
  const aliases = [id, ...(entry.museum_data?.mapped_item_ids ?? [])]
    .map(normalizeMuseumKey)
    .filter((alias, index, values) => alias.length > 0 && values.indexOf(alias) === index);
  const matchedAlias = aliases.find((alias) => donationsById.has(alias)) ?? null;
  const donation = matchedAlias === null ? null : donationsById.get(matchedAlias) ?? null;
  const name = stripMinecraftFormatting(entry.name ?? "").trim() || titleCaseKey(id);
  const acceptedBy = matchedAlias !== null && matchedAlias !== normalizeMuseumKey(id)
    ? matchedAlias.startsWith("STARRED_")
      ? `Dungeonised ${name}`
      : donation?.name && normalizeMuseumKey(donation.name) !== normalizeMuseumKey(name)
        ? donation.name
        : titleCaseKey(matchedAlias)
    : null;
  return {
    id,
    name,
    category: entry.category?.trim() || null,
    tier: entry.tier?.trim() || null,
    stats: entry.stats ?? null,
    aliases,
    donation,
    acceptedBy,
  };
};

const museumTieredSet = (key: string): { family: string; tier: number } | null => {
  const match = normalizeMuseumKey(key).match(/^(.*)_TIER_(\d+)$/);
  if (!match) return null;
  const tier = Number(match[2]);
  return match[1] && Number.isInteger(tier) ? { family: match[1], tier } : null;
};

const applyMuseumTierSubstitutions = (
  units: readonly MuseumCollectionUnit[],
): MuseumCollectionUnit[] => units.map((unit) => {
  if (unit.state !== "missing") return unit;
  const current = museumTieredSet(unit.key);
  if (!current) return unit;
  const accepted = units
    .filter((candidate) => candidate.state !== "missing")
    .map((candidate) => ({ candidate, tier: museumTieredSet(candidate.key) }))
    .filter(({ tier }) => tier?.family === current.family && tier.tier > current.tier)
    .sort((left, right) => (left.tier?.tier ?? 0) - (right.tier?.tier ?? 0))[0]?.candidate;
  if (!accepted) return unit;
  return {
    ...unit,
    state: accepted.state,
    donatedAt: accepted.donatedAt,
    acceptedBy: accepted.label,
  };
});

const museumCollectionSlotRank = (item: MuseumCollectionItem): number => {
  const source = `${item.category ?? ""} ${item.id} ${item.name}`.toUpperCase();
  const slots = [
    "HELMET",
    "CHESTPLATE",
    "LEGGINGS",
    "BOOTS",
    "NECKLACE",
    "CLOAK",
    "BELT",
    "GLOVES",
    "GLOVE",
    "BRACELET",
    "GAUNTLET",
  ] as const;
  const index = slots.findIndex((slot) => source.includes(slot));
  return index < 0 ? slots.length : index;
};

const sortMuseumCollectionItems = (items: Iterable<MuseumCollectionItem>): MuseumCollectionItem[] => (
  [...items].sort((left, right) => (
    museumCollectionSlotRank(left) - museumCollectionSlotRank(right)
    || left.name.localeCompare(right.name)
  ))
);

interface PendingMuseumSet {
  key: string;
  museumCategory: string | null;
  items: Map<string, MuseumCollectionItem>;
}

/**
 * Build the Museum's real donation units from the public item resource.
 * Missing is only asserted when the authenticated endpoint exposed its items
 * field; decoded NBT alone cannot prove that an absent unit was never donated.
 */
const buildMuseumCollectionUnits = (
  catalogue: Catalogue | null | undefined,
  donations: readonly MuseumDonationRow[],
  api: MuseumApiProjection | null,
): readonly MuseumCollectionUnit[] | undefined => {
  if (!catalogue || !api?.present || api.missingFields.includes("items")) return undefined;

  const donationsById = new Map<string, MuseumDonationRow>();
  for (const donation of donations) {
    if (donation.id) donationsById.set(normalizeMuseumKey(donation.id), donation);
  }
  const groupsByKey = new Map<string, MuseumDonationGroup>();
  for (const group of api.itemGroups) groupsByKey.set(normalizeMuseumKey(group.key), group);

  const groupFor = (keys: readonly string[]): MuseumDonationGroup | null => {
    for (const key of keys) {
      const group = groupsByKey.get(normalizeMuseumKey(key));
      if (group) return group;
    }
    return null;
  };
  const stateFor = (group: MuseumDonationGroup | null): MuseumCollectionUnitState => (
    group === null ? "missing" : group.borrowed === true ? "borrowed" : "donated"
  );

  const individualUnits: MuseumCollectionUnit[] = [];
  const sets = new Map<string, PendingMuseumSet>();
  for (const [catalogueKey, entry] of Object.entries(catalogue)) {
    const museumData = entry.museum_data;
    if (!museumData) continue;
    const item = museumCollectionItem(catalogueKey, entry, donationsById);
    if (finiteNonNegative(museumData.donation_xp) !== null) {
      const group = groupFor(item.aliases);
      individualUnits.push({
        key: normalizeMuseumKey(item.id),
        label: item.name,
        kind: "item",
        museumCategory: museumData.category?.trim() || null,
        items: [item],
        state: stateFor(group),
        donatedAt: group?.donatedAt ?? null,
        acceptedBy: item.acceptedBy ?? null,
      });
    }
    for (const setKey of Object.keys(museumData.armor_set_donation_xp ?? {})) {
      const normalizedKey = normalizeMuseumKey(setKey);
      const set = sets.get(normalizedKey) ?? {
        key: normalizedKey,
        museumCategory: museumData.category?.trim() || null,
        items: new Map<string, MuseumCollectionItem>(),
      };
      set.items.set(normalizeMuseumKey(item.id), item);
      sets.set(normalizedKey, set);
    }
  }

  const setUnits = applyMuseumTierSubstitutions([...sets.values()].map((set): MuseumCollectionUnit => {
    const group = groupFor([set.key]);
    const items = sortMuseumCollectionItems(set.items.values());
    return {
      key: set.key,
      label: titleCaseKey(set.key.toLowerCase()),
      kind: "set",
      museumCategory: set.museumCategory,
      items,
      state: stateFor(group),
      donatedAt: group?.donatedAt ?? null,
      acceptedBy: items.find((item) => item.acceptedBy)?.acceptedBy ?? null,
    };
  }));

  return [...setUnits, ...individualUnits].sort((left, right) => (
    Number(right.kind === "set") - Number(left.kind === "set")
    || left.label.localeCompare(right.label)
  ));
};

export const buildMuseumPreviewModel = (input: MuseumPreviewInput): MuseumPreviewModel => {
  const api = input.api !== undefined
    ? input.api
    : input.museum !== undefined
      ? buildMuseumApiProjection(input.museum)
      : null;
  if (input.sourceState) {
    return {
      state: input.sourceState,
      donations: [],
      value: null,
      completion: input.completion ?? null,
      partial: false,
      api,
    };
  }
  if (!input.coverage) {
    return { state: "unavailable", donations: [], value: null, completion: null, partial: false, api };
  }
  if (input.coverage.museumShared === false) {
    return { state: "private", donations: [], value: null, completion: null, partial: false, api };
  }
  if (input.parsed === null || (input.parsed === undefined && !api?.present)) {
    return { state: "loading", donations: [], value: api?.value ?? null, completion: null, partial: false, api };
  }

  const raw = Array.isArray(input.parsed?.museum) ? input.parsed.museum as RawItem[] : [];
  const values = valuedById(input.result?.types.museum?.items ?? []);
  const donations = raw.map((item, index) => {
    const id = rawItemId(item);
    const lore = Array.isArray(item.tag?.display?.Lore)
      ? item.tag.display.Lore.filter((line): line is string => typeof line === "string")
      : [];
    return {
      key: `${id ?? "unknown"}-${index}`,
      id,
      name: rawItemName(item, input.itemNameFor),
      category: id === null ? null : input.itemCategoryFor?.(id) ?? null,
      count: rawItemCount(item),
      tier: tierFromGearLore(lore),
      lore,
      value: nextValue(values, id),
    };
  });
  const value = api?.value ?? input.result?.types.museum?.total ?? null;
  const apiGroups = api ? [...api.itemGroups, ...api.specialDonations] : [];
  const ownApiGroups = apiGroups.filter((group) => group.borrowed !== true);
  const hasApiValue = value !== null && value > 0;
  const hasOwnApiData = ownApiGroups.length > 0;
  const apiItemsExpected = ownApiGroups.some((group) => group.payload !== "empty" && group.itemCount !== 0);
  const decodedItemsMissing = api?.present === true && apiItemsExpected && donations.length === 0;
  const malformedApi = api?.present === true && api.missingFields.length > 0;
  const collectionUnits = buildMuseumCollectionUnits(input.catalogue, donations, api);
  const derivedCompletion = collectionUnits
    ? {
      completed: collectionUnits.filter((unit) => unit.state !== "missing").length,
      total: collectionUnits.length,
    }
    : null;
  const partial = donations.some((item) => item.value === null)
    || decodedItemsMissing
    || malformedApi;
  const hasData = donations.length > 0
    || hasOwnApiData
    || hasApiValue
    || (collectionUnits?.some((unit) => unit.state !== "missing") ?? false);
  const state: ProfileSectionState = !hasData
    ? partial ? "partial" : "empty"
    : partial ? "partial" : "populated";
  return {
    state,
    donations,
    value,
    completion: input.completion ?? derivedCompletion,
    partial,
    api,
    collectionUnits,
  };
};

const timeInMilliseconds = (value: unknown): number | null => {
  const direct = finiteNonNegative(value);
  if (direct !== null) return direct;
  if (!isRecord(value)) return null;
  const milliseconds = finiteNonNegative(value.time_ms ?? value.milliseconds ?? value.time);
  if (milliseconds !== null) return milliseconds;
  const seconds = finiteNonNegative(value.seconds ?? value.time_seconds);
  return seconds === null ? null : seconds * 1_000;
};

const metricValue = (source: Record<string, unknown> | null, key: string, nested: readonly string[] = []): number | null => {
  const raw = source?.[key];
  const direct = finiteNonNegative(raw);
  if (direct !== null) return direct;
  if (!isRecord(raw)) return null;
  for (const nestedKey of nested) {
    const value = finiteNonNegative(raw[nestedKey]);
    if (value !== null) return value;
  }
  return null;
};

const runRow = (key: string, raw: unknown, index: number): DungeonRunRow => {
  const record = isRecord(raw) ? raw : null;
  const timeMs = timeInMilliseconds(record ? record.time ?? record.time_ms ?? record.fastest_time ?? record : raw);
  const score = finiteNonNegative(record?.score);
  const detail = score === null ? null : `Score ${score.toLocaleString()}`;
  return {
    key: key.trim() || `run-${index + 1}`,
    label: titleCaseKey(key.trim() || `run-${index + 1}`),
    timeMs,
    detail,
  };
};

const readBestRuns = (value: unknown): DungeonRunRow[] => {
  if (Array.isArray(value)) return value.map((raw, index) => {
    const record = isRecord(raw) ? raw : null;
    const key = typeof record?.floor === "string" && record.floor.trim()
      ? record.floor
      : typeof record?.type === "string" && record.type.trim()
        ? record.type
        : `run-${index + 1}`;
    return runRow(key, raw, index);
  });
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([key, raw], index) => runRow(key, raw, index));
};

const readDungeonClasses = (value: unknown): DungeonClassRow[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    if (!isRecord(raw)) return [];
    return [{
      key,
      label: titleCaseKey(key),
      level: finiteInteger(raw.level),
      experience: finiteNonNegative(raw.experience ?? raw.xp),
    }];
  });
};

const readCollectionRows = (value: unknown): ProfileValueRow[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, raw]) => {
    const amount = finiteNonNegative(raw);
    if (amount !== null) return [{ key, label: titleCaseKey(key), value: amount }];
    if (!isRecord(raw)) return [];
    const nested = finiteNonNegative(raw.amount ?? raw.count ?? raw.experience ?? raw.current ?? raw.killed);
    return nested === null ? [] : [{ key, label: titleCaseKey(key), value: nested }];
  });
};

const readDungeonRewards = (value: unknown): DungeonRewardRow[] => {
  const entries = Array.isArray(value)
    ? value.map((raw, index) => [`reward-${index + 1}`, raw] as const)
    : isRecord(value)
      ? Object.entries(value)
      : [];
  return entries.map(([key, raw]) => {
    const record = isRecord(raw) ? raw : null;
    const status = typeof record?.state === "string"
      ? record.state.toLowerCase()
      : typeof record?.status === "string"
        ? record.status.toLowerCase()
        : null;
    const state: DungeonRewardRow["state"] = status === "claimed" || status === "complete" || status === "completed"
      ? "claimed"
      : status === "available" || status === "ready"
        ? "available"
        : status === "locked"
          ? "locked"
          : "unknown";
    const amount = finiteNonNegative(record?.amount ?? record?.count ?? record?.value);
    return {
      key,
      label: titleCaseKey(key),
      state,
      detail: amount === null ? null : `${amount.toLocaleString()} recorded`,
    };
  });
};

const readDirectDungeonStats = (dungeons: Record<string, unknown>): ProfileValueRow[] => {
  const excluded = new Set([
    "dungeon_types",
    "player_classes",
    "collection",
    "boss_collections",
    "rewards",
    "essence",
    "dungeon_journal",
    "party_finder",
    "selected_dungeon_class",
    "current_class",
    "secrets_found",
    "secrets",
  ]);
  return Object.entries(dungeons).reduce<ProfileValueRow[]>((rows, [key, raw]) => {
    if (excluded.has(key)) return rows;
    const number = finiteNonNegative(raw);
    if (number !== null) rows.push({ key, label: titleCaseKey(key), value: number });
    else if (typeof raw === "string" && raw.trim()) rows.push({ key, label: titleCaseKey(key), value: raw.trim() });
    return rows;
  }, []);
};

const readFloorRows = (type: Record<string, unknown>): DungeonFloorRow[] => {
  const timesPlayed = isRecord(type.times_played) ? type.times_played : null;
  const completions = isRecord(type.tier_completions) ? type.tier_completions : null;
  const fastest = isRecord(type.fastest_time) ? type.fastest_time : null;
  const bestScores = isRecord(type.best_score) ? type.best_score : null;
  const mobsKilled = isRecord(type.mobs_killed) ? type.mobs_killed : null;
  const mostMobsKilled = isRecord(type.most_mobs_killed) ? type.most_mobs_killed : null;
  const mostHealing = isRecord(type.most_healing) ? type.most_healing : null;
  const watcherKills = isRecord(type.watcher_kills) ? type.watcher_kills : null;
  const fastestS = isRecord(type.fastest_time_s) ? type.fastest_time_s : null;
  const fastestSPlus = isRecord(type.fastest_time_s_plus) ? type.fastest_time_s_plus : null;
  const keys = new Set([
    ...Object.keys(timesPlayed ?? {}),
    ...Object.keys(completions ?? {}),
    ...Object.keys(fastest ?? {}),
    ...Object.keys(bestScores ?? {}),
    ...Object.keys(mobsKilled ?? {}),
    ...Object.keys(mostMobsKilled ?? {}),
    ...Object.keys(mostHealing ?? {}),
    ...Object.keys(watcherKills ?? {}),
    ...Object.keys(fastestS ?? {}),
    ...Object.keys(fastestSPlus ?? {}),
  ]);
  return [...keys].map((key) => ({
    key,
    label: titleCaseKey(key),
    attempts: finiteNonNegative(timesPlayed?.[key]),
    completions: finiteNonNegative(completions?.[key]),
    bestTimeMs: timeInMilliseconds(fastest?.[key]),
    bestScore: metricValue(bestScores, key, ["value", "score"]),
    mobsKilled: metricValue(mobsKilled, key, ["value", "count"]),
    mostMobsKilled: metricValue(mostMobsKilled, key, ["value", "count"]),
    mostHealing: metricValue(mostHealing, key, ["value", "amount"]),
    watcherKills: metricValue(watcherKills, key, ["value", "count"]),
    fastestTimeS: timeInMilliseconds(fastestS?.[key]),
    fastestTimeSPlus: timeInMilliseconds(fastestSPlus?.[key]),
  })).sort((left, right) => {
    const leftFloor = Number(left.key.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    const rightFloor = Number(right.key.match(/(\d+)$/)?.[1] ?? Number.MAX_SAFE_INTEGER);
    return leftFloor - rightFloor || left.label.localeCompare(right.label);
  });
};

const sumKnown = (rows: readonly (number | null)[]): number | null => {
  const known = rows.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
};

const readDungeonTypeSummaries = (types: Record<string, unknown>): DungeonTypeSummary[] =>
  Object.entries(types).flatMap(([key, raw]) => {
    if (!isRecord(raw)) return [];
    const floors = readFloorRows(raw);
    return [{
      key,
      label: titleCaseKey(key),
      experience: finiteNonNegative(raw.experience),
      highestFloor: finiteInteger(raw.highest_tier_completed),
      completedRuns: sumKnown(floors.map((floor) => floor.completions)),
    }];
  });

const readFloorGroups = (types: Record<string, unknown>): DungeonFloorGroup[] => {
  const definitions: readonly DungeonFloorGroup["key"][] = ["catacombs", "master_catacombs"];
  return definitions.flatMap((key): DungeonFloorGroup[] => {
    const raw = types[key];
    if (!isRecord(raw)) return [];
    const floors = readFloorRows(raw);
    return [{
      key,
      label: key === "catacombs" ? "Normal" : "Master",
      experience: finiteNonNegative(raw.experience),
      highestFloor: finiteInteger(raw.highest_tier_completed),
      completedRuns: sumKnown(floors.map((floor) => floor.completions)),
      floors,
    }];
  });
};

const emptyDungeonsModel = (
  state: ProfileSectionState,
  partial: boolean,
  dungeonTypes: readonly DungeonTypeSummary[] = [],
): DungeonsPreviewModel => ({
  state,
  catacombsExperience: null,
  highestFloor: null,
  dungeonTypes,
  secretsFound: null,
  selectedClass: null,
  essence: [],
  stats: [],
  floors: [],
  bestRuns: [],
  classes: [],
  collection: [],
  rewards: [],
  partial,
  floorGroups: [],
});

/**
 * Read Dungeons values by their own API keys. No floor level, completion
 * threshold, or class level is derived from XP: absent numbers remain null.
 */
export const buildDungeonsPreviewModel = (member: unknown): DungeonsPreviewModel => {
  if (!isRecord(member) || !isRecord(member.dungeons)) {
    return emptyDungeonsModel("unavailable", false);
  }

  const dungeons = member.dungeons;
  const dungeonTypesRecord = isRecord(dungeons.dungeon_types) ? dungeons.dungeon_types : null;
  const dungeonTypes = dungeonTypesRecord ? readDungeonTypeSummaries(dungeonTypesRecord) : [];
  const floorGroups = dungeonTypesRecord ? readFloorGroups(dungeonTypesRecord) : [];
  const catacombs = dungeonTypesRecord && isRecord(dungeonTypesRecord.catacombs) ? dungeonTypesRecord.catacombs : null;
  if (!catacombs) {
    const hasOtherTypeData = dungeonTypes.some((type) => type.experience !== null || type.highestFloor !== null || type.completedRuns !== null);
    return {
      ...emptyDungeonsModel(hasOtherTypeData ? "partial" : "empty", dungeonTypes.length > 0 && !hasOtherTypeData, dungeonTypes),
      floorGroups,
    };
  }

  const catacombsExperience = finiteNonNegative(catacombs.experience);
  const highestFloor = finiteInteger(catacombs.highest_tier_completed);
  const floors = readFloorRows(catacombs);
  const bestRuns = readBestRuns(catacombs.best_runs ?? dungeons.best_runs);
  const classes = readDungeonClasses(dungeons.player_classes);
  const collection = readCollectionRows(dungeons.collection ?? dungeons.boss_collections ?? catacombs.collection);
  const rewards = readDungeonRewards(dungeons.rewards ?? catacombs.rewards);
  const essence = readCollectionRows(dungeons.essence);
  const stats = readDirectDungeonStats(dungeons);
  const secretsFound = finiteNonNegative(dungeons.secrets_found ?? dungeons.secrets);
  const selectedClass = typeof dungeons.selected_dungeon_class === "string" && dungeons.selected_dungeon_class.trim()
    ? dungeons.selected_dungeon_class.trim()
    : typeof dungeons.current_class === "string" && dungeons.current_class.trim()
      ? dungeons.current_class.trim()
      : null;
  const hasTypeData = dungeonTypes.some((type) => type.experience !== null || type.highestFloor !== null || type.completedRuns !== null);
  const hasRows = floors.length + bestRuns.length + classes.length + collection.length + rewards.length + essence.length + stats.length > 0
    || secretsFound !== null
    || catacombsExperience !== null
    || highestFloor !== null
    || hasTypeData;
  const partial =
    catacombsExperience === null ||
    !floorGroups.some((group) => group.key === "master_catacombs") ||
    floors.some((floor) => floor.attempts !== null && floor.completions === null) ||
    classes.some((entry) => entry.level === null && entry.experience === null);
  return {
    state: hasRows ? partial ? "partial" : "populated" : "empty",
    catacombsExperience,
    highestFloor,
    dungeonTypes,
    secretsFound,
    selectedClass,
    essence,
    stats,
    floors,
    bestRuns,
    classes,
    collection,
    rewards,
    partial,
    floorGroups,
  };
};

export const profileSectionStateLabel = (state: ProfileSectionState): string => {
  switch (state) {
    case "loading": return "Loading";
    case "private": return "Private";
    case "never-opened": return "Never opened";
    case "unavailable": return "Unavailable";
    case "empty": return "Empty";
    case "partial": return "Partial";
    case "populated": return "Available";
  }
};

export const statusState = (status: ProfileStatusView): ProfileSectionState => {
  if (status.dataVisible) return "populated";
  if (status.showSkeleton) return "loading";
  if (status.showNoKey) return "private";
  return "unavailable";
};

/**
 * Merge request/cache visibility with a section's own truthful data state.
 * A missing API key or failed refresh must not cover a readable cached model;
 * conversely, an uncached request can never paint a successful empty section.
 */
export const resolveProfileSectionState = (
  status: ProfileStatusView,
  modelState: ProfileSectionState | null | undefined,
): ProfileSectionState => status.dataVisible
  ? modelState ?? "unavailable"
  : statusState(status);

/** Kept as an adapter seam for a future raw member projection. */
export const readRiftNumericFields = (member: unknown, keys: readonly string[]): ProfileValueRow[] => {
  if (!isRecord(member) || !isRecord(member.rift)) return [];
  const rift = member.rift;
  return keys.flatMap((key) => {
    const value = finiteNonNegative(rift[key]);
    return value === null ? [] : [{ key, label: titleCaseKey(key), value }];
  });
};

/** Useful for a caller that already has a typed numeric object from the API. */
export const readNumericProfileRows = readNumericEntries;
