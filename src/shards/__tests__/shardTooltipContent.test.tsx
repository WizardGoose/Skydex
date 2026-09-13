import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ShardWithDirectInfo } from "../../types/types";
import { ItemTooltipContent } from "../../ui/ItemTooltip";
import { buildShardProgress } from "../progressionModel";
import { shardTooltipContent } from "../shardTooltipContent";

const obsidian: ShardWithDirectInfo = {
  key: "U18", id: "U18", name: "Obsidian Defender", rarity: "uncommon",
  family: "Unknown Family", type: "Global", internal_id: "SHARD_OBSIDIAN_DEFENDER",
  fuse_amount: 5, rate: 732, isDirect: true, canFuse: true,
};

describe("shard tooltip content", () => {
  it("renders every acquisition method alongside actual holdings when pinned", () => {
    const [entry] = buildShardProgress([obsidian], new Map([["U18", 185]]), new Map([["U18", 13]]), { loose: false, attributes: false });
    const html = renderToStaticMarkup(<ItemTooltipContent {...shardTooltipContent(obsidian, entry)} count={5} surfacePinned />);
    expect(html).toContain("Speed");
    expect(html).toContain("✦ Speed");
    expect(html).toContain("13 / 64 fused · 185 in storage");
    expect(html).toContain("Pocket Black Hole");
    expect(html.replace(/<[^>]*>/g, "")).toContain("Charm Obsidian Defender");
    expect(html).toContain("text-stat-red");
    expect(html).not.toContain("· 5 in storage");
  });

  it("does not infer zero holdings from a route ingredient or missing profile", () => {
    const html = renderToStaticMarkup(<ItemTooltipContent {...shardTooltipContent(obsidian)} count={185} />);
    expect(html).toContain("Fused progress unknown · Storage unknown");
    expect(html).not.toContain("185 in storage");
    expect(html).not.toContain("0 / 64 fused");
  });

  it("keeps a captured zero distinct from missing progress", () => {
    const [entry] = buildShardProgress([obsidian], new Map(), new Map(), { loose: true, attributes: true });
    const html = renderToStaticMarkup(<ItemTooltipContent {...shardTooltipContent(obsidian, entry)} />);
    expect(html).toContain("0 / 64 fused · 0 in storage");
    expect(html).not.toContain("unknown");
  });

  it("retains full Tank Zombie hunting details from the second reference", () => {
    const shard = { ...obsidian, key: "C18", name: "Tank Zombie", rarity: "common" as const, type: "Combat", internal_id: "SHARD_TANK_ZOMBIE" };
    const html = renderToStaticMarkup(<ItemTooltipContent {...shardTooltipContent(shard)} surfacePinned />);
    expect(html).toContain("Undead Resistance");
    expect(html).toContain("Defense");
    expect(html).toContain("Master Super Tank Zombie");
    expect(html).toContain("Charm");
    expect(html).toContain("Combat");
  });
});
