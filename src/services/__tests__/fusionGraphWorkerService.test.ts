import { afterEach, describe, expect, it, vi } from "vitest";
import type { FusionData } from "../../utilities/recipeUtils";
import { buildFusionGraphInWorker } from "../fusionGraphWorkerService";

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  posted: unknown[] = [];
  readonly url: URL;
  readonly options: WorkerOptions;

  constructor(url: URL, options: WorkerOptions) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const fusionData = { shards: {}, recipes: {} } as unknown as FusionData;

afterEach(() => {
  FakeWorker.instances = [];
  vi.unstubAllGlobals();
});

describe("fusion graph worker service", () => {
  it("builds the graph off the UI thread and terminates after the result", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const task = buildFusionGraphInWorker(fusionData, { A: 4 });
    const worker = FakeWorker.instances[0];

    expect(worker.options).toEqual({ type: "module" });
    expect(worker.posted).toEqual([{ type: "build", fusionData, rates: { A: 4 } }]);

    const result = { graph: { special: new Map(), id: new Map(), specialRev: new Map(), idRev: new Map() }, nodes: [], edges: [] };
    worker.onmessage?.({ data: { type: "result", result } } as MessageEvent);

    await expect(task.promise).resolves.toEqual(result);
    expect(worker.terminated).toBe(true);
  });

  it("terminates immediately when cancelled", () => {
    vi.stubGlobal("Worker", FakeWorker);
    const task = buildFusionGraphInWorker(fusionData, {});
    const worker = FakeWorker.instances[0];

    task.cancel();

    expect(worker.terminated).toBe(true);
  });
});
