import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const islandSource = readFileSync(resolve(process.cwd(), "src/pages/IslandPage.tsx"), "utf8");

describe("compact Profile wardrobe composition", () => {
  it("places the two established wardrobe grids side by side without a selected-set feature", () => {
    expect(islandSource).toContain('data-wardrobe-composition');
    expect(islandSource).toContain('xl:grid-cols-2');
    expect(islandSource).toContain('title="Armour Wardrobe"');
    expect(islandSource).toContain('title="Equipment Wardrobe"');
    expect(islandSource).not.toContain("WardrobeSelectionPane");
    expect(islandSource).not.toContain("Selected set");
    expect(existsSync(resolve(process.cwd(), "src/profile/WardrobeSelectionPane.tsx"))).toBe(false);
  });

  it("keeps the 44px wardrobe grid contract", () => {
    expect(islandSource).toContain('data-wardrobe-slot-size="44"');
  });
});
