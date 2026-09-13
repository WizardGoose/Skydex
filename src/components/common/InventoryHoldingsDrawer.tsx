import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LockKeyhole, Package, RefreshCw, X } from "lucide-react";
import type { SectionKey, SectionProvenance, SectionState } from "../../island/merge";
import type { IslandChest, IslandItem, IslandSnapshot } from "../../island/types";
import { slotLayout } from "../../island/aggregate";
import { CardBoard, CollapseCard } from "../../island/boardPrimitives";
import { buildSackIndex, groupSacks, liveSackEntries, useSackDefinitions } from "../../island/sacks";
import { useIsland } from "../../island/useIsland";
import { StorageSelector, type StorageDestination } from "../../island/StorageSelector";
import { useInventoryManagement, setManagedSourceEnabled, type OwnedSource } from "../../inventory";
import { ItemIcon } from "../../ui/ItemIcon";
import { BARE_CONTEXT, SLOT_PANE, SlotGrid, TrueGrid, type SlotItem } from "../../ui/slotGrid";
import { BTN_PRIMARY, BTN_QUIET, FOCUS, INPUT, NUM, PANEL, TILE } from "../../ui/kit";

interface ItemRecord {
  hypixelId: string | null;
  name?: string;
}

interface HoldingRow {
  id: string;
  name: string;
  count: number;
}

interface SourceOption {
  key: SectionKey;
  label: string;
  iconName: string;
  iconId: string;
  ownedSource: OwnedSource;
}

const SOURCE_OPTIONS: readonly SourceOption[] = [
  { key: "inventory", label: "Inventory", iconName: "Chest", iconId: "CHEST", ownedSource: "island.inventory" },
  { key: "sacks", label: "Sacks", iconName: "Sack of Sacks", iconId: "SACK_OF_SACKS", ownedSource: "island.sacks" },
  { key: "enderChest", label: "Ender Chest", iconName: "Ender Chest", iconId: "ENDER_CHEST", ownedSource: "island.enderChest" },
  { key: "storage", label: "Backpacks / Storage", iconName: "Backpack", iconId: "BACKPACK", ownedSource: "island.storage" },
  { key: "chests", label: "Chests", iconName: "Chest", iconId: "CHEST", ownedSource: "island.chests" },
];

const displayId = (id: string): string =>
  id
    .replace(/^minecraft:/i, "")
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

const itemName = (id: string, items: Record<string, ItemRecord>): string => {
  const match = Object.values(items).find((item) => item.hypixelId?.toLowerCase() === id.toLowerCase());
  return match?.name ?? displayId(id);
};

const sourceRows = (key: SectionKey, snapshot: IslandSnapshot | null, items: Record<string, ItemRecord>): HoldingRow[] => {
  if (!snapshot) return [];
  const counts = new Map<string, number>();
  const add = (id: string, count: number) => {
    if (!id || !Number.isFinite(count) || count <= 0) return;
    counts.set(id, (counts.get(id) ?? 0) + count);
  };
  if (key === "sacks") {
    for (const [id, count] of Object.entries(snapshot.sacks)) add(id, count);
  } else if (key === "chests") {
    for (const chest of snapshot.chests) for (const item of chest.items) add(item.id, item.count);
  } else {
    for (const item of snapshot[key] ?? []) add(item.id, item.count);
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, name: itemName(id, items), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const rolledItems = (list: readonly IslandItem[]): SlotItem[] => {
  const counts = new Map<string, { name: string; count: number }>();
  for (const item of list) {
    const previous = counts.get(item.id);
    counts.set(item.id, {
      name: item.name || displayId(item.id),
      count: (previous?.count ?? 0) + item.count,
    });
  }
  return [...counts.entries()]
    .map(([id, value]) => ({ id, name: value.name, count: value.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
};

const ContainerGrid: React.FC<{ list: IslandItem[]; capacity: number; needle: string }> = ({ list, capacity, needle }) => {
  const cells = useMemo(() => slotLayout(list, capacity), [capacity, list]);
  const packed = useMemo(() => rolledItems(list), [list]);
  return (
    <div className={SLOT_PANE}>
      {cells ? (
        <TrueGrid
          cells={cells.map((cell) => cell ? { id: cell.id, name: cell.name, count: cell.count, extra: cell.extra } : null)}
          needle={needle}
          context={BARE_CONTEXT}
        />
      ) : (
        <SlotGrid items={packed} capacity={capacity} needle={needle} context={BARE_CONTEXT} />
      )}
    </div>
  );
};

const chestKey = (chest: IslandChest): string => chest.pos.join(":");

const stateText = (state: SectionState): string => {
  if (state === "captured") return "Captured";
  if (state === "empty") return "Captured empty";
  if (state === "hidden") return "Private / unavailable";
  return "Not captured yet";
};

const sourceSummary = (state: SectionState, rows: readonly HoldingRow[]): string => {
  if (state === "captured" && rows.length > 0) return rows.length + " item types";
  if (state === "empty") return "Empty";
  return stateText(state);
};

const timestampLabel = (provenance: SectionProvenance): string => {
  if (provenance.at === null) return "No snapshot time";
  return (provenance.source ?? "source") + " . " + new Date(provenance.at).toLocaleString();
};

export const InventoryHoldingsDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  items: Record<string, ItemRecord>;
  initialSource?: SectionKey;
}> = ({ open, onClose, items, initialSource = "inventory" }) => {
  const { snapshot, sections, refreshApi } = useIsland();
  const management = useInventoryManagement();
  const [activeSource, setActiveSource] = useState<SectionKey>("inventory");
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [openCards, setOpenCards] = useState<Set<string>>(() => new Set());
  const sackDefinitions = useSackDefinitions();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    setActiveSource(initialSource);
    openerRef.current = document.activeElement;
    headingRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = headingRef.current?.closest('[role="dialog"]');
      const focusable = dialog?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = dialog?.contains(active) ?? false;
      if (!inside) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (active === first || active === headingRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
      openerRef.current = null;
    };
  }, [initialSource, open]);

  const rows = useMemo(() => sourceRows(activeSource, snapshot, items), [activeSource, snapshot, items]);
  const needle = query.trim().toLowerCase();
  const destinations: StorageDestination[] = SOURCE_OPTIONS.map((option) => ({
    id: option.key,
    label: option.label,
    summary: sourceSummary(sections[option.key].state, sourceRows(option.key, snapshot, items)),
    state: sections[option.key].state,
    icon: { name: option.iconName, id: option.iconId },
  }));
  const activeOption = SOURCE_OPTIONS.find((option) => option.key === activeSource) ?? SOURCE_OPTIONS[0];
  const activeProvenance = sections[activeSource];
  const activeState = activeProvenance.state;
  const itemIndex = useMemo(
    () => Object.fromEntries(Object.entries(items).map(([key, item]) => [key, { ...item, name: item.name ?? displayId(item.hypixelId ?? key) }])),
    [items]
  );
  const sackIndex = useMemo(() => buildSackIndex(sackDefinitions.defs, itemIndex), [itemIndex, sackDefinitions.defs]);
  const sackGroups = useMemo(() => groupSacks(liveSackEntries(snapshot?.sacks), sackIndex), [sackIndex, snapshot?.sacks]);
  const selectedList = activeSource === "inventory"
    ? snapshot?.inventory
    : activeSource === "enderChest"
      ? snapshot?.enderChest
      : activeSource === "storage"
        ? snapshot?.storage
        : undefined;

  const toggleCard = (key: string) => setOpenCards((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshApi(true);
    } finally {
      setRefreshing(false);
    }
  };

  if (!open) return null;

  const drawer = (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-3 backdrop-blur-sm sm:p-8"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        id="inventory-holdings-dialog"
        aria-labelledby="inventory-holdings-title"
        className={PANEL + " my-auto flex max-h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden shadow-2xl shadow-black/50"}
      >
        <div className="flex items-start gap-3 border-b border-white/10 px-4 py-3">
          <Package className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 ref={headingRef} id="inventory-holdings-title" tabIndex={-1} className="text-[15px] font-semibold text-slate-100">Inventory</h2>
          </div>
          <button type="button" onClick={onClose} className={BTN_QUIET + " shrink-0"} aria-label="Close storage details">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <label className="sr-only" htmlFor="inventory-holdings-search">Search held items</label>
            <input id="inventory-holdings-search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search every container" className={INPUT + " min-w-0 flex-1"} />
            <button type="button" onClick={() => void refresh()} disabled={refreshing} className={BTN_PRIMARY + " disabled:cursor-wait disabled:opacity-60"}>
              <RefreshCw className={refreshing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden />
              {refreshing ? "Refreshing..." : "Refresh snapshot"}
            </button>
          </div>

          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto md:grid-cols-[11rem_minmax(0,1fr)]">
            <StorageSelector items={destinations} active={activeSource} onSelect={(id) => setActiveSource(id as SectionKey)} panelId="inventory-holdings-panel" className="md:static md:top-auto md:self-start" />
            <div id="inventory-holdings-panel" role="tabpanel" aria-labelledby={"storage-tab-" + activeSource} tabIndex={0} className="min-w-0 space-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/90">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/8 pb-2">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-[13px] font-semibold text-slate-100">{activeOption.label}</h3>
                  <span className={NUM + " text-[10px] text-slate-500"}>{timestampLabel(activeProvenance)}</span>
                </div>
                <label className="inline-flex items-center gap-2 text-[11px] text-slate-300">
                  <input
                    type="checkbox"
                    checked={management.enabledSources.has(activeOption.ownedSource)}
                    onChange={(event) => setManagedSourceEnabled(activeOption.ownedSource, event.currentTarget.checked)}
                    className="accent-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                  />
                  Use in planners
                </label>
              </div>

              {activeState === "hidden" || activeState === "absent" ? (
                <div className="flex items-start gap-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2.5 text-[11px] text-amber-200" role="status">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{activeState === "hidden" ? "Hypixel or the selected profile marked this source private. It is unavailable, not zero." : "This container has not been captured yet. Refresh the profile or open it through the Skydex mod."}</span>
                </div>
              ) : activeState === "empty" || rows.length === 0 ? (
                <div className={TILE + " px-3 py-5 text-center text-[11px] text-slate-500"}>This source was captured and is empty.</div>
              ) : activeSource === "chests" ? (
                <CardBoard
                  items={(snapshot?.chests ?? []).filter((chest) => !needle || chest.items.some((item) => item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle)))}
                  keyOf={chestKey}
                  render={(chest) => {
                    const key = chestKey(chest);
                    const isOpen = openCards.has(key);
                    return (
                      <CollapseCard
                        icon={<ItemIcon name="Chest" id="CHEST" size={28} fallback="blank" />}
                        title={chest.name || "Chest"}
                        meta={`${chest.pos.join(" ")} · ${chest.items.length} stacks`}
                        open={isOpen}
                        hit={needle !== "" && chest.items.some((item) => item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle))}
                        onToggle={() => toggleCard(key)}
                      >
                        {isOpen && <ContainerGrid list={chest.items} capacity={54} needle={needle} />}
                      </CollapseCard>
                    );
                  }}
                />
              ) : activeSource === "sacks" ? (
                <CardBoard
                  items={sackGroups.filter((group) => !needle || group.rows.some((row) => row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle)))}
                  keyOf={(group) => group.sack}
                  render={(group) => {
                    const isOpen = openCards.has(group.sack);
                    return (
                      <CollapseCard
                        icon={<ItemIcon name={group.icon ?? group.sack} size={28} fallback="blank" />}
                        title={group.sack}
                        meta={`${group.rows.length} items`}
                        right={<span className={NUM + " text-[10px] text-slate-400"}>{group.total.toLocaleString()}</span>}
                        open={isOpen}
                        hit={needle !== "" && group.rows.some((row) => row.name.toLowerCase().includes(needle) || row.id.toLowerCase().includes(needle))}
                        onToggle={() => toggleCard(group.sack)}
                      >
                        {isOpen && (
                          <div className="border-t border-white/8 px-2 pb-1.5">
                            {group.rows.map((row) => (
                              <div key={row.id} className="flex items-center gap-2 border-b border-white/8 py-1 last:border-0">
                                <ItemIcon name={row.name} id={row.id} size={20} fallback="blank" />
                                <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300">{row.name}</span>
                                <span className={NUM + " text-[11px] text-slate-100"}>{row.count.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </CollapseCard>
                    );
                  }}
                />
              ) : selectedList ? (
                <ContainerGrid list={selectedList} capacity={activeSource === "inventory" ? 36 : 54} needle={needle} />
              ) : (
                <p className="py-5 text-center text-[11px] text-slate-500">No captured container data.</p>
              )}
            </div>
          </div>

          {management.inventory.size > 0 && (
            <details className="border-t border-white/8 pt-2">
              <summary className={FOCUS + " cursor-pointer list-none text-[11px] text-slate-300 [&::-webkit-details-marker]:hidden"}>Manual generic overrides ({management.inventory.size})</summary>
              <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                {[...management.inventory.entries()].map(([id, count]) => (
                  <div key={id} className="flex items-baseline justify-between gap-2 border-b border-white/8 px-1.5 py-1 text-[11px]">
                    <span className="min-w-0 truncate text-slate-400">{displayId(id)}</span>
                    <span className={NUM + " shrink-0 text-slate-200"}>{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

        </div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
};

export default InventoryHoldingsDrawer;
