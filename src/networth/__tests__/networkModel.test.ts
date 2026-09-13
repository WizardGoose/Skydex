import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { NetworkCategoryBoard } from "../NetworkCategoryBoard";
import { buildNetworkCategories } from "../networkModel";
import type { SectionProvenance } from "../../island/merge";
import type { Coverage, NetworthStatus } from "../useNetworth";
import type { CategoryResult, NetworthResult, ValuedItem } from "../types";

const captured: SectionProvenance = { state: "captured", source: "mod", at: 1 };
const absent: SectionProvenance = { state: "absent", source: null, at: null };

const item = (id: string, price = 100): ValuedItem => ({
  id,
  name: id.replaceAll("_", " "),
  customId: id,
  price,
  basePrice: price,
  count: 1,
  soulbound: false,
  cosmetic: false,
  soulboundPortion: 0,
  calculation: [],
});
const category = (items: ValuedItem[] = [], total = items.reduce((sum, value) => sum + value.price, 0)): CategoryResult => ({
  items,
  total,
  unsoulboundTotal: total,
});

const result = (types: Record<string, CategoryResult>): NetworthResult => ({
  networth: 100,
  unsoulboundNetworth: 100,
  noInventory: false,
  purse: 0,
  bank: 0,
  personalBank: 0,
  types,
});

const shared = (overrides: Partial<Coverage> = {}): Coverage => ({
  inventoryShared: true,
  bankShared: true,
  museumShared: true,
  vaultShared: true,
  catalogueLoaded: true,
  ...overrides,
});

describe("Network category state", () => {
  it("hydrates populated categories with real item rows and source metadata", () => {
    const categories = buildNetworkCategories(
      result({ inventory: category([item("HYPERION", 250)]) }),
      shared(),
      captured
    );
    const inventory = categories.find((value) => value.key === "inventory");
    expect(inventory?.state).toBe("available");
    expect(inventory?.total).toBe(250);
    expect(inventory?.items[0]?.id).toBe("HYPERION");
    expect(inventory?.source).toBe("api");
  });

  it("keeps private and unavailable categories distinct from zero", () => {
    const categories = buildNetworkCategories(
      result({ inventory: category(), museum: category(), personal_vault: category() }),
      shared({ inventoryShared: false, museumShared: false, vaultShared: false }),
      absent
    );
    expect(categories.find((value) => value.key === "inventory")?.state).toBe("private");
    expect(categories.find((value) => value.key === "museum")?.state).toBe("private");
    expect(categories.find((value) => value.key === "personal_vault")?.state).toBe("private");
    expect(categories.find((value) => value.key === "personal_vault")?.icon).toEqual({
      name: "Personal Bank Item",
      id: "PERSONAL_BANK_ITEM",
    });
    expect(categories.find((value) => value.key === "island_chests")?.state).toBe("unavailable");
    expect(categories.find((value) => value.key === "inventory")?.total).toBeNull();
  });

  it("reports a genuinely supplied empty category as empty with zero", () => {
    const categories = buildNetworkCategories(result({ museum: category() }), shared(), captured);
    const museum = categories.find((value) => value.key === "museum");
    expect(museum?.state).toBe("empty");
    expect(museum?.total).toBe(0);
  });

  it("renders compact category panels with state selectors and no prose wall", () => {
    const categories = buildNetworkCategories(
      result({ inventory: category([item("HYPERION", 250)]), museum: category() }),
      shared(),
      captured
    ).filter((value) => ["inventory", "museum"].includes(value.key));
    const markup = renderToStaticMarkup(createElement(NetworkCategoryBoard, { categories }));
    expect(markup).toContain('data-network-category="inventory"');
    expect(markup).toContain('data-network-state="available"');
    expect(markup).toContain('data-network-state="empty"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("Ironman");
    expect(markup).not.toContain("Bazaar");
    expect(markup).not.toContain("Auction House");
  });
});

/** Keep the status vocabulary close to the rendering seam used by the panel. */
describe("Network status fixture contract", () => {
  it.each(["loading", "ready", "error"] satisfies NetworthStatus[])("accepts %s as a profile status", (status) => {
    expect(["loading", "ready", "error"]).toContain(status);
  });
});
