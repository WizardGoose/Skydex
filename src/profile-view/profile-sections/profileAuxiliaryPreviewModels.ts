import { prettify } from "../../island/format";
import type { SectionProvenance } from "../../island/merge";
import type { OwnedIndex } from "../../inventory";
import type { Item, ItemIndex } from "../../items/useItemData";
import { categoryLabel } from "../../networth/format";
import {
  buildNetworkCategories,
  NETWORK_CATEGORY_ICONS,
  type NetworkCategoryIcon,
  type NetworkCategoryView,
} from "../../networth/networkModel";
import type { ParsedItems } from "../../networth/profileNetworth";
import type { InventoryLayoutSlot, MemberInventoryLayouts } from "../../networth/parseItems";
import { tierFromGearLore } from "../../networth/gear";
import type { ValuedItem } from "../../networth/types";
import type { Coverage, NetworthStatus, NetworthView } from "../../networth/useNetworth";
import type { CraftedGeneratorProfile } from "../../profile/minions";
import type { PetPreviewEntry } from "../../profile/petsBestiaryCollections";
import { stripMinecraftFormatting } from "../../ui/itemTooltipModel";
import { potionEffectKey, potionIconDataUri } from "./profilePotionIcon";

export const matchingOwnedPets = (
  pets: readonly PetPreviewEntry[],
  query: string,
): readonly PetPreviewEntry[] => {
  const needle = query.trim().toLowerCase();
  return needle
    ? pets.filter((pet) => (
        pet.name.toLowerCase().includes(needle)
        || pet.type.toLowerCase().includes(needle)
        || pet.tier.toLowerCase().includes(needle)
        || pet.heldItem?.name.toLowerCase().includes(needle) === true
        || pet.skin?.name.toLowerCase().includes(needle) === true
      ))
    : pets;
};

export type MinionsPreviewState =
  | "loading"
  | "private"
  | "unavailable"
  | "empty"
  | "partial"
  | "populated"
  | "error";

export const minionsPreviewState = (
  profile: CraftedGeneratorProfile | null,
  profileStatus: NetworthStatus,
): MinionsPreviewState => {
  if (!profile) {
    if (profileStatus === "loading" || profileStatus === "idle") return "loading";
    if (profileStatus === "needsKey") return "private";
    if (profileStatus === "error") return "error";
    return "unavailable";
  }
  if (!profile.available) {
    if (profileStatus === "loading") return "loading";
    if (profileStatus === "needsKey") return "private";
    if (profileStatus === "error") return "error";
    return "unavailable";
  }
  if (profile.raw.length === 0 && Object.keys(profile.highestByFamily).length === 0) return "empty";
  if (profileStatus === "error" || profile.unmapped.length > 0) return "partial";
  return "populated";
};

/** Generator ids the live profile states it has crafted, excluding unknown catalogue entries. */
export const recognizedCraftedGeneratorIds = (
  profile: CraftedGeneratorProfile,
): readonly string[] => {
  const unmapped = new Set(profile.unmapped.map((id) => id.trim().toUpperCase()));
  return [...new Set(profile.raw
    .map((id) => id.trim().toUpperCase())
    .filter((id) => id !== "" && !unmapped.has(id)))];
};

export type InventorySourceState = "loading" | "available" | "empty" | "private" | "unavailable";

export const INVENTORY_PREVIEW_CATEGORIES = [
  "inventory",
  "enderchest",
  "storage",
  "sacks",
  "personal_vault",
  "fishing_bag",
  "potion_bag",
  "sacks_bag",
  "quiver",
  "candy_inventory",
  "carnival_mask_inventory",
  "farming_toolkit",
  "hunting_toolkit",
] as const;

export type InventoryPreviewCategory = (typeof INVENTORY_PREVIEW_CATEGORIES)[number];

export interface InventoryPreviewRow {
  key: string;
  name: string;
  wikiName: string;
  hypixelId: string | null;
  tier: string | null;
  count: number;
  item: Item | null;
  lore: readonly string[];
  iconSrc: string | null;
  variantKey: string | null;
}

export interface InventoryPreviewGroup {
  source: InventoryPreviewCategory | "island_chests";
  kind: "api" | "companion";
  state: InventorySourceState;
  label: string;
  icon: NetworkCategoryIcon;
  at: number | null;
  rows: readonly InventoryPreviewRow[];
}

export const inventoryPartialStatusCopy = (
  groups: readonly InventoryPreviewGroup[],
  profileStatus: NetworthStatus,
): string => {
  const hasMissingContainers = groups.some((group) =>
    group.kind === "api" && (group.state === "private" || group.state === "unavailable"));
  if (profileStatus === "error") {
    return hasMissingContainers
      ? "The latest profile refresh failed, and some inventory containers are private or unavailable. Visible items use the last successfully decoded profile."
      : "The latest profile refresh failed. Visible items use the last successfully decoded profile.";
  }
  return "Some profile inventory containers are private or unavailable.";
};

export type InventoryPreviewState = "loading" | "private" | "unavailable" | "empty" | "partial" | "populated";

export interface InventoryPreviewModel {
  state: InventoryPreviewState;
  itemTypes: number;
  groups: readonly InventoryPreviewGroup[];
}

/** The actual Hypixel Ender Chest page footprint: nine columns by five rows. */
export const ENDER_CHEST_PAGE_SIZE = 45;

const itemForEntry = (
  key: string,
  hypixelId: string | null,
  items: ItemIndex,
  byHypixelId: ReadonlyMap<string, Item>,
): Item | null => items[key] ?? (hypixelId ? byHypixelId.get(hypixelId.toUpperCase()) ?? null : null);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const positiveCount = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;

const rowFromParsedEntry = (
  entry: unknown,
  index: number,
  items: ItemIndex,
  byHypixelId: ReadonlyMap<string, Item>,
): InventoryPreviewRow | null => {
  if (!isRecord(entry)) return null;
  const tag = isRecord(entry.tag) ? entry.tag : null;
  const extra = tag && isRecord(tag.ExtraAttributes) ? tag.ExtraAttributes : null;
  const display = tag && isRecord(tag.display) ? tag.display : null;
  const isBasic = typeof entry.id === "string" && typeof entry.amount === "number";
  const basicId = isBasic ? entry.id as string : null;
  const rawId = typeof extra?.id === "string" ? extra.id : basicId;
  const hypixelId = rawId ? rawId.toUpperCase() : null;
  const wireId = typeof entry.id === "string" || typeof entry.id === "number" ? String(entry.id) : null;
  const item = hypixelId ? itemForEntry(hypixelId.toLowerCase(), hypixelId, items, byHypixelId) : null;
  const displayName = typeof display?.Name === "string"
    ? stripMinecraftFormatting(display.Name).trim()
    : "";
  if (!hypixelId && !displayName) return null;
  const name = displayName || item?.name || prettify(rawId ?? wireId ?? "item");
  const lore = Array.isArray(display?.Lore)
    ? display.Lore.filter((line): line is string => typeof line === "string")
    : [];
  const count = isBasic
    ? typeof entry.amount === "number" && Number.isFinite(entry.amount) && entry.amount >= 0
      ? entry.amount
      : -1
    : positiveCount(entry.Count, 1);
  if (count < 0) return null;
  const rawPotionEffect = [extra?.potion, extra?.potion_type, extra?.potion_effect, extra?.effect]
    .find((value): value is string => typeof value === "string") ?? null;
  const potionKey = potionEffectKey(name, rawPotionEffect);
  return {
    key: `${hypixelId ?? wireId ?? name}:${index}`,
    name,
    wikiName: item?.wikiTitle ?? item?.name ?? name,
    hypixelId,
    tier: tierFromGearLore(lore) ?? item?.tier ?? null,
    count,
    item,
    lore,
    iconSrc: potionIconDataUri(potionKey),
    variantKey: potionKey,
  };
};

const itemIdIndex = (items: ItemIndex): ReadonlyMap<string, Item> => {
  const byHypixelId = new Map<string, Item>();
  Object.values(items).forEach((item) => {
    if (item.hypixelId) byHypixelId.set(item.hypixelId.toUpperCase(), item);
  });
  return byHypixelId;
};

/** Convert exact NBT slots without packing away their null positions. */
export const inventorySlotRows = (
  slots: readonly InventoryLayoutSlot[],
  items: ItemIndex,
): readonly (InventoryPreviewRow | null)[] => {
  const byHypixelId = itemIdIndex(items);
  return slots.map((entry, index) => (
    entry === null ? null : rowFromParsedEntry(entry, index, items, byHypixelId)
  ));
};

/** Match Minecraft's inventory screen: the 27 main slots sit above the 9-slot hotbar. */
export const inventoryPlayerDisplaySlots = <T,>(slots: readonly T[]): readonly T[] => (
  slots.length === 36
    ? [...slots.slice(9), ...slots.slice(0, 9)]
    : slots
);

/** Slice a real container into real pages while preserving every empty cell. */
export const inventorySlotPages = <T,>(
  slots: readonly T[],
  pageSize: number,
): readonly (readonly T[])[] => {
  if (!Number.isInteger(pageSize) || pageSize <= 0) return [];
  return Array.from(
    { length: Math.ceil(slots.length / pageSize) },
    (_, pageIndex) => slots.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize),
  );
};

const stackSourceRows = (rows: readonly InventoryPreviewRow[]): InventoryPreviewRow[] => {
  const stacked = new Map<string, InventoryPreviewRow>();
  for (const row of rows) {
    const key = row.variantKey
      ? `${row.hypixelId ?? "potion"}:${row.variantKey}`
      : row.hypixelId ?? row.name.toLowerCase();
    const current = stacked.get(key);
    if (current) {
      stacked.set(key, { ...current, count: current.count + row.count });
    } else {
      stacked.set(key, { ...row, key });
    }
  }
  return [...stacked.values()].sort((left, right) => left.name.localeCompare(right.name));
};

const apiSourceState = (
  category: InventoryPreviewCategory,
  parsed: ParsedItems,
  coverage: Coverage | null,
  rows: readonly InventoryPreviewRow[],
  entryCount: number,
  layouts: MemberInventoryLayouts | null | undefined,
): InventorySourceState => {
  if (category === "personal_vault" && coverage?.vaultShared === false) return "private";
  if (coverage?.inventoryShared === false) return "private";
  if (!Object.prototype.hasOwnProperty.call(parsed, category)) return "unavailable";
  if (layouts && category in layouts.containers) {
    const exact = layouts.containers[category as keyof MemberInventoryLayouts["containers"]];
    if (exact === null) return "unavailable";
  }
  if (entryCount > 0 && rows.length === 0) return "unavailable";
  return rows.length > 0 ? "available" : "empty";
};

const companionChestRows = (
  owned: OwnedIndex | null | undefined,
  items: ItemIndex,
  byHypixelId: ReadonlyMap<string, Item>,
): InventoryPreviewRow[] => {
  if (!owned) return [];
  return owned.entries().flatMap((entry): InventoryPreviewRow[] => {
    const contribution = entry.sources.find((source) => source.source === "island.chests");
    if (!contribution || contribution.count <= 0) return [];
    const item = itemForEntry(entry.key, entry.hypixelId, items, byHypixelId);
    const name = item?.name ?? prettify(entry.hypixelId ?? entry.key);
    return [{
      key: entry.hypixelId ?? entry.key,
      name,
      wikiName: item?.wikiTitle ?? item?.name ?? name,
      hypixelId: entry.hypixelId ?? item?.hypixelId ?? null,
      tier: item?.tier ?? null,
      count: contribution.count,
      item,
      iconSrc: null,
      variantKey: null,
      lore: [],
    }];
  }).sort((left, right) => left.name.localeCompare(right.name));
};

export const buildInventoryPreviewModel = (
  parsed: ParsedItems | null,
  coverage: Coverage | null,
  items: ItemIndex,
  profileStatus: NetworthStatus,
  owned?: OwnedIndex | null,
  chestProvenance?: SectionProvenance | null,
  layouts?: MemberInventoryLayouts | null,
): InventoryPreviewModel => {
  const byHypixelId = itemIdIndex(items);

  if (!parsed) {
    const state: InventoryPreviewState = profileStatus === "loading" || profileStatus === "idle"
      ? "loading"
      : profileStatus === "needsKey"
        ? "private"
        : "unavailable";
    return { state, itemTypes: 0, groups: [] };
  }

  const apiGroups = INVENTORY_PREVIEW_CATEGORIES.map((source): InventoryPreviewGroup => {
    const entries = Array.isArray(parsed[source]) ? parsed[source] : [];
    const rows = stackSourceRows(entries.flatMap((entry, index) => {
      const row = rowFromParsedEntry(entry, index, items, byHypixelId);
      return row ? [row] : [];
    }));
    return {
      source,
      kind: "api",
      state: apiSourceState(source, parsed, coverage, rows, entries.length, layouts),
      label: categoryLabel(source),
      icon: NETWORK_CATEGORY_ICONS[source] ?? { name: categoryLabel(source), id: source },
      at: null,
      rows,
    };
  });

  const chestRows = companionChestRows(owned, items, byHypixelId);
  const includeChests = chestRows.length > 0
    || chestProvenance?.state === "captured"
    || chestProvenance?.state === "empty";
  const chestGroup: InventoryPreviewGroup[] = includeChests ? [{
    source: "island_chests",
    kind: "companion",
    state: chestRows.length > 0
      ? "available"
      : chestProvenance?.state === "empty" || owned
        ? "empty"
        : "unavailable",
    label: categoryLabel("island_chests"),
    icon: NETWORK_CATEGORY_ICONS.island_chests,
    at: chestProvenance?.at ?? null,
    rows: chestRows,
  }] : [];
  const groups = [...apiGroups, ...chestGroup];

  const itemTypes = new Set(groups.flatMap((group) => group.rows.map((row) => row.hypixelId ?? row.name.toLowerCase()))).size;
  const hasRows = itemTypes > 0;
  const hasMissing = apiGroups.some((group) => group.state === "private" || group.state === "unavailable");
  const hasKnownEmpty = apiGroups.some((group) => group.state === "empty");
  let state: InventoryPreviewState;
  if (hasRows) state = hasMissing || profileStatus === "error" ? "partial" : "populated";
  else if (profileStatus === "loading" || profileStatus === "idle") state = "loading";
  else if (hasKnownEmpty && hasMissing) state = "partial";
  else if (apiGroups.every((group) => group.state === "private") || profileStatus === "needsKey") state = "private";
  else if (hasKnownEmpty) state = "empty";
  else state = "unavailable";

  return { state, itemTypes, groups };
};

export const inventoryPreviewRowMatches = (
  row: InventoryPreviewRow,
  query: string,
): boolean => {
  const needle = query.trim().toLowerCase();
  return needle === ""
    || row.name.toLowerCase().includes(needle)
    || row.hypixelId?.toLowerCase().includes(needle) === true;
};

export interface InventorySearchSurface {
  destinationId: string;
  pageKey: string;
  rows: readonly (InventoryPreviewRow | null)[];
}

/** Search every projected surface while allowing the component to mount only the winning page. */
export const findInventorySearchTarget = (
  surfaces: readonly InventorySearchSurface[],
  query: string,
): { destinationId: string; pageKey: string; matches: number } | null => {
  const needle = query.trim();
  if (!needle) return null;
  for (const surface of surfaces) {
    const matches = surface.rows.filter((row) => row !== null && inventoryPreviewRowMatches(row, needle)).length;
    if (matches > 0) return { destinationId: surface.destinationId, pageKey: surface.pageKey, matches };
  }
  return null;
};

export type NetWorthPreviewState = "loading" | "private" | "unavailable" | "empty" | "partial" | "populated" | "error";

export interface NetWorthPreviewModel {
  state: NetWorthPreviewState;
  categories: readonly NetworkCategoryView[];
}

export interface NetWorthComposition {
  categories: readonly NetworkCategoryView[];
  knownItemValue: number;
  unresolved: readonly NetworkCategoryView[];
}

/** Only known, positive item categories belong in the item-value denominator. */
export const buildNetWorthComposition = (
  categories: readonly NetworkCategoryView[],
): NetWorthComposition => {
  const available = categories
    .filter((category) => category.state === "available" && (category.total ?? 0) > 0)
    .sort((left, right) => (right.total ?? 0) - (left.total ?? 0));
  return {
    categories: available,
    knownItemValue: available.reduce((sum, category) => sum + (category.total ?? 0), 0),
    unresolved: categories.filter((category) => category.state === "private" || category.state === "unavailable"),
  };
};

export const valuedItemPage = (
  items: readonly ValuedItem[],
  page: number,
  limit = 8,
): readonly ValuedItem[] => {
  const ordered = [...items].sort((left, right) => right.price - left.price);
  const size = Math.max(1, Math.floor(limit));
  const start = Math.max(0, Math.floor(page)) * size;
  return ordered.slice(start, start + size);
};

export const netWorthCategoryStateLabel = (category: NetworkCategoryView): string => {
  if (category.state === "private") return "Private";
  if (category.state === "unavailable") return "Unavailable";
  if (category.state === "empty") return "Empty";
  return `${category.itemCount.toLocaleString()} valued row${category.itemCount === 1 ? "" : "s"}`;
};

export const buildNetWorthPreviewModel = (
  view: NetworthView,
  chestProvenance: SectionProvenance,
): NetWorthPreviewModel => {
  if (!view.result) {
    if (view.status === "loading" || view.status === "idle") return { state: "loading", categories: [] };
    if (view.status === "needsKey") return { state: "private", categories: [] };
    if (view.status === "error") return { state: "error", categories: [] };
    return { state: "unavailable", categories: [] };
  }

  const categories = buildNetworkCategories(view.result, view.coverage, chestProvenance);
  const empty = view.result.networth === 0 && !categories.some((category) => category.state === "available");
  if (empty && !categories.some((category) => category.state === "private" || category.state === "unavailable")) {
    return { state: "empty", categories };
  }
  const partial = view.profileStatus.isStale
    || Boolean(view.pricesError)
    || categories.some((category) => category.state === "private" || category.state === "unavailable")
    || view.coverage?.catalogueLoaded === false;
  return { state: partial ? "partial" : "populated", categories };
};
