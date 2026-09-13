import { totalItems } from "../island/aggregate";
import { SECTION_KEYS } from "../island/merge";
import type { IslandSource, SectionKey, SectionProvenance } from "../island/merge";
import type { IslandSnapshot } from "../island/types";
import type { OwnedEntry, OwnedIndex, OwnedSource, SourceCount } from "./types";

/**
 * Folding three stores into one answer.
 *
 * The hard part is not the addition, it is that the three stores do not speak
 * the same language. The island feed and the shard tally are keyed by Hypixel
 * id; the site's item index and the greenhouse mutation ids are keyed by the
 * site's own slug. `sackLookup` already solved that bridge - match the item
 * index's `hypixelId`, exact first, case-insensitively second - and this reuses
 * that rule rather than inventing a second one. If the bridge ever changes it
 * changes in one place and both readers follow.
 *
 * Two rules carry most of the weight here, and both exist because this tool's
 * whole job is telling you what you already have:
 *
 *   1. A source that never looked contributes nothing, not zero. An item no
 *      source has ever mentioned has no entry at all, so a caller asking for it
 *      gets `undefined` and can say "unknown" instead of printing a confident
 *      "0 owned" at somebody about to go and farm 4,000 more.
 *   2. A manual number replaces the automatic total. It never adds to it and it
 *      is never overwritten by a later sync. A player who typed a number has
 *      made a statement about reality that outranks anything we scraped.
 */

/**
 * Precedence, in one expression, referenced from exactly one place.
 *
 * Any future source is added to `auto`. This line is the only thing that
 * decides whether the player's word wins, and it always does. `manual` is null
 * rather than 0 when unset precisely so that a typed 0 - "I know the island
 * data is stale, I spent them" - still beats a sync.
 */
const effective = (manual: number | null, auto: number): number => (manual === null ? auto : manual);

/** Section to source name. One line so the mapping cannot drift. */
const SECTION_SOURCE: Record<SectionKey, OwnedSource> = {
  sacks: "island.sacks",
  chests: "island.chests",
  inventory: "island.inventory",
  enderChest: "island.enderChest",
  storage: "island.storage",
};

/**
 * Human wording for a source, for chips, tooltips and legends.
 *
 * These are the words the game uses, not the words the data model uses. The
 * `storage` section is backpacks as far as any player is concerned, and calling
 * it "storage" on a chip would send someone looking through the wrong menu.
 */
export const SOURCE_LABEL: Record<OwnedSource, string> = {
  "island.sacks": "sacks",
  "island.chests": "chests",
  "island.inventory": "inventory",
  "island.enderChest": "ender chest",
  "island.storage": "backpack",
  "profile.armor": "armour",
  "profile.equipment": "equipment",
  "profile.wardrobe": "saved armour",
  "profile.accessories": "accessory bag",
  "profile.personalVault": "personal vault",
  "profile.fishingBag": "fishing bag",
  "profile.potionBag": "potion bag",
  "profile.sacksBag": "sacks bag",
  "profile.quiver": "quiver",
  "profile.candy": "candy inventory",
  "profile.carnivalMasks": "carnival masks",
  "profile.farmingToolkit": "farming toolkit",
  "profile.huntingToolkit": "hunting toolkit",
  "profile.museum": "museum",
  shards: "shard inventory",
  manual: "set by you",
};

/** One store's counts, keyed by Hypixel id, plus who said so and when. */
interface Contribution {
  source: OwnedSource;
  feed: IslandSource | null;
  at: number | null;
  counts: Record<string, number>;
}

/**
 * The decoded, browser-cached half of the Hypixel profile that can contribute
 * physical items to a plan. It deliberately accepts the parser's loose record
 * rather than importing the valuation model: inventory is a read-side consumer
 * of that snapshot, not another owner of it.
 */
export interface ProfileHoldingsInput {
  parsed: Record<string, unknown[]>;
  inventoryShared: boolean;
  /** Exact sack-counter field presence. Undefined only on legacy cached profile snapshots. */
  sacksShared?: boolean;
  vaultShared: boolean;
  museumShared: boolean;
  fetchedAt: number;
}

const PROFILE_CATEGORY_SOURCE = {
  armor: "profile.armor",
  equipment: "profile.equipment",
  wardrobe: "profile.wardrobe",
  accessories: "profile.accessories",
  personal_vault: "profile.personalVault",
  fishing_bag: "profile.fishingBag",
  potion_bag: "profile.potionBag",
  sacks_bag: "profile.sacksBag",
  quiver: "profile.quiver",
  candy_inventory: "profile.candy",
  carnival_mask_inventory: "profile.carnivalMasks",
  farming_toolkit: "profile.farmingToolkit",
  hunting_toolkit: "profile.huntingToolkit",
  museum: "profile.museum",
} as const satisfies Record<string, OwnedSource>;

const PROFILE_OVERLAP_CATEGORY: Partial<Record<SectionKey, string>> = {
  sacks: "sacks",
  inventory: "inventory",
  enderChest: "enderchest",
  storage: "storage",
};

const finiteCount = (value: unknown, includeZero = false): number | null =>
  typeof value === "number"
  && Number.isFinite(value)
  && (includeZero ? value >= 0 : value > 0)
    ? value
    : null;

/** Reduce either a decoded NBT stack or a sack `{ id, amount }` row. */
const profileCounts = (entries: readonly unknown[], basic = false): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = entry as {
      id?: unknown;
      amount?: unknown;
      Count?: unknown;
      tag?: { ExtraAttributes?: { id?: unknown } };
    };
    const extraId = value.tag?.ExtraAttributes?.id;
    const id = typeof extraId === "string" && extraId
      ? extraId
      : typeof value.id === "string" && value.id
        ? value.id
        : null;
    // Basic rows are sack counters. Hypixel's explicit zero is evidence that
    // the item was checked, so it must bridge into a known-zero holding.
    const count = finiteCount(basic ? value.amount : value.Count, basic);
    if (!id || count === null) continue;
    counts[id] = (counts[id] ?? 0) + count;
  }
  return counts;
};

const profileContribution = (
  profile: ProfileHoldingsInput,
  category: string,
  source: OwnedSource,
): Contribution => ({
  source,
  feed: "api",
  at: profile.fetchedAt,
  counts: profileCounts(profile.parsed[category] ?? [], category === "sacks"),
});

const hasCounts = (contribution: Contribution): boolean => Object.keys(contribution.counts).length > 0;

/**
 * Pick one snapshot of an overlapping blob-shaped container. The mod and API
 * can both describe the same inventory, Ender Chest or backpack page, so they
 * must never be added. A non-empty observation beats an empty one, then the
 * freshest wins, with the mod winning an exact tie.
 */
const chooseContainer = (island: Contribution | null, profile: Contribution | null): Contribution | null => {
  if (!island) return profile;
  if (!profile) return island;
  if (hasCounts(island) !== hasCounts(profile)) return hasCounts(island) ? island : profile;
  if ((profile.at ?? 0) > (island.at ?? 0)) return profile;
  return island;
};

/**
 * Sack feeds are partial by design, so union ids and replace collisions rather
 * than adding them. The existing island merge already lets the live mod win
 * collisions; a newer cached API profile wins only when that merged feed has
 * no mod contribution.
 */
const mergeSackContributions = (island: Contribution | null, profile: Contribution | null): Contribution | null => {
  if (!island) return profile;
  if (!profile) return island;
  const islandWinsCollisions = island.feed === "mod" || (island.at ?? 0) >= (profile.at ?? 0);
  return {
    source: "island.sacks",
    feed: island.feed === "mod" ? "mod" : "api",
    at: Math.max(island.at ?? 0, profile.at ?? 0) || null,
    counts: islandWinsCollisions
      ? { ...profile.counts, ...island.counts }
      : { ...island.counts, ...profile.counts },
  };
};

/**
 * A count reader for one contribution, following `sackLookup`'s matching rule.
 *
 * Exact match wins whenever both exist, so a genuine `Foo` / `FOO` pair is
 * never silently conflated. The lower-cased fallback exists because the mod
 * falls back to the upper-cased vanilla registry id when an item carries no
 * `ExtraAttributes.id`, and a case mismatch on an oak log is not a reason to
 * tell the player they own none. First writer wins in the shadow index, so a
 * pathological pair resolves deterministically rather than by iteration luck.
 */
const readerFor = (counts: Record<string, number>) => {
  const lower = new Map<string, number>();
  for (const [id, n] of Object.entries(counts)) {
    const key = id.toLowerCase();
    if (!lower.has(key)) lower.set(key, n);
  }
  return (hypixelId: string): number | undefined => {
    const exact = counts[hypixelId];
    // Typed rather than truthy: 0 is a real count, and an inherited property
    // such as `constructor` is not a number and must not be read as one.
    if (typeof exact === "number") return exact;
    return lower.get(hypixelId.toLowerCase());
  };
};

/** Roll one island section up into a Hypixel-id-keyed count map. */
const sectionCounts = (snapshot: IslandSnapshot, key: SectionKey): Record<string, number> => {
  if (key === "sacks") return snapshot.sacks;

  const list = key === "chests" ? snapshot.chests.flatMap((c) => c.items) : snapshot[key];
  if (!list) return {};

  const out: Record<string, number> = {};
  for (const [id, v] of totalItems(list)) out[id] = v.count;
  return out;
};

export interface OwnedInput {
  /**
   * The site's item index, the bridge between our keys and Hypixel's. Only
   * `hypixelId` is read, so the greenhouse can pass a trimmed record and the
   * Items page can pass its enriched index unchanged.
   */
  items: Record<string, { hypixelId: string | null }>;
  /**
   * The merged island view and its per-section provenance, straight off
   * `useIsland`. Only sections a source actually *captured* contribute: a
   * `hidden` section means the player's API settings do not share it and an
   * `absent` one means nobody has looked yet, and neither is "you own none".
   */
  island?: { snapshot: IslandSnapshot | null; sections: Record<SectionKey, SectionProvenance> } | null;
  /**
   * The last decoded Hypixel profile, already cached in IndexedDB by the
   * profile store. Overlapping containers are selected, never summed, against
   * the mod-backed island view; API-only surfaces remain separate provenance.
   */
  profile?: ProfileHoldingsInput | null;
  /**
   * The shard suite's own tally, exactly as it stores it: keyed by shard key
   * such as `C1`. `ids` bridges those keys to Hypixel ids (`SHARD_GROVE`), and
   * without it the shard tally contributes nothing rather than polluting the
   * item-key space with shard keys.
   */
  shards?: { counts: Record<string, number>; ids: Record<string, string | null> } | null;
  /** The player's typed numbers, keyed by the site's item key. Highest precedence. */
  manual?: Record<string, number> | null;
  /** When each source last reported, for the island feeds. Optional. */
  shardsAt?: number | null;
  /**
   * Optional shared switches for the island-container sources. The legacy
   * shard tally is a separate source and is intentionally not controlled by
   * these toggles; manual overrides are always retained.
   */
  enabledSources?: ReadonlySet<OwnedSource>;
}

/** Turn the shard tally into Hypixel-id-keyed counts. Shards with no id drop out. */
const shardCounts = (shards: NonNullable<OwnedInput["shards"]>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [shardKey, n] of Object.entries(shards.counts)) {
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0) continue;
    const id = shards.ids[shardKey];
    if (!id) continue;
    out[id] = (out[id] ?? 0) + n;
  }
  return out;
};

const EMPTY: OwnedIndex = {
  get: () => undefined,
  count: () => undefined,
  auto: () => undefined,
  has: false,
  sources: [],
  entries: () => [],
  keys: () => [],
};

/**
 * Build the unified view.
 *
 * Pure and synchronous. Everything reactive lives in `useOwned`, so this can be
 * called from a test, a tool or a worker without a React tree.
 */
export function buildOwned(input: OwnedInput): OwnedIndex {
  const { items, island, profile, shards, manual, enabledSources } = input;

  // ---- collect what each store has to say -------------------------------
  const contributions: Contribution[] = [];

  for (const key of SECTION_KEYS) {
    const source = SECTION_SOURCE[key];
    if (enabledSources && !enabledSources.has(source)) continue;

    const provenance = island?.sections[key];
    const islandContribution = island?.snapshot
      && (provenance?.state === "captured" || provenance?.state === "empty")
      ? {
          source,
          feed: provenance.source,
          at: provenance.at,
          counts: sectionCounts(island.snapshot, key),
        } satisfies Contribution
      : null;

    const profileCategory = PROFILE_OVERLAP_CATEGORY[key];
    const profileCanSeeSection = profileCategory !== undefined
      && profile !== null
      && profile !== undefined
      && (key === "sacks"
        ? profile.sacksShared === true || (profile.parsed.sacks?.length ?? 0) > 0
        : profile.inventoryShared);
    const apiContribution = profileCanSeeSection
      ? profileContribution(profile!, profileCategory!, source)
      : null;

    const selected = key === "sacks"
      ? mergeSackContributions(islandContribution, apiContribution)
      : chooseContainer(islandContribution, apiContribution);
    if (selected) contributions.push(selected);
  }

  if (profile) {
    for (const [category, source] of Object.entries(PROFILE_CATEGORY_SOURCE) as [keyof typeof PROFILE_CATEGORY_SOURCE, OwnedSource][]) {
      const shared = category === "personal_vault"
        ? profile.vaultShared
        : category === "museum"
          ? profile.museumShared
          : profile.inventoryShared;
      if (!shared) continue;
      contributions.push(profileContribution(profile, category, source));
    }
  }

  // Shards are the legacy suite's separate inventory source, not an island
  // container. The shared drawer only toggles island sections, so a five-source
  // enabled set must never make this source disappear.
  if (shards) {
    const counts = shardCounts(shards);
    if (Object.keys(counts).length > 0) {
      contributions.push({ source: "shards", feed: null, at: input.shardsAt ?? null, counts });
    }
  }

  const manualEntries = manual ?? {};
  const hasManual = Object.keys(manualEntries).length > 0;

  if (contributions.length === 0 && !hasManual) return EMPTY;

  // ---- bridge every contribution onto the site's item keys --------------
  const readers = contributions.map((c) => ({ meta: c, read: readerFor(c.counts) }));

  const byKey = new Map<string, OwnedEntry>();

  for (const [key, item] of Object.entries(items)) {
    const hypixelId = item?.hypixelId ?? null;
    // An item the site knows by name only has nothing to match against and must
    // never fall through to a fuzzy guess, so it simply never matches.
    if (!hypixelId) continue;

    const sources: SourceCount[] = [];
    let auto = 0;
    for (const { meta, read } of readers) {
      const count = read(hypixelId);
      if (count === undefined) continue;
      sources.push({ source: meta.source, feed: meta.feed, count, at: meta.at });
      auto += count;
    }

    const typed = manualEntries[key];
    const manualValue = typeof typed === "number" && Number.isFinite(typed) ? typed : null;

    // Nothing looked and nothing was typed: no entry, so the caller gets
    // `undefined` rather than a confident zero.
    if (sources.length === 0 && manualValue === null) continue;

    byKey.set(key, {
      key,
      hypixelId,
      auto,
      sources,
      manual: manualValue,
      total: effective(manualValue, auto),
      overridden: manualValue !== null,
    });
  }

  /*
   * Typed numbers for keys the item index has never heard of.
   *
   * The index is built from the wiki's crafting module, so an item nobody
   * crafts with is simply not in it. That is no reason to lose the number the
   * player typed against it - it just means there is nothing to bridge, so the
   * entry carries a null `hypixelId` and no automatic sources.
   */
  for (const [key, typed] of Object.entries(manualEntries)) {
    if (byKey.has(key)) continue;
    if (typeof typed !== "number" || !Number.isFinite(typed)) continue;
    byKey.set(key, {
      key,
      hypixelId: items[key]?.hypixelId ?? null,
      auto: 0,
      sources: [],
      manual: typed,
      total: typed,
      overridden: true,
    });
  }

  if (byKey.size === 0) return EMPTY;

  const present = new Set<OwnedSource>();
  for (const entry of byKey.values()) {
    for (const s of entry.sources) present.add(s.source);
    if (entry.overridden) present.add("manual");
  }

  return {
    get: (key) => byKey.get(key),
    count: (key) => byKey.get(key)?.total,
    auto: (key) => {
      const entry = byKey.get(key);
      return entry && entry.sources.length > 0 ? entry.auto : undefined;
    },
    has: true,
    sources: [...present],
    entries: () => [...byKey.values()],
    keys: () => [...byKey.keys()],
  };
}

/**
 * The source a count mostly came from.
 *
 * A chip has room for one word, and "island" is not the word a player needs:
 * knowing 245 Choconut are in a backpack tells them which menu to open, while
 * knowing they are "on the island" tells them nothing they did not know. So the
 * chip names the biggest contributor and the tooltip carries the full split.
 *
 * Ties go to the earlier entry, and `sources` is built in section order, so the
 * winner is deterministic rather than decided by iteration luck.
 */
export const dominantSource = (entry: OwnedEntry | undefined): SourceCount | undefined => {
  if (!entry || entry.sources.length === 0) return undefined;
  let best = entry.sources[0];
  for (const s of entry.sources) if (s.count > best.count) best = s;
  return best;
};

/**
 * One line of provenance, for a tooltip.
 *
 * Reads as "sacks 4,096, chests 128" so the player can see the split rather
 * than a single number they have to trust. The feed is named only when the
 * island had one, since "mod" and "api" mean nothing next to a shard tally.
 */
export const describeSources = (entry: OwnedEntry | undefined): string => {
  if (!entry || entry.sources.length === 0) return "";
  return entry.sources
    .map((s) => `${SOURCE_LABEL[s.source]} ${s.count.toLocaleString()}${s.feed ? ` (${s.feed})` : ""}`)
    .join(", ");
};
