/** The interaction state for the planner's target combobox. */
export interface TargetPickerState {
  open: boolean;
  query: string;
  focusedIndex: number;
}

export type TargetPickerAction =
  | { type: "focus" }
  | { type: "query"; query: string }
  | { type: "navigate"; direction: "next" | "previous"; count: number }
  | { type: "select" }
  | { type: "dismiss" };

export const INITIAL_TARGET_PICKER_STATE: TargetPickerState = {
  open: false,
  query: "",
  focusedIndex: -1,
};

/**
 * Keep the picker lifecycle deterministic outside React so keyboard handling
 * cannot drift from focus, click-outside, and selection behaviour.
 */
export const targetPickerReducer = (state: TargetPickerState, action: TargetPickerAction): TargetPickerState => {
  switch (action.type) {
    case "focus":
      return { ...state, open: true, focusedIndex: -1 };
    case "query":
      return { open: true, query: action.query, focusedIndex: -1 };
    case "navigate": {
      if (action.count <= 0) return { ...state, open: true, focusedIndex: -1 };
      const focusedIndex =
        action.direction === "next"
          ? state.focusedIndex >= action.count - 1
            ? 0
            : state.focusedIndex + 1
          : state.focusedIndex <= 0
            ? action.count - 1
            : state.focusedIndex - 1;
      return { ...state, open: true, focusedIndex };
    }
    case "select":
      return INITIAL_TARGET_PICKER_STATE;
    case "dismiss":
      return { ...state, open: false, focusedIndex: -1 };
  }
};

interface TargetPickerOption {
  id: string;
  name: string;
}

/**
 * The list is intentionally not capped: initial focus must expose every
 * eligible planner target, while the scroll container bounds its footprint.
 */
export const targetPickerSuggestions = <T extends TargetPickerOption>(
  options: readonly T[],
  selectedIds: ReadonlySet<string>,
  query: string
): T[] => {
  const normalized = query.trim().toLocaleLowerCase();
  return options
    .filter((option) => !selectedIds.has(option.id) && (!normalized || option.name.toLocaleLowerCase().includes(normalized)))
    .sort((a, b) => a.name.localeCompare(b.name));
};
