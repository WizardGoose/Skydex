import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(resolve(process.cwd(), "src/pages/SettingsPage.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/pages/shards-page.css"), "utf8");
const settings = readFileSync(resolve(process.cwd(), "src/pages/ShardSettingsPanel.tsx"), "utf8");
const sequence = readFileSync(resolve(process.cwd(), "src/shards/ShardFusionSequence.tsx"), "utf8");
const goalList = readFileSync(resolve(process.cwd(), "src/shards/ShardGoalList.tsx"), "utf8");
const tooltip = readFileSync(resolve(process.cwd(), "src/shards/ShardTooltip.tsx"), "utf8");
const tooltipContent = readFileSync(resolve(process.cwd(), "src/shards/shardTooltipContent.ts"), "utf8");

describe("Shards calculator workspace", () => {
  it("uses the shared player shell and leaves identity to the shared header", () => {
    expect(page).toContain("profile-view-root profile-view-root--frosted shards-view-root");
    expect(page).toContain("<CharacterStage");
    expect(page).toContain("<ProfileIdentity");
    expect(page).not.toContain("<SplitPage");
    expect(page).not.toContain("<PageHeader");
    expect(page).not.toContain("identityDetail");
    expect(page).not.toContain("shards-identity");
  });

  it("keeps targets, calculation and requirements in the shared utility work surface", () => {
    expect(page).toContain('className="shards-workspace-surface profile-glass"');
    expect(page).toContain('className="shards-workspace-grid utility-workbench"');
    expect(page).toContain('className="shards-zone shards-goals utility-workbench-zone utility-rail-split"');
    expect(page).toContain('className="shards-zone shards-route-planner utility-workbench-zone"');
    expect(page).toContain('aria-labelledby="shards-requirements-title"');
    expect(page).toContain('aria-labelledby="shards-breakdowns-title"');
    expect(page).not.toContain("ShardCollectionSummary");
    expect(page).not.toContain("shards-summary");
    expect(page).not.toContain("shards-workbench");
  });

  it("keeps the calculator front-facing and driven by the real route solver", () => {
    expect(page).toContain('aria-labelledby="shard-goal-title"');
    expect(page).toContain('aria-labelledby="shard-planner-title"');
    expect(page).toContain('aria-label="Target shard shelf"');
    expect(page).toContain("<ShardGoalList");
    expect(page).toContain("buildShardProgress");
    expect(page).toContain("remainingForGoal");
    expect(page).toContain("InvCalculationService.getInstance().calculateOptimalPath");
    expect(page).toContain("inventoryUsed(usableInventory, endingInventory");
    expect(page).toContain('newGoalSelection(shardKey, entry)');
    expect(page).toContain("workingInventory = nextResult.remainingInventory");
    expect(page).toContain("routeRequirements");
    expect(page).toContain('<FusionDevViews view="circuit"');
    expect(page).not.toContain('Developer · Fusion views');
    expect(page).toContain("<ShardRouteTree");
    expect(page).not.toContain("<ShardAutocomplete");
  });

  it("keeps target quantities and removal one click away", () => {
    expect(page).toContain("setGoalAmountByKey");
    expect(page).toContain("setGoalMaxByKey");
    expect(goalList).toContain("shards-quantity");
    expect(goalList).toContain("shards-target-remove");
    expect(goalList).toContain("<Minus");
    expect(goalList).toContain("<Plus");
    expect(goalList).toContain("<X");
    expect(goalList).toContain('aria-pressed={goal.mode === "max"}');
    expect(goalList).toContain('max={maximum ?? undefined}');
    expect(goalList).toContain('value={remaining ?? ""}');
  });

  it("keeps the collapsible picker and target rows together, with a separate collection", () => {
    const left = page.slice(page.indexOf('aria-labelledby="shard-goal-title"'), page.indexOf('aria-labelledby="shard-planner-title"'));
    const collection = page.slice(page.indexOf('aria-labelledby="shard-collection-title"'));
    expect(left).toContain("<ShardGoalList");
    expect(left).toContain('goalSearchOpen &&');
    expect(left).toContain('<UtilityTargetSearch');
    expect(left).toContain('expanded={goalSearchOpen} onExpandedChange={setGoalSearchOpen}');
    expect(left).not.toContain('id="shard-collection-title"');
    expect(collection).toContain('id="shard-collection-title"');
    expect(page).not.toContain("goalRailMode");
    expect(page).toContain('aria-labelledby="shards-requirements-title"');
    expect(page).toContain('aria-label="Sync shard collection with profile"');
    expect(page).toContain("<ProfileProgressionFilters");
    expect(page).toContain("shards-status-tabs");
    expect(page).toContain("shards-row-editor");
    expect(page).toContain("shards-row-edit-toggle");
    expect(page).toContain("toggleShardInRoutes");
    expect(page).not.toContain("InventoryManagementModal");
    expect(page).not.toContain("<select");
  });

  it("keeps visibility independent of whole-plan allocation and totals", () => {
    const centre = page.slice(page.indexOf('aria-labelledby="shard-planner-title"'), page.indexOf('aria-labelledby="shards-requirements-title"'));
    const continuation = page.slice(page.indexOf('aria-labelledby="shards-breakdowns-title"'));
    expect(page).toContain("visibleGoalRoutes.find((route) => route.goal.shardKey === goal?.shardKey)");
    expect(centre).toContain('routes={visibleGoalRoutes} hiddenTargets={hiddenTargets}');
    expect(centre).not.toContain("visibleGoalRoutes.map");
    expect(centre).not.toContain('aria-label="Selected target totals"');
    expect(centre).toContain('aria-label="Full plan totals"');
    expect(page.match(/aria-label="Full plan totals"/g)).toHaveLength(1);
    expect(continuation).toContain("visibleGoalRoutes.map");
    expect(page).toContain("workingInventory = nextResult.remainingInventory");
  });

  it("keeps acquisition requirements and complete target breakdowns accessible", () => {
    expect(page).toContain('requirement={requirement} quantity={requirement.missing}');
    expect(page).toContain('aria-labelledby="shards-breakdowns-title"');
    expect(page).not.toContain("Get the missing shards");
    expect(page).toContain('"Target breakdowns list" : "Direct rates list"');
    expect(page).toContain("acquisitionTargets");
    expect(page).toContain("effectiveHunterFortune");
    expect(page).toContain("effectiveKuudraTier");
  });

  it("uses profile reads without turning missing fields into zero", () => {
    expect(page).toContain("importPlayerProfile(identity, shards, controller.signal,");
    expect(page).toContain("selected.shardsRead");
    expect(page).toContain("selected.attributesRead");
    expect(page).toContain("fused count to include it accurately");
    expect(page).toContain("Set progress");
    expect(page).not.toContain("Edit counts");
  });

  it("shares route toggles with Shards while leaving advanced overrides in settings", () => {
    expect(page).not.toContain("<SettingsLink");
    expect(page).not.toContain("Settings2");
    expect(page).not.toContain("<CalculatorForm");
    expect(page).not.toContain("Planning assumptions");
    expect(settings).toContain('label="Hunter Fortune"');
    expect(settings).toContain('label="Kuudra tier"');
    expect(settings).not.toContain('Kraken timing');
    expect(page).toContain("['overrides', 'Overrides']");
    expect(page).toContain("['kuudra', 'Kuudra']");
    expect(page).toContain('name="shards-planner-settings"');
    expect(page).toContain('<ShardSettingsPanel section={section} />');
    expect(settings).toContain("<ShardRouteToggles");
    expect(page).toContain("<ShardRouteToggles");
    expect(settings).not.toContain("Shard Levels");
  });

  it("matches the Greenhouse desktop, middle-width, and stacked layout rhythm", () => {
    expect(styles).toMatch(/\.shards-workspace-grid\s*\{[^}]*grid-template-columns:\s*minmax\(14\.5rem, 0\.76fr\) minmax\(0, 2\.44fr\)/s);
    expect(styles).toContain("@container (max-width: 60rem)");
    expect(styles).toMatch(/@container \(max-width: 60rem\)[\s\S]*\.shards-support\s*\{[^}]*grid-column:\s*1 \/ -1/s);
    expect(styles).toContain("@media (max-width: 980px)");
    expect(styles).toMatch(/@media \(max-width: 980px\)[\s\S]*\.shards-workspace-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s);
  });

  it("lets the shared display grow around full-sized reels while bounding the goal queue", () => {
    expect(page).toContain('visibleGoalRoutes.length > 0 ? " has-routes" : ""');
    expect(styles).toMatch(/\.shards-route-stage\.has-routes\s*\{[^}]*flex:\s*0 0 auto;[^}]*min-height:\s*0;[^}]*justify-content:\s*flex-start;/s);
    expect(styles).toMatch(/\.shards-route-stage\s*\{[^}]*overflow:\s*visible;/s);
    expect(styles).toMatch(/\.shards-target-list\s*\{[^}]*overflow-y:\s*auto;/s);

    const laneRule = styles.match(/\.shards-fusion-lanes\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(laneRule).toContain("align-content: start");
    expect(laneRule).toContain("overflow-y: visible");
    expect(laneRule).not.toContain("max-height: 27rem");
    expect(laneRule).not.toContain("overflow-y: auto");
  });

  it("keeps completed goal paths content-sized below the planner", () => {
    expect(page).toContain('route.remaining === 0 && !route.result?.tree ? " is-complete" : ""');
    expect(styles).toMatch(/\.shards-route-goal-path\.is-complete > \.shards-acquisition-wait\s*\{[^}]*min-height:\s*0;/s);
  });

  it("retains the avatar at split-window widths and follows Greenhouse on phones", () => {
    const splitWindowRules = styles.split("@media (max-width: 980px)")[1].split("@media (max-width: 820px)")[0];
    expect(splitWindowRules).not.toContain(".profile-character-stage");
    expect(splitWindowRules).not.toContain(".profile-shell");
    expect(styles).toMatch(/@media \(max-width: 820px\)[\s\S]*\.shards-view-root \.profile-character-stage\s*\{[^}]*display:\s*none;/s);
  });

  it("uses the same compact phone identity as Greenhouse", () => {
    expect(styles).toContain("@media (max-width: 820px)");
    expect(styles).toMatch(/\.shards-view-root \.profile-identity\s*\{[^}]*min-height:\s*4\.35rem/s);
    expect(styles).toMatch(/\.shards-view-root \.profile-identity-actions\s*\{\s*display:\s*none;/);
    expect(styles).toMatch(/@media \(max-width: 528px\)[\s\S]*\.shards-goal-shelf\s*\{[^}]*display:\s*grid;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s);
  });

  it("uses the shared detached tooltip for goals, requirements and collection", () => {
    expect(page).toContain("<ShardTooltip");
    expect(goalList).toContain("<ShardTooltip");
    expect(tooltip).toContain("<ItemTooltip");
    expect(tooltip).toContain("shardTooltipContent(shard, progress)");
    expect(styles).not.toContain(".shards-goal-tooltip");
  });

  it("uses the selected profile type for route economics and acquisition language", () => {
    expect(page).toContain("const { ironman } = useProfile()");
    expect(page).not.toContain("selectedGameMode");
    expect(page).not.toContain('importView.selected?.profile.game_mode?.trim()');
    expect(page).toContain("directAcquisitionLabel(ironman)");
    expect(page).toContain('ironman={ironman}');
    expect(page).toContain('{ironman ? "Est. time" : "Cost"}');
    expect(page).not.toContain("Ironman hunt only");
  });

  it("uses game rarity fills and colored SkyBlock effect tokens without glows", () => {
    const selectedRule = styles.match(/\.shards-collection-row\.is-selected\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(selectedRule).toContain("var(--shard-rarity");
    expect(selectedRule).toContain("box-shadow: none");
    expect(page).toContain("<ShardEffectText");
    expect(page).toContain("shardDescriptionGameText");
    expect(page).toContain("shardAcquisitionGameText");
    expect(tooltipContent).toContain("shardTypeGameText");
    expect(page).toContain("skyBlockStatPresentation");
    expect(styles).toContain("--shard-rarity");
  });

  it("connects real ingredient branches without packing them into boxed stages", () => {
    const sequenceRule = styles.match(/\.shards-fusion-sequence\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(sequence).toContain("buildFusionBranches(tree)");
    expect(sequence).toContain("layoutFusionBranches(root, availableWidth)");
    expect(sequence).toContain('data-from={edge.from} data-to={edge.to}');
    expect(sequenceRule).not.toContain("repeat(auto-fill");
    expect(sequenceRule).not.toContain("overflow-x: auto");
    expect(sequence).not.toContain("shards-sequence-step");
  });

  it("uses Profile's item tile and plain quantity overlay for every combine picture", () => {
    expect(sequence).toContain("<ProfileItemTile");
    expect(sequence).toContain("countLabel={count?.toLocaleString()}");
    expect(sequence).toContain("iconSize={52}");
    expect(sequence).not.toContain("<b>{Math.ceil(quantity).toLocaleString()}×</b>");
    expect(styles).not.toMatch(/\.shards-sequence-picture \.profile-item-tile-count\s*\{/);
    expect(page).toContain('className="shards-goal-count profile-item-tile-count profile-item-overlay-text profile-number"');
    expect(styles).not.toMatch(/\.shards-goal-count\s*\{/);
  });

  it("removes mock-only and repeated profile context", () => {
    for (const rejected of [
      "Pomegranate applied",
      "Profile synced",
      "Calculator profile",
      "Profile-adjusted",
      "Saved override is being used",
      "Saved plans",
      "Edit route",
      "Undo",
      "Redo",
    ]) {
      expect(page).not.toContain(rejected);
    }
  });

  it("uses flat active controls and no mock graph-paper treatment", () => {
    expect(styles).not.toContain("linear-gradient");
    expect(styles).not.toContain("radial-gradient");
    expect(styles).not.toContain("canvas-cells");

    expect(page).toContain('className="shards-status-tabs profile-tabs"');
    expect(styles).not.toMatch(/\.shards-status-tabs button\.is-active\s*\{[^}]*background:/);
  });

  it("removes the section tool strip only while the Shards page is mounted", () => {
    expect(styles).toContain(":root:has(.shards-view-root) .sd-tools");
    expect(styles).toMatch(/\.sd-tools\s*\{\s*display:\s*none;/);
    expect(styles).toContain("--sd-chrome-h: var(--sd-bar-h)");
  });
});
