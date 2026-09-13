import type { IslandSource } from "../island/merge";

/**
 * The vocabulary of "what the player owns".
 *
 * Three stores already answer some version of that question and none of them
 * can answer all of it. The island feed knows what is physically sitting in
 * sacks, chests and containers. The shards suite keeps its own tally of shards
 * the player has fused or collected. And the planner keeps the numbers the
 * player typed in by hand. This module is the read side that puts the three
 * together without any of them having to know the others exist.
 *
 * Nothing here writes. Every store keeps its own key, its own shape and its own
 * owner; this is a view over them, and the moment it starts writing back it
 * stops being a view and starts being a fourth source of truth to keep in step.
 */

/**
 * Where a single count came from.
 *
 * The island sections are listed separately rather than rolled into one
 * "island" because they answer different questions: 4,096 cobblestone in a sack
 * is a stockpile, 12 in your inventory is what you happen to be carrying, and a
 * player deciding whether to go mining wants to know which they are looking at.
 *
 * `manual` is in this list because it belongs to the vocabulary, but it never
 * appears in `OwnedEntry.sources` - see the note there.
 */
export type OwnedSource =
  | "island.sacks"
  | "island.chests"
  | "island.inventory"
  | "island.enderChest"
  | "island.storage"
  | "profile.armor"
  | "profile.equipment"
  | "profile.wardrobe"
  | "profile.accessories"
  | "profile.personalVault"
  | "profile.fishingBag"
  | "profile.potionBag"
  | "profile.sacksBag"
  | "profile.quiver"
  | "profile.candy"
  | "profile.carnivalMasks"
  | "profile.farmingToolkit"
  | "profile.huntingToolkit"
  | "profile.museum"
  | "shards"
  | "manual";

/** One source's contribution to one item. */
export interface SourceCount {
  source: OwnedSource;
  /**
   * For island sections, which feed won that section in the merge: the
   * companion mod or the Hypixel API. Null for everything else, because
   * nothing else has two possible origins.
   */
  feed: IslandSource | null;
  /**
   * What that source says, which can legitimately be 0. A source that looked
   * and found nothing still gets an entry here; a source that never looked
   * gets no entry at all. Those are different statements and this list keeps
   * them apart.
   */
  count: number;
  /** When that source last reported, on our clock. Null when it does not date itself. */
  at: number | null;
}

/**
 * Everything known about one item, keyed by the site's own item key.
 *
 * The precedence rule lives in exactly one expression, in `aggregate.ts`:
 * a manual number replaces the automatic total outright, it does not add to it.
 * That is why `manual` is a separate field rather than another entry in
 * `sources`. Mixing a value that *replaces* into a list that *sums* is how you
 * end up quietly double counting the thing the player typed.
 */
export interface OwnedEntry {
  /** The site's item key, which is also a greenhouse mutation id. */
  key: string;
  /** The Hypixel id this bridged through, or null when the site knows it by name only. */
  hypixelId: string | null;
  /** Sum across every automatic source. Never includes the manual number. */
  auto: number;
  /** Which automatic sources spoke, in a stable order. Empty when none did. */
  sources: SourceCount[];
  /** What the player typed, or null when they have not. 0 is a real answer, not an absence. */
  manual: number | null;
  /** What to show: the manual number when there is one, the automatic total otherwise. */
  total: number;
  /** True when `total` came from the player rather than from a sync. */
  overridden: boolean;
}

/**
 * The read API.
 *
 * Shaped after `SackLookup` on purpose, because the pages that need this
 * already speak that shape. `has` is the important half for anything rendering
 * a column: with no mod, no API key and no shard tally there is nothing to say,
 * and a column of blanks is worse than no column at all.
 */
export interface OwnedIndex {
  /** Full detail, or undefined when not one source knows this key. */
  get(key: string): OwnedEntry | undefined;
  /** The number to display, or undefined when unknown. Never 0 by default. */
  count(key: string): number | undefined;
  /** The automatic total alone, ignoring any override. Undefined when no source spoke. */
  auto(key: string): number | undefined;
  /** False when nothing at all is known, so callers can drop the whole feature. */
  has: boolean;
  /** Which sources contributed anywhere, for a legend or a footnote. */
  sources: OwnedSource[];
  entries(): OwnedEntry[];
  keys(): string[];
}
