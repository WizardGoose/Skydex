import { describe, expect, it } from "vitest";
import type { Coverage } from "../../../networth/useNetworth";
import { buildInventoryPreviewModel } from "../profileAuxiliaryPreviewModels";

const coverage: Coverage = {
  inventoryShared: true,
  bankShared: true,
  museumShared: true,
  vaultShared: true,
  catalogueLoaded: true,
};

describe("profile inventory sack counters", () => {
  it("renders an API-reported sack item whose known count is zero", () => {
    const model = buildInventoryPreviewModel(
      { sacks: [{ id: "WHEAT", amount: 0 }] },
      coverage,
      {},
      "ready",
    );
    const sacks = model.groups.find((group) => group.source === "sacks");

    expect(sacks?.state).toBe("available");
    expect(sacks?.rows).toMatchObject([
      { hypixelId: "WHEAT", name: "Wheat", count: 0 },
    ]);
  });
});
