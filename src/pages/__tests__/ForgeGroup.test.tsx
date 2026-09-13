import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForgeGroup } from "../ForgeGroup";

describe("ForgeGroup", () => {
  it("does not mount recipe cards while a group is collapsed", () => {
    const html = renderToStaticMarkup(
      <ForgeGroup title="Tools" count={1} initiallyOpen={false}>
        <span data-testid="recipe-card">Drill Motor</span>
      </ForgeGroup>,
    );

    expect(html).toContain("Tools");
    expect(html).not.toContain("recipe-card");
  });

  it("mounts recipe cards for the initially open group", () => {
    const html = renderToStaticMarkup(
      <ForgeGroup title="Refining" count={1} initiallyOpen>
        <span data-testid="recipe-card">Refined Diamond</span>
      </ForgeGroup>,
    );

    expect(html).toContain("recipe-card");
  });
});
