import type { CheckedRequirement } from "../accessories/requirements";
import type { AccessoryGroup } from "../accessories/grouping";
import type { SourceCategory } from "../accessories/sources";
import {
  acquisitionOf as accessoryAcquisitionOf,
  ACQUISITION_LABEL,
  type AccessoryAcquisitionCategory,
} from "../accessories/acquisition";
import type { Item, CollectionUnlock } from "../items/useItemData";
import type { ForgeRecipe } from "../items/wikiForge";
import type { ShopListing } from "../items/wikiShops";

export type AcquisitionRouteKind =
  | "craft"
  | "forge"
  | "shop"
  | "market"
  | "collection"
  | "quest"
  | "drop"
  | "event"
  | "auction"
  | "wiki"
  | "unavailable";

export type AcquisitionRouteStatus =
  | "ready"
  | "available"
  | "conditional"
  | "missing"
  | "locked"
  | "unknown"
  | "unavailable";

export interface AcquisitionGate {
  label: string;
  detail: string;
  state: "met" | "unmet" | "unknown";
}

export interface AcquisitionRoute {
  id: string;
  kind: AcquisitionRouteKind;
  label: string;
  path: readonly string[];
  detail: string | null;
  status: AcquisitionRouteStatus;
  statusLabel: string;
  cost: string | null;
  duration: string | null;
  gates: readonly AcquisitionGate[];
  evidence: "structured" | "live" | "wiki" | "fallback";
}

export interface MaterialReadiness {
  state: "ready" | "missing" | "unknown";
  detail: string;
}

export interface WikiAcquisitionFacts {
  source: SourceCategory | null;
  locations: readonly string[];
  activity: AccessoryGroup | null;
  event: string | null;
}

export interface AcquisitionInput {
  item: Item;
  hasGridRecipe: boolean;
  forge: ForgeRecipe | null;
  forgeFeedsTree: boolean;
  shops: readonly ShopListing[];
  market: { buy: number; sell: number } | null;
  ironman: boolean;
  unavailable: boolean;
  requirements: readonly CheckedRequirement[];
  collectionTiers: Readonly<Record<string, number | null>> | null;
  materials: MaterialReadiness | null;
  wiki: WikiAcquisitionFacts | null;
  formatCoins: (amount: number) => string;
  formatDuration: (seconds: number) => string;
  describeShopCosts: (listing: ShopListing) => string;
}

export const ROUTE_STATUS_LABEL: Record<AcquisitionRouteStatus, string> = {
  ready: "Ready now",
  available: "Route open",
  conditional: "Conditional",
  missing: "Missing items",
  locked: "Locked",
  unknown: "Needs a check",
  unavailable: "Unavailable",
};

export const routeStatusRank = (status: AcquisitionRouteStatus): number => ({
  ready: 0,
  available: 1,
  conditional: 2,
  missing: 3,
  locked: 4,
  unknown: 5,
  unavailable: 6,
}[status]);

export interface RouteRecommendationContext {
  /** Cost of producing the requested quantity through the craft plan. */
  craftCost: number | null;
  /** Cost of buying the requested quantity directly from Bazaar. */
  marketCost: number | null;
}

/**
 * Pick the route Skydex can most honestly tell the player to act on now.
 *
 * Readiness is the hard boundary: an open route beats a cheaper locked or
 * incomplete one. Cost only breaks ties between routes whose status is equal,
 * and only for craft/Bazaar figures that share the same coin unit. NPC barter,
 * time, drop chance, and unknown figures are deliberately not coerced into a
 * fake comparison.
 */
export const recommendAcquisitionRoute = (
  routes: readonly AcquisitionRoute[],
  context: RouteRecommendationContext,
): AcquisitionRoute | null => {
  if (routes.length === 0) return null;
  const bestStatus = Math.min(...routes.map((route) => routeStatusRank(route.status)));
  const peers = routes.filter((route) => routeStatusRank(route.status) === bestStatus);
  const comparableCost = (route: AcquisitionRoute): number | null => {
    if (route.kind === "craft") return context.craftCost;
    if (route.kind === "market") return context.marketCost;
    return null;
  };
  const priced = peers
    .map((route, index) => ({ route, index, cost: comparableCost(route) }))
    .filter((entry): entry is { route: AcquisitionRoute; index: number; cost: number } =>
      entry.cost !== null && Number.isFinite(entry.cost)
    )
    .sort((left, right) => left.cost - right.cost || left.index - right.index);

  return priced[0]?.route ?? peers[0] ?? null;
};

const normalise = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

const ACTIVITY_LABEL: Record<Exclude<AccessoryGroup, "other">, string> = {
  combat: "Combat",
  mining: "Mining",
  farming: "Farming",
  fishing: "Fishing",
  foraging: "Foraging",
  dungeons: "Dungeons",
  rift: "The Rift",
  event: "Events",
};

const activityLabel = (activity: AccessoryGroup | null | undefined): string | null =>
  activity && activity !== "other" ? ACTIVITY_LABEL[activity] : null;

const locationTitle = (signal: string): string => {
  const separator = signal.indexOf(":");
  return (separator < 0 ? signal : signal.slice(separator + 1)).trim();
};

const pathOf = (
  activity: AccessoryGroup | null | undefined,
  locations: readonly string[],
  destination: string,
): string[] => {
  const orderedLocations = [
    ...locations.filter((location) => location.startsWith("zone:")),
    ...locations.filter((location) => !location.startsWith("zone:")),
  ];
  const locationParts = orderedLocations
    .map(locationTitle)
    .filter((location) => normalise(location) !== normalise(destination))
    .slice(0, 2);
  const values = [activityLabel(activity), ...locationParts, destination].filter(
    (value): value is string => Boolean(value),
  );
  const out: string[] = [];
  for (const value of values) {
    if (!out.some((existing) => normalise(existing) === normalise(value))) out.push(value);
  }
  return out;
};

const collectionGate = (
  unlock: CollectionUnlock | undefined,
  tiers: AcquisitionInput["collectionTiers"],
): AcquisitionGate | null => {
  if (!unlock) return null;
  const tier = tiers?.[normalise(unlock.collection)];
  const knownTier = typeof tier === "number" ? tier : null;
  const state = knownTier === null ? "unknown" : knownTier >= unlock.tier ? "met" : "unmet";
  return {
    label: `${unlock.collection} collection ${unlock.tier}`,
    detail:
      knownTier === null
        ? `${unlock.required.toLocaleString()} collection required; profile progress is not available.`
        : `Tier ${knownTier} unlocked; ${unlock.required.toLocaleString()} collection is required.`,
    state,
  };
};

const requirementGates = (requirements: readonly CheckedRequirement[]): AcquisitionGate[] =>
  requirements.map((requirement) => ({
    label: [requirement.target, requirement.threshold].filter(Boolean).join(" "),
    detail:
      requirement.state === "unknown"
        ? requirement.how
        : requirement.state === "met"
          ? `Met${requirement.have ? ` at ${requirement.have}` : ""}.`
          : `${requirement.have ? `Currently ${requirement.have}. ` : ""}${requirement.how}`,
    state: requirement.state,
  }));

const withGateState = (
  base: AcquisitionRouteStatus,
  gates: readonly AcquisitionGate[],
): AcquisitionRouteStatus => {
  if (gates.some((gate) => gate.state === "unmet")) return "locked";
  if (gates.some((gate) => gate.state === "unknown") && (base === "ready" || base === "available")) return "unknown";
  return base;
};

const makeRoute = (
  route: Omit<AcquisitionRoute, "statusLabel">,
): AcquisitionRoute => ({ ...route, statusLabel: ROUTE_STATUS_LABEL[route.status] });

const unlockFor = (item: Item, type: CollectionUnlock["type"]): CollectionUnlock | undefined =>
  item.unlocks?.find((unlock) => unlock.type === type);

const sourceRoute = (
  source: SourceCategory,
  wiki: WikiAcquisitionFacts,
  gates: readonly AcquisitionGate[],
): AcquisitionRoute | null => {
  const shared = {
    gates,
    cost: null,
    duration: null,
    evidence: "wiki" as const,
  };
  if (source === "quest") {
    return makeRoute({
      ...shared,
      id: "wiki-quest",
      kind: "quest",
      label: "Quest reward",
      path: pathOf(wiki.activity, wiki.locations, "Quest"),
      detail: "Complete the quest or questline named by the item article.",
      status: withGateState("conditional", gates),
    });
  }
  if (source === "darkAuction") {
    return makeRoute({
      ...shared,
      id: "wiki-dark-auction",
      kind: "auction",
      label: "Dark Auction",
      path: ["Trading", "Dark Auction"],
      detail: "The auction window, competition, and final bid still need to line up.",
      status: withGateState("conditional", gates),
    });
  }
  if (source === "event") {
    return makeRoute({
      ...shared,
      id: "wiki-event",
      kind: "event",
      label: wiki.event ? `${wiki.event} event` : "Event route",
      path: pathOf(wiki.activity, wiki.locations, wiki.event ?? "Event"),
      detail: "This route only exists while its event is active.",
      status: withGateState("conditional", gates),
    });
  }
  if (source === "mobDrop") {
    return makeRoute({
      ...shared,
      id: "wiki-drop",
      kind: "drop",
      label: wiki.activity === "dungeons" ? "Dungeon drop" : "Mob or boss drop",
      path: pathOf(wiki.activity, wiki.locations, wiki.activity === "dungeons" ? "Reward chest / drop" : "Drop"),
      detail: "The route is known, but chance and run count are not yet measured.",
      status: withGateState("conditional", gates),
    });
  }
  if (source === "shop") {
    return makeRoute({
      ...shared,
      id: "wiki-shop",
      kind: "shop",
      label: "NPC purchase",
      path: pathOf(wiki.activity, wiki.locations, "NPC shop"),
      detail: "The article identifies a fixed shop route; its complete cost is not in the shop index yet.",
      status: withGateState("available", gates),
    });
  }
  if (source === "wiki" && (wiki.activity || wiki.locations.length > 0)) {
    return makeRoute({
      ...shared,
      id: "wiki-route",
      kind: "wiki",
      label: "Wiki route",
      path: pathOf(wiki.activity, wiki.locations, "See item article"),
      detail: "Skydex knows where this belongs, but not enough yet to claim the exact method.",
      status: "unknown",
    });
  }
  return null;
};

const CURATED_KIND: Record<AccessoryAcquisitionCategory, AcquisitionRouteKind> = {
  collections: "collection",
  upgradePaths: "craft",
  slayer: "drop",
  dungeons: "drop",
  kuudra: "drop",
  mining: "forge",
  garden: "quest",
  fishing: "drop",
  dragons: "drop",
  quests: "quest",
  npcShops: "shop",
  mobDrops: "drop",
  shensAuction: "auction",
  darkAuction: "auction",
  events: "event",
  generalCrafting: "craft",
  legacy: "unavailable",
  needsReview: "wiki",
};

const curatedPath = (category: AccessoryAcquisitionCategory, detail: string | null): string[] => {
  if (category === "dungeons") {
    const floor = detail?.match(/Floor\s+([IVX]+)(?:\s+or\s+Master\s+([IVX]+))?/i);
    return [
      "Dungeons",
      "Catacombs",
      floor ? `Floor ${floor[1]}${floor[2] ? ` / Master ${floor[2]}` : ""}` : "Dungeon run",
      ...(detail && /bedrock chest/i.test(detail) ? ["Bedrock Chest"] : []),
    ];
  }
  if (category === "garden") return ["Farming", "The Garden", "Garden route"];
  if (category === "mining") return ["Mining", "Dwarven Mines", "The Forge"];
  if (category === "kuudra") return ["Combat", "Crimson Isle", "Kuudra reward chest"];
  if (category === "shensAuction") return ["Trading", "Shen's Auction"];
  if (category === "darkAuction") return ["Trading", "Dark Auction"];
  if (category === "events") return ["Events", "Limited-time route"];
  if (category === "fishing") return ["Fishing", "Fishing route"];
  if (category === "slayer") return ["Combat", "Slayer"];
  if (category === "dragons") return ["Combat", "The End", "Dragon route"];
  if (category === "npcShops") return ["NPC shops"];
  if (category === "collections") return ["Collections"];
  if (category === "quests") return ["Quest"];
  if (category === "mobDrops") return ["Combat", "Mob or boss drop"];
  if (category === "legacy") return ["Unavailable"];
  return [ACQUISITION_LABEL[category]];
};

const curatedStatus = (category: AccessoryAcquisitionCategory): AcquisitionRouteStatus => {
  if (category === "legacy") return "unavailable";
  if (["dungeons", "kuudra", "fishing", "dragons", "mobDrops", "shensAuction", "darkAuction", "events", "quests"].includes(category)) {
    return "conditional";
  }
  if (category === "needsReview" || category === "generalCrafting") return "unknown";
  return "available";
};

export function buildAcquisitionRoutes(input: AcquisitionInput): AcquisitionRoute[] {
  if (input.unavailable) {
    return [makeRoute({
      id: "unavailable",
      kind: "unavailable",
      label: "No normal acquisition route",
      path: ["Unavailable"],
      detail: "The wiki or Hypixel resource marks this as an admin, testing, or removed item.",
      status: "unavailable",
      cost: null,
      duration: null,
      gates: [],
      evidence: "structured",
    })];
  }

  const routes: AcquisitionRoute[] = [];
  const profileGates = requirementGates(input.requirements);
  const wiki = input.wiki;
  const locations = wiki?.locations ?? [];
  const activity = wiki?.activity ?? null;

  if (input.hasGridRecipe && input.item.recipe) {
    const unlock = unlockFor(input.item, "Recipe");
    const collection = collectionGate(unlock, input.collectionTiers);
    const gates = [...profileGates, ...(collection ? [collection] : [])];
    const material = input.materials ?? { state: "unknown" as const, detail: "Material holdings are not available." };
    const base: AcquisitionRouteStatus = material.state === "ready" ? "ready" : material.state === "missing" ? "missing" : "unknown";
    routes.push(makeRoute({
      id: "craft",
      kind: "craft",
      label: "Craft it",
      path: pathOf(activity, unlock ? [`collection:${unlock.collection}`] : [], "Crafting Table"),
      detail: `${input.item.recipe.length} ingredient type${input.item.recipe.length === 1 ? "" : "s"}${input.item.yields > 1 ? `, makes ${input.item.yields}` : ""}. ${material.detail}`,
      status: withGateState(base, gates),
      cost: null,
      duration: null,
      gates,
      evidence: "structured",
    }));
  }

  if (input.forge) {
    const unlock = unlockFor(input.item, "Dwarven Forge Recipe");
    const collection = collectionGate(unlock, input.collectionTiers);
    const forgeGate: AcquisitionGate | null = input.forge.hotm === null ? null : {
      label: `Heart of the Mountain ${input.forge.hotm}`,
      detail: "The recipe states this requirement; the current profile projection cannot verify it yet.",
      state: "unknown",
    };
    const gates = [...profileGates, ...(collection ? [collection] : []), ...(forgeGate ? [forgeGate] : [])];
    const material = input.forgeFeedsTree ? input.materials : null;
    const base: AcquisitionRouteStatus = material?.state === "ready"
      ? "ready"
      : material?.state === "missing"
        ? "missing"
        : material?.state === "unknown"
          ? "unknown"
          : "available";
    routes.push(makeRoute({
      id: "forge",
      kind: "forge",
      label: "Forge it",
      path: ["Mining", "Dwarven Mines", "The Forge"],
      detail: `${input.forge.ingredients.length} ingredient type${input.forge.ingredients.length === 1 ? "" : "s"}${material ? `. ${material.detail}` : ""}`,
      status: withGateState(base, gates),
      cost: input.forge.coins === null ? null : input.formatCoins(input.forge.coins),
      duration: input.forge.seconds === null ? input.forge.duration : input.formatDuration(input.forge.seconds),
      gates,
      evidence: "structured",
    }));
  }

  for (const [index, listing] of input.shops.slice(0, 8).entries()) {
    const unlock = unlockFor(input.item, "Trade");
    const collection = collectionGate(unlock, input.collectionTiers);
    const gates = [...profileGates, ...(collection ? [collection] : [])];
    routes.push(makeRoute({
      id: `shop-${normalise(listing.npc)}-${index}`,
      kind: "shop",
      label: `Buy from ${listing.npc}`,
      path: pathOf(activity, locations, listing.npc),
      detail: listing.event ? "This shop appears during its event." : "Fixed NPC offer.",
      status: withGateState(listing.event ? "conditional" : "available", gates),
      cost: `${listing.offer.stack > 1 ? `${listing.offer.stack}x for ` : ""}${input.describeShopCosts(listing)}`,
      duration: null,
      gates,
      evidence: "structured",
    }));
  }

  if (input.market && !input.ironman) {
    routes.push(makeRoute({
      id: "market",
      kind: "market",
      label: "Buy from Bazaar",
      path: ["Trading", "Bazaar"],
      detail: `Current sell offer ${input.formatCoins(input.market.sell)}; instant buy ${input.formatCoins(input.market.buy)}.`,
      status: withGateState("available", profileGates),
      cost: input.formatCoins(input.market.buy),
      duration: null,
      gates: profileGates,
      evidence: "live",
    }));
  }

  const sourceAlreadyCovered =
    (wiki?.source === "craftable" && input.hasGridRecipe) ||
    (wiki?.source === "shop" && input.shops.length > 0);
  if (wiki?.source && !sourceAlreadyCovered) {
    const route = sourceRoute(wiki.source, wiki, profileGates);
    if (route) routes.push(route);
  }

  if (routes.length === 0) {
    const accessoryRoute = accessoryAcquisitionOf({
      entry: {
        id: input.item.hypixelId ?? input.item.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_"),
        craftable: input.hasGridRecipe,
        familyRank: 1,
        unlocks: input.item.unlocks ?? null,
      },
      source: wiki?.source ?? (input.hasGridRecipe ? "craftable" : "wiki"),
      learnedSource: wiki?.source,
      checked: input.requirements,
      group: wiki?.activity ?? "other",
      locations,
    });
    if (accessoryRoute.category !== "needsReview") {
      const status = withGateState(curatedStatus(accessoryRoute.category), profileGates);
      routes.push(makeRoute({
        id: `curated-${accessoryRoute.category}`,
        kind: CURATED_KIND[accessoryRoute.category],
        label:
          accessoryRoute.category === "dungeons" && accessoryRoute.detail && /bedrock chest/i.test(accessoryRoute.detail)
            ? "Bedrock Chest drop"
            : ACQUISITION_LABEL[accessoryRoute.category],
        path: curatedPath(accessoryRoute.category, accessoryRoute.detail),
        detail: accessoryRoute.detail,
        status,
        cost: null,
        duration: null,
        gates: profileGates,
        evidence: accessoryRoute.evidence === "curated" ? "structured" : accessoryRoute.evidence,
      }));
    }

    const trade = unlockFor(input.item, "Trade");
    const collection = collectionGate(trade, input.collectionTiers);
    if (routes.length === 0 && trade && collection) {
      routes.push(makeRoute({
        id: "collection-trade",
        kind: "collection",
        label: "Collection trade",
        path: [trade.collection, `Collection ${trade.tier}`, "NPC trade"],
        detail: `${trade.required.toLocaleString()} collection unlocks the trade.`,
        status: withGateState("available", [collection, ...profileGates]),
        cost: null,
        duration: null,
        gates: [collection, ...profileGates],
        evidence: "structured",
      }));
    } else if (routes.length === 0) {
      routes.push(makeRoute({
        id: "unknown",
        kind: "wiki",
        label: "Route not indexed yet",
        path: pathOf(activity, locations, "See item article"),
        detail: "Skydex will not guess a source when the current data does not prove one.",
        status: "unknown",
        cost: null,
        duration: null,
        gates: profileGates,
        evidence: "fallback",
      }));
    }
  }

  return routes.sort((left, right) => routeStatusRank(left.status) - routeStatusRank(right.status));
}
