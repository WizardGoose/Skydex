import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Fusion Lines graph scheduling", () => {
  it("does not schedule repeated whole-graph node measurements after layout", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/pages/FusionGraphPage.tsx"),
      "utf8"
    );

    expect(source).not.toContain("useUpdateNodeInternals");
    expect(source).not.toMatch(/setTimeout\s*\(\s*remeasure/);
    expect(source).toContain("fitView({ padding: 0.15, duration: 0 })");
  });
});
