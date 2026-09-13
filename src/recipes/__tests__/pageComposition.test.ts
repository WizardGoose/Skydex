import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("Recipes profile-aware composition", () => {
  it("builds the collection and selected recipe in the shared Profile flow", () => {
    const page = read("../../pages/ItemsPage.tsx");
    const collection = read("../RecipeBook.tsx");

    expect(page).not.toContain("RecipeBookSummary");
    expect(page).toContain("RecipeCollection");
    expect(page).toContain("useEnsureProfileSources()");
    expect(page).toContain('className="recipes-workbench utility-workbench profile-glass"');
    expect(page).toContain('className="recipes-planner utility-workbench-zone"');
    expect(page.indexOf("<RecipeCollection")).toBeLessThan(page.indexOf('className="recipes-planner utility-workbench-zone"'));
    expect(collection).toContain('className="recipes-collection-overview"');
    expect(collection).not.toContain('aria-label="Recipe outcomes"');
    expect(collection).toContain('legend: "Status"');
    expect(collection).toContain('aria-label="Matching recipes"');
    expect(collection).toContain('id="recipes-collection-title">Recipes</h2>');
    expect(collection).toContain("Unlocked");
    expect(collection).toContain("Locked");
    expect(collection).toContain("Check in game");
    expect(collection).toContain("Ready to make");
    expect(collection).not.toContain("Access unverified");
    expect(collection).not.toContain("available targets");
    expect(page).not.toContain("What do you want to make or get?");
  });

  it("keeps access, exact inputs, holdings, and the recursive breakdown visible", () => {
    const page = read("../../pages/ItemsPage.tsx");
    const collection = read("../RecipeBook.tsx");
    const styles = read("../recipes-page.css");

    expect(page).toContain("RecipeAccessPanel");
    expect(page).toContain("RecipeActionBoard");
    expect(page).toContain("MaterialWorklist");
    expect(page).toContain("Recursive material tree");
    expect(page).toContain("inventoryKnown={owned.has}");
    expect(page).toContain("not found in tracked storage");
    expect(page).not.toContain("ManagedInventoryPanel");
    expect(page).not.toContain('className="recipes-action-operation"');
    expect(collection).toContain("How to unlock it");
    expect(collection).toContain("ProfileProgressionFilters");
    expect(styles).not.toContain("recipes-book-summary");
    expect(styles).not.toContain("recipes-book-workbench");
    expect(styles).not.toContain("position: sticky");
    expect(styles).not.toMatch(/(?:linear|radial|conic)-gradient\(/);
  });

  it("keeps search state inside the virtualized recipe collection", () => {
    const collection = read("../RecipeBook.tsx");

    expect(collection).toContain("useDeferredValue(query)");
    expect(collection).toContain("RecipeCollectionRows");
    expect(collection).toContain("entries.slice(range.start, range.end)");
    expect(collection).toContain("ResizeObserver");
    expect(collection).toContain("Search recipes, ingredients, or unlocks");
    expect(collection).toContain("searchTerms.every");
  });

  it("keeps page state chrome in the shared Skydex palette", () => {
    const page = read("../../pages/ItemsPage.tsx");
    const collection = read("../RecipeBook.tsx");
    const styles = read("../recipes-page.css");

    expect(styles).not.toContain("--recipes-sb-");
    expect(styles).not.toMatch(/#(?:55ff55|ff5555|ffaa00|ffff55|55ffff|aaaaaa)/i);
    expect(styles).toContain(".recipes-status-tabs button.is-active");
    expect(styles).toContain("var(--profile-accent)");
    expect(page).toMatch(/<ProfileItemTile[\s\S]*?tier=\{chosen\.tier\}/);
    expect(collection).toMatch(/<ProfileItemTile[\s\S]*?tier=\{entry\.item\.tier\}/);
    expect(page).toContain('TIER[chosen.tier ?? ""]');
  });
});
