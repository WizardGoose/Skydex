import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NetworthPanel } from "../NetworthPanel";
import { setSourcesForTesting } from "../useNetworth";
import { CATEGORY_ORDER, categoryLabel, coins, exactCoins, modifierLabel } from "../format";
import { TEST_CATALOGUE, TEST_PRICES } from "./testPrices";
import itemFixture from "./fixtures/items.json";
import petFixture from "./fixtures/pets.json";
import type { PetData, RawItem } from "../types";
import type { SectionProvenance } from "../../island/merge";
import type { IslandChest } from "../../island/types";

/**
 * The panel renders, and it renders the honest thing when there is nothing to
 * show.
 *
 * Rendered to static markup rather than mounted, because the whole suite runs
 * in a Node environment and adding jsdom to prove a component does not throw
 * would be a dependency bought for one assertion. Static rendering runs the
 * component body, which is where every branch that could produce a NaN or a
 * misleading zero lives; effects do not run, so nothing here touches the
 * network.
 *
 * `currentAccess()` reads a localStorage that does not exist in this
 * environment, so the store lands on its blank record and the panel takes the
 * "no connected account" path. That is exactly the path a new visitor sees.
 */

const ABSENT: SectionProvenance = { state: "absent", source: null, at: null };
const CAPTURED: SectionProvenance = { state: "captured", source: "mod", at: Date.now() };

describe("the Networth panel", () => {
  // Wrapped in a router because the panel points at the Settings page, which
  // is the whole answer it gives somebody with no connected account.
  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(NetworthPanel, { chests: [], chestProvenance: ABSENT }))
  );

  it("renders without throwing", () => {
    expect(markup.length).toBeGreaterThan(0);
  });

  it("says what is missing and how to get it, rather than showing a zero", () => {
    expect(markup).toContain("connected Minecraft account");
    expect(markup).toContain('href="/?settings=1&amp;settingsSection=hypixel"');
  });

  it("never renders NaN", () => {
    expect(markup).not.toContain("NaN");
  });

  it("does not claim a total it has not earned", () => {
    // No account means no profile, so there must be no Total line at all
    // rather than a Total of zero.
    expect(markup).not.toContain(">Total<");
  });

  it("describes the shared production connection without asking for a key", () => {
    expect(markup).toContain("shared Hypixel connection");
    expect(markup).not.toContain("API key");
    expect(markup).not.toContain("api.hypixel.net");
  });
});

describe("the Networth panel with numbers in it", () => {
  const CHESTS: IslandChest[] = [
    {
      pos: [10, 70, -4],
      name: "Chest",
      lastSeen: Date.now() - 60_000,
      items: [{ id: "HYPERION", name: "Hyperion", count: 1, extra: { reforge: "Fabled", stars: 5 } }],
    },
  ];

  setSourcesForTesting({
    items: {
      inventory: [structuredClone(itemFixture.items.recombobulated) as unknown as RawItem],
      sacks: [{ id: "WHEAT", amount: 1_000_000 }],
      pets: [petFixture.pets.withHeldItem as unknown as PetData],
      // Present and genuinely empty, which must not read like "not shared".
      museum: [],
    },
    coins: { purse: 10_763_000, bank: 0, personalBank: 12_500_000 },
    prices: TEST_PRICES,
    catalogue: TEST_CATALOGUE,
    coverage: {
      inventoryShared: true,
      // Off, so the panel has to show a dash rather than a confident zero.
      bankShared: false,
      museumShared: false,
      vaultShared: true,
      catalogueLoaded: true,
    },
  });

  const markup = renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(NetworthPanel, { chests: CHESTS, chestProvenance: CAPTURED }))
  );

  it("renders the two headline totals and the three coin lines", () => {
    for (const label of ["Total", "Unsoulbound", "Purse", "Co-op bank", "Personal bank"]) {
      expect(markup).toContain(label);
    }
  });

  it("lists our own Island Chests category alongside the API ones", () => {
    expect(markup).toContain("Island Chests");
    expect(markup).toContain("Inventory");
    expect(markup).toContain("Sacks");
    expect(markup).toContain("Pets");
  });

  it("marks island chests as mod data and the rest as API data", () => {
    expect(markup).toContain(">mod<");
    expect(markup).toContain(">API<");
  });

  it("shows a dash for a bank Hypixel will not share, not a zero", () => {
    expect(markup).toContain(">-<");
    expect(markup).toContain("co-op bank is not shared");
  });

  it("carries the honesty note about island chests, without needing anything expanded", () => {
    // Not behind a disclosure. This category shares a total with categories
    // built from full item data and the difference has to be readable.
    expect(markup).toContain("valued conservatively");
  });

  it("names the ruleset the numbers came from", () => {
    expect(markup).toContain("SkyHelper-Networth");
  });

  it("never renders NaN or an undefined", () => {
    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("undefined");
  });

  it("puts the exact figure behind every abbreviated one", () => {
    expect(markup).toContain('coins"');
  });
});

describe("coin formatting", () => {
  it("abbreviates by magnitude", () => {
    expect(coins(840)).toBe("840");
    expect(coins(12_400)).toBe("12.4k");
    expect(coins(470_000_000)).toBe("470M");
    expect(coins(1_250_000_000)).toBe("1.25B");
    expect(coins(1_248_391_698_079)).toBe("1248B");
  });

  it("keeps a negative sign, because pet candy is a subtraction", () => {
    expect(coins(-5_000_000)).toBe("-5.0M");
  });

  it("refuses to render a number that is not one", () => {
    expect(coins(Number.NaN)).toBe("-");
    expect(coins(Number.POSITIVE_INFINITY)).toBe("-");
    expect(exactCoins(Number.NaN)).toBe("unknown");
  });

  it("keeps the exact figure available behind the abbreviation", () => {
    expect(exactCoins(1_250_000_000)).toBe("1,250,000,000 coins");
  });
});

describe("labels", () => {
  it("uses Canadian armour labels in the Profile networth breakdown", () => {
    expect(categoryLabel("armor")).toBe("Armour");
    expect(categoryLabel("wardrobe")).toBe("Saved Armour");
  });

  it("names every category the engine can produce", () => {
    // A category with no label would render as a raw key, which reads as a bug.
    for (const key of CATEGORY_ORDER) {
      expect(categoryLabel(key)).not.toBe(key);
    }
  });

  it("falls back readably for a category nobody has named yet", () => {
    expect(categoryLabel("some_new_bag")).toBe("Some New Bag");
  });

  it("turns a modifier id into words", () => {
    expect(modifierLabel("RECOMBOBULATOR_3000")).toBe("Recombobulator");
    expect(modifierLabel("STAR")).toBe("Dungeon star");
    expect(modifierLabel("SOMETHING_NEW")).toBe("Something New");
  });
});
