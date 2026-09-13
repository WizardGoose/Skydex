import { describe, expect, it } from "vitest";
import { skyBlockStatPresentation } from "../utilityFunctions";

describe("skyBlockStatPresentation", () => {
  it("gives every active accessory bonus a semantic icon and colour", () => {
    const expected = [
      "Alchemy Wisdom",
      "Cactus Fortune",
      "Cocoa Beans Fortune",
      "Crafting Fortune",
      "Fear",
      "Gemstone Fortune",
      "Health Regeneration",
      "Helix Fortune",
      "Melon Fortune",
      "Mushroom Fortune",
      "Nether Stalk Fortune",
      "Potato Fortune",
      "Pumpkin Fortune",
      "Rift Health",
      "Sugar Cane Fortune",
      "Walk Speed",
      "Wheat Fortune",
    ];

    for (const label of expected) {
      expect(skyBlockStatPresentation(label), label).not.toBeNull();
    }
    expect(skyBlockStatPresentation("Fear")).toEqual({
      glyph: "☠",
      colorClass: "text-stat-dark-purple",
      percent: false,
    });
    expect(skyBlockStatPresentation("Walk Speed")).toEqual({
      glyph: "✦",
      colorClass: "text-stat-white",
      percent: false,
    });
    expect(skyBlockStatPresentation("Rift Health")).toEqual({
      glyph: "❤",
      colorClass: "text-stat-red",
      percent: false,
    });
  });
});
