import { describe, expect, it } from "vitest";
import bundled from "../../../../public/greenhouse/data.json";
import { toSolverDataset } from "../../data/solverDataset";
import type { GreenhouseDataJSON } from "../../data/datasetStore";
import { solveLocal, validateSolveResponse } from "../index";

const FULL_PLOT: [number, number][] = Array.from({ length: 100 }, (_, cell) => [
  Math.floor(cell / 10),
  cell % 10,
]);
const dataset = toSolverDataset(bundled as unknown as GreenhouseDataJSON);

const countByName = (names: string[]): Record<string, number> =>
  names.reduce<Record<string, number>>((counts, name) => {
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});

describe("finite mixed targets", () => {
  it(
    "fills every requested mutation in the four-goal workspace case",
    () => {
      const response = solveLocal(
        FULL_PLOT,
        [
          { mutation: "do_not_eat_shroom", maximize: false, count: 1 },
          { mutation: "thornshade", maximize: false, count: 1 },
          { mutation: "soggybud", maximize: false, count: 1 },
          { mutation: "magic_jellybean", maximize: false, count: 1 },
        ],
        dataset,
        { removeUnusedCrops: true },
      );

      expect(validateSolveResponse(response, FULL_PLOT, dataset).problems).toEqual([]);
      expect(countByName(response.mutations.map((mutation) => mutation.mutation))).toEqual({
        do_not_eat_shroom: 1,
        magic_jellybean: 1,
        soggybud: 1,
        thornshade: 1,
      });
      expect(response.status).toBe("OPTIMAL");
    },
    20_000,
  );

  it(
    "keeps the Magic Jellybean target beside 37 Veilshrooms without partial support rings",
    () => {
      const response = solveLocal(
        FULL_PLOT,
        [
          { mutation: "veilshroom", maximize: false, count: 37 },
          { mutation: "magic_jellybean", maximize: false, count: 1 },
        ],
        dataset,
        { removeUnusedCrops: true },
      );

      expect(validateSolveResponse(response, FULL_PLOT, dataset).problems).toEqual([]);
      expect(countByName(response.mutations.map((mutation) => mutation.mutation))).toMatchObject({
        veilshroom: 37,
        magic_jellybean: 1,
      });

      const supports = countByName(response.placements.map((placement) => placement.crop));
      expect(supports.sugar_cane).toBe(5);
      expect(supports.duskbloom).toBe(3);

      for (let index = 0; index < response.placements.length; index++) {
        const withoutOneSupport = {
          ...response,
          placements: response.placements.filter((_, placementIndex) => placementIndex !== index),
        };
        expect(validateSolveResponse(withoutOneSupport, FULL_PLOT, dataset).valid).toBe(false);
      }
    },
    20_000,
  );
});
