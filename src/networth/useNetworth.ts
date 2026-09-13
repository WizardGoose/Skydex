import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  currentAccess,
  hasApiProfileAccess,
  identityMatches,
  identityTokenForAccess,
  useApiAccess,
} from "../island/apiKey";
import { fetchGarden, fetchMuseum, fetchProfileMembers, readSacks as readApiSacks } from "../island/hypixel";
import { makeKeyedFloorGate } from "../island/gate";
import { resourceNameFor, resourceTierFor } from "../items/itemResource";
import { cachedCatalogue, loadCatalogue } from "./catalogue";
import {
  loadPrices,
  pricesCooldownUntil,
  pricesState,
  readCachedPrices,
  subscribePrices,
} from "./prices";
import {
  emptyMemberInventoryLayouts,
  parseMemberItemsWithLayouts,
  parseMemberLoadouts,
  readCoinBalances,
  type MemberInventoryLayouts,
  type MemberLoadouts,
} from "./parseItems";
import { EMPTY_FACTS, readProfileFacts, type ProfileFacts } from "../island/profileFacts";
import { calculateNetworth } from "./profileNetworth";
import { valueIslandChests } from "./islandChests";
import { RULES_VERSION } from "./constants";
import { isRecord } from "./helpers";
import { parseCraftedGenerators, type CraftedGeneratorProfile } from "../profile/craftedGenerators";
import { profileStatusView, type ProfileLoadStatus, type ProfileStatusView } from "../profile/profileStatus";
import {
  EMPTY_PROFILE_API_DETAILS,
  readProfileApiDetails,
  type ProfileApiDetails,
} from "../profile/profileApiDetails";
import { loadCollectionDefinitions } from "../profile/collectionsResource";
import { loadBestiaryDefinitions } from "../profile/bestiaryResource";
import {
  buildProfilePbcPreviewModels,
  hydratePetsPreviewStats,
  type ProfilePbcPreviewModels,
} from "../profile/petsBestiaryCollections";
import {
  buildDungeonsPreviewModel,
  buildMuseumApiProjection,
  buildRiftItemProjection,
  buildRiftPreviewModel,
  type DungeonsPreviewModel,
  type MuseumApiProjection,
  type RiftPreviewModel,
} from "../profile/riftMuseumDungeons";
import {
  buildCrimsonIslePreviewModel,
  buildGardenPreviewModel,
  buildProfileCoopPreviewModel,
  type CrimsonIslePreviewModel,
  type GardenPreviewModel,
  type ProfileCoopPreviewModel,
} from "../profile/profileWorlds";
import type { ChestValue } from "./islandChests";
import type { ParsedItems } from "./profileNetworth";
import type { Catalogue, CoinBalances, NetworthResult, PriceMap } from "./types";
import type { IslandChest } from "../island/types";
import { readUnlockedLoadoutSlots } from "./loadoutEntitlements";
import {
  profileSnapshotIsFresh,
  readProfileSnapshot,
  writeProfileSnapshot,
} from "./profileSnapshotCache";

/**
 * The Networth section's data.
 *
 * Two layers, split because they change at different rates and cost different
 * amounts. The SOURCES layer is a network round trip plus a few hundred
 * kilobytes of NBT decoding, and it is cached in a module store so remounting
 * the page costs nothing. The VALUATION layer is pure arithmetic over what the
 * sources produced, so it re-runs freely whenever the island snapshot changes
 * and the chests need revaluing.
 *
 * Everything the section can honestly say about missing data is decided here
 * rather than in the component, because the difference between "you own
 * nothing" and "Hypixel is not telling us" is a data question, and a component
 * that has to infer it will eventually infer it wrongly.
 */

/** What Hypixel is and is not sharing. Each of these turns into a sentence on screen. */
export interface Coverage {
  /** The Inventory API toggle. Off means inventory, ender chest, storage and bags are all absent. */
  inventoryShared: boolean;
  /** Whether Hypixel returned the sack-counter surface. Optional only on legacy cached snapshots. */
  sacksShared?: boolean;
  /** The Banking API toggle. Off means the co-op bank is invisible, not zero. */
  bankShared: boolean;
  /** The Museum API toggle, or a profile that has never donated. */
  museumShared: boolean;
  /** The Personal Vault, which has its own toggle. */
  vaultShared: boolean;
  /** True once the item catalogue is in hand. Without it, stars and gemstones cannot be priced. */
  catalogueLoaded: boolean;
}

export interface SkyBlockProfileOption {
  id: string;
  name: string;
  gameMode: string | null;
  /** Whether this profile shares its Inventory API payload. Undefined only on legacy cached snapshots. */
  inventoryApiEnabled?: boolean;
}

export interface ProfileSources {
  items: ParsedItems;
  /** Exact container positions for the Inventory tab, separate from packed valuation rows. */
  inventoryLayouts: MemberInventoryLayouts;
  coins: CoinBalances;
  prices: PriceMap;
  catalogue: Catalogue;
  coverage: Coverage;
  /**
   * The plain-JSON profile facts (skill XP, first join, fairy souls), read
   * off the same member object the item parse consumed. Kept beside the items
   * because they arrive together and age together.
   */
  facts: ProfileFacts;
  /** The wardrobe, equipment wardrobe and named loadouts, for the Gear tab. */
  gearLoadouts: MemberLoadouts;
  /** Safe plain-JSON projection of slayers and Rift gallery progress. */
  apiDetails: ProfileApiDetails;
  /** Sanitized Pets, Bestiary and Collections projections. Raw member data is never retained. */
  pbc: ProfilePbcPreviewModels | null;
  /** Sanitized Rift, Museum, and Dungeons projections from the selected profile. */
  rift: RiftPreviewModel | null;
  museumApi: MuseumApiProjection | null;
  dungeons: DungeonsPreviewModel | null;
  /** Sanitized normal-profile world and shared-profile projections. */
  crimson: CrimsonIslePreviewModel | null;
  garden: GardenPreviewModel | null;
  profileCoop: ProfileCoopPreviewModel | null;
  /** Account and selected profile identity, stored with the matching cache entry. */
  playerName: string | null;
  playerUuid: string;
  profileId: string;
  profileName: string;
  gameMode: string | null;
  /** Lightweight identities for every profile returned by the same API pull. */
  profileOptions: readonly SkyBlockProfileOption[];
  /** The selected profile member player_data crafted_generators field. */
  minions: CraftedGeneratorProfile;
  /** Identity of the credential/account/profile that produced these sources. */
  identity: string;
  /** When the profile was pulled, by our clock. */
  fetchedAt: number;
}

type Sources = ProfileSources;

export interface ProfileLookupAccess {
  key: string;
  uuid: string;
  name: string;
  profileId: string | null;
}

export type NetworthStatus = ProfileLoadStatus;

interface StoreState {
  sources: Sources | null;
  status: NetworthStatus;
  error: string | null;
  /** Bumped on every successful load, so the valuation layer knows to re-run. */
  version: number;
}

let state: StoreState = { sources: null, status: "idle", error: null, version: 0 };
const listeners = new Set<() => void>();

const publish = () => {
  state = { ...state };
  for (const fn of listeners) fn();
};

/**
 * Subscribing here also subscribes to the price store.
 *
 * The identity bump is load bearing rather than cosmetic. `useSyncExternalStore`
 * compares snapshots by identity, so a price-only change (loading, an error, a
 * fresher copy) would notify and then be discarded as "nothing changed" if the
 * object came back identical. Bumping identity without bumping `version` is
 * what lets the price line re-render while the valuation, which is keyed on
 * `version`, stays exactly where it was.
 */
const subscribe = (fn: () => void): (() => void) => {
  listeners.add(fn);
  const unsubscribePrices = subscribePrices(() => {
    state = { ...state };
    fn();
  });
  return () => {
    listeners.delete(fn);
    unsubscribePrices();
  };
};

const getState = (): StoreState => state;

/**
 * The current browser's already-decoded profile inventory for non-React
 * readers such as the connected-holdings tool. This never starts a request and
 * never exposes the raw member or credential; it is the same sanitized,
 * identity-matched snapshot `useParsedProfile` reads.
 */
export const getCurrentProfileHoldings = (): Pick<ProfileSources, "items" | "coverage" | "fetchedAt"> | null => {
  const identity = identityTokenForAccess(currentAccess());
  const sources = state.sources?.identity === identity ? state.sources : null;
  return sources ? { items: sources.items, coverage: sources.coverage, fetchedAt: sources.fetchedAt } : null;
};

/** One request floor per profile identity, so duplicate pulls still coalesce. */
const SOURCES_MIN_GAP_MS = 10_000;
// A module replacement resets this file's in-memory store while React keeps
// the mounted profile tree. Including a per-module token in the load effect
// makes the dev preview recover by itself instead of requiring a page refresh.
const SOURCE_LOAD_GENERATION = {};

const hasBlob = (value: unknown): boolean => isRecord(value) && typeof value.data === "string" && value.data !== "";

const inventoryApiEnabled = (member: unknown): boolean => {
  if (!isRecord(member)) return false;
  const inventory = isRecord(member.inventory) ? member.inventory : null;
  return inventory !== null && hasBlob(inventory.inv_contents);
};

type CachedSources = Omit<Sources, "prices" | "catalogue">;

const cacheableSources = (sources: Sources): CachedSources => ({
  items: sources.items,
  inventoryLayouts: sources.inventoryLayouts,
  coins: sources.coins,
  coverage: sources.coverage,
  facts: sources.facts,
  gearLoadouts: sources.gearLoadouts,
  apiDetails: sources.apiDetails,
  pbc: sources.pbc,
  rift: sources.rift,
  museumApi: sources.museumApi,
  dungeons: sources.dungeons,
  crimson: sources.crimson,
  garden: sources.garden,
  profileCoop: sources.profileCoop,
  playerName: sources.playerName,
  playerUuid: sources.playerUuid,
  profileId: sources.profileId,
  profileName: sources.profileName,
  gameMode: sources.gameMode,
  profileOptions: sources.profileOptions,
  minions: sources.minions,
  identity: sources.identity,
  fetchedAt: sources.fetchedAt,
});

/**
 * Rejoin the profile snapshot with the independently cached price/catalogue
 * layers. Neither layer contains the Hypixel credential and both already have
 * their own freshness policy.
 */
const hydrateCachedSources = async (identity: string): Promise<Sources | null> => {
  const cached = await readProfileSnapshot<CachedSources>(identity);
  if (!cached) return null;
  // Museum endpoint metadata became part of the profile snapshot after the
  // original cache shape shipped. An otherwise fresh legacy entry must not
  // suppress the authenticated Museum call and leave that tab falsely blank.
  if (
    !Object.prototype.hasOwnProperty.call(cached, "inventoryLayouts")
    || !Object.prototype.hasOwnProperty.call(cached, "museumApi")
    || !Object.prototype.hasOwnProperty.call(cached, "crimson")
    || !Object.prototype.hasOwnProperty.call(cached, "garden")
    || !Object.prototype.hasOwnProperty.call(cached, "profileCoop")
    || !Object.prototype.hasOwnProperty.call(cached.rift ?? {}, "itemSurfaces")
    || !Object.prototype.hasOwnProperty.call(cached.gearLoadouts ?? {}, "equippedArmorSetId")
    || (cached.pbc?.collections.entries ?? []).some((entry) =>
      entry.id === "CHILI_PEPPER" && !Object.prototype.hasOwnProperty.call(entry, "sourceGate"))
  ) return null;
  const prices = pricesState().snapshot ?? readCachedPrices();
  const catalogueSnapshot = cachedCatalogue();
  if (!prices || !catalogueSnapshot) return null;
  const catalogue = catalogueSnapshot.catalogue;
  return {
    ...cached,
    profileOptions: Array.isArray(cached.profileOptions)
      ? cached.profileOptions
      : [{ id: cached.profileId, name: cached.profileName, gameMode: cached.gameMode }],
    pbc: cached.pbc ? {
      ...cached.pbc,
      pets: hydratePetsPreviewStats(cached.pbc.pets),
    } : null,
    rift: cached.rift ?? null,
    museumApi: cached.museumApi ?? null,
    dungeons: cached.dungeons ?? null,
    crimson: cached.crimson ?? null,
    garden: cached.garden ?? null,
    profileCoop: cached.profileCoop ?? null,
    prices: prices.prices,
    catalogue,
    coverage: {
      ...cached.coverage,
      catalogueLoaded: Object.keys(catalogue).length > 0,
    },
  };
};

/**
 * Load one profile identity without consulting or mutating the saved-account
 * store. The public Profile Viewer uses this path so looking at another player
 * cannot become a change to the visitor's own Profile or Settings state.
 */
export const loadProfileSources = async (
  access: ProfileLookupAccess,
  signal?: AbortSignal,
): Promise<ProfileSources> => {
  if (!hasApiProfileAccess(access)) {
    throw new Error("Skydex's Hypixel connection is unavailable right now.");
  }

  const members = await fetchProfileMembers({ uuid: access.uuid, name: access.name }, access.key, signal);
  if (!members.ok) throw new Error(members.error.message);
  if (members.value.length === 0) throw new Error("No readable SkyBlock profile was returned.");

  const chosen =
    (access.profileId ? members.value.find((candidate) => candidate.profileId === access.profileId) : undefined) ??
    members.value.find((candidate) => candidate.selected) ??
    members.value[0];

  const [museum, garden, prices, catalogue, collectionDefinitions, bestiaryDefinitions] = await Promise.all([
    fetchMuseum(chosen.profileId, access.uuid, access.key, signal),
    fetchGarden(chosen.profileId, access.key, signal),
    loadPrices(),
    loadCatalogue(),
    loadCollectionDefinitions(),
    loadBestiaryDefinitions(),
  ]);

  if (!prices) throw new Error(pricesState().error ?? "The price list could not be loaded.");

  const museumData = museum.ok ? museum.value : null;
  const fetchedAt = Math.min(
    members.fetchedAt ?? Date.now(),
    museum.ok ? museum.fetchedAt ?? Date.now() : Number.POSITIVE_INFINITY,
    garden.ok ? garden.fetchedAt ?? Date.now() : Number.POSITIVE_INFINITY,
  );
  const gardenModel = buildGardenPreviewModel(
    garden.ok ? garden.value : null,
    garden.ok ? (garden.value === null ? "never-opened" : "available") : "unavailable",
  );
  const member = isRecord(chosen.member) ? chosen.member : {};
  const inventory = isRecord(member.inventory) ? member.inventory : {};

  const [parsedMemberItems, parsedLoadouts, riftItems] = await Promise.all([
    parseMemberItemsWithLayouts(chosen.member, museumData, { catalogue }),
    parseMemberLoadouts(chosen.member),
    buildRiftItemProjection(chosen.member, (id) => catalogue[id]?.name ?? null),
  ]);
  const { items, inventoryLayouts } = parsedMemberItems;
  const gearLoadouts: MemberLoadouts = {
    ...parsedLoadouts,
    unlockedSlotCount: readUnlockedLoadoutSlots(chosen.communityUpgrades, parsedLoadouts.loadouts),
  };
  const identity = identityTokenForAccess(access);

  return {
    identity,
    items,
    inventoryLayouts,
    coins: readCoinBalances(chosen.member, chosen.bankBalance),
    prices: prices.prices,
    catalogue,
    coverage: {
      inventoryShared: hasBlob(inventory.inv_contents),
      sacksShared: readApiSacks(chosen.member) !== null,
      bankShared: chosen.bankBalance !== null,
      museumShared: museumData !== null,
      vaultShared: hasBlob(inventory.personal_vault_contents),
      catalogueLoaded: Object.keys(catalogue).length > 0,
    },
    facts: readProfileFacts(chosen.member),
    apiDetails: readProfileApiDetails(chosen.member),
    pbc: buildProfilePbcPreviewModels({
      member: chosen.member,
      pets: items.pets,
      petOptions: {
        itemNameFor: (id) => catalogue[id]?.name ?? resourceNameFor(id),
        itemTierFor: (id) => catalogue[id]?.tier?.toLowerCase() ?? resourceTierFor(id),
      },
      bestiaryDefinitions,
      collectionDefinitions,
    }),
    rift: buildRiftPreviewModel(chosen.member, {
      itemSurfaces: riftItems.itemSurfaces,
      activePet: riftItems.activePet,
      inventoryAvailable: riftItems.inventoryPresent,
      petAvailable: riftItems.petPresent,
    }),
    museumApi: museumData === null ? null : buildMuseumApiProjection(museumData),
    dungeons: buildDungeonsPreviewModel(chosen.member),
    crimson: buildCrimsonIslePreviewModel(chosen.member),
    garden: gardenModel,
    profileCoop: buildProfileCoopPreviewModel({
      profileName: chosen.cuteName,
      gameMode: chosen.gameMode,
      selected: chosen.selected,
      memberCount: chosen.memberCount ?? null,
      communityUpgrades: chosen.communityUpgrades,
      bankBalance: chosen.bankBalance ?? null,
      bankTransactions: chosen.bankTransactions,
    }),
    minions: parseCraftedGenerators(chosen.member),
    gearLoadouts,
    playerName: access.name.trim() || null,
    playerUuid: access.uuid,
    profileId: chosen.profileId,
    profileName: chosen.cuteName,
    gameMode: chosen.gameMode,
    profileOptions: members.value.map((candidate) => ({
      id: candidate.profileId,
      name: candidate.cuteName,
      gameMode: candidate.gameMode,
      inventoryApiEnabled: inventoryApiEnabled(candidate.member),
    })),
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
  };
};

let forceNextLoad = false;
type LoadOutcome = "settled" | "obsolete";

const runLoad = async (expectedIdentity: string): Promise<LoadOutcome> => {
  const access = currentAccess();
  if (!identityMatches(expectedIdentity, access)) return "obsolete";
  const force = forceNextLoad;
  forceNextLoad = false;
  try {
  if (!hasApiProfileAccess(access)) {
    state = { ...state, status: "needsKey", error: null };
    publish();
    return "settled";
  }

  if (!force) {
    const cached = await hydrateCachedSources(expectedIdentity);
    if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete";
    if (cached) {
      const fresh = profileSnapshotIsFresh(cached);
      state = {
        sources: cached,
        status: fresh ? "ready" : "loading",
        error: null,
        version: state.version + 1,
      };
      publish();
      if (fresh) return "settled";
    }
  }

  state = { ...state, status: "loading", error: null };
  publish();

  const members = await fetchProfileMembers({ uuid: access.uuid, name: access.name }, access.key);
  if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete";
  if (!members.ok) {
    state = { ...state, status: "error", error: members.error.message };
    publish();
    return "settled";
  }

  if (members.value.length === 0) throw new Error("No readable SkyBlock profile was returned.");
  // The same three-step choice `chooseProfile` makes, so the Networth section
  // and the rest of the Island page are never looking at different profiles.
  const chosen =
    (access.profileId ? members.value.find((c) => c.profileId === access.profileId) : undefined) ??
    members.value.find((c) => c.selected) ??
    members.value[0];

  // Prices and the catalogue are keyless and independent of the profile, so
  // they run alongside the profile-scoped Museum and Garden calls.
  const [museum, garden, prices, catalogue, collectionDefinitions, bestiaryDefinitions] = await Promise.all([
    fetchMuseum(chosen.profileId, access.uuid, access.key),
    fetchGarden(chosen.profileId, access.key),
    loadPrices(),
    loadCatalogue(),
    loadCollectionDefinitions(),
    loadBestiaryDefinitions(),
  ]);
  if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete";

  if (!prices) {
    state = { ...state, status: "error", error: pricesState().error ?? "The price list could not be loaded." };
    publish();
    return "settled";
  }

  const museumData = museum.ok ? museum.value : null;
  const fetchedAt = Math.min(
    members.fetchedAt ?? Date.now(),
    museum.ok ? museum.fetchedAt ?? Date.now() : Number.POSITIVE_INFINITY,
    garden.ok ? garden.fetchedAt ?? Date.now() : Number.POSITIVE_INFINITY,
  );
  const gardenModel = buildGardenPreviewModel(
    garden.ok ? garden.value : null,
    garden.ok ? (garden.value === null ? "never-opened" : "available") : "unavailable",
  );
  const member = isRecord(chosen.member) ? chosen.member : {};
  const inventory = isRecord(member.inventory) ? member.inventory : {};

  const [parsedMemberItems, parsedLoadouts, riftItems] = await Promise.all([
    parseMemberItemsWithLayouts(chosen.member, museumData, { catalogue }),
    parseMemberLoadouts(chosen.member),
    buildRiftItemProjection(chosen.member, (id) => catalogue[id]?.name ?? null),
  ]);
  const { items, inventoryLayouts } = parsedMemberItems;
  const gearLoadouts: MemberLoadouts = {
    ...parsedLoadouts,
    unlockedSlotCount: readUnlockedLoadoutSlots(chosen.communityUpgrades, parsedLoadouts.loadouts),
  };
  if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete";

  const nextSources: Sources = {
    identity: expectedIdentity,
    items,
    inventoryLayouts,
    coins: readCoinBalances(chosen.member, chosen.bankBalance),
    prices: prices.prices,
    catalogue,
    coverage: {
      // Read off the payload, not off the parsed result. An inventory that
      // decoded to nothing and an inventory Hypixel never sent look identical
      // once parsed, and only one of them is the player's own doing.
      inventoryShared: hasBlob(inventory.inv_contents),
      sacksShared: readApiSacks(chosen.member) !== null,
      bankShared: chosen.bankBalance !== null,
      museumShared: museumData !== null,
      vaultShared: hasBlob(inventory.personal_vault_contents),
      catalogueLoaded: Object.keys(catalogue).length > 0,
    },
    facts: readProfileFacts(chosen.member),
    apiDetails: readProfileApiDetails(chosen.member),
    pbc: buildProfilePbcPreviewModels({
      member: chosen.member,
      pets: items.pets,
      petOptions: {
        itemNameFor: (id) => catalogue[id]?.name ?? resourceNameFor(id),
        itemTierFor: (id) => catalogue[id]?.tier?.toLowerCase() ?? resourceTierFor(id),
      },
      bestiaryDefinitions,
      collectionDefinitions,
    }),
    rift: buildRiftPreviewModel(chosen.member, {
      itemSurfaces: riftItems.itemSurfaces,
      activePet: riftItems.activePet,
      inventoryAvailable: riftItems.inventoryPresent,
      petAvailable: riftItems.petPresent,
    }),
    museumApi: museumData === null ? null : buildMuseumApiProjection(museumData),
    dungeons: buildDungeonsPreviewModel(chosen.member),
    crimson: buildCrimsonIslePreviewModel(chosen.member),
    garden: gardenModel,
    profileCoop: buildProfileCoopPreviewModel({
      profileName: chosen.cuteName,
      gameMode: chosen.gameMode,
      selected: chosen.selected,
      memberCount: chosen.memberCount ?? null,
      communityUpgrades: chosen.communityUpgrades,
      bankBalance: chosen.bankBalance ?? null,
      bankTransactions: chosen.bankTransactions,
    }),
    minions: parseCraftedGenerators(chosen.member),
    gearLoadouts,
    playerName: access.name.trim() || null,
    playerUuid: access.uuid,
    profileId: chosen.profileId,
    profileName: chosen.cuteName,
    gameMode: chosen.gameMode,
    profileOptions: members.value.map((candidate) => ({
      id: candidate.profileId,
      name: candidate.cuteName,
      gameMode: candidate.gameMode,
      inventoryApiEnabled: inventoryApiEnabled(candidate.member),
    })),
    fetchedAt: Number.isFinite(fetchedAt) ? fetchedAt : Date.now(),
  };
  state = {
    sources: nextSources,
    status: "ready",
    error: null,
    version: state.version + 1,
  };
  publish();
  // Disk is an optional acceleration layer. A blocked database or quota must
  // never turn a successful live response into a failed profile.
  void writeProfileSnapshot(cacheableSources(nextSources)).catch(() => undefined);
  return "settled";
  } catch (error) {
    if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete";
    state = {
      ...state,
      status: "error",
      error: error instanceof Error && error.message.trim() ? error.message : "Could not read your profile data.",
    };
    publish();
    return "settled";
  }
};

const gate = makeKeyedFloorGate(async (expectedIdentity) => {
  // The key is captured before entering the gate. A profile/account change
  // between scheduling and execution makes this obsolete, not authoritative.
  if (!identityMatches(expectedIdentity, currentAccess())) return "obsolete" as const;
  return runLoad(expectedIdentity);
}, SOURCES_MIN_GAP_MS);

const requestSourceLoad = async (force = false): Promise<void> => {
  const identity = identityTokenForAccess(currentAccess());
  const hasMatchingSources = state.sources?.identity === identity;
  // A completed attempt for this identity may have become obsolete while a
  // different profile was selected. With no answer in hand its old floor is
  // not useful duplicate protection, so let this selection ask again now.
  if ((force || !hasMatchingSources) && !gate.busy(identity)) gate.reset(identity);
  // A force request arriving during another pull attaches to it. It must not
  // leave a force flag behind and create a surprise second request later.
  if (force && !gate.busy(identity)) forceNextLoad = true;
  const outcome = await gate.run(identity);
  if (force && outcome === undefined && !gate.busy(identity)) forceNextLoad = false;
  // If this call attached to work that had already become obsolete, make the
  // current selection's one real attempt rather than waiting for a refresh.
  if (outcome === "obsolete" && identityMatches(identity, currentAccess())) {
    gate.reset(identity);
    if (force) forceNextLoad = true;
    await gate.run(identity);
  }
};

/** When the refresh button may fire again. The later of the two floors involved. */
export const networthCooldownUntil = (): number => Math.max(
  gate.cooldownUntil(identityTokenForAccess(currentAccess())),
  pricesCooldownUntil(),
);

/**
 * Test seam, matching `setPricesForTesting` and `setCatalogueForTesting`.
 *
 * The panel's populated branch is the half that renders numbers, and there is
 * no way to reach it without either a network round trip or a door like this
 * one. Nothing in the app calls it.
 */
export const setSourcesForTesting = (sources: {
  items: ParsedItems;
  inventoryLayouts?: MemberInventoryLayouts;
  coins: CoinBalances;
  prices: PriceMap;
  catalogue: Catalogue;
  coverage: Coverage;
  facts?: ProfileFacts;
  gearLoadouts?: MemberLoadouts;
  apiDetails?: ProfileApiDetails;
  pbc?: ProfilePbcPreviewModels | null;
  rift?: RiftPreviewModel | null;
  museumApi?: MuseumApiProjection | null;
  dungeons?: DungeonsPreviewModel | null;
  crimson?: CrimsonIslePreviewModel | null;
  garden?: GardenPreviewModel | null;
  profileCoop?: ProfileCoopPreviewModel | null;
  playerName?: string | null;
  playerUuid?: string;
  profileId?: string;
  profileName?: string;
  gameMode?: string | null;
  profileOptions?: readonly SkyBlockProfileOption[];
  minions?: CraftedGeneratorProfile;
  status?: NetworthStatus;
  error?: string | null;
  withoutSources?: boolean;
}): void => {
  state = {
    sources: sources.withoutSources ? null : {
      ...sources,
      identity: identityTokenForAccess(currentAccess()),
      inventoryLayouts: sources.inventoryLayouts ?? emptyMemberInventoryLayouts(),
      facts: sources.facts ?? EMPTY_FACTS,
      apiDetails: sources.apiDetails ?? EMPTY_PROFILE_API_DETAILS,
      pbc: sources.pbc ?? null,
      rift: sources.rift ?? null,
      museumApi: sources.museumApi ?? null,
      dungeons: sources.dungeons ?? null,
      crimson: sources.crimson ?? null,
      garden: sources.garden ?? null,
      profileCoop: sources.profileCoop ?? null,
      gearLoadouts: sources.gearLoadouts ?? EMPTY_LOADOUTS,
      playerName: sources.playerName ?? "TestPlayer",
      playerUuid: sources.playerUuid ?? "00000000000040008000000000000000",
      profileId: sources.profileId ?? "test-profile",
      profileName: sources.profileName ?? "Test",
      gameMode: sources.gameMode ?? null,
      profileOptions: sources.profileOptions ?? [{
        id: sources.profileId ?? "test-profile",
        name: sources.profileName ?? "Test",
        gameMode: sources.gameMode ?? null,
        inventoryApiEnabled: sources.coverage.inventoryShared,
      }],
      minions: sources.minions ?? { available: false, highestByFamily: {}, raw: [], unmapped: [] },
      fetchedAt: Date.now(),
    },
    status: sources.status ?? "ready",
    error: sources.error ?? null,
    version: state.version + 1,
  };
  publish();
};

/**
 * The parsed profile without the valuation.
 *
 * The Island page's gear and pet sections need the decoded containers and
 * nothing else, and the valuation is the expensive half of `useNetworth`. This
 * reads the same store, so the page and the panel are always looking at the
 * same pull, and it deliberately does NOT trigger a load: the NetworthPanel on
 * the same page owns that, and two components racing the same gate would be
 * two of everything for no data.
 */
export interface ParsedProfileView {
  parsed: ParsedItems | null;
  /** Current Hypixel item catalogue, including canonical Museum bundle definitions. */
  catalogue: Catalogue | null;
  /** Exact slot positions for inventory-shaped profile containers. */
  inventoryLayouts: MemberInventoryLayouts | null;
  /** Skill XP, first join and fairy souls, from the same pull. Null before it. */
  facts: ProfileFacts | null;
  /** The wardrobe, equipment wardrobe and named loadouts. Empty until a pull lands. */
  gearLoadouts: MemberLoadouts;
  /** Slayers and Rift gallery progress from the same member payload. */
  apiDetails: ProfileApiDetails | null;
  /** Sanitized Pets, Bestiary and Collections projections from the same member payload. */
  pbc: ProfilePbcPreviewModels | null;
  /** Sanitized Rift, Museum, and Dungeons projections from the selected profile. */
  rift: RiftPreviewModel | null;
  museumApi: MuseumApiProjection | null;
  dungeons: DungeonsPreviewModel | null;
  crimson: CrimsonIslePreviewModel | null;
  garden: GardenPreviewModel | null;
  profileCoop: ProfileCoopPreviewModel | null;
  playerName: string | null;
  playerUuid: string | null;
  profileId: string | null;
  profileName: string | null;
  gameMode: string | null;
  profileOptions: readonly SkyBlockProfileOption[];
  /** Crafted minion tiers from the selected profile member, or null before a pull. */
  minions: CraftedGeneratorProfile | null;
  /** When the profile was pulled, by our clock. Null before the first pull. */
  fetchedAt: number | null;
  coverage: Coverage | null;
  status: NetworthStatus;
  error: string | null;
  profileStatus: ProfileStatusView;
}

/** One stable empty, so a keyless render does not mint fresh objects per frame and defeat downstream memos. */
const EMPTY_LOADOUTS: MemberLoadouts = {
  armorSets: [],
  equippedArmorSetId: null,
  equipmentSets: [],
  wornEquipment: [null, null, null, null],
  equippedEquipmentSetId: null,
  loadouts: [],
};

/** The state a profile consumer can honestly show for the current identity. */
export const visibleProfileStatus = (
  storeStatus: NetworthStatus,
  hasMatchingSources: boolean,
  hasAccess: boolean,
): NetworthStatus => {
  // A matching last-good snapshot remains readable even when the credential
  // has since been removed. The key controls refresh, not whether local data
  // the player already loaded is allowed to stay visible.
  if (hasMatchingSources) {
    if (storeStatus !== "idle") return storeStatus;
    return hasAccess ? "loading" : "needsKey";
  }
  if (!hasAccess) return "needsKey";
  // `ready` can belong to the profile the user just switched away from. It is
  // loading for the new identity, while a real error must remain an error.
  return storeStatus === "error" ? "error" : "loading";
};

/**
 * Keep the shared sanitized profile projection current without calculating a
 * net-worth result. Profile-native pages such as Recipes need collection and
 * progression data, but should not pay for a valuation merely to trigger the
 * same guarded source load.
 */
export const useEnsureProfileSources = (): void => {
  const { access } = useApiAccess();
  const currentIdentity = identityTokenForAccess(access);
  const hasProfileAccess = hasApiProfileAccess(access);

  useEffect(() => {
    const sources = state.sources?.identity === currentIdentity ? state.sources : null;
    if (!hasProfileAccess) {
      if (state.status !== "needsKey") {
        state = { ...state, status: "needsKey", error: null };
        publish();
      }
      return;
    }
    if (profileSnapshotIsFresh(sources)) {
      if (state.status === "needsKey") {
        state = { ...state, status: "ready", error: null };
        publish();
      }
      return;
    }
    void requestSourceLoad().catch(() => undefined);
  // This token changes only when hot replacement remounts the module-level
  // store, matching the lifecycle used by `useNetworth` below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.profileId, access.uuid, currentIdentity, hasProfileAccess, SOURCE_LOAD_GENERATION]);
};

export const useParsedProfile = (): ParsedProfileView => {
  const store = useSyncExternalStore(subscribe, getState, getState);
  const access = currentAccess();
  const identity = identityTokenForAccess(access);
  const sources = store.sources?.identity === identity ? store.sources : null;
  const status = visibleProfileStatus(store.status, sources !== null, hasApiProfileAccess(access));
  return {
    parsed: sources?.items ?? null,
    catalogue: sources?.catalogue ?? null,
    inventoryLayouts: sources?.inventoryLayouts ?? null,
    facts: sources?.facts ?? null,
    gearLoadouts: sources?.gearLoadouts ?? EMPTY_LOADOUTS,
    apiDetails: sources?.apiDetails ?? null,
    pbc: sources?.pbc ?? null,
    rift: sources?.rift ?? null,
    museumApi: sources?.museumApi ?? null,
    dungeons: sources?.dungeons ?? null,
    crimson: sources?.crimson ?? null,
    garden: sources?.garden ?? null,
    profileCoop: sources?.profileCoop ?? null,
    playerName: sources?.playerName ?? null,
    playerUuid: sources?.playerUuid ?? null,
    profileId: sources?.profileId ?? null,
    profileName: sources?.profileName ?? null,
    gameMode: sources?.gameMode ?? null,
    profileOptions: sources?.profileOptions ?? [],
    minions: sources?.minions ?? null,
    fetchedAt: sources?.fetchedAt ?? null,
    coverage: sources?.coverage ?? null,
    status,
    error: store.error,
    profileStatus: profileStatusView(status, sources !== null),
  };
};

export interface NetworthView {
  result: NetworthResult | null;
  /**
   * The parsed profile containers as decoded, before valuation.
   *
   * The valuation's category lists drop zero-priced rows on purpose, which is
   * right for a coin figure and wrong for a profile viewer: a wardrobe piece
   * nobody would pay for is still hanging in the wardrobe. The gear and pet
   * sections of the Island page read this instead, so what they show is what
   * the profile holds rather than what the market rates.
   */
  parsed: ParsedItems | null;
  /** When the profile behind `parsed` was pulled, by our clock. Null before the first pull. */
  fetchedAt: number | null;
  /** Per chest, for the drilldown. Empty when the mod has not reported any. */
  chests: ChestValue[];
  status: NetworthStatus;
  error: string | null;
  coverage: Coverage | null;
  profileStatus: ProfileStatusView;
  profileName: string | null;
  /** When the price list in use was downloaded. Null when there is none. */
  pricesAt: number | null;
  pricesFrom: "network" | "storage" | null;
  pricesError: string | null;
  pricesLoading: boolean;
  /** Which upstream ruleset this port tracks, so the number can name its own rules. */
  rulesVersion: string;
  refresh: (force?: boolean) => Promise<void>;
}

/**
 * The Networth section's whole data surface.
 *
 * `chests` is a prop rather than something this reaches for, because the Island
 * page already merges the mod and API feeds and there must be exactly one
 * merged island in this codebase. Passing it in keeps the merge where it lives.
 */
export const useNetworth = (chests: readonly IslandChest[]): NetworthView => {
  const { access } = useApiAccess();
  const store = useSyncExternalStore(subscribe, getState, getState);
  const prices = pricesState();
  const currentIdentity = identityTokenForAccess(access);
  const activeSources = store.sources?.identity === currentIdentity ? store.sources : null;
  const hasProfileAccess = hasApiProfileAccess(access);

  // One unforced load on arrival, and another when Settings supplies a key or
  // changes the account/profile. A refresh with a cache keeps that cache visible
  // while loading; a failed refresh leaves it in place with `profileStatus.phase`
  // set to `stale`.
  useEffect(() => {
    const sources = state.sources?.identity === currentIdentity ? state.sources : null;
    if (!hasProfileAccess) {
      if (state.status !== "needsKey") {
        state = { ...state, status: "needsKey", error: null };
        publish();
      }
      return;
    }
    if (profileSnapshotIsFresh(sources)) {
      if (state.status === "needsKey") {
        state = { ...state, status: "ready", error: null };
        publish();
      }
      return;
    }
    void requestSourceLoad().catch(() => undefined);
  // The module-generation dependency changes only when the dev server replaces
  // this store module and must restart the otherwise preserved effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [access.profileId, access.uuid, currentIdentity, hasProfileAccess, SOURCE_LOAD_GENERATION]);

  const refresh = useCallback(async (force = false) => {
    const refreshIdentity = identityTokenForAccess(currentAccess());
    const sources = state.sources?.identity === refreshIdentity ? state.sources : null;
    if (!force && profileSnapshotIsFresh(sources)) return;
    // A manual refresh gets fresh prices too. Stale prices under a button
    // labelled Refresh would be the wrong kind of surprise.
    if (force) await loadPrices(true);
    await requestSourceLoad(force);
  }, []);

  const { result, chestValues } = useMemo(() => {
    const sources = activeSources;
    if (!sources) return { result: null, chestValues: [] as ChestValue[] };

    const chestData = valueIslandChests(chests, sources.prices, sources.catalogue);
    const items: ParsedItems = { ...sources.items, island_chests: chestData.items };
    return {
      result: calculateNetworth(items, sources.coins, {
        prices: sources.prices,
        catalogue: sources.catalogue,
      }),
      chestValues: chestData.chests,
    };
    // `version` rather than `sources`, because the store publishes a new object
    // on every notification (including price-store ones) and the valuation is
    // the expensive half.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.version, chests, currentIdentity]);

  const status = visibleProfileStatus(
    store.status,
    activeSources !== null,
    hasProfileAccess,
  );
  return {
    result,
    parsed: activeSources?.items ?? null,
    fetchedAt: activeSources?.fetchedAt ?? null,
    chests: chestValues,
    // `idle` is the state before the effect has run, and it is never worth
    // showing: either there is no key and the answer is already known, or there
    // is one and a load is a tick away.
    status,
    error: store.error,
    coverage: activeSources?.coverage ?? null,
    profileStatus: profileStatusView(status, activeSources !== null),
    profileName: activeSources?.profileName ?? null,
    pricesAt: prices.snapshot?.fetchedAt ?? null,
    pricesFrom: prices.snapshot?.from ?? null,
    pricesError: prices.error,
    pricesLoading: prices.status === "loading",
    rulesVersion: RULES_VERSION,
    refresh,
  };
};
