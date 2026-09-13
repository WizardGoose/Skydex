import type { DesignerPlacement } from "../context/DesignerContext";
import type { SavedLayout } from "../types/layout";

export interface DesignerRecoveryPoint {
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
  capturedAt: number;
}

export interface DesignerWorkspace {
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
  mostRecent: DesignerRecoveryPoint | null;
  savedLayouts: SavedLayout[];
}

export interface DesignerTimeline {
  present: DesignerWorkspace;
  past: DesignerWorkspace[];
  future: DesignerWorkspace[];
  pastCellEdits: (DesignerCellEdit | null)[];
  futureCellEdits: (DesignerCellEdit | null)[];
}

interface PushOptions {
  now?: number;
  cellEdit?: DesignerCellEdit;
}

export interface DesignerCellEdit {
  before: string[];
  after: string[];
  beforeSource: "hypixel" | "browser";
  afterSource: "browser";
}

const HISTORY_LIMIT = 50;
const CURRENT_KEY = "skydex.designer.recovery.current.v1";
const BACKUP_KEY = "skydex.designer.recovery.backup.v1";

interface StoredRecovery {
  version: 1;
  inputPlacements: DesignerPlacement[];
  targetPlacements: DesignerPlacement[];
  mostRecent: DesignerRecoveryPoint | null;
}

const clonePlacement = (placement: DesignerPlacement): DesignerPlacement => ({
  ...placement,
  position: [...placement.position] as [number, number],
});

const copyPoint = (point: DesignerRecoveryPoint | null): DesignerRecoveryPoint | null =>
  point
    ? {
        inputPlacements: point.inputPlacements.map(clonePlacement),
        targetPlacements: point.targetPlacements.map(clonePlacement),
        capturedAt: point.capturedAt,
      }
    : null;

const pointFrom = (workspace: DesignerWorkspace, capturedAt: number): DesignerRecoveryPoint | null => {
  if (workspace.inputPlacements.length === 0 && workspace.targetPlacements.length === 0) return null;
  return {
    inputPlacements: workspace.inputPlacements.map(clonePlacement),
    targetPlacements: workspace.targetPlacements.map(clonePlacement),
    capturedAt,
  };
};

export const createDesignerTimeline = (present: DesignerWorkspace): DesignerTimeline => ({
  present: {
    ...present,
    // Most Recent is the latest active design, not the design that happened
    // to be replaced by a load or clear. Normalizing here also upgrades an
    // older recovery record whose slot used the previous semantics.
    mostRecent: pointFrom(present, present.mostRecent?.capturedAt ?? Date.now()),
  },
  past: [],
  future: [],
  pastCellEdits: [],
  futureCellEdits: [],
});

export const pushDesignerTimeline = (
  timeline: DesignerTimeline,
  next: DesignerWorkspace,
  options: PushOptions = {},
): DesignerTimeline => {
  const placementsChanged =
    next.inputPlacements !== timeline.present.inputPlacements ||
    next.targetPlacements !== timeline.present.targetPlacements;
  const present = placementsChanged
    ? {
        ...next,
        mostRecent: pointFrom(next, options.now ?? Date.now()),
      }
    : next;

  return {
    present,
    past: [...timeline.past, timeline.present].slice(-HISTORY_LIMIT),
    future: [],
    pastCellEdits: [...timeline.pastCellEdits, options.cellEdit ?? null].slice(-HISTORY_LIMIT),
    futureCellEdits: [],
  };
};

export const undoDesignerTimeline = (timeline: DesignerTimeline): DesignerTimeline => {
  const previous = timeline.past.at(-1);
  if (!previous) return timeline;
  return {
    present: previous,
    past: timeline.past.slice(0, -1),
    future: [timeline.present, ...timeline.future].slice(0, HISTORY_LIMIT),
    pastCellEdits: timeline.pastCellEdits.slice(0, -1),
    futureCellEdits: [timeline.pastCellEdits.at(-1) ?? null, ...timeline.futureCellEdits].slice(0, HISTORY_LIMIT),
  };
};

export const redoDesignerTimeline = (timeline: DesignerTimeline): DesignerTimeline => {
  const next = timeline.future[0];
  if (!next) return timeline;
  return {
    present: next,
    past: [...timeline.past, timeline.present].slice(-HISTORY_LIMIT),
    future: timeline.future.slice(1),
    pastCellEdits: [...timeline.pastCellEdits, timeline.futureCellEdits[0] ?? null].slice(-HISTORY_LIMIT),
    futureCellEdits: timeline.futureCellEdits.slice(1),
  };
};

export const toMostRecentLayout = (point: DesignerRecoveryPoint | null): SavedLayout | null =>
  point
    ? {
        id: "__skydex_most_recent__",
        name: "Most Recent",
        savedAt: point.capturedAt,
        modifiedAt: point.capturedAt,
        inputs: point.inputPlacements.map(({ cropId, position }) => ({ cropId, position })),
        targets: point.targetPlacements.map(({ cropId, position }) => ({ cropId, position })),
      }
    : null;

interface ShortcutEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  target?: unknown;
}

export const designerShortcut = (event: ShortcutEvent): "undo" | "redo" | null => {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null;

  const target = event.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
  const tag = target?.tagName?.toUpperCase();
  if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return null;

  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  if (key === "y" && !event.shiftKey) return "redo";
  return null;
};

const validPlacement = (value: unknown): value is DesignerPlacement => {
  if (!value || typeof value !== "object") return false;
  const placement = value as Partial<DesignerPlacement>;
  return (
    typeof placement.id === "string" &&
    typeof placement.cropId === "string" &&
    typeof placement.cropName === "string" &&
    typeof placement.size === "number" &&
    Number.isFinite(placement.size) &&
    Array.isArray(placement.position) &&
    placement.position.length === 2 &&
    placement.position.every((part) => typeof part === "number" && Number.isFinite(part)) &&
    typeof placement.isMutation === "boolean"
  );
};

const validPoint = (value: unknown): value is DesignerRecoveryPoint => {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<DesignerRecoveryPoint>;
  return (
    Array.isArray(point.inputPlacements) &&
    point.inputPlacements.every(validPlacement) &&
    Array.isArray(point.targetPlacements) &&
    point.targetPlacements.every(validPlacement) &&
    typeof point.capturedAt === "number" &&
    Number.isFinite(point.capturedAt)
  );
};

const parseRecovery = (raw: string | null): StoredRecovery | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredRecovery>;
    if (
      value.version !== 1 ||
      !Array.isArray(value.inputPlacements) ||
      !value.inputPlacements.every(validPlacement) ||
      !Array.isArray(value.targetPlacements) ||
      !value.targetPlacements.every(validPlacement) ||
      (value.mostRecent !== null && !validPoint(value.mostRecent))
    ) return null;
    return value as StoredRecovery;
  } catch {
    return null;
  }
};

const storage = (): Storage | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const saveDesignerRecovery = (
  workspace: Pick<DesignerWorkspace, "inputPlacements" | "targetPlacements" | "mostRecent">,
): boolean => {
  const store = storage();
  if (!store) return false;

  const record: StoredRecovery = {
    version: 1,
    inputPlacements: workspace.inputPlacements.map(clonePlacement),
    targetPlacements: workspace.targetPlacements.map(clonePlacement),
    mostRecent: copyPoint(workspace.mostRecent),
  };

  try {
    const current = store.getItem(CURRENT_KEY);
    if (parseRecovery(current)) store.setItem(BACKUP_KEY, current!);
    store.setItem(CURRENT_KEY, JSON.stringify(record));
    return true;
  } catch (error) {
    console.error("[Designer Recovery] Could not save local recovery:", error);
    return false;
  }
};

export const loadDesignerRecovery = (): Omit<StoredRecovery, "version"> | null => {
  const store = storage();
  if (!store) return null;
  try {
    const record = parseRecovery(store.getItem(CURRENT_KEY)) ?? parseRecovery(store.getItem(BACKUP_KEY));
    if (!record) return null;
    return {
      inputPlacements: record.inputPlacements.map(clonePlacement),
      targetPlacements: record.targetPlacements.map(clonePlacement),
      mostRecent: copyPoint(record.mostRecent),
    };
  } catch {
    return null;
  }
};

export const clearDesignerRecovery = (): void => {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(CURRENT_KEY);
    store.removeItem(BACKUP_KEY);
  } catch (error) {
    console.error("[Designer Recovery] Could not clear local recovery:", error);
  }
};
