import { slug } from "../items/wikiCrafting";

export interface CraftedGeneratorProfile {
  /** False means player_data/crafted_generators was private or absent. */
  available: boolean;
  /** Highest crafted tier keyed by the catalogue family id. */
  highestByFamily: Readonly<Record<string, number>>;
  /** Raw generator ids retained for diagnostics and future schema additions. */
  raw: readonly string[];
  /** Generator ids that were present but did not map to the shipped catalogue. */
  unmapped: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const rawGeneratorList = (value: unknown): string[] | null => {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
  if (!isRecord(value)) return null;
  const values = Object.values(value).filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : Object.keys(value).filter((key) => /_[1-9]\d*$/.test(key));
};

/** Parse the authoritative Hypixel `member.player_data.crafted_generators` field. */
export const parseCraftedGenerators = (
  member: unknown,
  knownFamilies?: readonly string[] | ReadonlySet<string>,
): CraftedGeneratorProfile => {
  const playerData = isRecord(member) && isRecord(member.player_data) ? member.player_data : null;
  if (!playerData || !("crafted_generators" in playerData)) {
    return { available: false, highestByFamily: {}, raw: [], unmapped: [] };
  }
  const raw = rawGeneratorList(playerData.crafted_generators) ?? [];
  const known = knownFamilies == null ? null : new Set(knownFamilies);
  const highest: Record<string, number> = {};
  const unmapped: string[] = [];
  for (const generator of raw) {
    const match = generator.trim().match(/^(.+)_([1-9]\d*)$/);
    if (!match) {
      unmapped.push(generator);
      continue;
    }
    const familyId = slug(match[1]);
    const tier = Number(match[2]);
    if ((known && !known.has(familyId)) || !Number.isSafeInteger(tier) || tier < 1) {
      unmapped.push(generator);
      continue;
    }
    highest[familyId] = Math.max(highest[familyId] ?? 0, tier);
  }
  return { available: true, highestByFamily: highest, raw, unmapped };
};
