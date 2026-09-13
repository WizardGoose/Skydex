import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const workspace = read("src/greenhouse/GreenhouseWorkspace.tsx");
const breakdown = read("src/greenhouse/GreenhousePlanBreakdown.tsx");
const gridState = read("src/greenhouse/context/GridStateContext.tsx");
const designer = read("src/greenhouse/context/DesignerContext.tsx");
const styles = read("src/greenhouse/greenhouse-shell.css");

describe("greenhouse workspace controls", () => {
  it("keeps Delayed growth with the plot actions instead of the phase heading", () => {
    const toolsStart = workspace.indexOf('className="greenhouse-plot-tools"');
    const canvasStart = workspace.indexOf('className="greenhouse-plot-measure"', toolsStart);
    const delayed = workspace.indexOf("<span>Delayed growth</span>", toolsStart);

    expect(toolsStart).toBeGreaterThan(-1);
    expect(delayed).toBeGreaterThan(toolsStart);
    expect(delayed).toBeLessThan(canvasStart);
    expect(breakdown).not.toContain("greenhouse-plan-delay-toggle");
    expect(breakdown).not.toContain("onDelayedGrowthChange");
  });

  it("passes one profile-shaped cell list through economics, previews, and the active plot", () => {
    expect(workspace).toContain("const plotCells = useMemo(() => getUnlockedCellsArray()");
    expect(workspace).toContain("requirementsRefineKey,\n    plotCells,");
    expect(workspace).toContain("activeFieldIds,\n    plotCells,");
    expect(workspace).toContain("cells={plotCells}");
    expect(breakdown).toContain("useSolvedLayout(mutationIds, cells, spots");
  });

  it("lets the narrow Ready-to-Plant header hug its contents", () => {
    expect(styles).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.greenhouse-plan-breakdown-heading > div:first-child,\s*\.greenhouse-plan-totals\s*\{\s*flex: 0 0 auto;/,
    );
  });

  it("uses the Hybrid plot renderer for a read-only Locked field", () => {
    expect(workspace).toContain("readOnly");
    expect(workspace).toContain("inputPlacementsOverride={plannedInputPlacements}");
    expect(workspace).toContain("targetPlacementsOverride={plannedTargetPlacements}");
    expect(workspace).not.toContain('import { SolvedGridView } from "./planner/SolvedGridView"');
  });

  it("keeps cell inspection available while hiding locked cells from ordinary plots", () => {
    expect(workspace).toContain("aria-pressed={editingCells}");
    expect(workspace).not.toContain('disabled={plotMode === "locked" || cellSource === "hypixel"}');
    expect(workspace.match(/showLockedCells=\{unlockedCells\.size === 0\}/g)).toHaveLength(2);
  });

  it("edits from Hypixel's slot shape plus the permanent core", () => {
    expect(gridState).toContain("profileOverrideCells");
    expect(gridState).toContain("current ?? profileUnlockedCells");
    expect(gridState).toContain("withPermanentUnlockedCells(");
    expect(gridState.match(/if \(isPermanentUnlockedCell\(row, col\)\) return;/g)).toHaveLength(2);
    expect(gridState).not.toContain("if (profileUnlockedCells) return;");
    expect(workspace).not.toContain("profileLocked");
    expect(gridState).toContain('source === "hypixel"');
    expect(gridState).toContain("setProfileOverrideCells(null);");
    expect(gridState).toContain('if (profileUnlockedCells) return "hypixel";');
    expect(gridState).toContain("setManualUnlockedCells(restored);");
    expect(designer).toContain("replaceUnlockedCells(restored, cellEdit.beforeSource)");
  });

  it("keeps the displayed plot visible and uses its occupancy while editing cells", () => {
    expect(workspace).toContain('className="greenhouse-cell-editor-plot"');
    expect(workspace).toContain('aria-hidden="true" inert');
    expect(workspace).toContain("for (const placement of displayAllPlacements)");
    expect(workspace).toContain("The starter core stays unlocked.");
    expect(workspace).toContain("disabled={permanent}");
    expect(workspace).toContain("setPlotCell(nextRow, nextCol, mode);");
    expect(workspace).toContain('event.pointerType === "touch"');
    expect(workspace).toContain("Math.abs(event.clientX - touch.startX) > 8");
    expect(workspace).toContain("if (!touch.cancelled && touch.row === row && touch.col === col)");
    expect(workspace).toContain('setPlotCell(row, col, unlocked ? "lock" : "unlock")');
    expect(workspace).toContain("aria-disabled={!permanent && unreachable ? true : undefined}");
    expect(styles).toContain(".greenhouse-cell-editor-plot {\n  z-index: 0;\n  pointer-events: none;");
    expect(styles).toContain("touch-action: manipulation;");
  });

  it("keeps the last solved Locked field visible while a cell edit recalculates", () => {
    expect(workspace).toContain("retainedDisplayResult");
    expect(workspace).toContain("const visibleDisplayResult = activeDisplayResult ?? (");
    expect(workspace).toContain("editingCells && retainedDisplayResult.current?.fieldId === activePlanField?.node.id");
    expect(workspace).toContain("const retainedDisplayResult = useRef<");
    expect(workspace).not.toContain("setRetainedDisplayResult");
    expect(workspace).toContain("visibleDisplayResult && (");
  });

  it("rejects a partial auto-arrange result before replacing the current plot", () => {
    const arrangeStart = workspace.indexOf("const arrangePlot = useCallback");
    const completionCheck = workspace.indexOf("unmetFiniteMutationGoals(targets, response.mutations)", arrangeStart);
    const plotReplacement = workspace.indexOf("loadFromSolverResult(", arrangeStart);

    expect(arrangeStart).toBeGreaterThan(-1);
    expect(completionCheck).toBeGreaterThan(arrangeStart);
    expect(plotReplacement).toBeGreaterThan(completionCheck);
    expect(workspace).toContain("Your current plot was left unchanged.");
  });

  it("loads the delayed-growth arrangement into the actual Hybrid plot after the complete-goal check", () => {
    const arrangeStart = workspace.indexOf("const arrangePlot = useCallback");
    const arrangeEnd = workspace.indexOf("const setMutationGoalToMaximum", arrangeStart);
    const arrange = workspace.slice(arrangeStart, arrangeEnd);
    const completed = arrange.indexOf("unmetFiniteMutationGoals(targets, response.mutations)");
    const converted = arrange.indexOf("buildDelayedGrowthLayout(response, targets.map((target) => target.mutation), dataset, cells, controller.signal)");
    const replaced = arrange.indexOf("loadFromSolverResult(");

    expect(completed).toBeGreaterThan(-1);
    expect(converted).toBeGreaterThan(completed);
    expect(replaced).toBeGreaterThan(converted);
    expect(arrange).toContain("if (controller.signal.aborted) return;");
    expect(arrange).toContain("delayedGrowthEnabledRef.current");
    expect(arrange).toContain("arranged.placements.map(");
    expect(arrange).toContain("arranged.mutations.map(");
  });

  it("toggles the current Hybrid planting without replacing it with a single planned phase", () => {
    const start = workspace.indexOf("const chooseDelayedGrowth = useCallback");
    const end = workspace.indexOf("const mutationNeeds = useMemo", start);
    const toggle = workspace.slice(start, end);

    expect(toggle).toContain("placements: inputPlacements.map(");
    expect(toggle).toContain("mutations: targetPlacements.map(");
    expect(toggle).toContain("current.mutations.map((target) => target.mutation), dataset, plotCells");
    expect(toggle).toContain("restoreDelayedGrowthLayout(current, hybridDelayedChangeRef.current)");
    expect(toggle).not.toContain("activePlanField");
    expect(toggle).toContain("setPendingHybridFieldId(null)");
  });

  it("cancels both interactive solve types when the workspace unmounts", () => {
    expect(workspace).toContain("solveAbortRef.current?.abort();");
    expect(workspace).toContain("maxAbortRef.current?.abort();");
  });

  it("allows cell-edit history while editing either plot mode", () => {
    expect(workspace).toContain('disabled={(plotMode === "locked" && !editingCells) || !canUndo}');
    expect(workspace).toContain('disabled={(plotMode === "locked" && !editingCells) || !canRedo}');
    expect(workspace).toContain('setKeyboardShortcutsEnabled(plotMode === "hybrid" || editingCells)');
  });
});
