import type { MinionFamilyProgress } from "./minions";

export interface MinionCategory {
  id: string;
  entries: readonly MinionFamilyProgress[];
}

const CATEGORY_ORDER = [
  "Farming",
  "Mining",
  "Combat",
  "Foraging",
  "Fishing",
  "Alchemy",
  "Enchanting",
  "Slayer",
] as const;

/** Keep the catalogue order inside each game category for stable scanning. */
export const groupMinionFamilies = (
  entries: readonly MinionFamilyProgress[],
): readonly MinionCategory[] => {
  const grouped = new Map<string, MinionFamilyProgress[]>();
  for (const entry of entries) {
    const category = entry.family.type.trim() || "Other";
    const bucket = grouped.get(category) ?? [];
    bucket.push(entry);
    grouped.set(category, bucket);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => {
      const leftIndex = CATEGORY_ORDER.indexOf(left as (typeof CATEGORY_ORDER)[number]);
      const rightIndex = CATEGORY_ORDER.indexOf(right as (typeof CATEGORY_ORDER)[number]);
      if (leftIndex === -1 && rightIndex === -1) return left.localeCompare(right);
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    })
    .map(([id, categoryEntries]) => ({ id, entries: categoryEntries }));
};

export const MINION_CATEGORY_BOARD_CLASS = "min-w-0";
export const MINION_CATEGORY_CARD_CLASS = "rounded-md border border-white/8 bg-white/5";
export const MINION_FAMILY_ROW_CLASS =
  "grid min-h-12 min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-white/8 px-2 py-1.5 text-left last:border-b-0";
export const MINION_DETAIL_SHEET_CLASS =
  "min-w-0 overflow-hidden rounded-md border border-white/10 bg-slate-950/45";
