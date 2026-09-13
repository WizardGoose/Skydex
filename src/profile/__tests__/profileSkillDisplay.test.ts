import { describe, expect, it } from "vitest";
import type { SkillDef, SkillDefs } from "../../island/skills";
import { profileSkillRows } from "../skillDisplay";

const ladder = (key: string, maxLevel: number): SkillDef => ({
  key,
  name: key[0] + key.slice(1).toLowerCase(),
  maxLevel,
  thresholds: Array.from({ length: maxLevel }, (_, index) => (index + 1) * 100),
});

describe("profileSkillRows", () => {
  it("folds Foraging's extra cap into the Foraging row and suppresses the standalone pseudo-skill", () => {
    const defs: SkillDefs = {
      FORAGING: ladder("FORAGING", 57),
      FARMING: ladder("FARMING", 2),
    };

    const rows = profileSkillRows(
      {
        SKILL_FORAGING: 5_230,
        SKILL_FORAGING_EXTRA_LEVEL_CAP: 2,
        SKILL_FARMING: 300,
      },
      defs,
    );

    expect(rows.map((row) => row.resourceKey)).toEqual(["FORAGING", "FARMING"]);
    expect(rows.find((row) => row.resourceKey === "FORAGING")).toMatchObject({
      level: 52,
      capLevel: 52,
      maxed: true,
      figure: { kind: "overflow", valueXp: 30, lifetimeXp: 5_230 },
    });
  });

  it("retains next-level progress before a skill's current cap", () => {
    const rows = profileSkillRows(
      { SKILL_FORAGING: 5_110, SKILL_FORAGING_EXTRA_LEVEL_CAP: 2 },
      { FORAGING: ladder("FORAGING", 57) },
    );

    expect(rows[0]).toMatchObject({
      level: 51,
      capLevel: 52,
      maxed: false,
      figure: { kind: "progress", currentXp: 10, totalXp: 100, lifetimeXp: 5_110 },
    });
  });

  it("uses cap overflow, never lifetime XP, for every maxed skill", () => {
    const rows = profileSkillRows({ SKILL_FARMING: 300 }, { FARMING: ladder("FARMING", 2) });

    expect(rows[0]).toMatchObject({
      level: 2,
      capLevel: 2,
      maxed: true,
      figure: { kind: "overflow", valueXp: 100, lifetimeXp: 300 },
    });
  });

  it("still hides the cap pseudo-skill before a level resource is available", () => {
    const rows = profileSkillRows(
      { SKILL_FORAGING: 50, SKILL_FORAGING_EXTRA_LEVEL_CAP: 2 },
      null,
    );

    expect(rows.map((row) => row.resourceKey)).toEqual(["FORAGING"]);
  });
});
