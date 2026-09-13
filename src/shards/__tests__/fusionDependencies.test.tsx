import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Data, InventoryRecipeTree, Recipe } from "../../types/types";
import { dependencyInputs, fusionDependencies } from "../fusionDependencies";
import { FusionDependencyTree } from "../FusionDependencyTree";
import { ShardSourceCount } from "../ShardSourceCount";

const recipe: Recipe = { inputs: ["left", "right"], outputQuantity: 2, isReptile: true };
const batch: InventoryRecipeTree = { shard: "target", method: "recipe", quantity: 20, craftsNeeded: 10, recipe,
  inputs: [[{ shard: "left", method: "inventory", quantity: 30 }, { shard: "left", method: "direct", quantity: 20 }],
    { shard: "right", method: "direct", quantity: 50 }] };
const data: Data = { recipes: { target: [recipe] }, shards: Object.fromEntries(["left", "right", "target"].map(id => [id, {
  id, name: id, family: "Reptile", type: "Combat", rarity: "common" as const, fuse_amount: 5, internal_id: id, rate: 60,
}])) };
const render = (tree: InventoryRecipeTree, ironman = true, collapsed = false, amount = 20) => renderToStaticMarkup(<FusionDependencyTree
  targets={[{ id: "target", amount, tree, storage: new Map([["left", 999]]), overrides: [] }]}
  data={data} ironman={ironman} busy={false} crocodileMultiplier={1.2} onReplace={async () => true}
  renderItem={(id, quantity) => <button aria-label={`${id}:${Math.ceil(quantity ?? 0)}`} />}
  collapsedGroups={new Set(collapsed ? ["target:target"] : [])} onToggleGroup={() => {}} />);

describe("fusion dependency hierarchy", () => {
  it("finds nested supplies without turning cycle throughput into another branch", () => {
    const cycle: InventoryRecipeTree = { shard: "target", method: "cycle", quantity: 20, craftsNeeded: 10, multiplier: 1.2,
      inputRecipe: batch, cycleInputs: [{ shard: "seed", method: "inventory", quantity: 2 }],
      steps: [{ outputShard: "circulated", recipe }] };
    const [root] = fusionDependencies(cycle);
    expect(fusionDependencies(dependencyInputs(root)).map(node => node.shard)).toEqual(["target", "seed"]);
  });
  it("merges repeated recipes at a level without duplicating or reallocating stock", () => {
    const [root] = fusionDependencies([batch, batch]);
    expect(root.recipes).toHaveLength(1);
    expect(root.recipes[0].crafts).toBe(20);
    const [left] = fusionDependencies(root.recipes[0].inputs[0]);
    expect(left).toMatchObject({ shard: "left", quantity: 100, stored: 60, direct: 40 });
    expect(root.quantity).toBe(40);
  });
  it("keeps distinct batches and each branch's own allocation", () => {
    const different = { ...batch, recipe: { ...recipe, inputs: ["right", "left"] as [string, string] } };
    // A different yield is genuinely a different recipe, even if the ingredients match.
    const [root] = fusionDependencies([batch, { ...different, recipe: { ...different.recipe, outputQuantity: 3 } }]);
    expect(root.recipes).toHaveLength(2);
    expect(fusionDependencies(root.recipes[0].inputs[0])[0].stored).toBe(30);
    expect(fusionDependencies(root.recipes[1].inputs[0])[0].stored).toBe(30);
  });
  it("aligns ingredient allocations when an equivalent recipe reverses its slots", () => {
    const reversed: InventoryRecipeTree = { ...batch, recipe: { ...recipe, inputs: ["right", "left"] }, inputs: [batch.inputs[1], batch.inputs[0]] };
    const [root] = fusionDependencies([batch, reversed]);
    expect(root.recipes).toHaveLength(1);
    expect(fusionDependencies(root.recipes[0].inputs[0])).toMatchObject([{ shard: "left", quantity: 100, stored: 60, direct: 40 }]);
    expect(fusionDependencies(root.recipes[0].inputs[1])).toMatchObject([{ shard: "right", quantity: 100, stored: 0, direct: 100 }]);
  });
  it("shows allocated stock and marks planned bonus output as RNG", () => {
    const markup = render(batch);
    expect(markup).toContain('aria-label="30 from storage"');
    expect(markup).toContain('aria-label="20 to gather"');
    expect(markup).not.toContain('999');
    expect(markup).toContain('aria-label="target:24"');
    expect(markup).toContain('>RNG<');
    expect(markup).not.toMatch(/Produced|Extra|shards-dependency-produced/);
    expect(markup).toContain('aria-label="Replace left for target"');
    expect(markup).toContain('aria-label="Collapse left and right fusion group for target"');
    expect(markup).toContain('class="shards-dependency-group-body"');
    expect(markup).toContain('aria-label="Repeat this fusion 10 times"');
    expect(markup).not.toContain('class="shards-dependency-produced"');
    expect(render(batch, false)).toContain('aria-label="20 to buy · Bazaar"');
  });
  it("defers deeper branches and collapses the whole target, with needed always visible", () => {
    const nested: InventoryRecipeTree = { ...batch, inputs: [{ ...batch, shard: "left" }, batch.inputs[1]] };
    const markup = render(nested);
    expect(markup).toMatch(/aria-expanded="false"[^>]*aria-label="Expand left ingredients"/);
    expect(markup.match(/class="shards-dependency-batch /g)).toHaveLength(1);
    const closed = render(batch, true, true);
    expect(closed.indexOf('(20 needed)')).toBeLessThan(closed.indexOf('hidden=""'));
    expect(closed).toContain('class="shards-fusion-content" hidden=""');
  });
  it("distinguishes the physical yield and chance for each recipe", () => {
    const markup = render([batch, { ...batch, recipe: { ...recipe, outputQuantity: 3 } }]);
    expect(markup).toContain('aria-description="2 target shards per fusion; 20% chance of doubling. 20 base output across 10 fusions."');
    expect(markup).toContain('aria-description="3 target shards per fusion; 20% chance of doubling. 30 base output across 10 fusions."');
    expect(markup).toContain('aria-label="target:60"');
    expect(markup).not.toMatch(/Produced|Extra|shards-dependency-produced/);
    expect(markup.match(/aria-label="Repeat this fusion 10 times"/g)).toHaveLength(2);
  });
  it("explains a mixed recipe plan whose base output falls short of its expected yield", () => {
    const plan = [10, 18, 2].map((crafts, index): InventoryRecipeTree => ({
      ...batch, craftsNeeded: crafts, quantity: crafts * (index === 0 ? 1.2 : 1),
      recipe: { ...recipe, outputQuantity: 1, isReptile: index === 0,
        inputs: index === 2 ? ["left", "left"] : recipe.inputs },
    }));
    const markup = render(plan, true, false, 32);
    expect(markup).toContain('(32 needed)');
    expect(markup).toContain('aria-label="target:32"');
    expect(markup).toContain('>RNG<');
    expect(markup).not.toContain('aria-label="target:30"');
    expect(render({ ...batch, recipe: { ...recipe, isReptile: false } })).not.toContain('>RNG<');
  });
  it("retains cycle nodes without treating circulated output as acquisition", () => {
    const cycle: InventoryRecipeTree = { shard: "target", method: "cycle", quantity: 20,
      craftsNeeded: 10, multiplier: 1.2, inputRecipe: batch, cycleInputs: [], steps: [
        { outputShard: "target", recipe },
        { outputShard: "left", recipe: { ...recipe, inputs: ["target", "right"] } },
      ] };
    const [root] = fusionDependencies([cycle, cycle]);
    expect(root).toMatchObject({ quantity: 40, stored: 0, direct: 0, recipes: [] });
    expect(root.cycles).toHaveLength(2);
    const markup = render([cycle, cycle]);
    expect(markup).toContain('Cycle supplies');
    expect(markup).toContain('Cycle steps');
    expect(markup.match(/aria-label="Collapse target fusion steps"/g)).toHaveLength(1);
    expect(markup).toContain('aria-label="40 from fusion; show target ingredients"');
  });
  it.each([["Lasso", "Abysmal Lasso"], ["Fishing Net", "Basic Fishing Net"], ["Black Hole", "Small Pocket Black Hole"], ["Kuudra", "Kuudra Key"], ["End Stone Protector", "End Stone Protector"]])("uses the actual %s tool artwork with an accessible quantity", (method, artwork) => {
    const markup = renderToStaticMarkup(<ShardSourceCount quantity={27} source="acquire" methods={[method]} />);
    expect(markup).toContain(`aria-label="27 to gather · ${method}"`);
    expect(markup).toContain(`${artwork.replaceAll(" ", "_")}.png`);
    expect(markup).toContain('<b>27</b>');
  });
});
