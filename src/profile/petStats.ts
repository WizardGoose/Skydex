import type { ItemTooltipTone } from "../ui/itemTooltipModel";
import {
  skyBlockStatPresentation,
  type SkyBlockStatColorClass,
} from "../utilities/utilityFunctions";
import { PET_STAT_DEFINITIONS } from "./petStats.generated";

export interface PetStatView {
  name: string;
  label: string;
  value: number;
  formatted: string;
  glyph: string | null;
  colorClass: SkyBlockStatColorClass | null;
  tone: ItemTooltipTone;
}

export interface PetAbilityView {
  name: string;
  description: string;
}

export interface PetStatProfile {
  petType: string | null;
  stats: readonly PetStatView[];
  abilities: readonly PetAbilityView[];
}

const normalizeId = (value: string): string => value
  .trim()
  .toUpperCase()
  .replace(/[\s-]+/g, "_")
  .replace(/^PET_/, "");

const statTone = (name: string): ItemTooltipTone => {
  const normalized = name.trim().toLowerCase();
  if (/health|heart|vitality/.test(normalized)) return "health";
  if (/defen[cs]e|resistance/.test(normalized)) return "defense";
  if (/intelligence|mana/.test(normalized)) return "mana";
  if (/strength|damage|critical|crit |ferocity|attack speed/.test(normalized)) return "damage";
  if (/fortune|magic find|mining speed|fishing speed|sea creature|pet luck|pristine/.test(normalized)) return "fortune";
  return "default";
};

const statValue = (base: number, perLevel: number, level: number): number =>
  Math.round((base + perLevel * level) * 1_000) / 1_000;

const formatStatValue = (value: number, percent: boolean): string => {
  const figure = value.toLocaleString("en-US", { maximumFractionDigits: 3 });
  return `${value > 0 ? "+" : ""}${figure}${percent ? "%" : ""}`;
};

const formatAbilityValue = (base: number, perLevel: number, level: number, roundDown: boolean): string => {
  const value = base + perLevel * level;
  const rounded = roundDown ? Math.floor(value) : Math.round(value * 1_000) / 1_000;
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 3 });
};

const abilityDescription = (
  template: string,
  variables: Readonly<Record<string, { base: number; perLevel: number; roundDown: boolean; eval: string | null }>>,
  level: number,
): string | null => {
  let unresolved = false;
  const substituted = template.replace(/\{(\d+)\}/g, (_placeholder, key: string) => {
    const variable = variables[key];
    if (!variable || variable.eval !== null) {
      unresolved = true;
      return "";
    }
    return formatAbilityValue(variable.base, variable.perLevel, level, variable.roundDown);
  });
  if (unresolved) return null;
  return substituted
    .replace(/\/(?=&[0-9a-fk-or])/gi, "\n")
    .replace(/&([0-9a-fk-or])/gi, "§$1")
    .trim();
};

/** Resolve a pet's direct player stats from the vendored Hypixel Wiki pet table. */
export const petStatProfile = (
  type: string,
  tier: string,
  level: number | null,
): PetStatProfile | null => {
  if (level === null || !Number.isFinite(level) || level < 0) return null;
  const definition = PET_STAT_DEFINITIONS[normalizeId(type)];
  if (!definition) return null;
  const tierKey = tier.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const rows = definition.byTier[tierKey] ?? definition.base;
  const abilityTier = definition.abilitiesByTier[tierKey];
  return {
    petType: definition.petType,
    stats: rows.flatMap((row) => {
      const value = statValue(row.base, row.perLevel, level);
      if (!Number.isFinite(value) || value === 0) return [];
      const presentation = skyBlockStatPresentation(row.name);
      return [{
        name: row.name,
        label: presentation ? `${presentation.glyph} ${row.name}` : row.name,
        value,
        formatted: formatStatValue(value, presentation?.percent ?? false),
        glyph: presentation?.glyph ?? null,
        colorClass: presentation?.colorClass ?? null,
        tone: statTone(row.name),
      }];
    }),
    abilities: abilityTier ? abilityTier.indices.flatMap((index) => {
      const ability = definition.abilities.find((entry) => entry.index === index);
      if (!ability) return [];
      const description = abilityDescription(ability.description, abilityTier.variables, level);
      return description === null ? [] : [{ name: ability.name, description }];
    }) : [],
  };
};
