import { describe, expect, it } from "vitest";
import { petStatProfile } from "../petStats";

describe("petStatProfile", () => {
  it("projects direct stats at the pet's real level", () => {
    expect(petStatProfile("MOOSHROOM_COW", "LEGENDARY", 100)).toMatchObject({
      petType: "Farming Pet",
      stats: [
        { name: "Health", label: "❤ Health", value: 100, formatted: "+100", colorClass: "text-stat-red" },
        { name: "Farming Fortune", label: "☘ Farming Fortune", value: 100, formatted: "+100", colorClass: "text-stat-gold" },
      ],
    });
  });

  it("uses the exact rarity-specific stat table when one exists", () => {
    const rare = petStatProfile("BEE", "RARE", 100);
    const legendary = petStatProfile("BEE", "LEGENDARY", 100);

    expect(rare?.stats.find((stat) => stat.name === "Farming Fortune")?.value).toBe(20);
    expect(legendary?.stats.find((stat) => stat.name === "Farming Fortune")?.value).toBe(30);
    expect(legendary?.stats.find((stat) => stat.name === "Strength")?.value).toBe(30);
    expect(petStatProfile("FROG", "MYTHIC", 100)?.stats.at(-1)).toMatchObject({
      name: "Trophy Chance",
      label: "♔ Trophy Chance",
      formatted: "+5%",
      colorClass: "text-stat-gold",
    });
  });

  it("projects the rarity-specific ability set and level values from the official pet table", () => {
    const frog = petStatProfile("FROG", "MYTHIC", 100);
    expect(frog?.abilities.map((ability) => ability.name)).toEqual([
      "Hunting Enjoyer",
      "Hop",
      "Happy Tree Friends",
      "Home Sweet Home",
    ]);
    expect(frog?.abilities.at(-1)?.description).toContain("§a10%§7");
    expect(frog?.abilities.at(-1)?.description).toContain("Trophy Frogs");
    expect(frog?.abilities.some((ability) => /\{\d+\}/.test(ability.description))).toBe(false);

    const cow = petStatProfile("MOOSHROOM_COW", "LEGENDARY", 100);
    expect(cow?.abilities).toHaveLength(3);
    expect(cow?.abilities.at(-1)).toMatchObject({ name: "Bovine Blessing" });
    expect(cow?.abilities.at(-1)?.description).toContain("§a+0.02% §7");
  });

  it("does not invent stats for an unknown pet or unknown level", () => {
    expect(petStatProfile("FUTURE_BEAST", "MYTHIC", 100)).toBeNull();
    expect(petStatProfile("BEE", "LEGENDARY", null)).toBeNull();
  });
});
