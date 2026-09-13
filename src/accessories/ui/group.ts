import { matchesQuery } from "./display";
import type { AccessoryView, SourceCategory } from "./types";
import type { AccessoryGroup } from "..";
import { isNormalAccessory } from "../catalogue";
import {
  ACQUISITION_ORDER,
  type AccessoryAcquisitionCategory,
} from "../acquisition";

export { ACQUISITION_LABEL, ACQUISITION_ORDER } from "../acquisition";
export type { AccessoryAcquisitionCategory } from "../acquisition";

/**
 * What the page is currently showing, and why.
 *
 * Kept pure and out of the component so the honesty rules can be tested without
 * mounting anything. The rules are the whole point of this file; the rendering
 * is the easy part.
 */

export interface AccessoryFilter {
  /** Already trimmed and lowercased by the caller. */
  query: string;
  /** Empty means no source filter at all, not "no sources". */
  sources: readonly SourceCategory[];
  /** Empty means no activity filter at all, not "no activities". */
  groups: readonly AccessoryGroup[];
  /**
   * Whether entries a higher rung of the same chain has already replaced are
   * shown. DEFAULT FALSE: they are collapsed away unless asked for.
   *
   * This is the default because of what the alternative said. An accessory you
   * upgraded is not an accessory you are missing, so listing it alongside the
   * things you actually lack makes the count wrong and the page misleading, and
   * it did exactly that: owning the Seal of the Family still showed Crooked
   * Artifact as Missing. Hiding a rung you have already consumed is the honest
   * default, and the toggle is there for anyone who wants the full ladder.
   */
  showCovered: boolean;
}

export const NO_FILTER: AccessoryFilter = { query: "", sources: [], groups: [], showCovered: false };

/**
 * True when the filter is doing nothing, so the UI can hide its own reset
 * control. Note the polarity: hiding covered rungs is now the resting state, so
 * it is `showCovered` being TRUE that counts as an active filter.
 */
export function filterIsIdle(filter: AccessoryFilter): boolean {
  return (
    filter.query === "" && filter.sources.length === 0 && filter.groups.length === 0 && !filter.showCovered
  );
}

export function filterEntries(
  entries: readonly AccessoryView[],
  filter: AccessoryFilter
): AccessoryView[] {
  const sources = filter.sources;

  /*
   * For the folded carve-out below: a folded rung needs to ask whether its
   * next-step tile already answers the query, and it only knows that tile by
   * id. Built once per filter pass rather than searched per entry.
   */
  const byId = new Map(entries.map((e) => [e.id, e] as const));

  return entries.filter((entry) => {
    if (!filter.showCovered) {
      if (entry.coveredByFamily) return false;
      /*
       * A folded rung hides behind its line's next step for the same reason a
       * covered rung hides behind an owned one: it is not the thing to go and
       * do today. One carve-out, and it is deliberate: a search that singles
       * the rung out still finds it, because somebody typing "Seal of the
       * Family" is asking about that rung, and answering with nothing while
       * the toggle sits unchecked would make the page look like it lost the
       * item.
       *
       * "Singles out" is the operative phrase. The rung stays folded whenever
       * the query ALSO matches its next-step tile, because that tile is
       * already on screen answering for the line; without that condition a
       * family-wide query like "campfire" would unfold all twenty-nine
       * Campfire Badges at once, which is the exact wall of rungs the fold
       * exists to prevent.
       */
      if (entry.foldedBehind !== null) {
        if (filter.query === "") return false;
        if (!matchesQuery(entry, filter.query)) return false;
        const nextStep = byId.get(entry.foldedBehind);
        if (nextStep && matchesQuery(nextStep, filter.query)) return false;
      }
    }
    if (sources.length > 0 && !sources.includes(entry.source)) return false;
    if (filter.groups.length > 0 && !filter.groups.includes(entry.group)) return false;
    return matchesQuery(entry, filter.query);
  });
}

/**
 * How the page is laid out, which depends on whether we could read a bag.
 *
 * THIS IS THE HONESTY RULE, NOT A LAYOUT PREFERENCE.
 *
 * `status` on an entry is a claim about the player. When `ownedKnown` is false
 * we could not read the accessory bag, so every one of those claims is
 * unfounded, and sorting the catalogue into Missing / Owned would state a
 * result we did not compute. "We could not look" and "you have none" are
 * different answers, and rendering the first as the second is exactly the lie
 * this codebase refuses everywhere else.
 *
 * So the split simply does not happen. The page falls back to one ungrouped
 * catalogue, which still carries every source chip and every wiki link, and the
 * notice above it explains why there is no split. A visitor with no key gets a
 * complete, useful page; what they do not get is a fabricated verdict.
 */
export type Grouped =
  | { mode: "catalogue"; all: AccessoryView[] }
  | {
      mode: "reach";
      groups: { group: AccessoryAcquisitionCategory; entries: AccessoryView[] }[];
      owned: AccessoryView[];
    };

/**
 * Acquisition routes are stronger evidence than a generic progress estimate.
 * An event-only merchant is still an event item, and a Dark Auction purchase
 * is still Dark Auction even when the player already meets every requirement.
 * Everything else is divided into on-demand and gated work.
 */
export function acquisitionGroupOf(entry: AccessoryView): AccessoryAcquisitionCategory {
  return entry.acquisition.category;
}

/**
 * How the page is laid out once a bag has been read.
 *
 * ACQUISITION IS THE PRIMARY GROUPING, AND THAT IS THE POINT
 * ----------------------------------------------------------
 * Parser confidence is not an acquisition route. The page answers with the
 * stable acquisition routes instead: collections, upgrade lines, activities,
 * vendors, auctions, events, and a conservative review queue. Readiness stays
 * a property of the tile, so its concrete profile-specific blocker remains
 * visible without changing the route heading.
 *
 * Owned still collapses to the bottom, unchanged: it is the one group nobody
 * opening this page is asking about.
 */
export function groupForDisplay(entries: readonly AccessoryView[], ownedKnown: boolean): Grouped {
  /*
   * Rift-only accessories belong to the dedicated Rift tab. Transferable
   * Rift-origin items remain here because they work outside the Rift and count
   * towards the same collection. The predicate is shared with the snapshot's
   * figures so a section and its number cannot disagree.
   */
  const normal = entries.filter(isNormalAccessory);

  if (!ownedKnown) {
    return { mode: "catalogue", all: normal };
  }

  const owned: AccessoryView[] = [];
  const byGroup = new Map<AccessoryAcquisitionCategory, AccessoryView[]>();
  for (const group of ACQUISITION_ORDER) byGroup.set(group, []);

  for (const entry of normal) {
    if (entry.status === "owned") owned.push(entry);
    else byGroup.get(acquisitionGroupOf(entry))!.push(entry);
  }

  // Empty groups are dropped rather than rendered as empty headings.
  const groups = ACQUISITION_ORDER.map((group) => ({ group, entries: byGroup.get(group)! })).filter(
    (section) => section.entries.length > 0
  );

  return { mode: "reach", groups, owned };
}

/** Total across whichever shape came back, for "nothing matches" decisions. */
export function groupedTotal(grouped: Grouped): number {
  return grouped.mode === "catalogue"
    ? grouped.all.length
    : grouped.groups.reduce((n, section) => n + section.entries.length, 0) + grouped.owned.length;
}

/** Toggle one activity in the multi-select group filter. Same rule as sources. */
export function toggleGroup(
  current: readonly AccessoryGroup[],
  group: AccessoryGroup
): AccessoryGroup[] {
  return current.includes(group) ? current.filter((g) => g !== group) : [...current, group];
}

/**
 * Toggle one category in a multi-select source filter.
 *
 * Pure, because the alternative is a `setState` callback doing array surgery
 * inline, which is where off-by-one selection bugs live.
 */
export function toggleSource(
  selected: readonly SourceCategory[],
  source: SourceCategory
): SourceCategory[] {
  return selected.includes(source)
    ? selected.filter((s) => s !== source)
    : [...selected, source];
}
