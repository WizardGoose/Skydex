import { describe, expect, it } from "vitest";
import { computeFolds } from "../dedup";
import { buildChainIndex } from "../chains";
import { buildAccessoryCatalogue, accessoriesFromIndex } from "../catalogue";
import { buildCollectionKeys, NO_COLLECTIONS } from "../collections";
import { composeSnapshot } from "../useAccessories";
import type { ChainIndex } from "../chains";
import type { ItemIndex } from "../../items/useItemData";

/**
 * The family fold, which is the fix for the reported layout complaint: "Get
 * now" listed every rung of every line as its own card, so a twenty-nine rung
 * badge line was twenty-nine tiles for one errand. Within one line the missing
 * sections show only the lowest rung still needed; everything above folds
 * behind it and stays reachable through the toggle.
 */

/** A five rung line, transitive, the shape buildChainIndex produces. */
const LINE: ChainIndex = {
  R2: ["R1"],
  R3: ["R1", "R2"],
  R4: ["R1", "R2", "R3"],
  R5: ["R1", "R2", "R3", "R4"],
};

describe("computeFolds", () => {
  it("folds everything above the lowest missing rung", () => {
    const missing = new Set(["R1", "R2", "R3", "R4", "R5"]);
    const { foldedBehind, foldedAbove } = computeFolds(missing, LINE);

    // One visible tile for the whole line: the base.
    expect(foldedBehind.has("R1")).toBe(false);
    for (const id of ["R2", "R3", "R4", "R5"]) expect(foldedBehind.get(id)).toBe("R1");
    // The ascent, shallowest first, so the hover card reads as the climb.
    expect(foldedAbove.get("R1")).toStrictEqual(["R2", "R3", "R4", "R5"]);
  });

  it("moves the next step up as the player climbs", () => {
    // Owning the bottom two rungs leaves rung three as the actual next step.
    const missing = new Set(["R3", "R4", "R5"]);
    const { foldedBehind, foldedAbove } = computeFolds(missing, LINE);

    expect(foldedBehind.has("R3")).toBe(false);
    expect(foldedBehind.get("R4")).toBe("R3");
    expect(foldedBehind.get("R5")).toBe("R3");
    expect(foldedAbove.get("R3")).toStrictEqual(["R4", "R5"]);
  });

  it("folds nothing when only one rung of the line is missing", () => {
    const { foldedBehind } = computeFolds(new Set(["R5"]), LINE);
    expect(foldedBehind.size).toBe(0);
  });

  it("leaves unrelated accessories alone", () => {
    const { foldedBehind } = computeFolds(new Set(["R1", "R2", "LONE_WOLF"]), LINE);
    expect(foldedBehind.has("LONE_WOLF")).toBe(false);
    expect(foldedBehind.get("R2")).toBe("R1");
  });

  it("terminates and stays sane on a cyclic index", () => {
    // Wiki data is edited by anyone, so the fold has to survive a cycle. In a
    // two-member cycle each id is "beneath" the other, so neither is a next
    // step by the definition; the honest outcome is that neither folds, which
    // shows both rather than losing one.
    const cyclic: ChainIndex = { A: ["B"], B: ["A"] };
    const { foldedBehind } = computeFolds(new Set(["A", "B"]), cyclic);
    expect(foldedBehind.size).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Through composeSnapshot, where the counts the header shows are made        */
/* -------------------------------------------------------------------------- */

const item = (name: string, id: string, tier: string) => ({
  name,
  hypixelId: id,
  tier,
  category: "ACCESSORY",
  npcSell: null,
  yields: 1,
  recipe: null,
});

/*
 * A three rung line plus a loner, chained by id the way the NEU source or the
 * stem supplement would state it.
 */
const index: ItemIndex = {
  camp1: item("Campfire Badge I", "CAMPFIRE_1", "COMMON"),
  camp2: item("Campfire Badge II", "CAMPFIRE_2", "UNCOMMON"),
  camp3: item("Campfire Badge III", "CAMPFIRE_3", "RARE"),
  wolf: item("Wolf Paw", "WOLF_PAW", "COMMON"),
};

const catalogue = buildAccessoryCatalogue(accessoriesFromIndex(index), index);
const keys = buildCollectionKeys(index);
const chains = buildChainIndex([], catalogue, [
  { fromId: "CAMPFIRE_1", toId: "CAMPFIRE_2" },
  { fromId: "CAMPFIRE_2", toId: "CAMPFIRE_3" },
]);

const snapshotFor = (owned: string[] | null) =>
  composeSnapshot(catalogue, owned, {}, NO_COLLECTIONS, keys, false, null, undefined, chains);

const find = (snap: ReturnType<typeof composeSnapshot>, id: string) =>
  snap.entries.find((e) => e.id === id)!;

describe("composeSnapshot folding", () => {
  it("marks the higher rungs folded behind the next step, with the list on it", () => {
    const snap = snapshotFor([]);

    const base = find(snap, "CAMPFIRE_1");
    expect(base.foldedBehind).toBeNull();
    expect(base.foldedHigher.map((r) => r.id)).toStrictEqual(["CAMPFIRE_2", "CAMPFIRE_3"]);
    // Carried with name and tier so the hover card can colour them.
    expect(base.foldedHigher[0]).toStrictEqual({ id: "CAMPFIRE_2", name: "Campfire Badge II", tier: "UNCOMMON" });

    expect(find(snap, "CAMPFIRE_2").foldedBehind).toBe("CAMPFIRE_1");
    expect(find(snap, "CAMPFIRE_3").foldedBehind).toBe("CAMPFIRE_1");
    expect(find(snap, "WOLF_PAW").foldedBehind).toBeNull();
  });

  it("counts next steps against rungs, which is the header's honesty", () => {
    const snap = snapshotFor([]);
    // Four missing rungs, but only two things to actually go and do.
    // This synthetic wiki catalogue has no measured acquisition gate, so the
    // conservative classifier keeps it in review instead of claiming "now".
    expect(snap.reachCounts.unknownReach).toBe(4);
    expect(snap.nextStepCounts.unknownReach).toBe(2);
    expect(snap.foldedCount).toBe(2);
  });

  it("moves the fold up as the player climbs, and covers the rungs below", () => {
    const snap = snapshotFor(["CAMPFIRE_1"]);

    const second = find(snap, "CAMPFIRE_2");
    expect(second.status).toBe("missing");
    expect(second.foldedBehind).toBeNull();
    expect(second.foldedHigher.map((r) => r.id)).toStrictEqual(["CAMPFIRE_3"]);
    expect(find(snap, "CAMPFIRE_3").foldedBehind).toBe("CAMPFIRE_2");
  });

  it("claims nothing without a bag", () => {
    /*
     * Folding says "this is not your next step", which is a claim about the
     * player, so an unreadable bag means no folds at all and the deduped
     * counts equal the rung counts.
     */
    const snap = snapshotFor(null);
    expect(snap.entries.every((e) => e.foldedBehind === null && e.foldedHigher.length === 0)).toBe(true);
    expect(snap.foldedCount).toBe(0);
    expect(snap.nextStepCounts).toStrictEqual(snap.reachCounts);
    expect(snap.magicalPower).toBeNull();
  });
});
