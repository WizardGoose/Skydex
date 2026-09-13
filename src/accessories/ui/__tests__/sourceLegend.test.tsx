
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceLegend } from "../SourceTag";
import type { SourceCategory } from "../types";

const counts: Record<SourceCategory, number> = {
  craftable: 3,
  quest: 1,
  darkAuction: 1,
  shop: 2,
  event: 4,
  mobDrop: 1,
  wiki: 2,
};

describe("SourceLegend", () => {
  it("uses real item examples and compact labels instead of a prose decoder", () => {
    const markup = renderToStaticMarkup(
      <SourceLegend
        counts={counts}
        selected={[]}
        onToggle={() => undefined}
        examples={{
          craftable: { name: "Talisman", id: "TALISMAN" },
          shop: { name: "Zombie Talisman", id: "ZOMBIE_TALISMAN" },
          event: { name: "Spooky Talisman", id: "SPOOKY_TALISMAN" },
          wiki: { name: "Unknown Accessory", id: "UNKNOWN_ACCESSORY" },
        }}
      />
    );

    expect(markup).toContain('data-accessory-source-legend');
    expect(markup).toContain("Craftable");
    expect(markup).toContain("Shop");
    expect(markup).toContain("Event");
    expect(markup).toContain("Unknown / Wiki");
    expect(markup).toContain("Talisman");
    expect(markup).not.toContain("Sources come from our own item data");
    expect(markup).not.toContain("Nothing measurable is standing in the way");
  });
});
