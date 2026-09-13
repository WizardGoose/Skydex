import type { CropDefinition, MutationDefinition } from "../types/greenhouse";

/**
 * Growth time.
 *
 * Skydex's 2026-07-28 Hypixel SkyBlock Wiki snapshot gives this candidate
 * formula for how long a single growth stage takes. Hypixel's own December 12
 * notes confirm the four-hour base and that Garden/Crop Growth, unique crops
 * and the Growth Speed upgrade reduce it, but they do not publish the complete
 * equation. Keep the date and uncertainty attached rather than presenting an
 * inferred formula as an official one.
 *
 *   stage seconds = 14400 / (1 + 0.025c + 0.0025g + upgradeTerm)
 *
 *     c            unique crop types growing across any Greenhouse plot
 *                  (0 to 12)
 *     g            your Crop Growth stat (0 to 200)
 *     upgradeTerm  0.05 per Growth Speed upgrade tier for tiers 0 to 8,
 *                  and a flat 0.50 at tier 9
 *
 * Sanity check on the formula: at c=12, g=200, u=9 it gives 6260.9s, which is
 * 1h 44m 20s, exactly the fastest time the wiki quotes. Baseline with
 * everything at zero is 14400s, the 4h the wiki quotes. Both ends line up.
 */

export const BASE_STAGE_SECONDS = 14400;

export interface GrowthSettings {
  /** Crop Growth stat, 0 to 200. */
  cropGrowth: number;
  /** Greenhouse Growth Speed upgrade tier, 0 to 9. */
  speedTier: number;
  /** Unique crop types growing across any Greenhouse plot, 0 to 12. */
  uniqueCrops: number;
}

export const DEFAULT_GROWTH: GrowthSettings = { cropGrowth: 0, speedTier: 0, uniqueCrops: 0 };

export const upgradeTerm = (tier: number): number => (tier >= 9 ? 0.5 : Math.max(0, Math.min(8, tier)) * 0.05);

export const stageSeconds = (s: GrowthSettings): number => {
  const c = Math.max(0, Math.min(12, s.uniqueCrops));
  const g = Math.max(0, Math.min(200, s.cropGrowth));
  const multiplier = 1 + 0.025 * c + 0.0025 * g + upgradeTerm(s.speedTier);
  return BASE_STAGE_SECONDS / multiplier;
};

interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

/**
 * Seconds for one planting of a mutation.
 *
 * A planting is two waits, not one: the input crops have to reach the stage
 * where they count, and then the mutation itself has to grow. Inputs grow in
 * parallel with each other, so the slowest one sets that half.
 *
 * Mutations with zero growth stages are genuinely instant once they spawn.
 * That is not missing data; the wiki lists 0 for eleven of them.
 */
export const plantingSeconds = (
  mutationId: string,
  data: Dataset,
  settings: GrowthSettings,
): number | null => {
  const mutation = data.mutations[mutationId];
  if (!mutation) return null;

  const perStage = stageSeconds(settings);

  let inputStages = 0;
  for (const req of mutation.requirements) {
    const def = data.mutations[req.crop] ?? data.crops[req.crop];
    const stages = def?.growth_stages ?? 0;
    inputStages = Math.max(inputStages, stages ?? 0);
  }

  return (inputStages + (mutation.growth_stages ?? 0)) * perStage;
};

/** "3d 4h", "6h 20m", "45m". Compact enough to sit in a table row. */
export const formatDuration = (seconds: number): string => {
  if (!isFinite(seconds) || seconds <= 0) return "instant";

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
};

/**
 * How long a run of plantings takes.
 *
 * `plots` is how many greenhouse plots you run at once. You can unlock up to
 * three, and they grow in parallel, so three plots cuts the wall clock by
 * roughly a third.
 */
export const totalSeconds = (plantings: number, perPlanting: number, plots = 1): number =>
  (plantings * perPlanting) / Math.max(1, plots);
