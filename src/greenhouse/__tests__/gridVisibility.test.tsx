import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GridBackground } from "../components/grid/GridBackground";

describe("greenhouse grid visibility", () => {
  const unlockedCells = new Set(["4,4", "4,5"]);

  it("omits locked cells from the ordinary plot when usable cells exist", () => {
    const markup = renderToStaticMarkup(
      <GridBackground
        cellSize={24}
        gap={1}
        unlockedCells={unlockedCells}
        variant="gray"
        showLockedCells={false}
      />,
    );

    expect(markup).toContain("bg-slate-600/40");
    expect(markup).not.toContain("bg-slate-700/30");
  });

  it("keeps locked cells available for cell editing and empty profiles", () => {
    const markup = renderToStaticMarkup(
      <GridBackground
        cellSize={24}
        gap={1}
        unlockedCells={unlockedCells}
        variant="gray"
        showLockedCells
      />,
    );

    expect(markup).toContain("bg-slate-600/40");
    expect(markup).toContain("bg-slate-700/30");
  });
});
