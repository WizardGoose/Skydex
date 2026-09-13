import {
  checkRequirement,
  readRequirement,
  type CheckedRequirement,
  type PlayerProgress,
} from "../accessories/requirements";

export type CollectionSourceAccessState = "available" | "locked" | "unknown";
export type CollectionSourceRoute = "progression" | "trade" | null;

export interface CollectionSourceGate {
  sourceId: string;
  sourceName: string;
  sourceWikiName: string;
  requirementLabel: string;
  requirement: CheckedRequirement;
  tradeable: boolean;
}

export interface CollectionSourceAccess {
  state: CollectionSourceAccessState;
  route: CollectionSourceRoute;
  label: string;
  detail: string;
  how: string;
}

interface CollectionSourceRule {
  collectionId: string;
  sourceId: string;
  sourceName: string;
  sourceWikiName: string;
  requirementLabel: string;
  requirement: unknown;
  tradeable: boolean;
}

/**
 * Collection-source facts that Hypixel's collection resource does not expose.
 *
 * Chili Pepper is currently the sole collection produced only by a minion.
 * The shipped Wiki minion snapshot records the Inferno Minion at Blaze Slayer
 * III, while the item page records Chili Pepper as its Hypergolic-fuel drop.
 */
const COLLECTION_SOURCE_RULES: readonly CollectionSourceRule[] = [{
  collectionId: "CHILI_PEPPER",
  sourceId: "inferno",
  sourceName: "Inferno Minion",
  sourceWikiName: "Inferno Minion",
  requirementLabel: "Inferno 3",
  requirement: { type: "SLAYER", slayer_boss_type: "blaze", level: 3 },
  tradeable: true,
}];

const normalizeId = (value: string): string => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_");

export const collectionSourceGateFor = (
  collectionId: string,
  progress: PlayerProgress,
): CollectionSourceGate | null => {
  const rule = COLLECTION_SOURCE_RULES.find((candidate) => candidate.collectionId === normalizeId(collectionId));
  if (!rule) return null;
  const requirement = readRequirement(rule.requirement);
  if (!requirement) return null;
  return {
    sourceId: rule.sourceId,
    sourceName: rule.sourceName,
    sourceWikiName: rule.sourceWikiName,
    requirementLabel: rule.requirementLabel,
    requirement: checkRequirement(requirement, progress),
    tradeable: rule.tradeable,
  };
};

/** Null means the profile mode is not one of the economy models Skydex understands. */
export const tradingAllowedForGameMode = (gameMode: string | null | undefined): boolean | null => {
  if (gameMode === null || gameMode === undefined || gameMode.trim() === "") return true;
  const normalized = gameMode.trim().toLowerCase();
  if (normalized === "ironman" || normalized === "island") return false;
  if (normalized === "normal") return true;
  return null;
};

export const resolveCollectionSourceGate = (
  gate: CollectionSourceGate | null | undefined,
  tradingAllowed: boolean | null,
): CollectionSourceAccess | null => {
  if (!gate) return null;
  const { requirement } = gate;
  if (requirement.state === "met") {
    return {
      state: "available",
      route: "progression",
      label: gate.requirementLabel,
      detail: `${gate.sourceName} is available through ${gate.requirementLabel}.`,
      how: requirement.how,
    };
  }

  if (gate.tradeable && tradingAllowed === true) {
    return {
      state: "available",
      route: "trade",
      label: `${gate.requirementLabel} or trade`,
      detail: `${gate.sourceName} requires ${gate.requirementLabel} to craft or upgrade, but a traded minion can still be used.`,
      how: `Trade for an ${gate.sourceName}, or reach ${gate.requirementLabel} to craft one.`,
    };
  }

  if (requirement.state === "unmet" && tradingAllowed === false) {
    return {
      state: "locked",
      route: null,
      label: `Requires ${gate.requirementLabel}`,
      detail: `${gate.sourceName} is unavailable until ${gate.requirementLabel}.`,
      how: requirement.how,
    };
  }

  return {
    state: "unknown",
    route: null,
    label: `Check ${gate.requirementLabel}`,
    detail: `Skydex cannot confirm a usable route to ${gate.sourceName}.`,
    how: requirement.how,
  };
};
