import { describe, expect, it } from "vitest";
import { buildCostTree, type Item, type ItemIndex } from "../../items/useItemData";
import type { SectionKey, SectionProvenance } from "../../island/merge";
import { checkStorageIdentity } from "../../island/storageIdentity";
import type { IslandSnapshot } from "../../island/types";
import {
  chooseConnectedProfileHoldings,
  connectedSourceCoverage,
  profileHoldingsFromCachedSnapshot,
  recipeMaterialEntries,
} from "../inventory";
import { catalogueMinionProfile } from "../profile";

const item = (name: string, recipe: Item["recipe"] = null): Item => ({
  name,
  hypixelId: name.toUpperCase().replace(/ /g, "_"),
  tier: null,
  category: null,
  npcSell: null,
  yields: 1,
  recipe,
});

const allAbsentSections = (): Record<SectionKey, SectionProvenance> => Object.fromEntries(
  (["sacks", "chests", "inventory", "enderChest", "storage"] as const)
    .map((key) => [key, { state: "absent", source: null, at: null }]),
) as Record<SectionKey, SectionProvenance>;

describe("WebMCP functional corrections", () => {
  it("selects an identity-matched profile cache without replacing a mounted source", () => {
    const cachedRaw = {
      identity: "profile:one",
      fetchedAt: 1_234,
      items: {
        sacks: [{ id: "WHEAT", amount: 0 }],
        inventory: [],
        enderchest: [],
        storage: [],
      },
      coverage: {
        inventoryShared: false,
        sacksShared: true,
        vaultShared: false,
        museumShared: false,
      },
    };
    const cached = profileHoldingsFromCachedSnapshot(cachedRaw, "profile:one");
    expect(cached).toMatchObject({
      fetchedAt: 1_234,
      items: { sacks: [{ id: "WHEAT", amount: 0 }] },
    });
    expect(profileHoldingsFromCachedSnapshot(cachedRaw, "profile:other")).toBeNull();
    expect(profileHoldingsFromCachedSnapshot({
      ...cachedRaw,
      items: { ...cachedRaw.items, inventory: ["malformed-row"] },
    }, "profile:one")).toBeNull();

    const mounted = { ...cached!, fetchedAt: 5_678 };
    expect(chooseConnectedProfileHoldings(mounted, cached)).toBe(mounted);
    expect(chooseConnectedProfileHoldings(null, cached)).toBe(cached);

    const coverage = connectedSourceCoverage(
      { snapshot: null, sections: allAbsentSections() },
      {
        parsed: cached!.items,
        inventoryShared: cached!.coverage.inventoryShared,
        sacksShared: cached!.coverage.sacksShared,
        vaultShared: cached!.coverage.vaultShared,
        museumShared: cached!.coverage.museumShared,
        fetchedAt: cached!.fetchedAt,
      },
    );
    expect(coverage.sacks).toMatchObject({ state: "captured", source: "api" });
    expect(coverage.inventory).toMatchObject({ state: "absent", source: null });
  });

  it("withholds a cached profile's island feed when identity is missing or mismatched", () => {
    const matchingSnapshot = {
      player: { uuid: "1234-ABCD", name: "Wizard" },
      profile: { name: "Apple" },
    } as unknown as IslandSnapshot;
    const expected = {
      playerUuids: ["1234abcd", "1234-abcd"],
      profileName: "Apple",
      hasConnectedAccount: true,
    };

    expect(checkStorageIdentity(matchingSnapshot, expected).state).toBe("match");
    expect(checkStorageIdentity({
      ...matchingSnapshot,
      player: { ...matchingSnapshot.player, uuid: "" },
    }, expected).state).toBe("unknown");
    expect(checkStorageIdentity({
      ...matchingSnapshot,
      profile: { ...matchingSnapshot.profile, name: "" },
    }, expected).state).toBe("unknown");
    expect(checkStorageIdentity({
      ...matchingSnapshot,
      player: { ...matchingSnapshot.player, uuid: "different" },
    }, expected).state).toBe("mismatch");
    expect(checkStorageIdentity(matchingSnapshot, {
      playerUuids: [],
      hasConnectedAccount: false,
    }).hasExpectedIdentity).toBe(false);
  });

  it("uses the selected normal or Ironman tree and reserves held intermediates once", () => {
    const items: ItemIndex = {
      target: item("Target", [{ id: "intermediate", name: "Intermediate", qty: 1 }]),
      intermediate: item("Intermediate", [{ id: "raw", name: "Raw", qty: 2 }]),
      raw: item("Raw"),
    };
    const normalCostTree = buildPlanningTree(items, false);
    expect(recipeMaterialEntries(normalCostTree, items, {
      count: (id) => id === "intermediate" ? 1 : undefined,
    })).toEqual([
      { key: "target", name: "Target", required: 1, owned: null, missing: null },
    ]);

    const ironmanCostTree = buildPlanningTree(items, true);
    expect(recipeMaterialEntries(
      ironmanCostTree,
      items,
      { count: (id) => id === "intermediate" ? 1 : undefined },
    )).toEqual([]);
  });

  it("keeps explicit zero and unknown material counts distinct", () => {
    const items: ItemIndex = {
      target: item("Target", [{ id: "raw", name: "Raw", qty: 2 }]),
      raw: item("Raw"),
    };
    const tree = buildPlanningTree(items, true);

    expect(recipeMaterialEntries(tree, items, { count: (id) => id === "raw" ? 0 : undefined })).toEqual([
      { key: "raw", name: "Raw", required: 2, owned: 0, missing: 2 },
    ]);
    expect(recipeMaterialEntries(tree, items, { count: () => undefined })).toEqual([
      { key: "raw", name: "Raw", required: 2, owned: null, missing: null },
    ]);
  });

  it("applies the shipped minion catalogue before reporting recognized and unmapped families", () => {
    const profile = catalogueMinionProfile({
      available: true,
      highestByFamily: { mithril: 4, new_family: 1 },
      raw: ["MITHRIL_4", "NEW_FAMILY_1"],
      unmapped: [],
    });

    expect(profile.highestByFamily).toEqual({ mithril: 4 });
    expect(profile.unmapped).toEqual(["NEW_FAMILY_1"]);
  });
});

const buildPlanningTree = (items: ItemIndex, ironman: boolean) => {
  return buildCostTree("target", 1, items, ironman ? {} : {
    TARGET: { buy: 1, sell: 1 },
    INTERMEDIATE: { buy: 999, sell: 1 },
    RAW: { buy: 1, sell: 1 },
  }, ironman);
};
