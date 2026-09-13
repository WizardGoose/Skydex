import { describe, expect, it } from "vitest";
import type { SkillDefs } from "../../island/skills";
import type { MemberLoadouts } from "../../networth/parseItems";
import type { RawItem } from "../../networth/types";
import {
  buildProfileViewModel,
  FAIRY_SOUL_TOTAL,
  FAIRY_SOUL_WIKI_URL,
  gearBonuses,
  type ProfileGearItemView,
  type ProfileViewModelInput,
} from "../profileViewModel";

const item = (id: string, name: string, lore: string[] = []): RawItem => ({
  Count: 1,
  tag: {
    ExtraAttributes: { id },
    display: { Name: name, Lore: lore },
  },
});

const skills: SkillDefs = {
  ASTROLOGY: {
    key: "ASTROLOGY",
    name: "Astrology",
    maxLevel: 2,
    thresholds: [100, 300],
  },
};

const gearLoadouts: MemberLoadouts = {
  armorSets: [
    { id: 1, pieces: [null, null, null, null] },
    { id: 3, pieces: [item("FUTURE_HELMET", "Future Helmet"), null, null, null] },
  ],
  equippedArmorSetId: null,
  equipmentSets: [],
  wornEquipment: [null, null, null, null],
  equippedEquipmentSetId: 7,
  loadouts: [{
    id: 12,
    name: "Future loadout",
    armorSetId: 3,
    equipmentSetId: 7,
    petUuid: "pet-1",
    powerStone: "future_power",
    tuningSlot: 2,
  }],
};

const input = (overrides: Partial<ProfileViewModelInput> = {}): ProfileViewModelInput => ({
  playerName: "TestPlayer",
  playerUuid: "00000000000040008000000000000000",
  profileName: "Kiwi",
  gameMode: "ironman",
  fetchedAt: 123,
  facts: {
    skillXp: { SKILL_ASTROLOGY: 150, SKILL_UNDOCUMENTED: 42 },
    firstJoin: 1_700_000_000_000,
    fairySouls: 12,
    levelXp: 39_377,
    tuning: { slot_2: { strength: 10, future_stat: 4 } },
    selectedPower: "future_power",
    hotmName: "Mountain",
    hotfName: null,
    hotmTree: {
      customName: "Mountain",
      experience: 123_000,
      tokensSpent: 4,
      selectedAbility: "future_ability",
      nodes: {
        future_node: { level: 7, enabled: true },
        future_disabled_node: { level: 2, enabled: false },
      },
    },
    hotfTree: null,
  },
  apiDetails: {
    slayers: [{ key: "spectre", level: 2, xp: 321 }],
    securedTimecharms: [{ key: "RIFT_TROPHY_FUTURE", timestamp: 1, visits: 2 }],
  },
  parsed: {
    armor: [],
    pets: [{
      type: "FUTURE_BEAST",
      tier: "LEGENDARY",
      exp: 500,
      active: true,
      uuid: "pet-1",
      heldItem: "PET_ITEM_QUANTUM_COLLAR",
      candyUsed: 2,
    }],
  },
  gearLoadouts,
  coverage: { inventoryShared: true, bankShared: false },
  networth: null,
  skillDefs: skills,
  skillIcons: { astrology: "Nether Star" },
  itemNameFor: (id) => id === "PET_ITEM_QUANTUM_COLLAR" ? "Quantum Collar" : null,
  itemTierFor: (id) => id === "PET_ITEM_QUANTUM_COLLAR" ? "rare" : null,
  ...overrides,
});

describe("buildProfileViewModel", () => {
  it("shows Fairy Souls against the current total and keeps the wiki and mod roles explicit", () => {
    const model = buildProfileViewModel(input());
    const fairySouls = model?.metrics.find((metric) => metric.label === "Fairy souls");

    expect(fairySouls).toMatchObject({
      value: `12 / ${FAIRY_SOUL_TOTAL}`,
      tone: "fairy",
      info: {
        wiki: { href: FAIRY_SOUL_WIKI_URL },
      },
    });
    expect(fairySouls?.info?.note).toContain("Skydex mod");
    expect(fairySouls?.info?.note).toContain("once the feature is connected");
  });

  it("keeps purse and bank as separate summary cells", () => {
    const model = buildProfileViewModel(input({
      coverage: { inventoryShared: true, bankShared: true },
      networth: {
        networth: 1_000,
        unsoulboundNetworth: 1_000,
        noInventory: false,
        purse: 120,
        bank: 340,
        personalBank: 56,
        types: {},
      },
    }));
    const purse = model?.metrics.find((metric) => metric.label === "Purse");
    const bank = model?.metrics.find((metric) => metric.label === "Bank");

    expect(model?.metrics.some((metric) => metric.label === "Coins")).toBe(false);
    expect(purse).toMatchObject({ value: "120", tone: "coins", info: null });
    expect(bank).toMatchObject({
      value: "396",
      tone: "coins",
      parts: [
        { label: "Personal", value: "56" },
        { label: "Co-op", value: "340" },
      ],
      info: null,
    });
  });

  it("keeps real tuning stats future-safe and treats an all-zero allocation as inactive", () => {
    const stated = buildProfileViewModel(input());
    const inactive = buildProfileViewModel(input({
      facts: {
        ...input().facts,
        tuning: { slot_2: { strength: 0, health: 0 } },
      },
    }));

    expect(stated?.loadout.tuning).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "strength", value: "+10" }),
      expect.objectContaining({ key: "future_stat", value: "+4" }),
    ]));
    expect(inactive?.loadout.tuning).toEqual([]);
  });

  it("keeps API-omitted pet item rarity in the pet data projection", () => {
    const model = buildProfileViewModel(input({
      parsed: {
        armor: [],
        pets: [{
          type: "MOOSHROOM_COW",
          tier: "LEGENDARY",
          exp: 500,
          active: true,
          uuid: "pet-1",
          heldItem: "GREEN_BANDANA",
          candyUsed: 0,
        }],
      },
      itemNameFor: () => null,
      itemTierFor: () => null,
    }));

    expect(model?.loadout.pet?.heldItem).toMatchObject({
      id: "GREEN_BANDANA",
      name: "Green Bandana",
      rarity: "epic",
      effect: "§7Grants §a+4 §6☘ Farming Fortune §7for each Garden Level.",
    });
  });

  it("preserves omitted pet candy usage as unavailable while keeping a reported zero", () => {
    const missing = buildProfileViewModel(input({
      parsed: {
        armor: [],
        pets: [{ type: "FUTURE_BEAST", tier: "LEGENDARY", exp: 500, active: true, uuid: "pet-1" }],
      },
    }));
    const reportedZero = buildProfileViewModel(input({
      parsed: {
        armor: [],
        pets: [{ type: "FUTURE_BEAST", tier: "LEGENDARY", exp: 500, active: true, uuid: "pet-1", candyUsed: 0 }],
      },
    }));

    expect(missing?.loadout.pet?.candyUsed).toBeNull();
    expect(reportedZero?.loadout.pet?.candyUsed).toBe(0);
  });

  it("folds Foraging's unlocked cap into Foraging instead of rendering a cap row", () => {
    const thresholds = Array.from({ length: 57 }, (_, index) => (index + 1) * 100);
    const model = buildProfileViewModel(input({
      facts: {
        ...input().facts,
        skillXp: {
          SKILL_FORAGING: 5_110,
          SKILL_FORAGING_EXTRA_LEVEL_CAP: 2,
        },
      },
      skillDefs: {
        FORAGING: {
          key: "FORAGING",
          name: "Foraging",
          maxLevel: 57,
          thresholds,
        },
      },
    }));

    expect(model).not.toBeNull();
    expect(model!.skills).toHaveLength(1);
    expect(model!.skills[0]).toMatchObject({
      key: "FORAGING",
      name: "Foraging",
      level: 51,
      progress: 10,
      figure: "10 / 100 XP",
      lifetimeXp: 5_110,
      xpInto: 10,
      xpForNext: 100,
      capLevel: 52,
      maxed: false,
    });
  });

  it("turns new API skills into ordinary rows and preserves unknown skill XP", () => {
    const model = buildProfileViewModel(input());

    expect(model?.skills.find((row) => row.key === "ASTROLOGY")).toMatchObject({
      name: "Astrology",
      wikiName: "Astrology",
      level: 1,
      progress: 25,
      icon: "Nether Star",
    });
    expect(model?.skills.find((row) => row.key === "UNDOCUMENTED")).toMatchObject({
      name: "Undocumented",
      level: null,
      progress: null,
      figure: "42 XP",
    });
  });

  it("carries each skill icon into the skill-average breakdown", () => {
    const model = buildProfileViewModel(input());
    const average = model?.metrics.find((metric) => metric.label === "Average skill level");

    expect(average?.info?.rows).toContainEqual(expect.objectContaining({
      label: "Astrology",
      icon: "Nether Star",
    }));
  });

  it("keeps unknown Slayers and Timecharms visible instead of dropping them", () => {
    const model = buildProfileViewModel(input());

    expect(model?.slayers).toContainEqual(expect.objectContaining({
      key: "spectre",
      name: "Spectre",
      wikiName: "Spectre",
      level: 2,
      progress: null,
    }));
    expect(model?.timecharms.entries.at(-1)).toMatchObject({
      key: "RIFT_TROPHY_FUTURE",
      name: "Future Timecharm",
      wikiName: "Future Timecharm",
      complete: true,
    });
  });

  it("keeps exact XP beside the compact Slayer figure for hover disclosure", () => {
    const model = buildProfileViewModel(input({
      apiDetails: {
        ...input().apiDetails,
        slayers: [{ key: "enderman", level: 7, xp: 143_800 }],
      },
    }));

    expect(model?.slayers[0]).toMatchObject({
      figure: "143.8K / 400K XP",
      figureDetail: "143,800 / 400,000 XP",
    });
  });

  it("maps Hypixel's Mountain trophy ID to Celestial without adding a duplicate Timecharm", () => {
    const model = buildProfileViewModel(input({
      apiDetails: {
        ...input().apiDetails,
        securedTimecharms: [{ key: "RIFT_TROPHY_MOUNTAIN", timestamp: 1, visits: 2 }],
      },
    }));

    expect(model?.timecharms.securedCount).toBe(1);
    expect(model?.timecharms.entries).toHaveLength(8);
    expect(model?.timecharms.entries.find((entry) => entry.key === "celestial")).toMatchObject({
      name: "Celestial Timecharm",
      wikiName: "Celestial Timecharm",
      complete: true,
    });
    expect(model?.timecharms.entries).not.toContainEqual(expect.objectContaining({
      name: "Mountain Timecharm",
    }));
  });

  it("distinguishes a locked Slayer from shared progress with private XP", () => {
    const model = buildProfileViewModel(input({
      apiDetails: {
        ...input().apiDetails,
        slayers: [
          { key: "blaze", level: 0, xp: null },
          { key: "spectre", level: 2, xp: null },
        ],
      },
    }));

    expect(model?.slayers[0]).toMatchObject({
      name: "Inferno",
      wikiName: "Inferno Demonlord",
      level: 0,
      progress: 0,
      figure: "Locked",
      locked: true,
    });
    expect(model?.slayers[1]).toMatchObject({
      name: "Spectre",
      level: 2,
      progress: null,
      figure: "XP not shared",
      locked: false,
    });
  });

  it("uses live item lore for displayed rarity and carries the complete item into the view", () => {
    const necklace = item("RIFT_NECKLACE", "§9Rift Necklace", [
      "§7Intelligence: §a+10",
      "",
      "§d§lMYTHIC NECKLACE",
    ]);
    necklace.tag!.ExtraAttributes!.enchantments = { quantum: 3 };
    necklace.tag!.ExtraAttributes!.rarity_upgrades = 1;
    const model = buildProfileViewModel(input({
      gearLoadouts: {
        ...gearLoadouts,
        wornEquipment: [necklace, null, null, null],
      },
      itemNameFor: (id) => id === "RIFT_NECKLACE" ? "Rift Necklace" : null,
      itemTierFor: (id) => id === "RIFT_NECKLACE" ? "rare" : null,
    }));

    expect(model?.loadout.equipment[0]).toMatchObject({
      id: "RIFT_NECKLACE",
      name: "Rift Necklace",
      wikiName: "Rift Necklace",
      rarity: "MYTHIC",
      lore: expect.arrayContaining(["§d§lMYTHIC NECKLACE"]),
      extra: { ench: { quantum: 3 }, recomb: true },
    });
  });

  it("keeps live pet data honest and never supplies Demo-only held-item prose", () => {
    const model = buildProfileViewModel(input());

    expect(model?.loadout.pet).toMatchObject({
      name: "Future Beast",
      wikiName: "Future Beast Pet",
      stats: [],
      abilities: [],
      heldItem: { name: "Quantum Collar", rarity: "rare", effect: null },
    });
  });

  it("projects the selected Power Stone and the user's active tree data into expandable details", () => {
    const model = buildProfileViewModel(input({
      facts: {
        ...input().facts,
        selectedPower: "forceful",
      },
      gearLoadouts: {
        ...gearLoadouts,
        loadouts: [{
          ...gearLoadouts.loadouts[0],
          powerStone: "forceful",
        }],
      },
    }));

    expect(model?.loadout.contexts[0]).toMatchObject({
      label: "Power Stone",
      value: "Forceful",
      iconId: "ACACIA_BIRDHOUSE",
      detail: {
        kind: "power",
        stoneName: "Acacia Birdhouse",
        wikiName: "Acacia Birdhouse",
        uniqueBonus: "§c+4 ⫽ Ferocity",
      },
    });
    expect(model?.loadout.contexts[1]).toMatchObject({
      label: "HotM",
      value: "Mountain",
      detail: {
        kind: "tree",
        name: "Mountain",
        experience: 123_000,
        tokensSpent: 4,
        selectedAbility: "Future Ability",
        nodes: expect.arrayContaining([
          expect.objectContaining({ key: "future_node", level: 7, enabled: true }),
          expect.objectContaining({ key: "future_disabled_node", level: 2, enabled: false }),
        ]),
      },
    });
  });

  it("projects each saved loadout's own HotM and HotF preset", () => {
    const firstMountain = {
      customName: null,
      experience: 1_247_000,
      tokensSpent: 5,
      selectedAbility: "pickobulus",
      nodes: { mining_speed: { level: 10, enabled: true } },
    };
    const secondMountain = {
      customName: null,
      experience: 1_247_000,
      tokensSpent: 7,
      selectedAbility: "mining_speed_boost",
      nodes: { mining_fortune: { level: 20, enabled: false } },
    };
    const secondForest = {
      customName: null,
      experience: 547_000,
      tokensSpent: 11,
      selectedAbility: "axe_toss",
      nodes: { hunters_luck: { level: 40, enabled: true } },
    };
    const model = buildProfileViewModel(input({
      facts: {
        ...input().facts,
        hotmName: null,
        hotfName: null,
        hotmSelectedSlot: 1,
        hotfSelectedSlot: 2,
        hotmTree: firstMountain,
        hotfTree: secondForest,
        hotmTrees: { 1: firstMountain, 2: secondMountain },
        hotfTrees: { 2: secondForest },
      },
      parsed: { armor: [], pets: [] },
      gearLoadouts: {
        ...gearLoadouts,
        equippedEquipmentSetId: null,
        loadouts: [
          {
            id: 7,
            name: "Dia Mithril Flint",
            armorSetId: null,
            equipmentSetId: null,
            petUuid: null,
            powerStone: "sighted",
            tuningSlot: null,
            miningTreeSlot: 1,
            foragingTreeSlot: null,
          },
          {
            id: 8,
            name: "Mineshafts",
            armorSetId: null,
            equipmentSetId: null,
            petUuid: null,
            powerStone: "hurtful",
            tuningSlot: null,
            miningTreeSlot: 2,
            foragingTreeSlot: 2,
          },
        ],
      },
    }));

    const first = model?.loadout.choices.find((choice) => choice.id === 7)?.detail;
    const second = model?.loadout.choices.find((choice) => choice.id === 8)?.detail;
    expect(first?.contexts[1]).toMatchObject({ value: "Heart of the Mountain 1", detail: { tokensSpent: 5 } });
    expect(first?.contexts[2]).toMatchObject({ value: null, detail: null });
    expect(second?.contexts[1]).toMatchObject({
      value: "Heart of the Mountain 2",
      detail: { tokensSpent: 7, selectedAbility: "Mining Speed Boost" },
    });
    expect(second?.contexts[2]).toMatchObject({
      value: "Heart of the Forest 2",
      detail: { tokensSpent: 11, selectedAbility: "Axe Toss" },
    });
  });

  it("adds the live Mooshroom Cow reference details without replacing API values", () => {
    const model = buildProfileViewModel(input({
      parsed: {
        armor: [],
        pets: [{
          type: "MOOSHROOM_COW",
          tier: "LEGENDARY",
          exp: 25_353_230,
          active: true,
          uuid: "pet-1",
          heldItem: "GREEN_BANDANA",
          candyUsed: 0,
        }],
      },
    }));

    expect(model?.loadout.pet).toMatchObject({
      name: "Mooshroom Cow",
      wikiName: "Mooshroom Cow Pet",
      petType: "Farming Pet",
      stats: [
        { label: "❤ Health", value: "+100", tone: "health" },
        { label: "☘ Farming Fortune", value: "+100", tone: "fortune" },
      ],
      abilities: [
        expect.objectContaining({ name: "Mushroom Eater" }),
        expect.objectContaining({ name: "Farming Strength" }),
        expect.objectContaining({ name: "Bovine Blessing" }),
      ],
      heldItem: expect.objectContaining({ name: "Green Bandana" }),
    });
  });

  it("preserves occupied, unlocked-empty, and locked wardrobe states", () => {
    const model = buildProfileViewModel(input());
    const slots = model?.loadout.armourWardrobe.slots;

    expect(slots?.[0].state).toBe("unlocked-empty");
    expect(slots?.[1].state).toBe("locked");
    expect(slots?.[2].state).toBe("occupied");
    expect(slots).toHaveLength(27);
  });

  it("separates configured, unlocked-unset, and confirmed locked loadouts", () => {
    const model = buildProfileViewModel(input({
      gearLoadouts: {
        ...gearLoadouts,
        unlockedSlotCount: 13,
        loadouts: [
          {
            id: 11,
            name: "Loadout 11",
            armorSetId: null,
            equipmentSetId: null,
            petUuid: null,
            powerStone: null,
            tuningSlot: null,
          },
          ...gearLoadouts.loadouts,
          {
            id: 13,
            name: "Mining",
            armorSetId: 3,
            equipmentSetId: null,
            petUuid: null,
            powerStone: null,
            tuningSlot: null,
          },
          {
            id: 14,
            name: "Loadout 14",
            armorSetId: null,
            equipmentSetId: null,
            petUuid: null,
            powerStone: null,
            tuningSlot: null,
          },
        ],
      },
    }));

    expect(model?.loadout.id).toBe(12);
    expect(model?.loadout.choices.find((choice) => choice.id === 12)).toMatchObject({
      state: "saved",
      title: "Future loadout",
      active: true,
      detail: null,
    });
    expect(model?.loadout.choices.find((choice) => choice.id === 11)).toMatchObject({
      state: "unset",
      title: "Loadout 11",
      active: false,
      detail: null,
    });
    expect(model?.loadout.choices.find((choice) => choice.id === 13)).toMatchObject({
      state: "saved",
      title: "Mining",
      active: false,
      detail: {
        id: 13,
        name: "Mining",
        armour: [expect.objectContaining({ id: "FUTURE_HELMET" }), null, null, null],
      },
    });
    expect(model?.loadout.choices.find((choice) => choice.id === 14)).toMatchObject({
      state: "locked",
      active: false,
      detail: null,
    });
  });

  it("keeps currently worn pieces visible in every saved loadout that references the equipped sets", () => {
    const wornHelmet = item("WORN_HELMET", "Worn Helmet");
    const wornNecklace = item("WORN_NECKLACE", "Worn Necklace");
    const model = buildProfileViewModel(input({
      parsed: { armor: [wornHelmet], pets: [] },
      gearLoadouts: {
        ...gearLoadouts,
        armorSets: [{ id: 3, pieces: [null, null, null, null] }],
        equippedArmorSetId: 3,
        equipmentSets: [{ id: 7, pieces: [null, null, null, null] }],
        wornEquipment: [wornNecklace, null, null, null],
        equippedEquipmentSetId: 7,
        loadouts: [
          {
            id: 1,
            name: "Current copy",
            armorSetId: 3,
            equipmentSetId: 7,
            petUuid: null,
            powerStone: null,
            tuningSlot: null,
          },
          {
            id: 2,
            name: "Inspect me",
            armorSetId: 3,
            equipmentSetId: 7,
            petUuid: null,
            powerStone: null,
            tuningSlot: null,
          },
        ],
      },
    }));

    expect(model?.loadout.choices.find((choice) => choice.id === 2)?.detail).toMatchObject({
      name: "Inspect me",
      armour: [expect.objectContaining({ id: "WORN_HELMET" }), null, null, null],
      equipment: [expect.objectContaining({ id: "WORN_NECKLACE" }), null, null, null],
    });
  });

  it("uses a private wardrobe state when the inventory API is off", () => {
    const model = buildProfileViewModel(input({ coverage: { inventoryShared: false, bankShared: false } }));

    expect(model?.loadout.inventoryAvailable).toBe(false);
    expect(model?.loadout.armourWardrobe.available).toBe(false);
    expect(model?.loadout.armourWardrobe.slots[0].state).toBe("private");
  });
});

describe("gearBonuses", () => {
  it("combines stated lore stats and retains a future stat without a hardcoded row", () => {
    const pieces: ProfileGearItemView[] = [
      { id: "ONE", name: "One", wikiName: "One", count: 1, rarity: "rare", lore: ["§aHealth: +100", "§bQuantum Luck: +2.5%", ""] },
      { id: "TWO", name: "Two", wikiName: "Two", count: 1, rarity: "rare", lore: ["§aHealth: +50", "§bQuantum Luck: +1.5%", ""] },
    ];

    expect(gearBonuses(pieces)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Health", value: "150" }),
      expect.objectContaining({ name: "Quantum Luck", value: "4%" }),
    ]));
  });

  it("uses the in-game glyph and colour for every displayed SkyBlock stat", () => {
    const pieces: ProfileGearItemView[] = [{
      id: "MINING_SET",
      name: "Mining Set",
      wikiName: "Mining Set",
      count: 1,
      rarity: "legendary",
      lore: [
        "§7Mining Speed: §6+470",
        "§7Pristine: §5+6.4",
        "§7Mining Fortune: §6+40",
        "§7Heat Resistance: §c+8",
        "§7Cold Resistance: §b+5",
        "§7Respiration: §3+45",
        "§7Crit Chance: §9+20%",
        "§7Crit Damage: §9+20%",
        "§7Intelligence: §b+20",
        "§7Magic Find: §b+20",
        "§7Bonus Pest Chance: §2+102%",
        "",
      ],
    }];

    expect(gearBonuses(pieces)).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Mining Speed", glyph: "⸕", colorClass: "text-stat-gold" }),
      expect.objectContaining({ name: "Pristine", glyph: "✧", colorClass: "text-stat-dark-purple" }),
      expect.objectContaining({ name: "Heat Resistance", glyph: "♨", colorClass: "text-stat-red" }),
      expect.objectContaining({ name: "Cold Resistance", glyph: "❄", colorClass: "text-stat-aqua" }),
      expect.objectContaining({ name: "Respiration", glyph: "⚶", colorClass: "text-stat-dark-aqua" }),
      expect.objectContaining({ name: "Crit Chance", glyph: "☣", colorClass: "text-stat-blue" }),
      expect.objectContaining({ name: "Crit Damage", glyph: "☠", colorClass: "text-stat-blue" }),
      expect.objectContaining({ name: "Intelligence", glyph: "✎", colorClass: "text-stat-aqua" }),
      expect.objectContaining({ name: "Magic Find", glyph: "✯", colorClass: "text-stat-aqua" }),
      expect.objectContaining({ name: "Bonus Pest Chance", glyph: "ൠ", colorClass: "text-stat-dark-green" }),
    ]));
  });

  it("keeps Rift stats semantic and ignores non-stat lore counters", () => {
    const pieces: ProfileGearItemView[] = [{
      id: "RIFT_SET",
      name: "Rift Set",
      wikiName: "Rift Set",
      count: 1,
      rarity: "epic",
      lore: [
        "§7Rift Time: §a+395",
        "§7Hearts: §c+3",
        "§7Rift Damage: §5+1",
        "§7Intelligence: §b+58",
        "§7Mana Regen: §b+38%",
        "§7Speed: §f+9",
        "§7You found: §f50",
        "",
      ],
    }];

    const bonuses = gearBonuses(pieces);
    expect(bonuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Rift Time", label: "R.Tme", glyph: "ф", colorClass: "text-stat-green" }),
      expect.objectContaining({ name: "Hearts", label: "Hrts", glyph: "❤", colorClass: "text-stat-red" }),
      expect.objectContaining({ name: "Rift Damage", label: "R.Dmg", glyph: "❁", colorClass: "text-stat-dark-purple" }),
      expect.objectContaining({ name: "Mana Regen", label: "Mn.R", glyph: "⚡", colorClass: "text-stat-aqua" }),
    ]));
    expect(bonuses.some((bonus) => bonus.name === "You found")).toBe(false);
  });
});

describe("armour set display", () => {
  it("keeps a recombobulator marker from hiding a complete armour set name", () => {
    const set = [
      item("SET_HELMET", "Mossy Helianthus Helmet ✦"),
      item("SET_CHESTPLATE", "Mossy Helianthus Chestplate"),
      item("SET_LEGGINGS", "Mossy Helianthus Leggings"),
      item("SET_BOOTS", "Mossy Helianthus Boots"),
    ];
    const model = buildProfileViewModel(input({
      parsed: { armor: set, pets: [] },
    }));

    expect(model?.loadout.armourSetName).toBe("Mossy Helianthus Armor");
    expect(model?.loadout.armour.find((piece) => piece?.id === "SET_HELMET")?.wikiName)
      .toBe("Mossy Helianthus Helmet");
  });
});
