import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  StorageSelector,
  type StorageDestination,
} from "../StorageSelector";
import { storageSummary, storageTabIndexForKey } from "../storageSelectorModel";

const ITEMS: StorageDestination[] = [
  { id: "inventory", label: "Inventory", summary: "18 stacks", state: "captured", icon: { name: "SkyBlock Menu", id: "NETHER_STAR" } },
  { id: "chests", label: "Chests", summary: "4 chests", state: "captured", icon: { name: "Chest", id: "CHEST" } },
  { id: "ender-chest", label: "Ender Chest", summary: "Not captured", state: "absent", icon: { name: "Ender Chest", id: "ENDER_CHEST" } },
  { id: "storage", label: "Storage", summary: "Empty", state: "empty", icon: { name: "Jumbo Backpack", id: "JUMBO_BACKPACK" } },
  { id: "sacks", label: "Sacks", summary: "31 types", state: "captured", icon: { name: "Large Mining Sack", id: "LARGE_MINING_SACK" } },
];

describe("storage summaries", () => {
  it("keeps missing, private and genuinely empty data distinct", () => {
    expect(storageSummary("absent", 0, "stack")).toBe("Not captured");
    expect(storageSummary("hidden", 0, "stack")).toBe("Not shared");
    expect(storageSummary("empty", 0, "stack")).toBe("Empty");
  });

  it("labels real counts without inventing a total", () => {
    expect(storageSummary("captured", 1, "chest")).toBe("1 chest");
    expect(storageSummary("captured", 2, "chest")).toBe("2 chests");
    expect(storageSummary("captured", 2, "type", "types")).toBe("2 types");
  });
});

describe("storage tab keyboard movement", () => {
  it("supports both rail and strip arrows, with wraparound", () => {
    expect(storageTabIndexForKey("ArrowRight", 4, 5)).toBe(0);
    expect(storageTabIndexForKey("ArrowDown", 1, 5)).toBe(2);
    expect(storageTabIndexForKey("ArrowLeft", 0, 5)).toBe(4);
    expect(storageTabIndexForKey("ArrowUp", 3, 5)).toBe(2);
  });

  it("supports Home and End without swallowing unrelated keys", () => {
    expect(storageTabIndexForKey("Home", 3, 5)).toBe(0);
    expect(storageTabIndexForKey("End", 1, 5)).toBe(4);
    expect(storageTabIndexForKey("Enter", 1, 5)).toBeNull();
  });
});

describe("the storage selector", () => {
  const markup = renderToStaticMarkup(
    createElement(StorageSelector, { items: ITEMS, active: "ender-chest", onSelect: () => undefined, panelId: "inventory-storage-panel" })
  );

  it("renders one linked tab per real storage surface", () => {
    expect(markup.match(/role="tab"/g)).toHaveLength(ITEMS.length);
    expect(markup).toContain('aria-controls="inventory-storage-panel"');
    expect(markup).toContain('id="storage-tab-ender-chest"');
    expect(markup).toContain('aria-selected="true"');
  });

  it("uses authentic item ids through the shared ItemIcon pipeline", () => {
    for (const id of ["NETHER_STAR", "CHEST", "ENDER_CHEST", "JUMBO_BACKPACK", "LARGE_MINING_SACK"]) {
      expect(markup).toContain(`data-item-id="${id}"`);
    }
  });

  it("keeps the active tab as the only keyboard tab stop", () => {
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(ITEMS.length - 1);
  });
});
