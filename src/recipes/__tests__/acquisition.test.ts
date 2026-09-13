import { describe, expect, it } from "vitest";
import type { Item } from "../../items/useItemData";
import type { ShopListing } from "../../items/wikiShops";
import { buildAcquisitionRoutes, recommendAcquisitionRoute, type AcquisitionInput } from "../acquisition";
import { activityFromWikiLocations } from "../useWikiAcquisition";

const item = (overrides: Partial<Item> = {}): Item => ({
  name: "Test Item",
  hypixelId: "TEST_ITEM",
  tier: "RARE",
  category: "ACCESSORY",
  npcSell: null,
  yields: 1,
  recipe: null,
  ...overrides,
});

const input = (overrides: Partial<AcquisitionInput> = {}): AcquisitionInput => ({
  item: item(),
  hasGridRecipe: false,
  forge: null,
  forgeFeedsTree: false,
  shops: [],
  market: null,
  ironman: true,
  unavailable: false,
  requirements: [],
  collectionTiers: null,
  materials: null,
  wiki: null,
  formatCoins: (amount) => `${amount.toLocaleString()} coins`,
  formatDuration: (seconds) => `${seconds}s`,
  describeShopCosts: (listing) => listing.offer.costs
    .map((cost) => cost.kind === "currency" ? `${cost.amount} ${cost.currency}` : `${cost.qty} ${cost.name}`)
    .join(" + "),
  ...overrides,
});

describe("recipe acquisition routes", () => {
  it("labels Park subzones as Foraging instead of their legacy Mining island category", () => {
    expect(activityFromWikiLocations(
      ["zone:Savanna Woodland", "npc:Lumber Merchant"],
      { "zone:Savanna Woodland": "mining", "npc:Lumber Merchant": "mining" },
    )).toBe("foraging");
  });

  it("keeps a Garden location between its activity and destination", () => {
    const shop: ShopListing = {
      npc: "Garden Desk",
      offer: {
        item: "Test Item",
        stack: 1,
        costs: [{ kind: "currency", currency: "Copper", amount: 10 }],
      },
    };
    const routes = buildAcquisitionRoutes(input({
      shops: [shop],
      wiki: {
        source: "shop",
        activity: "farming",
        locations: ["npc:Garden Desk", "zone:The Garden"],
        event: null,
      },
    }));

    expect(routes[0]).toMatchObject({
      kind: "shop",
      label: "Buy from Garden Desk",
      path: ["Farming", "The Garden", "Garden Desk"],
      status: "available",
      cost: "10 Copper",
    });
  });

  it("surfaces the curated Floor VII Bedrock Chest route without inventing a price", () => {
    const routes = buildAcquisitionRoutes(input({
      item: item({ name: "Auto Recombobulator", hypixelId: "AUTO_RECOMBOBULATOR" }),
    }));

    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      kind: "drop",
      label: "Bedrock Chest drop",
      path: ["Dungeons", "Catacombs", "Floor VII / Master VII", "Bedrock Chest"],
      status: "conditional",
      cost: null,
    });
  });

  it("keeps unknown inventory distinct from missing materials", () => {
    const crafted = item({
      recipe: [{ id: "wheat", name: "Wheat", qty: 64 }],
      unlocks: [{ collection: "Wheat", tier: 3, required: 250, type: "Recipe" }],
    });
    const routes = buildAcquisitionRoutes(input({
      item: crafted,
      hasGridRecipe: true,
      materials: { state: "unknown", detail: "Wheat has no inventory count yet." },
    }));

    expect(routes[0]).toMatchObject({ kind: "craft", status: "unknown", statusLabel: "Needs a check" });
    expect(routes[0].gates[0]).toMatchObject({ state: "unknown" });
  });

  it("does not expose Bazaar as an Ironman route", () => {
    const market = { buy: 120, sell: 100 };
    const ironman = buildAcquisitionRoutes(input({ market }));
    const normal = buildAcquisitionRoutes(input({ market, ironman: false }));

    expect(ironman.some((route) => route.kind === "market")).toBe(false);
    expect(normal.find((route) => route.kind === "market")).toMatchObject({ status: "available", cost: "120 coins" });
  });

  it("makes unobtainable the only route when the item is not player-facing", () => {
    const routes = buildAcquisitionRoutes(input({ unavailable: true, market: { buy: 1, sell: 1 } }));
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ kind: "unavailable", status: "unavailable" });
  });

  it("recommends an actionable route before a cheaper route that is not ready", () => {
    const routes = buildAcquisitionRoutes(input({
      item: item({ recipe: [{ id: "wheat", name: "Wheat", qty: 64 }] }),
      hasGridRecipe: true,
      materials: { state: "missing", detail: "64 Wheat remain." },
      market: { buy: 500, sell: 480 },
      ironman: false,
    }));

    expect(recommendAcquisitionRoute(routes, { craftCost: 100, marketCost: 500 })?.kind).toBe("market");
  });

  it("uses comparable coin cost only to break an equal-readiness tie", () => {
    const routes = [
      { ...buildAcquisitionRoutes(input({ market: { buy: 500, sell: 480 }, ironman: false }))[0], id: "craft", kind: "craft" as const },
      { ...buildAcquisitionRoutes(input({ market: { buy: 500, sell: 480 }, ironman: false }))[0], id: "market", kind: "market" as const },
    ];

    expect(recommendAcquisitionRoute(routes, { craftCost: 320, marketCost: 500 })?.kind).toBe("craft");
    expect(recommendAcquisitionRoute(routes, { craftCost: 700, marketCost: 500 })?.kind).toBe("market");
  });
});
