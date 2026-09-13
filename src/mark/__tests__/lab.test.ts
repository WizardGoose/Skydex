import { describe, expect, it } from "vitest";
import { YAWN_TOTAL_MS } from "../face";
import { WONDER_LAB_PREVIEWS } from "../lab";

describe("Wonder's private motion board", () => {
  it("shows every expression needed for side-by-side tuning", () => {
    const states = new Set(WONDER_LAB_PREVIEWS.flatMap((preview) => preview.steps.map((step) => step.force)));
    expect(states).toEqual(new Set(["sleeping", "alert", "thinking", "petted", "rest", "blink", "satisfied", "yawn"]));
  });

  it("uses unique cards and positive replay timings", () => {
    const ids = WONDER_LAB_PREVIEWS.map((preview) => preview.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(WONDER_LAB_PREVIEWS.every((preview) => preview.steps.every((step) => step.ms > 0))).toBe(true);
  });

  it("exposes each new personality clip alone and together in the ambient mix", () => {
    const personality = WONDER_LAB_PREVIEWS.filter((preview) => preview.group === "personality");
    const rigs = new Set(
      personality.flatMap((preview) => preview.steps.map((step) => step.personality ?? step.rig))
    );
    expect(personality.map((preview) => preview.id)).toEqual(["curious", "perk", "fidget", "stretch", "ambient"]);
    expect(rigs).toEqual(new Set(["curious", "perk", "fidget", "stretch", "attentive"]));
  });

  it("lets the forced yawn play for the face's complete authored duration", () => {
    const yawn = WONDER_LAB_PREVIEWS.find((preview) => preview.id === "yawn");
    expect(yawn?.steps.find((step) => step.force === "yawn")?.ms).toBe(YAWN_TOTAL_MS);
  });
});
