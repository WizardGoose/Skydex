import type { BazaarPrice, CostNode, ItemIndex } from "../items/useItemData";

export interface RecipePlanRequest {
  id: string;
  quantity: number;
  items: ItemIndex;
  prices: Record<string, BazaarPrice>;
  ironman: boolean;
}

type RecipePlanWorkerMessage =
  | { type: "result"; tree: CostNode }
  | { type: "error"; message: string };

export interface RecipePlanTask {
  promise: Promise<CostNode>;
  cancel: () => void;
}

/** Build the recursive cost tree away from the interaction thread. */
export function buildRecipePlanInWorker(request: RecipePlanRequest): RecipePlanTask | null {
  if (typeof Worker === "undefined") return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL("./recipePlan.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }

  const promise = new Promise<CostNode>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<RecipePlanWorkerMessage>) => {
      worker.terminate();
      if (event.data.type === "result") resolve(event.data.tree);
      else reject(new Error(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(event.error ?? new Error(event.message || "Recipe planner worker failed"));
    };
    worker.postMessage({ type: "build", request });
  });

  return { promise, cancel: () => worker.terminate() };
}
