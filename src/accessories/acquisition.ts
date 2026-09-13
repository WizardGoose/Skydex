import type { AccessoryEntry } from "./catalogue";
import type { AccessoryGroup } from "./grouping";
import type { CheckedRequirement } from "./requirements";
import type { SourceCategory } from "./sources";

/**
 * The route an Ironman player follows to obtain an accessory.
 *
 * This is deliberately separate from readiness. "Shen's Auction" is a stable
 * acquisition route; whether the player has enough money, catches the window,
 * or wins a bid is a player-specific question that the current profile data
 * cannot answer. Keeping the two facts apart prevents the old "no measured
 * gate" bucket from turning missing evidence into "available now".
 */
export type AccessoryAcquisitionCategory =
  | "collections"
  | "upgradePaths"
  | "slayer"
  | "dungeons"
  | "kuudra"
  | "mining"
  | "garden"
  | "fishing"
  | "dragons"
  | "quests"
  | "npcShops"
  | "mobDrops"
  | "shensAuction"
  | "darkAuction"
  | "events"
  | "generalCrafting"
  | "legacy"
  | "needsReview";

export const ACQUISITION_ORDER: readonly AccessoryAcquisitionCategory[] = [
  "collections",
  "upgradePaths",
  "slayer",
  "dungeons",
  "kuudra",
  "mining",
  "garden",
  "fishing",
  "dragons",
  "quests",
  "npcShops",
  "mobDrops",
  "shensAuction",
  "events",
  "darkAuction",
  "generalCrafting",
  "legacy",
  "needsReview",
];

export const ACQUISITION_LABEL: Record<AccessoryAcquisitionCategory, string> = {
  collections: "Collections",
  upgradePaths: "Upgrade paths",
  slayer: "Slayer",
  dungeons: "Dungeons",
  kuudra: "Kuudra",
  mining: "Mining & Forge",
  garden: "Garden & farming",
  fishing: "Fishing",
  dragons: "Dragons & Draconic Altar",
  quests: "Quests",
  npcShops: "NPC shops",
  mobDrops: "Mob & RNG drops",
  shensAuction: "Shen's Auction",
  darkAuction: "Dark Auction",
  events: "Events",
  generalCrafting: "General crafting",
  legacy: "Legacy / unobtainable",
  needsReview: "Needs review",
};

export interface AccessoryAcquisition {
  category: AccessoryAcquisitionCategory;
  /** Short route-specific context for the hover card. */
  detail: string | null;
  /** Other legitimate routes which must not be flattened into the primary. */
  alternatives: readonly string[];
  /** Why this classification is allowed to make a confident claim. */
  evidence: "curated" | "structured" | "wiki" | "fallback";
}

interface AcquisitionInput {
  entry: Pick<
    AccessoryEntry,
    "id" | "craftable" | "familyRank" | "unlocks"
  >;
  source: SourceCategory;
  /** The wiki classification before a known recipe resolves to `craftable`. */
  learnedSource: SourceCategory | null | undefined;
  checked: readonly CheckedRequirement[];
  group: AccessoryGroup;
  locations: readonly string[];
}

const curated = (
  category: AccessoryAcquisitionCategory,
  detail: string,
  alternatives: readonly string[] = [],
): AccessoryAcquisition => ({ category, detail, alternatives, evidence: "curated" });

/**
 * Small, evidence-backed overrides for routes the current one-word wiki parser
 * cannot represent. This is intentionally an exact-id map rather than a name
 * keyword system. A new item falls into Needs review until there is evidence,
 * rather than inheriting a confident route because its name sounds similar.
 */
const CURATED_ACQUISITION: Readonly<Record<string, AccessoryAcquisition>> = {
  ACCRETION_TALISMAN: curated("collections", "Ruby Veilshroom III recipe."),
  ACCRETION_RING: curated("collections", "Ruby Veilshroom V upgrade recipe."),
  ACCRETION_ARTIFACT: curated("collections", "Accretion collection upgrade path."),

  ANGUISH_TALISMAN: curated("generalCrafting", "Crafted from Plasma and Sorrow."),
  ANGUISH_RING: curated("upgradePaths", "Upgrade from Anguish Talisman."),
  ANGUISH_ARTIFACT: curated("upgradePaths", "Upgrade from Anguish Ring."),

  ARTIFACT_OF_CONTROL: curated(
    "shensAuction",
    "Bid in Shen's Auction; Ironman profiles use the separate Ironman auction.",
    ["Raffle of the Century reward"],
  ),

  DRACONIC_TALISMAN: curated(
    "dragons",
    "Craft with Ritual Residue obtained through Draconic Altar RNG.",
  ),
  DRACONIC_RING: curated(
    "dragons",
    "Draconic upgrade requiring more Ritual Residue from the altar route.",
  ),
  DRACONIC_ARTIFACT: curated(
    "dragons",
    "Final Draconic upgrade on the Ritual Residue route.",
  ),

  ARTIFACT_OF_COINS: curated(
    "upgradePaths",
    "Upgrade Ring of Coins with Freshly-Minted Coins.",
  ),
  AUTO_RECOMBOBULATOR: curated(
    "dungeons",
    "Rare Bedrock Chest reward from Catacombs Floor VII or Master VII.",
  ),
  BLAZE_TALISMAN: curated(
    "generalCrafting",
    "Craft from Millennia-Old Blaze Ashes and an Enchanted Blaze Rod.",
  ),
  BINGO_HEIRLOOM: curated(
    "legacy",
    "Admin-only Museum item; it has no normal player acquisition route.",
  ),
  BLOOD_GOD_SIGIL: curated("upgradePaths", "Upgrade from Blood God Crest."),
  BLUERTOOTH_RING: curated("upgradePaths", "Upgrade from Bluetooth Ring."),
  BURNING_KUUDRA_CORE: curated(
    "kuudra",
    "Rare reward chest drop from Burning-or-higher Kuudra.",
  ),
  CATACOMBS_EXPERT_RING: curated(
    "dungeons",
    "Dungeon upgrade crafted with Wither Catalysts.",
  ),
  COMPASS_TALISMAN: curated(
    "legacy",
    "Removed accessory; no current Ironman acquisition route remains.",
  ),
  CRACKED_PIGGY_BANK: curated(
    "collections",
    "First damaged state of the Raw Porkchop V Piggy Bank line.",
  ),
  DWARVEN_METAL: curated(
    "mining",
    "Forge after Heart of the Mountain VIII; materials and the one-day forge are not measured.",
  ),
  EMERALD_ARTIFACT: curated("collections", "Emerald collection upgrade path."),
  EMPEROR_ARTIFACT: curated("fishing", "Upgrade along the Sea Emperor accessory line."),
  ETERNAL_CRYSTAL: curated(
    "legacy",
    "Removed in 2019; no normal Ironman acquisition route remains.",
  ),
  FRIED_FROZEN_CHICKEN: curated(
    "generalCrafting",
    "Craft from Frozen Chicken and glacite-related materials.",
  ),
  FUTURE_CALORIES: curated(
    "generalCrafting",
    "Craft from Pre-Digestion Fish, Silver Magmafish, and Enchanted Raw Cod.",
  ),
  GLOSSY_MINERAL_TALISMAN: curated(
    "mining",
    "Upgrade Mineral Talisman with Glossy Gemstones.",
  ),
  GRATITUDE_TALISMAN: curated(
    "garden",
    "Craft with Visitors' Gratitude earned through the Garden route.",
  ),
  HELIANTHUS_RELIC: curated(
    "garden",
    "Upgrade Fermento Artifact with Condensed Helianthus.",
  ),
  INTIMIDATION_RELIC: curated("upgradePaths", "Upgrade from Intimidation Artifact."),
  KUUDRAS_KIDNEY: curated("kuudra", "Kuudra reward route."),
  LUCK_TALISMAN: curated(
    "legacy",
    "Removed Coming Soon accessory; no acquisition route was released.",
  ),
  PANDORAS_BOX: curated("shensAuction", "Bid in Shen's Auction."),
  PULSE_RING: curated(
    "generalCrafting",
    "Craft from Orbs of Energy, then charge Thunder Bottles for rarity upgrades.",
  ),
  JERRY_TALISMAN_PURPLE: curated(
    "events",
    "Craft from five Blue Jerry Talismans in the Jerry accessory line.",
  ),
  RIFT_PRISM: curated(
    "shensAuction",
    "Top-bidder reward from Barrier Street in the Rift.",
    ["Raffle of the Century major reward"],
  ),
  SCAVENGER_RING: curated("upgradePaths", "Upgrade from Scavenger Talisman."),
  SPEED_RELIC: curated("events", "Harvest Feast crafting route."),
  TREASURE_RING: curated("dungeons", "Upgrade from Treasure Talisman with Dungeon materials."),
  VOTER_BADGE_ELITE: curated(
    "garden",
    "Accept offers from five unique Mayor Garden Visitors.",
  ),
  WITHER_RELIC: curated("dungeons", "Upgrade Wither Artifact using a Wither Catalyst."),
};

/** Stable Hypixel id families whose route applies to every rung or variant. */
const acquisitionForStableIdFamily = (id: string): AccessoryAcquisition | null => {
  if (id === "BEASTMASTER_CREST" || id.startsWith("BEASTMASTER_CREST_")) {
    return curated("events", "Craft and upgrade during Diana's Mythological Ritual.");
  }
  if (id.startsWith("CAMPFIRE_TALISMAN_") || id.startsWith("SOUL_CAMPFIRE_TALISMAN_")) {
    return curated("quests", "Progress through the Campfire Trial challenge line.");
  }
  if (id.startsWith("MASTER_SKULL_TIER_")) {
    return curated("dungeons", "Master Mode Dungeon reward and upgrade line.");
  }
  if (id.startsWith("PARTY_HAT_CRAB_")) {
    return curated("legacy", "Anniversary reward; no current Ironman acquisition route remains.");
  }
  return null;
};

const answer = (
  category: AccessoryAcquisitionCategory,
  detail: string | null,
  evidence: AccessoryAcquisition["evidence"],
): AccessoryAcquisition => ({ category, detail, alternatives: [], evidence });

export function acquisitionOf(input: AcquisitionInput): AccessoryAcquisition {
  const exact = CURATED_ACQUISITION[input.entry.id];
  if (exact) return exact;
  const stableFamily = acquisitionForStableIdFamily(input.entry.id);
  if (stableFamily) return stableFamily;

  const learned = input.learnedSource;
  const locations = input.locations.join(" ");

  // Named venues and time gates are stronger than generic crafting evidence.
  if (/shen/i.test(locations)) {
    return answer("shensAuction", "Obtained through Shen's Auction.", "wiki");
  }
  if (learned === "darkAuction" || input.source === "darkAuction") {
    return answer("darkAuction", "Obtained through the Dark Auction.", "wiki");
  }
  if (learned === "event" || input.source === "event") {
    return answer("events", "Only available through its event route.", "wiki");
  }
  if (learned === "quest" || input.source === "quest") {
    return answer("quests", "Obtained through a quest or questline.", "wiki");
  }

  const slayer = input.checked.find((requirement) => requirement.kind === "slayer");
  if (slayer) {
    return answer("slayer", `${slayer.target} ${slayer.threshold}.`, "structured");
  }

  const trophy = input.checked.find((requirement) => requirement.kind === "trophyFishing");
  if (trophy) {
    return answer("fishing", `${trophy.target}, ${trophy.threshold}.`, "structured");
  }

  // A collection recipe is a stronger and more useful answer than "craftable".
  if (input.entry.unlocks && input.entry.unlocks.length > 0) {
    const first = input.entry.unlocks[0];
    return answer(
      "collections",
      `${first.collection} collection, tier ${first.tier}.`,
      "structured",
    );
  }

  if (input.group === "dungeons") {
    return answer("dungeons", "Obtained through a Dungeon route.", "wiki");
  }
  if (input.group === "fishing") {
    return answer("fishing", "Obtained through a fishing route.", "wiki");
  }

  if (learned === "shop" || input.source === "shop") {
    return answer("npcShops", "Purchased from an NPC or fixed shop route.", "wiki");
  }

  // A crafted higher rung is an upgrade path, not an unrelated recipe errand.
  if (input.entry.craftable && (input.entry.familyRank ?? 0) > 1) {
    return answer("upgradePaths", "Crafted from a lower rung in this accessory line.", "structured");
  }

  if (learned === "mobDrop" || input.source === "mobDrop") {
    return answer("mobDrops", "Obtained from a mob, boss, or RNG drop route.", "wiki");
  }
  if (input.entry.craftable || input.source === "craftable") {
    return answer("generalCrafting", "A recipe is known; material holdings are not measured.", "structured");
  }

  return answer("needsReview", null, "fallback");
}

export type AccessoryReadinessKind =
  | "owned"
  | "collectionLocked"
  | "progressionLocked"
  | "nextUpgrade"
  | "materialsUnknown"
  | "currencyUnknown"
  | "timeWindow"
  | "rngUnknown"
  | "unavailable"
  | "routeKnown"
  | "unknown";

export interface AccessoryReadiness {
  kind: AccessoryReadinessKind;
  /** One honest, profile-specific answer for the tooltip. */
  label: string;
}

interface ReadinessInput {
  ownedKnown: boolean;
  status: "owned" | "missing" | "locked";
  blockedBy: CheckedRequirement | null;
  acquisition: AccessoryAcquisition;
  craftable: boolean;
  ownedPrerequisite: { name: string } | null;
}

/**
 * Describe what the profile actually proves. It never converts a known route
 * into "ready" when materials, money, auction state, RNG, or quest progress
 * are not part of the data we read.
 */
export function readinessOf(input: ReadinessInput): AccessoryReadiness {
  if (!input.ownedKnown) return { kind: "unknown", label: "Profile readiness not available." };
  if (input.status === "owned") return { kind: "owned", label: "Owned." };

  if (input.blockedBy?.kind === "collection") {
    return {
      kind: "collectionLocked",
      label: `Missing ${input.blockedBy.target} ${input.blockedBy.threshold}.`,
    };
  }
  if (input.blockedBy) {
    return {
      kind: "progressionLocked",
      label: `Need ${input.blockedBy.target} ${input.blockedBy.threshold}.`,
    };
  }

  if (input.ownedPrerequisite) {
    return {
      kind: "nextUpgrade",
      label: `Owns ${input.ownedPrerequisite.name}; remaining materials are not measured.`,
    };
  }

  if (input.acquisition.category === "shensAuction" || input.acquisition.category === "darkAuction") {
    return { kind: "timeWindow", label: "Auction window, funds, and bid result are not measured." };
  }
  if (input.acquisition.category === "events") {
    return { kind: "timeWindow", label: "Event availability and remaining work are not fully measured." };
  }
  if (
    input.acquisition.category === "dragons"
    || input.acquisition.category === "mobDrops"
    || input.acquisition.category === "dungeons"
    || input.acquisition.category === "kuudra"
  ) {
    return { kind: "rngUnknown", label: "RNG progress and required drops are not measured." };
  }
  if (input.acquisition.category === "npcShops") {
    return { kind: "currencyUnknown", label: "Purchase route known; currency and stock are not measured here." };
  }
  if (input.acquisition.category === "legacy") {
    return { kind: "unavailable", label: "No current Ironman acquisition route." };
  }
  if (input.craftable) {
    return { kind: "materialsUnknown", label: "Recipe known; complete material holdings are not measured." };
  }
  if (input.acquisition.category === "needsReview") {
    return { kind: "unknown", label: "Acquisition route still needs review." };
  }
  return { kind: "routeKnown", label: "Route known; remaining work is not fully measured." };
}
