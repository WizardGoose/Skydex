import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CropDefinition, MutationDefinition } from "../../../types/greenhouse";
import { attachSeconds, buildNameIndex, estimateLayoutSeconds, itemSeconds, uniqueCropsIn } from "../layoutTiming";
import { stageSeconds, type GrowthSettings } from "../../../planner/time";
import { buildLayoutPush } from "../../../../island/layout";
import type { LayoutItem } from "../../../../island/layout";

/**
 * What the mod is told about time, and what it is deliberately not told.
 *
 * The mod cannot compute this. It can see a plot but not how fast the plot
 * grows, so the site prices every cell and ships the answer, which puts the
 * whole weight of the feature on one question: is this number true? These pin
 * both halves of that - the arithmetic where the model answers, and the silence
 * where it does not.
 *
 * The dataset is the real bundled one rather than a fixture, for the same reason
 * the plan estimates use it: the seven placements this file expects to decline
 * are declined because of what the wiki does and does not record, so a dataset
 * change that would start or stop an estimate has to fail here rather than
 * quietly ship a countdown nobody checked.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
const raw = JSON.parse(readFileSync(join(ROOT, "public/greenhouse/data.json"), "utf8")) as {
  crops: Record<string, Omit<CropDefinition, "id">>;
  mutations: Record<string, Omit<MutationDefinition, "id">>;
};
const withIds = <T,>(rec: Record<string, T>): Record<string, T & { id: string }> =>
  Object.fromEntries(Object.entries(rec).map(([id, v]) => [id, { ...v, id }]));
const data = { crops: withIds(raw.crops), mutations: withIds(raw.mutations) } as {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
};
const index = buildNameIndex(data);

/** A plausible mid-game player: some Crop Growth, some upgrades, a mixed plot. */
const SETTINGS: GrowthSettings = { cropGrowth: 100, speedTier: 5, uniqueCrops: 3 };

/** 14400 / (1 + 0.025*3 + 0.0025*100 + 0.05*5) = 14400 / 1.575. */
const STAGE = stageSeconds(SETTINGS);

const crop = (name: string, over: Partial<LayoutItem> = {}): LayoutItem => ({
  position: [0, 0],
  size: 1,
  name,
  isMutation: false,
  ...over,
});

const mutation = (name: string, over: Partial<LayoutItem> = {}): LayoutItem => ({
  position: [0, 0],
  size: 1,
  name,
  isMutation: true,
  ...over,
});

const seconds = (item: LayoutItem) => itemSeconds(item, data, index, SETTINGS);

describe("uniqueCropsIn", () => {
  it("counts distinct crop types, because the plot on its way out is the plot", () => {
    // Measured rather than asked. The planner already prefers a derived count
    // over a stated one wherever it has a solve, and a layout is a solve.
    expect(uniqueCropsIn([crop("Cocoa Beans"), crop("Cocoa Beans"), crop("Pumpkin")])).toBe(2);
  });

  it("does not count mutations, which are grown rather than planted", () => {
    expect(uniqueCropsIn([crop("Cocoa Beans"), mutation("Choconut"), mutation("Ashvine")])).toBe(1);
  });

  it("matches on letters and digits, so one crop is never counted twice", () => {
    expect(uniqueCropsIn([crop("Cocoa Beans"), crop("cocoa beans"), crop("Cocoa-Beans")])).toBe(1);
  });

  it("ignores nameless placements rather than counting them as a type", () => {
    expect(uniqueCropsIn([crop("Cocoa Beans"), crop(""), crop("   ")])).toBe(1);
  });

  it("stops at the wiki's ceiling of twelve", () => {
    const many = Array.from({ length: 20 }, (_, i) => crop(`Crop ${i}`));

    expect(uniqueCropsIn(many)).toBe(12);
  });

  it("is zero for a plot of nothing but targets", () => {
    expect(uniqueCropsIn([mutation("Choconut")])).toBe(0);
  });
});

describe("itemSeconds, where the model answers", () => {
  it("prices a crop at its growth stages times one stage", () => {
    // Cocoa Beans is six stages in the bundled dataset.
    expect(seconds(crop("Cocoa Beans"))).toBeCloseTo(6 * STAGE, 6);
    expect(Math.round(seconds(crop("Cocoa Beans")) as number)).toBe(54857);
  });

  it("prices a mutation as its inputs' wait plus its own", () => {
    // Choconut grows in zero stages of its own but cannot appear until the
    // Cocoa Beans feeding it are grown, so the wait is the inputs' six stages.
    expect(seconds(mutation("Choconut"))).toBeCloseTo(6 * STAGE, 6);
  });

  it("reads the name the way the layout writes it, whatever the punctuation", () => {
    expect(seconds(crop("cocoa beans"))).toBeCloseTo(6 * STAGE, 6);
    expect(seconds(crop("  Cocoa-Beans  "))).toBeCloseTo(6 * STAGE, 6);
  });

  it("tracks the stats, so a faster player is told a shorter wait", () => {
    const slow = itemSeconds(crop("Cocoa Beans"), data, index, { cropGrowth: 0, speedTier: 0, uniqueCrops: 0 });
    const fast = itemSeconds(crop("Cocoa Beans"), data, index, { cropGrowth: 200, speedTier: 9, uniqueCrops: 12 });

    // The wiki's own two ends: 4h a stage with nothing, 1h 44m 20s with all.
    expect(slow).toBeCloseTo(6 * 14400, 6);
    expect(fast).toBeCloseTo(6 * (14400 / 2.3), 6);
    expect(fast as number).toBeLessThan(slow as number);
  });
});

describe("itemSeconds, where the model declines", () => {
  it("declines a name the dataset does not have", () => {
    expect(seconds(crop("Moon Cheese"))).toBeNull();
    expect(seconds(mutation("Moon Cheese"))).toBeNull();
  });

  it("declines a nameless placement", () => {
    expect(seconds(crop(""))).toBeNull();
    expect(seconds(crop("   "))).toBeNull();
  });

  it("declines the three crops the wiki records no growth stages for", () => {
    // growth_stages is null for exactly these. Null is "not recorded", which is
    // not the same claim as "instant", so nothing is sent.
    for (const name of ["Fire", "Dead Plant", "Fermento"]) {
      expect(seconds(crop(name)), name).toBeNull();
    }
  });

  it("declines the four mutations fed by one of those crops", () => {
    // The model reads an input it has no stage count for as zero stages, which
    // would drop the entire input wait out of the total and report a time far
    // shorter than the truth. Refused before the model is asked.
    for (const name of ["Ashwreath", "Witherbloom", "Cheesebite", "Zombud"]) {
      expect(seconds(mutation(name)), name).toBeNull();
    }
  });

  it("declines a mutation asked for as a crop, and a crop asked for as a mutation", () => {
    // The slot the layout put it in is the claim being priced; guessing across
    // would price something the player is not growing there.
    expect(seconds(crop("Choconut"))).toBeNull();
    expect(seconds(mutation("Cocoa Beans"))).toBeNull();
  });

  it("answers zero, not null, for a mutation that is genuinely instant", () => {
    // Lonelily has no inputs and no growth stages of its own. That is a real
    // answer and stays distinct from "not known"; the wire rule downstream is
    // what stops the zero from ever being sent.
    expect(seconds(mutation("Lonelily"))).toBe(0);
  });
});

describe("attachSeconds", () => {
  it("states an answer for every placement, including the refusals", () => {
    const items = attachSeconds([crop("Cocoa Beans"), crop("Fire"), mutation("Choconut")], data, SETTINGS);

    expect(items.map((i) => i.seconds === null)).toStrictEqual([false, true, false]);
  });

  it("leaves the caller's own list alone", () => {
    const original = [crop("Cocoa Beans")];
    attachSeconds(original, data, SETTINGS);

    // The caller's list is a memo other things render from; growing a field on
    // it mid-render is the kind of bug that surfaces somewhere else entirely.
    expect("seconds" in original[0]).toBe(false);
  });

  it("carries the rest of the placement through untouched", () => {
    const items = attachSeconds([crop("Cocoa Beans", { ground: "farmland", size: 2 })], data, SETTINGS);

    expect(items[0]).toMatchObject({ name: "Cocoa Beans", ground: "farmland", size: 2, isMutation: false });
  });
});

describe("estimateLayoutSeconds, the one impure step", () => {
  it("states an answer for every placement and never throws", () => {
    // The stats-less path lands here. This reads the dataset and the player's
    // stats out of live stores, and a visitor who has never opened the planner,
    // has no key and has no dataset yet has to get their layout in game anyway.
    // Whatever it finds, the shape of the answer is the same.
    const items = [crop("Cocoa Beans"), crop("Fire"), mutation("Choconut"), crop("Moon Cheese")];
    const priced = estimateLayoutSeconds(items);

    expect(priced).toHaveLength(items.length);
    for (const item of priced) {
      expect("seconds" in item).toBe(true);
      const value = item.seconds;
      expect(value === null || typeof value === "number").toBe(true);
    }
  });

  it("refuses the two placements the dataset cannot answer for, whatever the stats are", () => {
    // These do not depend on the player at all: no Crop Growth and no upgrade
    // tier can turn an unrecorded growth stage count into a duration.
    const priced = estimateLayoutSeconds([crop("Fire"), crop("Moon Cheese")]);

    expect(priced.map((i) => i.seconds)).toStrictEqual([null, null]);
  });

  it("leaves the caller's list alone here too", () => {
    const original = [crop("Cocoa Beans")];
    estimateLayoutSeconds(original);

    expect("seconds" in original[0]).toBe(false);
  });
});

describe("the whole trip, planner numbers to wire body", () => {
  it("prices a real plot and puts whole seconds on the cells", () => {
    const items: LayoutItem[] = [
      { position: [3, 0], size: 1, name: "Cocoa Beans", isMutation: false, ground: "farmland" },
      { position: [3, 1], size: 1, name: "Choconut", isMutation: true },
    ];

    const built = buildLayoutPush(attachSeconds(items, data, SETTINGS), { gridSize: 10 });
    if (!built.ok) throw new Error(built.reason);

    expect(built.body.cells).toStrictEqual([
      { x: 0, y: 3, crop: "Cocoa Beans", ground: "farmland", seconds: 54857 },
      { x: 1, y: 3, mutation: "Choconut", seconds: 54857 },
    ]);
  });

  it("sends a declined cell with no estimate beside a priced one", () => {
    const items: LayoutItem[] = [
      { position: [0, 0], size: 1, name: "Cocoa Beans", isMutation: false },
      { position: [0, 1], size: 1, name: "Fire", isMutation: false },
      { position: [0, 2], size: 1, name: "Lonelily", isMutation: true },
    ];

    const built = buildLayoutPush(attachSeconds(items, data, SETTINGS), { gridSize: 10 });
    if (!built.ok) throw new Error(built.reason);

    // Priced, unknown, and instant. Only the first carries a number, and the
    // other two are indistinguishable on the wire on purpose: both mean the mod
    // shows no timer.
    expect(built.body.cells.map((c) => c.seconds)).toStrictEqual([expect.any(Number), undefined, undefined]);
    expect(Object.prototype.hasOwnProperty.call(built.body.cells[1], "seconds")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(built.body.cells[2], "seconds")).toBe(false);
  });

  it("keeps one greenhouse-wide clock when a field's crop mix changes", () => {
    const alone: LayoutItem[] = [{ position: [0, 0], size: 1, name: "Cocoa Beans", isMutation: false }];
    const crowded: LayoutItem[] = [
      ...alone,
      { position: [0, 1], size: 1, name: "Pumpkin", isMutation: false },
      { position: [0, 2], size: 1, name: "Melon", isMutation: false },
    ];

    const one = attachSeconds(alone, data, { ...SETTINGS, uniqueCrops: 3 });
    const three = attachSeconds(crowded, data, { ...SETTINGS, uniqueCrops: 3 });
    const fullGreenhouse = attachSeconds(alone, data, { ...SETTINGS, uniqueCrops: 12 });

    expect(three[0].seconds).toBe(one[0].seconds);
    expect(fullGreenhouse[0].seconds as number).toBeLessThan(one[0].seconds as number);
  });
});
