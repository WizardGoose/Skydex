import type { ShardWithKey } from "../types/types";
import {
  processOutputRecipes,
  type FusionData,
  type Recipe,
} from "../utilities/recipeUtils";
import {
  enumValue,
  inputObject,
  limited,
  normalizeLookup,
  optionalInteger,
  requiredString,
  WebMcpToolError,
} from "./shared";

const DIRECTIONS = ["both", "made_from", "used_in"] as const;

let fusionDataPromise: Promise<FusionData> | null = null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const loadFusionData = (): Promise<FusionData> => {
  if (fusionDataPromise) return fusionDataPromise;
  fusionDataPromise = fetch(`${import.meta.env.BASE_URL}fusion-data.json`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Fusion data responded ${response.status}.`);
      const value: unknown = await response.json();
      if (!isRecord(value) || !isRecord(value.shards) || !isRecord(value.recipes)) {
        throw new Error("Fusion data has an unexpected shape.");
      }
      return value as unknown as FusionData;
    })
    .catch((error) => {
      fusionDataPromise = null;
      throw error;
    });
  return fusionDataPromise;
};

export const resolveShardKey = (data: FusionData, query: string): string => {
  const folded = normalizeLookup(query);
  const entries = Object.entries(data.shards);
  const exact = entries.filter(([key, shard]) =>
    key.toLowerCase() === query.trim().toLowerCase()
    || shard.internal_id.toLowerCase() === query.trim().toLowerCase()
    || normalizeLookup(shard.name) === folded
  );
  if (exact.length === 1) return exact[0][0];
  const suggestions = entries
    .filter(([key, shard]) => normalizeLookup(key).includes(folded) || normalizeLookup(shard.name).includes(folded))
    .slice(0, 6)
    .map(([key, shard]) => `${shard.name} (${key})`)
    .join(", ");
  throw new WebMcpToolError(
    exact.length > 1 ? "ambiguous_shard" : "shard_not_found",
    suggestions
      ? `No unique shard matched ${query}. Candidates: ${suggestions}.`
      : `Skydex could not find a shard matching ${query}.`,
  );
};

const shardView = (data: FusionData, key: string) => {
  const shard = data.shards[key];
  return shard ? {
    key,
    name: shard.name,
    internal_id: shard.internal_id,
    family: shard.family,
    type: shard.type,
    rarity: shard.rarity,
    fuse_amount: shard.fuse_amount,
  } : { key, name: key };
};

const selectedShard = (data: FusionData, key: string): ShardWithKey => {
  const shard = data.shards[key];
  return {
    key,
    id: key,
    name: shard.name,
    family: shard.family,
    type: shard.type,
    rarity: shard.rarity as ShardWithKey["rarity"],
    fuse_amount: shard.fuse_amount,
    internal_id: shard.internal_id,
    rate: 0,
  };
};

/** Fusion inputs are commutative; keep one row when the dataset lists both orders. */
export const dedupeFusionRecipes = (recipes: readonly Recipe[]): Recipe[] => {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const inputs = [recipe.input1, recipe.input2].sort().join("\u0000");
    const identity = `${inputs}\u0000${recipe.output}\u0000${recipe.quantity}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

const madeFrom = (data: FusionData, key: string): Recipe[] =>
  dedupeFusionRecipes(processOutputRecipes(selectedShard(data, key), data));

const usedIn = (data: FusionData, key: string): Recipe[] => {
  const rows: Recipe[] = [];
  for (const [output, quantities] of Object.entries(data.recipes)) {
    for (const [quantityText, recipes] of Object.entries(quantities)) {
      const quantity = Number.parseInt(quantityText, 10);
      if (!Number.isFinite(quantity)) continue;
      for (const recipe of recipes) {
        if (recipe.length !== 2 || (recipe[0] !== key && recipe[1] !== key)) continue;
        rows.push({ input1: recipe[0], input2: recipe[1], quantity, output });
      }
    }
  }
  return dedupeFusionRecipes(rows);
};

const recipeView = (data: FusionData, recipe: Recipe) => ({
  inputs: [shardView(data, recipe.input1), shardView(data, recipe.input2)],
  output: shardView(data, recipe.output),
  output_quantity: recipe.quantity,
  kind: recipe.input1 === "L4" || recipe.input2 === "L4"
    ? "chameleon"
    : recipe.quantity === 2 ? "special" : "identity",
});

export const shardFusions = async (input: unknown): Promise<unknown> => {
  const object = inputObject(input);
  const query = requiredString(object, "shard", 96);
  const direction = enumValue(object, "direction", DIRECTIONS, "both");
  const limit = optionalInteger(object, "limit", 10, 1, 25);
  const data = await loadFusionData();
  const key = resolveShardKey(data, query);
  const inputs = direction === "used_in" ? [] : madeFrom(data, key).map((recipe) => recipeView(data, recipe));
  const outputs = direction === "made_from" ? [] : usedIn(data, key).map((recipe) => recipeView(data, recipe));

  return {
    ok: true,
    scope: "public_data",
    shard: shardView(data, key),
    made_from: limited(inputs, limit),
    used_in: limited(outputs, limit),
    coverage: {
      source: "Skydex fusion dataset",
      directions_returned: direction,
      complete_before_limit: inputs.length <= limit && outputs.length <= limit,
    },
  };
};
