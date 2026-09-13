import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShardAcquisitionGuide } from "../ShardAcquisitionGuide";

const text = (html: string) => html.replace(/<[^>]*>/g, "");

describe("explicit shard source details", () => {
  it("retains every Earthworm source and the game colour when laying out its fusion pair", () => {
    const html = renderToStaticMarkup(<ShardAcquisitionGuide shardKey="U40" />);
    expect(text(html)).toContain("Bug Family");
    expect(text(html)).toContain("Mining Attribute Category");
    expect(text(html)).toContain("Catch with Pocket Black Hole.");
    expect(text(html)).toContain("Catch with Lasso.");
    expect(text(html)).toContain("Charm Earthworm.");
    expect(html).toContain("text-stat-green");
    expect(html).toContain('aria-label="with"');
  });

  it("preserves conditions and precise location guidance instead of replacing them with a tool name", () => {
    const pangolin = text(renderToStaticMarkup(<ShardAcquisitionGuide shardKey="R88" />));
    expect(pangolin).toContain("Pangolin Hideaways");
    expect(pangolin).toContain("Catch from a distance.");
    const conditions = "Catch with a Fishing Net only during a Thunderstorm.";
    expect(text(renderToStaticMarkup(<ShardAcquisitionGuide shardKey="unknown" lines={[conditions]} />))).toContain(conditions);
  });

  it("leaves missing acquisition knowledge unavailable", () => {
    const html = renderToStaticMarkup(<ShardAcquisitionGuide shardKey="unknown" />);
    expect(text(html)).toBe("Acquisition details unavailable.");
    expect(html).not.toContain("<img");
  });
});
