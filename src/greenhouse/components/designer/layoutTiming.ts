import type { CropDefinition, MutationDefinition } from "../../types/greenhouse";
import { getDataset } from "../../data/datasetStore";
import { getUniqueCrops } from "../../data/uniqueCropsStore";
import { currentPlannerState } from "../../planner/usePlannerState";
import { resolveSpeedTier } from "../../planner/growthSource";
import { plantingSeconds, stageSeconds, type GrowthSettings } from "../../planner/time";
import { currentGreenhouseStats } from "../../../island/profileStats";
import type { LayoutItem } from "../../../island/layout";

/**
 * How long each placement in a layout push is expected to take.
 *
 * The mod asked for a timer and has no honest way to build one: it can see what
 * is standing in the plot but not how fast the plot grows, because growth speed
 * is a player stat plus a wiki formula and the mod has neither. The site has
 * both. So the estimate is computed here, sent as `seconds` on each cell, and
 * displayed rather than derived at the other end.
 *
 * The model is not restated here. `time.ts` owns it, citation and all, and this
 * module only decides two things: which numbers to feed it, and when its answer
 * is trustworthy enough to send.
 *
 * ## When the answer is not sent
 *
 * Declining is the interesting half, because a wrong countdown in game is worse
 * than no countdown: a player who trusts it walks away and comes back to an
 * unfinished plot. So an estimate goes out only when every input behind it is a
 * real figure someone stated, and these are the cases where one is not:
 *
 *   unknown name       the placement's name matches nothing in the dataset, so
 *                      there is no growth stage count to work from at all.
 *   crop with no stage The wiki lists no growth stages for Fire, Dead Plant or
 *   count              Fermento. `growth_stages` is null for exactly those
 *                      three, and null means "not recorded", not "instant".
 *   mutation fed by    Ashwreath, Witherbloom, Cheesebite and Zombud all take
 *   one of those       one of those three as an input. `plantingSeconds` reads
 *                      a missing stage count as zero, which would quietly drop
 *                      the whole input wait out of the total and report a time
 *                      far shorter than the truth, so those are refused here
 *                      before the model is ever asked.
 *   genuinely instant  Eleven mutations have zero growth stages, and one of
 *                      them, Lonelily, has no inputs either, so its honest
 *                      total is zero. `buildLayoutPush` drops that rather than
 *                      putting a zero on the wire; there is nothing to wait for
 *                      and so nothing to count down.
 *
 * Everything here is pure except `estimateLayoutSeconds`, which is the one
 * function that reads the stores, so the rules above can be tested by calling a
 * function rather than by mounting a page.
 */

/** The shape `plantingSeconds` reads, keyed by dataset id. */
interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

/** The wiki's own ceiling on the unique crop bonus. */
const MAX_UNIQUE_CROPS = 12;

/**
 * Match on letters and digits only.
 *
 * A layout item carries the display name, because that is what the mod shows
 * and what both callers already build. The dataset is keyed by id, so the two
 * are joined on the name, and joining on a normalised name means "Cocoa Beans"
 * and "cocoa beans" are the same row. Every display name in the dataset is
 * distinct under this, so the join cannot be ambiguous.
 */
const normalise = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Display name to definition, built once per dataset read. */
export interface NameIndex {
  crops: Map<string, CropDefinition>;
  mutations: Map<string, MutationDefinition>;
}

export const buildNameIndex = (data: Dataset): NameIndex => {
  const crops = new Map<string, CropDefinition>();
  const mutations = new Map<string, MutationDefinition>();
  for (const def of Object.values(data.crops)) crops.set(normalise(def.name), def);
  for (const def of Object.values(data.mutations)) mutations.set(normalise(def.name), def);
  return { crops, mutations };
};

/**
 * Distinct crop types this layout puts in its plot.
 *
 * This is useful layout metadata, but it is not the growth-speed input. Hypixel
 * counts unique crops across every Greenhouse plot, so the timer reads the
 * greenhouse-wide store instead of treating this single layout as the whole
 * system.
 *
 * Mutations are not counted. The bonus is for crop types standing in the plot,
 * and a mutation cell is where a mutation will appear rather than something
 * planted, which is the same line the planner draws when it counts a plot
 * economy's crops.
 */
export const uniqueCropsIn = (items: readonly LayoutItem[]): number => {
  const seen = new Set<string>();
  for (const item of items) {
    if (item.isMutation) continue;
    const name = typeof item.name === "string" ? normalise(item.name) : "";
    if (name !== "") seen.add(name);
  }
  return Math.min(MAX_UNIQUE_CROPS, seen.size);
};

/**
 * Seconds for one placement, or null when the model cannot answer for it.
 *
 * A crop waits out its own growth stages. A mutation waits for the crops that
 * feed it to reach the stage where they count and then grows itself, which is
 * two waits and exactly what `plantingSeconds` already models, so that function
 * is called rather than reimplemented.
 */
export const itemSeconds = (
  item: LayoutItem,
  data: Dataset,
  index: NameIndex,
  settings: GrowthSettings,
): number | null => {
  const name = typeof item.name === "string" ? normalise(item.name) : "";
  if (name === "") return null;

  if (item.isMutation) {
    const mutation = index.mutations.get(name);
    if (!mutation) return null;

    // Guard the input wait before trusting the total. `plantingSeconds` reads an
    // input it cannot find as zero stages, which is the right call for its own
    // purposes but would silently shorten the answer here.
    for (const requirement of mutation.requirements) {
      const input: CropDefinition | MutationDefinition | undefined =
        data.mutations[requirement.crop] ?? data.crops[requirement.crop];
      if (!input || typeof input.growth_stages !== "number") return null;
    }

    return plantingSeconds(mutation.id, data, settings);
  }

  const crop = index.crops.get(name);
  if (!crop || typeof crop.growth_stages !== "number") return null;
  return crop.growth_stages * stageSeconds(settings);
};

/**
 * The same items back, each carrying its estimate where there is one.
 *
 * Returns new objects rather than mutating, because the caller's list is a memo
 * that other things render from and a placement growing a field mid-render is
 * the kind of bug that only shows up in the one component nobody was watching.
 */
export const attachSeconds = (
  items: readonly LayoutItem[],
  data: Dataset,
  settings: GrowthSettings,
): LayoutItem[] => {
  const index = buildNameIndex(data);
  return items.map((item) => ({ ...item, seconds: itemSeconds(item, data, index, settings) }));
};

/**
 * The player's growth stats, resolved the way the planner resolves them.
 *
 * Crop Growth has only one home. Hypixel computes it at runtime and never stores
 * it, so the API cannot answer and the planner's own field is the whole truth.
 * The Growth Speed tier does have an API answer, so it goes through
 * `resolveSpeedTier` and lands on the same precedence every other stat on the
 * site uses: what the player typed, then what the API said, then what was last
 * stored. Reading it any other way would let the mod show a tier the site is not
 * showing.
 */
export const resolveLayoutGrowth = (): GrowthSettings => {
  const growth = currentPlannerState().growth;
  return {
    cropGrowth: growth.cropGrowth,
    speedTier: resolveSpeedTier(growth, currentGreenhouseStats()),
    uniqueCrops: getUniqueCrops(),
  };
};

/**
 * The one impure entry point: read the stores, price the layout.
 *
 * Called at the moment of the click rather than during a render, on purpose.
 * This button already refuses to subscribe to the island store because doing so
 * would open a live connection for every visitor who has no mod, and the same
 * argument applies here: subscribing to the stats store would start a refresh on
 * two pages that never asked for one. A plain read costs nothing, and the moment
 * the player presses the button is exactly when the numbers matter.
 *
 * Never throws. A dataset that has not loaded leaves every estimate absent,
 * which the mod already renders correctly as no timer, so the layout still goes
 * out and the only thing lost is the countdown.
 */
export const estimateLayoutSeconds = (items: readonly LayoutItem[]): LayoutItem[] => {
  try {
    const dataset = getDataset();
    const data: Dataset = {
      crops: Object.fromEntries(dataset.crops.map((c) => [c.id, c])),
      mutations: Object.fromEntries(dataset.mutations.map((m) => [m.id, m])),
    };
    return attachSeconds(items, data, resolveLayoutGrowth());
  } catch {
    return items.map((item) => ({ ...item, seconds: null }));
  }
};
