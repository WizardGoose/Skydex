import { describe, expect, it } from "vitest";
import type { SkillDef } from "../../island/skills";
import {
  davidCloakFortuneFromAttributeStacks,
  deriveHunterFortune,
  hunterFortuneFromItem,
  readAttributeStackCount,
  readPlainShardSignals,
  selectHunterFortuneEquipment,
  summarizeHunterFortuneItems,
  type ShardProfileSignals,
} from "../profileAssumptions";

const hunting: SkillDef = {
  key: "HUNTING",
  name: "Hunting",
  maxLevel: 5,
  thresholds: [50, 150, 300, 500, 750],
};

const item = (id: string, name: string, lore: string) => ({
  tag: { ExtraAttributes: { id }, display: { Name: name, Lore: [lore] } },
});

describe("shard profile assumptions", () => {
  it("reads Hunting, enabled Hunter's Luck, and the highest completed Kuudra tier", () => {
    expect(readPlainShardSignals({
      player_data: { experience: { SKILL_HUNTING: 320 } },
      skill_tree: { nodes: { foraging: { hunters_luck: 7, toggle_hunters_luck: true } } },
      nether_island_player_data: { kuudra_completed_tiers: { basic: 4, burning: 1, infernal: 0 } },
      attributes: { stacks: { one: 20, two: "30", broken: null } },
    })).toEqual({ huntingXp: 320, huntersLuck: 7, kuudraTier: "t3", attributeStacks: 50 });
  });

  it("treats a disabled Hunter's Luck node as zero and absent profile sections as unknown", () => {
    expect(readPlainShardSignals({ skill_tree: { nodes: { foraging: { hunters_luck: 9, toggle_hunters_luck: false } } } }).huntersLuck).toBe(0);
    expect(readPlainShardSignals({})).toEqual({ huntingXp: null, huntersLuck: null, kuudraTier: null, attributeStacks: null });
  });

  it("derives David's Cloak Fortune from total profile attribute stacks", () => {
    expect(readAttributeStackCount({ attributes: { stacks: { first: 2_000, second: 500, invalid: -4 } } })).toBe(2_500);
    expect(davidCloakFortuneFromAttributeStacks(2_499)).toBe(25);
    expect(davidCloakFortuneFromAttributeStacks(2_500)).toBe(26);
    expect(davidCloakFortuneFromAttributeStacks(5_000)).toBe(30);
  });

  it("reads both lore spellings and counts only the strongest Kuudra Core", () => {
    expect(hunterFortuneFromItem(item("HUNTERS_CAPE", "Hunter's Cape", "§aHunter Fortune: +12"))).toBe(12);
    expect(hunterFortuneFromItem(item("CORE", "Core", "§6+8 ☘ Hunter Fortune"))).toBe(8);
    expect(summarizeHunterFortuneItems(
      [item("HUNTERS_CAPE", "Hunter's Cape", "Hunter Fortune: +12")],
      [item("KUUDRA_CORE_BASIC", "Basic Core", "+2 Hunter Fortune"), item("KUUDRA_CORE_INFERNAL", "Infernal Core", "+10 Hunter Fortune")],
    )).toMatchObject({ available: true, total: 22, davidCloakEquipped: false });
  });

  it("reads renamed Hunting Fortune without adding the parenthesized reforge twice", () => {
    expect(hunterFortuneFromItem(item("SAFARI_BELT", "Majestic Safari Belt", "§aHunting Fortune: §f+23 §9(+3)"))).toBe(23);
    expect(hunterFortuneFromItem(item("CORE", "Core", "+2.5 \uE05B Hunting Fortune"))).toBe(2.5);
    expect(selectHunterFortuneEquipment([
      [item("DAVIDS_CLOAK", "David's Cloak", ""), item("SAFARI_BELT", "Majestic Safari Belt", "Hunting Fortune: +23 (+3)")],
      [item("SAFARI_BELT", "Safari Belt", "Hunting Fortune: +30")],
    ], 5_000)).toMatchObject({ total: 23, davidCloakEquipped: true });
  });

  it("detects David's Cloak by canonical name without expecting its milestone Fortune in display lore", () => {
    expect(summarizeHunterFortuneItems(
      [item("FUTURE_ITEM_ID", "David's Cloak", "The more you Hunt, the stronger this cloak gets!")],
      [],
    )).toEqual({ available: true, total: 0, parts: [], davidCloakEquipped: true });
  });

  it("uses the strongest complete owned equipment set instead of the currently worn set only", () => {
    const selected = selectHunterFortuneEquipment([
      [item("TROPICAL_CLOAK", "Tropical Cloak", "+4 Fishing Speed")],
      [item("DAVIDS_CLOAK", "David's Cloak", "The more you Hunt, the stronger this cloak gets!")],
      [item("HUNTERS_CAPE", "Hunter's Cape", "+12 Hunter Fortune")],
    ], 5_000);
    expect(selected).toMatchObject({ total: 0, davidCloakEquipped: true });
  });

  it("combines profile, gear, and echoed Hunter's Karma only when every profile signal is available", () => {
    const signals: ShardProfileSignals = {
      huntingXp: 320,
      huntersLuck: 7,
      kuudraTier: "t3",
      attributeStacks: 2_500,
      itemFortune: { available: true, total: 12, parts: [{ label: "Infernal Kuudra Core", value: 12 }], davidCloakEquipped: true },
    };
    const derived = deriveHunterFortune(signals, hunting, 10, 10, 10);
    expect(derived.parts.map((part) => part.label)).toEqual(["Hunting level", "Hunter's Luck", "David's Cloak", "Infernal Kuudra Core", "Hunter's Karma"]);
    expect(derived.value).toBeCloseTo(3 + 7 + 26 + 12 + 13);
    expect(deriveHunterFortune({ ...signals, itemFortune: { available: false, total: 0, parts: [], davidCloakEquipped: false } }, hunting, 0, 0, 0)).toMatchObject({ value: null });
  });

  it("caps permanent Hunting and Hunter's Luck Fortune at their in-game limits", () => {
    const expandedHunting: SkillDef = {
      key: "HUNTING",
      name: "Hunting",
      maxLevel: 50,
      thresholds: Array.from({ length: 50 }, (_, index) => index + 1),
    };
    const derived = deriveHunterFortune({
      huntingXp: 10_000,
      huntersLuck: 80,
      kuudraTier: "t1",
      attributeStacks: 0,
      itemFortune: { available: true, total: 0, parts: [], davidCloakEquipped: false },
    }, expandedHunting, 0, 0, 0);

    expect(derived.parts).toEqual([
      { label: "Hunting level", value: 50 },
      { label: "Hunter's Luck", value: 50 },
    ]);
    expect(derived.value).toBe(100);
  });
});
