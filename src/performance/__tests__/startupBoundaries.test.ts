import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), "utf8");

describe("startup performance boundaries", () => {
  it("does not impose fixed waits before character boot or acquisition lookup", () => {
    const stage = read("../../profile-view/CharacterStage.tsx");
    const acquisition = read("../../recipes/useWikiAcquisition.ts");
    expect(stage).not.toContain("MODEL_BOOT_DELAY_MS");
    expect(acquisition).not.toContain("setTimeout");
    expect(acquisition).toContain("controller.abort()");
  });
  it("keeps the root route on direct critical-path imports", () => {
    const app = read("../../App.tsx");
    expect(app).not.toMatch(/from ["']\.\/components["']/);
    expect(app).not.toMatch(/from ["']\.\/context["']/);
    expect(app).not.toMatch(/from ["']\.\/hooks["']/);
    expect(app).toContain("./components/layout/Layout");
    expect(app).toContain("./context/CalculatorStateContext");
    expect(app).toContain("./hooks/usePageTitle");
  });

  it("keeps the greenhouse workspace behind its lazy route boundary", () => {
    const app = read("../../App.tsx");
    expect(app).toContain('lazy(() => import("./greenhouse/GreenhouseHashRoute")');
    expect(app).not.toMatch(/import \{ GreenhouseHashRoute \}/);
    expect(app).not.toMatch(/from ["']\.\/greenhouse\/designerRoute["']/);
  });

  it("keeps route loading states tall enough to clamp a restored scroll position", () => {
    const app = read("../../App.tsx");
    expect(app).toContain("min-h-[calc(100dvh-var(--sd-chrome-h))]");
    expect(app).toContain('role="status"');
    expect(app).toContain('aria-label="Loading page"');
  });

  it("keeps the large minion catalogue out of API-only profile parsing", () => {
    const parser = read("../../profile/craftedGenerators.ts");
    expect(parser).not.toContain("minionsCatalogue");
    expect(parser).not.toContain("MINION_CATALOGUE");
  });

  it("keeps the minion feature off the IslandPage startup path", () => {
    const island = read("../../pages/IslandPage.tsx");
    expect(island).not.toMatch(/import \{ MinionsSection \}/);
    expect(island).toContain('import("../profile/MinionsSection")');
  });

  it("keeps player previews out of an unrestricted WebGL frame loop", () => {
    const player = read("../../island/PlayerModel.tsx");
    expect(player).toContain("renderPaused: true");
    expect(player).not.toContain("viewer.renderPaused = false");
    expect(player).toContain("IDLE_FRAME_INTERVAL_MS = 125");
    expect(player).toContain("IDLE_AUTO_PREVIEW_MS = 2_500");
    expect(player).toContain('document.addEventListener("visibilitychange", syncActivity)');
    expect(player).toContain("new IntersectionObserver");
    expect(player).toContain('target.addEventListener("pointerenter", onPointerEnter)');
    expect(player).toContain('target.addEventListener("pointerleave", onPointerLeave)');
    expect(player).toContain('controls.addEventListener("change", renderViewer)');
    expect(player).toContain('controls.removeEventListener("change", renderViewer)');
  });

  it("keeps the shared character stage light and never substitutes the flat body poster", () => {
    const items = read("../../pages/ItemsPage.tsx");
    const storage = read("../../pages/StoragePage.tsx");
    const greenhouse = read("../../greenhouse/GreenhouseShell.tsx");
    const stage = read("../../profile-view/CharacterStage.tsx");

    for (const route of [items, storage, greenhouse]) {
      expect(route).toContain("profile-view/CharacterStage");
      expect(route).not.toContain("profile-view/ProfileView");
    }
    expect(stage).toContain('lazy(() => import("../island/PlayerModel")');
    expect(stage).toContain("<CharacterModelStandby />");
    expect(stage).not.toContain("CharacterPoster");
    expect(stage).not.toContain("bodyUrl");
  });

  it("mounts only the visible window of the recipe catalogue", () => {
    const collection = read("../../recipes/RecipeBook.tsx");
    expect(collection).toContain("entries.slice(range.start, range.end)");
    expect(collection).toContain("Math.ceil(entries.length / columns)");
    expect(collection).toContain("rowCount * ROW_HEIGHT");
    expect(collection).toContain("Math.floor(node.scrollTop / ROW_HEIGHT) - OVERSCAN");
    expect(collection).toContain("new ResizeObserver");
    expect(collection).not.toContain(".slice(0, 300)");
  });

  it("keeps recipe typing and direct selection ahead of planner expansion", () => {
    const items = read("../../pages/ItemsPage.tsx");
    const collection = read("../../recipes/RecipeBook.tsx");
    const planner = read("../../recipes/recipePlanWorkerService.ts");
    const catalogue = collection.indexOf("export const RecipeCollection");
    const queryState = collection.indexOf("const [query, setQuery] = useState(initialQuery);");
    const visibleEntries = collection.indexOf("const visibleEntries = useMemo");
    const directRecipe = items.indexOf("const RecipeActionBoard");
    const fullTree = items.indexOf("treeOpen && (");

    expect(catalogue).toBeGreaterThan(-1);
    expect(queryState).toBeGreaterThan(catalogue);
    expect(queryState).toBeLessThan(visibleEntries);
    expect(collection).toContain("const deferredQuery = useDeferredValue(query);");
    expect(collection).toContain("<RecipeCollectionRows entries={visibleEntries}");
    expect(items).not.toContain("const [query, setQuery]");
    expect(items).not.toContain("useDeferredValue(selected)");
    expect(items).not.toContain("useDeferredValue(quantity)");
    expect(items).toContain("buildRecipePlanInWorker({");
    expect(planner).toContain('new Worker(new URL("./recipePlan.worker.ts", import.meta.url)');
    expect(directRecipe).toBeGreaterThan(-1);
    expect(fullTree).toBeGreaterThan(directRecipe);
  });

  it("lets a loaded Pets tab commit before expanding its full icon grid", () => {
    const pets = read("../../profile-view/profile-sections/PetsPreview.tsx");
    expect(pets).toContain("const INITIAL_PET_TILES = 24;");
    expect(pets).toContain("matches.slice(0, visiblePetCount)");
    expect(pets).toContain("setTimeout(() => setVisiblePetCount(matches.length), 0)");
    expect(pets).toContain("displayedMatches.map");
  });

  it("keeps the former profile preview out of the global layout now that Profile owns it", () => {
    const app = read("../../App.tsx");
    const layout = read("../../components/layout/Layout.tsx");
    expect(app).toContain('import("./profile-view/ProfileView")');
    expect(layout).not.toContain("DevMarkup");
    expect(layout).not.toContain("devPreviewOpen");
    expect(layout).not.toContain("onOpenChange={setDevPreviewOpen}");
  });

  it("keeps the restored navigation first inside the global content layer", () => {
    const layout = read("../../components/layout/Layout.tsx");
    const contentLayer = layout.indexOf(
      '<div className="relative z-10 flex min-h-[100dvh] flex-col">',
    );
    const navigation = layout.indexOf("<Navigation />");
    const main = layout.indexOf("<main className=");

    expect(contentLayer).toBeGreaterThan(-1);
    expect(navigation).toBeGreaterThan(-1);
    expect(navigation).toBeGreaterThan(contentLayer);
    expect(main).toBeGreaterThan(navigation);
  });

  it("limits Tailwind scanning to authored source and ignores generated caches", () => {
    const css = read("../../index.css");
    const vite = read("../../../vite.config.ts");
    const eslint = read("../../../eslint.config.js");
    expect(css).toContain('@import "tailwindcss" source(none);');
    expect(css).toContain('@source "./";');
    expect(vite).toContain('**/.tmp-layoutrefs/**');
    expect(vite).toContain('**/.vite/**');
    expect(eslint).toMatch(/globalIgnores\(\[[^\]]*['"]\.vite['"]/);
  });
});
