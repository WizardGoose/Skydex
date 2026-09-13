import { resolveActiveLoadout } from "../island/activeLoadout";
import { prettify } from "../island/format";
import type { ProfileFacts, ProfileSkillTreeFacts } from "../island/profileFacts";
import { averageSkillLevel, type SkillDefs } from "../island/skills";
import type { SkillIconMap } from "../island/skillIcons";
import {
  armorItems,
  buildWardrobeRows,
  rawToGearItem,
  recombTier,
  tierFromGearLore,
  type GearItem,
  type GearWardrobeState,
} from "../networth/gear";
import { petLevel } from "../networth/petValue";
import type { MemberLoadouts } from "../networth/parseItems";
import type { ParsedItems } from "../networth/profileNetworth";
import type { NetworthResult, PetData, RawItem } from "../networth/types";
import { categoryLabel } from "../networth/format";
import { skyBlockStatPresentation, type SkyBlockStatColorClass } from "../utilities/utilityFunctions";
import { profileSkillRows } from "./skillDisplay";
import type { ProfileApiDetails, ProfileSlayerDetail } from "./profileApiDetails";
import { petItemFallback } from "./petItemMetadata";
import { petStatProfile } from "./petStats";
import type { ItemTooltipTone } from "../ui/itemTooltipModel";

export interface ProfileSkillView {
  key: string;
  name: string;
  wikiName: string;
  level: number | null;
  progress: number | null;
  figure: string;
  /** Exact XP figure shown when the compact value is hovered or focused. */
  figureDetail?: string;
  /** Exact lifetime XP supplied by the profile. */
  lifetimeXp?: number;
  /** Exact XP earned inside the current level. */
  xpInto?: number;
  /** Exact XP needed for the current level, or null at the current cap. */
  xpForNext?: number | null;
  /** Current profile-specific cap from Hypixel's skill resource. */
  capLevel?: number | null;
  icon: string;
  iconId?: string;
  iconSize?: number;
  maxed: boolean;
  locked: boolean;
  levelColor?: string;
}

export interface ProfileTimecharmView {
  key: string;
  name: string;
  wikiName: string;
  shortName: string;
  complete: boolean;
}

export interface ProfileGearItemView {
  id: string;
  name: string;
  wikiName: string;
  count: number;
  rarity: string | null;
  extra?: GearItem["extra"];
  lore?: string[];
}

export interface ProfileGearBonusView {
  label: string;
  name: string;
  glyph: string;
  value: string;
  colorClass: SkyBlockStatColorClass;
}

export interface ProfileWardrobeSlotView {
  id: number | null;
  label: string;
  state: GearWardrobeState;
  pieces: readonly (ProfileGearItemView | null)[];
}

export interface ProfileWardrobeView {
  available: boolean;
  savedCount: number;
  slots: readonly ProfileWardrobeSlotView[];
}

export interface ProfileLoadoutContextView {
  label: "Power Stone" | "HotM" | "HotF";
  value: string | null;
  tooltip: string;
  iconName: string;
  iconId: string;
  tone: "power" | "hotm" | "hotf";
  detail: ProfilePowerDetailView | ProfileTreeDetailView | null;
}

export interface ProfilePowerDetailView {
  kind: "power";
  powerName: string;
  stoneName: string | null;
  stoneId: string | null;
  stoneRarity: string | null;
  wikiName: string;
  description: string;
  uniqueBonus: string | null;
}

export interface ProfileTreeNodeView {
  key: string;
  name: string;
  level: number;
  enabled: boolean | null;
}

export interface ProfileTreeDetailView {
  kind: "tree";
  name: string;
  wikiName: "Heart of the Mountain" | "Heart of the Forest";
  experience: number | null;
  tokensSpent: number | null;
  selectedAbility: string | null;
  nodes: readonly ProfileTreeNodeView[];
}

export interface ProfileTuningStatView {
  key: string;
  label: string;
  shortLabel: string;
  glyph: string;
  value: string;
  tone: "yellow" | "blue" | "purple" | "green" | "red" | "aqua" | "white";
}

export interface ProfilePetView {
  name: string;
  wikiName: string;
  type: string;
  iconName: string;
  iconId: string;
  tier: string;
  level: number;
  xp: number;
  xpMax: number;
  xpPercent: number;
  candyUsed: number | null;
  petType: string | null;
  /** Raw custom skin item id, retained for exact artwork resolution. */
  skinId?: string | null;
  skin: string | null;
  stats: readonly {
    label: string;
    value: string;
    tone: ItemTooltipTone;
  }[];
  abilities: readonly {
    name: string;
    description: string;
  }[];
  heldItem: {
    id: string;
    name: string;
    effect: string | null;
    rarity: string | null;
  } | null;
}

export interface ProfileMetricView {
  label: string;
  value: string;
  tone?: "joined" | "coins" | "skills" | "fairy" | "networth";
  parts?: readonly {
    label: string;
    value: string;
  }[];
  modes?: readonly {
    label: "Purse" | "Bank";
    value: string;
    parts?: readonly {
      label: string;
      value: string;
    }[];
  }[];
  info: {
    variant?: "default" | "joined" | "skills" | "networth";
    summary?: string;
    hero?: {
      label?: string;
      value: string;
    };
    rows?: readonly {
      label: string;
      value: string;
      icon?: string;
      iconId?: string;
      source?: "Skydex mod";
      tone?: "aqua" | "gold";
      share?: number;
    }[];
    note?: string;
    wiki?: {
      name: string;
      label: string;
      href: string;
    };
  } | null;
}

export interface ProfileLoadoutDetailView {
  id: number | null;
  name: string | null;
  armour: readonly (ProfileGearItemView | null)[];
  equipment: readonly (ProfileGearItemView | null)[];
  armourSetName: string | null;
  armourBonuses: readonly ProfileGearBonusView[];
  equipmentBonuses: readonly ProfileGearBonusView[];
  contexts: readonly ProfileLoadoutContextView[];
  tuning: readonly ProfileTuningStatView[];
  pet: ProfilePetView | null;
}

export interface ProfileLoadoutChoiceView {
  id: number;
  /** Raw in-game name. */
  name: string;
  /** Exact custom name when present, otherwise `Loadout 2`. */
  title: string;
  state: "saved" | "unset" | "locked";
  active: boolean;
  /** Active uses the current worn state above; other saved entries carry their referenced state here. */
  detail: ProfileLoadoutDetailView | null;
}

export interface ProfileViewModel {
  player: {
    name: string;
    uuid: string;
    profileName: string;
    gameMode: string;
    fetchedAt: number;
  };
  skyblockLevel: ProfileSkillView | null;
  skills: readonly ProfileSkillView[];
  slayers: readonly ProfileSkillView[];
  timecharms: {
    available: boolean;
    securedCount: number;
    entries: readonly ProfileTimecharmView[];
  };
  metrics: readonly ProfileMetricView[];
  loadout: ProfileLoadoutDetailView & {
    resolved: boolean;
    inventoryAvailable: boolean;
    choices: readonly ProfileLoadoutChoiceView[];
    armourWardrobe: ProfileWardrobeView;
    equipmentWardrobe: ProfileWardrobeView;
  };
}

export interface ProfileViewModelInput {
  playerName: string | null;
  playerUuid: string | null;
  profileName: string | null;
  gameMode: string | null;
  fetchedAt: number | null;
  facts: ProfileFacts;
  apiDetails: ProfileApiDetails;
  parsed: ParsedItems;
  gearLoadouts: MemberLoadouts;
  coverage: { inventoryShared: boolean; bankShared: boolean };
  networth: NetworthResult | null;
  skillDefs: SkillDefs | null;
  skillIcons: SkillIconMap | null;
  itemNameFor: (id: string) => string | null;
  itemTierFor: (idOrName: string) => string | null;
}

const compactNumber = (value: number): string => new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format(value);

const detailedNumber = (value: number): string => new Intl.NumberFormat("en", {
  maximumFractionDigits: 3,
}).format(value);

const exactOrCompact = (value: number): string =>
  Math.abs(value) >= 10_000 ? compactNumber(value) : new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value);

const progressPercent = (value: number, total: number): number =>
  total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;

const cleanKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Human-verified against the community wiki on 2026-08-29. Keep this manual:
 * the profile links to the wiki but must not fetch or bundle its content.
 */
export const FAIRY_SOUL_TOTAL = 289;
export const FAIRY_SOUL_WIKI_URL = "https://hypixelskyblock.minecraft.wiki/w/Fairy_Souls";

const displayGameMode = (value: string | null): string => {
  if (value === null || value.trim() === "") return "Normal";
  const key = value.trim().toLowerCase();
  if (key === "ironman") return "Ironman";
  if (key === "island") return "Stranded";
  return prettify(value);
};

const skyBlockLevelColor = (level: number): string => {
  const colours = [
    "#aaaaaa", "#ffffff", "#55ff55", "#55ffff", "#00aa00", "#5555ff",
    "#aa00aa", "#ffaa00", "#ff5555", "#ff55ff", "#00aaaa", "#aa0000", "#0000aa",
  ];
  return colours[Math.min(colours.length - 1, Math.max(0, Math.floor(level / 40)))] ?? colours[0];
};

const skillViews = (
  facts: ProfileFacts,
  defs: SkillDefs | null,
  icons: SkillIconMap | null,
): ProfileSkillView[] => profileSkillRows(facts.skillXp, defs).map((row) => {
  const name = row.def?.name ?? prettify(row.resourceKey);
  const icon = icons?.[row.resourceKey.toLowerCase().replace(/_/g, " ")] ?? name;
  let progress: number | null = null;
  let figure: string;
  let figureDetail: string;
  if (row.figure.kind === "progress") {
    progress = progressPercent(row.figure.currentXp, row.figure.totalXp);
    figure = `${compactNumber(row.figure.currentXp)} / ${compactNumber(row.figure.totalXp)} XP`;
    figureDetail = `${detailedNumber(row.figure.currentXp)} / ${detailedNumber(row.figure.totalXp)} XP`;
  } else if (row.figure.kind === "overflow") {
    progress = 100;
    figure = `${compactNumber(row.figure.lifetimeXp)} XP`;
    figureDetail = `${detailedNumber(row.figure.lifetimeXp)} XP`;
  } else {
    figure = `${compactNumber(row.figure.lifetimeXp)} XP`;
    figureDetail = `${detailedNumber(row.figure.lifetimeXp)} XP`;
  }
  return {
    key: row.resourceKey,
    name,
    wikiName: name,
    level: row.level,
    progress,
    figure,
    figureDetail,
    lifetimeXp: row.xp,
    xpInto: row.figure.kind === "progress" ? row.figure.currentXp : row.figure.valueXp,
    xpForNext: row.figure.kind === "progress" ? row.figure.totalXp : null,
    capLevel: row.capLevel,
    icon,
    maxed: row.maxed,
    locked: false,
  };
});

interface SlayerPresentation {
  name: string;
  wikiName: string;
  icon: string;
  aliases: readonly string[];
  thresholds: readonly number[];
}

const SLAYERS: readonly SlayerPresentation[] = [
  { name: "Revenant", wikiName: "Revenant Horror", icon: "Revenant Flesh", aliases: ["zombie", "revenant"], thresholds: [5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000] },
  { name: "Tarantula", wikiName: "Tarantula Broodfather", icon: "Tarantula Web", aliases: ["spider", "tarantula"], thresholds: [5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000] },
  { name: "Sven", wikiName: "Sven Packmaster", icon: "Wolf Tooth", aliases: ["wolf", "sven"], thresholds: [5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000] },
  { name: "Voidgloom", wikiName: "Voidgloom Seraph", icon: "Null Sphere", aliases: ["enderman", "voidgloom"], thresholds: [5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000] },
  { name: "Inferno", wikiName: "Inferno Demonlord", icon: "Derelict Ashe", aliases: ["blaze", "inferno"], thresholds: [5, 15, 200, 1_000, 5_000, 20_000, 100_000, 400_000, 1_000_000] },
  { name: "Vampire", wikiName: "Riftstalker Bloodfiend", icon: "Hemovibe", aliases: ["vampire", "vampie"], thresholds: [20, 75, 240, 840, 2_400] },
];

const slayerView = (detail: ProfileSlayerDetail): ProfileSkillView => {
  const key = cleanKey(detail.key);
  const presentation = SLAYERS.find((entry) => entry.aliases.some((alias) => cleanKey(alias) === key));
  const xp = detail.xp;
  const thresholds = presentation?.thresholds ?? [];
  const maxed = thresholds.length > 0 && detail.level >= thresholds.length;
  const target = !maxed && detail.level >= 0 ? thresholds[detail.level] ?? null : null;
  const locked = detail.level <= 0 && xp === null;
  const figureDetail = locked
    ? "Locked"
    : xp === null
      ? "XP not shared"
      : maxed || target === null
        ? `${detailedNumber(xp)} XP`
        : `${detailedNumber(xp)} / ${detailedNumber(target)} XP`;
  return {
    key: detail.key,
    name: presentation?.name ?? prettify(detail.key),
    wikiName: presentation?.wikiName ?? prettify(detail.key),
    level: detail.level,
    progress: locked ? 0 : xp === null ? null : maxed ? 100 : target === null ? null : progressPercent(xp, target),
    figure: locked
      ? "Locked"
      : xp === null
        ? "XP not shared"
        : maxed || target === null
          ? `${compactNumber(xp)} XP`
          : `${compactNumber(xp)} / ${compactNumber(target)} XP`,
    figureDetail,
    icon: presentation?.icon ?? prettify(detail.key),
    maxed,
    locked,
  };
};

export interface TimecharmPresentation {
  key: string;
  name: string;
  wikiName: string;
  shortName: string;
  aliases: readonly string[];
}

const TIMECHARMS: readonly TimecharmPresentation[] = [
  { key: "supreme", name: "Supreme Timecharm", wikiName: "Supreme Timecharm", shortName: "Supreme", aliases: ["supreme", "wyldlysupreme", "rifttrophywyldlysupreme"] },
  { key: "chicken-n-egg", name: "Chicken N Egg Timecharm", wikiName: "Chicken N Egg Timecharm", shortName: "Chicken N Egg", aliases: ["chickennegg", "rifttrophychickennegg"] },
  { key: "mirrorverse", name: "mrahcemiT esrevrorriM", wikiName: "mrahcemiT esrevrorriM", shortName: "Mirrorverse", aliases: ["mirrorverse", "mirrored", "rifttrophymirrored"] },
  { key: "citizen", name: "SkyBlock Citizen Timecharm", wikiName: "SkyBlock Citizen Timecharm", shortName: "Citizen", aliases: ["citizen", "skyblockcitizen", "rifttrophycitizen"] },
  { key: "living", name: "Living Timecharm", wikiName: "Living Timecharm", shortName: "Living", aliases: ["living", "lazyliving", "rifttrophylazyliving"] },
  { key: "globulate", name: "Globulate Timecharm", wikiName: "Globulate Timecharm", shortName: "Globulate", aliases: ["globulate", "slime", "rifttrophyslime"] },
  { key: "vampiric", name: "Vampiric Timecharm", wikiName: "Vampiric Timecharm", shortName: "Vampiric", aliases: ["vampiric", "rifttrophyvampiric"] },
  {
    key: "celestial",
    name: "Celestial Timecharm",
    wikiName: "Celestial Timecharm",
    shortName: "Celestial",
    aliases: ["celestial", "mountain", "rifttrophycelestial", "rifttrophymountain"],
  },
];

export const timecharmPresentationFor = (value: string): TimecharmPresentation | null => {
  const key = cleanKey(value);
  return TIMECHARMS.find((entry) => entry.aliases.some((alias) => cleanKey(alias) === key)) ?? null;
};

const timecharmViews = (details: ProfileApiDetails): ProfileViewModel["timecharms"] => {
  const secured = details.securedTimecharms;
  if (secured === null) {
    return {
      available: false,
      securedCount: 0,
      entries: TIMECHARMS.map((entry) => ({ ...entry, complete: false })),
    };
  }

  const remaining = new Map(secured.map((entry) => [cleanKey(entry.key), entry]));
  const entries: ProfileTimecharmView[] = TIMECHARMS.map((entry) => {
    const match = [...remaining.keys()].find((key) => entry.aliases.some((alias) => cleanKey(alias) === key));
    if (match) remaining.delete(match);
    return {
      key: entry.key,
      name: entry.name,
      wikiName: entry.wikiName,
      shortName: entry.shortName,
      complete: Boolean(match),
    };
  });

  for (const entry of remaining.values()) {
    const label = prettify(entry.key.replace(/^RIFT_TROPHY_/i, ""));
    entries.push({
      key: entry.key,
      name: /timecharm/i.test(label) ? label : `${label} Timecharm`,
      wikiName: /timecharm/i.test(label) ? label : `${label} Timecharm`,
      shortName: label,
      complete: true,
    });
  }
  return { available: true, securedCount: entries.filter((entry) => entry.complete).length, entries };
};

const rawGear = (
  raw: RawItem | null,
  itemNameFor: ProfileViewModelInput["itemNameFor"],
  itemTierFor: ProfileViewModelInput["itemTierFor"],
): ProfileGearItemView | null => {
  if (!raw) return null;
  const item = rawToGearItem(raw);
  return item ? gearView(item, itemNameFor, itemTierFor) : null;
};

const gearView = (
  item: GearItem,
  itemNameFor: ProfileViewModelInput["itemNameFor"],
  itemTierFor: ProfileViewModelInput["itemTierFor"],
): ProfileGearItemView => {
  const loreTier = tierFromGearLore(item.lore);
  const catalogTier = itemTierFor(item.id) ?? itemTierFor(item.name);
  const rarity = loreTier ?? recombTier(catalogTier, item.extra?.recomb === true);
  const wikiName = (itemNameFor(item.id) ?? item.name).replace(/\s+[✦✪]+$/u, "").trim();
  return {
    id: item.id,
    name: item.name,
    wikiName,
    count: item.count,
    rarity,
    ...(item.extra ? {
      extra: {
        ...(item.extra.ench ? { ench: { ...item.extra.ench } } : {}),
        ...(item.extra.recomb ? { recomb: true } : {}),
        ...(item.extra.skin ? { skin: item.extra.skin } : {}),
      },
    } : {}),
    ...(item.lore ? { lore: [...item.lore] } : {}),
  };
};

const STAT_LABELS: Record<string, string> = {
  health: "HP",
  defense: "Def",
  strength: "Str",
  speed: "Spd",
  intelligence: "Int",
  farmingfortune: "FrmFrt",
  miningfortune: "MinFrt",
  foragingfortune: "ForFrt",
  bonuspestchance: "BPC",
  critchance: "CC",
  criticalchance: "CC",
  critdamage: "CD",
  criticaldamage: "CD",
  ferocity: "Fero",
  magicfind: "MF",
  hearts: "Hrts",
  rifttime: "R.Tme",
  manaregen: "Mn.R",
  riftdamage: "R.Dmg",
};

const statShortLabel = (name: string): string => {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  if (words.length > 1) return words.map((word) => word[0]).join("").slice(0, 6);
  return (words[0] ?? "Stat").slice(0, 6);
};

/** Read the leading stat block from live item lore and combine the equipped pieces. */
export const gearBonuses = (items: readonly ProfileGearItemView[]): ProfileGearBonusView[] => {
  const totals = new Map<string, { name: string; amount: number; percent: boolean }>();
  for (const item of items) {
    let foundStat = false;
    for (const rawLine of item.lore ?? []) {
      const line = rawLine.replace(/§[0-9a-fk-or]/gi, "").trim();
      if (!line) {
        if (foundStat) break;
        continue;
      }
      const match = /^[^A-Za-z0-9]*([A-Za-z][A-Za-z '-]+):\s*([+-]?[\d,.]+(?:\.\d+)?)(%?)/.exec(line);
      if (!match) continue;
      const name = match[1].trim();
      if (/^(gear score|item ability|full set bonus|you found)$/i.test(name)) continue;
      const amount = Number(match[2].replace(/,/g, ""));
      if (!Number.isFinite(amount)) continue;
      foundStat = true;
      const key = cleanKey(name);
      const previous = totals.get(key);
      totals.set(key, {
        name,
        amount: (previous?.amount ?? 0) + amount,
        percent: previous?.percent === true || match[3] === "%",
      });
    }
  }

  return [...totals.entries()].map(([key, total]) => {
    const presentation = skyBlockStatPresentation(total.name);
    return {
      label: STAT_LABELS[key] ?? statShortLabel(total.name),
      name: total.name,
      glyph: presentation?.glyph ?? "✦",
      value: `${exactOrCompact(total.amount)}${total.percent ? "%" : ""}`,
      colorClass: presentation?.colorClass ?? "text-stat-white",
    };
  });
};

const armourSetName = (items: readonly ProfileGearItemView[]): string | null => {
  if (items.length === 0) return null;
  const bases = items.map((item) => item.name
    .replace(/\s+(helmet|chestplate|leggings|boots)(?:\s+[✦✪]+)?$/i, "")
    .trim());
  if (bases.length === 4 && bases.every((base) => base === bases[0])) return `${bases[0]} Armor`;
  return null;
};

const wardrobeView = (
  sets: MemberLoadouts["armorSets"],
  available: boolean,
  itemNameFor: ProfileViewModelInput["itemNameFor"],
  itemTierFor: ProfileViewModelInput["itemTierFor"],
  activeSetId: number | null = null,
  activePieces: readonly (ProfileGearItemView | null)[] = [],
): ProfileWardrobeView => {
  const displaySets = sets.map((set) => ({
    id: set.id,
    pieces: set.pieces.map((piece, index) => (
      rawGear(piece, itemNameFor, itemTierFor)
      ?? (set.id === activeSetId ? activePieces[index] ?? null : null)
    )),
  }));
  const rows = buildWardrobeRows(displaySets, { available, capacity: available ? 27 : null, columns: 9 });
  return {
    available,
    savedCount: displaySets.filter((set) => set.pieces.some((piece) => piece !== null)).length,
    slots: rows.flatMap((row) => row.slots).map((slot) => ({
      id: slot.id,
      label: slot.id === null ? "Private" : `Set ${slot.id}`,
      state: slot.state,
      pieces: slot.pieces as readonly (ProfileGearItemView | null)[],
    })),
  };
};

interface TuningPresentation {
  label: string;
  shortLabel: string;
  glyph: string;
  tone: ProfileTuningStatView["tone"];
  percent?: boolean;
}

const TUNING: Record<string, TuningPresentation> = {
  bonus_attack_speed: { label: "Attack Speed", shortLabel: "Atk", glyph: "⚔", tone: "yellow" },
  attack_speed: { label: "Attack Speed", shortLabel: "Atk", glyph: "⚔", tone: "yellow" },
  crit_chance: { label: "Critical Chance", shortLabel: "CC", glyph: "☣", tone: "blue", percent: true },
  critical_chance: { label: "Critical Chance", shortLabel: "CC", glyph: "☣", tone: "blue", percent: true },
  crit_damage: { label: "Critical Damage", shortLabel: "CD", glyph: "☠", tone: "purple", percent: true },
  critical_damage: { label: "Critical Damage", shortLabel: "CD", glyph: "☠", tone: "purple", percent: true },
  defense: { label: "Defense", shortLabel: "Def", glyph: "❈", tone: "green" },
  health: { label: "Health", shortLabel: "HP", glyph: "❤", tone: "red" },
  intelligence: { label: "Intelligence", shortLabel: "Int", glyph: "✎", tone: "aqua" },
  strength: { label: "Strength", shortLabel: "Str", glyph: "❁", tone: "red" },
  speed: { label: "Speed", shortLabel: "Spd", glyph: "✦", tone: "white" },
};

const tuningViews = (allocation: Record<string, number> | null): ProfileTuningStatView[] => {
  if (allocation === null) return [];
  const stated = new Map(Object.entries(allocation).filter(([, value]) => Number.isFinite(value)));
  if (![...stated.values()].some((value) => value !== 0)) return [];
  const rows: ProfileTuningStatView[] = [];
  for (const [key, presentation] of Object.entries(TUNING)) {
    if (!stated.has(key)) continue;
    const value = stated.get(key) ?? 0;
    stated.delete(key);
    rows.push({
      key,
      ...presentation,
      value: `${value >= 0 ? "+" : ""}${exactOrCompact(value)}${presentation.percent ? "%" : ""}`,
    });
  }
  for (const [key, value] of stated) {
    const label = prettify(key);
    rows.push({
      key,
      label,
      shortLabel: statShortLabel(label),
      glyph: "✦",
      value: `${value >= 0 ? "+" : ""}${exactOrCompact(value)}`,
      tone: "white",
    });
  }
  return rows;
};

interface PowerPresentation {
  stoneName: string;
  stoneId: string;
  stoneRarity: string;
  description: string;
  uniqueBonus: string;
}

const POWERS: Readonly<Record<string, PowerPresentation>> = {
  forceful: {
    stoneName: "Acacia Birdhouse",
    stoneId: "ACACIA_BIRDHOUSE",
    stoneRarity: "rare",
    description: "§fAcacia Birdhouse §7unlocks the §cForceful §7Accessory Power.",
    uniqueBonus: "§c+4 ⫽ Ferocity",
  },
};

const powerDetail = (power: string | null): ProfilePowerDetailView | null => {
  if (!power) return null;
  const powerName = prettify(power);
  const presentation = POWERS[power.trim().toLowerCase()];
  if (!presentation) {
    return {
      kind: "power",
      powerName,
      stoneName: null,
      stoneId: null,
      stoneRarity: null,
      wikiName: "Powers",
      description: `§f${powerName} §7is the selected Accessory Power.`,
      uniqueBonus: null,
    };
  }
  return {
    kind: "power",
    powerName,
    ...presentation,
    wikiName: presentation.stoneName,
  };
};

const treeDetail = (
  tree: ProfileSkillTreeFacts | null,
  wikiName: ProfileTreeDetailView["wikiName"],
  presetSlot = 1,
): ProfileTreeDetailView | null => {
  if (!tree) return null;
  const defaultName = `${wikiName} ${presetSlot}`;
  return {
    kind: "tree",
    name: tree.customName ?? defaultName,
    wikiName,
    experience: tree.experience,
    tokensSpent: tree.tokensSpent,
    selectedAbility: tree.selectedAbility ? prettify(tree.selectedAbility) : null,
    nodes: Object.entries(tree.nodes).map(([key, node]) => ({
      key,
      name: prettify(key),
      level: node.level,
      enabled: node.enabled,
    })),
  };
};

const treePresetName = (
  wikiName: ProfileTreeDetailView["wikiName"],
  presetSlot: number | null,
): string | null => presetSlot === null ? null : `${wikiName} ${presetSlot}`;

const loadoutContexts = (
  power: string | null,
  hotm: ProfileTreeDetailView | null,
  hotf: ProfileTreeDetailView | null,
  hotmName: string | null = null,
  hotfName: string | null = null,
): ProfileLoadoutContextView[] => {
  const selectedPower = powerDetail(power);
  return [
    {
      label: "Power Stone",
      value: selectedPower?.powerName ?? null,
      tooltip: "Accessory Power",
      iconName: selectedPower?.stoneName ?? "Redstone Torch",
      iconId: selectedPower?.stoneId ?? "REDSTONE_TORCH",
      tone: "power",
      detail: selectedPower,
    },
    {
      label: "HotM",
      value: hotm?.name ?? hotmName,
      tooltip: "Heart of the Mountain",
      iconName: "Heart of the Mountain",
      iconId: "HEART_OF_THE_MOUNTAIN",
      tone: "hotm",
      detail: hotm,
    },
    {
      label: "HotF",
      value: hotf?.name ?? hotfName,
      tooltip: "Heart of the Forest",
      iconName: "Oak Sapling",
      iconId: "OAK_SAPLING",
      tone: "hotf",
      detail: hotf,
    },
  ];
};

const petReference = (type: string, tier: string, level: number): Pick<ProfilePetView, "petType" | "stats" | "abilities"> => {
  const statProfile = petStatProfile(type, tier, level);
  const stats = statProfile?.stats.map((stat) => ({
    label: stat.label,
    value: stat.formatted,
    tone: stat.tone,
  })) ?? [];
  return {
    petType: statProfile?.petType ?? null,
    stats,
    abilities: statProfile?.abilities ?? [],
  };
};

const petView = (
  pet: PetData | null,
  itemNameFor: ProfileViewModelInput["itemNameFor"],
  itemTierFor: ProfileViewModelInput["itemTierFor"],
): ProfilePetView | null => {
  if (!pet || typeof pet.type !== "string" || typeof pet.tier !== "string") return null;
  const level = petLevel(pet);
  const name = prettify(pet.type);
  const heldId = typeof pet.heldItem === "string" && pet.heldItem ? pet.heldItem : null;
  const rawSkin = typeof pet.skin === "string" && pet.skin.trim() ? pet.skin.trim() : null;
  const skinId = rawSkin === null
    ? null
    : rawSkin.toUpperCase().startsWith("PET_SKIN_")
      ? rawSkin.toUpperCase()
      : `PET_SKIN_${rawSkin.toUpperCase()}`;
  const heldName = heldId
    ? itemNameFor(heldId) ?? prettify(heldId.replace(/^PET_ITEM_/, ""))
    : null;
  /*
   * A few pet items are present in profile data but absent from Hypixel's
   * public item resource. Keep those exceptions in the data projection rather
   * than painting one UI card by name. Green Bandana is reported as
   * GREEN_BANDANA by the profile API and is an EPIC pet item.
   */
  const missingResourceItem = petItemFallback(heldId);
  const reference = petReference(pet.type, pet.tier, level.level);
  return {
    name,
    wikiName: `${name} Pet`,
    type: pet.type,
    iconName: `${name} Pet`,
    iconId: `PET_${pet.type.toUpperCase()}`,
    tier: pet.tier.toLowerCase(),
    level: level.level,
    xp: level.xp,
    xpMax: level.xpMax,
    xpPercent: progressPercent(level.xp, level.xpMax),
    candyUsed: typeof pet.candyUsed === "number" && Number.isFinite(pet.candyUsed) ? pet.candyUsed : null,
    skinId,
    skin: rawSkin === null ? null : prettify(rawSkin.replace(/^PET_SKIN_/i, "")),
    ...reference,
    heldItem: heldId ? {
      id: heldId,
      name: heldName!,
      effect: missingResourceItem?.effect ?? null,
      rarity: itemTierFor(heldId) ?? itemTierFor(heldName!) ?? missingResourceItem?.rarity ?? null,
    } : null,
  };
};

const metricViews = (
  input: ProfileViewModelInput,
  skills: readonly ProfileSkillView[],
): ProfileMetricView[] => {
  const average = input.skillDefs ? averageSkillLevel(input.facts.skillXp, input.skillDefs) : null;
  const joinedAt = input.facts.firstJoin === null ? null : new Date(input.facts.firstJoin);
  const joined = joinedAt === null ? "Not shared" : joinedAt.toLocaleDateString("en-US");
  const joinedTimestamp = joinedAt === null ? "Not shared" : new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(joinedAt);
  const purseValue = input.networth ? compactNumber(input.networth.purse) : "Unavailable";
  const personalBankValue = input.networth ? compactNumber(input.networth.personalBank) : "Unavailable";
  const coOpBankValue = !input.coverage.bankShared
    ? "Private"
    : input.networth
      ? compactNumber(input.networth.bank)
      : "Unavailable";
  const bankValue = input.networth ? compactNumber(input.networth.bank + input.networth.personalBank) : "Unavailable";
  const averageRows = input.skillDefs === null
    ? []
    : skills
      .filter((skill) => skill.level !== null && input.skillDefs?.[skill.key] !== undefined)
      .filter((skill) => skill.key !== "RUNECRAFTING" && skill.key !== "SOCIAL")
      .map((skill) => ({
        label: skill.name,
        value: `Level ${skill.level}`,
        icon: skill.icon,
        iconId: skill.iconId,
        tone: skill.maxed ? "gold" as const : "aqua" as const,
      }));
  const fairySouls = input.facts.fairySouls;
  const networthTotal = input.networth?.networth ?? 0;
  const networthShare = (value: number) => networthTotal > 0 ? Math.min(100, Math.max(0, value / networthTotal * 100)) : 0;
  const networthRows = input.networth === null
    ? []
    : [
      {
        label: "Coin balances",
        value: compactNumber(input.networth.purse + input.networth.bank + input.networth.personalBank),
        share: networthShare(input.networth.purse + input.networth.bank + input.networth.personalBank),
      },
      ...Object.entries(input.networth.types)
        .filter(([, category]) => category.total > 0)
        .sort(([, left], [, right]) => right.total - left.total)
        .map(([key, category]) => ({
          label: categoryLabel(key),
          value: compactNumber(category.total),
          share: networthShare(category.total),
          ...(key === "island_chests" ? { source: "Skydex mod" as const } : {}),
        })),
    ];

  return [
    {
      label: "Joined",
      value: joined,
      tone: "joined",
      info: {
        variant: "joined",
        hero: { value: joinedTimestamp },
      },
    },
    {
      label: "Purse",
      value: purseValue,
      tone: "coins",
      info: null,
    },
    {
      label: "Bank",
      value: bankValue,
      tone: "coins",
      parts: [
        { label: "Personal", value: personalBankValue },
        { label: "Co-op", value: coOpBankValue },
      ],
      info: null,
    },
    {
      label: "Average skill level",
      value: average === null ? "Unavailable" : average.toFixed(2),
      tone: "skills",
      info: {
        variant: "skills",
        summary: "Runecrafting and Social are excluded from this average.",
        rows: averageRows,
      },
    },
    {
      label: "Fairy souls",
      value: fairySouls === null
        ? "Not shared"
        : `${fairySouls.toLocaleString("en-US")} / ${FAIRY_SOUL_TOTAL.toLocaleString("en-US")}`,
      tone: "fairy",
      info: {
        summary: fairySouls === null
          ? `Hypixel did not share this profile's collected count. The current total is ${FAIRY_SOUL_TOTAL}.`
          : `${fairySouls.toLocaleString("en-US")} of ${FAIRY_SOUL_TOTAL.toLocaleString("en-US")} Fairy Souls collected.`,
        rows: fairySouls === null ? [{ label: "Current total", value: FAIRY_SOUL_TOTAL.toLocaleString("en-US") }] : [
          { label: "Collected", value: fairySouls.toLocaleString("en-US") },
          { label: "Remaining", value: Math.max(0, FAIRY_SOUL_TOTAL - fairySouls).toLocaleString("en-US") },
          { label: "Current total", value: FAIRY_SOUL_TOTAL.toLocaleString("en-US") },
        ],
        note: "The Skydex mod can identify where your missing Fairy Souls are. That breakdown will appear here once the feature is connected.",
        wiki: {
          name: "Fairy Souls",
          label: "Fairy Souls on the wiki",
          href: FAIRY_SOUL_WIKI_URL,
        },
      },
    },
    {
      label: "Networth",
      value: input.networth ? compactNumber(input.networth.networth) : "Unavailable",
      tone: "networth",
      info: {
        variant: "networth",
        hero: {
          label: "Estimated total",
          value: input.networth ? compactNumber(input.networth.networth) : "Unavailable",
        },
        rows: networthRows,
        note: (input.networth?.types.island_chests?.total ?? 0) > 0
          ? "Island Chests uses holdings supplied by the Skydex mod."
          : undefined,
      },
    },
  ];
};

export const buildProfileViewModel = (input: ProfileViewModelInput): ProfileViewModel | null => {
  if (!input.playerName || !input.playerUuid || !input.profileName || input.fetchedAt === null) return null;

  const armour = armorItems(input.parsed.armor).map((item) => gearView(item, input.itemNameFor, input.itemTierFor));
  const equipment = input.gearLoadouts.wornEquipment.map((piece) => rawGear(piece, input.itemNameFor, input.itemTierFor));
  const pets = Array.isArray(input.parsed.pets) ? input.parsed.pets as PetData[] : [];
  const activePet = pets.find((pet) => pet?.active === true) ?? null;
  const activeLoadout = resolveActiveLoadout(input.gearLoadouts.loadouts, {
    activePetUuid: typeof activePet?.uuid === "string" && activePet.uuid ? activePet.uuid : null,
    selectedPower: input.facts.selectedPower,
    equippedEquipmentSetId: input.gearLoadouts.equippedEquipmentSetId,
  });
  const allocation = activeLoadout?.tuningSlot === null || activeLoadout?.tuningSlot === undefined
    ? null
    : input.facts.tuning[`slot_${activeLoadout.tuningSlot}`] ?? null;
  const levelXp = input.facts.levelXp;
  const skyblockLevel = levelXp === null ? null : (() => {
    const level = Math.floor(levelXp / 100);
    const into = levelXp % 100;
    return {
      key: "SKYBLOCK_LEVEL",
      name: "SkyBlock Level",
      wikiName: "SkyBlock Levels",
      level,
      progress: into,
      figure: `${into} / 100 XP`,
      figureDetail: `${into} / 100 XP`,
      icon: "Experience Bottle",
      iconSize: 34,
      maxed: false,
      locked: false,
      levelColor: skyBlockLevelColor(level),
    } satisfies ProfileSkillView;
  })();
  const skills = skillViews(input.facts, input.skillDefs, input.skillIcons);

  const power = activeLoadout?.powerStone ?? input.facts.selectedPower;
  const hotmSlot = input.facts.hotmSelectedSlot ?? (input.facts.hotmTree ? 1 : null);
  const hotfSlot = input.facts.hotfSelectedSlot ?? (input.facts.hotfTree ? 1 : null);
  const hotmFacts = hotmSlot === null
    ? input.facts.hotmTree
    : input.facts.hotmTrees?.[hotmSlot] ?? input.facts.hotmTree;
  const hotfFacts = hotfSlot === null
    ? input.facts.hotfTree
    : input.facts.hotfTrees?.[hotfSlot] ?? input.facts.hotfTree;
  const hotm = treeDetail(hotmFacts, "Heart of the Mountain", hotmSlot ?? 1);
  const hotf = treeDetail(hotfFacts, "Heart of the Forest", hotfSlot ?? 1);
  const contexts = loadoutContexts(
    power,
    hotm,
    hotf,
    input.facts.hotmName ?? treePresetName("Heart of the Mountain", hotmSlot),
    input.facts.hotfName ?? treePresetName("Heart of the Forest", hotfSlot),
  );
  const currentPet = petView(activePet, input.itemNameFor, input.itemTierFor);
  const armourSetById = new Map(input.gearLoadouts.armorSets.map((set) => [set.id, set]));
  const equipmentSetById = new Map(input.gearLoadouts.equipmentSets.map((set) => [set.id, set]));
  const petByUuid = new Map(
    pets
      .filter((pet): pet is PetData & { uuid: string } => typeof pet.uuid === "string" && pet.uuid !== "")
      .map((pet) => [pet.uuid, pet]),
  );

  const displayLoadoutName = (statement: MemberLoadouts["loadouts"][number]): string => {
    const canonical = `Loadout ${statement.id}`;
    const stated = statement.name.trim();
    return stated && stated.toLowerCase() !== canonical.toLowerCase()
      ? stated
      : canonical;
  };

  const detailFor = (statement: MemberLoadouts["loadouts"][number], title: string): ProfileLoadoutDetailView => {
    const referencedArmour = statement.armorSetId === null
      ? [null, null, null, null]
      : armourSetById.get(statement.armorSetId)?.pieces ?? [null, null, null, null];
    const referencedEquipment = statement.equipmentSetId === null
      ? [null, null, null, null]
      : equipmentSetById.get(statement.equipmentSetId)?.pieces ?? [null, null, null, null];
    const savedArmour = referencedArmour.map((piece, index) => {
      const savedPiece = rawGear(piece, input.itemNameFor, input.itemTierFor);
      return savedPiece ?? (
        statement.armorSetId !== null &&
        statement.armorSetId === input.gearLoadouts.equippedArmorSetId
          ? armour[index] ?? null
          : null
      );
    });
    const savedEquipment = referencedEquipment.map((piece, index) => {
      const savedPiece = rawGear(piece, input.itemNameFor, input.itemTierFor);
      return savedPiece ?? (
        statement.equipmentSetId !== null &&
        statement.equipmentSetId === input.gearLoadouts.equippedEquipmentSetId
          ? equipment[index] ?? null
          : null
      );
    });
    const savedPet = statement.petUuid === null ? null : petByUuid.get(statement.petUuid) ?? null;
    const savedAllocation = statement.tuningSlot === null
      ? null
      : input.facts.tuning[`slot_${statement.tuningSlot}`] ?? null;
    const savedHotmFacts = statement.miningTreeSlot == null
      ? null
      : input.facts.hotmTrees?.[statement.miningTreeSlot]
        ?? (hotmSlot === statement.miningTreeSlot ? hotmFacts : null);
    const savedHotfFacts = statement.foragingTreeSlot == null
      ? null
      : input.facts.hotfTrees?.[statement.foragingTreeSlot]
        ?? (hotfSlot === statement.foragingTreeSlot ? hotfFacts : null);
    const savedHotm = statement.miningTreeSlot == null
      ? null
      : treeDetail(savedHotmFacts, "Heart of the Mountain", statement.miningTreeSlot);
    const savedHotf = statement.foragingTreeSlot == null
      ? null
      : treeDetail(savedHotfFacts, "Heart of the Forest", statement.foragingTreeSlot);
    const completeArmour = savedArmour.filter((item): item is ProfileGearItemView => item !== null);
    const completeEquipment = savedEquipment.filter((item): item is ProfileGearItemView => item !== null);
    return {
      id: statement.id,
      name: title,
      armour: savedArmour,
      equipment: savedEquipment,
      armourSetName: armourSetName(completeArmour),
      armourBonuses: gearBonuses(completeArmour),
      equipmentBonuses: gearBonuses(completeEquipment),
      contexts: loadoutContexts(
        statement.powerStone,
        savedHotm,
        savedHotf,
        treePresetName("Heart of the Mountain", statement.miningTreeSlot ?? null),
        treePresetName("Heart of the Forest", statement.foragingTreeSlot ?? null),
      ),
      tuning: tuningViews(savedAllocation),
      pet: petView(savedPet, input.itemNameFor, input.itemTierFor),
    };
  };

  const choices: ProfileLoadoutChoiceView[] = input.gearLoadouts.loadouts.map((statement) => {
    const defaultName = `Loadout ${statement.id}`;
    const title = displayLoadoutName(statement);
    const configured =
      statement.armorSetId !== null ||
      statement.equipmentSetId !== null ||
      statement.petUuid !== null ||
      statement.powerStone !== null ||
      statement.tuningSlot !== null ||
      statement.miningTreeSlot != null ||
      statement.foragingTreeSlot != null ||
      statement.name.trim().toLocaleLowerCase() !== defaultName.toLocaleLowerCase();
    const active = activeLoadout?.id === statement.id;
    const unlocked = input.gearLoadouts.unlockedSlotCount === null || input.gearLoadouts.unlockedSlotCount === undefined
      ? true
      : statement.id <= input.gearLoadouts.unlockedSlotCount;
    const choiceState: ProfileLoadoutChoiceView["state"] = !unlocked
      ? "locked"
      : configured
        ? "saved"
        : "unset";
    return {
      id: statement.id,
      name: statement.name,
      title,
      state: choiceState,
      active,
      detail: choiceState === "saved" && !active ? detailFor(statement, title) : null,
    };
  });

  return {
    player: {
      name: input.playerName,
      uuid: input.playerUuid,
      profileName: input.profileName,
      gameMode: displayGameMode(input.gameMode),
      fetchedAt: input.fetchedAt,
    },
    skyblockLevel,
    skills,
    slayers: (input.apiDetails.slayers ?? []).map(slayerView),
    timecharms: timecharmViews(input.apiDetails),
    metrics: metricViews(input, skills),
    loadout: {
      id: activeLoadout?.id ?? null,
      name: activeLoadout?.name ?? null,
      resolved: activeLoadout !== null,
      inventoryAvailable: input.coverage.inventoryShared,
      armour,
      equipment,
      armourSetName: armourSetName(armour),
      armourBonuses: gearBonuses(armour),
      equipmentBonuses: gearBonuses(equipment.filter((item): item is ProfileGearItemView => item !== null)),
      contexts,
      tuning: tuningViews(allocation),
      pet: currentPet,
      choices,
      armourWardrobe: wardrobeView(
        input.gearLoadouts.armorSets,
        input.coverage.inventoryShared,
        input.itemNameFor,
        input.itemTierFor,
        input.gearLoadouts.equippedArmorSetId ?? activeLoadout?.armorSetId ?? null,
        armour,
      ),
      equipmentWardrobe: wardrobeView(
        input.gearLoadouts.equipmentSets,
        input.coverage.inventoryShared,
        input.itemNameFor,
        input.itemTierFor,
        activeLoadout?.equipmentSetId ?? input.gearLoadouts.equippedEquipmentSetId,
        equipment,
      ),
    },
  };
};
