import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GreenhouseSettings } from "../GreenhouseSettings";

describe("Greenhouse slider parity", () => {
  it("uses the shared full-width range control for both Greenhouse setting sliders", () => {
    const markup = renderToStaticMarkup(
      <GreenhouseSettings
        growth={{ cropGrowth: 50, speedTier: 4, plots: 1, bioanalysis: "none" }}
        onChange={() => undefined}
      />
    );

    expect(markup).toContain('id="gh-crop-growth"');
    expect(markup).toContain('id="gh-speed-tier"');
    expect([...markup.matchAll(/type="range"[^>]*class="w-full"/g)]).toHaveLength(2);
  });
});
