import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InventoryRecipeTree, ShardWithDirectInfo } from "../../types/types";
import { ShardRouteTree } from "../ShardRouteTree";

const directTree: InventoryRecipeTree = {
  shard: "C1",
  method: "direct",
  quantity: 12,
};

const shardsByKey = new Map<string, ShardWithDirectInfo>();

describe("ShardRouteTree profile-aware acquisition copy", () => {
  it("combines storage and gathering in one ingredient entry beneath one target", () => {
    const tree: InventoryRecipeTree = { shard: "target", method: "recipe", quantity: 2, craftsNeeded: 1,
      recipe: { inputs: ["C1", "U18"], outputQuantity: 2, isReptile: false },
      inputs: [[{ shard: "C1", method: "inventory", quantity: 3 }, { shard: "C1", method: "direct", quantity: 7 }],
        { shard: "U18", method: "direct", quantity: 5 }] };
    const markup = renderToStaticMarkup(<ShardRouteTree onInspect={() => {}} tree={tree} shardsByKey={shardsByKey} ironman />);
    expect(markup.match(/Show target in fusion plan/g)).toHaveLength(1);
    expect(markup.match(/Show C1 in fusion plan/g)).toHaveLength(1);
    expect(markup).toContain('Storage <b>3</b>');
    expect(markup).toContain('Gather <b>7</b>');
  });

  it("keeps Pangolin location guidance with the whole rarity-owned shard entry", () => {
    const catalogue = new Map([["R88", { key: "R88", name: "Pangolin", rarity: "rare" } as ShardWithDirectInfo]]);
    const markup = renderToStaticMarkup(<ShardRouteTree onInspect={() => {}} tree={{ shard: "R88", method: "direct", quantity: 5 }} shardsByKey={catalogue} ironman />);
    expect(markup).toContain('shards-breakdown-card border-rarity-rare/40 bg-rarity-rare/10');
    expect(markup).toContain('Pangolin Hideaways');
    expect(markup).toContain('aria-label="Lasso"');
    expect(markup).not.toContain('Gather <b>');
  });
  it("never offers buying on Ironman", () => {
    const markup = renderToStaticMarkup(
      <ShardRouteTree onInspect={() => {}} tree={directTree} shardsByKey={shardsByKey} ironman />,
    );

    expect(markup).toContain("Gather");
    expect(markup.toLowerCase()).not.toContain("buy");
    expect(markup).toContain('src="/shardIcons/C1.png"');
    expect(markup).toContain('aria-label="Show C1 in fusion plan"');
  });

  it("keeps the Bazaar option for normal profiles", () => {
    const markup = renderToStaticMarkup(
      <ShardRouteTree onInspect={() => {}} tree={directTree} shardsByKey={shardsByKey} ironman={false} />,
    );

    expect(markup).toContain("Bazaar");
  });

  it("distinguishes stored inputs from their available gathering methods", () => {
    const stored = renderToStaticMarkup(<ShardRouteTree onInspect={() => {}} tree={{ shard: "U18", method: "inventory", quantity: 185 }} shardsByKey={shardsByKey} ironman />);
    const gathered = renderToStaticMarkup(<ShardRouteTree onInspect={() => {}} tree={{ shard: "U18", method: "direct", quantity: 185 }} shardsByKey={shardsByKey} ironman />);
    expect(stored).toContain("Storage");
    expect(gathered).toContain("Black Hole / Charm");
  });
});
