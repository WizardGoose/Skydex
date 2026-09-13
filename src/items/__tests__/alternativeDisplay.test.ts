import { describe, expect, it } from "vitest";
import { alternativeDisplayOptions, alternativeGroupLabel } from "../alternativeDisplay";

describe("alternative ingredient display", () => {
  it("names common material groups generically", () => {
    expect(alternativeGroupLabel(
      { id: "oak_planks", name: "Oak Planks" },
      [{ id: "birch_planks", name: "Birch Planks" }]
    )).toBe("Planks (any type)");
    expect(alternativeGroupLabel(
      { id: "oak_log", name: "Oak Log" },
      [{ id: "birch_log", name: "Birch Log" }]
    )).toBe("Logs (any type)");
  });

  it("keeps irregular groups honest and removes duplicate candidates", () => {
    expect(alternativeGroupLabel(
      { id: "a", name: "A" },
      [{ id: "b", name: "B" }]
    )).toBe("A (any type)");
    expect(alternativeDisplayOptions(
      { id: "a", name: "A" },
      [{ id: "a", name: "A again" }, { id: "b", name: "B" }]
    ).map((option) => option.id)).toEqual(["a", "b"]);
  });
});
