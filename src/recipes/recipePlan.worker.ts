import { buildCostTree } from "../items/useItemData";
import type { RecipePlanRequest } from "./recipePlanWorkerService";

interface BuildMessage {
  type: "build";
  request: RecipePlanRequest;
}

type ResultMessage =
  | { type: "result"; tree: ReturnType<typeof buildCostTree> }
  | { type: "error"; message: string };

const post = (message: ResultMessage) => (postMessage as (value: ResultMessage) => void)(message);

self.onmessage = (event: MessageEvent<BuildMessage>) => {
  if (event.data?.type !== "build") return;

  try {
    const { id, quantity, items, prices, ironman } = event.data.request;
    post({ type: "result", tree: buildCostTree(id, quantity, items, prices, ironman) });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "Recipe planner worker failed" });
  }
};
