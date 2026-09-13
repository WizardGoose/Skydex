import { prettify } from "../island/format";
import { stripMinecraftFormatting } from "../ui/itemTooltipModel";
import { gardenVisitorIdentityFor, type GardenVisitorTier } from "./gardenVisitorRarities";
import type { ProfileSectionState } from "./riftMuseumDungeons";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const nonNegative = (value: unknown): number | null => {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
};

const timestamp = (value: unknown): number | null => {
  const number = nonNegative(value);
  return number !== null && number > 0 ? number : null;
};

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const clean = stripMinecraftFormatting(value).trim();
  return clean || null;
};

const labelFor = (key: string): string => prettify(key.replace(/^dojo_(?:points_)?/i, ""));

export interface CrimsonKuudraTierRow {
  key: string;
  label: string;
  completions: number;
}

export interface CrimsonDojoRow {
  key: string;
  label: string;
  score: number;
}

export interface TrophyFishRow {
  key: string;
  label: string;
  total: number | null;
  bronze: number | null;
  silver: number | null;
  gold: number | null;
  diamond: number | null;
  /** Raw count-field keys. They are not item-resource ids. */
  gradeKeys?: Partial<Record<TrophyTier, string>>;
}

export interface CrimsonSectionAvailability {
  faction: boolean;
  reputation: boolean;
  abiphone: boolean;
  kuudra: boolean;
  trophyFish: boolean;
  dojo: boolean;
}

export interface CrimsonIslePreviewModel {
  state: ProfileSectionState;
  selectedFaction: string | null;
  mageReputation: number | null;
  barbarianReputation: number | null;
  abiphoneContacts: number | null;
  /** Optional for snapshots written before contact labels were retained. */
  contacts?: readonly string[];
  kuudra: readonly CrimsonKuudraTierRow[];
  trophyFish: readonly TrophyFishRow[];
  dojo: readonly CrimsonDojoRow[];
  /** Optional so snapshots written before section-level coverage remain readable. */
  availability?: CrimsonSectionAvailability;
}

const KUUDRA_TIER_LABELS: Readonly<Record<string, string>> = {
  none: "Basic",
  basic: "Basic",
  hot: "Hot",
  burning: "Burning",
  fiery: "Fiery",
  infernal: "Infernal",
};

const kuudraRows = (nether: Record<string, unknown> | null): CrimsonKuudraTierRow[] => {
  const tiers = nether && isRecord(nether.kuudra_completed_tiers) ? nether.kuudra_completed_tiers : null;
  if (!tiers) return [];
  return Object.entries(tiers)
    .flatMap(([key, raw]): CrimsonKuudraTierRow[] => {
      if (!Object.prototype.hasOwnProperty.call(KUUDRA_TIER_LABELS, key.toLowerCase())) return [];
      const completions = nonNegative(raw);
      if (completions === null) return [];
      const normalized = key.toLowerCase();
      return [{ key, label: KUUDRA_TIER_LABELS[normalized] ?? labelFor(key), completions }];
    })
    .sort((left, right) => {
      const order = ["Basic", "Hot", "Burning", "Fiery", "Infernal"];
      return order.indexOf(left.label) - order.indexOf(right.label) || left.label.localeCompare(right.label);
    });
};

const dojoRows = (member: Record<string, unknown>, nether: Record<string, unknown> | null): CrimsonDojoRow[] => {
  const dojo = nether && isRecord(nether.dojo)
    ? nether.dojo
    : isRecord(member.dojo) ? member.dojo : null;
  if (!dojo) return [];
  return Object.entries(dojo)
    .flatMap(([key, raw]): CrimsonDojoRow[] => {
      const score = nonNegative(raw);
      return score === null ? [] : [{ key, label: labelFor(key), score }];
    })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
};

export type TrophyTier = "bronze" | "silver" | "gold" | "diamond";
type MutableTrophyFishRow = TrophyFishRow & Record<TrophyTier, number | null>;

const trophyFishRows = (member: Record<string, unknown>): TrophyFishRow[] => {
  const raw = isRecord(member.trophy_fish) ? member.trophy_fish : null;
  if (!raw) return [];

  const rows = new Map<string, MutableTrophyFishRow>();
  const rowFor = (key: string): MutableTrophyFishRow => {
    const existing = rows.get(key);
    if (existing) return existing;
    const created: MutableTrophyFishRow = {
      key,
      label: labelFor(key),
      total: null,
      bronze: null,
      silver: null,
      gold: null,
      diamond: null,
      gradeKeys: {},
    };
    rows.set(key, created);
    return created;
  };

  for (const [key, value] of Object.entries(raw)) {
    const count = nonNegative(value);
    if (count === null) continue;
    const tierMatch = key.match(/_(bronze|silver|gold|diamond)$/i);
    if (tierMatch) {
      const base = key.slice(0, -tierMatch[0].length);
      const tier = tierMatch[1].toLowerCase() as TrophyTier;
      const row = rowFor(base);
      row[tier] = count;
      row.gradeKeys = { ...row.gradeKeys, [tier]: key };
      continue;
    }
    if (/^(rewards?|last_|highest_|total_|version)/i.test(key)) continue;
    rowFor(key).total = count;
  }

  return [...rows.values()].sort((left, right) => left.label.localeCompare(right.label));
};

/**
 * Sanitized Crimson Isle progress from the selected profile member. Missing
 * sub-objects mean the player has no recorded progress there; they are not
 * interpreted as zero-valued completions.
 */
export const buildCrimsonIslePreviewModel = (member: unknown): CrimsonIslePreviewModel => {
  const record = isRecord(member) ? member : null;
  if (!record) {
    return {
      state: "unavailable",
      selectedFaction: null,
      mageReputation: null,
      barbarianReputation: null,
      abiphoneContacts: null,
      contacts: [],
      kuudra: [],
      trophyFish: [],
      dojo: [],
      availability: {
        faction: false,
        reputation: false,
        abiphone: false,
        kuudra: false,
        trophyFish: false,
        dojo: false,
      },
    };
  }

  const nether = isRecord(record.nether_island_player_data) ? record.nether_island_player_data : null;
  const trophyFish = trophyFishRows(record);
  if (!nether && !isRecord(record.trophy_fish)) {
    return {
      state: "never-opened",
      selectedFaction: null,
      mageReputation: null,
      barbarianReputation: null,
      abiphoneContacts: null,
      contacts: [],
      kuudra: [],
      trophyFish: [],
      dojo: [],
      availability: {
        faction: false,
        reputation: false,
        abiphone: false,
        kuudra: false,
        trophyFish: false,
        dojo: false,
      },
    };
  }

  const abiphone = nether && isRecord(nether.abiphone) ? nether.abiphone : null;
  const contacts = abiphone && Array.isArray(abiphone.active_contacts)
    ? abiphone.active_contacts.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : null;
  const selectedFaction = nether
    ? text(nether.selected_faction) ?? text(nether.faction)
    : null;
  const mageReputation = nether
    ? nonNegative(nether.mages_reputation) ?? nonNegative(nether.mage_reputation)
    : null;
  const barbarianReputation = nether
    ? nonNegative(nether.barbarians_reputation) ?? nonNegative(nether.barbarian_reputation)
    : null;
  const kuudra = kuudraRows(nether);
  const dojo = dojoRows(record, nether);
  const dojoSource = Boolean((nether && isRecord(nether.dojo)) || isRecord(record.dojo));
  const availability: CrimsonSectionAvailability = {
    faction: Boolean(nether && (Object.prototype.hasOwnProperty.call(nether, "selected_faction") || Object.prototype.hasOwnProperty.call(nether, "faction"))),
    reputation: Boolean(nether && (
      Object.prototype.hasOwnProperty.call(nether, "mages_reputation")
      || Object.prototype.hasOwnProperty.call(nether, "mage_reputation")
      || Object.prototype.hasOwnProperty.call(nether, "barbarians_reputation")
      || Object.prototype.hasOwnProperty.call(nether, "barbarian_reputation")
    )),
    abiphone: Boolean(abiphone && Array.isArray(abiphone.active_contacts)),
    kuudra: Boolean(nether && isRecord(nether.kuudra_completed_tiers)),
    trophyFish: isRecord(record.trophy_fish),
    dojo: dojoSource,
  };
  const hasProgress = selectedFaction !== null
    || mageReputation !== null
    || barbarianReputation !== null
    || contacts !== null
    || kuudra.length > 0
    || trophyFish.length > 0
    || dojo.length > 0;

  return {
    state: hasProgress && Object.values(availability).some((available) => !available) ? "partial" : hasProgress ? "populated" : "empty",
    selectedFaction: selectedFaction ? labelFor(selectedFaction) : null,
    mageReputation,
    barbarianReputation,
    abiphoneContacts: contacts?.length ?? null,
    contacts: contacts?.map(labelFor) ?? [],
    kuudra,
    trophyFish,
    dojo,
    availability,
  };
};

export interface GardenVisitorRow {
  key: string;
  label: string;
  /** Current NPC identity used for the portrait when Hypixel keeps an older API label. */
  iconName: string;
  tier: GardenVisitorTier | null;
  visits: number | null;
  completed: number | null;
}

export interface GardenCropRow {
  key: string;
  label: string;
  collected: number | null;
  upgradeLevel: number | null;
  /** Hypixel item id used for official texture/rarity lookup. */
  itemId?: string;
}

export interface GardenRequirementRow {
  key: string;
  /** Hypixel item id from the live commission requirement. */
  itemId: string;
  label: string;
  amount: number | null;
}

export interface GardenCommissionRow {
  key: string;
  label: string;
  /** Current NPC identity used for the portrait when its name is ambiguous. */
  iconName: string;
  tier: GardenVisitorTier | null;
  status: string | null;
  requirements: readonly GardenRequirementRow[];
}

export interface GardenComposterModel {
  present: boolean;
  organicMatter: number | null;
  fuelUnits: number | null;
  compostUnits: number | null;
  compostItems: number | null;
  upgrades: readonly ProfileWorldValueRow[];
}

export interface ProfileWorldValueRow {
  key: string;
  label: string;
  value: number;
}

export type GardenBarnSkinTier = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface GardenBarnSkinRow {
  /** Raw Garden API value. It is retained so old and newly added skins stay distinguishable. */
  key: string;
  label: string;
  /** Exact item/Wiki identity used for the visual and the tooltip link. */
  itemId: string;
  iconName: string;
  wikiName: string;
  tier: GardenBarnSkinTier | null;
}

interface GardenBarnSkinDefinition {
  label: string;
  itemId?: string;
  iconName?: string;
  wikiName?: string;
  tier: GardenBarnSkinTier | null;
  aliases?: readonly string[];
}

const GARDEN_BARN_SKIN_DEFINITIONS: readonly GardenBarnSkinDefinition[] = [
  { label: "Default", iconName: "Dark Oak Planks", tier: "common", aliases: ["barn_skin_0"] },
  { label: "Medieval", iconName: "Dark Oak Log", tier: "uncommon", aliases: ["barn_skin_1"] },
  { label: "Sunny", iconName: "Red Sandstone", tier: "uncommon", aliases: ["barn_skin_2", "summer"] },
  { label: "Red", iconName: "Block of Quartz", tier: "uncommon", aliases: ["barn_skin_3"] },
  { label: "Cabin", iconName: "Light Blue Terracotta", tier: "rare", aliases: ["barn_skin_4"] },
  { label: "Mansion Heights", iconName: "Spruce Planks", tier: "epic", aliases: ["barn_skin_5"] },
  { label: "Trading Post", iconName: "Oak Fence", tier: "uncommon" },
  { label: "Autumn Hut", iconName: "Spruce Leaves", tier: "uncommon" },
  { label: "Bamboo", iconName: "Stick", tier: "epic" },
  { label: "Hive", iconName: "Yellow Terracotta", tier: "legendary" },
  { label: "Castle", iconName: "Cobblestone", tier: "legendary" },
  { label: "Cozy Cottage", iconName: "Hay Bale", tier: "uncommon" },
  { label: "Cube", iconName: "Red Wool", tier: "uncommon" },
  { label: "Tavern", iconName: "Oak Log", tier: "uncommon" },
  { label: "Windmill", iconName: "Feather", tier: "uncommon" },
  { label: "Frog", tier: "legendary" },
  { label: "Jerry", iconName: "Jerry Head", tier: "legendary" },
  { label: "Pinwheel House", iconName: "Oak Planks", tier: "legendary" },
  { label: "Mushroom Barn", iconName: "Red Mushroom", tier: "legendary" },
  { label: "Beautifall Cabin", tier: "legendary", aliases: ["beautiful_cabin"] },
  {
    label: "Country",
    itemId: "COUNTRY_GREENHOUSE_SKIN",
    iconName: "Country Greenhouse Skin",
    wikiName: "Country Greenhouse Skin",
    tier: "uncommon",
  },
];

const normalizedBarnSkinKey = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .replace(/_barn_skin$/, "");

const GARDEN_BARN_SKIN_BY_KEY = new Map<string, GardenBarnSkinDefinition>(
  GARDEN_BARN_SKIN_DEFINITIONS.flatMap((definition) => {
    const names = [definition.label, `${definition.label} Barn Skin`, ...(definition.aliases ?? [])];
    return names.map((name) => [normalizedBarnSkinKey(name), definition] as const);
  }),
);

/**
 * Give both live API keys and legacy cached display strings the same visual
 * identity. Unknown future skins still receive their exact derived Wiki item
 * name, but no rarity is invented for them.
 */
export const gardenBarnSkinView = (value: GardenBarnSkinRow | string): GardenBarnSkinRow => {
  if (typeof value !== "string") return value;
  const normalized = normalizedBarnSkinKey(value);
  const definition = GARDEN_BARN_SKIN_BY_KEY.get(normalized);
  const label = definition?.label ?? labelFor(value).replace(/ Barn Skin$/i, "");
  const wikiName = definition?.wikiName ?? `${label} Barn Skin`;
  return {
    key: value,
    label,
    itemId: definition?.itemId ?? (normalized.startsWith("barn_skin_")
      ? normalized.toUpperCase()
      : `${normalized.toUpperCase()}_BARN_SKIN`),
    iconName: definition?.iconName ?? wikiName,
    wikiName,
    tier: definition?.tier ?? null,
  };
};

export interface GardenPreviewModel {
  state: ProfileSectionState;
  experience: number | null;
  unlockedPlots: readonly string[];
  selectedBarnSkin: GardenBarnSkinRow | null;
  unlockedBarnSkins: readonly GardenBarnSkinRow[];
  totalVisitorsCompleted: number | null;
  uniqueVisitorsServed: number | null;
  visitors: readonly GardenVisitorRow[];
  crops: readonly GardenCropRow[];
  activeCommissions: readonly GardenCommissionRow[];
  composter: GardenComposterModel;
  deskUpgrades: readonly ProfileWorldValueRow[];
  /** Optional so snapshots written before section-level coverage remain readable. */
  availability?: GardenSectionAvailability;
}

export interface GardenSectionAvailability {
  experience: boolean;
  plots: boolean;
  barnSkins: boolean;
  visitorTotals: boolean;
  visitors: boolean;
  cropsCollected: boolean;
  cropUpgrades: boolean;
  commissions: boolean;
  composter: boolean;
  deskUpgrades: boolean;
}

export type GardenSourceState = "available" | "never-opened" | "unavailable";

const numericRows = (value: unknown): ProfileWorldValueRow[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([key, raw]): ProfileWorldValueRow[] => {
      const number = nonNegative(raw);
      return number === null ? [] : [{ key, label: labelFor(key), value: number }];
    })
    .sort((left, right) => left.label.localeCompare(right.label));
};

const gardenVisitors = (commissionData: Record<string, unknown> | null): GardenVisitorRow[] => {
  if (!commissionData) return [];
  const visits = isRecord(commissionData.visits) ? commissionData.visits : null;
  const completed = isRecord(commissionData.completed) ? commissionData.completed : null;
  const keys = new Set([...(visits ? Object.keys(visits) : []), ...(completed ? Object.keys(completed) : [])]);
  return [...keys].map((key) => {
    const label = labelFor(key);
    const identity = gardenVisitorIdentityFor(label);
    return {
      key,
      label,
      iconName: identity.iconName,
      tier: identity.tier,
      visits: visits ? nonNegative(visits[key]) : null,
      completed: completed ? nonNegative(completed[key]) : null,
    };
  }).sort((left, right) => left.label.localeCompare(right.label));
};

const gardenCrops = (garden: Record<string, unknown>): GardenCropRow[] => {
  const collected = isRecord(garden.resources_collected) ? garden.resources_collected : null;
  const upgrades = isRecord(garden.crop_upgrade_levels) ? garden.crop_upgrade_levels : null;
  const keys = new Set([...(collected ? Object.keys(collected) : []), ...(upgrades ? Object.keys(upgrades) : [])]);
  return [...keys].map((key) => ({
    key,
    label: labelFor(key),
    collected: collected ? nonNegative(collected[key]) : null,
    upgradeLevel: upgrades ? nonNegative(upgrades[key]) : null,
    itemId: key.toUpperCase(),
  })).sort((left, right) => left.label.localeCompare(right.label));
};

const activeGardenCommissions = (garden: Record<string, unknown>): GardenCommissionRow[] => {
  const commissions = isRecord(garden.active_commissions) ? garden.active_commissions : null;
  if (!commissions) return [];
  return Object.entries(commissions).flatMap(([key, raw]): GardenCommissionRow[] => {
    if (!isRecord(raw)) return [];
    const label = labelFor(key);
    const identity = gardenVisitorIdentityFor(label);
    const requirements = Array.isArray(raw.requirement)
      ? raw.requirement.flatMap((entry, index): GardenRequirementRow[] => {
          if (!isRecord(entry)) return [];
          const id = text(entry.item) ?? text(entry.original_item);
          if (!id) return [];
          return [{
            key: `${key}:${id}:${index}`,
            itemId: id.toUpperCase(),
            label: labelFor(id),
            amount: nonNegative(entry.amount),
          }];
        })
      : [];
    return [{
      key,
      label,
      iconName: identity.iconName,
      tier: identity.tier,
      status: text(raw.status)?.replace(/_/g, " ").toLowerCase() ?? null,
      requirements,
    }];
  }).sort((left, right) => left.label.localeCompare(right.label));
};

const emptyGardenModel = (state: ProfileSectionState): GardenPreviewModel => ({
  state,
  experience: null,
  unlockedPlots: [],
  selectedBarnSkin: null,
  unlockedBarnSkins: [],
  totalVisitorsCompleted: null,
  uniqueVisitorsServed: null,
  visitors: [],
  crops: [],
  activeCommissions: [],
  composter: {
    present: false,
    organicMatter: null,
    fuelUnits: null,
    compostUnits: null,
    compostItems: null,
    upgrades: [],
  },
  deskUpgrades: [],
  availability: {
    experience: false,
    plots: false,
    barnSkins: false,
    visitorTotals: false,
    visitors: false,
    cropsCollected: false,
    cropUpgrades: false,
    commissions: false,
    composter: false,
    deskUpgrades: false,
  },
});

/** Project the dedicated Garden endpoint without retaining its raw payload. */
export const buildGardenPreviewModel = (
  garden: unknown,
  sourceState: GardenSourceState = "available",
): GardenPreviewModel => {
  if (sourceState === "unavailable") return emptyGardenModel("unavailable");
  if (sourceState === "never-opened" || !isRecord(garden)) return emptyGardenModel("never-opened");

  const commissionData = isRecord(garden.commission_data) ? garden.commission_data : null;
  const composterData = isRecord(garden.composter_data) ? garden.composter_data : null;
  const unlockedPlots = Array.isArray(garden.unlocked_plots_ids)
    ? garden.unlocked_plots_ids.filter((entry): entry is string => typeof entry === "string")
    : [];
  const unlockedBarnSkins = Array.isArray(garden.unlocked_barn_skins)
    ? garden.unlocked_barn_skins.filter((entry): entry is string => typeof entry === "string")
    : [];
  const visitors = gardenVisitors(commissionData);
  const crops = gardenCrops(garden);
  const activeCommissions = activeGardenCommissions(garden);
  const deskUpgrades = numericRows(garden.garden_upgrades);
  const composter: GardenComposterModel = composterData ? {
    present: true,
    organicMatter: nonNegative(composterData.organic_matter),
    fuelUnits: nonNegative(composterData.fuel_units),
    compostUnits: nonNegative(composterData.compost_units),
    compostItems: nonNegative(composterData.compost_items),
    upgrades: numericRows(composterData.upgrades),
  } : emptyGardenModel("empty").composter;
  const experience = nonNegative(garden.garden_experience);
  const selectedBarnSkin = text(garden.selected_barn_skin);
  const availability: GardenSectionAvailability = {
    experience: Object.prototype.hasOwnProperty.call(garden, "garden_experience"),
    plots: Array.isArray(garden.unlocked_plots_ids),
    barnSkins: Object.prototype.hasOwnProperty.call(garden, "selected_barn_skin") || Array.isArray(garden.unlocked_barn_skins),
    visitorTotals: Boolean(commissionData && (
      Object.prototype.hasOwnProperty.call(commissionData, "total_completed")
      || Object.prototype.hasOwnProperty.call(commissionData, "unique_npcs_served")
    )),
    visitors: Boolean(commissionData && (isRecord(commissionData.visits) || isRecord(commissionData.completed))),
    cropsCollected: isRecord(garden.resources_collected),
    cropUpgrades: isRecord(garden.crop_upgrade_levels),
    commissions: isRecord(garden.active_commissions),
    composter: composterData !== null,
    deskUpgrades: isRecord(garden.garden_upgrades),
  };
  const hasProgress = experience !== null
    || unlockedPlots.length > 0
    || selectedBarnSkin !== null
    || unlockedBarnSkins.length > 0
    || visitors.length > 0
    || crops.length > 0
    || activeCommissions.length > 0
    || composter.present
    || deskUpgrades.length > 0;

  return {
    state: hasProgress && Object.values(availability).some((available) => !available) ? "partial" : hasProgress ? "populated" : "empty",
    experience,
    unlockedPlots,
    selectedBarnSkin: selectedBarnSkin ? gardenBarnSkinView(selectedBarnSkin) : null,
    unlockedBarnSkins: unlockedBarnSkins.map(gardenBarnSkinView),
    totalVisitorsCompleted: commissionData ? nonNegative(commissionData.total_completed) : null,
    uniqueVisitorsServed: commissionData ? nonNegative(commissionData.unique_npcs_served) : null,
    visitors,
    crops,
    activeCommissions,
    composter,
    deskUpgrades,
    availability,
  };
};

export type ProfileUpgradeState = "claimed" | "active" | "queued" | "unknown";

export interface ProfileUpgradeRow {
  key: string;
  label: string;
  tier: number | null;
  state: ProfileUpgradeState;
  startedAt: number | null;
  claimedAt: number | null;
}

export interface ProfileBankTransactionRow {
  key: string;
  timestamp: number | null;
  action: string;
  initiator: string | null;
  amount: number;
}

export interface ProfileCoopPreviewModel {
  state: ProfileSectionState;
  profileName: string;
  gameMode: string | null;
  selected: boolean;
  memberCount: number | null;
  bankBalance: number | null;
  upgrades: readonly ProfileUpgradeRow[];
  transactions: readonly ProfileBankTransactionRow[];
  communityShared: boolean;
  bankShared: boolean;
}

export interface ProfileCoopPreviewInput {
  profileName: string;
  gameMode: string | null;
  selected: boolean;
  memberCount: number | null;
  communityUpgrades: unknown;
  bankBalance: number | null;
  bankTransactions: unknown;
}

const upgradeRow = (raw: unknown, index: number, stateOverride?: ProfileUpgradeState): ProfileUpgradeRow | null => {
  if (!isRecord(raw)) return null;
  const upgrade = text(raw.upgrade);
  if (!upgrade) return null;
  const startedAt = timestamp(raw.started_ms) ?? timestamp(raw.start_ms);
  const claimedAt = timestamp(raw.claimed_ms);
  const state: ProfileUpgradeState = stateOverride ?? (claimedAt !== null || raw.claimed === true
    ? "claimed"
    : "unknown");
  return {
    key: `${upgrade}:${nonNegative(raw.tier) ?? "unknown"}:${index}`,
    label: labelFor(upgrade),
    tier: nonNegative(raw.tier),
    state,
    startedAt,
    claimedAt,
  };
};

const profileUpgrades = (community: Record<string, unknown> | null): ProfileUpgradeRow[] => {
  if (!community) return [];
  const rows = Array.isArray(community.upgrade_states)
    ? community.upgrade_states.flatMap((raw, index) => {
        const row = upgradeRow(raw, index);
        return row ? [row] : [];
      })
    : [];
  if (isRecord(community.currently_upgrading)) {
    const current = upgradeRow(community.currently_upgrading, rows.length, "active");
    if (current) {
      const recorded = rows.findIndex((row) => row.label === current.label && row.tier === current.tier);
      if (recorded >= 0) rows.splice(recorded, 1, current);
      else rows.push(current);
    }
  }
  return rows.sort((left, right) =>
    (right.claimedAt ?? right.startedAt ?? 0) - (left.claimedAt ?? left.startedAt ?? 0)
    || left.label.localeCompare(right.label));
};

const bankTransactions = (raw: unknown): ProfileBankTransactionRow[] => {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index): ProfileBankTransactionRow[] => {
    if (!isRecord(entry)) return [];
    const amount = nonNegative(entry.amount);
    const action = text(entry.action);
    if (amount === null || !action) return [];
    const at = timestamp(entry.timestamp);
    return [{
      key: `${at ?? "unknown"}:${action}:${index}`,
      timestamp: at,
      action: labelFor(action),
      initiator: text(entry.initiator_name),
      amount,
    }];
  }).sort((left, right) => (right.timestamp ?? 0) - (left.timestamp ?? 0));
};

/** Profile-level and co-op shared data, kept separate from the member pages. */
export const buildProfileCoopPreviewModel = (input: ProfileCoopPreviewInput): ProfileCoopPreviewModel => {
  const community = isRecord(input.communityUpgrades) ? input.communityUpgrades : null;
  const bankShared = input.bankBalance !== null || Array.isArray(input.bankTransactions);
  const upgrades = profileUpgrades(community);
  const transactions = bankTransactions(input.bankTransactions);
  const partial = !community || !bankShared;
  return {
    state: partial ? "partial" : "populated",
    profileName: input.profileName,
    gameMode: input.gameMode ? labelFor(input.gameMode) : null,
    selected: input.selected,
    memberCount: input.memberCount,
    bankBalance: input.bankBalance,
    upgrades,
    transactions,
    communityShared: community !== null,
    bankShared,
  };
};
