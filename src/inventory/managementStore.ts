import { useSyncExternalStore } from "react";
import type { OwnedSource } from "./types";
import {
  clearInventory,
  loadDisabledShards,
  loadInventory,
  loadOwnedAttributes,
  saveDisabledShards,
  saveInventory,
  saveOwnedAttributes,
} from "../utilities/localStorage";

/**
 * The writable half of the shared holdings surface.
 *
 * Island/profile data remains read-only in the owned-items hook; this store
 * owns only the legacy shard-suite numbers that the manager can edit. Keeping
 * the write path here means every page opens the same state and every edit is
 * persisted synchronously, without a route hop or a page-local copy.
 */
export const MANAGED_HOLDING_SOURCES = [
  "island.inventory",
  "island.sacks",
  "island.enderChest",
  "island.storage",
  "island.chests",
] as const satisfies readonly OwnedSource[];

// These are the only sources the generic holdings drawer can toggle. Shards
// remain the legacy suite's separate, read-only source and are always included
// by buildOwned when a bridge and tally are available.

const MANAGED_HOLDINGS_KEY = "inventory_enabled_sources";

const readEnabledSources = (): Set<OwnedSource> => {
  const all = new Set<OwnedSource>(MANAGED_HOLDING_SOURCES);
  if (typeof window === "undefined") return all;
  try {
    const stored = window.localStorage.getItem(MANAGED_HOLDINGS_KEY);
    if (!stored) return all;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return all;
    return new Set(parsed.filter((value): value is OwnedSource =>
      typeof value === "string" && (MANAGED_HOLDING_SOURCES as readonly string[]).includes(value)
    ));
  } catch {
    return all;
  }
};

const saveEnabledSources = (sources: Set<OwnedSource>): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MANAGED_HOLDINGS_KEY, JSON.stringify([...sources]));
  } catch {
    // A private browsing quota failure leaves the in-memory switch usable.
  }
};

export interface InventoryManagementState {
  inventory: Map<string, number>;
  ownedAttributes: Map<string, number>;
  disabledShards: Set<string>;
  /** Enabled island-container sources; the legacy shard source is not toggled here. */
  enabledSources: Set<OwnedSource>;
}
const readState = (): InventoryManagementState => ({
  inventory: loadInventory(),
  ownedAttributes: loadOwnedAttributes(),
  disabledShards: loadDisabledShards(),
  enabledSources: readEnabledSources(),
});
let current = readState();
const listeners = new Set<() => void>();

const publish = (next: InventoryManagementState): void => {
  current = next;
  for (const listener of listeners) listener();
};

const commit = (next: InventoryManagementState): void => {
  saveInventory(next.inventory);
  saveOwnedAttributes(next.ownedAttributes);
  saveDisabledShards(next.disabledShards);
  saveEnabledSources(next.enabledSources);
  publish(next);
};
export const getInventoryManagement = (): InventoryManagementState => current;

export const subscribeInventoryManagement = (listener: () => void): (() => void) => {
  listeners.add(listener);
  if (listeners.size === 1) publish(readState());
  return () => listeners.delete(listener);
};

export const setManagedInventory = (inventory: Map<string, number>): void =>
  commit({ ...current, inventory: new Map(inventory) });

/** Clear manual generic holdings without touching shard quantities or attributes. */
export const clearManagedInventory = (): void => {
  clearInventory();
  publish({ ...current, inventory: new Map() });
};

export const setManagedAttributes = (ownedAttributes: Map<string, number>): void =>
  commit({ ...current, ownedAttributes: new Map(ownedAttributes) });

export const setManagedDisabledShards = (disabledShards: Set<string>): void =>
  commit({ ...current, disabledShards: new Set(disabledShards) });

export const setManagedSourceEnabled = (source: OwnedSource, enabled: boolean): void => {
  if (!(MANAGED_HOLDING_SOURCES as readonly string[]).includes(source)) return;
  const enabledSources = new Set(current.enabledSources);
  if (enabled) enabledSources.add(source);
  else enabledSources.delete(source);
  commit({ ...current, enabledSources });
};
export const useInventoryManagement = (): InventoryManagementState =>
  useSyncExternalStore(subscribeInventoryManagement, getInventoryManagement, getInventoryManagement);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!["inventory", "owned_attributes", "inventory_disabled_shards", MANAGED_HOLDINGS_KEY].includes(event.key ?? "")) return;
    publish(readState());
  });
}
