import { describe, expect, it } from "vitest";
import {
  buildCrimsonIslePreviewModel,
  buildGardenPreviewModel,
  buildProfileCoopPreviewModel,
} from "../profileWorlds";

describe("normal-profile world projections", () => {
  it("keeps Crimson Isle progress grouped without treating Kuudra wave metadata as a tier", () => {
    const model = buildCrimsonIslePreviewModel({
      nether_island_player_data: {
        selected_faction: "mages",
        mages_reputation: 12_345,
        barbarians_reputation: 678,
        abiphone: { active_contacts: ["elle", "odger", "dean"] },
        kuudra_completed_tiers: {
          none: 12,
          hot: 4,
          highest_wave_hot: 5,
        },
        dojo: {
          dojo_points_mob_kb: 1_230,
          dojo_points_archer: 980,
        },
      },
      trophy_fish: {
        blobfish: 120,
        blobfish_bronze: 85,
        blobfish_diamond: 2,
        rewards: 4,
      },
    });

    expect(model).toMatchObject({
      state: "populated",
      selectedFaction: "Mages",
      mageReputation: 12_345,
      barbarianReputation: 678,
      abiphoneContacts: 3,
    });
    expect(model.kuudra).toEqual([
      { key: "none", label: "Basic", completions: 12 },
      { key: "hot", label: "Hot", completions: 4 },
    ]);
    expect(model.trophyFish).toEqual([
      expect.objectContaining({ label: "Blobfish", total: 120, bronze: 85, diamond: 2 }),
    ]);
    expect(model.trophyFish[0].gradeKeys).toEqual({
      bronze: "blobfish_bronze",
      diamond: "blobfish_diamond",
    });
    expect(model.contacts).toEqual(["Elle", "Odger", "Dean"]);
    expect(model.availability).toEqual({ faction: true, reputation: true, abiphone: true, kuudra: true, trophyFish: true, dojo: true });
    expect(model.dojo.map((row) => row.score)).toEqual([1_230, 980]);
  });

  it("distinguishes a profile that never opened the Crimson Isle from an unavailable member", () => {
    expect(buildCrimsonIslePreviewModel({}).state).toBe("never-opened");
    expect(buildCrimsonIslePreviewModel(null).state).toBe("unavailable");
  });

  it("projects the documented Garden endpoint fields and preserves zero-valued progress", () => {
    const model = buildGardenPreviewModel({
      commission_data: {
        visits: { jerry: 3 },
        completed: { jerry: 2 },
        total_completed: 2,
        unique_npcs_served: 1,
      },
      composter_data: {
        organic_matter: 1_772.8,
        fuel_units: 17_000,
        compost_units: 0,
        compost_items: 2,
        upgrades: { speed: 25 },
      },
      active_commissions: {
        liam: {
          requirement: [{ item: "MUTANT_NETHER_STALK", amount: 4 }],
          status: "NOT_STARTED",
        },
      },
      resources_collected: { WHEAT: 100 },
      crop_upgrade_levels: { WHEAT: 1 },
      unlocked_plots_ids: ["beginner_1", "intermediate_3"],
      garden_experience: 0,
      unlocked_barn_skins: ["barn_skin_1"],
      selected_barn_skin: "barn_skin_1",
      garden_upgrades: { GROWTH_SPEED: 3 },
    });

    expect(model).toMatchObject({
      state: "populated",
      experience: 0,
      totalVisitorsCompleted: 2,
      uniqueVisitorsServed: 1,
      selectedBarnSkin: {
        key: "barn_skin_1",
        label: "Medieval",
        itemId: "BARN_SKIN_1",
        iconName: "Dark Oak Log",
        wikiName: "Medieval Barn Skin",
        tier: "uncommon",
      },
    });
    expect(model.unlockedBarnSkins).toEqual([
      expect.objectContaining({ key: "barn_skin_1", label: "Medieval", tier: "uncommon" }),
    ]);
    expect(model.visitors[0]).toMatchObject({ label: "Jerry", visits: 3, completed: 2 });
    expect(model.crops[0]).toMatchObject({ label: "Wheat", collected: 100, upgradeLevel: 1, itemId: "WHEAT" });
    expect(model.activeCommissions[0]).toMatchObject({ label: "Liam", iconName: "Liam", tier: "uncommon", status: "not started" });
    expect(model.activeCommissions[0].requirements[0]).toMatchObject({ itemId: "MUTANT_NETHER_STALK", label: "Mutant Nether Stalk", amount: 4 });
    expect(model.composter).toMatchObject({ present: true, compostUnits: 0, compostItems: 2 });
    expect(model.deskUpgrades[0]).toMatchObject({ label: "Growth Speed", value: 3 });
    expect(model.availability).toEqual({
      experience: true,
      plots: true,
      barnSkins: true,
      visitorTotals: true,
      visitors: true,
      cropsCollected: true,
      cropUpgrades: true,
      commissions: true,
      composter: true,
      deskUpgrades: true,
    });
  });

  it("keeps Garden endpoint failures separate from profiles that never opened it", () => {
    expect(buildGardenPreviewModel(null, "unavailable").state).toBe("unavailable");
    expect(buildGardenPreviewModel(null, "never-opened").state).toBe("never-opened");
  });

  it("preserves the exact identity of a cosmetic Garden barn skin", () => {
    const model = buildGardenPreviewModel({
      selected_barn_skin: "beautifall_cabin",
      unlocked_barn_skins: ["beautifall_cabin"],
    });

    expect(model.selectedBarnSkin).toEqual({
      key: "beautifall_cabin",
      label: "Beautifall Cabin",
      itemId: "BEAUTIFALL_CABIN_BARN_SKIN",
      iconName: "Beautifall Cabin Barn Skin",
      wikiName: "Beautifall Cabin Barn Skin",
      tier: "legendary",
    });
  });

  it("preserves the Garden API's Country key while linking its current greenhouse item", () => {
    const model = buildGardenPreviewModel({ unlocked_barn_skins: ["country"] });

    expect(model.unlockedBarnSkins).toEqual([{
      key: "country",
      label: "Country",
      itemId: "COUNTRY_GREENHOUSE_SKIN",
      iconName: "Country Greenhouse Skin",
      wikiName: "Country Greenhouse Skin",
      tier: "uncommon",
    }]);
  });

  it("uses the Garden NPC portrait when a visitor name collides with a Minecraft mob", () => {
    const model = buildGardenPreviewModel({
      commission_data: { visits: { vex: 2 }, completed: { vex: 1 } },
      active_commissions: { vex: { requirement: [{ item: "DEAD_BUSH", amount: 1 }] } },
    });

    expect(model.visitors[0]).toMatchObject({ label: "Vex", iconName: "Vex Sprite", tier: "uncommon" });
    expect(model.activeCommissions[0]).toMatchObject({ label: "Vex", iconName: "Vex Sprite", tier: "uncommon" });
  });
});

describe("profile and co-op projection", () => {
  it("keeps Community Upgrades and the shared bank ledger in one profile-level model", () => {
    const model = buildProfileCoopPreviewModel({
      profileName: "Pomegranate",
      gameMode: "ironman",
      selected: true,
      memberCount: 2,
      communityUpgrades: {
        upgrade_states: [
          { upgrade: "minion_slots", tier: 1, started_ms: 100, claimed_ms: 200 },
          { upgrade: "island_size", tier: 2, started_ms: 300 },
        ],
        currently_upgrading: { upgrade: "island_size", tier: 2, started_ms: 300 },
      },
      bankBalance: 12_345_678,
      bankTransactions: [
        { timestamp: 500, action: "DEPOSIT", initiator_name: "Wizard", amount: 1_000 },
        { timestamp: 400, action: "WITHDRAW", initiator_name: "CoopMate", amount: 250 },
      ],
    });

    expect(model).toMatchObject({
      state: "populated",
      profileName: "Pomegranate",
      gameMode: "Ironman",
      selected: true,
      memberCount: 2,
      bankBalance: 12_345_678,
      communityShared: true,
      bankShared: true,
    });
    expect(model.upgrades).toEqual([
      expect.objectContaining({ label: "Island Size", tier: 2, state: "active" }),
      expect.objectContaining({ label: "Minion Slots", tier: 1, state: "claimed" }),
    ]);
    expect(model.transactions).toEqual([
      expect.objectContaining({ action: "Deposit", initiator: "Wizard", amount: 1_000 }),
      expect.objectContaining({ action: "Withdraw", initiator: "CoopMate", amount: 250 }),
    ]);
  });

  it("does not call a historical started timestamp an active upgrade", () => {
    const model = buildProfileCoopPreviewModel({
      profileName: "Pomegranate",
      gameMode: null,
      selected: true,
      memberCount: 1,
      communityUpgrades: { upgrade_states: [{ upgrade: "island_size", tier: 2, started_ms: 300 }] },
      bankBalance: null,
      bankTransactions: null,
    });

    expect(model.upgrades).toEqual([
      expect.objectContaining({ label: "Island Size", tier: 2, state: "unknown" }),
    ]);
  });

  it("marks a profile partial when a shared API surface is private", () => {
    const model = buildProfileCoopPreviewModel({
      profileName: "Apple",
      gameMode: null,
      selected: false,
      memberCount: 1,
      communityUpgrades: null,
      bankBalance: null,
      bankTransactions: null,
    });

    expect(model).toMatchObject({
      state: "partial",
      gameMode: null,
      communityShared: false,
      bankShared: false,
    });
    expect(model.upgrades).toEqual([]);
    expect(model.transactions).toEqual([]);
  });
});
