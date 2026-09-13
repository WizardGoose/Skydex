import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SolveResponse } from "../../types/greenhouse";

const clients = vi.hoisted(() => ({
  background: vi.fn(),
  interactive: vi.fn(),
}));

vi.mock("../../solverClient", () => ({
  runSolve: clients.background,
  createSolverClient: () => ({
    runSolve: clients.interactive,
    terminate: vi.fn(),
    isWorkerRunning: () => false,
  }),
}));

vi.mock("../../data/datasetStore", () => ({
  getDataset: () => ({ crops: [], mutations: [] }),
}));

const response: SolveResponse = {
  status: "OPTIMAL",
  total_cells_used: 0,
  placements: [],
  mutations: [],
  solver_approach: "test",
};

const cells: [number, number][] = [[0, 0]];
const targets = [{ mutation: "soggybud", maximize: false, count: 1 }];

describe("greenhouse solver service queues", () => {
  beforeEach(() => {
    clients.background.mockReset().mockResolvedValue(response);
    clients.interactive.mockReset().mockResolvedValue(response);
  });

  it("keeps user-triggered jobs off the background solver queue", async () => {
    const { solveGreenhouseDirect, solveGreenhouseWithJob } = await import("../greenhouseService");
    let releaseBackground!: (value: SolveResponse) => void;
    let backgroundFinished = false;
    clients.background.mockReturnValue(new Promise<SolveResponse>((resolve) => {
      releaseBackground = resolve;
    }).then((value) => {
      backgroundFinished = true;
      return value;
    }));

    const background = solveGreenhouseDirect(cells, targets);

    await expect(solveGreenhouseWithJob({ cells, targets })).resolves.toBe(response);

    expect(clients.interactive).toHaveBeenCalledOnce();
    expect(clients.background).toHaveBeenCalledOnce();
    expect(backgroundFinished).toBe(false);
    releaseBackground(response);
    await expect(background).resolves.toBe(response);
  });

  it("keeps planner economy solves on the shared background client", async () => {
    const { solveGreenhouseDirect } = await import("../greenhouseService");

    await expect(solveGreenhouseDirect(cells, targets)).resolves.toBe(response);

    expect(clients.background).toHaveBeenCalledOnce();
    expect(clients.interactive).not.toHaveBeenCalled();
  });

  it("cancels the interactive job without disturbing background work", async () => {
    const { solveGreenhouseDirect, solveGreenhouseWithJob } = await import("../greenhouseService");
    let releaseBackground!: (value: SolveResponse) => void;
    let backgroundFinished = false;
    clients.background.mockReturnValue(new Promise<SolveResponse>((resolve) => {
      releaseBackground = resolve;
    }).then((value) => {
      backgroundFinished = true;
      return value;
    }));
    clients.interactive.mockImplementationOnce(({ signal }: { signal?: AbortSignal }) =>
      new Promise<SolveResponse>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));

    const background = solveGreenhouseDirect(cells, targets);
    const controller = new AbortController();
    const interactive = solveGreenhouseWithJob({ cells, targets }, undefined, controller.signal);
    controller.abort();

    await expect(interactive).rejects.toThrow("Job cancelled");
    expect(backgroundFinished).toBe(false);
    await expect(solveGreenhouseWithJob({ cells, targets })).resolves.toBe(response);
    releaseBackground(response);
    await expect(background).resolves.toBe(response);
  });
});
