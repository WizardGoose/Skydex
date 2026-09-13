import type { FusionData } from "../utilities/recipeUtils";
import type { FusionEdge, FusionGraph, ShardNode } from "../utilities/fusionGraphLayout";

export interface FusionGraphBuildResult {
  graph: FusionGraph;
  nodes: ShardNode[];
  edges: FusionEdge[];
}

type FusionGraphWorkerMessage =
  | { type: "result"; result: FusionGraphBuildResult }
  | { type: "error"; message: string };

/**
 * Build the cost-pruned, Dagre-positioned fusion graph away from the UI thread.
 * The returned data is the same structured-clone-safe Maps, Sets, nodes and
 * edges the page previously built synchronously.
 */
export function buildFusionGraphInWorker(
  fusionData: FusionData,
  rates: Record<string, number>
): { promise: Promise<FusionGraphBuildResult>; cancel: () => void } {
  const worker = new Worker(new URL("../workers/fusionGraphWorker.ts", import.meta.url), { type: "module" });

  const promise = new Promise<FusionGraphBuildResult>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<FusionGraphWorkerMessage>) => {
      if (event.data.type === "result") {
        worker.terminate();
        resolve(event.data.result);
      } else {
        worker.terminate();
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message || "Fusion graph worker failed"));
    };
    worker.postMessage({ type: "build", fusionData, rates });
  });

  return { promise, cancel: () => worker.terminate() };
}
