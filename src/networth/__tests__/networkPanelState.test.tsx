import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NetworthPanel } from "../NetworthPanel";
import { setSourcesForTesting } from "../useNetworth";

const panel = () =>
  renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(NetworthPanel, { chests: [], chestProvenance: { state: "absent", source: null, at: null } }))
  );

describe("Network panel loading state", () => {
  it("keeps a truthful loading state while a profile snapshot is pending", () => {
    setSourcesForTesting({
      items: {},
      coins: { purse: 0, bank: 0, personalBank: 0 },
      prices: {},
      catalogue: {},
      coverage: {
        inventoryShared: true,
        bankShared: true,
        museumShared: true,
        vaultShared: true,
        catalogueLoaded: false,
      },
      status: "loading",
    });
    expect(panel()).toContain('data-network-tool="true"');
    expect(panel()).toContain("no prices yet");
    expect(panel()).toContain("Catalogue partial");
  });
});
