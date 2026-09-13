import { describe, expect, it } from "vitest";
import { wardrobePresentation } from "../wardrobePresentation";

describe("wardrobePresentation", () => {
  it("gives Armour and Equipment the same three-page, twenty-seven-set structure", () => {
    const armour = wardrobePresentation("armour");
    const equipment = wardrobePresentation("equipment");

    expect(armour.capacity).toBe(27);
    expect(equipment.capacity).toBe(27);
    expect(armour.pages).toEqual(["Page 1", "Page 2", "Page 3"]);
    expect(equipment.pages).toEqual(armour.pages);
  });

  it("names all real slot categories for the slot-specific empty silhouettes", () => {
    expect(wardrobePresentation("armour").slots.map((slot) => slot.label)).toEqual([
      "Helmet",
      "Chestplate",
      "Leggings",
      "Boots",
    ]);
    expect(wardrobePresentation("equipment").slots.map((slot) => slot.label)).toEqual([
      "Necklace",
      "Cloak",
      "Belt",
      "Gloves or Bracelets",
    ]);
  });
});
