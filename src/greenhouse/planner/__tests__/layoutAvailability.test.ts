import { describe, expect, it, vi } from "vitest";
import bundled from "../../../../public/greenhouse/data.json";
import { getDefaultUnlockedCells } from "../../constants";
import { toSolverDataset } from "../../data/solverDataset";
import type { GreenhouseDataJSON } from "../../data/datasetStore";
import { solveLocal, validateSolveResponse } from "../../solver";
import { FULL_PLOT, solveGoal, shippedSolveOptions } from "../../solver/request";
import type { MutationGoal } from "../../types/greenhouse";

vi.mock("../../services/greenhouseService", async () => {
  const { toSolverDataset } = await import("../../data/solverDataset");
  const { solveLocal } = await import("../../solver");
  const raw = (await import("../../../../public/greenhouse/data.json")).default;
  const dataset = toSolverDataset(raw as unknown as GreenhouseDataJSON);
  return {
    solveGreenhouseDirect: async (
      cells: [number, number][], targets: MutationGoal[], _signal?: AbortSignal, removeUnusedCrops = false,
    ) => solveLocal(cells, targets, dataset, { removeUnusedCrops }),
  };
});

import { solveLayout } from "../useSolvedLayout";
import { solveEconomy } from "../useSolverEconomies";

const dataset = toSolverDataset(bundled as unknown as GreenhouseDataJSON);
const starter = [...getDefaultUnlockedCells()].map((cell) => cell.split(",").map(Number) as [number, number]);

describe("Groovy Nozzle field availability", () => {
  it.each([["cheesebite", 3], ["glasscorn", 1]] as const)(
    "%s rejects an empty starter field and recovers on full land",
    async (id, spots) => {
      const empty = solveLocal(starter, [solveGoal(id, spots)], dataset, shippedSolveOptions(true));
      expect(empty.mutations).toHaveLength(0);
      await expect(solveLayout(starter, [id], spots)).rejects.toThrow("current usable cells");
      expect(await solveEconomy(id, undefined, starter)).toBeNull();

      const result = await solveLayout(FULL_PLOT, [id], spots);
      expect(result.mutations.filter((placement) => placement.mutation === id)).toHaveLength(spots);
      expect(result.placements.length).toBeGreaterThan(0);
      expect(validateSolveResponse(result, FULL_PLOT, dataset)).toEqual({ valid: true, problems: [] });
    },
  );

  it("still allows a valid field with no planted inputs", async () => {
    const result = await solveLayout(starter, ["lonelily"], 1);
    expect(result.mutations).toHaveLength(1);
    expect(result.placements).toHaveLength(0);
  });
});
