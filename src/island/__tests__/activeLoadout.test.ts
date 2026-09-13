import { describe, expect, it } from "vitest";
import { resolveActiveLoadout } from "../activeLoadout";
import type { LoadoutStatement } from "../../networth/parseItems";
import { parseMemberLoadouts } from "../../networth/parseItems";

const loadout = (id: number, overrides: Partial<LoadoutStatement> = {}): LoadoutStatement => ({
  id, name: `Loadout ${id}`, armorSetId: null, equipmentSetId: null,
  petUuid: null, powerStone: null, tuningSlot: null, ...overrides,
});

describe("active equipment-set parsing", () => {
  it("prefers the modern armour wardrobe equipped set and retains the legacy slot fallback", async () => {
    expect((await parseMemberLoadouts({
      inventory: { wardrobe_equipped_slot: 9 },
      loadout: { armor: { equipped_set: 2 } },
    })).equippedArmorSetId).toBe(2);
    expect((await parseMemberLoadouts({ inventory: { wardrobe_equipped_slot: 4 } })).equippedArmorSetId).toBe(5);
    expect((await parseMemberLoadouts({ inventory: { wardrobe_equipped_slot: -1 } })).equippedArmorSetId).toBeNull();
  });

  it("keeps Hypixel's equipped set id and keeps malformed or absent values unknown", async () => {
    expect((await parseMemberLoadouts({ loadout: { equipment: { equipped_set: 4 } } })).equippedEquipmentSetId).toBe(4);
    expect((await parseMemberLoadouts({ loadout: { equipment: { equipped_set: "4" } } })).equippedEquipmentSetId).toBeNull();
    expect((await parseMemberLoadouts({})).equippedEquipmentSetId).toBeNull();
  });

  it("retains an explicitly exposed empty equipment set", async () => {
    const parsed = await parseMemberLoadouts({
      loadout: {
        equipment: {
          "1": { id: 1 },
          "2": { id: 2 },
          equipped_set: 2,
        },
      },
    });
    expect(parsed.equipmentSets.map((set) => set.id)).toEqual([1, 2]);
    expect(parsed.equipmentSets[1].pieces).toEqual([null, null, null, null]);
  });

  it("retains the HotM and HotF preset selected by each saved loadout", async () => {
    const parsed = await parseMemberLoadouts({
      loadout: {
        loadouts: {
          "7": { id: 7, name: "Mines", mining_core_selected_slot: 2 },
          "8": { id: 8, name: "Forest", foraging_core_selected_slot: 3 },
          "9": { id: 9, mining_core_selected_slot: 0, foraging_core_selected_slot: "2" },
        },
      },
    });

    expect(parsed.loadouts[0]).toMatchObject({ miningTreeSlot: 2, foragingTreeSlot: null });
    expect(parsed.loadouts[1]).toMatchObject({ miningTreeSlot: null, foragingTreeSlot: 3 });
    expect(parsed.loadouts[2]).toMatchObject({ miningTreeSlot: null, foragingTreeSlot: null });
  });
});

describe("resolveActiveLoadout", () => {
  it("uses every stated current-state signal to identify one loadout", () => {
    const result = resolveActiveLoadout([
      loadout(1, { petUuid: "pet-a", powerStone: "forceful", equipmentSetId: 2 }),
      loadout(2, { petUuid: "pet-a", powerStone: "forceful", equipmentSetId: 4 }),
    ], { activePetUuid: "pet-a", selectedPower: "FORCEFUL", equippedEquipmentSetId: 4 });
    expect(result?.id).toBe(2);
  });

  it("uses the direct equipped-set pointer even when pet or power changed afterwards", () => {
    const result = resolveActiveLoadout([
      loadout(1, { petUuid: "pet-a", powerStone: "forceful", equipmentSetId: 2, tuningSlot: 1 }),
      loadout(2, { petUuid: "pet-b", powerStone: "slender", equipmentSetId: 4, tuningSlot: 3 }),
    ], { activePetUuid: "pet-new", selectedPower: "itchy", equippedEquipmentSetId: 4 });
    expect(result?.id).toBe(2);
    expect(result?.tuningSlot).toBe(3);
  });

  it("refuses absent, contradictory, and ambiguous signals", () => {
    const entries = [loadout(1, { petUuid: "pet-a", powerStone: "forceful" }), loadout(2, { petUuid: "pet-a", powerStone: "forceful" })];
    expect(resolveActiveLoadout(entries, { activePetUuid: null, selectedPower: null, equippedEquipmentSetId: null })).toBeNull();
    expect(resolveActiveLoadout(entries, { activePetUuid: "pet-a", selectedPower: "forceful", equippedEquipmentSetId: null })).toBeNull();
    expect(resolveActiveLoadout(entries, { activePetUuid: "pet-b", selectedPower: "forceful", equippedEquipmentSetId: null })).toBeNull();
  });
});
