export type AccessoryPowerStatKey =
  | "strength"
  | "defense"
  | "speed"
  | "health"
  | "critChance"
  | "critDamage"
  | "intelligence"
  | "attackSpeed"
  | "vitality"
  | "trueDefense"
  | "mending";

interface AccessoryPowerStatDefinition {
  key: AccessoryPowerStatKey;
  label: string;
  shortLabel: string;
  glyph: string;
  multiplier: number;
}

export interface AccessoryPowerStatValue extends AccessoryPowerStatDefinition {
  value: number;
}

const STAT_DEFINITIONS: readonly AccessoryPowerStatDefinition[] = [
  { key: "strength", label: "Strength", shortLabel: "Str", glyph: "❁", multiplier: 1 },
  { key: "defense", label: "Defense", shortLabel: "Def", glyph: "❈", multiplier: 1 },
  { key: "speed", label: "Speed", shortLabel: "Spd", glyph: "✦", multiplier: 0.5 },
  { key: "health", label: "Health", shortLabel: "HP", glyph: "♥", multiplier: 1.4 },
  { key: "critChance", label: "Crit Chance", shortLabel: "CC", glyph: "☣", multiplier: 0.4 },
  { key: "critDamage", label: "Crit Damage", shortLabel: "CD", glyph: "✧", multiplier: 1 },
  { key: "intelligence", label: "Intelligence", shortLabel: "Int", glyph: "✎", multiplier: 1.5 },
  { key: "attackSpeed", label: "Bonus Attack Speed", shortLabel: "AS", glyph: "⚔", multiplier: 0.3 },
  { key: "vitality", label: "Vitality", shortLabel: "Vit", glyph: "✹", multiplier: 1 / 3 },
  { key: "trueDefense", label: "True Defense", shortLabel: "TD", glyph: "◆", multiplier: 0.27 },
  { key: "mending", label: "Mending", shortLabel: "Mend", glyph: "✥", multiplier: 0.25 },
] as const;

type PowerBaseStats = Partial<Record<AccessoryPowerStatKey, number>>;

/**
 * Base Power values published by Hypixel. These are intentionally kept as
 * data rather than copied display figures because the displayed result must
 * scale with the player's current Magical Power.
 */
const POWER_BASE_STATS: Readonly<Record<string, PowerBaseStats>> = {
  fortuitous: { strength: 20, defense: 5, health: 10, critChance: 45, critDamage: 20 },
  pretty: { strength: 20, defense: 5, speed: 5, health: 5, critChance: 15, critDamage: 20, intelligence: 30 },
  protected: { strength: 10, defense: 45, health: 35, critChance: 5, critDamage: 5 },
  simple: { strength: 15, defense: 15, speed: 10, health: 15, critChance: 15, critDamage: 15, intelligence: 15 },
  warrior: { strength: 35, defense: 5, health: 10, critChance: 25, critDamage: 25 },
  commando: { strength: 35, defense: 10, health: 15, critChance: 5, critDamage: 35 },
  disciplined: { strength: 30, defense: 10, health: 15, critChance: 15, critDamage: 30 },
  inspired: { strength: 20, defense: 5, health: 5, critChance: 10, critDamage: 15, intelligence: 45 },
  ominous: { strength: 15, speed: 8, health: 15, critChance: 15, critDamage: 15, intelligence: 12, attackSpeed: 20 },
  prepared: { strength: 8, defense: 47, health: 37, critChance: 4, critDamage: 4 },
  silky: { speed: 5, critDamage: 95 },
  sweet: { defense: 45, speed: 10, health: 45 },
  adept: { defense: 40, health: 50, intelligence: 10 },
  bloody: { strength: 45, critDamage: 45, intelligence: 10 },
  forceful: { strength: 75, health: 5, critDamage: 20 },
  itchy: { strength: 30, speed: 5, critDamage: 35, attackSpeed: 30 },
  mythical: { strength: 17, defense: 17, speed: 8, health: 17, critChance: 17, critDamage: 17, intelligence: 17 },
  shaded: { strength: 20, speed: 5, critDamage: 75 },
  sighted: { intelligence: 100 },
  bizarre: { strength: -10, critDamage: -10, intelligence: 120 },
  demonic: { strength: 23, intelligence: 77 },
  hurtful: { strength: 20, critDamage: 80 },
  pleasant: { defense: 60, health: 40 },
  sanguisuge: { strength: 50, health: 15, critDamage: 20, vitality: 15 },
  frozen: { strength: 25, defense: 60, speed: -15, critDamage: 50 },
  healthy: { health: 100 },
  slender: { strength: 25, defense: 25, speed: 5, health: 25, critDamage: 25, intelligence: 25, attackSpeed: 15 },
  strong: { strength: 50, critDamage: 50 },
  bubba: { strength: 25, defense: -40, health: 15, critChance: 10, critDamage: 45, attackSpeed: 25, trueDefense: 20 },
  crumbly: { health: 30, intelligence: 15, trueDefense: 10, mending: 30, vitality: 30 },
  scorching: { strength: 35, critDamage: 40, attackSpeed: 25 },
};

export const normalizeAccessoryPowerName = (power: string): string =>
  power.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

export const accessoryPowerStats = (
  power: string | null | undefined,
  magicalPower: number | null | undefined,
): readonly AccessoryPowerStatValue[] => {
  if (!power || magicalPower === null || magicalPower === undefined || !Number.isFinite(magicalPower)) return [];
  const baseStats = POWER_BASE_STATS[normalizeAccessoryPowerName(power)];
  if (!baseStats) return [];
  const mp = Math.max(0, magicalPower);
  const scale = 719.28 * Math.pow(Math.log(1 + (0.0019 * mp)), 1.2);
  return STAT_DEFINITIONS.flatMap((definition) => {
    const basePower = baseStats[definition.key];
    if (basePower === undefined || basePower === 0) return [];
    return [{
      ...definition,
      value: Math.round((basePower / 100) * definition.multiplier * scale),
    }];
  });
};
