import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SolveResponse } from "../../types/greenhouse";
import type { GreenhouseDataJSON } from "../../data/datasetStore";
import { toSolverDataset } from "../../data/solverDataset";
import { evaluateMutationTargets } from "../../utilities/mutationValidation";
import { solveLocal } from "../../solver";
import { FULL_PLOT } from "../../solver/request";
import {
  buildDelayedGrowthLayout,
  delayedGrowthWaveMap,
  estimateDelayedGrowthTiming,
  fullyGrownInPlace,
  restoreDelayedGrowthLayout,
} from "../delayedGrowth";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const raw = JSON.parse(readFileSync(join(ROOT, "public/greenhouse/data.json"), "utf8")) as GreenhouseDataJSON;
const data = toSolverDataset(raw);

// [Melon, Gloomgourd] / [Soggybud, empty] / [Gloomgourd, Melon].
const soggybudField: SolveResponse = {
  status: "OPTIMAL",
  placements: [
    { crop: "melon", position: [4, 4], size: 1 },
    { crop: "gloomgourd", position: [4, 5], size: 1 },
    { crop: "gloomgourd", position: [6, 4], size: 1 },
    { crop: "melon", position: [6, 5], size: 1 },
  ],
  mutations: [{ mutation: "soggybud", position: [5, 4], size: 1 }],
};

// The reported four-goal plot, after the existing Soggybud/Thornshade conversion.
const partiallyDelayedFourGoalField: SolveResponse = {
  status: "DELAYED",
  placements: Object.entries({
    melon: [[0, 0], [2, 1]], pumpkin: [[1, 1]],
    wild_rose: [[2, 5], [2, 6], [2, 7], [4, 7]],
    red_mushroom: [[2, 8], [3, 4], [5, 5]],
    brown_mushroom: [[3, 8], [4, 4], [5, 6]],
    sugar_cane: [[6, 3], [6, 4], [8, 2], [8, 3], [8, 4]],
    duskbloom: [[6, 2], [7, 2], [7, 4]],
    scourroot: [[6, 7], [7, 5], [7, 7], [8, 5]],
    veilshroom: [[6, 5], [6, 6], [8, 6], [8, 7]],
  }).flatMap(([crop, positions]) => positions.map((position) => ({ crop, position: position as [number, number], size: 1 }))),
  mutations: Object.entries({
    gloomgourd: [[0, 1], [2, 0]], soggybud: [[1, 0]],
    veilshroom: [[3, 5], [3, 7], [4, 5], [4, 6]], thornshade: [[3, 6]],
    magic_jellybean: [[7, 3]], do_not_eat_shroom: [[7, 6]],
  }).flatMap(([mutation, positions]) => positions.map((position) => ({ mutation, position: position as [number, number], size: 1 }))),
};

// Literal latest screenshot, including its three growing Scourroots and the
// unhighlighted Scourroot that still has to be planted at [7, 5].
const screenshotFourGoalField: SolveResponse = {
  status: "DELAYED",
  placements: Object.entries({
    melon: [[0, 0], [2, 1]], pumpkin: [[1, 1]],
    wild_rose: [[2, 5], [2, 6], [2, 7], [4, 7]],
    red_mushroom: [[2, 4], [2, 8], [5, 5], [9, 6]],
    brown_mushroom: [[3, 4], [3, 8], [5, 6], [9, 7]],
    sugar_cane: [[6, 3], [6, 4], [8, 2], [8, 3], [8, 4]],
    duskbloom: [[6, 2], [7, 2], [7, 4]],
    scourroot: [[7, 5]], potato: [[6, 8], [9, 4]], carrot: [[7, 8], [9, 5]],
  }).flatMap(([crop, positions]) => positions.map((position) => ({ crop, position: position as [number, number], size: 1 }))),
  mutations: Object.entries({
    gloomgourd: [[0, 1], [2, 0]], soggybud: [[1, 0]],
    veilshroom: [[3, 5], [3, 7], [4, 5], [4, 6], [6, 5], [6, 6], [8, 6], [8, 7]],
    thornshade: [[3, 6]], scourroot: [[6, 7], [7, 7], [8, 5]],
    magic_jellybean: [[7, 3]], do_not_eat_shroom: [[7, 6]],
  }).flatMap(([mutation, positions]) => positions.map((position) => ({ mutation, position: position as [number, number], size: 1 }))),
};

const evaluateField = (result: SolveResponse) => evaluateMutationTargets(
  result.placements.map((placement) => ({
    ...placement, id: `${placement.crop}@${placement.position}`, cropId: placement.crop,
    cropName: placement.crop, isMutation: false,
  })),
  result.mutations.map((placement) => ({
    ...placement, id: `${placement.mutation}@${placement.position}`, cropId: placement.mutation,
    cropName: placement.mutation, isMutation: true,
  })),
  Object.values(data.mutations),
);

const expectLegalField = (result: SolveResponse, cells = FULL_PLOT) => {
  const allowed = new Set(cells.map((position) => position.join(",")));
  const occupied = new Set<string>();
  for (const placement of [...result.placements, ...result.mutations]) {
    for (let dr = 0; dr < placement.size; dr++) {
      for (let dc = 0; dc < placement.size; dc++) {
        const cell = `${placement.position[0] + dr},${placement.position[1] + dc}`;
        expect(allowed.has(cell), `locked cell ${cell}`).toBe(true);
        expect(occupied.has(cell), `overlap at ${cell}`).toBe(false);
        occupied.add(cell);
      }
    }
  }
};

const expectReachableTargets = (result: SolveResponse) => {
  const validation = evaluateField(result);
  expect(validation.size).toBe(result.mutations.length);
  for (const [id, target] of validation) {
    expect(target.state, id).not.toBe("invalid");
    expect(target.missingRequirements, id).toEqual([]);
  }
};

const crowdedCells: [number, number][] = [
  ...partiallyDelayedFourGoalField.placements.map((placement) => placement.position),
  ...partiallyDelayedFourGoalField.mutations.map((placement) => placement.position),
  [6, 8], [7, 8], [9, 4], [9, 5], [9, 6], [9, 7],
];

describe("delayed growth fields", () => {
  it("rearranges the crowded dependency group so all four Scourroots can grow", () => {
    const source = structuredClone(partiallyDelayedFourGoalField);
    const delayed = buildDelayedGrowthLayout(source, ["do_not_eat_shroom", "thornshade", "soggybud", "magic_jellybean"], data);
    expect(delayed).not.toBeNull();
    expect(delayed!.grownInPlace).toEqual({ veilshroom: 4, scourroot: 4 });
    expect(delayed!.displayResult.placements.filter((placement) => placement.crop === "scourroot")).toEqual([]);
    expect(delayed!.displayResult.placements.some((placement) => placement.crop === "veilshroom")).toBe(false);
    for (const target of source.mutations.filter((target) => target.mutation !== "do_not_eat_shroom")) {
      expect(delayed!.displayResult.mutations).toContainEqual(target);
    }
    expect(delayed!.displayResult.mutations.filter((target) => target.mutation === "do_not_eat_shroom")).toHaveLength(1);
    for (const placement of source.placements.filter((placement) => !["scourroot", "veilshroom"].includes(placement.crop))) {
      expect(delayed!.displayResult.placements).toContainEqual(placement);
    }
    expectLegalField(delayed!.displayResult);
    expectReachableTargets(delayed!.displayResult);
    const validation = evaluateField(delayed!.displayResult);
    for (const target of delayed!.displayResult.mutations.filter((target) => target.mutation === "scourroot")) {
      expect(validation.get(`scourroot@${target.position}`)).toMatchObject({
        state: "valid", delay: 0, missingRequirements: [],
        satisfiedRequirements: [
          { crop: "potato", needed: 1, have: 1, satisfied: true },
          { crop: "carrot", needed: 1, have: 1, satisfied: true },
        ],
      });
    }
    expect(source).toEqual(partiallyDelayedFourGoalField);
  });

  it("validates every target in the latest screenshot, including each Scourroot's own growth inputs", () => {
    expectLegalField(screenshotFourGoalField);
    const validation = evaluateField(screenshotFourGoalField);
    expect(validation.size).toBe(17);
    expect([...validation.values()].filter((target) => target.state === "valid")).toHaveLength(14);
    expect([...validation.values()].filter((target) => target.state === "delayed")).toHaveLength(3);
    for (const position of [[6, 7], [7, 7], [8, 5]]) {
      expect(validation.get(`scourroot@${position}`)).toEqual({
        state: "valid", delay: 0, isValid: true, missingRequirements: [],
        satisfiedRequirements: [
          { crop: "potato", needed: 1, have: 1, satisfied: true },
          { crop: "carrot", needed: 1, have: 1, satisfied: true },
        ],
      });
    }
    expect(validation.has("scourroot@7,5")).toBe(false);
  });

  it("rearranges the exact screenshot without losing goals or previously growing inputs, and restores it on toggle-off", () => {
    const original = structuredClone(screenshotFourGoalField);
    const delayed = buildDelayedGrowthLayout(original, ["do_not_eat_shroom", "thornshade", "soggybud", "magic_jellybean"], data)!;
    expect(delayed).not.toBeNull();
    expect(delayed.grownInPlace).toEqual({ scourroot: 1 });
    expect(delayed.displayResult.placements.some((placement) => placement.crop === "scourroot")).toBe(false);
    expect(delayed.displayResult.mutations.filter((target) => target.mutation === "scourroot")).toHaveLength(4);
    for (const id of new Set(original.mutations.map((target) => target.mutation))) {
      expect(delayed.displayResult.mutations.filter((target) => target.mutation === id).length).toBeGreaterThanOrEqual(
        original.mutations.filter((target) => target.mutation === id).length,
      );
    }
    expectLegalField(delayed.displayResult);
    expectReachableTargets(delayed.displayResult);
    expect(delayed.stages.flatMap((stage) => stage.mutations)).toHaveLength(18);
    expect(delayed.mergedWaves).toBe(1);
    const change = { direct: original, delayed: delayed.displayResult };
    expect(restoreDelayedGrowthLayout(delayed.displayResult, change)).toBe(original);
    expect(restoreDelayedGrowthLayout({
      ...delayed.displayResult, placements: delayed.displayResult.placements.slice(1),
    }, change)).toBeNull();
    expect(original).toEqual(screenshotFourGoalField);
  });

  it("keeps a valid partial conversion when unlocked land cannot fit the relocated group", () => {
    const original = structuredClone(partiallyDelayedFourGoalField);
    const delayed = buildDelayedGrowthLayout(original, "do_not_eat_shroom", data, crowdedCells)!;
    expect(delayed?.grownInPlace).toEqual({ veilshroom: 4, scourroot: 3 });
    expect(delayed.displayResult.placements).toContainEqual({ crop: "scourroot", position: [7, 5], size: 1 });
    expectLegalField(delayed.displayResult, crowdedCells);
    expectReachableTargets(delayed.displayResult);
    expect(buildDelayedGrowthLayout(delayed.displayResult, "do_not_eat_shroom", data, crowdedCells)).toBeNull();
    expect(restoreDelayedGrowthLayout(delayed.displayResult, { direct: original, delayed: delayed.displayResult })).toBe(original);
    expect(original).toEqual(partiallyDelayedFourGoalField);
  });

  it.each(["mirror", "transpose"])("rearranges the same dependency geometry after a %s", (transform) => {
    const position = ([row, col]: [number, number]): [number, number] =>
      transform === "mirror" ? [row, 9 - col] : [col, row];
    const transformed: SolveResponse = {
      ...screenshotFourGoalField,
      placements: screenshotFourGoalField.placements.map((placement) => ({ ...placement, position: position(placement.position) })),
      mutations: screenshotFourGoalField.mutations.map((target) => ({ ...target, position: position(target.position) })),
    };
    const delayed = buildDelayedGrowthLayout(transformed, "do_not_eat_shroom", data)!;
    expect(delayed?.grownInPlace).toEqual({ scourroot: 1 });
    expect(delayed.displayResult.mutations.filter((target) => target.mutation === "scourroot")).toHaveLength(4);
    expect(delayed.displayResult.placements.some((placement) => placement.crop === "scourroot")).toBe(false);
    expectLegalField(delayed.displayResult);
    expectReachableTargets(delayed.displayResult);
  });

  it("leaves the source unchanged when rearrangement is cancelled", () => {
    const controller = new AbortController();
    controller.abort();
    const original = structuredClone(screenshotFourGoalField);
    expect(buildDelayedGrowthLayout(original, "do_not_eat_shroom", data, FULL_PLOT, controller.signal)).toBeNull();
    expect(original).toEqual(screenshotFourGoalField);
  });

  it("rejects the enclosed screenshot Scourroot if it is treated as a growth target", () => {
    const attempted: SolveResponse = {
      ...screenshotFourGoalField,
      placements: screenshotFourGoalField.placements.filter((placement) => placement.crop !== "scourroot"),
      mutations: [...screenshotFourGoalField.mutations, { mutation: "scourroot", position: [7, 5], size: 1 }],
    };
    const validation = evaluateField(attempted);
    expect(validation.get("scourroot@7,5")).toEqual({
      state: "invalid", delay: null, isValid: false, satisfiedRequirements: [],
      missingRequirements: [
        { crop: "potato", needed: 1, have: 0, satisfied: false },
        { crop: "carrot", needed: 1, have: 0, satisfied: false },
      ],
    });
    expect(validation.get("do_not_eat_shroom@7,6")).toMatchObject({
      state: "invalid", delay: null,
      missingRequirements: [{ crop: "scourroot", needed: 4, have: 3, satisfied: false }],
    });
  });

  it("uses one central Pumpkin to grow both Gloomgourds in the exact Soggybud pattern", () => {
    const delayed = buildDelayedGrowthLayout(soggybudField, "soggybud", data);

    expect(delayed).not.toBeNull();
    expect(delayed!.grownInPlace).toEqual({ gloomgourd: 2 });
    expect(delayed!.addedInputs).toEqual({ pumpkin: 1 });
    expect(delayed!.displayResult.placements).toEqual([
      soggybudField.placements[0],
      soggybudField.placements[3],
      { crop: "pumpkin", position: [5, 5], size: 1 },
    ]);
    expect(delayed!.stages).toEqual([
      { wave: 0, mutations: [
        { mutation: "gloomgourd", position: [4, 5], size: 1 },
        { mutation: "gloomgourd", position: [6, 4], size: 1 },
      ] },
      { wave: 1, mutations: soggybudField.mutations },
    ]);
    expectLegalField(delayed!.displayResult);
  });

  it("keeps a legal partial conversion when two inputs compete for one helper cell", () => {
    const competingData = {
      ...data,
      mutations: {
        ...data.mutations,
        soggybud: { ...data.mutations.soggybud, requirements: [
          { crop: "gloomgourd", count: 1 }, { crop: "veilshroom", count: 1 },
        ] },
      },
    };
    const field: SolveResponse = {
      status: "OPTIMAL",
      placements: [
        { crop: "gloomgourd", position: [5, 4], size: 1 },
        { crop: "veilshroom", position: [5, 6], size: 1 },
        { crop: "melon", position: [4, 3], size: 1 },
        { crop: "red_mushroom", position: [4, 7], size: 1 },
      ],
      mutations: [{ mutation: "soggybud", position: [5, 5], size: 1 }],
    };
    const cells: [number, number][] = [[5, 4], [5, 6], [4, 3], [4, 7], [5, 5], [4, 5]];
    const delayed = buildDelayedGrowthLayout(field, "soggybud", competingData, cells);
    expect(delayed?.grownInPlace).toEqual({ gloomgourd: 1 });
    expect(delayed?.addedInputs).toEqual({ pumpkin: 1 });
    expect(delayed!.displayResult.placements).toContainEqual(field.placements[1]);
    expect(delayed!.displayResult.mutations).toContainEqual(field.mutations[0]);
    expectLegalField(delayed!.displayResult, cells);
  });

  it("retains a dependency phase for partial, direct or unresolved consuming fields", () => {
    const complete = buildDelayedGrowthLayout(soggybudField, "soggybud", data)!;
    expect(fullyGrownInPlace("gloomgourd", [complete])).toBe(true);
    expect(fullyGrownInPlace("gloomgourd", [complete, null])).toBe(false);
    expect(fullyGrownInPlace("gloomgourd", [complete, undefined])).toBe(false);
    expect(fullyGrownInPlace("gloomgourd", [])).toBe(false);
    const partial = buildDelayedGrowthLayout(partiallyDelayedFourGoalField, "do_not_eat_shroom", data, crowdedCells)!;
    expect(fullyGrownInPlace("veilshroom", [partial])).toBe(true);
    expect(fullyGrownInPlace("scourroot", [partial])).toBe(false);
  });

  it("respects the usable-cell shape when adding shared helpers", () => {
    const cells: [number, number][] = [[4, 4], [4, 5], [5, 4], [5, 5], [6, 4], [6, 5]];
    const delayed = buildDelayedGrowthLayout(soggybudField, "soggybud", data, cells);
    expect(delayed?.addedInputs).toEqual({ pumpkin: 1 });
    expectLegalField(delayed!.displayResult, cells);

    const withoutCenter = cells.filter(([row, col]) => row !== 5 || col !== 5);
    expect(buildDelayedGrowthLayout(soggybudField, "soggybud", data, withoutCenter)).toBeNull();

    const widerMask = FULL_PLOT.filter(([row, col]) => row !== 5 || col !== 5);
    const wider = buildDelayedGrowthLayout(soggybudField, "soggybud", data, widerMask);
    expect(wider?.addedInputs).toEqual({ pumpkin: 2 });
    expectLegalField(wider!.displayResult, widerMask);
  });

  it("keeps other goal targets and never puts a helper on their reserved cells", () => {
    const otherTarget = { mutation: "gloomgourd", position: [5, 5] as [number, number], size: 1 };
    const direct: SolveResponse = {
      ...soggybudField,
      placements: [...soggybudField.placements, { crop: "pumpkin", position: [5, 6], size: 1 }],
      mutations: [otherTarget, ...soggybudField.mutations],
    };
    const delayed = buildDelayedGrowthLayout(direct, "soggybud", data);
    expect(delayed).not.toBeNull();
    for (const target of direct.mutations) expect(delayed!.displayResult.mutations).toContainEqual(target);
    expect(delayed!.displayResult.placements).toContainEqual(direct.placements[4]);
    expectLegalField(delayed!.displayResult);
  });

  it("keeps an existing plant in the shared helper square", () => {
    const wheat = { crop: "wheat", position: [5, 5] as [number, number], size: 1 };
    const delayed = buildDelayedGrowthLayout({
      ...soggybudField, placements: [...soggybudField.placements, wheat],
    }, "soggybud", data);
    expect(delayed?.addedInputs).toEqual({ pumpkin: 2 });
    expect(delayed!.displayResult.placements).toContainEqual(wheat);
    expectLegalField(delayed!.displayResult);
  });

  it("rejects an overlapping or locked source planting without changing it", () => {
    const invalid = {
      ...soggybudField,
      placements: [...soggybudField.placements, { crop: "wheat", position: [5, 4] as [number, number], size: 1 }],
    };
    expect(buildDelayedGrowthLayout(invalid, "soggybud", data)).toBeNull();
    expect(buildDelayedGrowthLayout(soggybudField, "soggybud", data, [[5, 5]])).toBeNull();
    expect(soggybudField.placements).toHaveLength(4);
    expect(soggybudField.mutations).toHaveLength(1);
  });

  it("converts the real finite Soggybud solver result into plantable base inputs", () => {
    const direct = solveLocal(FULL_PLOT, [{ mutation: "soggybud", maximize: false, count: 1 }], data, {
      removeUnusedCrops: true,
    });
    const delayed = buildDelayedGrowthLayout(direct, ["soggybud"], data, FULL_PLOT);
    expect(delayed?.grownInPlace).toEqual({ gloomgourd: 2 });
    expect(delayed!.addedInputs.pumpkin).toBe(1);
    expect(delayed!.displayResult.placements.some((placement) => placement.crop === "gloomgourd")).toBe(false);
    for (const target of direct.mutations) expect(delayed!.displayResult.mutations).toContainEqual(target);
    expectLegalField(delayed!.displayResult);
  });

  it("keeps all four Auto-arrange goals when their eligible inputs grow in place", () => {
    const goals = ["do_not_eat_shroom", "thornshade", "soggybud", "magic_jellybean"];
    const direct = solveLocal(FULL_PLOT, goals.map((mutation) => ({ mutation, maximize: false, count: 1 })), data, {
      removeUnusedCrops: true,
    });
    expect(direct.mutations.map((target) => target.mutation).sort()).toEqual([...goals].sort());
    const delayed = buildDelayedGrowthLayout(direct, goals, data, FULL_PLOT);
    expect(delayed).not.toBeNull();
    for (const target of direct.mutations) {
      expect(delayed!.displayResult.mutations.filter((candidate) => candidate.mutation === target.mutation)).toHaveLength(1);
    }
    expect(delayed!.grownInPlace.gloomgourd).toBe(2);
    expect(delayed!.grownInPlace.scourroot).toBe(4);
    expect(delayed!.stages.flatMap((stage) => stage.mutations)).toHaveLength(delayed!.displayResult.mutations.length);
    expectLegalField(delayed!.displayResult);
    expectReachableTargets(delayed!.displayResult);
  });

  it("restores the original planting on toggle-off without overwriting manual edits", () => {
    const delayed = buildDelayedGrowthLayout(soggybudField, "soggybud", data)!.displayResult;
    const change = { direct: soggybudField, delayed };
    expect(restoreDelayedGrowthLayout(delayed, change)).toBe(soggybudField);
    expect(restoreDelayedGrowthLayout({
      ...delayed, placements: [...delayed.placements].reverse(),
    }, change)).toBe(soggybudField);
    expect(restoreDelayedGrowthLayout({
      ...delayed, placements: [...delayed.placements, { crop: "wheat", position: [0, 0], size: 1 }],
    }, change)).toBeNull();
    expect(restoreDelayedGrowthLayout(delayed, null)).toBeNull();
  });

  it("grows Veilshrooms in Thornshade's support cells instead of asking for a replant", () => {
    const direct = solveLocal(
      FULL_PLOT,
      [{ mutation: "thornshade", maximize: false, count: 1 }],
      data,
      { removeUnusedCrops: true, timeBudgetMs: 30_000 },
    );
    const delayed = buildDelayedGrowthLayout(direct, "thornshade", data);

    expect(delayed).not.toBeNull();
    expect(delayed!.grownInPlace).toEqual({ veilshroom: 4 });
    expect(delayed!.addedInputs).toEqual({ brown_mushroom: 2, red_mushroom: 2 });
    expect(delayed!.displayResult.placements.reduce<Record<string, number>>((counts, placement) => {
      counts[placement.crop] = (counts[placement.crop] ?? 0) + 1;
      return counts;
    }, {})).toEqual({ brown_mushroom: 2, red_mushroom: 2, wild_rose: 4 });
    expect(delayed!.displayResult.placements.some((placement) => placement.crop === "veilshroom")).toBe(false);
    expect(delayed!.displayResult.mutations.filter((placement) => placement.mutation === "veilshroom")).toHaveLength(4);
    expect(delayed!.displayResult.mutations.filter((placement) => placement.mutation === "thornshade")).toHaveLength(1);
    expect(delayed!.mergedWaves).toBe(1);

    const waves = delayedGrowthWaveMap(delayed!);
    expect(Object.values(waves).filter((wave) => wave === 0)).toHaveLength(4);
    expect(Object.values(waves).filter((wave) => wave === 1)).toHaveLength(1);

    const timing = estimateDelayedGrowthTiming(delayed!, "thornshade", 1, data);
    expect(timing).not.toBeNull();
    expect(timing!.groups).toEqual([
      expect.objectContaining({ id: "veilshroom", count: 4 }),
    ]);
    expect(timing!.expectedCycles).toBeGreaterThan(timing!.dependencyExpectedCycle);
    expect(timing!.p90Cycles).toBeGreaterThanOrEqual(timing!.p50Cycles);
    expect(timing!.finalRollExpectedCycles).toBeGreaterThan(0);

    const inputs = delayed!.displayResult.placements.map((placement, index) => ({
      id: `input-${index}`,
      cropId: placement.crop,
      cropName: placement.crop,
      size: placement.size,
      position: placement.position,
      isMutation: false,
    }));
    const targets = delayed!.displayResult.mutations.map((placement, index) => ({
      id: `target-${index}`,
      cropId: placement.mutation,
      cropName: placement.mutation,
      size: placement.size,
      position: placement.position,
      isMutation: true,
    }));
    const validation = evaluateMutationTargets(inputs, targets, Object.values(data.mutations));
    const thornshade = targets.find((target) => target.cropId === "thornshade")!;
    expect(validation.get(thornshade.id)).toMatchObject({ state: "delayed", delay: 1 });
  });

  it("does not pretend special or deeper mutation mechanics are statically solved", () => {
    const impossible = {
      status: "OPTIMAL",
      placements: [{ crop: "shellfruit", position: [4, 3] as [number, number], size: 1 }],
      mutations: [{ mutation: "startlevine", position: [4, 4] as [number, number], size: 1 }],
    };
    expect(buildDelayedGrowthLayout(impossible, "startlevine", data)).toBeNull();
  });

  it("leaves unrelated solver support planted instead of inventing an extra growth wave", () => {
    const direct = solveLocal(
      FULL_PLOT,
      [{ mutation: "thornshade", maximize: false, count: 1 }],
      data,
      { removeUnusedCrops: true, timeBudgetMs: 30_000 },
    );
    const occupied = new Set(
      [...direct.placements, ...direct.mutations].flatMap((placement) => {
        const [row, col] = placement.position;
        return Array.from({ length: placement.size }, (_, dr) =>
          Array.from({ length: placement.size }, (__, dc) => `${row + dr},${col + dc}`)
        ).flat();
      }),
    );
    let extra: [number, number] | null = null;
    for (let row = 0; row < 10 && !extra; row++) {
      for (let col = 0; col < 10; col++) {
        if (!occupied.has(`${row},${col}`)) {
          extra = [row, col];
          break;
        }
      }
    }
    expect(extra).not.toBeNull();

    const delayed = buildDelayedGrowthLayout({
      ...direct,
      placements: [...direct.placements, { crop: "dustgrain", position: extra!, size: 1 }],
    }, "thornshade", data);

    expect(delayed).not.toBeNull();
    expect(delayed!.displayResult.placements.some((placement) => placement.crop === "dustgrain")).toBe(true);
    expect(delayed!.displayResult.mutations.some((placement) => placement.mutation === "dustgrain")).toBe(false);
  });
});
