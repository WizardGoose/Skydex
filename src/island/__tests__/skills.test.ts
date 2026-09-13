import { describe, expect, it } from "vitest";
import { averageSkillLevel, memberSkillKey, parseSkillsPayload, skillProgress, type SkillDef } from "../skills";
import { parseSkillIconData } from "../skillIcons";
import { readProfileFacts, EMPTY_FACTS } from "../profileFacts";

/**
 * The skill arithmetic, against hand-built ladders.
 *
 * The real ladders come off Hypixel's resource endpoint at runtime and are
 * deliberately never hardcoded here, so these tests check the MATHS, not the
 * numbers: crossing thresholds, the into-level split a progress bar draws,
 * and the refusals (malformed ladders dropped whole, absent skills absent).
 */

const LADDER: SkillDef = { key: "TEST", name: "Test", maxLevel: 3, thresholds: [50, 175, 375] };

describe("skillProgress", () => {
  it("holds level zero before the first threshold, with progress toward it", () => {
    const p = skillProgress(49, LADDER);
    expect(p.level).toBe(0);
    expect(p.xpInto).toBe(49);
    expect(p.xpForNext).toBe(50);
    expect(p.maxed).toBe(false);
  });

  it("crosses a threshold exactly at its value", () => {
    expect(skillProgress(50, LADDER).level).toBe(1);
  });

  it("measures into-level XP from the last crossed threshold", () => {
    const p = skillProgress(200, LADDER);
    expect(p.level).toBe(2);
    expect(p.xpInto).toBe(25);
    expect(p.xpForNext).toBe(200);
  });

  it("caps at the ladder's top and stops promising a next level", () => {
    const p = skillProgress(1_000_000, LADDER);
    expect(p.level).toBe(3);
    expect(p.maxed).toBe(true);
    expect(p.xpForNext).toBeNull();
  });

  it("treats garbage XP as none rather than NaN", () => {
    expect(skillProgress(Number.NaN, LADDER).level).toBe(0);
    expect(skillProgress(-5, LADDER).xpInto).toBe(0);
  });
});

describe("parseSkillsPayload", () => {
  const payload = {
    skills: {
      FARMING: {
        name: "Farming",
        maxLevel: 3,
        levels: [
          { level: 1, totalExpRequired: 50 },
          { level: 2, totalExpRequired: 175 },
          { level: 3, totalExpRequired: 375 },
        ],
      },
      BROKEN: {
        name: "Broken",
        maxLevel: 2,
        // Not increasing, which would compute a wrong level with a straight face.
        levels: [
          { level: 1, totalExpRequired: 100 },
          { level: 2, totalExpRequired: 100 },
        ],
      },
    },
  };

  it("keeps a well-formed ladder and drops a malformed one whole", () => {
    const defs = parseSkillsPayload(payload)!;
    expect(defs.FARMING.thresholds).toEqual([50, 175, 375]);
    expect(defs.BROKEN).toBeUndefined();
  });

  it("clamps the cap to what the ladder can actually reach", () => {
    const short = parseSkillsPayload({
      skills: { X: { name: "X", maxLevel: 60, levels: [{ level: 1, totalExpRequired: 50 }] } },
    })!;
    expect(short.X.maxLevel).toBe(1);
  });

  it("answers null for nothing usable, not an empty resource", () => {
    expect(parseSkillsPayload({})).toBeNull();
    expect(parseSkillsPayload({ skills: { X: { maxLevel: 0, levels: [] } } })).toBeNull();
  });
});

describe("memberSkillKey and the average", () => {
  const defs = {
    FARMING: LADDER && { ...LADDER, key: "FARMING", name: "Farming" },
    COMBAT: { ...LADDER, key: "COMBAT", name: "Combat" },
    RUNECRAFTING: { ...LADDER, key: "RUNECRAFTING", name: "Runecrafting" },
  };

  it("maps the member payload's key onto the resource's", () => {
    expect(memberSkillKey("SKILL_FARMING")).toBe("FARMING");
    expect(memberSkillKey("FARMING")).toBe("FARMING");
    expect(memberSkillKey(" skill_foraging_extra_level_cap ")).toBe("FORAGING_EXTRA_LEVEL_CAP");
  });

  it("averages stated skills and leaves out the cosmetic tracks", () => {
    // Farming maxed (3), combat level 1, runecrafting maxed but excluded.
    const avg = averageSkillLevel(
      { SKILL_FARMING: 1_000, SKILL_COMBAT: 60, SKILL_RUNECRAFTING: 1_000 },
      defs
    );
    expect(avg).toBe(2);
  });

  it("does not charge a zero for a skill the payload never stated", () => {
    expect(averageSkillLevel({ SKILL_FARMING: 1_000 }, defs)).toBe(3);
  });

  it("answers null with nothing to average", () => {
    expect(averageSkillLevel({}, defs)).toBeNull();
    expect(averageSkillLevel({ SKILL_UNKNOWN: 5 }, defs)).toBeNull();
  });
});

describe("parseSkillIconData", () => {
  // The genuine shape of the wiki's Module:Skill/Data, abbreviated.
  const LUA = `return {
	['farming'] = {
		name = 'Farming', nameshort = 'Frm',
		icon = 'Farming.png', color = 'gold',
	},
	['garden'] = {
		name = 'Garden', nameshort = 'Gdn',
		icon = 'Sunflower.png', color = 'green',
	},
	['broken'] = {
		name = 'Broken', nameshort = 'Brk',
	},
}`;

  it("reads each skill's icon file and drops the extension for ItemIcon", () => {
    const icons = parseSkillIconData(LUA);
    expect(icons.farming).toBe("Farming");
    expect(icons.garden).toBe("Sunflower");
  });

  it("gives a skill with no stated icon nothing, not a guess", () => {
    expect(parseSkillIconData(LUA).broken).toBeUndefined();
  });

  it("yields an empty map for a rewritten page rather than throwing", () => {
    expect(parseSkillIconData("something else entirely")).toEqual({});
  });
});

describe("readProfileFacts", () => {
  it("reads the facts from where the payload keeps them", () => {
    const facts = readProfileFacts({
      player_data: { experience: { SKILL_FARMING: 369253280.98, SKILL_JUNK: "not a number" } },
      profile: { first_join: 1709322087210 },
      fairy_soul: { total_collected: 254 },
      leveling: { experience: 38220 },
    });
    expect(facts.skillXp).toEqual({ SKILL_FARMING: 369253280.98 });
    expect(facts.firstJoin).toBe(1709322087210);
    expect(facts.fairySouls).toBe(254);
    expect(facts.levelXp).toBe(38220);
  });

  it("keeps absent absent: no zeros invented for a silent payload", () => {
    expect(readProfileFacts({})).toEqual(EMPTY_FACTS);
    expect(readProfileFacts(null)).toEqual(EMPTY_FACTS);
    expect(readProfileFacts({ fairy_soul: {} }).fairySouls).toBeNull();
    expect(readProfileFacts({ leveling: {} }).levelXp).toBeNull();
  });

  it("reads tuning allocations and the worn power stone, skipping bookkeeping keys", () => {
    const facts = readProfileFacts({
      accessory_bag_storage: {
        selected_power: "forceful",
        tuning: {
          highest_unlocked_slot: 4,
          refund_2: true,
          slot_0: { strength: 107, health: 0, purchase_ts: 1_800_000_000_000, junk: "no" },
        },
      },
    });
    expect(facts.selectedPower).toBe("forceful");
    expect(facts.tuning.slot_0).toEqual({ strength: 107, health: 0 });
    expect(facts.tuning.highest_unlocked_slot).toBeUndefined();
  });

  it("reads active Heart of the Mountain and Forest trees without dropping future nodes", () => {
    const facts = readProfileFacts({ skill_tree: {
      mining: { custom_name: "Heart of the Mountain 1" },
      foraging: { custom_name: "Heart of the Forest 3" },
      nodes: {
        mining: {
          mining_speed: 50,
          toggle_mining_speed: true,
          future_mountain_node: 7,
          toggle_future_mountain_node: false,
        },
        foraging: { center_of_the_forest: 5, toggle_center_of_the_forest: true },
      },
      selected_ability: { mining: "mining_speed_boost" },
      tokens_spent: { mountain: 25, forest: 15 },
      experience: { mining: 1_247_000, foraging: 370_907.7 },
    } });
    expect(facts.hotmName).toBe("Heart of the Mountain 1");
    expect(facts.hotfName).toBe("Heart of the Forest 3");
    expect(facts.hotmTree).toEqual({
      customName: "Heart of the Mountain 1",
      experience: 1_247_000,
      tokensSpent: 25,
      selectedAbility: "mining_speed_boost",
      nodes: {
        mining_speed: { level: 50, enabled: true },
        future_mountain_node: { level: 7, enabled: false },
      },
    });
    expect(facts.hotfTree).toEqual({
      customName: "Heart of the Forest 3",
      experience: 370_907.7,
      tokensSpent: 15,
      selectedAbility: null,
      nodes: { center_of_the_forest: { level: 5, enabled: true } },
    });
    const absent = readProfileFacts({ skill_tree: { mining: {}, foraging: { custom_name: 4 } } });
    expect(absent.hotmName).toBeNull();
    expect(absent.hotfName).toBeNull();
    expect(absent.hotmTree).toBeNull();
    expect(absent.hotfTree).toBeNull();
  });

  it("selects the current numbered tree and retains every shared preset", () => {
    const facts = readProfileFacts({ skill_tree: {
      nodes: {
        mining: { mining_speed: 10, toggle_mining_speed: true },
        mining_2: { mining_fortune: 20, toggle_mining_fortune: false },
        foraging: { sweep: 30, toggle_sweep: true },
        foraging_2: { hunters_luck: 40, toggle_hunters_luck: true },
      },
      selected_ability: { mining: "pickobulus", mining_2: "mining_speed_boost" },
      tokens_spent: { mountain: 5, mountain_2: 7, forest: 9, forest_2: 11 },
      experience: { mining: 1_247_000, foraging: 547_000 },
      selected_skill_tree_slot: { mining: 2, foraging: 2 },
    } });

    expect(facts.hotmSelectedSlot).toBe(2);
    expect(facts.hotfSelectedSlot).toBe(2);
    expect(facts.hotmTree).toEqual({
      customName: null,
      experience: 1_247_000,
      tokensSpent: 7,
      selectedAbility: "mining_speed_boost",
      nodes: { mining_fortune: { level: 20, enabled: false } },
    });
    expect(facts.hotfTree).toEqual({
      customName: null,
      experience: 547_000,
      tokensSpent: 11,
      selectedAbility: null,
      nodes: { hunters_luck: { level: 40, enabled: true } },
    });
    expect(facts.hotmTrees?.[1]?.nodes.mining_speed).toEqual({ level: 10, enabled: true });
    expect(facts.hotmTrees?.[2]?.nodes.mining_fortune).toEqual({ level: 20, enabled: false });
    expect(facts.hotfTrees?.[1]?.nodes.sweep).toEqual({ level: 30, enabled: true });
    expect(facts.hotfTrees?.[2]?.nodes.hunters_luck).toEqual({ level: 40, enabled: true });
  });
});
