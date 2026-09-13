import { readProfileFacts } from "../island/profileFacts";
import type { SkillDef } from "../island/skills";
import { skillProgress } from "../island/skills";
import { readNbtBlob } from "../nbt";
import { simplifyItems } from "../networth/nbtSimplify";
import { parseMemberLoadouts } from "../networth/parseItems";
import type { RawItem } from "../networth/types";
import { stripMinecraftFormatting } from "../ui/itemTooltipModel";
import { readHuntingEquipment, emptyHuntingEquipment, type HuntingEquipment } from "./huntingEquipment";

export type KuudraTier = "none" | "t1" | "t2" | "t3" | "t4" | "t5";

export interface FortunePart {
  label: string;
  value: number;
}

export interface ItemFortuneSignals {
  available: boolean;
  total: number;
  parts: FortunePart[];
  /** David's Cloak has a profile milestone bonus, not a lore stat. */
  davidCloakEquipped: boolean;
  equipmentTotal?: number;
}

export interface ShardProfileSignals {
  huntingXp: number | null;
  huntersLuck: number | null;
  kuudraTier: KuudraTier | null;
  /** Total syphoned attribute stacks, which drives David's Cloak Fortune. */
  attributeStacks: number | null;
  itemFortune: ItemFortuneSignals;
  huntingEquipment?: HuntingEquipment;
}

export interface DerivedHunterFortune {
  value: number | null;
  parts: FortunePart[];
  unavailableReason: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finiteNonNegative = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

const readKuudraTier = (member: unknown): KuudraTier | null => {
  if (!isRecord(member)) return null;
  const nether = isRecord(member.nether_island_player_data) ? member.nether_island_player_data : null;
  const completed = nether && isRecord(nether.kuudra_completed_tiers) ? nether.kuudra_completed_tiers : null;
  if (!completed) return null;

  const ladder: readonly [string, KuudraTier][] = [
    ["infernal", "t5"],
    ["fiery", "t4"],
    ["burning", "t3"],
    ["hot", "t2"],
    ["basic", "t1"],
    ["none", "t1"],
  ];
  for (const [key, tier] of ladder) {
    const count = finiteNonNegative(completed[key]);
    if (count !== null && count > 0) return tier;
  }
  return "none";
};

const attributeStackValue = (value: unknown): number | null => {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
};

/**
 * David's Cloak awards one Hunter Fortune at each Attribute Stacks milestone.
 * Count the raw profile map instead of the local shard catalogue so a newly
 * released attribute still advances the cloak before Skydex knows its name.
 */
export const readAttributeStackCount = (member: unknown): number | null => {
  if (!isRecord(member)) return null;
  const attributes = isRecord(member.attributes) ? member.attributes : null;
  const stacks = attributes && isRecord(attributes.stacks) ? attributes.stacks : null;
  if (!stacks) return null;
  return Object.values(stacks).reduce<number>((total, value) => total + (attributeStackValue(value) ?? 0), 0);
};

const DAVID_CLOAK_STACK_MILESTONES = [
  5, 10, 20, 30, 40, 50, 75, 100, 125, 150,
  200, 250, 300, 350, 400, 500, 600, 700, 850, 1_000,
  1_200, 1_400, 1_600, 1_800, 2_000, 2_500, 3_000, 3_500, 4_000, 5_000,
] as const;

export const davidCloakFortuneFromAttributeStacks = (stacks: number): number => {
  if (!Number.isFinite(stacks) || stacks < 0) return 0;
  return DAVID_CLOAK_STACK_MILESTONES.filter((threshold) => stacks >= threshold).length;
};

export const readPlainShardSignals = (member: unknown): Omit<ShardProfileSignals, "itemFortune"> => {
  const facts = readProfileFacts(member);
  const luckNode = facts.hotfTree?.nodes.hunters_luck;
  const huntersLuck = facts.hotfTree
    ? luckNode && luckNode.enabled !== false
      ? luckNode.level
      : 0
    : null;

  return {
    huntingXp: finiteNonNegative(facts.skillXp.SKILL_HUNTING),
    huntersLuck,
    kuudraTier: readKuudraTier(member),
    attributeStacks: readAttributeStackCount(member),
  };
};

const blobAt = (member: unknown, path: readonly string[]): string | null => {
  let value: unknown = member;
  for (const key of path) {
    if (!isRecord(value)) return null;
    value = value[key];
  }
  return typeof value === "string" && value.trim() ? value : null;
};

export const hunterFortuneFromItem = (item: RawItem): number => {
  const lore = item.tag?.display?.Lore;
  if (!Array.isArray(lore)) return 0;
  for (const raw of lore) {
    if (typeof raw !== "string") continue;
    const line = stripMinecraftFormatting(raw);
    const match = line.match(/Hunt(?:er|ing) Fortune\s*:\s*\+?([\d,.]+)/i)
      ?? line.match(/\+?([\d,.]+)\s*(?:[☘\uE05B]\s*)?Hunt(?:er|ing) Fortune/i);
    if (!match) continue;
    const value = Number(match[1].replace(/,/g, ""));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

const itemName = (item: RawItem): string => {
  const raw = item.tag?.display?.Name;
  return typeof raw === "string" ? stripMinecraftFormatting(raw).trim() : "Equipment";
};

const itemId = (item: RawItem): string => {
  const raw = item.tag?.ExtraAttributes?.id;
  return typeof raw === "string" ? raw.toUpperCase() : itemName(item).toUpperCase();
};

const isDavidsCloak = (item: RawItem): boolean => {
  const id = itemId(item).replace(/[^A-Z0-9]/g, "");
  const name = itemName(item).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return id === "DAVIDSCLOAK" || name === "DAVIDSCLOAK";
};

const decodeItems = async (blob: string, signal?: AbortSignal): Promise<RawItem[]> => {
  const document = await readNbtBlob(blob, signal);
  return simplifyItems(document.value);
};

export const summarizeHunterFortuneItems = (
  equipment: readonly RawItem[],
  accessories: readonly RawItem[],
): ItemFortuneSignals => {
  const parts: FortunePart[] = [];
  let davidCloakEquipped = false;
  for (const item of equipment) {
    if (isDavidsCloak(item)) {
      davidCloakEquipped = true;
      // Its Hunter Fortune is awarded by the profile's Attribute Stacks
      // milestone and is not reliably written into the item's display lore.
      continue;
    }
    const value = hunterFortuneFromItem(item);
    if (value > 0) parts.push({ label: itemName(item), value });
  }

  const grouped = new Map<string, { label: string; value: number }>();
  for (const item of accessories) {
    const value = hunterFortuneFromItem(item);
    if (value <= 0) continue;
    const id = itemId(item);
    const group = id.includes("KUUDRA_CORE") ? "KUUDRA_CORE" : id;
    const current = grouped.get(group);
    if (!current || value > current.value) grouped.set(group, { label: itemName(item), value });
  }
  parts.push(...grouped.values());
  return {
    available: true,
    total: parts.reduce((sum, part) => sum + part.value, 0),
    parts,
    davidCloakEquipped,
  };
};

/** Pick one owned equipment set, never add mutually exclusive loadouts together. */
export const selectHunterFortuneEquipment = (
  equipmentSets: readonly (readonly RawItem[])[],
  attributeStacks: number | null,
): ItemFortuneSignals => {
  const cloakFortune = davidCloakFortuneFromAttributeStacks(attributeStacks ?? 0);
  return equipmentSets
    .map((equipment) => summarizeHunterFortuneItems(equipment, []))
    .reduce<ItemFortuneSignals>((best, candidate) => {
      const bestScore = best.total + (best.davidCloakEquipped ? cloakFortune : 0);
      const candidateScore = candidate.total + (candidate.davidCloakEquipped ? cloakFortune : 0);
      return candidateScore > bestScore ? candidate : best;
    }, { available: true, total: 0, parts: [], davidCloakEquipped: false });
};

export const readHunterFortuneItems = async (
  member: unknown,
  signal?: AbortSignal,
): Promise<ItemFortuneSignals> => {
  const accessoryBlob = blobAt(member, ["inventory", "bag_contents", "talisman_bag", "data"]);
  if (!accessoryBlob) return { available: false, total: 0, parts: [], davidCloakEquipped: false };

  try {
    const [loadouts, accessories] = await Promise.all([
      parseMemberLoadouts(member, signal),
      decodeItems(accessoryBlob, signal),
    ]);
    const equipmentSets = [
      loadouts.wornEquipment.filter((item): item is RawItem => item !== null),
      ...loadouts.equipmentSets.map((set) => set.pieces.filter((item): item is RawItem => item !== null)),
    ];
    const equipment = selectHunterFortuneEquipment(equipmentSets, readAttributeStackCount(member));
    const accessory = summarizeHunterFortuneItems([], accessories);
    // An accessory bag may retain lower tiers from an upgrade chain. Count the
    // strongest Kuudra Core once. Equipment is selected as one complete owned
    // set, so a hunting loadout is usable without pretending every wardrobe
    // piece can be equipped simultaneously.
    return {
      available: true,
      total: equipment.total + accessory.total,
      parts: [...equipment.parts, ...accessory.parts],
      davidCloakEquipped: equipment.davidCloakEquipped,
      equipmentTotal: equipment.total + (equipment.davidCloakEquipped ? davidCloakFortuneFromAttributeStacks(readAttributeStackCount(member) ?? 0) : 0),
    };
  } catch {
    return { available: false, total: 0, parts: [], davidCloakEquipped: false };
  }
};

export const readShardProfileSignals = async (
  member: unknown,
  signal?: AbortSignal,
  cachedOnly = false,
): Promise<ShardProfileSignals> => {
  const [itemFortune, huntingEquipment] = await Promise.all([
    readHunterFortuneItems(member, signal),
    readHuntingEquipment(member, signal, (items) => {
      const summary = summarizeHunterFortuneItems(items, []);
      return summary.total + (summary.davidCloakEquipped ? davidCloakFortuneFromAttributeStacks(readAttributeStackCount(member) ?? 0) : 0);
    }, cachedOnly).catch(() => emptyHuntingEquipment()),
  ]);
  return { ...readPlainShardSignals(member), itemFortune, huntingEquipment };
};

export const deriveHunterFortune = (
  signals: ShardProfileSignals,
  huntingSkill: SkillDef | null,
  hunterKarmaLevel: number,
  seaSerpentLevel: number,
  tiamatLevel: number,
): DerivedHunterFortune => {
  const missing: string[] = [];
  if (signals.huntingXp === null) missing.push("Hunting skill");
  if (!huntingSkill) missing.push("Hunting level table");
  if (signals.huntersLuck === null) missing.push("Hunter's Luck");
  if (!signals.itemFortune.available) missing.push("equipment and accessories");
  if (signals.itemFortune.davidCloakEquipped && signals.attributeStacks === null) missing.push("David's Cloak milestone");
  if (missing.length > 0) {
    return {
      value: null,
      parts: [],
      unavailableReason: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} unavailable from this profile.`,
    };
  }

  // Hunting Fortune now follows Hunting through level 50. Keep the explicit
  // cap because the shared skill table may eventually expose overflow levels.
  const huntingLevel = Math.min(50, skillProgress(signals.huntingXp as number, huntingSkill as SkillDef).level);
  const luck = Math.min(50, Math.max(0, signals.huntersLuck as number));
  const tiamatMultiplier = 1 + (0.05 * tiamatLevel);
  const seaSerpentMultiplier = 1 + (0.02 * seaSerpentLevel * tiamatMultiplier);
  const karma = hunterKarmaLevel * seaSerpentMultiplier;
  const davidCloakFortune = signals.itemFortune.davidCloakEquipped
    ? davidCloakFortuneFromAttributeStacks(signals.attributeStacks ?? 0)
    : 0;
  const parts: FortunePart[] = [
    { label: "Hunting level", value: huntingLevel },
    { label: "Hunter's Luck", value: luck },
    ...(davidCloakFortune > 0 ? [{ label: "David's Cloak", value: davidCloakFortune }] : []),
    ...signals.itemFortune.parts,
  ];
  if (karma > 0) parts.push({ label: "Hunter's Karma", value: karma });
  return {
    value: parts.reduce((sum, part) => sum + part.value, 0),
    parts,
    unavailableReason: null,
  };
};
