import { describe, expect, it } from "vitest";
import { readUnlockedLoadoutSlots } from "../loadoutEntitlements";
import type { LoadoutStatement } from "../parseItems";

const loadout = (id: number, configured = false): LoadoutStatement => ({
  id,
  name: configured ? `Custom ${id}` : `Loadout ${id}`,
  armorSetId: configured ? id : null,
  equipmentSetId: null,
  petUuid: null,
  powerStone: null,
  tuningSlot: null,
});

const slots = Array.from({ length: 18 }, (_, index) => loadout(index + 1));

describe("loadout slot entitlements", () => {
  it("does not call a slot locked when profile-level upgrade data is absent", () => {
    expect(readUnlockedLoadoutSlots(null, slots)).toBeNull();
  });

  it("uses the twelve-slot base when no additional tier was claimed", () => {
    expect(readUnlockedLoadoutSlots({ upgrade_states: [] }, slots)).toBe(12);
  });

  it("adds only claimed general loadout tiers", () => {
    expect(readUnlockedLoadoutSlots({
      upgrade_states: [
        { upgrade: "loadout_slots", tier: 1, claimed_ms: 1_000 },
        { upgrade: "loadout_slots", tier: 2, started_ms: 2_000 },
        { upgrade: "hotm_loadout_slots", tier: 6, claimed_ms: 3_000 },
      ],
    }, slots)).toBe(13);
  });

  it("never locks a slot the profile has demonstrably configured", () => {
    const statements = slots.map((statement) => statement.id === 14 ? loadout(14, true) : statement);
    expect(readUnlockedLoadoutSlots({ upgrade_states: [] }, statements)).toBe(14);
  });
});
