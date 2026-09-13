import type { ProfileTreeNodeView } from "../profile/profileViewModel";

export type ProgressionKind = "hotm" | "hotf";
export type ProgressionNodeStatus = "selected" | "disabled" | "allocated" | "available" | "locked";

export interface ProgressionNodeDefinition {
  key: string;
  name: string;
  wikiName: string;
  tier: number;
  column: number;
  summary: string;
  aliases?: readonly string[];
  linksFrom?: readonly string[];
  core?: boolean;
}

export interface ProgressionTierDefinition {
  tier: number;
  nodes: readonly ProgressionNodeDefinition[];
}

export interface ProgressionNodeState {
  definition: ProgressionNodeDefinition;
  apiNode: ProfileTreeNodeView | null;
  status: ProgressionNodeStatus;
}

export interface ProgressionStateIcon {
  name: string;
  id: string;
}

const COLUMNS: Readonly<Record<number, readonly number[]>> = {
  1: [4],
  3: [2, 4, 6],
  5: [2, 3, 4, 5, 6],
  6: [1, 2, 3, 5, 6, 7],
  7: [1, 2, 3, 4, 5, 6, 7],
};

const canonical = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

type ProgressionNodeOptions = Pick<ProgressionNodeDefinition, "aliases" | "core"> & {
  linksFrom?: readonly string[];
};

const node = (
  tier: number,
  column: number,
  name: string,
  summary: string,
  options: ProgressionNodeOptions = {},
): ProgressionNodeDefinition => {
  const { linksFrom, ...rest } = options;
  return {
    key: canonical(name),
    name,
    wikiName: name,
    tier,
    column,
    summary,
    linksFrom: linksFrom?.map(canonical),
    ...rest,
  };
};

const tier = (
  tierNumber: number,
  entries: readonly (readonly [name: string, summary: string, options?: ProgressionNodeOptions])[],
): ProgressionTierDefinition => {
  const columns = COLUMNS[entries.length];
  if (!columns) throw new Error(`No progression layout for ${entries.length} nodes`);
  return {
    tier: tierNumber,
    nodes: entries.map(([name, summary, options], index) => node(tierNumber, columns[index], name, summary, options)),
  };
};

// Current Heart of the Mountain topology, ordered left-to-right by in-game tier.
// Reference layout: Hypixel SkyBlock 0.20.6's official Heart tree image.
export const HOTM_TIERS: readonly ProgressionTierDefinition[] = [
  tier(1, [
    ["Mining Speed", "Increases ⸕ Mining Speed."],
  ]),
  tier(2, [
    ["Mining Speed Boost", "A pickaxe ability that temporarily multiplies Mining Speed.", { linksFrom: ["Mining Speed"] }],
    ["Precision Mining", "Aiming at the particle target on ores and Dwarven Metals increases Mining Speed.", { linksFrom: ["Mining Speed"] }],
    ["Mining Fortune", "Increases ☘ Mining Fortune.", { linksFrom: ["Mining Speed"] }],
    ["Titanium Insanium", "Mining Mithril can convert the block into Titanium.", { linksFrom: ["Mining Speed"] }],
    ["Pickobulus", "A pickaxe ability that breaks nearby mineable blocks.", { linksFrom: ["Mining Speed"] }],
  ]),
  tier(3, [
    ["Luck of the Cave", "Increases the chance of rare occurrences in the Dwarven Mines.", { linksFrom: ["Mining Speed Boost"] }],
    ["Efficient Miner", "Increases ▚ Mining Spread.", { linksFrom: ["Mining Fortune"] }],
    ["Quick Forge", "Decreases forge time.", { linksFrom: ["Pickobulus"] }],
  ]),
  tier(4, [
    ["Sky Mall", "Grants a random mining buff at the beginning of each SkyBlock day.", { linksFrom: ["Luck of the Cave"] }],
    ["Old School", "Increases ☘ Ore Fortune.", { linksFrom: ["Luck of the Cave"] }],
    ["Professional", "Increases Mining Speed while mining Gemstones.", { linksFrom: ["Luck of the Cave", "Efficient Miner"] }],
    ["Mole", "Increases Mining Spread while mining Hard Stone.", { linksFrom: ["Efficient Miner"] }],
    ["Gem Lover", "Increases ☘ Gemstone Fortune.", { linksFrom: ["Efficient Miner", "Quick Forge"] }],
    ["Seasoned Mineman", "Increases ☯ Mining Wisdom.", { linksFrom: ["Quick Forge"] }],
    ["Front Loaded", "Grants a daily opening burst of Gemstone Powder, Gemstone Fortune, and Mining Speed.", { linksFrom: ["Quick Forge"] }],
  ]),
  tier(5, [
    ["Daily Grind", "The first daily commission on each Mining Island grants bonus Powder.", { linksFrom: ["Old School"] }],
    ["Core of the Mountain", "Upgrades the permanent core of the Heart of the Mountain.", { core: true, linksFrom: ["Mole"] }],
    ["Daily Powder", "The first ore mined each day grants bonus Powder.", { linksFrom: ["Seasoned Mineman"] }],
  ]),
  tier(6, [
    ["Tunnel Vision", "A mining ability that increases the chance of rare mining occurrences.", { linksFrom: ["Daily Grind"] }],
    ["Blockhead", "Increases ☘ Block Fortune.", { linksFrom: ["Daily Grind"] }],
    ["Subterranean Fisher", "Increases Fishing Speed and Sea Creature Chance on Mining Islands.", { linksFrom: ["Daily Grind", "Core of the Mountain"] }],
    ["Keep It Cool", "Increases ♨ Heat Resistance.", { linksFrom: ["Core of the Mountain"] }],
    ["Lonesome Miner", "Increases combat and defensive stats while on Mining Islands.", { linksFrom: ["Core of the Mountain", "Daily Powder"] }],
    ["Great Explorer", "Improves Crystal Hollows treasure chest discovery and reduces locks.", { linksFrom: ["Daily Powder"] }],
    ["Maniac Miner", "A mining ability that exchanges Mana for Mining Fortune.", { linksFrom: ["Daily Powder"] }],
  ]),
  tier(7, [
    ["Speedy Mineman", "Increases ⸕ Mining Speed.", { linksFrom: ["Blockhead"] }],
    ["Powder Buff", "Increases Powder earned from every source.", { linksFrom: ["Keep It Cool"] }],
    ["Fortunate Mineman", "Increases ☘ Mining Fortune.", { linksFrom: ["Great Explorer"] }],
  ]),
  tier(8, [
    ["Miner's Blessing", "Increases Magic Find on Mining Islands.", { linksFrom: ["Speedy Mineman"] }],
    ["No Stone Unturned", "Increases the chance to find Suspicious Scrap in Glacite Mineshafts.", { linksFrom: ["Speedy Mineman"] }],
    ["Strong Arm", "Increases Mining Speed while mining Tungsten and Umber.", { linksFrom: ["Speedy Mineman", "Powder Buff"] }],
    ["Steady Hand", "Increases Gemstone Spread in Glacite Mineshafts.", { linksFrom: ["Powder Buff"] }],
    ["Warm Heart", "Increases Cold Resistance.", { aliases: ["Warm Hearted"], linksFrom: ["Powder Buff", "Fortunate Mineman"] }],
    ["Surveyor", "Increases the chance to discover Glacite Mineshafts.", { linksFrom: ["Fortunate Mineman"] }],
    ["Mineshaft Mayhem", "Grants a random buff upon entering a Glacite Mineshaft.", { linksFrom: ["Fortunate Mineman"] }],
  ]),
  tier(9, [
    ["Metal Head", "Increases Dwarven Metal Fortune.", { linksFrom: ["No Stone Unturned"] }],
    ["Rags to Riches", "Increases Mining Fortune in Glacite Mineshafts.", { linksFrom: ["Steady Hand"] }],
    ["Eager Adventurer", "Increases Mining Speed in Glacite Mineshafts.", { linksFrom: ["Surveyor"] }],
  ]),
  tier(10, [
    ["Gemstone Infusion", "A mining ability that temporarily increases Gemstone effectiveness.", { linksFrom: ["Metal Head"] }],
    ["Crystalline", "Increases the chance to find Crystal Glacite Mineshafts.", { linksFrom: ["Metal Head"] }],
    ["Gifts from the Departed", "Adds a chance to receive an extra item from Frozen Corpses.", { aliases: ["Gifts From Departed"], linksFrom: ["Metal Head", "Rags to Riches"] }],
    ["Mining Master", "Increases ✧ Pristine.", { linksFrom: ["Rags to Riches"] }],
    ["Dead Man's Chest", "Adds a chance for another Frozen Corpse to appear in a Glacite Mineshaft.", { linksFrom: ["Rags to Riches", "Eager Adventurer"] }],
    ["Vanguard Seeker", "Increases the chance to find Vanguard Glacite Mineshafts.", { linksFrom: ["Eager Adventurer"] }],
    ["Sheer Force", "A mining ability that temporarily increases Mining Spread.", { linksFrom: ["Eager Adventurer"] }],
  ]),
] as const;

// Current Heart of the Forest topology after SkyBlock 0.27, ordered left-to-right.
// Reference: https://hypixel.net/threads/hypixel-skyblock-0-27-torrhus-canyon-critter-safari.6132090/
export const HOTF_TIERS: readonly ProgressionTierDefinition[] = [
  tier(1, [
    ["Sweep", "Increases ∮ Sweep."],
  ]),
  tier(2, [
    ["Damage Boost", "An Axe Ability that increases damage dealt on Galatea.", { linksFrom: ["Sweep"] }],
    ["Luck of the Forest", "Improves rewards from Tree Gifts.", { linksFrom: ["Sweep"] }],
    ["Foraging Fortune", "Increases ☘ Foraging Fortune.", { linksFrom: ["Sweep"] }],
    ["Collector", "Adds a chance for island resources to drop twice.", { linksFrom: ["Sweep"] }],
    ["Axe Toss", "An Axe Ability that removes the Sweep penalty from thrown axes.", { linksFrom: ["Sweep"] }],
  ]),
  tier(3, [
    ["Deep Waters", "Increases Pressure Resistance.", { linksFrom: ["Damage Boost"] }],
    ["Hunter's Luck", "Increases Hunter Fortune.", { aliases: ["Hunters Luck"], linksFrom: ["Foraging Fortune"] }],
    ["Galatea's Might", "Increases combat stats while on Galatea.", { linksFrom: ["Axe Toss"] }],
  ]),
  tier(4, [
    ["Lottery", "Grants a random Foraging buff each SkyBlock day.", { linksFrom: ["Deep Waters"] }],
    ["Foraging Madness", "Increases Sweep and Foraging Fortune.", { linksFrom: ["Deep Waters"] }],
    ["Iron Lungs", "A Heart of the Forest tier 4 perk.", { linksFrom: ["Deep Waters", "Hunter's Luck"] }],
    ["250 Gifts", "Improves the first 250 Tree Gifts opened each day.", { linksFrom: ["Hunter's Luck"] }],
    ["Daily Wishes", "The first log type cut each day grants extra Whispers.", { linksFrom: ["Hunter's Luck", "Galatea's Might"] }],
    ["Early Bird", "Improves the first trees cut each day.", { linksFrom: ["Galatea's Might"] }],
    ["Precision Cutting", "Cutting a marked log grants additional Sweep for that hit.", { linksFrom: ["Galatea's Might"] }],
  ]),
  tier(5, [
    ["Tree Whisperer", "Tree Gifts grant additional Whispers.", { linksFrom: ["Foraging Madness"] }],
    ["Center of the Forest", "Upgrades Axe Abilities and the Heart of the Forest core.", { core: true, linksFrom: ["250 Gifts"] }],
    ["Free Trial", "A Heart of the Forest tier 5 perk.", { linksFrom: ["Early Bird"] }],
  ]),
  tier(6, [
    ["Homing Axe", "Thrown axes home towards trees.", { linksFrom: ["Tree Whisperer"] }],
    ["Forest Fisher", "A Heart of the Forest tier 6 perk.", { linksFrom: ["Tree Whisperer"] }],
    ["Strength Boost", "Increases Strength while on Foraging Islands.", { aliases: ["Str. Boost"], linksFrom: ["Tree Whisperer", "Center of the Forest"] }],
    ["Starlyn Supreme", "A Heart of the Forest tier 6 perk.", { linksFrom: ["Center of the Forest"] }],
    ["Speed Boost", "Increases Speed while on Foraging Islands.", { aliases: ["Spd. Boost"], linksFrom: ["Center of the Forest", "Free Trial"] }],
    ["Efficient Forager", "Increases Foraging Wisdom.", { linksFrom: ["Free Trial"] }],
    ["Maniac Slicer", "An Axe Ability that exchanges Mana for Sweep.", { linksFrom: ["Free Trial"] }],
  ]),
  tier(7, [
    ["Half Empty", "Pairs with Half Full to increase Foraging Fortune and Sweep.", { linksFrom: ["Forest Fisher"] }],
    ["Ricochet", "Thrown axes can bounce to a nearby tree.", { linksFrom: ["Starlyn Supreme"] }],
    ["Half Full", "Pairs with Half Empty to increase Foraging Fortune and Sweep.", { linksFrom: ["Efficient Forager"] }],
  ]),
  tier(8, [
    ["Monster Hunter", "Hunting monsters grants additional Whispers.", { linksFrom: ["Half Empty"] }],
    ["Forest Speed", "Converts a portion of Speed into Foraging Fortune and Sweep.", { linksFrom: ["Half Empty"] }],
    ["Essence Fortune", "Adds a chance to double Forest Essence drops.", { linksFrom: ["Half Empty", "Ricochet"] }],
    ["Timber", "A Heart of the Forest tier 8 perk.", { linksFrom: ["Ricochet"] }],
    ["Two-for-one", "A Heart of the Forest tier 8 perk.", { aliases: ["Two For One"], linksFrom: ["Ricochet", "Half Full"] }],
    ["Forest Strength", "Converts a portion of Strength into Foraging Fortune and Sweep.", { linksFrom: ["Half Full"] }],
    ["Beekeeper", "A Heart of the Forest tier 8 perk.", { linksFrom: ["Half Full"] }],
  ]),
] as const;

export const progressionTiers = (kind: ProgressionKind): readonly ProgressionTierDefinition[] => (
  kind === "hotm" ? HOTM_TIERS : HOTF_TIERS
);

const apiMatchesDefinition = (apiNode: ProfileTreeNodeView, definition: ProgressionNodeDefinition): boolean => {
  const candidates = [definition.key, definition.name, definition.wikiName, ...(definition.aliases ?? [])].map(canonical);
  return candidates.includes(canonical(apiNode.key)) || candidates.includes(canonical(apiNode.name));
};

export const resolveProgressionNode = (
  definition: ProgressionNodeDefinition,
  apiNodes: readonly ProfileTreeNodeView[],
): ProfileTreeNodeView | null => apiNodes.find((apiNode) => apiMatchesDefinition(apiNode, definition)) ?? null;

export const progressionUnlockedTier = (
  kind: ProgressionKind,
  experience: number | null,
  tiers: readonly ProgressionTierDefinition[],
  apiNodes: readonly ProfileTreeNodeView[],
): number => {
  if (kind === "hotm" && experience !== null) {
    const thresholds = [0, 3_000, 12_000, 37_000, 97_000, 197_000, 347_000, 557_000, 847_000, 1_247_000];
    return thresholds.reduce((level, threshold, index) => experience >= threshold ? index + 1 : level, 1);
  }

  return tiers.reduce((highest, currentTier) => (
    currentTier.nodes.some((definition) => resolveProgressionNode(definition, apiNodes))
      ? Math.max(highest, currentTier.tier)
      : highest
  ), 1);
};

export const progressionNodeState = (
  definition: ProgressionNodeDefinition,
  apiNode: ProfileTreeNodeView | null,
  selectedAbility: string | null,
  unlockedTier: number,
): ProgressionNodeStatus => {
  if (apiNode) {
    if (selectedAbility && canonical(selectedAbility) === canonical(apiNode.name)) return "selected";
    if (apiNode.enabled === false) return "disabled";
    return "allocated";
  }
  return definition.tier <= unlockedTier ? "available" : "locked";
};

const ABILITY_NODES = new Set([
  "miningspeedboost", "pickobulus", "tunnelvision", "maniacminer", "gemstoneinfusion", "sheerforce",
  "damageboost", "axetoss", "maniacslicer",
]);

export const progressionStateIcon = (state: ProgressionNodeState, kind: ProgressionKind = "hotm"): ProgressionStateIcon => {
  // The menu repeats role/state symbols, not a different themed item per perk.
  // Forest uses its native button/sapling/wood families; the existing explicit
  // status treatment distinguishes allocation without guessing texture variants.
  if (kind === "hotf") {
    if (state.definition.core) return { name: "Mangrove Wood", id: "MANGROVE_WOOD" };
    return ABILITY_NODES.has(state.definition.key)
      ? { name: "Pale Oak Sapling", id: "PALE_OAK_SAPLING" }
      : { name: "Pale Oak Button", id: "PALE_OAK_BUTTON" };
  }
  if (state.definition.core) return { name: "Emerald Block", id: "EMERALD_BLOCK" };
  const allocated = state.status === "allocated" || state.status === "selected";
  if (ABILITY_NODES.has(state.definition.key)) {
    return allocated ? { name: "Redstone Block", id: "REDSTONE_BLOCK" } : { name: "Coal Block", id: "COAL_BLOCK" };
  }
  return allocated ? { name: "Diamond", id: "DIAMOND" } : { name: "Coal", id: "COAL" };
};

export const unplacedProgressionNodes = (
  tiers: readonly ProgressionTierDefinition[],
  apiNodes: readonly ProfileTreeNodeView[],
): readonly ProfileTreeNodeView[] => apiNodes.filter((apiNode) => (
  !tiers.some((currentTier) => currentTier.nodes.some((definition) => apiMatchesDefinition(apiNode, definition)))
));
