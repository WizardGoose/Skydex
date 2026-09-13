import { describe, expect, it } from "vitest";
import {
  INITIAL_TARGET_PICKER_STATE,
  targetPickerReducer,
  targetPickerSuggestions,
} from "../targetPickerModel";

const options = Array.from({ length: 32 }, (_, index) => ({
  id: `target-${index}`,
  name: `Target ${index}`,
}));

describe("planner target picker", () => {
  it("offers every eligible target when the field gains focus", () => {
    const suggestions = targetPickerSuggestions(options, new Set(["target-0"]), "");

    expect(suggestions).toHaveLength(31);
    expect(suggestions.some((target) => target.id === "target-0")).toBe(false);
  });

  it("filters typed text without reintroducing a selected target", () => {
    expect(targetPickerSuggestions(options, new Set(["target-12"]), "target 1").map((target) => target.id)).toEqual([
      "target-1",
      "target-10",
      "target-11",
      "target-13",
      "target-14",
      "target-15",
      "target-16",
      "target-17",
      "target-18",
      "target-19",
    ]);
  });

  it("opens, wraps keyboard focus, and closes after selection", () => {
    let state = targetPickerReducer(INITIAL_TARGET_PICKER_STATE, { type: "focus" });
    expect(state).toEqual({ open: true, query: "", focusedIndex: -1 });

    state = targetPickerReducer(state, { type: "navigate", direction: "next", count: 3 });
    expect(state.focusedIndex).toBe(0);
    state = targetPickerReducer(state, { type: "navigate", direction: "previous", count: 3 });
    expect(state.focusedIndex).toBe(2);

    expect(targetPickerReducer(state, { type: "select" })).toEqual({ open: false, query: "", focusedIndex: -1 });
  });

  it("closes when dismissed while preserving an unfinished query", () => {
    expect(targetPickerReducer({ open: true, query: "rose", focusedIndex: 2 }, { type: "dismiss" })).toEqual({
      open: false,
      query: "rose",
      focusedIndex: -1,
    });
  });
});
