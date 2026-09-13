import { currentAccess, hasApiProfileAccess } from "../island/apiKey";
import { resolveAccount } from "../island/hypixel";
import { requestSkillDefs, skillDefsStore, type SkillDefs } from "../island/skills";
import {
  resourceCategoryFor,
  resourceNameFor,
  resourceTierFor,
} from "../items/itemResource";
import { calculateNetworth } from "../networth/profileNetworth";
import type { NetworthResult, ValuedItem } from "../networth/types";
import {
  loadProfileSources,
  type ProfileLookupAccess,
  type ProfileSources,
} from "../networth/useNetworth";
import { buildMuseumPreviewModel } from "../profile/riftMuseumDungeons";
import {
  resolveCollectionSourceGate,
  tradingAllowedForGameMode,
} from "../profile/collectionSourceGate";
import { PROFILE_TABS, type ProfileTab } from "../profile/profileTabs";
import { parseCraftedGenerators as parseCatalogueCraftedGenerators } from "../profile/minions";
import type { CraftedGeneratorProfile } from "../profile/craftedGenerators";
import { currentProfile } from "../profile/useProfile";
import { buildProfileViewModel, type ProfileViewModel } from "../profile/profileViewModel";
import {
  enumValue,
  freshness,
  humanizeId,
  inputObject,
  limited,
  optionalInteger,
  optionalString,
  WebMcpToolError,
} from "./shared";

export type ProfileToolScope = "connected_browser" | "public_lookup";

export interface LoadedProfileSnapshot {
  scope: ProfileToolScope;
  sources: ProfileSources;
  model: ProfileViewModel | null;
  networth: NetworthResult;
  now: number;
}

export interface ProfileLoadDependencies {
  connectedAccess(): ProfileLookupAccess;
  hasConnectedAccess(access: ProfileLookupAccess): boolean;
  resolvePlayer(player: string): ReturnType<typeof resolveAccount>;
  loadSources(access: ProfileLookupAccess): Promise<ProfileSources>;
  loadSkillDefinitions(): Promise<SkillDefs | null>;
  now(): number;
}

const waitForSkillDefinitions = (): Promise<SkillDefs | null> => {
  const ready = skillDefsStore.getSnapshot();
  if (ready.defs || ready.status === "error") return Promise.resolve(ready.defs);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (defs: SkillDefs | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(defs);
    };
    const unsubscribe = skillDefsStore.subscribe(() => {
      const state = skillDefsStore.getSnapshot();
      if (state.defs || state.status === "error") finish(state.defs);
    });
    const timer = setTimeout(() => finish(skillDefsStore.getSnapshot().defs), 8_000);
    requestSkillDefs();
    const state = skillDefsStore.getSnapshot();
    if (state.defs || state.status === "error") finish(state.defs);
  });
};

const DEFAULT_DEPENDENCIES: ProfileLoadDependencies = {
  connectedAccess: () => currentAccess(),
  hasConnectedAccess: (access) => hasApiProfileAccess(access),
  resolvePlayer: (player) => resolveAccount(player),
  loadSources: (access) => loadProfileSources(access),
  loadSkillDefinitions: waitForSkillDefinitions,
  now: Date.now,
};

/**
 * Resolve the profile request without ever crossing the private/public seam.
 * Supplying `player` always constructs a fresh keyless lookup. The browser's
 * saved identity is not even read on that branch.
 */
export const loadProfileSnapshot = async (
  query: { player: string | null; profileId: string | null },
  dependencies: ProfileLoadDependencies = DEFAULT_DEPENDENCIES,
): Promise<LoadedProfileSnapshot> => {
  let scope: ProfileToolScope;
  let access: ProfileLookupAccess;
  let playerFallback: string | null = null;

  if (query.player !== null) {
    scope = "public_lookup";
    const resolved = await dependencies.resolvePlayer(query.player);
    if (!resolved.ok) {
      throw new WebMcpToolError("player_not_found", resolved.error.message);
    }
    playerFallback = resolved.value.name || query.player;
    access = {
      key: "",
      uuid: resolved.value.uuid,
      name: resolved.value.name || query.player,
      profileId: query.profileId,
    };
  } else {
    scope = "connected_browser";
    const connected = dependencies.connectedAccess();
    if (!dependencies.hasConnectedAccess(connected)) {
      throw new WebMcpToolError(
        "needs_player",
        "No player is linked in this browser. Provide player for a public lookup or link one in Skydex Settings.",
      );
    }
    access = { ...connected, profileId: query.profileId ?? connected.profileId };
    playerFallback = connected.name || null;
  }

  const [sources, skillDefs] = await Promise.all([
    dependencies.loadSources(access),
    dependencies.loadSkillDefinitions(),
  ]);
  if (query.profileId !== null && sources.profileId !== query.profileId) {
    throw new WebMcpToolError(
      "profile_not_found",
      `The requested profile ID ${query.profileId} was not returned for this player.`,
    );
  }
  const networth = calculateNetworth(sources.items, sources.coins, {
    prices: sources.prices,
    catalogue: sources.catalogue,
  });
  const model = buildProfileViewModel({
    playerName: sources.playerName ?? playerFallback,
    playerUuid: sources.playerUuid,
    profileName: sources.profileName,
    gameMode: sources.gameMode,
    fetchedAt: sources.fetchedAt,
    facts: sources.facts,
    apiDetails: sources.apiDetails,
    parsed: sources.items,
    gearLoadouts: sources.gearLoadouts,
    coverage: sources.coverage,
    networth,
    skillDefs,
    skillIcons: null,
    itemNameFor: resourceNameFor,
    itemTierFor: resourceTierFor,
  });

  return { scope, sources, model, networth, now: dependencies.now() };
};

const profileQuery = (input: unknown) => {
  const object = inputObject(input);
  return {
    player: optionalString(object, "player", 36),
    profileId: optionalString(object, "profile_id", 64),
  };
};

const common = (snapshot: LoadedProfileSnapshot) => ({
  scope: snapshot.scope,
  player: {
    name: snapshot.sources.playerName,
    uuid: snapshot.sources.playerUuid,
    profile_name: snapshot.sources.profileName,
    profile_id: snapshot.sources.profileId,
    game_mode: snapshot.sources.gameMode ?? "normal",
  },
  freshness: freshness(snapshot.sources.fetchedAt, snapshot.now),
  coverage: {
    inventory: snapshot.sources.coverage.inventoryShared,
    bank: snapshot.sources.coverage.bankShared,
    museum: snapshot.sources.coverage.museumShared,
    personal_vault: snapshot.sources.coverage.vaultShared,
    item_catalogue: snapshot.sources.coverage.catalogueLoaded,
  },
});

/** Keep WebMCP minion counts on the same shipped catalogue boundary as /profile. */
export const catalogueMinionProfile = (
  profile: CraftedGeneratorProfile,
): CraftedGeneratorProfile => {
  if (!profile.available || profile.raw.length === 0) return profile;
  return parseCatalogueCraftedGenerators({
    player_data: { crafted_generators: profile.raw },
  });
};

const sectionStates = (snapshot: LoadedProfileSnapshot): Record<ProfileTab, string> => {
  const { sources, model, networth } = snapshot;
  const minions = catalogueMinionProfile(sources.minions);
  return {
    gear: model?.loadout.inventoryAvailable ? "populated" : sources.coverage.inventoryShared ? "empty" : "private",
    accessories: sources.coverage.inventoryShared
      ? (networth.types.accessories?.items.length ?? 0) > 0 ? "populated" : "empty"
      : "private",
    pets: sources.pbc?.pets.available
      ? sources.pbc.pets.entries.length > 0 ? "populated" : "empty"
      : "unavailable",
    minions: minions.available
      ? Object.keys(minions.highestByFamily).length > 0 ? "populated" : "empty"
      : "private",
    inventory: sources.coverage.inventoryShared ? "populated" : "private",
    skills: Object.keys(sources.facts.skillXp).length > 0 ? "populated" : "unavailable",
    network: Number.isFinite(networth.networth) ? "populated" : "unavailable",
    rift: sources.rift?.state ?? "unavailable",
    crimson: sources.crimson?.state ?? "unavailable",
    garden: sources.garden?.state ?? "unavailable",
    museum: sources.coverage.museumShared ? "populated" : "private",
    bestiary: sources.pbc?.bestiary.available
      ? sources.pbc.bestiary.entries.length > 0 ? "populated" : "empty"
      : "unavailable",
    collections: sources.pbc?.collections.available
      ? sources.pbc.collections.entries.length > 0 ? "populated" : "empty"
      : "unavailable",
    dungeons: sources.dungeons?.state ?? "unavailable",
    coop: sources.profileCoop?.state ?? "unavailable",
  };
};

const compactValueItem = (item: ValuedItem) => ({
  id: item.id,
  name: item.name,
  count: item.count,
  estimated_value: item.price,
  soulbound: item.soulbound,
});

const allValuedItems = (snapshot: LoadedProfileSnapshot): ValuedItem[] =>
  Object.values(snapshot.networth.types)
    .flatMap((category) => category.items)
    .sort((left, right) => right.price - left.price || left.name.localeCompare(right.name));

const sectionData = (
  snapshot: LoadedProfileSnapshot,
  section: ProfileTab,
  limit: number,
): unknown => {
  const { sources, model, networth } = snapshot;
  const minions = catalogueMinionProfile(sources.minions);

  if (section === "gear") {
    const loadout = model?.loadout;
    if (!loadout) return null;
    return {
      active_loadout: {
        name: loadout.name,
        armour_set: loadout.armourSetName,
        armour: loadout.armour.map((item) => item && ({ id: item.id, name: item.name, rarity: item.rarity, count: item.count })),
        equipment: loadout.equipment.map((item) => item && ({ id: item.id, name: item.name, rarity: item.rarity, count: item.count })),
        pet: loadout.pet && { name: loadout.pet.name, tier: loadout.pet.tier, level: loadout.pet.level },
        contexts: loadout.contexts.map((entry) => ({ label: entry.label, value: entry.value })),
        tuning: loadout.tuning.map((entry) => ({ stat: entry.label, value: entry.value })),
      },
      wardrobe: {
        armour_sets: loadout.armourWardrobe.savedCount,
        equipment_sets: loadout.equipmentWardrobe.savedCount,
      },
      saved_loadouts: limited(loadout.choices.map((entry) => ({
        id: entry.id,
        name: entry.title,
        state: entry.state,
        active: entry.active,
      })), limit),
    };
  }

  if (section === "accessories") {
    const category = networth.types.accessories;
    const entries = [...(category?.items ?? [])]
      .sort((left, right) => right.price - left.price || left.name.localeCompare(right.name))
      .map(compactValueItem);
    return {
      estimated_value: category?.total ?? 0,
      item_count: category?.items.reduce((sum, item) => sum + item.count, 0) ?? 0,
      selected_power: sources.facts.selectedPower,
      tuning: model?.loadout.tuning.map((entry) => ({ stat: entry.label, value: entry.value })) ?? [],
      items: limited(entries, limit),
    };
  }

  if (section === "pets") {
    const pets = sources.pbc?.pets;
    if (!pets) return null;
    return {
      available: pets.available,
      unique_types: pets.uniqueTypes,
      total_xp: pets.totalXp,
      active_id: pets.activeId,
      partial: pets.partial,
      pets: limited(pets.entries.map((pet) => ({
        id: pet.id,
        name: pet.name,
        tier: pet.tier,
        level: pet.level,
        active: pet.active,
        held_item: pet.heldItem?.name ?? null,
        skin: pet.skin?.name ?? null,
      })), limit),
    };
  }

  if (section === "minions") {
    const rows = Object.entries(minions.highestByFamily)
      .map(([id, tier]) => ({ id, name: humanizeId(id), highest_crafted_tier: tier }))
      .sort((left, right) => right.highest_crafted_tier - left.highest_crafted_tier || left.name.localeCompare(right.name));
    return {
      available: minions.available,
      recognized_families: rows.length,
      unmapped_count: minions.unmapped.length,
      families: limited(rows, limit),
    };
  }

  if (section === "inventory") {
    const categories = Object.entries(networth.types)
      .filter(([, category]) => category.items.length > 0)
      .map(([id, category]) => ({
        id,
        name: humanizeId(id),
        item_count: category.items.reduce((sum, item) => sum + item.count, 0),
        estimated_value: category.total,
      }))
      .sort((left, right) => right.estimated_value - left.estimated_value);
    return {
      shared: sources.coverage.inventoryShared,
      categories: limited(categories, limit),
      top_items: limited(allValuedItems(snapshot).map(compactValueItem), limit),
    };
  }

  if (section === "skills") {
    return {
      skyblock_level: model?.skyblockLevel?.level ?? null,
      skills: limited((model?.skills ?? []).map((skill) => ({
        id: skill.key,
        name: skill.name,
        level: skill.level,
        cap: skill.capLevel ?? null,
        lifetime_xp: skill.lifetimeXp ?? null,
        progress_percent: skill.progress,
      })), limit),
      slayers: limited((model?.slayers ?? []).map((slayer) => ({
        id: slayer.key,
        name: slayer.name,
        level: slayer.level,
        lifetime_xp: slayer.lifetimeXp ?? null,
      })), limit),
    };
  }

  if (section === "network") {
    const categories = Object.entries(networth.types)
      .filter(([, category]) => category.total > 0)
      .map(([id, category]) => ({ id, name: humanizeId(id), estimated_value: category.total }))
      .sort((left, right) => right.estimated_value - left.estimated_value);
    return {
      estimated_networth: networth.networth,
      estimated_unsoulbound_networth: networth.unsoulboundNetworth,
      purse: networth.purse,
      personal_bank: networth.personalBank,
      coop_bank: sources.coverage.bankShared ? networth.bank : null,
      bank_shared: sources.coverage.bankShared,
      categories: limited(categories, limit),
    };
  }

  if (section === "rift") {
    const rift = sources.rift;
    if (!rift) return null;
    return {
      state: rift.state,
      consumed_prism: rift.consumedPrism ?? null,
      currencies: rift.currencies,
      stats: limited(rift.stats, limit),
      timecharms: limited(rift.timecharms, limit),
      quests: limited(rift.quests, limit),
      active_pet: rift.activePet ?? null,
      item_surfaces: limited((rift.itemSurfaces ?? []).map((surface) => ({
        key: surface.key,
        label: surface.label,
        state: surface.state,
        items: limited(surface.slots.filter((item) => item !== null).map((item) => ({
          id: item.id,
          name: item.name,
          count: item.count,
          tier: item.tier,
        })), limit),
      })), limit),
      missing_fields: rift.missingFields,
    };
  }

  if (section === "crimson") {
    const crimson = sources.crimson;
    if (!crimson) return null;
    return {
      state: crimson.state,
      faction: crimson.selectedFaction,
      mage_reputation: crimson.mageReputation,
      barbarian_reputation: crimson.barbarianReputation,
      abiphone_contacts: crimson.abiphoneContacts,
      kuudra: crimson.kuudra,
      dojo: limited(crimson.dojo, limit),
      trophy_fish: limited(crimson.trophyFish, limit),
      availability: crimson.availability ?? null,
    };
  }

  if (section === "garden") {
    const garden = sources.garden;
    if (!garden) return null;
    return {
      state: garden.state,
      experience: garden.experience,
      unlocked_plots: garden.unlockedPlots.length,
      selected_barn_skin: garden.selectedBarnSkin?.label ?? null,
      visitors_completed: garden.totalVisitorsCompleted,
      unique_visitors_served: garden.uniqueVisitorsServed,
      crops: limited(garden.crops, limit),
      active_commissions: limited(garden.activeCommissions, limit),
      composter: garden.composter,
      desk_upgrades: limited(garden.deskUpgrades, limit),
      availability: garden.availability ?? null,
    };
  }

  if (section === "museum") {
    const museum = buildMuseumPreviewModel({
      parsed: sources.items,
      result: networth,
      coverage: sources.coverage,
      api: sources.museumApi,
      catalogue: sources.catalogue,
      itemNameFor: resourceNameFor,
      itemCategoryFor: resourceCategoryFor,
    });
    return {
      state: museum.state,
      reported_value: museum.api?.value ?? museum.value,
      completion: museum.completion,
      partial: museum.partial,
      donations: limited(museum.donations.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category ?? null,
        count: entry.count,
        tier: entry.tier,
        estimated_value: entry.value,
      })), limit),
      collection_units: limited((museum.collectionUnits ?? []).map((unit) => ({
        key: unit.key,
        label: unit.label,
        kind: unit.kind,
        state: unit.state,
        donated_at: unit.donatedAt,
      })), limit),
      missing_fields: museum.api?.missingFields ?? [],
    };
  }

  if (section === "bestiary") {
    const bestiary = sources.pbc?.bestiary;
    if (!bestiary) return null;
    return {
      available: bestiary.available,
      total_kills: bestiary.totalKills,
      families_unlocked: bestiary.familiesUnlocked,
      families_completed: bestiary.familiesCompleted,
      family_tiers: bestiary.familyTiers,
      max_family_tiers: bestiary.maxFamilyTiers,
      partial: bestiary.partial,
      families: limited(bestiary.entries.map((entry) => ({
        id: entry.id,
        name: entry.name,
        category: entry.category,
        kills: entry.kills,
        tier: entry.tier,
        max_tier: entry.maxTier,
        next_tier: entry.nextTier,
        next_required: entry.nextRequired,
      })), limit),
    };
  }

  if (section === "collections") {
    const collections = sources.pbc?.collections;
    if (!collections) return null;
    const configuredProfile = currentProfile();
    const sourceGameMode = snapshot.scope === "connected_browser" && configuredProfile.source === "manual"
      ? configuredProfile.mode
      : sources.gameMode;
    const tradingAllowed = tradingAllowedForGameMode(sourceGameMode);
    return {
      available: collections.available,
      unlocked_collections: collections.unlockedCollections,
      maxed_collections: collections.maxedCollections,
      unlocked_tiers: collections.unlockedTiers,
      max_tiers: collections.maxTiers,
      partial: collections.partial,
      collections: limited(collections.entries.map((entry) => {
        const sourceAccess = resolveCollectionSourceGate(entry.sourceGate, tradingAllowed);
        return {
          id: entry.id,
          name: entry.name,
          category: entry.category,
          amount: entry.amount,
          unlocked_tier: entry.unlockedTier,
          max_tier: entry.maxTier,
          next_tier: entry.nextTier,
          next_required: entry.nextRequired,
          source_access: sourceAccess && entry.sourceGate ? {
            state: sourceAccess.state,
            route: sourceAccess.route,
            label: sourceAccess.label,
            source: entry.sourceGate.sourceName,
            requirement: {
              kind: entry.sourceGate.requirement.kind,
              target: entry.sourceGate.requirement.target,
              threshold: entry.sourceGate.requirement.threshold,
              state: entry.sourceGate.requirement.state,
              current: entry.sourceGate.requirement.have,
            },
          } : null,
        };
      }), limit),
    };
  }

  if (section === "dungeons") {
    const dungeons = sources.dungeons;
    if (!dungeons) return null;
    return {
      state: dungeons.state,
      catacombs_experience: dungeons.catacombsExperience,
      highest_floor: dungeons.highestFloor,
      secrets_found: dungeons.secretsFound,
      selected_class: dungeons.selectedClass,
      dungeon_types: dungeons.dungeonTypes,
      classes: limited(dungeons.classes, limit),
      floors: limited(dungeons.floors, limit),
      best_runs: limited(dungeons.bestRuns, limit),
      essence: limited(dungeons.essence, limit),
      rewards: limited(dungeons.rewards, limit),
      partial: dungeons.partial,
    };
  }

  const coop = sources.profileCoop;
  if (!coop) return null;
  return {
    state: coop.state,
    profile_name: coop.profileName,
    game_mode: coop.gameMode,
    selected: coop.selected,
    member_count: coop.memberCount,
    bank_balance: coop.bankShared ? coop.bankBalance : null,
    bank_shared: coop.bankShared,
    community_shared: coop.communityShared,
    upgrades: limited(coop.upgrades, limit),
    transactions: limited(coop.transactions, limit),
  };
};

export const profileOverview = async (input: unknown): Promise<unknown> => {
  const snapshot = await loadProfileSnapshot(profileQuery(input));
  const states = sectionStates(snapshot);
  const model = snapshot.model;
  const minions = catalogueMinionProfile(snapshot.sources.minions);
  return {
    ok: true,
    ...common(snapshot),
    summary: {
      skyblock_level: model?.skyblockLevel?.level ?? null,
      estimated_networth: snapshot.networth.networth,
      purse: snapshot.networth.purse,
      bank: snapshot.sources.coverage.bankShared
        ? snapshot.networth.bank + snapshot.networth.personalBank
        : null,
      active_armour_set: model?.loadout.armourSetName ?? null,
      active_pet: model?.loadout.pet?.name ?? null,
      skills_reported: model?.skills.length ?? Object.keys(snapshot.sources.facts.skillXp).length,
      pets_reported: snapshot.sources.pbc?.pets.entries.length ?? null,
      crafted_minion_families: minions.available
        ? Object.keys(minions.highestByFamily).length
        : null,
    },
    sections: PROFILE_TABS.map((section) => ({ section, state: states[section] })),
    profiles: limited(snapshot.sources.profileOptions.map((profile) => ({
      profile_id: profile.id,
      profile_name: profile.name,
      game_mode: profile.gameMode ?? "normal",
      inventory_shared: profile.inventoryApiEnabled ?? null,
      selected: profile.id === snapshot.sources.profileId,
    })), 25),
  };
};

export const profileSection = async (input: unknown): Promise<unknown> => {
  const object = inputObject(input);
  const section = enumValue(object, "section", PROFILE_TABS);
  const limit = optionalInteger(object, "limit", 8, 1, 25);
  const snapshot = await loadProfileSnapshot({
    player: optionalString(object, "player", 36),
    profileId: optionalString(object, "profile_id", 64),
  });
  return {
    ok: true,
    ...common(snapshot),
    section,
    state: sectionStates(snapshot)[section],
    data: sectionData(snapshot, section, limit),
  };
};
