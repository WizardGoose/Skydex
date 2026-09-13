import type { IslandItem, IslandSnapshot } from "./types";
import {
  checkStorageIdentity,
  type StorageIdentityExpectation,
} from "./storageIdentity";

/**
 * Two feeds, one island.
 *
 * The companion mod and the Hypixel API both describe the same island and
 * neither can see all of it. The mod sees chests, inventory and ender chest,
 * because it reads screens the player opened; the API sees sacks, and only when
 * the player's in-game API settings allow it. Merging them is not a matter of
 * picking a winner overall - it is per section, because "the API answered more
 * recently" must never cost the player the chest data the API cannot supply at
 * all.
 *
 * The honesty rule from the original spec ("omitted is not empty") now has to
 * hold per source, and there turn out to be four distinct things a source can
 * say about a section. Blurring any two of them produces a confidently wrong
 * answer in a tool whose entire job is telling you where your stuff is:
 *
 *   captured  this source looked and found things.
 *   empty     this source looked and there was genuinely nothing.
 *   hidden    Hypixel returned a healthy profile with this section missing,
 *             which is how it signals that the player's API settings do not
 *             share it. Emphatically not "you own none".
 *   absent    this source cannot or has not yet looked. The API can never see
 *             a chest; the mod has not opened your ender chest yet.
 *
 * Only `captured` and `empty` are data. `hidden` and `absent` are statements
 * about the source, and neither can ever overwrite a section another source
 * actually has.
 */

export type IslandSource = "mod" | "api";

export type SectionState = "captured" | "empty" | "hidden" | "absent";

export type SectionKey = "sacks" | "chests" | "inventory" | "enderChest" | "storage";

export const SECTION_KEYS: readonly SectionKey[] = ["sacks", "chests", "inventory", "enderChest", "storage"];

/**
 * Feed order, which is also the tie-break order.
 *
 * When two feeds carry the same `receivedAt` - same millisecond, which happens
 * when a mod poll and an API pull land together - the mod wins. It is the
 * first-party, richer source and it is not gated on the player's privacy
 * settings, so preferring it is the choice that loses the least information.
 */
const ORDER: readonly IslandSource[] = ["mod", "api"];

/**
 * One source's contribution.
 *
 * `snapshot` is always a full, valid `IslandSnapshot` so it can be handed to
 * anything that already understands one. `sections` is the side-band that says
 * which parts of that snapshot are real: an API feed carries `chests: []` in
 * its snapshot because the type requires an array, and `sections.chests:
 * "absent"` is what stops that empty array from ever being read as "your island
 * has no chests".
 */
export interface IslandFeed {
  source: IslandSource;
  /** Our clock, when this feed arrived. Remote clocks are not trusted for age. */
  receivedAt: number;
  snapshot: IslandSnapshot;
  sections: Record<SectionKey, SectionState>;
}

/** One source's share of a section, with its own clock. */
export interface SectionContribution {
  source: IslandSource;
  at: number;
}

/** Where a merged section came from, and when. `at`/`source` are null only when nothing has ever spoken to it. */
export interface SectionProvenance {
  state: SectionState;
  /** The dominant source. For a mixed section this is whichever one wins collisions. */
  source: IslandSource | null;
  at: number | null;
  /**
   * Present only when a section genuinely drew from more than one source, which
   * today means sacks and nothing else. Its absence is the signal that a single
   * feed supplied the whole thing, so a caller never has to unpack a
   * one-element list to say "from the mod, 3m ago".
   */
  contributors?: SectionContribution[];
}

/**
 * Sections the mod owns outright when it has them.
 *
 * Only chests, and only because the API cannot see one at any privacy setting,
 * so there is never anything to weigh it against.
 *
 * Sacks are deliberately NOT here. They used to be, and it was a bug: the mod
 * only knows about sack types the player has actually opened, so giving it the
 * whole section meant a live mod hid every sack the API knew about and the
 * player had not opened. Running the mod made you see less than running nothing.
 * Sacks now merge per item instead, below.
 */
const MOD_OWNED: readonly SectionKey[] = ["chests"];

export interface MergeOptions {
  /**
   * True while the mod's live transport is connected.
   *
   * Live mode carries every section and has no rate limit, so mod data
   * replaces the API for inventory, ender chest and storage while it is up.
   * Off the live path a clipboard code omits those sections entirely, so they
   * simply fall to the API without needing a rule.
   */
  modLive?: boolean;
  /**
   * Connected identity used to keep a cached feed from another account or
   * unresolved account out of the merged view. The raw feed remains intact in
   * the caller's FeedSet for a later identity change or an explicit clear.
   */
  identity?: StorageIdentityExpectation;
}

export interface MergedIsland {
  /**
   * The merged view. Shape-identical to a single-source snapshot on purpose:
   * everything already written against `IslandSnapshot`, `sackLookup` included,
   * keeps working without knowing two feeds exist.
   */
  snapshot: IslandSnapshot | null;
  sections: Record<SectionKey, SectionProvenance>;
  /** When each feed last landed, or null if that source has never reported. */
  sources: Record<IslandSource, number | null>;
}

/** Read the state of an optional section straight off a snapshot. */
const optionalState = (list: IslandItem[] | undefined): SectionState =>
  list === undefined ? "absent" : list.length > 0 ? "captured" : "empty";

/**
 * Derive section states from a snapshot alone.
 *
 * Valid for the mod, which has no notion of "hidden" - every section it sends
 * is something it actually looked at, and every section it omits is one it has
 * not reached yet. Not valid for the API, whose `hidden` state cannot be
 * recovered from the snapshot after the fact and so is carried explicitly.
 */
export const deriveSections = (snapshot: IslandSnapshot): Record<SectionKey, SectionState> => ({
  sacks: Object.keys(snapshot.sacks).length > 0 ? "captured" : "empty",
  chests: snapshot.chests.length > 0 ? "captured" : "empty",
  inventory: optionalState(snapshot.inventory),
  enderChest: optionalState(snapshot.enderChest),
  storage: optionalState(snapshot.storage),
});

/** Wrap a mod snapshot as a feed. */
export const modFeed = (snapshot: IslandSnapshot, receivedAt: number): IslandFeed => ({
  source: "mod",
  receivedAt,
  snapshot,
  sections: deriveSections(snapshot),
});

const allAbsent = (): Record<SectionKey, SectionProvenance> => ({
  sacks: { state: "absent", source: null, at: null },
  chests: { state: "absent", source: null, at: null },
  inventory: { state: "absent", source: null, at: null },
  enderChest: { state: "absent", source: null, at: null },
  storage: { state: "absent", source: null, at: null },
});

export type FeedSet = Partial<Record<IslandSource, IslandFeed>>;

const feedMatchesIdentity = (feed: IslandFeed, expected: StorageIdentityExpectation): boolean => {
  const check = checkStorageIdentity(feed.snapshot, expected);
  return check.state === "match"
    || (!check.hasExpectedIdentity && check.state === "unknown");
};

/**
 * Merge the feeds into one island view plus its provenance.
 *
 * Per section: among the sources that actually have data, freshest wins. If
 * none do, the section reports `hidden` if any source said so, otherwise
 * `absent`. Identity (player, profile, game mode) is taken as a block from the
 * freshest feed that knows a name, rather than field by field, because a
 * profile stitched together from two sources is a profile that belongs to
 * nobody. When `identity` is supplied, ineligible feeds are filtered before
 * this policy runs; their raw records remain in the caller's FeedSet.
 */
/**
 * Choose which feed supplies one section.
 *
 * Three rules, applied in order, and the order is the whole design:
 *
 *   1. Only real observations compete. `hidden` and `absent` are statements
 *      about a source, not about the island, so they never take a section from
 *      a source that actually has one.
 *   2. Never show the player less than we hold. A source with items beats a
 *      source that says "verified empty", regardless of which is newer, because
 *      the alternative is hiding data we are sitting on.
 *   3. Then precedence: the mod owns sacks and chests outright, and owns the
 *      three optional sections while it is live. Everywhere else, freshest
 *      wins, with ties going to the mod as the richer first-party source.
 */
const pickWinner = (
  key: SectionKey,
  list: readonly IslandFeed[],
  modLive: boolean
): IslandFeed | undefined => {
  const candidates = list.filter((f) => f.sections[key] === "captured" || f.sections[key] === "empty");
  if (candidates.length === 0) return undefined;

  const captured = candidates.filter((f) => f.sections[key] === "captured");
  const pool = captured.length > 0 ? captured : candidates;

  if (MOD_OWNED.includes(key) || modLive) {
    const mod = pool.find((f) => f.source === "mod");
    if (mod) return mod;
  }

  // `pool` preserves ORDER, and the comparison is strictly greater, so an exact
  // timestamp tie leaves the mod in front.
  return pool.reduce((best, f) => (f.receivedAt > best.receivedAt ? f : best));
};

interface SackMerge {
  sacks: Record<string, number>;
  provenance: SectionProvenance;
}

/**
 * Merge sacks per item rather than per section.
 *
 * Sacks are the one section where both sources see a genuinely partial view of
 * the same thing, and neither is a superset of the other:
 *
 *   the mod  only knows sack types the player has actually opened, but its
 *            counts are live and exact.
 *   the API  knows every sack on the profile, but only what the player's
 *            privacy settings publish, and only as of the last pull.
 *
 * So a whole-section winner is the wrong shape. Taking the union and letting
 * the mod win collisions gives the player the most complete picture available:
 * fresh counts where the mod has looked, the API's counts everywhere it has
 * not. Whole-section semantics here would mean running the mod made you see
 * FEWER sacks than running nothing at all, which is exactly backwards.
 *
 * The other sections stay whole-section on purpose. Chests are never in the API
 * so there is nothing to union, and inventory, ender chest and storage are
 * blob-shaped: splicing two snapshots of the same container together per item
 * would describe a state that never existed at any moment.
 */
const mergeSacks = (list: readonly IslandFeed[], fallback: SectionProvenance): SackMerge => {
  const candidates = list.filter((f) => f.sections.sacks === "captured" || f.sections.sacks === "empty");
  if (candidates.length === 0) return { sacks: {}, provenance: fallback };

  // Lowest precedence first, so the mod's pass overwrites the API's on any id
  // they both carry. `ORDER` puts the mod first, hence the reverse.
  const ascending = [...candidates].reverse();

  const sacks: Record<string, number> = {};
  const owner = new Map<string, IslandSource>();
  for (const feed of ascending) {
    for (const [id, count] of Object.entries(feed.snapshot.sacks)) {
      sacks[id] = count;
      owner.set(id, feed.source);
    }
  }

  // A source contributed only if at least one surviving entry is actually its
  // own. An API feed whose every id the mod also had has told us nothing new,
  // and labelling that "mod + API" would overstate what the API added.
  const contributors: SectionContribution[] = [];
  for (const feed of candidates) {
    if ([...owner.values()].includes(feed.source)) {
      contributors.push({ source: feed.source, at: feed.receivedAt });
    }
  }

  if (contributors.length === 0) {
    // Every candidate was a verified-empty sack section.
    const primary = candidates[0];
    return { sacks, provenance: { state: "empty", source: primary.source, at: primary.receivedAt } };
  }

  const primary = contributors[0];
  return {
    sacks,
    provenance: {
      state: "captured",
      source: primary.source,
      at: primary.at,
      // Only when genuinely mixed, so its presence means "this is a blend" and
      // callers never unpack a one-element list to say the ordinary thing.
      ...(contributors.length > 1 ? { contributors } : {}),
    },
  };
};

export function mergeFeeds(feeds: FeedSet, options: MergeOptions = {}): MergedIsland {
  const modLive = options.modLive === true;
  const rawList = ORDER.map((s) => feeds[s]).filter((f): f is IslandFeed => f !== undefined);
  const expectedIdentity = options.identity;
  let list = rawList;

  if (expectedIdentity) {
    /*
     * `profileId === null` means "follow Hypixel's selected profile", so the
     * access record may not carry a profile name yet. An API feed that already
     * passed the account gate is the one local proof of which selected profile
     * the page currently describes. Use that name only for this merge; never
     * let a foreign or unresolved API feed choose the anchor.
     */
    const accountIdentity: StorageIdentityExpectation = { ...expectedIdentity, profileName: null };
    const eligibleApi = rawList.find((feed) =>
      feed.source === "api" && checkStorageIdentity(feed.snapshot, accountIdentity).state === "match"
    );
    const explicitProfile = expectedIdentity.profileName?.trim();
    let filteringIdentity = expectedIdentity;
    let withholdModWithoutProfileProof = false;

    if (!explicitProfile && eligibleApi) {
      const apiProfile = eligibleApi.snapshot.profile.name.trim();
      if (apiProfile) {
        filteringIdentity = { ...expectedIdentity, profileName: apiProfile };
      } else {
        // The account is known, but a nameless API profile cannot establish
        // that cached mod containers belong to the same selected profile.
        withholdModWithoutProfileProof = true;
      }
    }

    list = rawList.filter((feed) => feedMatchesIdentity(feed, filteringIdentity));
    if (withholdModWithoutProfileProof) list = list.filter((feed) => feed.source !== "mod");
  }

  const sources: Record<IslandSource, number | null> = {
    mod: list.find((feed) => feed.source === "mod")?.receivedAt ?? null,
    api: list.find((feed) => feed.source === "api")?.receivedAt ?? null,
  };

  if (list.length === 0) return { snapshot: null, sections: allAbsent(), sources };

  const sections = allAbsent();
  const winners: Partial<Record<SectionKey, IslandFeed>> = {};

  for (const key of SECTION_KEYS) {
    // Sacks are unioned per item below, so no single feed "wins" them.
    if (key !== "sacks") {
      const winner = pickWinner(key, list, modLive);
      if (winner) {
        winners[key] = winner;
        sections[key] = { state: winner.sections[key], source: winner.source, at: winner.receivedAt };
        continue;
      }
    }

    // Nobody has data. Prefer saying *why* over saying nothing: "your API
    // settings hide this" is actionable, "not captured" is not.
    const hiddenBy = list.find((f) => f.sections[key] === "hidden");
    if (hiddenBy) sections[key] = { state: "hidden", source: hiddenBy.source, at: hiddenBy.receivedAt };
  }

  // `sections.sacks` currently holds whatever the hidden/absent pass decided,
  // which is the right answer only when no source has sacks at all.
  const sackMerge = mergeSacks(list, sections.sacks);
  sections.sacks = sackMerge.provenance;

  // Freshest first, ORDER-stable on a tie.
  const sorted = [...list].sort((a, b) => b.receivedAt - a.receivedAt);
  const primary = sorted[0];
  const identity = sorted.find((f) => f.snapshot.player.name || f.snapshot.profile.name) ?? primary;

  const snapshot: IslandSnapshot = {
    schema: 1,
    // A single export time is meaningless across two sources, so it is the
    // freshest feed's and nothing more. Per-section ages live in `sections`,
    // which is what the UI actually labels each heading with.
    exportedAt: primary.snapshot.exportedAt,
    player: { ...identity.snapshot.player },
    profile: { ...identity.snapshot.profile },
    sacks: sackMerge.sacks,
    chests: winners.chests ? winners.chests.snapshot.chests : [],
  };

  // Assigned only when a source actually has them, so `undefined` keeps meaning
  // "nobody has looked" all the way out to the page.
  if (winners.inventory) snapshot.inventory = winners.inventory.snapshot.inventory ?? [];
  if (winners.enderChest) snapshot.enderChest = winners.enderChest.snapshot.enderChest ?? [];
  if (winners.storage) snapshot.storage = winners.storage.snapshot.storage ?? [];

  // The greenhouse board has exactly one source: the mod. The API has no such
  // field at any privacy setting, so there is nothing to weigh it against and
  // no section state to keep. Read straight off the mod feed, which means it
  // lives and dies with that feed: a newer mod snapshot without a board simply
  // has none, which is the wholesale-replacement rule the spec asks for and
  // the reason there is deliberately no keep-last here.
  const mod = list.find((feed) => feed.source === "mod");
  if (mod?.snapshot.greenhouse) snapshot.greenhouse = mod.snapshot.greenhouse;

  return { snapshot, sections, sources };
}
