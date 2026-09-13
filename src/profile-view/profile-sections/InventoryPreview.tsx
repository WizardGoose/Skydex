import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import type { SectionProvenance } from "../../island/merge";
import {
  buildSackIndex,
  groupSacks,
  sackDisplayFamily,
  useSackDefinitions,
  type SackEntry,
} from "../../island/sacks";
import type { OwnedIndex } from "../../inventory";
import type { ItemIndex } from "../../items/useItemData";
import type {
  InventoryLayoutCategory,
  InventoryLayoutSlot,
  MemberInventoryLayouts,
} from "../../networth/parseItems";
import type { ParsedItems } from "../../networth/profileNetworth";
import { categoryLabel, coins } from "../../networth/format";
import type { NpcSellSummary } from "../../networth/npcSell";
import { NETWORK_CATEGORY_ICONS } from "../../networth/networkModel";
import type { NetworthResult } from "../../networth/types";
import type { Coverage, NetworthStatus } from "../../networth/useNetworth";
import { ItemIcon } from "../../ui/ItemIcon";
import {
  buildInventoryPreviewModel,
  ENDER_CHEST_PAGE_SIZE,
  inventoryPartialStatusCopy,
  inventoryPlayerDisplaySlots,
  inventoryPreviewRowMatches,
  inventorySlotPages,
  inventorySlotRows,
  type InventoryPreviewGroup,
  type InventoryPreviewRow,
  type InventoryPreviewState,
  type InventorySourceState,
} from "./profileAuxiliaryPreviewModels";
import { ProfileItemTile } from "./ProfileItemTile";
import { ProfileSlotSurface } from "./ProfileSlotSurface";
import { inventoryTileCount } from "./inventoryTileCount";
import { usePersistentDisclosure } from "../disclosure";
import "./minions-inventory-networth.css";
import "./inventory-preview.css";

export interface InventoryPreviewProps {
  parsed: ParsedItems | null;
  layouts: MemberInventoryLayouts | null;
  coverage: Coverage | null;
  items: ItemIndex;
  profileStatus: NetworthStatus;
  owned?: OwnedIndex | null;
  chestProvenance?: SectionProvenance | null;
  networth?: NetworthResult | null;
  npcSell?: NpcSellSummary | null;
}

type InventoryDestinationId =
  | "inventory"
  | "enderchest"
  | "storage"
  | "personal_vault"
  | "bags"
  | "sacks_toolkits"
  | "island_chests";

interface InventorySurface {
  destinationId: InventoryDestinationId;
  pageKey: string;
  title: string;
  sourceLabel: string;
  sourceKeys: readonly string[];
  kind: "exact" | "set";
  rows: readonly (InventoryPreviewRow | null)[];
  iconRow?: InventoryPreviewRow | null;
  icon?: { name: string; id: string; hypixelId?: string };
}

interface InventoryDestination {
  id: InventoryDestinationId;
  label: string;
  state: InventorySourceState;
  icon: { name: string; id: string };
  surfaces: readonly InventorySurface[];
  value: InventoryContainerValue;
}

interface InventoryContainerValue {
  market: number | null;
  npc: number | null;
}

const inventoryValueLabel = (value: InventoryContainerValue): string | null => {
  const parts: string[] = [];
  if (value.market !== null) parts.push(`Market ${coins(value.market)}`);
  if (value.npc !== null) parts.push(`NPC ${coins(value.npc)}`);
  return parts.length > 0 ? parts.join(" · ") : null;
};

const useCompactInventoryLayout = () => {
  const rootRef = useRef<HTMLElement | null>(null);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = (width: number) => setCompact(width <= 700);
    update(root.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) update(entry.contentRect.width);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  return { rootRef, compact };
};

const BAG_CATEGORIES: readonly InventoryLayoutCategory[] = [
  "fishing_bag",
  "potion_bag",
  "sacks_bag",
  "quiver",
  "candy_inventory",
  "carnival_mask_inventory",
];

const TOOLKIT_CATEGORIES = ["farming_toolkit", "hunting_toolkit"] as const;

const TOOLKIT_ICONS: Readonly<Record<(typeof TOOLKIT_CATEGORIES)[number], NonNullable<InventorySurface["icon"]>>> = {
  farming_toolkit: { name: "Farming Toolkit", id: "FARMING_TOOLKIT", hypixelId: "FARMING_TOOLKIT" },
  hunting_toolkit: { name: "Hunting Toolkit", id: "HUNTING_TOOLKIT", hypixelId: "HUNTING_TOOLKIT" },
};

const InventoryStatePanel: React.FC<{ state: Exclude<InventoryPreviewState, "partial" | "populated"> }> = ({ state }) => {
  const copy: Record<typeof state, string> = {
    loading: "Reading inventory sources.",
    private: "Profile inventory is private or an API key is not connected.",
    unavailable: "No decoded profile inventory is available.",
    empty: "The shared profile inventory is empty.",
  };
  return (
    <section className="profile-aux-state profile-glass" aria-labelledby="profile-inventory-state-title" data-profile-section-state={state}>
      <h2 id="profile-inventory-state-title">Inventory</h2>
      {state === "loading" ? (
        <div className="profile-aux-skeleton" aria-label={copy[state]} role="status"><i /><i /><i /></div>
      ) : (
        <p role="status">{copy[state]}</p>
      )}
    </section>
  );
};

const inventoryItemIconIdentity = (row: Pick<InventoryPreviewRow, "hypixelId" | "key">): {
  iconId: string;
  hypixelId: string | null | undefined;
  preferWikiIdentity: boolean;
} => {
  const id = row.hypixelId ?? row.key;
  if (/^RUNE(?:_|$)/i.test(row.hypixelId ?? "")) {
    // Sack counters carry only a rune id and quantity, not the item's NBT.
    // A resource-pack material/model rung therefore collapses distinct runes
    // into one generic Firework Star. Keep the raw id in the tooltip, but make
    // the icon ladder resolve the exact official wiki Rune identity by name.
    return { iconId: id, hypixelId: row.hypixelId, preferWikiIdentity: true };
  }
  return { iconId: id, hypixelId: row.hypixelId, preferWikiIdentity: false };
};

const InventoryItem: React.FC<{ row: InventoryPreviewRow; sourceLabel: string }> = ({ row, sourceLabel }) => {
  const icon = inventoryItemIconIdentity(row);
  return (
    <ProfileItemTile
      id={row.hypixelId}
      name={row.name}
      wikiName={row.wikiName}
      iconId={icon.iconId}
      iconName={row.name}
      hypixelId={icon.hypixelId}
      preferWikiIdentity={icon.preferWikiIdentity}
      iconSrc={row.iconSrc}
      count={row.count}
      countLabel={inventoryTileCount(row.count)}
      tier={row.tier}
      tierIsDisplayed
      lore={row.lore}
      provenance={sourceLabel}
      ariaLabel={`${row.name}, ${row.count.toLocaleString()} in ${sourceLabel}`}
    />
  );
};

const ExactContainerCard: React.FC<{
  surface: InventorySurface;
  value: InventoryContainerValue;
  needle: string;
  collapsible?: boolean;
  initiallyExpanded?: boolean;
}> = ({ surface, value, needle, collapsible = false, initiallyExpanded = true }) => {
  const occupied = surface.rows.filter((row) => row !== null).length;
  const playerInventory = surface.pageKey === "inventory" && surface.rows.length === 36;
  const drawEmptySlots = surface.destinationId === "inventory" || surface.destinationId === "personal_vault";
  const [expanded, setExpanded] = usePersistentDisclosure(`inventory-pages-v2:${surface.pageKey}`, initiallyExpanded);
  const bodyId = `profile-inventory-${surface.pageKey}-body`;
  return (
    <ProfileSlotSurface
      className={`profile-inventory-container-card profile-glass${occupied === 0 ? " is-empty" : ""}`}
      gridClassName="profile-inventory-slot-grid"
      dataKey={surface.pageKey}
      dataAttributes={{ "data-inventory-page": surface.pageKey }}
      expanded={collapsible ? expanded : true}
      onToggle={collapsible ? () => setExpanded((current) => !current) : undefined}
      bodyId={collapsible ? bodyId : undefined}
      ariaLabel={surface.title}
      columns={9}
      slots={occupied === 0 && !drawEmptySlots ? [] : surface.rows}
      title={(
        <span className="profile-inventory-container-title" data-inventory-surface-icon={surface.iconRow?.name ?? surface.icon?.name}>
          {(surface.iconRow || surface.icon) && (
            <span aria-hidden>
              <ItemIcon
                name={surface.iconRow?.name ?? surface.icon?.name ?? surface.title}
                id={surface.iconRow?.hypixelId ?? surface.iconRow?.key ?? surface.icon?.id ?? surface.pageKey}
                hypixelId={surface.iconRow?.hypixelId ?? surface.icon?.hypixelId}
                size={22}
                fallback="blank"
              />
            </span>
          )}
          <strong>{surface.title}</strong>
        </span>
      )}
      meta={inventoryValueLabel(value) ? <span className="profile-number">{inventoryValueLabel(value)}</span> : null}
      itemAriaLabel={(row) => `${row.name}, ${row.count.toLocaleString()} in ${surface.sourceLabel}`}
      slotClassName={(row, index) => {
        const hotbar = playerInventory && index >= 27;
        return `${row ? "profile-inventory-slot" : "profile-inventory-empty-slot"}${hotbar ? " profile-inventory-slot--hotbar" : ""}${row && !inventoryPreviewRowMatches(row, needle) ? " is-search-miss" : ""}`;
      }}
      renderItem={(row) => <InventoryItem row={row} sourceLabel={surface.sourceLabel} />}
    />
  );
};

const ItemSetCard: React.FC<{
  surface: InventorySurface;
  value: InventoryContainerValue;
  needle: string;
  collapsible?: boolean;
  initiallyExpanded?: boolean;
}> = ({ surface, value, needle, collapsible = false, initiallyExpanded = true }) => {
  const rows = surface.rows.filter((row): row is InventoryPreviewRow => row !== null);
  const visible = needle.trim() ? rows.filter((row) => inventoryPreviewRowMatches(row, needle)) : rows;
  const [expanded, setExpanded] = usePersistentDisclosure(`inventory-sets-v1:${surface.pageKey}`, initiallyExpanded);
  const bodyId = `profile-inventory-${surface.pageKey}-body`;
  const title = (
    <span className="profile-inventory-item-set-title">
      {surface.icon && (
        <span className="profile-inventory-item-set-icon" aria-hidden>
          <ItemIcon
            name={surface.icon.name}
            id={surface.icon.id}
            hypixelId={surface.icon.hypixelId}
            size={22}
            fallback="blank"
          />
        </span>
      )}
      <strong>{surface.title}</strong>
    </span>
  );
  const body = visible.length > 0 ? (
    <div className="profile-inventory-item-set-grid">
      {visible.map((row) => <InventoryItem key={`${surface.pageKey}-${row.key}`} row={row} sourceLabel={surface.sourceLabel} />)}
    </div>
  ) : (
    <p className="profile-aux-empty">No items on this surface match the search.</p>
  );
  return (
    <article
      className={`profile-inventory-item-set-card profile-glass ${collapsible ? "is-collapsible" : ""} ${expanded ? "is-open" : ""}`}
      data-inventory-set={surface.pageKey}
      data-inventory-surface-icon={surface.icon?.name}
    >
      <header>
        {collapsible ? (
          <button type="button" aria-expanded={expanded} aria-controls={bodyId} onClick={() => setExpanded((current) => !current)}>
            {title}
            {inventoryValueLabel(value) && <small className="profile-number">{inventoryValueLabel(value)}</small>}
            <ChevronDown aria-hidden />
          </button>
        ) : (
          <>{title}{inventoryValueLabel(value) && <small className="profile-number">{inventoryValueLabel(value)}</small>}</>
        )}
      </header>
      {collapsible ? <div id={bodyId} hidden={!expanded}>{expanded && body}</div> : body}
    </article>
  );
};

const combineSourceStates = (groups: readonly (InventoryPreviewGroup | undefined)[]): InventorySourceState => {
  const states = groups.flatMap((group) => group ? [group.state] : []);
  if (states.includes("available")) return "available";
  if (states.includes("private")) return "private";
  if (states.includes("unavailable") || states.length === 0) return "unavailable";
  if (states.includes("loading")) return "loading";
  return "empty";
};

const DestinationState: React.FC<{ destination: InventoryDestination }> = ({ destination }) => {
  const copy: Record<InventorySourceState, string> = {
    loading: `Reading ${destination.label}.`,
    available: `${destination.label} was reported but no drawable surface is available.`,
    empty: `${destination.label} decoded successfully and is empty.`,
    private: `${destination.label} is private for this profile.`,
    unavailable: `${destination.label} was absent or could not be decoded.`,
  };
  return <p className="profile-inventory-destination-state profile-glass" role="status">{copy[destination.state]}</p>;
};

const InventoryBoard: React.FC<{
  destination: InventoryDestination;
  needle: string;
  compact: boolean;
  valueForSourceKeys: (sourceKeys: readonly string[]) => InventoryContainerValue;
}> = ({ destination, needle, compact, valueForSourceKeys }) => {
  const exact = destination.surfaces.some((surface) => surface.kind === "exact");
  const pageBoard = destination.id === "enderchest" || destination.id === "storage";
  const compactBoard = destination.id === "bags";
  const balancedBoard = destination.id === "sacks_toolkits";
  const repeatedBoard = destination.surfaces.length > 1;
  const independentlyCollapsible = repeatedBoard || (compact && (destination.id === "inventory" || destination.id === "personal_vault"));
  const sourceKeyCounts = new Map<string, number>();
  destination.surfaces.forEach((surface) => {
    const key = surface.sourceKeys.join("|");
    if (key) sourceKeyCounts.set(key, (sourceKeyCounts.get(key) ?? 0) + 1);
  });
  const headingId = `profile-inventory-${destination.id}-title`;

  return (
    <section
      className={`profile-inventory-board profile-inventory-board--${destination.id}`}
      aria-labelledby={headingId}
      data-inventory-destination={destination.id}
      data-inventory-page-count={destination.surfaces.length}
    >
      <header className="profile-inventory-board-head">
        <span className="profile-inventory-board-title">
          <span className="profile-inventory-board-icon" aria-hidden>
            <ItemIcon name={destination.icon.name} id={destination.icon.id} size={27} fallback="blank" />
          </span>
          <span>
            <h3 id={headingId}>{destination.label}</h3>
            {destination.state !== "available" ? (
              <small>{destination.state}</small>
            ) : destination.surfaces.length > 1 ? (
              <small>{inventoryValueLabel(destination.value) ?? "Value unavailable"}</small>
            ) : null}
          </span>
        </span>
        {destination.surfaces.length > 1 && (
          <strong className="profile-number">
            {destination.surfaces.length.toLocaleString()} pages
          </strong>
        )}
      </header>

      {destination.surfaces.length > 0 ? (
        <div
          className={`profile-inventory-card-board ${exact ? "profile-inventory-card-board--exact" : "profile-inventory-card-board--sets"}${pageBoard ? " profile-inventory-card-board--pages" : ""}${compactBoard ? " profile-inventory-card-board--bags" : ""}${balancedBoard ? " profile-inventory-card-board--balanced" : ""}`}
          data-profile-layout-pack={balancedBoard ? "balanced" : undefined}
        >
          {destination.surfaces.map((surface, index) => (
            (() => {
              const sourceKey = surface.sourceKeys.join("|");
              const showSurfaceValue = Boolean(sourceKey) && (sourceKeyCounts.get(sourceKey) ?? 0) === 1;
              const value = showSurfaceValue ? valueForSourceKeys(surface.sourceKeys) : { market: null, npc: null };
              return surface.kind === "exact"
                ? <ExactContainerCard surface={surface} value={value} needle={needle} collapsible={independentlyCollapsible} initiallyExpanded={index === 0} key={`inventory-pages-v2:${surface.pageKey}:${index === 0 ? "open" : "closed"}`} />
                : <ItemSetCard surface={surface} value={value} needle={needle} collapsible={independentlyCollapsible} initiallyExpanded={index === 0} key={`${surface.pageKey}:${index === 0 ? "open" : "closed"}`} />;
            })()
          ))}
        </div>
      ) : (
        <DestinationState destination={destination} />
      )}
    </section>
  );
};

export const InventoryPreview: React.FC<InventoryPreviewProps> = ({
  parsed,
  layouts,
  coverage,
  items,
  profileStatus,
  owned = null,
  chestProvenance = null,
  networth = null,
  npcSell = null,
}) => {
  const [query, setQuery] = useState("");
  const { rootRef, compact } = useCompactInventoryLayout();
  const sackDefinitions = useSackDefinitions();
  const model = useMemo(
    () => buildInventoryPreviewModel(parsed, coverage, items, profileStatus, owned, chestProvenance, layouts),
    [chestProvenance, coverage, items, layouts, owned, parsed, profileStatus],
  );
  const groupBySource = useMemo(
    () => new Map(model.groups.map((group) => [group.source, group])),
    [model.groups],
  );
  const npcBySource = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of npcSell?.rows ?? []) {
      for (const source of row.sources) {
        totals.set(source.label, (totals.get(source.label) ?? 0) + (row.unit * source.count));
      }
    }
    return totals;
  }, [npcSell]);
  const valueForSourceKeys = useCallback((sourceKeys: readonly string[]): InventoryContainerValue => {
    let market: number | null = null;
    let npc: number | null = null;
    for (const sourceKey of new Set(sourceKeys)) {
      const marketCategory = networth?.types[sourceKey];
      if (marketCategory) market = (market ?? 0) + marketCategory.total;
      if (npcSell) npc = (npc ?? 0) + (npcBySource.get(categoryLabel(sourceKey)) ?? 0);
    }
    return { market, npc };
  }, [networth, npcBySource, npcSell]);
  const destinations = useMemo((): readonly InventoryDestination[] => {
    const group = (source: InventoryPreviewGroup["source"]) => groupBySource.get(source);
    const fallbackSurface = (
      destinationId: InventoryDestinationId,
      source: InventoryPreviewGroup["source"],
      title: string,
      icon?: InventorySurface["icon"],
    ): InventorySurface[] => {
      const sourceGroup = group(source);
      return sourceGroup && sourceGroup.rows.length > 0
        ? [{ destinationId, pageKey: `${destinationId}-items`, title, sourceLabel: sourceGroup.label, sourceKeys: [source], kind: "set", rows: sourceGroup.rows, icon }]
        : [];
    };
    const exactSurface = (
      destinationId: InventoryDestinationId,
      pageKey: string,
      title: string,
      sourceLabel: string,
      sourceKey: string,
      slots: readonly InventoryLayoutSlot[],
      icon?: InventorySurface["icon"],
    ): InventorySurface => ({
      destinationId,
      pageKey,
      title,
      sourceLabel,
      sourceKeys: [sourceKey],
      kind: "exact",
      rows: inventorySlotRows(slots, items),
      icon,
    });

    const rawInventory = layouts?.containers.inventory;
    const inventorySurfaces = Array.isArray(rawInventory)
      ? [exactSurface("inventory", "inventory", "Inventory", "Inventory", "inventory", inventoryPlayerDisplaySlots(rawInventory), NETWORK_CATEGORY_ICONS.inventory)]
      : fallbackSurface("inventory", "inventory", "Inventory", NETWORK_CATEGORY_ICONS.inventory);

    const rawEnder = layouts?.containers.enderchest;
    const enderSurfaces = Array.isArray(rawEnder)
      ? inventorySlotPages(rawEnder, ENDER_CHEST_PAGE_SIZE).map((slots, index, pages) => (
          exactSurface("enderchest", `enderchest-${index + 1}`, `Ender Chest ${index + 1}/${pages.length}`, "Ender Chest", "enderchest", slots, NETWORK_CATEGORY_ICONS.enderchest)
        ))
      : fallbackSurface("enderchest", "enderchest", "Ender Chest", NETWORK_CATEGORY_ICONS.enderchest);

    const storageSurfaces = layouts?.storage.flatMap((page) => {
      if (!Array.isArray(page.slots)) return [];
      const surface = exactSurface("storage", `storage-${page.id}`, `Storage ${page.id}`, "Storage", "storage", page.slots, NETWORK_CATEGORY_ICONS.storage);
      surface.iconRow = page.icon ? inventorySlotRows([page.icon], items)[0] : null;
      return [surface];
    }) ?? [];
    if (storageSurfaces.length === 0) storageSurfaces.push(...fallbackSurface("storage", "storage", "Storage", NETWORK_CATEGORY_ICONS.storage));

    const rawVault = layouts?.containers.personal_vault;
    const vaultSurfaces = Array.isArray(rawVault)
      ? [exactSurface("personal_vault", "personal-vault", "Personal Vault", "Personal Vault", "personal_vault", rawVault, NETWORK_CATEGORY_ICONS.personal_vault)]
      : fallbackSurface("personal_vault", "personal_vault", "Personal Vault", NETWORK_CATEGORY_ICONS.personal_vault);

    const bagSurfaces = BAG_CATEGORIES.flatMap((source) => {
      const slots = layouts?.containers[source];
      const label = group(source)?.label ?? source;
      return Array.isArray(slots)
        ? [exactSurface("bags", `bag-${source}`, label, label, source, slots, NETWORK_CATEGORY_ICONS[source])]
        : fallbackSurface("bags", source, label, NETWORK_CATEGORY_ICONS[source]);
    });

    const sackSource = group("sacks");
    const sackRowsById = new Map(
      (sackSource?.rows ?? []).flatMap((row) => row.hypixelId ? [[row.hypixelId, row] as const] : []),
    );
    const sackEntries: SackEntry[] = [...sackRowsById.entries()].map(([id, row]) => ({
      id,
      name: row.name,
      count: row.count,
    }));
    const itemIdByName = new Map(
      Object.values(items).flatMap((item) => item.hypixelId
        ? [[item.name.trim().toLowerCase(), item.hypixelId] as const]
        : []),
    );
    const groupedSackRows = new Map<string, { identified: boolean; icon: string | null; rows: InventoryPreviewRow[] }>();
    for (const sack of groupSacks(
      sackEntries,
      buildSackIndex(sackDefinitions.defs, items),
    )) {
      const family = sack.identified ? sackDisplayFamily(sack.sack) : sack.sack;
      const current = groupedSackRows.get(family) ?? { identified: sack.identified, icon: sack.icon, rows: [] };
      if (!current.icon && sack.icon) current.icon = sack.icon;
      for (const entry of sack.rows) {
        const row = sackRowsById.get(entry.id);
        if (row && !current.rows.some((candidate) => candidate.key === row.key)) current.rows.push(row);
      }
      groupedSackRows.set(family, current);
    }
    const sackSurfaces: InventorySurface[] = [...groupedSackRows.entries()].map(([family, sack], index) => ({
      destinationId: "sacks_toolkits",
      pageKey: `sack-${index}-${family}`,
      title: sack.identified ? `${family} contents` : "Unsorted sack entries",
      sourceLabel: sack.identified ? `${family} contents` : "Sacks",
      sourceKeys: [],
      kind: "set",
      rows: sack.rows,
      ...(sack.icon ? {
        icon: {
          name: sack.icon,
          id: itemIdByName.get(sack.icon.trim().toLowerCase()) ?? sack.icon,
          hypixelId: itemIdByName.get(sack.icon.trim().toLowerCase()),
        },
      } : {}),
    }));
    const toolkitSurfaces = TOOLKIT_CATEGORIES.flatMap((source) => {
      const sourceGroup = group(source);
      return sourceGroup && sourceGroup.rows.length > 0
        ? [{
            destinationId: "sacks_toolkits" as const,
            pageKey: `secondary-${source}`,
            title: sourceGroup.label,
             sourceLabel: sourceGroup.label,
             sourceKeys: [source],
             kind: "set" as const,
             rows: sourceGroup.rows,
             icon: TOOLKIT_ICONS[source],
           }]
        : [];
    });

    const destination = (value: Omit<InventoryDestination, "value">): InventoryDestination => ({
      ...value,
      value: valueForSourceKeys(value.surfaces.flatMap((surface) => surface.sourceKeys)),
    });
    const destinations: InventoryDestination[] = [
      destination({ id: "inventory", label: "Inventory", state: group("inventory")?.state ?? "unavailable", icon: { name: "SkyBlock Menu", id: "NETHER_STAR" }, surfaces: inventorySurfaces }),
      destination({ id: "personal_vault", label: "Personal Vault", state: group("personal_vault")?.state ?? "unavailable", icon: { name: "Personal Bank Item", id: "PERSONAL_BANK_ITEM" }, surfaces: vaultSurfaces }),
      destination({ id: "enderchest", label: "Ender Chest", state: group("enderchest")?.state ?? "unavailable", icon: { name: "Ender Chest", id: "ENDER_CHEST" }, surfaces: enderSurfaces }),
      destination({ id: "storage", label: "Storage", state: group("storage")?.state ?? "unavailable", icon: { name: "Jumbo Backpack", id: "JUMBO_BACKPACK" }, surfaces: storageSurfaces }),
      destination({ id: "bags", label: "Bags", state: combineSourceStates(BAG_CATEGORIES.map(group)), icon: { name: "Fishing Bag", id: "FISHING_SACK" }, surfaces: bagSurfaces }),
      {
        id: "sacks_toolkits",
        label: "Sacks & Toolkits",
        state: combineSourceStates([group("sacks"), ...TOOLKIT_CATEGORIES.map(group)]),
        icon: { name: "Large Mining Sack", id: "LARGE_MINING_SACK" },
        surfaces: [...sackSurfaces, ...toolkitSurfaces],
        value: valueForSourceKeys(["sacks", ...TOOLKIT_CATEGORIES]),
      },
    ];
    const chest = group("island_chests");
    if (chestProvenance?.state === "captured" && chest) {
      destinations.push({
        id: "island_chests",
        label: "Island Chests",
        state: chest.state,
        icon: { name: "Chest", id: "CHEST" },
        surfaces: fallbackSurface("island_chests", "island_chests", "Captured Island Chests"),
        value: valueForSourceKeys(["island_chests"]),
      });
    }
    return destinations;
  }, [chestProvenance?.state, groupBySource, items, layouts, sackDefinitions.defs, valueForSourceKeys]);

  const allSurfaces = useMemo(() => destinations.flatMap((destination) => destination.surfaces), [destinations]);
  const needle = query.trim().toLowerCase();
  const searchMatches = needle
    ? allSurfaces.reduce((sum, surface) => sum + surface.rows.filter((row) => row !== null && inventoryPreviewRowMatches(row, needle)).length, 0)
    : 0;
  const hasExactLayout = Boolean(layouts && (
    Object.values(layouts.containers).some((slots) => Array.isArray(slots))
    || layouts.storage.some((page) => Array.isArray(page.slots))
  ));
  if (
    model.state !== "partial"
    && model.state !== "populated"
    && !(model.state === "empty" && hasExactLayout)
  ) return <InventoryStatePanel state={model.state} />;

  const primaryDestinations = destinations.filter((destination) => destination.id === "inventory" || destination.id === "personal_vault");
  const remainingDestinations = destinations.filter((destination) => destination.id !== "inventory" && destination.id !== "personal_vault");

  return (
    <section ref={rootRef} className="profile-aux-preview profile-inventory-preview" aria-labelledby="profile-inventory-title" data-profile-section-state={model.state}>
      <header className="profile-aux-head profile-glass">
        <div><span>Inventory</span><h2 id="profile-inventory-title">Inventory and storage</h2></div>
        <strong>{model.itemTypes.toLocaleString()} item types</strong>
      </header>
      {model.state === "partial" && <p className="profile-aux-notice" role="status">{inventoryPartialStatusCopy(model.groups, profileStatus)}</p>}
      <label className="profile-aux-search">
        <span className="sr-only">Search every inventory surface</span>
        <Search aria-hidden />
        <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search every inventory surface" autoComplete="off" />
      </label>
      {needle && <p className="profile-inventory-search-summary" role="status">{searchMatches.toLocaleString()} matching entr{searchMatches === 1 ? "y" : "ies"} across all readable surfaces.</p>}

      <div className="profile-inventory-sections">
        <div className="profile-inventory-primary-row" data-profile-layout-track="inventory-vault-pair">
          {primaryDestinations.map((destination) => (
            <InventoryBoard destination={destination} needle={needle} compact={compact} valueForSourceKeys={valueForSourceKeys} key={destination.id} />
          ))}
        </div>
        {remainingDestinations.map((destination) => (
          <InventoryBoard destination={destination} needle={needle} compact={compact} valueForSourceKeys={valueForSourceKeys} key={destination.id} />
        ))}
      </div>
    </section>
  );
};

export default InventoryPreview;
