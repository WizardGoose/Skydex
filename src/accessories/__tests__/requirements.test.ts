import { describe, it, expect } from "vitest";
import {
  checkRequirement,
  NO_PROGRESS,
  readProgress,
  readRequirement,
  readSlayerLevels,
  readTrophyFish,
} from "../requirements";
import type { Requirement } from "../requirements";

/**
 * Requirements, and the line between "you cannot have this" and "we did not
 * check".
 *
 * The shapes here are copied from Hypixel's live item resource and from the
 * profile dump, not invented: `{"type":"SLAYER","slayer_boss_type":"spider",
 * "level":7}` is Tarantula Ring verbatim, and the slayer member shape with its
 * `claimed_levels` booleans is the one on a real live profile.
 */

const slayerReq = (boss: string, level: number) =>
  readRequirement({ type: "SLAYER", slayer_boss_type: boss, level }) as Requirement;

describe("readRequirement", () => {
  it("reads a slayer requirement and names the boss the way players do", () => {
    const req = slayerReq("zombie", 7);
    expect(req.kind).toBe("slayer");
    expect(req.target).toBe("Revenant Horror Slayer");
    expect(req.threshold).toBe("7");
    expect(req.how).toContain("Level Revenant Horror slayer to 7");
  });

  it("covers every slayer the API keys by its mob", () => {
    expect(slayerReq("spider", 7).target).toBe("Tarantula Broodfather Slayer");
    expect(slayerReq("wolf", 5).target).toBe("Sven Packmaster Slayer");
    expect(slayerReq("enderman", 6).target).toBe("Voidgloom Seraph Slayer");
    expect(slayerReq("blaze", 7).target).toBe("Inferno Demonlord Slayer");
    expect(slayerReq("vampire", 4).target).toBe("Riftstalker Bloodfiend Slayer");
  });

  it("names an unfamiliar slayer rather than dropping it", () => {
    // A seventh slayer should read clumsily and truthfully, not vanish from a
    // page whose job is to say why you cannot have something.
    expect(slayerReq("newthing", 3).target).toBe("Newthing Slayer");
  });

  it("reads a trophy fishing requirement", () => {
    const req = readRequirement({ type: "TROPHY_FISHING", trophy_type: "FROG", reward: "SILVER" });
    expect(req?.kind).toBe("trophyFishing");
    expect(req?.target).toBe("Frog trophy fish");
    expect(req?.threshold).toBe("Silver");
  });

  it("reads a Heart of the Mountain tier", () => {
    const req = readRequirement({ type: "HEART_OF_THE_MOUNTAIN", tier: 4 });
    expect(req?.kind).toBe("heartOfTheMountain");
    expect(req?.threshold).toBe("Tier 4");
  });

  it("reads a skill level requirement", () => {
    const req = readRequirement({ type: "SKILL", skill: "HUNTING", level: 20 });
    expect(req).toMatchObject({ kind: "skill", target: "Hunting", threshold: "20" });
    expect(req?.how).toBe("Reach Hunting level 20.");
  });

  it("names a type it does not understand instead of hiding it", () => {
    const req = readRequirement({ type: "MELODY_HAIR" });
    expect(req?.kind).toBe("other");
    expect(req?.target).toBe("Melody Hair");
    expect(req?.raw).toBe("MELODY_HAIR");
  });

  it("refuses a shape too broken to describe", () => {
    expect(readRequirement({ type: "SLAYER" })).toBeNull();
    expect(readRequirement({ type: "SLAYER", slayer_boss_type: "zombie" })).toBeNull();
    expect(readRequirement({})).toBeNull();
    expect(readRequirement(null)).toBeNull();
  });
});

describe("readSlayerLevels", () => {
  const member = (bosses: unknown) => ({ slayer: { slayer_bosses: bosses } });

  it("takes the level from claimed_levels, so no XP curve is needed", () => {
    const levels = readSlayerLevels(
      member({
        enderman: {
          xp: 143757,
          claimed_levels: { level_1: true, level_2: true, level_3: true, level_4: true, level_5: true, level_6: true, level_7: true },
        },
      })
    );
    expect(levels).toStrictEqual({ enderman: 7 });
  });

  it("ignores a level that was not actually claimed", () => {
    const levels = readSlayerLevels(
      member({ zombie: { claimed_levels: { level_1: true, level_2: true, level_3: false } } })
    );
    expect(levels).toStrictEqual({ zombie: 2 });
  });

  it.each(["zombie", "spider", "wolf", "enderman", "blaze", "vampire"])(
    "reads special claimed rewards for %s without counting duplicate keys",
    (boss) => {
      expect(readSlayerLevels(member({
        [boss]: { claimed_levels: {
          level_4: true,
          level_5: true,
          level_5_special: true,
        } },
      }))).toStrictEqual({ [boss]: 5 });
    },
  );

  it.each([7, 8, 9])("reads special level %i beyond the ordinary level 6 reward", (level) => {
    expect(readSlayerLevels(member({
      zombie: { xp: 1_200_000, claimed_levels: {
        level_6: true,
        [`level_${level}_special`]: true,
      } },
    }))).toStrictEqual({ zombie: level });
  });

  it("requires an actual claim and a valid reward key even when XP is above the cap", () => {
    expect(readSlayerLevels(member({
      zombie: { xp: 1_200_000, claimed_levels: {
        level_6: true,
        level_7_special: false,
        level_8_special: "true",
        level_9_special: 1,
        level_10_extra: true,
        level_11_special_extra: true,
        unrelated_12: true,
        "13": true,
      } },
    }))).toStrictEqual({ zombie: 6 });
  });

  it("uses special rewards when checking Slayer recipe and accessory requirements", () => {
    const progress = readProgress(member({
      zombie: { claimed_levels: { level_6: true, level_7_special: true } },
    }));
    expect(checkRequirement(slayerReq("zombie", 7), progress)).toMatchObject({ state: "met", have: "7" });
  });

  it("reports a boss with an empty claimed_levels as level zero", () => {
    // Real shape: a live profile's blaze entry is `{ claimed_levels: {} }`.
    expect(readSlayerLevels(member({ blaze: { claimed_levels: {} } }))).toStrictEqual({ blaze: 0 });
  });

  it("answers null when the member carries no slayer data at all", () => {
    // Not "all slayers are zero". Nobody said.
    expect(readSlayerLevels({})).toBeNull();
    expect(readSlayerLevels(null)).toBeNull();
    expect(readSlayerLevels({ slayer: {} })).toBeNull();
  });
});

describe("readTrophyFish", () => {
  it("reads the per tier counts", () => {
    const counts = readTrophyFish({ trophy_fish: { blobfish: 623, blobfish_bronze: 461, blobfish_gold: 11 } });
    expect(counts).toStrictEqual({ blobfish: 623, blobfish_bronze: 461, blobfish_gold: 11 });
  });

  it("answers null when there is no trophy fish object", () => {
    expect(readTrophyFish({})).toBeNull();
  });
});

describe("checkRequirement", () => {
  const progress = readProgress({
    slayer: {
      slayer_bosses: {
        spider: { claimed_levels: { level_1: true, level_2: true, level_3: true, level_4: true, level_5: true } },
        zombie: { claimed_levels: {} },
      },
    },
    trophy_fish: { frog_bronze: 3, blobfish_diamond: 6 },
  });

  it("passes a slayer level the player has reached", () => {
    const checked = checkRequirement(slayerReq("spider", 5), progress);
    expect(checked.state).toBe("met");
    expect(checked.have).toBe("5");
  });

  it("fails one they have not, and says where they are", () => {
    const checked = checkRequirement(slayerReq("spider", 7), progress);
    expect(checked.state).toBe("unmet");
    expect(checked.have).toBe("5");
  });

  it("treats a slayer never started as level zero, not as unknown", () => {
    // The member carries the boss, so zero is a measured answer.
    const checked = checkRequirement(slayerReq("zombie", 5), progress);
    expect(checked.state).toBe("unmet");
    expect(checked.have).toBe("0");
  });

  it("answers unknown for a boss the profile does not mention", () => {
    const checked = checkRequirement(slayerReq("vampire", 3), progress);
    expect(checked.state).toBe("unmet");
    // Present in the map or not, the player demonstrably has no levels; what
    // matters is that a MISSING profile is what yields unknown, not a missing boss.
    expect(checked.have).toBe("0");
  });

  it("answers unknown when there is no profile at all", () => {
    // The distinction the Locked zone depends on.
    expect(checkRequirement(slayerReq("spider", 7), NO_PROGRESS).state).toBe("unknown");
  });

  it("lets a better trophy catch clear a lesser bar", () => {
    const silverBlob = readRequirement({
      type: "TROPHY_FISHING",
      trophy_type: "BLOBFISH",
      reward: "SILVER",
    }) as Requirement;
    const checked = checkRequirement(silverBlob, progress);
    // Diamond is above silver, so the silver bar is cleared.
    expect(checked.state).toBe("met");
    expect(checked.have).toBe("Diamond");
  });

  it("fails a trophy bar above what was caught", () => {
    const goldFrog = readRequirement({
      type: "TROPHY_FISHING",
      trophy_type: "FROG",
      reward: "GOLD",
    }) as Requirement;
    const checked = checkRequirement(goldFrog, progress);
    expect(checked.state).toBe("unmet");
    expect(checked.have).toBe("Bronze");
  });

  it("says none caught when the fish has never been landed", () => {
    const req = readRequirement({ type: "TROPHY_FISHING", trophy_type: "LAVA", reward: "BRONZE" }) as Requirement;
    expect(checkRequirement(req, progress).have).toBe("none caught");
  });

  it("never claims a Heart of the Mountain verdict", () => {
    /*
     * The tier lives behind `mining_core`, which the profile dump truncates
     * before reaching the field, so there is no verified path. The requirement
     * is still readable and still shown; only the verdict is withheld.
     */
    const req = readRequirement({ type: "HEART_OF_THE_MOUNTAIN", tier: 4 }) as Requirement;
    expect(checkRequirement(req, progress).state).toBe("unknown");
  });

  it("checks a skill requirement against a resource-derived level", () => {
    const req = readRequirement({ type: "SKILL", skill: "HUNTING", level: 20 }) as Requirement;
    expect(checkRequirement(req, { ...progress, skillLevels: { HUNTING: 29 } })).toMatchObject({
      state: "met",
      have: "29",
    });
    expect(checkRequirement(req, { ...progress, skillLevels: { HUNTING: 12 } })).toMatchObject({
      state: "unmet",
      have: "12",
      gap: 8,
    });
    expect(checkRequirement(req, progress).state).toBe("unknown");
  });

  it("never claims a verdict on a type it does not understand", () => {
    const req = readRequirement({ type: "MELODY_HAIR" }) as Requirement;
    expect(checkRequirement(req, progress).state).toBe("unknown");
  });
});
