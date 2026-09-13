import { DEFAULT_CALCULATION_PARAMS } from "../constants";
import { CalculationService } from "../services/calculationService";
import type { FusionGraphBuildResult } from "../services/fusionGraphWorkerService";
import {
  buildFusionGraph,
  buildGraphElements,
  fusionDataToData,
} from "../utilities/fusionGraphLayout";
import type { FusionData } from "../utilities/recipeUtils";

interface BuildMessage {
  type: "build";
  fusionData: FusionData;
  rates: Record<string, number>;
}

type ResultMessage =
  | { type: "result"; result: FusionGraphBuildResult }
  | { type: "error"; message: string };

const post = (message: ResultMessage) => (postMessage as (value: ResultMessage) => void)(message);

self.onmessage = (event: MessageEvent<BuildMessage>) => {
  if (event.data?.type !== "build") return;

  try {
    const { fusionData, rates } = event.data;
    const data = fusionDataToData(fusionData, rates);
    const hasRates = Object.keys(rates).length > 0;
    const { minCosts } = CalculationService.getInstance().computeMinCosts(data, DEFAULT_CALCULATION_PARAMS);
    const graph = buildFusionGraph(
      data,
      hasRates
        ? { isDirectlyObtainable: (id) => (rates[id] ?? 0) > 0, minCost: (id) => minCosts.get(id) ?? Infinity }
        : {}
    );
    const { nodes, edges } = buildGraphElements(data, graph);
    post({ type: "result", result: { graph, nodes, edges } });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : "Fusion graph worker failed" });
  }
};
