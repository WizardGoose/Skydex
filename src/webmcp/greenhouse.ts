import { datasetReady, getDataset } from "../greenhouse/data/datasetStore";
import { solvedEconomies } from "../greenhouse/planner/economyCache";
import {
  DEFAULT_SIZING_MODE,
  SIZING_ROUNDS,
  sameSizing,
  sizingFor,
} from "../greenhouse/planner/plotSizing";
import {
  buildSolverPlan,
  collectMutations,
  type PlotEconomy,
} from "../greenhouse/planner/solverPlan";
import { solveEconomy } from "../greenhouse/planner/useSolverEconomies";
import type { CropDefinition, MutationDefinition } from "../greenhouse/types/greenhouse";
import { wikiArticleUrl } from "../ui/wikiUrl";
import { connectedOwnedSnapshot, holdingsCoverage } from "./inventory";
import {
  freshness,
  inputObject,
  limited,
  normalizeLookup,
  optionalBoolean,
  optionalInteger,
  requiredString,
  WebMcpToolError,
} from "./shared";

interface PlannerDataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

export const resolveMutation = (
  mutations: readonly MutationDefinition[],
  query: string,
  crops: readonly CropDefinition[] = [],
): MutationDefinition => {
  const folded = normalizeLookup(query);
  const exact = mutations.filter((mutation) =>
    mutation.id.toLowerCase() === query.trim().toLowerCase()
    || normalizeLookup(mutation.name) === folded
  );
  if (exact.length === 1) return exact[0];
  const suggestions = mutations
    .filter((mutation) => normalizeLookup(mutation.name).includes(folded) || normalizeLookup(mutation.id).includes(folded))
    .slice(0, 6)
    .map((mutation) => `${mutation.name} (${mutation.id})`)
    .join(", ");
  const examples = [...mutations]
    .sort((left, right) => left.name.localeCompare(right.name))
    .slice(0, 6)
    .map((mutation) => `${mutation.name} (${mutation.id})`)
    .join(", ");
  const crop = crops.find((candidate) =>
    candidate.id.toLowerCase() === query.trim().toLowerCase()
    || normalizeLookup(candidate.name) === folded
  );
  throw new WebMcpToolError(
    exact.length > 1 ? "ambiguous_mutation" : "mutation_not_found",
    suggestions
      ? `No unique mutation matched ${query}. Candidates: ${suggestions}.`
      : crop
        ? `${crop.name} is a base crop, not a mutation target.${examples ? ` Valid mutation examples: ${examples}.` : ""}`
        : `Skydex could not find a mutation matching ${query}.${examples ? ` Valid mutation examples: ${examples}.` : ""}`,
  );
};

const cachedEconomy = async (id: string, spots?: number): Promise<PlotEconomy | null> => {
  const key = spots === undefined ? id : `${id}#${spots}`;
  const cached = solvedEconomies.get(key);
  if (cached !== undefined) return cached;
  const result = await solveEconomy(id, spots);
  solvedEconomies.set(key, result);
  return solvedEconomies.get(key) ?? result;
};

/** Run CPU-heavy solves in a short queue rather than starting a worker storm. */
const solveEconomies = async (
  requests: readonly { id: string; spots?: number }[],
  concurrency = 3,
): Promise<Record<string, PlotEconomy | null>> => {
  const output: Record<string, PlotEconomy | null> = {};
  let cursor = 0;
  const worker = async () => {
    while (cursor < requests.length) {
      const request = requests[cursor++];
      output[request.id] = await cachedEconomy(request.id, request.spots);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, requests.length) }, worker));
  return output;
};

export const greenhousePlan = async (input: unknown): Promise<unknown> => {
  const object = inputObject(input);
  const query = requiredString(object, "mutation", 96);
  const quantity = optionalInteger(object, "quantity", 1, 1, 100_000);
  const useConnectedHoldings = optionalBoolean(object, "use_connected_holdings", true);
  const limit = optionalInteger(object, "limit", 12, 1, 25);

  await datasetReady();
  const view = getDataset();
  const target = resolveMutation(view.mutations, query, view.crops);
  const data: PlannerDataset = {
    crops: Object.fromEntries(view.crops.map((crop) => [crop.id, crop])),
    mutations: Object.fromEntries(view.mutations.map((mutation) => [mutation.id, mutation])),
  };
  const targets = [{ id: target.id, qty: quantity }];
  const involved = collectMutations(targets, data);
  const connected = useConnectedHoldings
    ? await connectedOwnedSnapshot(view.bridge)
    : null;
  const have: Record<string, number> = {};
  if (connected) {
    for (const id of new Set([...involved, ...Object.keys(data.crops)])) {
      const count = connected.owned.count(id);
      if (count !== undefined) have[id] = count;
    }
  }

  const fullEconomies = await solveEconomies(involved.map((id) => ({ id })));
  const fullYields: Record<string, number> = {};
  for (const [id, economy] of Object.entries(fullEconomies)) {
    if (economy) fullYields[id] = economy.yield;
  }
  const economies: Record<string, PlotEconomy | null> = { ...fullEconomies };
  let sizing: Record<string, number> = {};

  for (let round = 0; round < SIZING_ROUNDS; round++) {
    const provisional = buildSolverPlan(targets, data, economies, have);
    const next = sizingFor(
      provisional,
      data.mutations,
      fullYields,
      {},
      DEFAULT_SIZING_MODE,
    );
    if (sameSizing(next, sizing)) break;
    sizing = next;
    const sized = await solveEconomies(Object.entries(sizing).map(([id, spots]) => ({ id, spots })));
    for (const [id, result] of Object.entries(sized)) {
      economies[id] = result ?? fullEconomies[id] ?? null;
    }
  }

  const plan = buildSolverPlan(targets, data, economies, have);
  const reportedOwned = (id: string): number | null => connected?.owned.count(id) ?? null;
  const steps = plan.cycles.flatMap((cycle) => cycle.produce.map((node) => {
    const owned = reportedOwned(node.id);
    return {
      cycle: cycle.index + 1,
      id: node.id,
      name: node.name,
      required: node.rawNeed ?? node.need,
      owned,
      still_needed: owned === null ? null : node.need,
      plot_yield: node.perPlot ?? null,
      plantings: node.plots ?? null,
      covered_by_holdings: owned === null ? null : node.covered ?? false,
      ground: node.ground ?? null,
    };
  }));
  const unsolved = steps.filter((step) =>
    step.plantings === null && step.still_needed !== null && step.still_needed > 0
  );

  return {
    ok: true,
    scope: connected ? "connected_browser" : "public_data",
    target: {
      id: target.id,
      name: target.name,
      quantity,
      rarity: target.rarity,
      size: target.size,
      ground: target.grounds ?? [target.ground],
      growth_stages: target.growth_stages,
      decay_days: target.decay ?? null,
      direct_requirements: target.requirements,
      special: target.special ?? null,
    },
    plan: {
      total_plantings: plan.totalPlantings,
      dependency_depth: plan.depth,
      steps: limited(steps, limit),
      base_crops: limited(plan.baseCrops.map((crop) => {
        const owned = reportedOwned(crop.id);
        return {
          id: crop.id,
          name: crop.name,
          required: crop.rawNeed ?? crop.need,
          owned,
          still_needed: owned === null ? null : crop.need,
          ground: crop.ground ?? null,
        };
      }), limit),
      mutations_to_place: limited(plan.placed.map((mutation) => {
        const owned = reportedOwned(mutation.id);
        return {
          id: mutation.id,
          name: mutation.name,
          count: mutation.count,
          owned,
          covered_by_holdings: owned === null ? null : mutation.covered,
        };
      }), limit),
      manual_steps: limited(plan.manual.map((node) => ({
        id: node.id,
        name: node.name,
        quantity: node.need,
        reason: node.special?.label ?? "This mutation needs a manual game action.",
      })), limit),
      unresolved: limited(
        [...new Set([...plan.unknown, ...plan.pending, ...unsolved.map((step) => step.id)])],
        limit,
      ),
    },
    solver: {
      sizing: DEFAULT_SIZING_MODE,
      quality: "best_found_not_proven_optimal",
      right_sized_mutations: limited(Object.keys(sizing), limit),
    },
    freshness: {
      mutation_data: freshness(view.wiki.fetchedAt),
      source: view.wiki.fetchedAt === null ? "bundled_fallback" : "live_wiki",
    },
    source: {
      name: "Hypixel SkyBlock Wiki",
      url: wikiArticleUrl(target.name),
      license: "CC BY-NC-SA 3.0",
      license_url: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
    },
    coverage: {
      holdings: holdingsCoverage(
        connected?.owned ?? null,
        [
          ...steps.map((step) => step.id),
          ...plan.baseCrops.map((crop) => crop.id),
          ...plan.placed.map((mutation) => mutation.id),
        ],
      ),
      mutation_data: view.error ? "partial" : "available",
      wiki_refresh_error: view.wiki.error,
    },
    ...(connected ? { connection: connected.context } : {}),
  };
};
