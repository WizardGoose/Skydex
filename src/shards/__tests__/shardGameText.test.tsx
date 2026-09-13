import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShardGameText } from "../ShardGameTextView";
import {
  shardAcquisitionGameText,
  shardDescriptionGameText,
  shardTypeGameText,
} from "../shardGameTextModel";

describe("exported shard game text", () => {
  it("restores every Harpy description colour through the shared Minecraft parser", () => {
    const text = shardDescriptionGameText("C24", "Increases the odds of finding monsters from Tree Gifts by +5%");
    expect(text).not.toBeNull();
    const markup = renderToStaticMarkup(<ShardGameText text={text ?? ""} />);

    expect(markup).toContain("Increases the odds of finding");
    expect(markup).toContain("Tree Gifts");
    expect(markup).toContain("+5%");
    expect(markup).toContain("text-slate-300");
    expect(markup).toContain("text-stat-dark-green");
    expect(markup).toContain("text-stat-green");
  });

  it("keeps game colours on the chosen acquisition sentence", () => {
    const text = shardAcquisitionGameText("C24", "Fusing Bird Family with Combat Category.");
    expect(text).not.toBeNull();
    const markup = renderToStaticMarkup(<ShardGameText text={text ?? ""} />);

    expect(markup).not.toContain("- Fusing");
    expect(markup).toContain("Bird");
    expect(markup).toContain("Combat");
    expect(markup).toContain("text-stat-green");
    expect(markup).toContain("text-stat-red");
  });

  it("uses the game palette for the shard attribute group", () => {
    const markup = renderToStaticMarkup(<ShardGameText text={shardTypeGameText("Hunting")} />);
    expect(markup).toContain("text-stat-light-purple");
    expect(markup).toContain("Hunting");
  });

  it("retains stat symbols and family names without unsupported pack-only boxes", () => {
    const markup = renderToStaticMarkup(<ShardGameText text={"§c\uE010 Health against §9\uE072 Aquatic mobs"} />);
    expect(markup).toContain("❤ Health");
    expect(markup).toContain("Aquatic mobs");
    expect(markup).toContain("text-stat-blue");
    expect(markup).not.toMatch(/[\uE000-\uF8FF]/);
  });

  it("does not replace an acquisition summary with an unrelated first lore line", () => {
    expect(shardAcquisitionGameText("C24", "Fusion · Pocket Black Hole · Salts")).toBeNull();
  });
});
