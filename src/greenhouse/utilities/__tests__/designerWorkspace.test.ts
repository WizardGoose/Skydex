import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignerPlacement } from "../../context/DesignerContext";
import type { SavedLayout } from "../../types/layout";
import {
  clearDesignerRecovery,
  createDesignerTimeline,
  designerShortcut,
  loadDesignerRecovery,
  pushDesignerTimeline,
  redoDesignerTimeline,
  saveDesignerRecovery,
  toMostRecentLayout,
  undoDesignerTimeline,
  type DesignerWorkspace,
} from "../designerWorkspace";

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { throw new Error("designer recovery must never clear unrelated site data"); }
}

const placement = (id: string, cropId = "wheat"): DesignerPlacement => ({
  id,
  cropId,
  cropName: cropId,
  size: 1,
  position: [0, 0],
  isMutation: false,
});

const namedLayout = (id: string): SavedLayout => ({
  id,
  name: id,
  savedAt: 10,
  modifiedAt: 10,
  inputs: [{ cropId: "wheat", position: [0, 0] }],
  targets: [],
});

const workspace = (id = "active"): DesignerWorkspace => ({
  inputPlacements: [placement(id)],
  targetPlacements: [],
  mostRecent: null,
  savedLayouts: [namedLayout("saved")],
});

describe("designer timeline", () => {
  it("tracks the loaded design itself as Most Recent", () => {
    const before = workspace("before-load");
    const after = { ...before, inputPlacements: [placement("loaded", "carrot")] };

    const timeline = pushDesignerTimeline(createDesignerTimeline(before), after, { now: 1234 });

    expect(timeline.present.inputPlacements[0].id).toBe("loaded");
    expect(timeline.present.mostRecent).toMatchObject({
      inputPlacements: [{ id: "loaded", cropId: "carrot" }],
      capturedAt: 1234,
    });
    expect(toMostRecentLayout(timeline.present.mostRecent)?.name).toBe("Most Recent");
  });

  it("updates Most Recent automatically after an ordinary placement edit", () => {
    const before = createDesignerTimeline(workspace("before-edit"));
    const after = pushDesignerTimeline(
      before,
      { ...before.present, inputPlacements: [placement("after-edit", "melon")] },
      { now: 4321 },
    );

    expect(toMostRecentLayout(after.present.mostRecent)).toMatchObject({
      savedAt: 4321,
      inputs: [{ cropId: "melon", position: [0, 0] }],
      targets: [],
    });
  });

  it("undoes and redoes edits, clears and loads in their original order", () => {
    const first = createDesignerTimeline(workspace("first"));
    const edited = pushDesignerTimeline(first, {
      ...first.present,
      inputPlacements: [placement("edited")],
    });
    const cleared = pushDesignerTimeline(edited, {
      ...edited.present,
      inputPlacements: [],
    }, { now: 2000 });

    const undoClear = undoDesignerTimeline(cleared);
    expect(undoClear.present.inputPlacements[0].id).toBe("edited");
    const undoEdit = undoDesignerTimeline(undoClear);
    expect(undoEdit.present.inputPlacements[0].id).toBe("first");
    const redoEdit = redoDesignerTimeline(undoEdit);
    expect(redoEdit.present.inputPlacements[0].id).toBe("edited");
    expect(redoDesignerTimeline(redoEdit).present.inputPlacements).toEqual([]);
  });

  it("restores one deleted named layout through the same undo stack", () => {
    const initial = createDesignerTimeline(workspace());
    const deleted = pushDesignerTimeline(initial, {
      ...initial.present,
      savedLayouts: [],
    });

    expect(deleted.present.savedLayouts).toEqual([]);
    expect(undoDesignerTimeline(deleted).present.savedLayouts).toEqual([namedLayout("saved")]);
  });

  it("bounds the undo stack", () => {
    let timeline = createDesignerTimeline(workspace("0"));
    for (let i = 1; i <= 75; i++) {
      timeline = pushDesignerTimeline(timeline, {
        ...timeline.present,
        inputPlacements: [placement(String(i))],
      });
    }
    expect(timeline.past).toHaveLength(50);
    expect(timeline.pastCellEdits).toHaveLength(50);
  });

  it("keeps occupied and empty land edits aligned through undo and redo", () => {
    const initial = createDesignerTimeline(workspace("occupied"));
    const occupiedEdit = pushDesignerTimeline(initial, {
      ...initial.present,
      inputPlacements: [],
    }, {
      cellEdit: {
        before: ["2,4", "3,4"],
        after: ["3,4"],
        beforeSource: "hypixel",
        afterSource: "browser",
      },
    });
    const emptyEdit = pushDesignerTimeline(occupiedEdit, occupiedEdit.present, {
      cellEdit: {
        before: ["3,4"],
        after: ["3,4", "3,5"],
        beforeSource: "browser",
        afterSource: "browser",
      },
    });

    expect(emptyEdit.past).toHaveLength(2);
    expect(emptyEdit.pastCellEdits).toHaveLength(2);
    expect(emptyEdit.present.savedLayouts).toEqual([namedLayout("saved")]);
    const undoEmpty = undoDesignerTimeline(emptyEdit);
    expect(undoEmpty.future).toHaveLength(1);
    expect(undoEmpty.futureCellEdits).toHaveLength(1);
    expect(undoEmpty.present.inputPlacements).toEqual([]);
    expect(undoEmpty.futureCellEdits[0]?.before).toEqual(["3,4"]);
    const undoOccupied = undoDesignerTimeline(undoEmpty);
    expect(undoOccupied.future).toHaveLength(2);
    expect(undoOccupied.futureCellEdits).toHaveLength(2);
    expect(undoOccupied.present.inputPlacements[0].id).toBe("occupied");
    expect(undoOccupied.futureCellEdits[0]?.before).toEqual(["2,4", "3,4"]);
    expect(undoOccupied.futureCellEdits[0]?.beforeSource).toBe("hypixel");
    const redoOccupied = redoDesignerTimeline(undoOccupied);
    expect(redoOccupied.past).toHaveLength(1);
    expect(redoOccupied.pastCellEdits).toHaveLength(1);
    expect(redoOccupied.present.inputPlacements).toEqual([]);
    expect(redoOccupied.pastCellEdits.at(-1)?.after).toEqual(["3,4"]);
    const redoEmpty = redoDesignerTimeline(redoOccupied);
    expect(redoEmpty.past).toHaveLength(2);
    expect(redoEmpty.pastCellEdits).toHaveLength(2);
    expect(redoEmpty.futureCellEdits).toEqual([]);
    expect(redoEmpty.pastCellEdits.at(-1)?.after).toEqual(["3,4", "3,5"]);
  });

  it("invalidates land redo alongside workspace redo after a new edit", () => {
    const initial = createDesignerTimeline(workspace("before-land-edit"));
    const landEdit = pushDesignerTimeline(initial, initial.present, {
      cellEdit: {
        before: ["3,4"],
        after: ["3,4", "3,5"],
        beforeSource: "browser",
        afterSource: "browser",
      },
    });
    const undone = undoDesignerTimeline(landEdit);
    const replanted = pushDesignerTimeline(undone, {
      ...undone.present,
      inputPlacements: [placement("new-plant", "melon")],
    });

    expect(replanted.future).toEqual([]);
    expect(replanted.futureCellEdits).toEqual([]);
    expect(redoDesignerTimeline(replanted)).toBe(replanted);
  });

  it("restores the pruned plant, cells, and named loadouts around a starter preset", () => {
    const initial = createDesignerTimeline(workspace("outer-plant"));
    const starter = pushDesignerTimeline(initial, {
      ...initial.present,
      inputPlacements: [],
    }, {
      cellEdit: {
        before: ["0,0", "3,4"],
        after: ["3,4"],
        beforeSource: "hypixel",
        afterSource: "browser",
      },
    });

    expect(starter.present.savedLayouts).toEqual([namedLayout("saved")]);
    const undone = undoDesignerTimeline(starter);
    expect(undone.present.inputPlacements[0].id).toBe("outer-plant");
    expect(undone.present.savedLayouts).toEqual([namedLayout("saved")]);
    expect(undone.futureCellEdits[0]).toMatchObject({
      before: ["0,0", "3,4"],
      beforeSource: "hypixel",
    });
    const redone = redoDesignerTimeline(undone);
    expect(redone.present.inputPlacements).toEqual([]);
    expect(redone.present.savedLayouts).toEqual([namedLayout("saved")]);
    expect(redone.pastCellEdits.at(-1)?.after).toEqual(["3,4"]);
  });
});

describe("designer keyboard shortcuts", () => {
  const key = (value: string, target?: unknown) => ({
    key: value,
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    target,
  });

  it("maps the standard undo and redo shortcuts", () => {
    expect(designerShortcut(key("z"))).toBe("undo");
    expect(designerShortcut(key("Y"))).toBe("redo");
    expect(designerShortcut({ ...key("z"), shiftKey: true })).toBe("redo");
  });

  it("leaves typing fields and modified shortcuts alone", () => {
    expect(designerShortcut(key("z", { tagName: "INPUT" }))).toBeNull();
    expect(designerShortcut(key("u"))).toBeNull();
    expect(designerShortcut({ ...key("y"), shiftKey: true })).toBeNull();
    expect(designerShortcut({ ...key("z"), altKey: true })).toBeNull();
  });
});

describe("designer crash recovery", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  it("restores the active design and its one Most Recent slot", () => {
    const active = workspace("active");
    active.mostRecent = {
      inputPlacements: [placement("recent")],
      targetPlacements: [],
      capturedAt: 321,
    };

    expect(saveDesignerRecovery(active)).toBe(true);
    expect(loadDesignerRecovery()).toMatchObject({
      inputPlacements: [{ id: "active" }],
      mostRecent: { inputPlacements: [{ id: "recent" }], capturedAt: 321 },
    });
  });

  it("persists an automatically captured Most Recent layout across a refresh", () => {
    const initial = createDesignerTimeline(workspace("before-refresh"));
    const edited = pushDesignerTimeline(
      initial,
      { ...initial.present, inputPlacements: [placement("latest", "melon")] },
      { now: 9876 },
    );

    expect(saveDesignerRecovery(edited.present)).toBe(true);
    expect(loadDesignerRecovery()).toMatchObject({
      inputPlacements: [{ id: "latest", cropId: "melon" }],
      mostRecent: {
        inputPlacements: [{ id: "latest", cropId: "melon" }],
        capturedAt: 9876,
      },
    });
  });

  it("falls back to the previous valid backup when the newest record is corrupt", () => {
    expect(saveDesignerRecovery(workspace("valid"))).toBe(true);
    expect(saveDesignerRecovery(workspace("newer"))).toBe(true);
    const currentKey = [...storage.values.keys()].find((key) => key.includes("recovery.current"));
    expect(currentKey).toBeTruthy();
    storage.setItem(currentKey!, "{broken-json");

    expect(loadDesignerRecovery()?.inputPlacements[0].id).toBe("valid");
  });

  it("forgets only its own recovery records", () => {
    storage.setItem("some-other-feature", "keep me");
    saveDesignerRecovery(workspace());

    clearDesignerRecovery();

    expect(storage.getItem("some-other-feature")).toBe("keep me");
    expect([...storage.values.keys()].filter((key) => key.includes("designer.recovery"))).toEqual([]);
  });
});
