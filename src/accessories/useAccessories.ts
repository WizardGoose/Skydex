import { useSyncExternalStore } from "react";
import { recipesStore } from "../items/useItemData";
import { currentAccess, hasApiProfileAccess } from "../island/apiKey";
import { fetchProfileMember } from "../island/hypixel";
import { setApiBioanalysis } from "../island/profileStats";
import { accessoriesFromIndex, buildAccessoryCatalogue } from "./catalogue";
import type { AccessoryCatalogue, AccessoryEntry } from "./catalogue";
import {
  bioanalysisRank,
  collapseOwned,
  readAbiphoneContacts,
  readConsumedPrism,
  readOwnedFromMember,
} from "./owned";
import type { EventKey } from "./skyblockCalendar";
import {
  buildCollectionKeys,
  gateAccessory,
  NO_COLLECTIONS,
  readCollections,
} from "./collections";
import type { CollectionBlock, CollectionProgress } from "./collections";
import {
  checkRequirement,
  NO_PROGRESS,
  readProgress,
  type CheckedRequirement,
  type PlayerProgress,
} from "./requirements";
import {
  fetchWikiFacts,
  readSourceCache,
  resolveSource,
  SOURCE_TTL,
  writeSourceCache,
} from "./sources";
import type { EventIndex, LocationSignals, SourceCategory, SourceIndex } from "./sources";
import { fetchLocationGroups, type LocationIndex } from "./locations";
import { buildChainIndex, EMPTY_CHAINS, type ChainIndex, type IdUpgradeEdge, type UpgradeEdge } from "./chains";
import { fetchNeuUpgrades, NEU_TTL, readNeuCache, writeNeuCache } from "./neuUpgrades";
import { computeFolds } from "./dedup";
import {
  computeMagicalPower,
  NO_MP_INPUTS,
  type MagicalPowerFigure,
  type MagicalPowerInputs,
} from "./magicalPower";
import { attainabilityOf, groupOf, type AccessoryGroup, type Attainability } from "./grouping";

/**
 * The accessories page's one shared value.
 *
 * Built as an external store rather than component state for the reason
 * `useItemData.ts` spells out at length: anything read in more than one place
 * has to be genuinely shared, and this composes four independent things (the
 * item index, the player's bag, the wiki's source classifications and the
 * player's collection unlocks) that arrive at different times and must not be
 * fetched twice.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * There is no timer here and nothing polls. The bag is read on demand behind a
 * TTL, and the wiki classifications are cached for a day, exactly like the
 * crafting index. Nothing in this module writes to a storage key it did not
 * create: the only key it touches is `skyindex.accessories.wiki.v3`, and the
 * only place anything is stored is the visitor's own browser.
 */

export type AccessoryStatus = "owned" | "missing" | "locked";
export type { SourceCategory };

export interface AccessoryView extends AccessoryEntry {
  status: AccessoryStatus;
  source: SourceCategory;
  /**
   * Every requirement this accessory carries, already measured against the
   * player. Shown on the tile whatever the status is, because "what does this
   * ask of me" is useful even to somebody with no profile loaded.
   */
  checked: CheckedRequirement[];
  /**
   * The requirement that locked it, or null. Only ever set from a requirement
   * measured as `unmet`; an `unknown` one never locks anything.
   */
  blockedBy: CheckedRequirement | null;
  /** True when this is covered by owning a higher rung of its family. */
  coveredByFamily: boolean;
  /**
   * The id of the family's next step this NOT-owned rung folded behind, or
   * null when the entry is itself visible. A rung is folded exactly when a
   * lower rung of its own line is also still needed: the player cannot act on
   * this one yet, so the missing sections show the actual next step instead
   * and this entry hides behind it (revealed by the covered toggle, or by a
   * search naming it outright). Always null when no bag was read, because
   * "still needed" is a claim about the player. See `dedup.ts`.
   */
  foldedBehind: string | null;
  /**
   * The not-owned rungs of this entry's line that folded behind it, nearest
   * rung first. Non-empty only on a visible next step; it is what the "+N"
   * chip and the hover card's line list are made of.
   */
  foldedHigher: readonly FoldedRung[];
  /** Which part of the game this belongs to. */
  group: AccessoryGroup;
  /** How far away it is, given what we could measure. */
  attainability: Attainability;
  /**
   * Which calendar event this comes from, when its source is `event` and its
   * article named one. Null for every non-event accessory; `"unknown"` for an
   * event accessory whose event either could not be named or is not on the
   * in-game calendar at all (Great Spook, Mining Fiesta and their kind), and
   * an unknown event never lights an actionable border.
   */
  eventKey: EventKey | null;
}

/** A folded rung, carried with enough to render its name in its rarity colour. */
export interface FoldedRung {
  id: string;
  name: string;
  tier: string | null;
}

export interface AccessoriesSnapshot {
  entries: AccessoryView[];
  /**
   * Whether the accessory bag was actually read.
   *
   * False does NOT mean the player owns nothing. It means no key, no profile,
   * or a bag that would not decode, and the page renders a completely different
   * thing for it: one ungrouped catalogue with no ownership claim at all.
   */
  ownedKnown: boolean;
  /**
   * Status counts over the WHOLE catalogue, Rift included, because they are
   * the truth about everything indexed. The page's header derives its
   * normal-only figures by subtracting `riftCounts`, so that Rift accessories
   * appear in the header only under their own label.
   */
  counts: { total: number; owned: number; missing: number; locked: number };
  /**
   * The same status counts over the Rift accessories alone (Hypixel's
   * `origin: "RIFT"`). They render as their own band with their own header
   * figure: a Rift accessory works only inside the Rift and mostly lives in
   * the Rift's own inventory rather than the bag, so folding it into the
   * normal missing sections both cluttered them and implied Magical Power it
   * would never give.
   */
  riftCounts: { total: number; owned: number; missing: number; locked: number };
  sourceCounts: Record<SourceCategory, number>;
  /** How many requirements of each kind the catalogue carries. */
  requirementCounts: Record<string, number>;
  /**
   * How many NOT-owned accessories sit in each attainability tier. Rungs, not
   * lines, and NORMAL accessories only: the Rift band is its own section with
   * its own figure, so a Crux rung must not pad the "Missing Accessories"
   * count it will never appear under.
   */
  reachCounts: Record<Attainability, number>;
  /**
   * The same tiers counted after the family fold: one per line, the rung the
   * player would actually go and get. This is the number the header leads
   * with, because "Get now: 286" was a lie of aggregation when 200 of those
   * were rungs stacked behind rungs. Equal to `reachCounts` when no bag was
   * read, since nothing folds without one.
   */
  nextStepCounts: Record<Attainability, number>;
  /** Not-owned rungs folded behind a next step, across all tiers. */
  foldedCount: number;
  /**
   * Base-value Magical Power over the active accessories, or null when no bag
   * was read. Never exact by construction; the page owns saying why.
   */
  magicalPower: MagicalPowerFigure | null;
  /**
   * Bag ids of which at least one stack carries `rarity_upgrades` - the same
   * set the MP model consumes, surfaced here so the tiles can wear the
   * UPGRADED rarity: a recombed legendary IS mythic in game, and drawing its
   * base tint would understate the player's own item. Empty when no bag was
   * read, which claims nothing.
   */
  recombobulated: ReadonlySet<string>;
  /** How many accessories sit in each activity group. */
  groupCounts: Record<AccessoryGroup, number>;
  /** Collection names we could not resolve, so their accessories stayed in Missing. */
  unresolvedCollections: number;
  loading: boolean;
  error: string | null;
}

const EMPTY_SOURCE_COUNTS: Record<SourceCategory, number> = {
  craftable: 0,
  quest: 0,
  darkAuction: 0,
  shop: 0,
  event: 0,
  mobDrop: 0,
  wiki: 0,
};

const EMPTY: AccessoriesSnapshot = {
  entries: [],
  ownedKnown: false,
  counts: { total: 0, owned: 0, missing: 0, locked: 0 },
  riftCounts: { total: 0, owned: 0, missing: 0, locked: 0 },
  sourceCounts: EMPTY_SOURCE_COUNTS,
  requirementCounts: {},
  reachCounts: { now: 0, soon: 0, long: 0, unknownReach: 0 },
  nextStepCounts: { now: 0, soon: 0, long: 0, unknownReach: 0 },
  foldedCount: 0,
  magicalPower: null,
  recombobulated: new Set<string>(),
  groupCounts: {
    combat: 0, mining: 0, farming: 0, fishing: 0, foraging: 0, dungeons: 0, rift: 0, event: 0, other: 0,
  },
  unresolvedCollections: 0,
  loading: true,
  error: null,
};

/* -------------------------------------------------------------------------- */
/* Composition, kept pure so the rules can be tested without a network         */
/* -------------------------------------------------------------------------- */

/**
 * Turn a collection unlock into the same shape every other requirement uses.
 *
 * Collections were gated before the other requirement kinds existed and had
 * their own result type. Rather than keep two parallel notions of "you cannot
 * have this yet", the collection gate is adapted here into a
 * `CheckedRequirement`, so the page has exactly one thing to render and one
 * rule for what locks an accessory.
 */
const asCollectionRequirement = (block: CollectionBlock): CheckedRequirement => ({
  kind: "collection",
  target: `${block.collection} collection`,
  threshold: `tier ${block.tier}`,
  how: `Collect ${block.required.toLocaleString()} ${block.collection}.`,
  raw: "COLLECTION",
  state: "unmet",
  have: block.have.toLocaleString(),
  // Items short. The triage reads this as a fraction of the requirement rather
  // than as an absolute, since 200 short of 250 and 200 short of 50,000 are
  // very different errands.
  gap: Math.max(0, block.required - block.have),
});

/**
 * Fold everything into the snapshot the page renders.
 *
 * The status rule, in order, and the order is the argument:
 *
 *   owned    it is in the bag, or a higher rung of its family is
 *   locked   at least one requirement was MEASURED and the player fails it
 *   missing  everything else, including everything we could not measure
 *
 * THE LINE BETWEEN LOCKED AND MISSING
 * -----------------------------------
 * Only a requirement whose state is `unmet` locks anything. A requirement we
 * can read but cannot check (no profile loaded, or a progress field this
 * codebase has no verified path for, such as Heart of the Mountain) is
 * `unknown`, and an unknown requirement leaves the accessory in Missing with
 * its requirement still shown on the tile.
 *
 * That asymmetry is deliberate and it is the honest direction to fail in.
 * Locked is an instruction to go and grind something specific, so putting an
 * item there on an unmeasured guess sends a player off to level a slayer they
 * may already have levelled. Leaving it in Missing while displaying the
 * requirement tells them everything useful and claims nothing we did not check.
 *
 * Collection gating keeps its old restriction to craftable accessories, since a
 * collection tier that grants a recipe means nothing for an item you were never
 * going to craft. Hypixel's own requirements carry no such restriction: a
 * slayer level gates the item itself, however you get it.
 */
export function composeSnapshot(
  catalogue: AccessoryCatalogue,
  ownedIds: readonly string[] | null,
  sources: SourceIndex,
  progress: CollectionProgress,
  collectionKeys: Map<string, string>,
  loading: boolean,
  error: string | null,
  player: PlayerProgress = NO_PROGRESS,
  chainIndex: ChainIndex = EMPTY_CHAINS,
  /**
   * Where each accessory is bought or found, and what those names turned out to
   * mean. Both default to empty, so every existing caller keeps the behaviour
   * it had: with no location data the grouping falls back to stats alone.
   */
  locationSignals: LocationSignals = {},
  locationIndex: LocationIndex = {},
  /** Which calendar event each event accessory belongs to, by article name. */
  eventKeys: EventIndex = {},
  /**
   * The profile facts the Magical Power model detects its special cases from:
   * recombed stacks, a consumed Rift Prism, the Abiphone contact count. All
   * read off the same profile pull as the bag; the default claims nothing.
   */
  mpInputs: MagicalPowerInputs = NO_MP_INPUTS
): AccessoriesSnapshot {
  const ownedKnown = ownedIds !== null;
  const sets = collapseOwned(ownedIds ?? [], catalogue, chainIndex);

  const entries: AccessoryView[] = [];
  const sourceCounts = { ...EMPTY_SOURCE_COUNTS };
  const requirementCounts: Record<string, number> = {};
  const reachCounts: Record<Attainability, number> = { now: 0, soon: 0, long: 0, unknownReach: 0 };
  const groupCounts: Record<AccessoryGroup, number> = {
    combat: 0, mining: 0, farming: 0, fishing: 0, foraging: 0, dungeons: 0, rift: 0, event: 0, other: 0,
  };
  let owned = 0;
  let missing = 0;
  let locked = 0;
  let unresolvedCollections = 0;
  const riftCounts = { total: 0, owned: 0, missing: 0, locked: 0 };

  for (const entry of catalogue.entries) {
    const source = resolveSource(entry.craftable, sources[entry.name]);
    sourceCounts[source] += 1;

    // Measured for every accessory, owned or not, because the tile shows them
    // regardless and a keyless visitor should still learn what a thing asks.
    const checked: CheckedRequirement[] = entry.requirements.map((r) => checkRequirement(r, player));
    for (const r of checked) requirementCounts[r.kind] = (requirementCounts[r.kind] ?? 0) + 1;

    let status: AccessoryStatus = "missing";
    let blockedBy: CheckedRequirement | null = null;
    let coveredByFamily = false;
    // The collection size behind any collection gate, so the triage can judge
    // "nearly there" as a fraction rather than as an absolute item count.
    let collectionRequired: number | null = null;

    if (ownedKnown && sets.covered.has(entry.id)) {
      status = "owned";
      coveredByFamily = !sets.held.has(entry.id);
      owned += 1;
    } else {
      if (entry.craftable && entry.unlocks) {
        const gate = gateAccessory(entry.unlocks, progress, collectionKeys);
        if (gate.unresolved) unresolvedCollections += 1;
        if (gate.block) {
          const asRequirement = asCollectionRequirement(gate.block);
          collectionRequired = gate.block.required;
          checked.push(asRequirement);
          requirementCounts.collection = (requirementCounts.collection ?? 0) + 1;
        }
      }

      // The first unmet requirement is the one the tile leads with. Ordering is
      // catalogue order, which puts Hypixel's own requirement ahead of the
      // collection gate: a slayer level blocks the item outright, whereas a
      // collection tier only blocks one route to it.
      blockedBy = checked.find((r) => r.state === "unmet") ?? null;
      if (blockedBy) {
        status = "locked";
        locked += 1;
      } else {
        missing += 1;
      }
    }

    const group = groupOf({
      checked,
      source,
      stats: entry.stats,
      locations: locationSignals[entry.name],
      locationIndex,
    });
    groupCounts[group] += 1;

    /*
     * Attainability is a statement about work remaining, so it is only computed
     * for something the player does not already have. An owned accessory has no
     * distance left and counting it in a "get this now" tier would pad the one
     * number the page exists to answer.
     *
     * Without a readable bag every entry is treated as not-owned, which is the
     * same honest position the rest of the page takes.
     */
    const attainability = attainabilityOf({ checked, source, collectionRequired });

    // The Rift tally, alongside the overall one rather than instead of it:
    // `counts` stays the whole truth and the page subtracts.
    if (entry.rift) {
      riftCounts.total += 1;
      if (status === "owned") riftCounts.owned += 1;
      else if (status === "locked") riftCounts.locked += 1;
      else riftCounts.missing += 1;
    }

    entries.push({
      ...entry,
      status,
      source,
      checked,
      blockedBy,
      coveredByFamily,
      foldedBehind: null,
      foldedHigher: [],
      group,
      attainability,
      // Only an event accessory carries a key; `unknown` inside the index is
      // itself an honest answer, and an event article the pass never learned
      // a key for is the same admission.
      eventKey: source === "event" ? eventKeys[entry.name] ?? "unknown" : null,
    });
  }

  /*
   * The family fold, second pass because it needs the whole not-owned set.
   *
   * Only with a bag: folding says "this is not your next step", which is a
   * claim about the player, and without a bag the catalogue view already
   * refuses every such claim. The rung counts (`reachCounts`) stay as they
   * always were; `nextStepCounts` is the deduped view, and the two are equal
   * exactly when nothing folded.
   */
  const nextStepCounts: Record<Attainability, number> = { now: 0, soon: 0, long: 0, unknownReach: 0 };
  let foldedCount = 0;

  if (ownedKnown) {
    const missingIds = new Set<string>();
    for (const e of entries) if (e.status !== "owned") missingIds.add(e.id);

    const folds = computeFolds(missingIds, chainIndex);
    foldedCount = folds.foldedBehind.size;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (e.status === "owned") continue;

      const behind = folds.foldedBehind.get(e.id) ?? null;
      const above = folds.foldedAbove.get(e.id);
      if (behind || above) {
        entries[i] = {
          ...e,
          foldedBehind: behind,
          foldedHigher: (above ?? []).map((id) => {
            const rung = catalogue.byId[id];
            return { id, name: rung?.name ?? id, tier: rung?.tier ?? null };
          }),
        };
      }
    }
  }

  for (const e of entries) {
    if (e.status === "owned") continue;
    // Rift accessories have their own band and their own header figure, so
    // they stay out of the tier counts entirely: a count is a promise about
    // what its section holds.
    if (e.rift) continue;
    reachCounts[e.attainability] += 1;
    if (e.foldedBehind === null) nextStepCounts[e.attainability] += 1;
  }

  /*
   * Magical Power runs over what the player actually holds, not over coverage:
   * the game pays out for the highest rung of each line and nothing beneath it,
   * and `computeMagicalPower` applies exactly that rule against the same chain
   * index the fold uses. Null without a bag, blank rather than zero on the page.
   */
  /*
   * The bag ids the catalogue has never heard of are computed HERE rather
   * than where the bag was read, because they are a joint fact: the same bag
   * against a rebuilt catalogue can stop (or start) missing ids, and a stale
   * set computed against an older catalogue would price ghosts.
   */
  const uncatalogued = new Set((ownedIds ?? []).filter((id) => !catalogue.byId[id]));
  const magicalPower = ownedKnown
    ? computeMagicalPower(sets.held, catalogue, chainIndex, { ...mpInputs, uncatalogued })
    : null;

  return {
    entries,
    ownedKnown,
    counts: { total: catalogue.entries.length, owned, missing, locked },
    riftCounts,
    sourceCounts,
    requirementCounts,
    reachCounts,
    nextStepCounts,
    foldedCount,
    magicalPower,
    recombobulated: mpInputs.recombobulated,
    groupCounts,
    unresolvedCollections,
    loading,
    error,
  };
}

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

let snapshot: AccessoriesSnapshot = EMPTY;
const listeners = new Set<() => void>();

/** The pieces, held separately because they land at different times. */
let catalogue: AccessoryCatalogue | null = null;
let collectionKeys = new Map<string, string>();
let ownedIds: string[] | null = null;
/** Recombed stacks, the prism flag and the contact count, from the profile. */
let mpInputs: MagicalPowerInputs = NO_MP_INPUTS;
let sources: SourceIndex = {};
/** Which calendar event each event accessory names. From the same wiki pass. */
let eventKeys: EventIndex = {};
let chains: ChainIndex = EMPTY_CHAINS;
let upgradeEdges: UpgradeEdge[] = [];
/** NEU's id edges, the third chain source. Empty until its fetch or cache lands. */
let neuEdges: IdUpgradeEdge[] = [];
let locationSignals: LocationSignals = {};
let locationGroups: LocationIndex = {};
let progress: CollectionProgress = NO_COLLECTIONS;
let player: PlayerProgress = NO_PROGRESS;
let loading = true;
let error: string | null = null;

const publish = () => {
  snapshot = catalogue
    ? composeSnapshot(
        catalogue, ownedIds, sources, progress, collectionKeys, loading, error, player, chains,
        locationSignals, locationGroups, eventKeys, mpInputs
      )
    : { ...EMPTY, loading, error };
  for (const fn of listeners) fn();
};

const getSnapshot = () => snapshot;

/** Which account and profile the cached bag belongs to, so a switch cannot show a stale one. */
let cachedFor = "";
/** Five minutes, the same freshness the rest of the site gives a profile pull. */
const BAG_TTL = 5 * 60 * 1000;
let bagReadAt = 0;
let bagInFlight = false;
let sourcesInFlight = false;
let locationsInFlight = false;
let neuInFlight = false;
/** The cache is read once per session, not once per recipes publish. */
let neuHydrated = false;

/**
 * Rebuild the catalogue from the shared item index.
 *
 * Called on every recipes publish. The index arrives from cache first and then
 * again from the network, so this runs more than once and has to be cheap and
 * idempotent, which it is: it is a pure function of the index.
 */
const rebuildCatalogue = () => {
  const { items, loading: itemsLoading, error: itemsError } = recipesStore.getSnapshot();
  const list = accessoriesFromIndex(items);

  if (list.length === 0) {
    // No accessories yet means the index has not landed, not that the game has
    // none. Stay in loading rather than rendering an empty catalogue.
    loading = itemsLoading || true;
    error = itemsError;
    if (!itemsLoading && itemsError) loading = false;
    publish();
    return;
  }

  catalogue = buildAccessoryCatalogue(list, items);
  collectionKeys = buildCollectionKeys(items);
  loading = false;
  error = itemsError;
  publish();

  void ensureSources();
  void ensureNeuUpgrades();
};

/**
 * Learn NEU's upgrade edges.
 *
 * Independent of the wiki pass on purpose: the two sources fail separately and
 * neither should cost the other. Cache first with the same stale-is-better
 * discipline as the wiki cache, then one fetch a day at most. A miss costs
 * nothing visible, because the wiki edges and the stem supplement still stand;
 * NEU only ever adds chains the wiki has not documented.
 */
const ensureNeuUpgrades = async (): Promise<void> => {
  if (!catalogue || neuInFlight) return;

  if (!neuHydrated) {
    neuHydrated = true;
    const cached = readNeuCache();
    if (cached) {
      neuEdges = cached.edges;
      chains = buildChainIndex(upgradeEdges, catalogue, neuEdges);
      publish();
      if (Date.now() - cached.fetchedAt < NEU_TTL) return;
    }
  } else if (neuEdges.length > 0) {
    // Hydrated and holding edges means either a fresh cache or a completed
    // fetch this session; either way there is nothing left to do.
    return;
  }

  neuInFlight = true;
  try {
    neuEdges = await fetchNeuUpgrades();
    writeNeuCache({ fetchedAt: Date.now(), edges: neuEdges });
    chains = buildChainIndex(upgradeEdges, catalogue, neuEdges);
    publish();
  } catch {
    // Whatever was cached, stale included, stays in force. Losing the NEU
    // supplement for a session is not worth a banner: the wiki edges are the
    // primary source and they are unaffected.
  } finally {
    neuInFlight = false;
  }
};

/**
 * Read every accessory's article for the facts only the wiki states.
 *
 * This used to ask only about the accessories with no recipe, on the argument
 * that craftability is already known for certain and confirming it would waste
 * a request. That was true of the SOURCE and wrong about everything else the
 * same articles carry: upgrade fields and location signals do not care whether
 * an item is craftable, and skipping the craftable articles left a measurable
 * hole in the chain graph. The Crux line is the proof: seven craftable rungs
 * whose ids (`CRUX_TALISMAN_1`..) fit no stem, absent from NEU's constant, and
 * stated only in their own articles, which were never fetched, so the line
 * never collapsed and never folded. So every article is asked about now, which
 * is what `chains.ts` always said happened. The classification learned for a
 * craftable item is cached but never shown: `resolveSource` answers
 * `craftable` first, from our own recipe index, exactly as before.
 *
 * Anything already in the cache is skipped, so a return visit inside the day
 * still costs no requests at all, and the widened pass costs about four extra
 * batched requests once a day.
 */
const ensureSources = async (): Promise<void> => {
  if (!catalogue || sourcesInFlight) return;

  const cached = readSourceCache();
  if (cached) {
    upgradeEdges = cached.upgrades ?? [];
    chains = buildChainIndex(upgradeEdges, catalogue, neuEdges);
    locationSignals = cached.locations ?? {};
    locationGroups = cached.locationGroups ?? {};
    eventKeys = cached.events ?? {};
  }
  if (cached && Date.now() - cached.fetchedAt < SOURCE_TTL) {
    sources = cached.sources;
    publish();
  } else if (cached) {
    // Stale, but a stale classification is far better than a blank one while
    // the refresh happens. Same policy as the crafting index.
    sources = cached.sources;
    publish();
  }

  const wanted = catalogue.entries.filter((e) => !(e.name in sources)).map((e) => e.name);
  if (wanted.length === 0) {
    // The articles are all cached, but a visitor who was here before the
    // location pass existed has signals and no answers for them yet.
    await ensureLocationGroups();
    return;
  }

  sourcesInFlight = true;
  try {
    const learned = await fetchWikiFacts(wanted);
    sources = { ...sources, ...learned.sources };
    upgradeEdges = [...upgradeEdges, ...learned.upgrades];
    chains = buildChainIndex(upgradeEdges, catalogue, neuEdges);
    locationSignals = { ...locationSignals, ...learned.locations };
    eventKeys = { ...eventKeys, ...learned.events };
    writeSourceCache({
      fetchedAt: Date.now(),
      sources,
      upgrades: upgradeEdges,
      locations: locationSignals,
      locationGroups,
      events: eventKeys,
    });
    publish();

    /*
     * The second pass, and it is deliberately second.
     *
     * The names only exist once the articles have been read, and resolving them
     * runs over the DISTINCT names rather than over the accessories: 65 names
     * for 407 accessories, so it costs about two requests on top of the nine
     * already made. The page is already rendered and usable by this point; the
     * activity groups simply sharpen a moment later.
     */
    await ensureLocationGroups();
  } catch {
    // Every accessory we failed to classify simply shows "See wiki", which is
    // the honest rendering of not knowing. Not worth an error banner.
  } finally {
    sourcesInFlight = false;
  }
};

/**
 * Turn the merchant and zone names into activities.
 *
 * Only names we have no answer for are asked about, so this is free on a return
 * visit and cheap on a first one. A failure leaves the index as it is and the
 * affected accessories in Other, which is the honest outcome: not knowing where
 * something comes from is not a reason to guess what it is.
 */
const ensureLocationGroups = async (): Promise<void> => {
  if (!catalogue || locationsInFlight) return;

  const unresolved = new Set<string>();
  for (const signals of Object.values(locationSignals)) {
    for (const s of signals) if (!(s in locationGroups)) unresolved.add(s);
  }
  if (unresolved.size === 0) return;

  locationsInFlight = true;
  try {
    const learned = await fetchLocationGroups([...unresolved]);
    if (Object.keys(learned).length === 0) return;
    locationGroups = { ...locationGroups, ...learned };
    writeSourceCache({
      fetchedAt: Date.now(),
      sources,
      upgrades: upgradeEdges,
      locations: locationSignals,
      locationGroups,
      events: eventKeys,
    });
    publish();
  } catch {
    // Same policy as the source pass: an unresolved name leaves its accessory
    // in Other, and Other is a true statement.
  } finally {
    locationsInFlight = false;
  }
};

/**
 * Read the player's bag and collections.
 *
 * One request, on demand, behind a TTL. A visitor with no key never reaches the
 * network at all and still gets the whole catalogue with sources, which is the
 * point of doing the gating last rather than making it a precondition.
 */
export const refreshOwned = async (force = false): Promise<void> => {
  const access = currentAccess();
  const identity = `${access.uuid}:${access.profileId ?? ""}`;

  if (identity !== cachedFor) {
    // A different account or profile is a different question, so the old answer
    // goes first rather than being shown against the new player's name.
    cachedFor = identity;
    ownedIds = null;
    mpInputs = NO_MP_INPUTS;
    progress = NO_COLLECTIONS;
    bagReadAt = 0;
    setApiBioanalysis(null);
    publish();
  }

  if (!hasApiProfileAccess(access)) return;
  if (bagInFlight) return;
  if (!force && bagReadAt !== 0 && Date.now() - bagReadAt < BAG_TTL) return;

  bagInFlight = true;
  try {
    const result = await fetchProfileMember({ uuid: access.uuid, name: access.name }, access.key, access.profileId);
    if (!result.ok) {
      // Deliberately not an error banner. A rejected key or a private profile
      // leaves the catalogue perfectly usable, and the page already says
      // plainly that no bag was read.
      ownedIds = null;
      mpInputs = NO_MP_INPUTS;
      progress = NO_COLLECTIONS;
      player = NO_PROGRESS;
      setApiBioanalysis(null);
      publish();
      return;
    }

    bagReadAt = result.fetchedAt ?? Date.now();
    const bag = await readOwnedFromMember(result.value.member);
    ownedIds = bag?.ids ?? null;
    // Everything the MP model detects, off the member we already hold: the
    // recombed stacks from the bag NBT, the consumed-prism flag and the
    // Abiphone contact count from their own profile fields.
    mpInputs = {
      ...NO_MP_INPUTS,
      recombobulated: bag?.recombobulated ?? new Set<string>(),
      bagTiers: bag?.tiers ?? new Map<string, string>(),
      consumedPrism: readConsumedPrism(result.value.member),
      abiphoneContacts: readAbiphoneContacts(result.value.member),
    };
    progress = readCollections(result.value.member);
    // Slayer levels and trophy fish, from the same member we already have.
    player = readProgress(result.value.member);

    /*
     * Hand the Bioanalysis rank to the greenhouse layer.
     *
     * This is the only place in the app that can answer it: a live profile dump
     * confirms the API has no Bioanalysis field of any kind, so decoding the
     * bag is the sole source. `profileStats.ts` owns what happens next, and a
     * number the player typed still beats this one.
     */
    setApiBioanalysis(bioanalysisRank(ownedIds));
    publish();
  } finally {
    bagInFlight = false;
  }
};

const subscribe = (fn: () => void) => {
  listeners.add(fn);

  // The item index is the floor everything else stands on, so the catalogue is
  // rebuilt whenever it publishes. Unsubscribing from it is part of teardown.
  const stopRecipes = recipesStore.subscribe(rebuildCatalogue);
  rebuildCatalogue();
  void refreshOwned();

  return () => {
    listeners.delete(fn);
    stopRecipes();
  };
};

export const useAccessories = (): AccessoriesSnapshot =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/** Read outside React, for anything that is not a component. */
export const currentAccessories = (): AccessoriesSnapshot => snapshot;
