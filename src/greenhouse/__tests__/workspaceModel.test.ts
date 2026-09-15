import { describe, expect, it } from "vitest";
import {
  countProfileContainer,
  goalChoiceKey,
  goalQuantityForPlotCapacity,
  goalWorkRemaining,
  mutationCapacity,
  normalisePlotInteractionMode,
  rankGoalChoices,
  selectPlanField,
  targetFieldId,
  unmetFiniteMutationGoals,
} from "../workspaceModel";
import type { MutationDefinition } from "../types/greenhouse";

describe("greenhouse workspace goal shelf", () => {
  const choices = [
    { id: "zeta", kind: "item" as const, name: "Zeta Relic" },
    { id: "choconut", kind: "mutation" as const, name: "Choconut" },
    { id: "ashwreath", kind: "mutation" as const, name: "Ashwreath" },
  ];

  it("keeps every choice while putting local history first", () => {
    const ranked = rankGoalChoices(choices, ["greenhouse:choconut"], "");
    expect(ranked.map(goalChoiceKey)).toEqual([
      "greenhouse:choconut",
      "greenhouse:ashwreath",
      "greenhouse:target:zeta",
    ]);
  });

  it("matches ids as well as display names", () => {
    expect(rankGoalChoices(choices, [], "ash_wreath").map((choice) => choice.name)).toEqual([]);
    expect(rankGoalChoices([{ id: "rose_dragon_pet", kind: "item", name: "Rose Dragon Pet" }], [], "dragon pet"))
      .toHaveLength(1);
  });
});

describe("personal vault counts", () => {
  it("merges matching Hypixel ids case-insensitively", () => {
    const counts = countProfileContainer([
      { Count: 2, tag: { ExtraAttributes: { id: "CHOCONUT" } } },
      { Count: 3, id: "choconut" },
      null,
      { Count: 0, id: "IGNORED" },
    ]);
    expect(counts.get("CHOCONUT")).toBe(5);
    expect(counts.has("IGNORED")).toBe(false);
  });
});

describe("mutation plot capacity", () => {
  it("counts only anchors for the mutation being maximized", () => {
    expect(mutationCapacity("choconut", [
      { mutation: "choconut" },
      { mutation: "gloomgourd" },
      { mutation: "choconut" },
    ])).toBe(2);
  });

  it("uses measured plot capacity as the amount to produce", () => {
    expect(goalQuantityForPlotCapacity(72)).toBe(72);
  });

  it("does not let existing stock cancel a directly selected goal", () => {
    expect(goalWorkRemaining(6, 9, true)).toBe(6);
    expect(goalWorkRemaining(6, 9, false)).toBe(0);
    expect(goalWorkRemaining(6, undefined, false)).toBe(6);
  });
});

describe("finite auto-arrange completion", () => {
  const goals = [
    { mutation: "do_not_eat_shroom", maximize: false, count: 1 },
    { mutation: "thornshade", maximize: false, count: 1 },
    { mutation: "soggybud", maximize: false, count: 1 },
    { mutation: "magic_jellybean", maximize: false, count: 1 },
  ];

  it("accepts the complete four-goal workspace result", () => {
    expect(unmetFiniteMutationGoals(goals, goals.map(({ mutation }) => ({ mutation })))).toEqual([]);
  });

  it("identifies every goal omitted by a partial solver result", () => {
    expect(unmetFiniteMutationGoals(goals, [
      { mutation: "do_not_eat_shroom" },
      { mutation: "soggybud" },
    ])).toEqual([
      { mutation: "thornshade", requested: 1, produced: 0 },
      { mutation: "magic_jellybean", requested: 1, produced: 0 },
    ]);
  });

  it("aggregates repeated finite goals and ignores maximize requests", () => {
    expect(unmetFiniteMutationGoals([
      { mutation: "thornshade", maximize: false, count: 1 },
      { mutation: "thornshade", maximize: false, count: 2 },
      { mutation: "soggybud", maximize: true, count: null },
    ], [
      { mutation: "thornshade" },
      { mutation: "thornshade" },
      { mutation: "soggybud" },
    ])).toEqual([
      { mutation: "thornshade", requested: 3, produced: 2 },
    ]);
  });
});

describe("active greenhouse field", () => {
  const cycles = [
    {
      index: 0,
      produce: [
        { id: "ashwreath", need: 12, plots: 4 },
        { id: "choconut", need: 60, plots: 8 },
      ],
    },
    {
      index: 1,
      produce: [{ id: "soggybud", need: 20, plots: 2 }],
    },
  ];

  it("keeps the player's selected field when it still belongs to the plan", () => {
    expect(selectPlanField(cycles, {}, "soggybud")).toMatchObject({
      cycleIndex: 1,
      fieldIndex: 0,
      node: { id: "soggybud" },
    });
  });

  it("opens on the largest unfinished field in the earliest unfinished phase", () => {
    expect(selectPlanField(cycles, { choconut: 3 }, null)?.node.id).toBe("choconut");
    expect(selectPlanField(cycles, { ashwreath: 4, choconut: 8 }, null)?.node.id).toBe("soggybud");
  });

  it("ignores covered fields and still has a stable completed-plan fallback", () => {
    const covered = [{ index: 0, produce: [
      { id: "covered", need: 10, plots: 3, covered: true },
      { id: "visible", need: 4, plots: 1 },
    ] }];
    expect(selectPlanField(covered, {}, null)?.node.id).toBe("visible");
    expect(selectPlanField(cycles, { ashwreath: 4, choconut: 8, soggybud: 2 }, null)?.node.id)
      .toBe("ashwreath");
  });

  it("defaults unknown stored modes to the read-only plan", () => {
    expect(normalisePlotInteractionMode("hybrid")).toBe("hybrid");
    expect(normalisePlotInteractionMode("manual")).toBe("locked");
    expect(normalisePlotInteractionMode(null)).toBe("locked");
  });
});

describe("the field a new target opens on", () => {
  const mutation = (id: string, requires: string[] = []): MutationDefinition => ({
    id,
    name: id,
    size: 1,
    ground: "farmland",
    requirements: requires.map((crop) => ({ crop, count: 1 })),
    rarity: "common",
    growth_stages: 1,
    positive_buffs: [],
    negative_buffs: [],
    drops: {},
  });
  const data = {
    crops: {},
    mutations: {
      blastberry: mutation("blastberry"),
      startlevina: mutation("startlevina", ["blastberry"]),
    },
  };

  it("shows a mutation target's own field", () => {
    expect(targetFieldId("mutation", "startlevina", [], data)).toBe("startlevina");
  });

  it("shows an item target's deepest mutation ingredient", () => {
    expect(targetFieldId("item", "target", [
      { mutation: "blastberry", qty: 8 },
      { mutation: "startlevina", qty: 2 },
    ], data)).toBe("startlevina");
  });

  it("declines a steer when an item consumes no mutation", () => {
    expect(targetFieldId("item", "bare", [{ mutation: null, qty: 4 }], data)).toBeNull();
    expect(targetFieldId("item", "bare", [], data)).toBeNull();
  });
});
