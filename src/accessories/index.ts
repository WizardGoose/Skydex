/**
 * The accessories layer's public surface.
 *
 * The page and everything under `ui/` import from here and never from a file
 * inside, so the internal split between catalogue, ownership, sources and
 * gating stays an implementation detail that can move without touching the UI.
 */

export { useAccessories, currentAccessories, refreshOwned, composeSnapshot } from "./useAccessories";
export type {
  AccessoriesSnapshot,
  AccessoryEnrichmentSummary,
  AccessoryStatSummary,
  AccessoryStatus,
  AccessoryView,
  AccessoryRungSummary,
  CachedMagicalPowerInputs,
  FoldedRung,
  SourceCategory,
} from "./useAccessories";

export {
  acquisitionOf,
  readinessOf,
  ACQUISITION_LABEL,
  ACQUISITION_ORDER,
} from "./acquisition";
export type {
  AccessoryAcquisition,
  AccessoryAcquisitionCategory,
  AccessoryReadiness,
  AccessoryReadinessKind,
} from "./acquisition";

export {
  ACCESSORY_EXCLUSIONS,
  buildAccessoryCatalogue,
  buildFamilies,
  accessoriesFromIndex,
  familyRankOf,
  isNormalAccessory,
} from "./catalogue";
export type {
  AccessoryCatalogue,
  AccessoryEntry,
  AccessoryFamily,
  CatalogueStats,
  FamilyCheck,
  HypixelAccessoryItem,
} from "./catalogue";

export {
  bagFromItems,
  bagFromParsedItems,
  bioanalysisRank,
  collapseOwned,
  findTalismanBag,
  readAbiphoneContacts,
  readConsumedPrism,
  readOwnedFromMember,
  tierFromLore,
} from "./owned";
export type { OwnedBag, OwnedSets } from "./owned";

export { classifyFromWikitext, eventKeyFromWikitext, obtainRegion, resolveSource, fetchWikiFacts } from "./sources";
export type { EventIndex, LocationSignals } from "./sources";

export {
  EVENT_LABEL,
  SKYBLOCK_EPOCH_MS,
  SKYBLOCK_DAY_MS,
  isEventLive,
  skyblockDate,
} from "./skyblockCalendar";
export type { EventKey, SkyblockDate } from "./skyblockCalendar";
export {
  classifyLocationPage,
  fetchLocationGroups,
  groupFromLocation,
  parseLocationSignals,
  signalTitle,
} from "./locations";
export type { LocationIndex } from "./locations";
export { parseUpgradeEdges, buildChainIndex, stableIdUpgradeEdges, EMPTY_CHAINS } from "./chains";
export { fetchNeuUpgrades, parseTalismanUpgrades, NEU_CACHE_KEY, NEU_UPGRADES_URL } from "./neuUpgrades";
export { computeFolds } from "./dedup";
export type { FoldResult } from "./dedup";
export { activeAccessories, computeMagicalPower, MP_BY_RARITY, NO_MP_INPUTS } from "./magicalPower";
export type { MagicalPowerBreakdownRow, MagicalPowerFigure, MagicalPowerInputs } from "./magicalPower";
export { accessoryPowerStats, normalizeAccessoryPowerName } from "./powerStats";
export type { AccessoryPowerStatKey, AccessoryPowerStatValue } from "./powerStats";
export {
  attainabilityOf,
  groupOf,
  GROUP_ORDER,
  GROUP_LABEL,
  ATTAINABILITY_ORDER,
  ATTAINABILITY_LABEL,
  ATTAINABILITY_HINT,
} from "./grouping";
export type { AccessoryGroup, Attainability } from "./grouping";
export type { ChainIndex, IdUpgradeEdge, UpgradeEdge } from "./chains";
export type { SourceIndex } from "./sources";

export {
  checkRequirement,
  readRequirement,
  readProgress,
  readSlayerLevels,
  readTrophyFish,
  NO_PROGRESS,
} from "./requirements";
export type {
  CheckedRequirement,
  PlayerProgress,
  Requirement,
  RequirementKind,
  RequirementState,
} from "./requirements";

export { buildCollectionKeys, gateAccessory, readCollections, NO_COLLECTIONS } from "./collections";
export type { CollectionBlock, CollectionProgress, GateResult } from "./collections";

export { buildHeadIndex, hashFromSkinValue, headHashFor, headSrcFor, useHeadSrc } from "./headHashes";
export type { HeadIndex, SkinnedItem } from "./headHashes";
