import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StationaryFusion } from "../../StationaryFusion";
import { DirectShardDial } from "../DirectShardDial";
import { HuntingEstimateContext } from "../../huntingEstimateContext";
import FusionDevViews from "../FusionDevViews";
import { ShardGatherPreferences } from "../../ShardGatherPreferences";
import { equationsFor } from "../../compact/equations";
import type { Data, InventoryCalculationResult, InventoryRecipeTree, Recipe } from "../../../types/types";

const recipe: Recipe = { inputs: ["left", "right"], outputQuantity: 2, isReptile: true };
const data: Data = {
  shards: Object.fromEntries(["left", "right", "target"].map(id => [id, {
    id, name: id, family: "Reptile", type: "Combat", rarity: "common" as const,
    fuse_amount: 5, internal_id: id, rate: 60,
  }])),
  recipes: { target: [recipe] },
};
const batch: InventoryRecipeTree = {
  shard: "target", method: "recipe", quantity: 20, craftsNeeded: 10, recipe,
  inputs: [{ shard: "left", method: "inventory", quantity: 50 }, { shard: "right", method: "direct", quantity: 50 }],
};
const render = (tree: InventoryRecipeTree, multiplier = 1) => renderToStaticMarkup(<StationaryFusion
  targets={[{ id: "target", amount: 20, tree, storage: new Map(), overrides: [] }]}
  data={data} busy={false} crocodileMultiplier={multiplier}
  renderItem={(id, quantity) => <button aria-label={`${id}:${quantity}`} />}
  onReplace={async () => true} renderFallback={() => <span>Full calculation fallback</span>} />);

describe("live-page fusion view adapter", () => {
  const loadingView = (busy: boolean, ready: boolean, error: string | null = null) => {
    const shard = { ...data.shards.target, key: "target", isDirect: true };
    const entry = { shard, cap: 96, fused: 0, loose: 0, status: "incomplete" as const };
    const result: InventoryCalculationResult = { tree: batch, totalTime: 1, timePerShard: 1, totalShardsProduced: 20,
      craftsNeeded: 10, craftTime: 1, totalQuantities: new Map() };
    return renderToStaticMarkup(<FusionDevViews view="circuit" busy={busy} data={ready ? data : null}
      routes={[{ goal: { shardKey: "target" }, entry, remaining: 20, error, result: ready ? result : null }]}
      crocodileMultiplier={1} overrides={{}} ironman={false}
      shardsByKey={new Map(Object.entries(data.shards).map(([key, value]) => [key, { ...value, key, isDirect: true }]))}
      progressByKey={new Map()} onReplace={async () => true} onGatherInstead={() => {}} onSelect={() => {}} />);
  };

  it("shows one Wonder state for pending work, including the debounce interval", () => {
    const markup = loadingView(false, false);
    expect(markup.match(/role="status"/g)).toHaveLength(1);
    expect(markup).toContain("Wonder is calculating…");
    expect(markup).not.toContain("Calculating fusion");
    expect(markup).not.toContain("Choose a shard target");
  });

  it("keeps the previous plan visible but inert while Wonder updates it", () => {
    const markup = loadingView(true, true);
    expect(markup).toContain("Wonder is recalculating…");
    expect(markup).toContain('aria-busy="true" inert=""');
    expect(markup).toContain('aria-label="target, 20"');
    expect(markup).toContain('aria-label="Collapse target fusion steps"');
    expect(loadingView(false, true)).not.toContain("Wonder is recalculating");
    const failed = loadingView(false, false, "Calculation unavailable");
    expect(failed).toContain("Calculation unavailable");
    expect(failed).not.toContain("Wonder is calculating");
  });

  const directDial = (tree: InventoryRecipeTree, ironman = false) => renderToStaticMarkup(<StationaryFusion
    targets={[{ id: "target", amount: 20, tree, storage: new Map(), overrides: [] }]}
    data={data} busy={false} renderItem={() => null} onReplace={async () => true}
    renderDirect={target => <DirectShardDial shard={{ ...data.shards.target, key: "target", isDirect: true }} quantity={target.amount} tree={target.tree} ironman={ironman}
      renderItem={(id, quantity) => <button aria-label={`${id}:${quantity}`} />} />}
    renderFallback={() => <span>Full calculation fallback</span>} />);

  it("uses a stationary purchase without inventing fusion inputs", () => {
    const markup = directDial({ shard: "target", method: "direct", quantity: 20 });
    expect(markup).toContain('class="shards-stationary-direct"');
    expect(markup).not.toContain('class="recipe-dial-stage"');
    expect(markup).toContain('aria-label="target:20"');
    expect(markup.replace(/<[^>]*>/g, "")).toContain("Buy20");
    expect(markup).toContain("Bazaar total");
    expect(markup).not.toContain("shared-equation");
    expect(markup).not.toContain("Full calculation fallback");
  });

  it("preserves mixed direct and stored quantities, and uses gathering language in Ironman", () => {
    const tree: InventoryRecipeTree = [{ shard: "target", method: "direct", quantity: 15 }, { shard: "target", method: "inventory", quantity: 5 }];
    expect(directDial(tree).replace(/<[^>]*>/g, "")).toContain("Buy15");
    expect(directDial(tree).replace(/<[^>]*>/g, "")).toContain("From storage5");
    expect(directDial(tree, true).replace(/<[^>]*>/g, "")).toContain("Gather15");
    expect(directDial(tree, true).replace(/<[^>]*>/g, "")).toContain("From storage5");
    expect(directDial({ shard: "target", method: "inventory", quantity: 20 })).not.toContain("Bazaar total");
  });
  it.each([60, null])("shows acquisition guidance and times only the missing stock at rate %s", rate => {
    const markup = renderToStaticMarkup(<HuntingEstimateContext.Provider value={{ R23: {
      method: "Fishing", rate, ceiling: null, quality: rate === null ? "unavailable" : "estimated", assumptions: [], alternatives: [],
    } }}><DirectShardDial shard={{ ...data.shards.target, key: "R23", name: "Abyssal Lanternfish", isDirect: true }}
      quantity={20} tree={[{ shard: "R23", method: "direct", quantity: 15 }, { shard: "R23", method: "inventory", quantity: 5 }]}
      ironman renderItem={() => null} /></HuntingEstimateContext.Provider>);
    const text = markup.replace(/<[^>]*>/g, "");
    expect(text).toContain("Place Hunting Traps in Dwarven Mines. (Underwater).");
    expect(text).toContain("Caught by Fishing in Dwarven Mines.");
    expect(text).toContain(rate === null ? "Rate unavailableEst. timeUnavailable" : "~60 / hourEst. time~15 min");
    expect(text).not.toContain("~20 min");
  });
  it("shows actual batch quantities and the supplied profile output multiplier", () => {
    const normal = render(batch);
    const enhanced = render(batch, 1.2);
    expect(normal).toContain('aria-label="left:50"');
    expect(normal).toContain('aria-label="right:50"');
    expect(normal).toContain('aria-label="target:20"');
    expect(enhanced).toContain('aria-label="target:24"');
    expect(enhanced).toContain("(20 needed)");
    expect(enhanced).toContain("<dt>Produced</dt><dd>24</dd>");
    expect(enhanced).toContain("<dt>Extra</dt><dd>4</dd>");
    expect(enhanced).toContain('aria-label="Repeat this fusion 10 times"');
  });

  it("collapses the complete body while keeping needed quantity in the header", () => {
    const markup = renderToStaticMarkup(<StationaryFusion
      targets={[{ id: "target", amount: 20, tree: batch, storage: new Map(), overrides: [] }]}
      data={data} busy={false} renderItem={(id, count) => <button aria-label={`${id}:${count}`} />}
      onReplace={async () => true} collapsedGroups={new Set(["target:target"])} onToggleGroup={() => {}} />);
    expect(markup).not.toContain("<fieldset");
    expect(markup).toContain('aria-label="Expand target fusion steps" aria-expanded="false"');
    expect(markup).toContain('class="shards-fusion-content" hidden=""');
    expect(markup).toContain('(20 needed)');
    expect(markup.indexOf('hidden=""')).toBeLessThan(markup.indexOf('<dt>Produced'));
    expect(markup.indexOf('(20 needed)')).toBeLessThan(markup.indexOf('hidden=""'));
    expect(markup).toContain('aria-label="left:50"');
  });

  it("keeps rarity on the identity without repeating written classification", () => {
    const markup = render(batch);
    expect(markup).not.toContain('class="shards-result-classification"');
    expect(markup).toContain('class="sr-only">Combat</span>');
    expect(markup).toContain('class="text-rarity-common"');
    expect(markup).not.toContain('>common</strong>');
  });

  it("combines identical branch recipes without losing batch quantities", () => {
    const markup = render([batch, batch]);
    expect(markup).toContain('aria-label="left:100"');
    expect(markup).toContain('aria-label="right:100"');
    expect(markup).toContain('aria-label="target:40"');
    expect(markup.match(/aria-label="Collapse target fusion steps"/g)).toHaveLength(1);
    expect(markup).not.toContain("recipe-dial-stage");
  });

  it("keeps direct and stored targets visible instead of inventing completed fusions", () => {
    expect(render({ shard: "target", method: "direct", quantity: 20 })).toContain("Full calculation fallback");
    expect(render({ shard: "target", method: "inventory", quantity: 20 })).toContain("Full calculation fallback");
  });

  const loop = (multiplier = 1): InventoryRecipeTree => ({
    shard: "target", method: "cycle", quantity: 20,
    steps: [
      { outputShard: "target", recipe },
      { outputShard: "left", recipe: { inputs: ["target", "right"], outputQuantity: 2, isReptile: true } },
    ], multiplier, craftsNeeded: 10, inputRecipe: batch,
    cycleInputs: [{ shard: "right", method: "direct", quantity: 50 }],
  });

  it("combines identical loop allocations while keeping seed quantities separate", () => {
    const tree = [loop(), loop()];
    const before = JSON.stringify(tree);
    const markup = render(tree);
    // One seed recipe and one loop recipe for target; one loop recipe for left.
    expect(markup.match(/class="shards-equation-batch"/g)).toHaveLength(3);
    expect(markup).toContain('aria-label="left:100"');
    expect(markup).toContain('aria-label="left:50"');
    expect(markup).toContain('aria-label="target:60"');
    expect(markup).toContain('aria-label="left:20"');
    expect(markup).toContain("<dt>Seed output</dt><dd>40</dd>");
    expect(markup).toContain("<dt>Reused</dt><dd>20</dd>");
    expect(markup).not.toContain("<dt>Extra</dt>");
    expect(markup).toContain('aria-label="Repeat this fusion 20 times"');
    expect(markup).toContain('aria-label="Repeat this fusion 10 times"');
    expect(markup.match(/Output reused<\/small>/g)).toHaveLength(2);
    expect(JSON.stringify(tree)).toBe(before);
  });

  it("does not combine loop recipes with different effective output quantities", () => {
    const markup = render([loop(), loop(1.2)]);
    expect(markup.match(/class="shards-equation-batch"/g)).toHaveLength(5);
    expect(markup).toContain('aria-label="target:62"');
    expect(markup).toContain('aria-label="left:22"');
  });

  it("shows whole-shard output and surplus for a rounded fusion batch", () => {
    const markup = render({ ...batch, craftsNeeded: 3, quantity: 7 }, 1.2);
    expect(markup).toContain("(7 needed)");
    expect(markup).toContain("<dt>Produced</dt><dd>8</dd>");
    expect(markup).toContain("<dt>Extra</dt><dd>1</dd>");
  });

  it("puts checked reserves first without changing selection or source ordering", () => {
    const keys = ["left", "right", "target"];
    const selected = ["target"];
    const markup = renderToStaticMarkup(<ShardGatherPreferences goalName="test" keys={keys} selected={selected}
      inventory={new Map()} shardsByKey={new Map()} onChange={() => {}} />);
    expect(markup.indexOf('aria-label="Reserve target for test"')).toBeLessThan(markup.indexOf('aria-label="Reserve left for test"'));
    expect(markup.indexOf('aria-label="Reserve left for test"')).toBeLessThan(markup.indexOf('aria-label="Reserve right for test"'));
    expect(markup.match(/checked=""/g)).toHaveLength(1);
    expect(markup).toContain("Storage unknown");
    expect(keys).toEqual(["left", "right", "target"]);
    expect(selected).toEqual(["target"]);
  });

  it("keeps an incomplete legacy cycle in the fallback rather than silently dropping it", () => {
    const cycle: InventoryRecipeTree = { shard: "target", method: "cycle", quantity: 20, steps: [], multiplier: 1.2,
      craftsNeeded: 10, inputRecipe: batch, cycleInputs: [] };
    expect(render(cycle)).toContain("Full calculation fallback");
  });

  it("keeps valid cycles stationary, preserving seed recipes and every loop step", () => {
    const cycle: InventoryRecipeTree = { shard: "target", method: "cycle", quantity: 20,
      steps: [
        { outputShard: "target", recipe },
        { outputShard: "left", recipe: { inputs: ["target", "right"], outputQuantity: 2, isReptile: true } },
      ], multiplier: 1.2, craftsNeeded: 10, inputRecipe: batch,
      cycleInputs: [{ shard: "right", method: "direct", quantity: 50 }] };
    const before = JSON.stringify(cycle);
    const { rows, roots, incompleteCycle } = equationsFor(cycle, data, 1, true);
    expect(incompleteCycle).toBe(false);
    expect(rows).toHaveLength(3);
    expect(rows[0].cycle).toBeUndefined();
    expect(rows.filter(row => row.cycle).map(row => ({ output: row.output, repeats: row.repeats, yield: row.yield }))).toEqual([
      { output: "target", repeats: 5, yield: 2.4 }, { output: "left", repeats: 5, yield: 2.4 },
    ]);
    expect(new Set(rows.map(row => row.id)).size).toBe(3);
    expect(roots).toEqual([rows[1].id]);
    const markup = render(cycle);
    expect(markup).toContain('class="shards-stationary"');
    expect(markup).not.toContain("Full calculation fallback");
    expect(JSON.stringify(cycle)).toBe(before);
    expect(equationsFor(cycle, data).hasCycle).toBe(true);
    expect(equationsFor(cycle, data).rows).toHaveLength(0);
  });
});
