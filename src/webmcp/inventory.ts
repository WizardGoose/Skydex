import {
  buildOwned,
  SOURCE_LABEL,
  type ProfileHoldingsInput,
} from "../inventory/aggregate";
import type { AllocationInventory } from "../items/craftingAllocation";
import { getShardIds, subscribeShardIds } from "../inventory/shardIds";
import { getShards, subscribeShards } from "../inventory/shardsStore";
import {
  getInventoryManagement,
  subscribeInventoryManagement,
} from "../inventory/managementStore";
import type { OwnedIndex } from "../inventory/types";
import { currentAccess, identityTokenForAccess } from "../island/apiKey";
import { isCompanionLinked } from "../island/companionLink";
import {
  SECTION_KEYS,
  type SectionKey,
  type SectionProvenance,
} from "../island/merge";
import { checkStorageIdentity } from "../island/storageIdentity";
import type { IslandSnapshot } from "../island/types";
import { islandStore } from "../island/useIsland";
import {
  buildSackIndex,
  sackDefsStore,
  sackOf,
  type SackDefinition,
  type SackDefsState,
} from "../island/sacks";
import { getCurrentProfileHoldings } from "../networth/useNetworth";
import {
  readProfileSnapshot,
  type CacheableProfileSnapshot,
} from "../networth/profileSnapshotCache";
import {
  bazaarStore,
  buildCostTree,
  collectRawMaterials,
  recipesStore,
  type BazaarState,
  type CostNode,
  type Item,
  type ItemIndex,
  type RecipesState,
} from "../items/useItemData";
import { allocateCostTree } from "../items/craftingAllocation";
import { buildSkyBlockPlanningIndex, isSkyBlockCatalogueItem } from "../recipes/catalogue";
import { currentProfile } from "../profile/useProfile";
import { wikiArticleUrl } from "../ui/wikiUrl";
import {
  freshness,
  inputObject,
  normalizeLookup,
  optionalBoolean,
  optionalInteger,
  requiredString,
  stringArray,
  WebMcpToolError,
} from "./shared";

interface ResolvedItem {
  key: string;
  item: Item;
}

export interface ItemResolution {
  match: ResolvedItem | null;
  suggestions: readonly ResolvedItem[];
  ambiguous: readonly ResolvedItem[];
}

/** Exact identifiers and exact display names win; fuzzy matches are suggestions only. */
export const resolveItem = (items: ItemIndex, query: string): ItemResolution => {
  const folded = normalizeLookup(query);
  const entries = Object.entries(items).map(([key, item]) => ({ key, item }));

  // A current catalogue key is more specific than a shared Hypixel id. The
  // Wiki keeps historical variants such as Terminator (Old) under the same
  // Hypixel id as the current item, so grouping both checks together made the
  // ordinary query "Terminator" impossible to resolve.
  const byKey = entries.filter(({ key }) => key.toLowerCase() === query.trim().toLowerCase());
  if (byKey.length === 1) return { match: byKey[0], suggestions: [], ambiguous: [] };

  const byName = entries.filter(({ item }) => normalizeLookup(item.name) === folded);
  if (byName.length === 1) return { match: byName[0], suggestions: [], ambiguous: [] };
  if (byName.length > 1) return { match: null, suggestions: [], ambiguous: byName };

  const byHypixelId = entries.filter(({ item }) =>
    item.hypixelId?.toLowerCase() === query.trim().toLowerCase()
  );
  if (byHypixelId.length === 1) return { match: byHypixelId[0], suggestions: [], ambiguous: [] };
  if (byHypixelId.length > 1) return { match: null, suggestions: [], ambiguous: byHypixelId };

  const suggestions = entries
    .filter(({ key, item }) => normalizeLookup(key).includes(folded) || normalizeLookup(item.name).includes(folded))
    .sort((left, right) => {
      const leftStarts = normalizeLookup(left.item.name).startsWith(folded) ? 0 : 1;
      const rightStarts = normalizeLookup(right.item.name).startsWith(folded) ? 0 : 1;
      return leftStarts - rightStarts || left.item.name.localeCompare(right.item.name);
    })
    .slice(0, 6);
  return { match: null, suggestions, ambiguous: [] };
};

const resolveOrThrow = (items: ItemIndex, query: string): ResolvedItem => {
  const result = resolveItem(items, query);
  if (result.match) return result.match;
  const candidates = (result.ambiguous.length > 0 ? result.ambiguous : result.suggestions)
    .map(({ key, item }) => `${item.name} (key: ${key}${item.hypixelId ? `, Hypixel ID: ${item.hypixelId}` : ""})`)
    .join(", ");
  throw new WebMcpToolError(
    result.ambiguous.length > 0 ? "ambiguous_item" : "item_not_found",
    candidates
      ? `No unique item matched ${query}. Candidates: ${candidates}.`
      : `Skydex could not find an item matching ${query}.`,
  );
};

const waitForRecipes = (): Promise<RecipesState> => {
  const initial = recipesStore.getSnapshot();
  if (!initial.loading || Object.keys(initial.items).length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (state: RecipesState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    };
    const check = () => {
      const state = recipesStore.getSnapshot();
      if (!state.loading || Object.keys(state.items).length > 0) finish(state);
    };
    const timer = setTimeout(() => finish(recipesStore.getSnapshot()), 20_000);
    unsubscribe = recipesStore.subscribe(check);
    check();
  });
};

const waitForBazaar = (): Promise<BazaarState> => {
  const initial = bazaarStore.getSnapshot();
  if (initial.fetchedAt !== null || initial.error !== null) return Promise.resolve(initial);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (state: BazaarState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    };
    const check = () => {
      const state = bazaarStore.getSnapshot();
      if (state.fetchedAt !== null || state.error !== null) finish(state);
    };
    const timer = setTimeout(() => finish(bazaarStore.getSnapshot()), 12_000);
    unsubscribe = bazaarStore.subscribe(check);
    check();
  });
};

const waitForSackDefinitions = (): Promise<SackDefsState> => {
  const initial = sackDefsStore.getSnapshot();
  if (!initial.loading || initial.defs.length > 0) return Promise.resolve(initial);

  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (state: SackDefsState) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(state);
    };
    const check = () => {
      const state = sackDefsStore.getSnapshot();
      if (!state.loading || state.defs.length > 0) finish(state);
    };
    const timer = setTimeout(() => finish(sackDefsStore.getSnapshot()), 12_000);
    unsubscribe = sackDefsStore.subscribe(check);
    check();
  });
};

type SackCatalogueItem = { name?: string; hypixelId: string | null };

/**
 * Fill the API's sparse sack counters from the live Wiki membership catalogue.
 *
 * A missing row is a known zero only after two independent facts are present:
 * Hypixel shared this profile's sacks surface, and the runtime catalogue says
 * that the item belongs in a sack. Without either fact the row stays absent, so
 * private data and a failed catalogue load can never become invented zeroes.
 */
export const completeKnownSackRows = (
  rows: readonly unknown[],
  items: Readonly<Record<string, SackCatalogueItem>>,
  defs: readonly SackDefinition[],
): unknown[] => {
  const namedItems = Object.fromEntries(
    Object.entries(items).flatMap(([key, item]) => (
      typeof item.name === "string" && item.name.trim() !== ""
        ? [[key, { name: item.name, hypixelId: item.hypixelId }] as const]
        : []
    )),
  );
  const index = buildSackIndex(defs, namedItems);
  if (!index.ready) return [...rows];

  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === "string" && id) seen.add(id.toLowerCase());
  }

  const completed = [...rows];
  for (const item of Object.values(items)) {
    const id = item.hypixelId;
    if (!id || seen.has(id.toLowerCase()) || !sackOf(id, index)) continue;
    completed.push({ id, amount: 0 });
    seen.add(id.toLowerCase());
  }
  return completed;
};

/**
 * The small, already-sanitized slice of a profile that can answer connected
 * item questions. It intentionally does not carry profile facts, valuations,
 * or any raw member payload across the WebMCP boundary.
 */
export interface ConnectedProfileHoldings {
  items: Record<string, unknown[]>;
  coverage: {
    inventoryShared: boolean;
    sacksShared?: boolean;
    vaultShared: boolean;
    museumShared: boolean;
  };
  fetchedAt: number;
  /** Optional cache metadata used to reject a stale island snapshot from another profile. */
  playerUuid?: string;
  profileId?: string;
  profileName?: string;
  playerName?: string | null;
}

interface CachedConnectedProfileHoldings extends CacheableProfileSnapshot {
  items: Record<string, unknown[]>;
  coverage: ConnectedProfileHoldings["coverage"];
  playerUuid?: string;
  profileId?: string;
  profileName?: string;
  playerName?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Rehydrate only a structurally valid, identity-matched cache value. The cache
 * reader already checks its envelope, but this second guard keeps a malformed
 * or legacy payload from becoming a source of invented counts. Explicit sack
 * zeroes and private-source flags pass through unchanged.
 */
export const profileHoldingsFromCachedSnapshot = (
  cached: unknown,
  identity: string,
): ConnectedProfileHoldings | null => {
  if (!isRecord(cached) || cached.identity !== identity) return null;
  if (typeof cached.fetchedAt !== "number" || !Number.isFinite(cached.fetchedAt)) return null;

  const items = cached.items;
  if (!isRecord(items) || !Object.values(items).every((rows) => (
    Array.isArray(rows) && rows.every(isRecord)
  ))) return null;

  const coverage = cached.coverage;
  if (
    !isRecord(coverage)
    || typeof coverage.inventoryShared !== "boolean"
    || typeof coverage.vaultShared !== "boolean"
    || typeof coverage.museumShared !== "boolean"
    || (coverage.sacksShared !== undefined && typeof coverage.sacksShared !== "boolean")
  ) return null;

  const optionalText = (key: "playerUuid" | "profileId" | "profileName"): string | null | undefined => {
    if (!(key in cached)) return undefined;
    const value = cached[key];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || undefined;
  };
  const playerUuid = optionalText("playerUuid");
  const profileId = optionalText("profileId");
  const profileName = optionalText("profileName");
  if (playerUuid === null || profileId === null || profileName === null) return null;

  const playerName = "playerName" in cached
    ? cached.playerName === null
      ? null
      : typeof cached.playerName === "string"
        ? cached.playerName.trim() || null
        : undefined
    : undefined;
  if ("playerName" in cached && playerName === undefined) return null;

  return {
    items: items as Record<string, unknown[]>,
    coverage: {
      inventoryShared: coverage.inventoryShared,
      ...(typeof coverage.sacksShared === "boolean" ? { sacksShared: coverage.sacksShared } : {}),
      vaultShared: coverage.vaultShared,
      museumShared: coverage.museumShared,
    },
    fetchedAt: cached.fetchedAt,
    ...(playerUuid ? { playerUuid } : {}),
    ...(profileId ? { profileId } : {}),
    ...(profileName ? { profileName } : {}),
    ...(playerName !== undefined ? { playerName } : {}),
  };
};

/** A mounted profile is authoritative; the disk snapshot is only a fallback. */
export const chooseConnectedProfileHoldings = (
  mounted: ConnectedProfileHoldings | null,
  cached: ConnectedProfileHoldings | null,
): ConnectedProfileHoldings | null => mounted ?? cached;

const withoutTrustedIsland = (
  state: ReturnType<typeof islandStore.getSnapshot>,
): ReturnType<typeof islandStore.getSnapshot> => ({
  ...state,
  stored: null,
  snapshot: null,
  merged: {
    ...state.merged,
    snapshot: null,
    sections: Object.fromEntries(
      SECTION_KEYS.map((key): [SectionKey, SectionProvenance] => [key, {
        state: "absent",
        source: null,
        at: null,
      }]),
    ) as Record<SectionKey, SectionProvenance>,
    sources: { mod: null, api: null },
  },
});

const readCachedProfileHoldings = async (): Promise<ConnectedProfileHoldings | null> => {
  const identity = identityTokenForAccess(currentAccess());
  const cached = await readProfileSnapshot<CachedConnectedProfileHoldings>(identity);
  // The account can change while IndexedDB is resolving. Never attach the old
  // account's snapshot to the new connected context.
  if (identityTokenForAccess(currentAccess()) !== identity) return null;
  return profileHoldingsFromCachedSnapshot(cached, identity);
};

export interface ConnectedOwnedSnapshot {
  owned: OwnedIndex;
  context: {
    player: string | null;
    mod_linked: boolean;
    mod_status: "live" | "offline" | "empty";
    mod_version: string | null;
    freshness: ReturnType<typeof freshness>;
    source_coverage: Record<string, { state: string; source: string | null; fetched_at: string | null }>;
    sack_membership: "available" | "unavailable";
    shard_inventory: "available" | "empty" | "unavailable";
    manual_overrides: number;
  };
}

export interface ConnectedSourceCoverageEntry {
  state: string;
  source: string | null;
  fetched_at: string | null;
}

type ObservedCoverage = {
  state: "captured" | "empty";
  source: "mod" | "api";
  at: number | null;
  hasEntries: boolean;
};

const isoTime = (at: number | null): string | null => at === null ? null : new Date(at).toISOString();

const islandEntryCount = (snapshot: IslandSnapshot | null, key: SectionKey): number => {
  if (!snapshot) return 0;
  if (key === "sacks") return Object.keys(snapshot.sacks).length;
  if (key === "chests") return snapshot.chests.length;
  return snapshot[key]?.length ?? 0;
};

const observedIslandCoverage = (
  snapshot: IslandSnapshot | null,
  provenance: SectionProvenance,
  key: SectionKey,
): ObservedCoverage | null => (
  snapshot
  && provenance.source
  && (provenance.state === "captured" || provenance.state === "empty")
    ? {
        state: provenance.state,
        source: provenance.source,
        at: provenance.at,
        hasEntries: islandEntryCount(snapshot, key) > 0,
      }
    : null
);

const PROFILE_SECTION_CATEGORY: Partial<Record<SectionKey, string>> = {
  sacks: "sacks",
  inventory: "inventory",
  enderChest: "enderchest",
  storage: "storage",
};

const observedProfileCoverage = (
  profile: ProfileHoldingsInput | null,
  key: SectionKey,
): ObservedCoverage | null => {
  const category = PROFILE_SECTION_CATEGORY[key];
  if (!profile || !category) return null;
  const entries = Array.isArray(profile.parsed[category]) ? profile.parsed[category] : [];
  const available = key === "sacks"
    ? profile.sacksShared === true || entries.length > 0
    : profile.inventoryShared;
  if (!available) return null;
  return {
    state: entries.length > 0 ? "captured" : "empty",
    source: "api",
    at: profile.fetchedAt,
    hasEntries: entries.length > 0,
  };
};

/**
 * Describe the same profile and island observations that `buildOwned` uses.
 * The profile store can hold a valid cached Hypixel inventory even when the
 * lighter island store has not mounted on the current route, so island-only
 * metadata would contradict the API-backed item counts returned beside it.
 */
export const connectedSourceCoverage = (
  island: {
    snapshot: IslandSnapshot | null;
    sections: Record<SectionKey, SectionProvenance>;
  },
  profile: ProfileHoldingsInput | null,
): Record<SectionKey, ConnectedSourceCoverageEntry> => Object.fromEntries(
  SECTION_KEYS.map((key): [SectionKey, ConnectedSourceCoverageEntry] => {
    const provenance = island.sections[key];
    const islandObserved = observedIslandCoverage(island.snapshot, provenance, key);
    const profileObserved = observedProfileCoverage(profile, key);

    if (key === "sacks" && islandObserved && profileObserved) {
      const sources = [...new Set([islandObserved.source, profileObserved.source])];
      return [key, {
        state: islandObserved.hasEntries || profileObserved.hasEntries ? "captured" : "empty",
        source: sources.join("+"),
        fetched_at: isoTime(Math.max(islandObserved.at ?? 0, profileObserved.at ?? 0) || null),
      }];
    }

    let selected = islandObserved ?? profileObserved;
    if (islandObserved && profileObserved) {
      selected = islandObserved.hasEntries !== profileObserved.hasEntries
        ? islandObserved.hasEntries ? islandObserved : profileObserved
        : (profileObserved.at ?? 0) > (islandObserved.at ?? 0)
          ? profileObserved
          : islandObserved;
    }
    if (selected) {
      return [key, {
        state: selected.state,
        source: selected.source,
        fetched_at: isoTime(selected.at),
      }];
    }

    return [key, {
      state: provenance.state,
      source: provenance.source,
      fetched_at: isoTime(provenance.at),
    }];
  }),
) as Record<SectionKey, ConnectedSourceCoverageEntry>;

export type HoldingsCoverage = "available" | "partial" | "unavailable" | "not_requested";

/** Describe coverage for the exact items a planner is about to report. */
export const holdingsCoverage = (
  owned: Pick<OwnedIndex, "get" | "has"> | null,
  requestedKeys: readonly string[],
): HoldingsCoverage => {
  if (!owned) return "not_requested";
  const keys = [...new Set(requestedKeys)];
  if (keys.length === 0) return owned.has ? "available" : "unavailable";
  const known = keys.reduce((count, key) => count + (owned.get(key) === undefined ? 0 : 1), 0);
  if (known === 0) return "unavailable";
  return known === keys.length ? "available" : "partial";
};

const waitForConnectedIsland = async (): Promise<void> => {
  if (!isCompanionLinked() || islandStore.getSnapshot().snapshot) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const check = () => {
      const state = islandStore.getSnapshot();
      if (state.snapshot || state.status === "live" || state.lastError) finish();
    };
    const timer = setTimeout(finish, 2_800);
    unsubscribe = islandStore.subscribe(check);
    check();
  });
};

const waitForShardBridge = async (): Promise<void> => {
  if (Object.keys(getShards()).length === 0 || getShardIds() !== null) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve();
    };
    const check = () => {
      if (getShardIds() !== null) finish();
    };
    const timer = setTimeout(finish, 3_000);
    unsubscribe = subscribeShardIds(check);
    check();
  });
};

/** Read the exact connected browser stores, without accepting a player override. */
export const connectedOwnedSnapshot = async (
  items: Record<string, SackCatalogueItem>,
  retryOnIdentityChange = true,
): Promise<ConnectedOwnedSnapshot> => {
  const releaseIsland = islandStore.subscribe(() => {});
  const releaseInventory = subscribeInventoryManagement(() => {});
  const releaseShards = subscribeShards(() => {});
  try {
    const [, , sackDefinitions] = await Promise.all([
      waitForConnectedIsland(),
      waitForShardBridge(),
      waitForSackDefinitions(),
    ]);
    const cacheIdentity = identityTokenForAccess(currentAccess());
    const mountedBeforeCache = getCurrentProfileHoldings();
    const cachedProfile = mountedBeforeCache ? null : await readCachedProfileHoldings();
    const aggregationIdentity = identityTokenForAccess(currentAccess());
    const mountedProfile = getCurrentProfileHoldings();
    let profile = aggregationIdentity === cacheIdentity
      ? chooseConnectedProfileHoldings(mountedProfile, cachedProfile)
      : mountedProfile;
    let island = islandStore.getSnapshot();
    let management = getInventoryManagement();

    // The optional disk read is asynchronous. If Settings changed account or
    // profile while it was in flight, restart once so no old profile, island
    // feed, or manual layer is combined with the new identity. A second
    // change is handled conservatively by re-reading only current stores below.
    if (identityTokenForAccess(currentAccess()) !== aggregationIdentity) {
      if (retryOnIdentityChange) return connectedOwnedSnapshot(items, false);
      profile = getCurrentProfileHoldings();
      island = islandStore.getSnapshot();
      management = getInventoryManagement();
    }
    const usingCachedProfile = cachedProfile !== null && profile === cachedProfile;
    if (usingCachedProfile && cachedProfile) {
      const access = currentAccess();
      const identityCheck = checkStorageIdentity(island.snapshot, {
        playerUuids: [access.uuid, cachedProfile.playerUuid],
        profileName: cachedProfile.profileName,
        hasConnectedAccount: true,
      });
      if (identityCheck.state !== "match") {
        // The cache is identity-bound, but a mod/API island feed can outlive a
        // profile switch. Do not blend a different or unverifiable account/profile
        // into this connected result. Unknown remains unknown; true mod-only data
        // is only preserved when no connected expectation exists.
        island = withoutTrustedIsland(island);
      }
    }
    const shardCounts = getShards();
    const shardIds = getShardIds();
    const profileSacks = profile && (
      profile.coverage.sacksShared === true
      || (Array.isArray(profile.items.sacks) && profile.items.sacks.length > 0)
    )
      ? completeKnownSackRows(profile.items.sacks ?? [], items, sackDefinitions.defs)
      : profile?.items.sacks ?? [];
    const profileHoldings: ProfileHoldingsInput | null = profile ? {
      parsed: { ...profile.items, sacks: profileSacks },
      inventoryShared: profile.coverage.inventoryShared,
      sacksShared: profile.coverage.sacksShared,
      vaultShared: profile.coverage.vaultShared,
      museumShared: profile.coverage.museumShared,
      fetchedAt: profile.fetchedAt,
    } : null;
    const islandHoldings = { snapshot: island.snapshot, sections: island.merged.sections };
    const owned = buildOwned({
      items,
      island: islandHoldings,
      profile: profileHoldings,
      shards: shardIds ? { counts: shardCounts, ids: shardIds } : null,
      manual: Object.fromEntries(management.inventory),
      enabledSources: management.enabledSources,
    });
    const newest = Math.max(island.merged.sources.mod ?? 0, island.merged.sources.api ?? 0, profile?.fetchedAt ?? 0) || null;
    const sourceCoverage = connectedSourceCoverage(islandHoldings, profileHoldings);
    return {
      owned,
      context: {
        player: currentAccess().name || island.snapshot?.player.name || null,
        mod_linked: isCompanionLinked(),
        mod_status: island.status,
        mod_version: island.modVersion,
        freshness: freshness(newest),
        source_coverage: sourceCoverage,
        sack_membership: sackDefinitions.defs.length > 0 ? "available" : "unavailable",
        shard_inventory: Object.keys(shardCounts).length > 0
          ? shardIds ? "available" : "unavailable"
          : "empty",
        manual_overrides: management.inventory.size,
      },
    };
  } finally {
    releaseShards();
    releaseInventory();
    releaseIsland();
  }
};

const compactSources = (entry: ReturnType<OwnedIndex["get"]>) =>
  entry?.sources.map((source) => ({
    source: SOURCE_LABEL[source.source],
    feed: source.feed,
    count: source.count,
    fetched_at: source.at === null ? null : new Date(source.at).toISOString(),
  })) ?? [];

export const connectedHoldings = async (input: unknown): Promise<unknown> => {
  const object = inputObject(input);
  const requested = stringArray(object, "items", 25);
  const includeSources = optionalBoolean(object, "include_sources", true);
  const recipes = await waitForRecipes();
  if (Object.keys(recipes.items).length === 0) {
    throw new WebMcpToolError("catalogue_unavailable", recipes.error ?? "The item catalogue is unavailable.");
  }
  const resolved = requested.map((query) => ({ query, ...resolveOrThrow(recipes.items, query) }));
  const connected = await connectedOwnedSnapshot(recipes.items);
  return {
    ok: true,
    scope: "connected_browser",
    player: connected.context.player,
    connection: connected.context,
    holdings: resolved.map(({ query, key, item }) => {
      const entry = connected.owned.get(key);
      return {
        query,
        item: { key, name: item.name, hypixel_id: item.hypixelId },
        known: entry !== undefined,
        total: entry?.total ?? null,
        automatic_total: entry && entry.sources.length > 0 ? entry.auto : null,
        manual_override: entry?.manual ?? null,
        ...(includeSources ? { sources: compactSources(entry) } : {}),
      };
    }),
  };
};

export interface RecipeMaterialEntry {
  key: string;
  name: string;
  required: number;
  owned: number | null;
  missing: number | null;
}

/**
 * Project the same reservation-aware remainder list that the Recipes page
 * renders. The CostNode tree is already mode-specific, so normal planning can
 * keep a chosen Bazaar-buy branch while Ironman expands the uncovered craft
 * branch. Passing the OwnedIndex directly preserves held intermediates,
 * explicit zeroes, and unknown item counts without subtracting inventory twice.
 */
export const recipeMaterialEntries = (
  tree: CostNode,
  items: ItemIndex,
  inventory: AllocationInventory | null,
): RecipeMaterialEntry[] => {
  if (!inventory) {
    return [...collectRawMaterials(tree).entries()]
      .map(([key, material]) => ({
        key,
        name: material.name,
        required: material.qty,
        owned: null,
        missing: null,
      }))
      .sort((left, right) => right.required - left.required || left.name.localeCompare(right.name));
  }

  return allocateCostTree(tree, items, inventory).remaining
    .map((remainder) => ({
      key: remainder.id,
      name: remainder.name,
      required: remainder.required,
      owned: remainder.known ? remainder.allocated : null,
      missing: remainder.known ? remainder.remaining : null,
    }))
    .sort((left, right) => (
      (right.missing ?? 0) - (left.missing ?? 0)
      || right.required - left.required
      || left.name.localeCompare(right.name)
    ));
};

export const recipePlan = async (input: unknown): Promise<unknown> => {
  const object = inputObject(input);
  const query = requiredString(object, "item", 128);
  const quantity = optionalInteger(object, "quantity", 1, 1, 1_000_000);
  const configuredProfile = currentProfile();
  const ironman = configuredProfile.mode === "ironman";
  const useConnectedHoldings = optionalBoolean(object, "use_connected_holdings", true);
  const [recipes, bazaar] = await Promise.all([waitForRecipes(), waitForBazaar()]);
  if (Object.keys(recipes.items).length === 0) {
    throw new WebMcpToolError("catalogue_unavailable", recipes.error ?? "The item catalogue is unavailable.");
  }

  const planning = buildSkyBlockPlanningIndex(recipes.items);
  const resolved = resolveOrThrow(planning, query);
  if (!isSkyBlockCatalogueItem(resolved.item)) {
    throw new WebMcpToolError("not_skyblock_recipe", `${resolved.item.name} is not a SkyBlock recipe target.`);
  }

  const decisionTree = buildCostTree(resolved.key, quantity, planning, bazaar.prices, ironman);
  const craftingTree = buildCostTree(resolved.key, quantity, planning, {}, true);
  const connected = useConnectedHoldings
    ? await connectedOwnedSnapshot(planning)
    : null;
  const materials = recipeMaterialEntries(
    ironman ? craftingTree : decisionTree,
    planning,
    connected?.owned ?? null,
  );
  const recommendedAction = ironman
    ? resolved.item.recipe ? "craft" : "obtain"
    : decisionTree.action;

  return {
    ok: true,
    scope: connected ? "connected_browser" : "public_data",
    item: {
      key: resolved.key,
      name: resolved.item.name,
      hypixel_id: resolved.item.hypixelId,
      quantity,
      output_per_craft: resolved.item.yields,
    },
    planning: {
      mode: configuredProfile.mode,
      source: configuredProfile.source,
    },
    recommendation: {
      action: recommendedAction,
      estimated_cost: ironman ? null : decisionTree.cost,
      buy_cost: ironman ? null : decisionTree.buyCost,
      craft_cost: ironman ? null : decisionTree.craftCost,
    },
    direct_recipe: resolved.item.recipe?.map((ingredient) => ({
      key: ingredient.id,
      name: ingredient.name,
      quantity_per_craft: ingredient.qty,
      alternatives: ingredient.alternatives ?? [],
    })) ?? [],
    raw_materials: {
      entries: materials.slice(0, 25),
      returned: Math.min(25, materials.length),
      total: materials.length,
      truncated: materials.length > 25,
    },
    freshness: {
      recipes: freshness(recipes.fetchedAt),
      bazaar: freshness(bazaar.fetchedAt),
    },
    sources: {
      recipe: {
        name: "Hypixel SkyBlock Wiki",
        url: wikiArticleUrl(resolved.item.name),
        license: "CC BY-NC-SA 3.0",
        license_url: "https://creativecommons.org/licenses/by-nc-sa/3.0/",
      },
      prices: "Hypixel public API",
    },
    coverage: {
      recipe_catalogue: recipes.error ? "partial" : "available",
      bazaar_prices: ironman ? "not_used" : bazaar.fetchedAt === null ? "unavailable" : "available",
      holdings: connected
        ? holdingsCoverage(connected.owned, materials.map((material) => material.key))
        : "not_requested",
    },
    ...(connected ? { connection: connected.context } : {}),
  };
};
