import React, { useMemo, useState } from "react";
import { CircleCheck, Gem, Hourglass, KeyRound, PackageSearch, Search, SearchX } from "lucide-react";
import { SettingsLink } from "../components/layout/SettingsLink";
import {
  useAccessories,
  ATTAINABILITY_HINT,
  ATTAINABILITY_LABEL,
  GROUP_LABEL,
  GROUP_ORDER,
  type AccessoryGroup,
} from "../accessories";
import { useShopStock } from "../items/wikiShops";
import { BTN_QUIET, EmptyState, FOCUS, INPUT, LABEL, NUM, PANEL, RADIUS, Stat } from "../ui/kit";
import { AccessorySection } from "../accessories/ui/AccessorySection";
import { SourceLegend } from "../accessories/ui/SourceTag";
import { actionablePathOf } from "../accessories/ui/actionable";
import type { ActionablePath } from "../accessories/ui/sourceMeta";
import {
  filterEntries,
  filterIsIdle,
  groupForDisplay,
  toggleGroup,
  toggleSource,
  type AccessoryFilter,
} from "../accessories/ui/group";
import type { SourceCategory } from "../accessories/ui/types";

/**
 * What you are missing, and where to get it.
 *
 * SkyCrypt's missing-accessories grid is the reference and the thing this page
 * is trying to beat on one specific axis. That grid tells you an accessory is
 * missing and then stops, so the actual work - finding out whether the thing is
 * crafted, bought, dropped or handed over by a quest - happens somewhere else,
 * on the wiki, in another tab. Here the source is on the tile. That is the
 * whole point of the page and it is why every tile carries a chip even when the
 * answer is "we do not know", which is written as See wiki rather than dressed
 * up as a category.
 *
 * THE HONEST BLANK
 *
 * `ownedKnown` is the field that decides what this page is allowed to claim.
 * False does not mean you own nothing; it means the accessory bag could not be
 * read at all. Splitting a catalogue into Missing and Owned on the strength of
 * that would put a number on the screen that nobody computed, so when it is
 * false the split does not happen: the page becomes one ungrouped catalogue,
 * the counts that depend on a profile go blank rather than to zero, and a
 * notice says which of the two situations you are in. See `group.ts`.
 *
 * A visitor with no key still gets the entire catalogue with every source and
 * every wiki link. None of that depends on knowing who they are, so none of it
 * is gated.
 *
 * A VIEW, NOT A PAGE: Accessories lives as a tab inside the
 * profile page's own tab bar, so
 * this renders the content with no page header of its own - the profile page
 * owns the heading - and the old `/accessories` route redirects here. One
 * component, one copy of the logic, two eras of links.
 */
export const AccessoriesView: React.FC = () => {
  const snapshot = useAccessories();
  /*
   * The NPC shop stock, for the "buy it right now" border. Same store the
   * Items page's "Sold by" panel reads; an unfetched or failed index simply
   * lights no shop borders, which is the honest degradation.
   */
  const shops = useShopStock();

  const [query, setQuery] = useState("");
  const [sources, setSources] = useState<SourceCategory[]>([]);
  /*
   * Collapsed by default. A rung you upgraded away is not a rung you are
   * missing, and listing it as such is what made the page claim Crooked
   * Artifact was missing from a profile holding the Seal of the Family.
   * See `NO_FILTER` in group.ts for the full reasoning.
   */
  const [showCovered, setShowCovered] = useState(false);
  const [groups, setGroups] = useState<AccessoryGroup[]>([]);

  const filter: AccessoryFilter = useMemo(
    () => ({ query: query.trim().toLowerCase(), sources, groups, showCovered }),
    [query, sources, groups, showCovered]
  );
  const idle = filterIsIdle(filter);

  const visible = useMemo(() => filterEntries(snapshot.entries, filter), [snapshot.entries, filter]);
  const grouped = useMemo(
    () => groupForDisplay(visible, snapshot.ownedKnown),
    [visible, snapshot.ownedKnown]
  );

  /*
   * Which tiles are actionable right now, computed once per snapshot rather
   * than per tile. The clock is read here, at the edge, because the calendar
   * module's functions are pure by contract; a render is a perfectly good
   * "now" for a window that is days wide.
   */
  const actionable = useMemo(() => {
    const now = Date.now();
    const map = new Map<string, ActionablePath>();
    for (const entry of snapshot.entries) {
      const path = actionablePathOf(entry, shops.index, now);
      if (path !== null) map.set(entry.id, path);
    }
    return map;
  }, [snapshot.entries, shops.index]);

  /**
   * The covered filter only appears once something is actually hidden behind
   * it. A control that can never change what you see is worse than no control:
   * it implies the page is hiding something. It now guards two kinds of rung,
   * both of the same family shape: ones a higher OWNED rung covers, and
   * missing ones folded behind their line's next step.
   */
  const anyCovered = useMemo(
    () => snapshot.entries.some((e) => e.coveredByFamily || e.foldedBehind !== null),
    [snapshot.entries]
  );

  const clearFilters = () => {
    setQuery("");
    setSources([]);
    setGroups([]);
    setShowCovered(true);
  };

  const { counts, ownedKnown } = snapshot;
  /** Blank, not zero, for anything that needed a profile we could not read. */
  const profileFigure = (n: number) => (ownedKnown ? n.toLocaleString() : "-");

  /**
   * A reach tier's figure, deduped and honest about it.
   *
   * The headline number is next steps, one per upgrade line, because that is
   * how many errands the tier actually holds; "Get now: 286" was true of rungs
   * and useless as a to-do count. Where the two differ the rung total rides
   * along quietly, so neither number is hidden and the line under the row says
   * what the pair means.
   */
  const tierFigure = (tier: "now" | "soon" | "long") => {
    if (!ownedKnown) return "-";
    const next = snapshot.nextStepCounts[tier];
    const rungs = snapshot.reachCounts[tier];
    if (next === rungs) return next.toLocaleString();
    return (
      <>
        {next.toLocaleString()}
        <span className="text-[10px] text-slate-500"> of {rungs.toLocaleString()}</span>
      </>
    );
  };

  const mp = snapshot.magicalPower;

  /**
   * The rift sections' honest tallies (the standing rule: transferables
   * stand in both areas). Each section header already counts its own list;
   * the note says how many of those are transferables standing in both, so
   * the dual listing explains itself at the section level as well as on the
   * tile. Counted off the grouped lists, so the numbers are the lists'.
   */
  const riftNote = (list: readonly { riftTransferable: boolean }[], base: string): string => {
    const transferable = list.filter((e) => e.riftTransferable).length;
    if (transferable === 0) return base;
    return `${base}; ${transferable} rift-transferable, listed here and in their normal sections`;
  };

  /* --- first paint, before anything has arrived -------------------------- */

  if (snapshot.loading && snapshot.entries.length === 0) {
    return (
      <div className="space-y-2.5">
        <div className={PANEL}>
          <EmptyState
            title="Loading the accessory catalogue"
            hint="Fetching the accessory list and working out where each one comes from."
            icon={Hourglass}
          />
        </div>
      </div>
    );
  }

  /* --- the shared reasons a band can be empty ---------------------------- */

  const filteredAway = (
    <EmptyState
      title="Nothing in this section matches your filter"
      hint="Widen the source filter or clear the search to see the rest."
      icon={SearchX}
      action={
        <button type="button" className={BTN_QUIET} onClick={clearFilters}>
          Clear filters
        </button>
      }
    />
  );

  const nothingAtAll = (
    <EmptyState
      title="The catalogue is empty"
      hint="No accessories were loaded, so there is nothing to compare against. This is a data problem on our side, not a statement about your profile."
      icon={PackageSearch}
    />
  );

  return (
    <div className="space-y-2.5">
      {/*
       * A failed fetch is a failure, so it is red, which is the one thing red
       * means here. It sits above the data rather than replacing it: a stale or
       * partial catalogue is still worth reading, and blanking the page would
       * throw away the part that did work.
       */}
      {snapshot.error && (
        <p className="border-l-2 border-red-500/50 pl-2 text-[11px] text-red-400" role="alert">
          Could not load the accessory data ({snapshot.error}).
          {snapshot.entries.length > 0 ? " What is shown below may be incomplete." : ""}
        </p>
      )}

      <div className={`${PANEL} flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-3 py-2`}>
        {/*
         * The header answers the same question the sections do: how much of
         * this is actually reachable. "Missing" (the short form of the first
         * section's "Missing Accessories", kept short so the stat row does
         * not wrap) takes the accent because it is the number somebody opens
         * this page to find. Every profile figure here is NORMAL accessories
         * only; the Rift ones appear solely under their own label, because
         * they have their own band and mixing them back into these numbers
         * would make the header disagree with the sections it summarises.
         */}
        <Stat label="Catalogue" value={counts.total.toLocaleString()} align="left" />
        <Stat label="Missing" value={tierFigure("now")} align="left" accent={ownedKnown} />
        <Stat label="Soon" value={tierFigure("soon")} align="left" />
        <Stat label="Long haul" value={tierFigure("long")} align="left" />
        <Stat label="Locked" value={profileFigure(counts.locked - snapshot.riftCounts.locked)} align="left" />
        <Stat label="Owned" value={profileFigure(counts.owned - snapshot.riftCounts.owned)} align="left" />
        <Stat
          label="Rift missing"
          value={
            ownedKnown
              ? (snapshot.riftCounts.missing + snapshot.riftCounts.locked).toLocaleString()
              : "-"
          }
          align="left"
        />
        <Stat label="Magical power" value={mp ? mp.total.toLocaleString() : "-"} align="left" />
        {!ownedKnown && (
          <span className="text-[10px] leading-snug text-slate-500">
            Seven of these need a profile we could not read, so they are blank rather than zero.
          </span>
        )}
      </div>

      {/*
       * The figures above that need a sentence, each owning up in one line.
       *
       * The pair figures ("74 of 286") are next steps against rungs: one tile
       * per upgrade line, with the higher rungs folded behind it. The MP
       * figure now models every rule the wiki's Accessory Power article
       * states (recombobulated rarities, the Hegemony double, a consumed Rift
       * Prism, the Abicase contact bonus), each detected from the profile, so
       * the note only speaks up for whatever genuinely remains unmodelled: an
       * Abicase whose contact count the profile did not state, or a rarity
       * Hypixel omitted.
       */}
      {ownedKnown && (snapshot.foldedCount > 0 || mp !== null) && (
        <p className="px-1 text-[10px] leading-snug text-slate-500">
          {snapshot.foldedCount > 0 && (
            <>
              Tier counts are next steps of rungs: one tile per upgrade line, with{" "}
              <span className={NUM}>{snapshot.foldedCount.toLocaleString()}</span> higher rungs folded into
              the rung below them. The rungs toggle shows every one.{" "}
            </>
          )}
          {mp !== null && (
            <>
              Magical power counts your highest rung per line at its recombobulated rarity
              {mp.hegemonyBonus > 0 && <>, doubles the Hegemony Artifact</>}
              {mp.riftPrism > 0 && <>, includes your consumed Rift Prism</>}
              {mp.abicaseBonus > 0 && <>, prices your Abicase by its contacts</>}
              {mp.skipped > 0 && (
                <>
                  , and leaves <span className={NUM}>{mp.skipped.toLocaleString()}</span> Abicase out
                  because your contact count could not be read
                </>
              )}
              {mp.uncatalogued > 0 && (
                <>
                  , and prices <span className={NUM}>{mp.uncatalogued.toLocaleString()}</span> bag{" "}
                  {mp.uncatalogued === 1 ? "item" : "items"} the catalogue lacks at the rarity the item
                  itself states
                </>
              )}
              {mp.unknownTier > 0 && (
                <>
                  , with <span className={NUM}>{mp.unknownTier.toLocaleString()}</span> of unstated rarity
                  counted as nothing
                </>
              )}
              .
            </>
          )}
        </p>
      )}

      {/*
       * The keyless state. `EmptyState` is the primitive for it even though the
       * page below is full: what is empty is our knowledge of the player, and
       * this says so in one place instead of qualifying every tile.
       */}
      {!ownedKnown && !snapshot.loading && (
        <div className={PANEL}>
          <EmptyState
            title="No accessory bag could be read"
            hint="That is not the same as owning none, so nothing below is marked missing or owned. Everything else on this page works without a profile: the full catalogue is here, with where each accessory comes from."
            icon={KeyRound}
            action={
              <SettingsLink section="hypixel" className={BTN_QUIET}>
                <KeyRound className="h-3 w-3" aria-hidden />
                Set up the Hypixel profile connection
              </SettingsLink>
            }
          />
        </div>
      )}

      {/*
       * Key and filter in one control. The legend has to exist regardless, a
       * colour code nobody can decode being decoration, and the question it
       * raises is "show me only those", so it answers that too.
       */}
      <div className={`${PANEL} divide-y divide-slate-800`}>
        <SourceLegend
          counts={snapshot.sourceCounts}
          selected={sources}
          onToggle={(source) => setSources((prev) => toggleSource(prev, source))}
        />

        {/*
         * Activity filter.
         *
         * Sits under the source key rather than above it because source is the
         * headline of this page and activity is the narrowing question you ask
         * second ("show me only the farming ones"). Groups with nothing in them
         * are not rendered: an activity this game has no accessories for is not
         * a filter worth offering.
         */}
        <div className="flex flex-wrap items-center gap-1.5 px-2.5 py-2">
          <span className={`${LABEL} mr-0.5`}>Activity</span>
          {GROUP_ORDER.filter((g) => (snapshot.groupCounts[g] ?? 0) > 0).map((g) => {
            const active = groups.includes(g);
            return (
              <button
                key={g}
                type="button"
                aria-pressed={active}
                onClick={() => setGroups((prev) => toggleGroup(prev, g))}
                className={
                  `inline-flex cursor-pointer items-center gap-1 border px-1.5 py-px text-[10px] leading-[1.5] ${RADIUS.chip} ${FOCUS} ` +
                  (active
                    ? "border-emerald-500/45 bg-emerald-500/15 text-emerald-200"
                    : "border-slate-700 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:text-slate-100")
                }
              >
                {GROUP_LABEL[g]}
                <span className={`${NUM} text-slate-400`}>{snapshot.groupCounts[g]}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-2.5 py-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-500"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search accessories by name or family"
              aria-label="Search accessories by name or family"
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT} w-full pl-6`}
            />
          </div>

          {anyCovered && (
            <label
              className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400"
              title="Two kinds of rung hide by default: ones a higher tier you own already covers, and missing rungs folded behind their line's next step. This shows every rung of every line."
            >
              <input
                type="checkbox"
                checked={showCovered}
                onChange={(e) => setShowCovered(e.target.checked)}
                className="cursor-pointer"
              />
              Show every rung (covered and folded)
            </label>
          )}

          {!idle && (
            <span className="flex items-center gap-2">
              <span className={`text-[10px] ${NUM} text-slate-400`}>
                {visible.length.toLocaleString()} of {snapshot.entries.length.toLocaleString()}
              </span>
              <button type="button" className={BTN_QUIET} onClick={clearFilters}>
                Clear
              </button>
            </span>
          )}
        </div>
      </div>

      {/*
       * Sections answer "how far away is this", not "what state is this in".
       *
       * That is the player's question: what can I get right now, what
       * can I grind towards, what is a long haul. A locked accessory is no
       * longer a section of its own; it sits in the tier its requirement gap
       * puts it in and carries the blocking requirement on its own tile, which
       * is where the answer is actually useful.
       */}
      {grouped.mode === "reach" ? (
        <>
          {grouped.tiers.map(({ tier, entries }) => (
            <AccessorySection
              key={tier}
              title={ATTAINABILITY_LABEL[tier]}
              entries={entries}
              note={ATTAINABILITY_HINT[tier]}
              empty={filteredAway}
              actionable={actionable}
              recombed={snapshot.recombobulated}
            />
          ))}

          {grouped.tiers.length === 0 && (
            <EmptyState
              title={idle ? "You are not missing any of these" : "Nothing matches those filters"}
              hint={
                idle
                  ? `All ${counts.owned.toLocaleString()} owned accessories are in the collapsed section below. The catalogue only covers what we could index, so this is not a claim that nothing else exists.`
                  : undefined
              }
              icon={idle ? CircleCheck : SearchX}
            />
          )}

          <AccessorySection
            title="Owned"
            entries={grouped.owned}
            note="already in your bag"
            collapsed
            recombed={snapshot.recombobulated}
            empty={
              idle ? (
                <EmptyState
                  title="Your accessory bag is empty"
                  hint="We read it and found nothing in it, which is different from not being able to read it."
                  icon={Gem}
                />
              ) : (
                filteredAway
              )
            }
          />

          {/*
           * The Rift band, last because it is a different dimension in the
           * literal sense: these work only inside the Rift, grant no Magical
           * Power out here, and are picked up in there. The split is
           * missing/owned rather than the reach tiers, because "how far away
           * is it" is measured in overworld errands and these are not one.
           */}
          <AccessorySection
            title="Rift - missing"
            entries={grouped.riftMissing}
            note={riftNote(grouped.riftMissing, "the Rift area; non-transferable pieces work only inside the Rift")}
            markTransferable
            empty={
              idle ? (
                <EmptyState
                  title="Every Rift accessory we track is in your bag"
                  hint="Read from your overworld accessory bag. Pieces stored inside the Rift itself are not in the API's bag data, so they cannot be seen from here."
                  icon={CircleCheck}
                />
              ) : (
                filteredAway
              )
            }
            actionable={actionable}
            recombed={snapshot.recombobulated}
          />
          <AccessorySection
            title="Rift - owned"
            entries={grouped.riftOwned}
            note={riftNote(grouped.riftOwned, "in your overworld bag")}
            collapsed
            markTransferable
            recombed={snapshot.recombobulated}
            empty={
              idle ? (
                <EmptyState
                  title="No Rift accessory is in your overworld bag"
                  hint="That is where this page can read, not a claim about what you hold inside the Rift: the API's bag data does not include the Rift's own inventory."
                  icon={Gem}
                />
              ) : (
                filteredAway
              )
            }
          />
        </>
      ) : (
        <>
          <AccessorySection
            title="Every accessory"
            entries={grouped.all}
            note="no profile, so nothing is marked owned"
            empty={snapshot.entries.length === 0 ? nothingAtAll : filteredAway}
            actionable={actionable}
          />
          <AccessorySection
            title="Rift"
            entries={grouped.rift}
            note={riftNote(grouped.rift, "the Rift area; non-transferable pieces work only inside the Rift")}
            markTransferable
            empty={snapshot.entries.length === 0 ? nothingAtAll : filteredAway}
            actionable={actionable}
          />
        </>
      )}

      <p className={`${LABEL} px-1 normal-case tracking-normal text-slate-500`}>
        Sources come from our own item data where it is certain. Anything we could not classify is marked
        <span className={`mx-1 ${RADIUS.chip} border border-slate-700 bg-slate-800/70 px-1 py-px font-mono text-slate-300`}>
          See wiki
        </span>
        rather than guessed at.
      </p>
    </div>
  );
};

export default AccessoriesView;
