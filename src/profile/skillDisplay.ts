import { memberSkillKey, skillProgress, type SkillDef, type SkillDefs } from "../island/skills";

const FORAGING_KEY = "FORAGING";
const FORAGING_EXTRA_CAP_KEY = "FORAGING_EXTRA_LEVEL_CAP";
const FORAGING_BASE_CAP = 50;

export type ProfileSkillFigure =
  | { kind: "progress"; currentXp: number; totalXp: number; lifetimeXp: number }
  | { kind: "overflow"; valueXp: number; lifetimeXp: number }
  | { kind: "lifetime"; valueXp: number; lifetimeXp: number };

export interface ProfileSkillRow {
  resourceKey: string;
  xp: number;
  def: SkillDef | null;
  level: number | null;
  capLevel: number | null;
  maxed: boolean;
  figure: ProfileSkillFigure;
}

const foragingDefAtCurrentCap = (def: SkillDef, extraCap: number | undefined): SkillDef => {
  const unlockedExtraLevels = Number.isInteger(extraCap) && (extraCap ?? 0) >= 0 ? extraCap! : 0;
  const maxLevel = Math.min(def.maxLevel, FORAGING_BASE_CAP + unlockedExtraLevels);
  return maxLevel === def.maxLevel ? def : { ...def, maxLevel };
};

const skillRow = (resourceKey: string, xp: number, def: SkillDef | null, foragingExtraCap: number | undefined): ProfileSkillRow => {
  if (!def) {
    return {
      resourceKey,
      xp,
      def: null,
      level: null,
      capLevel: null,
      maxed: false,
      figure: { kind: "lifetime", valueXp: xp, lifetimeXp: xp },
    };
  }

  const currentDef = resourceKey === FORAGING_KEY ? foragingDefAtCurrentCap(def, foragingExtraCap) : def;
  const progress = skillProgress(xp, currentDef);
  return {
    resourceKey,
    xp,
    def: currentDef,
    level: progress.level,
    capLevel: currentDef.maxLevel,
    maxed: progress.maxed,
    figure: progress.maxed
      ? { kind: "overflow", valueXp: progress.xpInto, lifetimeXp: xp }
      : { kind: "progress", currentXp: progress.xpInto, totalXp: progress.xpForNext ?? 0, lifetimeXp: xp },
  };
};

/**
 * Turn Hypixel's raw experience map into only the skill rows the profile shows.
 * `FORAGING_EXTRA_LEVEL_CAP` is a per-profile cap modifier, not a separate XP
 * ladder, so it changes the Foraging row and is never emitted as a pseudo-skill.
 */
export const profileSkillRows = (skillXp: Record<string, number>, defs: SkillDefs | null): ProfileSkillRow[] => {
  const stated = new Map<string, number>();
  for (const [key, xp] of Object.entries(skillXp)) {
    if (Number.isFinite(xp) && xp >= 0) stated.set(memberSkillKey(key), xp);
  }

  const foragingExtraCap = stated.get(FORAGING_EXTRA_CAP_KEY);
  stated.delete(FORAGING_EXTRA_CAP_KEY);

  const rows: ProfileSkillRow[] = [];
  if (defs) {
    for (const resourceKey of Object.keys(defs)) {
      const xp = stated.get(resourceKey);
      if (xp === undefined) continue;
      rows.push(skillRow(resourceKey, xp, defs[resourceKey], foragingExtraCap));
      stated.delete(resourceKey);
    }
  }

  for (const [resourceKey, xp] of stated) rows.push(skillRow(resourceKey, xp, null, foragingExtraCap));
  return rows;
};
