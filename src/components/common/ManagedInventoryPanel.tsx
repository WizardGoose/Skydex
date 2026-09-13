import React, { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { InventoryHoldingsDrawer } from "./InventoryHoldingsDrawer";
import { SOURCE_LABEL, useInventoryManagement, useOwned } from "../../inventory";
import { ToggleRow } from "../../ui/kit";
import { InventoryPanel } from "./InventoryPanel";
import { StorageSelector, type StorageDestination } from "../../island/StorageSelector";
import { useIsland } from "../../island/useIsland";
import type { SectionKey } from "../../island/merge";

const PLANNER_SOURCES: readonly { key: SectionKey; label: string; iconName: string; iconId: string }[] = [
  { key: "inventory", label: "Inventory", iconName: "Chest", iconId: "CHEST" },
  { key: "sacks", label: "Sacks", iconName: "Sack of Sacks", iconId: "SACK_OF_SACKS" },
  { key: "enderChest", label: "Ender Chest", iconName: "Ender Chest", iconId: "ENDER_CHEST" },
  { key: "storage", label: "Backpacks / Storage", iconName: "Backpack", iconId: "BACKPACK" },
  { key: "chests", label: "Chests", iconName: "Chest", iconId: "CHEST" },
];

const sourceStateLabel = (state: StorageDestination["state"]): string => {
  if (state === "captured") return "Captured";
  if (state === "empty") return "Captured empty";
  if (state === "hidden") return "Private";
  return "Not captured";
};

/**
 * The page-local entry point for shared holdings.
 *
 * The read side is the inventory module: island inventory, sacks, ender chest,
 * storage/backpacks and the shard bridge arrive through one OwnedIndex. The
 * drawer is the shared item-holdings manager. It is deliberately
 * mounted here instead of navigated to, so opening it cannot change the
 * current page, search, or selected recipe.
 */
export const ManagedInventoryPanel: React.FC<{
  items: Record<string, { hypixelId: string | null }>;
  manual?: Record<string, number> | null;
  defaultOpen?: boolean;
  className?: string;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
  useInventory?: boolean;
  onUseInventoryChange?: (checked: boolean) => void;
}> = ({
  items,
  manual = null,
  defaultOpen = true,
  className = "",
  children,
  headerExtra,
  useInventory,
  onUseInventoryChange,
}) => {
  const owned = useOwned({ items, manual });
  const { sections } = useIsland();
  const management = useInventoryManagement();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSource, setActiveSource] = useState<SectionKey>("inventory");

  const entries = useMemo(() => owned.entries(), [owned]);
  const sourceNames = useMemo(
    () =>
      owned.sources
        .filter((source) => source !== "manual")
        .map((source) => SOURCE_LABEL[source])
        .filter((name, index, all) => all.indexOf(name) === index),
    [owned.sources]
  );
  const managedTypes = management.inventory.size;
  const count =
    entries.length > 0
      ? String(entries.length) + " item" + (entries.length === 1 ? "" : "s")
      : managedTypes > 0
      ? String(managedTypes) + " managed"
      : null;

  const summary =
    entries.length > 0 ? (
      <span>
        <span className="font-medium text-slate-100">{entries.length}</span> item type{entries.length === 1 ? "" : "s"} held
        {sourceNames.length > 0 && <span className="text-slate-400"> from {sourceNames.join(", ")}</span>}.
      </span>
    ) : managedTypes > 0 ? (
      <span>
        <span className="font-medium text-slate-100">{managedTypes}</span> manual item override{managedTypes === 1 ? "" : "s"}.
      </span>
    ) : (
      <span className="text-slate-400">No holdings have been reported yet.</span>
    );

  const sourceDestinations = useMemo<StorageDestination[]>(
    () =>
      PLANNER_SOURCES.map((source) => ({
        id: source.key,
        label: source.label,
        summary: sourceStateLabel(sections[source.key].state),
        state: sections[source.key].state,
        icon: { name: source.iconName, id: source.iconId },
      })),
    [sections]
  );

  const openSource = (source: string) => {
    setActiveSource(source as SectionKey);
    setDrawerOpen(true);
  };

  return (
    <>
      <InventoryPanel
        icon={Package}
        count={count}
        summary={summary}
        className={className}
        defaultOpen={defaultOpen}
        headerExtra={headerExtra}
      >
        <div data-planner-holdings-sources>
          <StorageSelector
            items={sourceDestinations}
            active={activeSource}
            onSelect={openSource}
            panelId="inventory-holdings-dialog"
            ariaLabel="Planner holdings sources"
            className="md:static md:top-auto"
          />
        </div>
          {useInventory !== undefined && onUseInventoryChange && (
          <ToggleRow
            label="Use inventory"
            checked={useInventory}
            onChange={onUseInventoryChange}
            className="[&_input]:accent-cyan-400 [&_input]:focus-visible:outline-none [&_input]:focus-visible:ring-2 [&_input]:focus-visible:ring-cyan-300/70"
          />
        )}
        {children}
      </InventoryPanel>

      <InventoryHoldingsDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
        initialSource={activeSource}
      />
    </>
  );
};

export default ManagedInventoryPanel;
