import { cachedCatalogue, loadCatalogue } from "../networth/catalogue";
import { parseMemberItemsWithLayouts, parseMemberLoadouts, type MemberLoadouts } from "../networth/parseItems";
import { petLevel } from "../networth/petValue";
import type { Catalogue, PetData, RawItem } from "../networth/types";
import { petStatProfile } from "../profile/petStats";
import { readProfileFacts } from "../island/profileFacts";
import { stripMinecraftFormatting } from "../ui/itemTooltipModel";

export interface HuntingStats {
  damage: number; strength: number; critDamage: number; critChance: number;
  attackSpeed: number; fishingSpeed: number; seaCreatureChance: number; doubleHookChance: number;
}
export interface HuntingTool { name: string; tier: number; fortune: number; pull: number; stats?: HuntingStats }
export interface HuntingWeapon { name: string; stats: HuntingStats }
export interface HuntingFishingSetup {
  name: string; stats: HuntingStats; lure: number; quickBite: number; flash: number;
  frogLevel?: number;
  equipmentFortune?: number;
}
export interface HuntingEquipment {
  available: boolean;
  blackHole: HuntingTool | null;
  net: HuntingTool | null;
  lasso: HuntingTool | null;
  huntaxe: HuntingTool | null;
  trap: HuntingTool | null;
  accretion: number;
  combat: HuntingWeapon | null;
  combatArmor: string[];
  combatStats: HuntingStats;
  weaponCandidates: HuntingWeapon[];
  fishing: HuntingFishingSetup | null;
  lavaFishing: HuntingFishingSetup | null;
  fishingOptions: HuntingFishingSetup[];
  frogLevel: number | null;
  skillXp: Record<string, number>;
  combatLevel?: number;
  huntingLevel?: number;
  huntersFang?: number;
  huntersSuppress?: number;
  foragingFishingSpeed?: number;
}

const emptyStats = (): HuntingStats => ({ damage: 0, strength: 0, critDamage: 0, critChance: 0, attackSpeed: 0, fishingSpeed: 0, seaCreatureChance: 0, doubleHookChance: 0 });
const STAT_KEYS: Record<keyof HuntingStats, [string, RegExp]> = {
  damage: ["DAMAGE", /^(?:[^\w]*)(?:Damage):\s*([+\-\d,.]+)/i],
  strength: ["STRENGTH", /^(?:[^\w]*)Strength:\s*([+\-\d,.]+)/i],
  critDamage: ["CRIT_DAMAGE", /^(?:[^\w]*)(?:Crit|Critical) Damage:\s*([+\-\d,.]+)/i],
  critChance: ["CRIT_CHANCE", /^(?:[^\w]*)(?:Crit|Critical) Chance:\s*([+\-\d,.]+)/i],
  attackSpeed: ["ATTACK_SPEED", /^(?:[^\w]*)(?:Bonus )?Attack Speed:\s*([+\-\d,.]+)/i],
  fishingSpeed: ["FISHING_SPEED", /^(?:[^\w]*)Fishing Speed:\s*([+\-\d,.]+)/i],
  seaCreatureChance: ["SEA_CREATURE_CHANCE", /^(?:[^\w]*)Sea Creature Chance:\s*([+\-\d,.]+)/i],
  doubleHookChance: ["DOUBLE_HOOK_CHANCE", /^(?:[^\w]*)Double Hook Chance:\s*([+\-\d,.]+)/i],
};
const rawId = (item: RawItem): string => item.tag?.ExtraAttributes?.id ?? "";
const nameOf = (item: RawItem, catalogue: Catalogue): string => stripMinecraftFormatting(item.tag?.display?.Name ?? catalogue[rawId(item)]?.name ?? rawId(item).replace(/_/g, " ")).trim();
const loreOf = (item: RawItem): string[] => (item.tag?.display?.Lore ?? []).map(stripMinecraftFormatting);
const numeric = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;

/** Header totals already contain reforges and stars. Never add catalogue stats twice. */
export function huntingItemStats(item: RawItem, catalogue: Catalogue = {}): HuntingStats {
  const stats = emptyStats();
  const base = catalogue[rawId(item)]?.stats ?? {};
  const lore = loreOf(item);
  for (const [key, [resourceKey, pattern]] of Object.entries(STAT_KEYS) as [keyof HuntingStats, [string, RegExp]][]) {
    stats[key] = numeric(base[resourceKey] ?? base[resourceKey.toLowerCase()]);
    for (const line of lore) {
      // Item abilities are not unconditional item stats.
      if (/^(?:Ability:|Item Ability:|(?:Full Set|Tiered) Bonus:)/i.test(line.trim())) break;
      const match = line.match(pattern);
      if (match) { stats[key] = Number(match[1].replace(/,/g, "")) || 0; break; }
    }
  }
  return stats;
}
export const addHuntingStats = (...values: HuntingStats[]): HuntingStats => {
  const result = emptyStats();
  for (const value of values) for (const key of Object.keys(result) as (keyof HuntingStats)[]) result[key] += value[key];
  return result;
};

export function meleeHit(stats: HuntingStats, combatLevel = 0): number {
  // Expected ordinary melee hit, not an exact mob-specific damage simulator.
  const crit = 1 + Math.min(100, Math.max(0, stats.critChance)) / 100 * Math.max(0, stats.critDamage) / 100;
  return (5 + Math.max(0, stats.damage)) * (1 + Math.max(0, stats.strength) / 100) * crit
    * (1 + Math.min(50, combatLevel) * 0.04 + Math.max(0, Math.min(60, combatLevel) - 50) * 0.01);
}

export const emptyHuntingEquipment = (): HuntingEquipment => ({
  available: false, blackHole: null, net: null, lasso: null, huntaxe: null, trap: null, accretion: 0,
  combat: null, combatArmor: [], combatStats: emptyStats(), weaponCandidates: [],
  fishing: null, lavaFishing: null, fishingOptions: [], frogLevel: null, skillXp: {},
});

/** Attribute levels are already decoded from fused counts by the profile layer. */
export function applyHuntingAttributes(equipment: HuntingEquipment, level: (key: string) => number, hunterEcho = 1): HuntingEquipment {
  const fishingBonus = (setup: HuntingFishingSetup | null, foraging = false): HuntingFishingSetup | null => setup ? {
    ...setup,
    stats: { ...setup.stats,
      fishingSpeed: setup.stats.fishingSpeed + 3 * level("E17") + (foraging ? 3 * level("C11") : 0),
      seaCreatureChance: setup.stats.seaCreatureChance + 0.5 * level("C14"),
      doubleHookChance: setup.stats.doubleHookChance + (foraging ? 0.5 * level("L5") : 0),
    },
  } : null;
  return {
    ...equipment,
    net: equipment.net ? { ...equipment.net, pull: equipment.net.pull + level("R53") } : null,
    huntersFang: level("U21") * 0.01 * hunterEcho,
    huntersSuppress: level("E9") * 0.02 * hunterEcho,
    foragingFishingSpeed: 3 * level("C11"),
    fishing: fishingBonus(equipment.fishing),
    fishingOptions: equipment.fishingOptions.map((setup) => fishingBonus(setup)!),
    // This setup is used specifically for Stride-Ember Fissure, on Galatea.
    lavaFishing: fishingBonus(equipment.lavaFishing, true),
  };
}

/** Uses captured, accessible items only. Museum donations never establish usable gear. */
export function summarizeHuntingEquipment(
  items: readonly RawItem[], accessories: readonly RawItem[], loadouts: MemberLoadouts,
  wornArmor: readonly RawItem[], pets: readonly PetData[], catalogue: Catalogue = {},
  equipmentFortune: (items: readonly RawItem[]) => number = () => 0,
): HuntingEquipment {
  const result = { ...emptyHuntingEquipment(), available: true };
  const tools: [keyof Pick<HuntingEquipment, "blackHole" | "net" | "lasso" | "huntaxe" | "trap">, string[], number[], number[]][] = [
    ["blackHole", ["Small Pocket Black Hole", "Medium Pocket Black Hole", "Large Pocket Black Hole"], [0, 2.5, 5], [0, 0, 0]],
    ["net", ["Basic Fishing Net", "Medium Fishing Net", "Turbo Fishing Net", "Gigantic Fishing Net"], [0, 2.5, 5, 10], [5, 25, 50, 100]],
    ["lasso", ["Abysmal Lasso", "Vinerip Lasso", "Entangler Lasso", "Everstretch Lasso"], [0, 0, 2.5, 5], [0, 0, 0, 0]],
    ["huntaxe", ["Worn Huntaxe", "Sharpened Huntaxe", "Reinforced Huntaxe", "Savage Huntaxe", "Prime Huntaxe"], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
    ["trap", ["Small Huntrap", "Medium Huntrap", "Large Huntrap", "Greater Huntrap", "Astral Huntrap"], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
  ];
  for (const item of items) {
    const name = nameOf(item, catalogue);
    const canonical = catalogue[rawId(item)]?.name ?? rawId(item).replace(/_/g, " ");
    for (const [key, names, fortune, pull] of tools) {
      const index = names.findIndex((candidate) => [name, canonical].some((text) => text.toLowerCase().includes(candidate.toLowerCase())));
      if (index < 0) continue;
      const sticky = key === "net" && item.tag?.ExtraAttributes?.modifier === "sticky" ? 2.5 : 0;
      const candidate = { name, tier: index + 1, fortune: fortune[index] + sticky, pull: pull[index], stats: huntingItemStats(item, catalogue) };
      if (!result[key] || candidate.tier > result[key]!.tier || candidate.tier === result[key]!.tier && candidate.fortune > result[key]!.fortune) result[key] = candidate;
    }
  }
  for (const item of accessories) {
    const tier = ["ACCRETION_TALISMAN", "ACCRETION_RING", "ACCRETION_ARTIFACT"].indexOf(rawId(item));
    if (tier >= 0) result.accretion = Math.max(result.accretion, (tier + 1) * 0.05);
  }

  const armorSets = [wornArmor, ...loadouts.armorSets.map((set) => set.pieces.filter((piece): piece is RawItem => piece !== null))].filter((set) => set.length > 0);
  const equipmentSets = [loadouts.wornEquipment, ...loadouts.equipmentSets.map((set) => set.pieces)].map((set) => set.filter((piece): piece is RawItem => piece !== null));
  const setStats = (set: readonly RawItem[]) => addHuntingStats(...set.map((item) => huntingItemStats(item, catalogue)));
  const combatScore = (set: readonly RawItem[]) => meleeHit(addHuntingStats({ ...emptyStats(), damage: 100, critChance: 100, critDamage: 50 }, setStats(set)));
  const combatArmor = [...armorSets].sort((a, b) => combatScore(b) - combatScore(a))[0] ?? [];
  const combatEquipment = [...equipmentSets].sort((a, b) => combatScore(b) - combatScore(a))[0] ?? [];
  result.combatArmor = combatArmor.map((item) => nameOf(item, catalogue));
  result.combatStats = addHuntingStats({ ...emptyStats(), critChance: 30, critDamage: 50 }, setStats(combatArmor), setStats(combatEquipment));
  result.weaponCandidates = items.filter((item) => {
    const category = catalogue[rawId(item)]?.category;
    return category === "SWORD" || loreOf(item).some((line) => /(?:COMMON|UNCOMMON|RARE|EPIC|LEGENDARY|MYTHIC) (?:DUNGEON )?(?:LONGSWORD|SWORD)$/.test(line.trim()));
  }).map((item) => ({ name: nameOf(item, catalogue), stats: huntingItemStats(item, catalogue) }));
  result.combat = [...result.weaponCandidates].sort((a, b) => meleeHit(addHuntingStats(result.combatStats, b.stats)) - meleeHit(addHuntingStats(result.combatStats, a.stats)))[0] ?? null;

  // Compare real sets, not every armour piece together. Trophy-hunter immunity
  // sets cannot supply Sea Creatures and must not win a fishing estimate.
  const fishingArmor = [...armorSets].filter((set) => !set.some((item) => loreOf(item).some((line) => /immune to you|no longer catch|Peace Treaty/i.test(line))));
  const fishingScore = (stats: HuntingStats) => (20 + stats.seaCreatureChance) / Math.max(2.5, 15 * (1 - Math.min(300, stats.fishingSpeed) / 300) + 2.5);
  const bestFishingSet = (sets: readonly (readonly RawItem[])[]) => [...sets].sort((a, b) => fishingScore(setStats(b)) - fishingScore(setStats(a)))[0] ?? [];
  const fishingEquipment = bestFishingSet(equipmentSets);
  const fishingGear = addHuntingStats({ ...emptyStats(), seaCreatureChance: 20 }, setStats(bestFishingSet(fishingArmor)), setStats(fishingEquipment));
  const petOptions: { name: string; stats: HuntingStats; frogLevel?: number }[] = [{ name: "No pet", stats: emptyStats() }];
  for (const pet of pets) {
    const level = petLevel(pet).level;
    const profile = petStatProfile(pet.type, pet.tier, level);
    const stats = emptyStats();
    for (const stat of profile?.stats ?? []) {
      const key = (Object.keys(STAT_KEYS) as (keyof HuntingStats)[]).find((candidate) => STAT_KEYS[candidate][1].test(`${stat.label}: 0`));
      if (key) stats[key] = stat.value;
    }
    // These permanent abilities aren't part of the pet's base-stat table.
    if (pet.type === "FLYING_FISH") stats.fishingSpeed += level * (pet.tier === "RARE" ? 0.6 : pet.tier === "EPIC" ? 0.75 : 0.8);
    if (pet.type === "FROG" && ["LEGENDARY", "MYTHIC"].includes(pet.tier)) result.frogLevel = Math.max(result.frogLevel ?? 0, level);
    petOptions.push({ name: `${pet.type.replace(/_/g, " ")} ${Math.floor(level)}`, stats, frogLevel: pet.type === "FROG" && ["LEGENDARY", "MYTHIC"].includes(pet.tier) ? level : undefined });
  }
  const rods = items.filter((item) => /FISHING_(?:ROD|WEAPON)/.test(catalogue[rawId(item)]?.category ?? "") || loreOf(item).some((line) => /FISHING ROD$/.test(line.trim())));
  for (const item of rods) {
    const name = nameOf(item, catalogue);
    const extra = item.tag?.ExtraAttributes;
    const enchants = extra?.enchantments as Record<string, unknown> | undefined;
    for (const pet of petOptions) {
    const candidate: HuntingFishingSetup = {
      name: `${name} + ${pet.name}`,
      stats: addHuntingStats(fishingGear, huntingItemStats(item, catalogue), pet.stats),
      frogLevel: pet.frogLevel,
      equipmentFortune: equipmentFortune(fishingEquipment),
      lure: numeric(enchants?.lure), quickBite: numeric(enchants?.quick_bite), flash: numeric(enchants?.flash),
    };
    const lava = /(?:HELLFIRE|INFERNO|MAGMA|TOPAZ|STARTER_LAVA|BINGO_LAVA)_ROD/.test(rawId(item));
    const key = lava ? "lavaFishing" : "fishing";
    if (!result[key] || fishingScore(candidate.stats) > fishingScore(result[key]!.stats)) result[key] = candidate;
    if (!lava) result.fishingOptions.push(candidate);
    }
  }
  return result;
}

export async function readHuntingEquipment(member: unknown, signal?: AbortSignal, equipmentFortune?: (items: readonly RawItem[]) => number, cachedOnly = false): Promise<HuntingEquipment> {
  const catalogue = cachedOnly ? cachedCatalogue()?.catalogue ?? {} : await loadCatalogue().catch(() => ({}));
  const [parsed, loadouts] = await Promise.all([parseMemberItemsWithLayouts(member, null, { catalogue, signal }), parseMemberLoadouts(member, signal)]);
  if (signal?.aborted) return emptyHuntingEquipment();
  const raw = (key: string) => (parsed.items[key as keyof typeof parsed.items] ?? []) as RawItem[];
  const accessible = ["inventory", "equipment", "enderchest", "storage", "personal_vault", "hunting_toolkit"].flatMap(raw);
  const result = summarizeHuntingEquipment(accessible, raw("accessories"), loadouts, raw("armor"), (parsed.items.pets ?? []) as PetData[], catalogue, equipmentFortune);
  result.available = parsed.inventoryLayouts.containers.inventory !== null || accessible.length > 0;
  result.skillXp = readProfileFacts(member).skillXp;
  return result;
}
