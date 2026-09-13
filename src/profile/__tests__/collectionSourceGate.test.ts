import { describe, expect, it } from "vitest";
import {
  collectionSourceGateFor,
  resolveCollectionSourceGate,
  tradingAllowedForGameMode,
} from "../collectionSourceGate";

const progress = (blaze: number | null) => ({
  slayerLevels: blaze === null ? null : { blaze },
  trophyFish: null,
  skillLevels: null,
});

describe("collection source gates", () => {
  it("records Chili Pepper's Inferno Minion requirement from profile progress", () => {
    const gate = collectionSourceGateFor("CHILI_PEPPER", progress(0));
    expect(gate).toMatchObject({
      sourceName: "Inferno Minion",
      requirementLabel: "Inferno 3",
      tradeable: true,
      requirement: {
        kind: "slayer",
        target: "Inferno Demonlord Slayer",
        threshold: "3",
        state: "unmet",
        have: "0",
      },
    });
  });

  it("uses trade on a normal profile without pretending the Slayer requirement is met", () => {
    const gate = collectionSourceGateFor("CHILI_PEPPER", progress(0));
    expect(resolveCollectionSourceGate(gate, true)).toMatchObject({
      state: "available",
      route: "trade",
      label: "Inferno 3 or trade",
    });
    expect(gate?.requirement.state).toBe("unmet");
  });

  it("requires progression when trading is unavailable", () => {
    const gate = collectionSourceGateFor("CHILI_PEPPER", progress(0));
    expect(resolveCollectionSourceGate(gate, false)).toMatchObject({
      state: "locked",
      route: null,
      label: "Requires Inferno 3",
    });
  });

  it("does not guess when neither Slayer progress nor a trading route is known", () => {
    const gate = collectionSourceGateFor("CHILI_PEPPER", progress(null));
    expect(resolveCollectionSourceGate(gate, false)).toMatchObject({
      state: "unknown",
      label: "Check Inferno 3",
    });
  });

  it("recognizes a completed prerequisite and leaves ordinary collections ungated", () => {
    const gate = collectionSourceGateFor("CHILI_PEPPER", progress(3));
    expect(resolveCollectionSourceGate(gate, false)).toMatchObject({ state: "available", route: "progression" });
    expect(collectionSourceGateFor("COBBLESTONE", progress(0))).toBeNull();
  });

  it("maps profile modes to route availability without adding a third economy model", () => {
    expect(tradingAllowedForGameMode(null)).toBe(true);
    expect(tradingAllowedForGameMode("ironman")).toBe(false);
    expect(tradingAllowedForGameMode("island")).toBe(false);
    expect(tradingAllowedForGameMode("bingo")).toBeNull();
  });
});
