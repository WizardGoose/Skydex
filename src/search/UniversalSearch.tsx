import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Calculator,
  ExternalLink,
  Grid3x3,
  Route,
  Search,
  Sprout,
  Boxes,
  Layers,
  ListTree,
  Package,
  Gauge,
} from "lucide-react";
import { FOCUS, LABEL } from "../ui/kit";
import { ItemIcon } from "../ui/ItemIcon";
import { usePinnedTarget } from "./plannerPin";
import { rarityClass } from "./rarity";
import { clearRecent, pushRecent, toEntry, useRecentSearches } from "./recentSearches";
import { MAX_ROWS, searchSite } from "./searchIndex";
import type { Destination, GlyphKey, SearchEntry } from "./types";

/**
 * The one search box.
 *
 * It is a combobox in the ARIA sense: focus never leaves the input, the list is
 * a `listbox` beside it, and the highlighted row is named by
 * `aria-activedescendant`. That is what lets arrow keys move a selection while
 * the person carries on typing, and it is why the rows are `tabIndex={-1}` and
 * not in the tab order.
 *
 * Rows are real links, so middle-click and ctrl-click open them the way every
 * other link on the internet does. `onMouseDown` is prevented on each one
 * because the browser's default there is to blur the input, which would close
 * the list out from under the click that is landing on it.
 *
 * The debounce is 110ms. Long enough that a fast typist is not searching a
 * 2,400-entry index on every keystroke, short enough that the list feels
 * attached to the keyboard rather than trailing it.
 *
 * WHAT THE PANEL SHOWS WHEN THE FIELD IS EMPTY
 * --------------------------------------------
 * The gate used to be `focused && typing`, which meant an empty field was a
 * dead field: the one moment you have nothing to type is the one moment the box
 * had nothing to offer. It is now `focused && (typing || suggesting)`, and the
 * two branches are kept genuinely separate rather than merged into one list of
 * "rows". They answer different questions - "what matches this" versus "where
 * were you" - and the second is not a search with an empty query, so it does
 * not run the ranker, does not reserve a wiki row and does not offer overflow
 * into Items. `suggesting` is false when there is neither a grind target nor a
 * history, so a first-time visitor's empty field behaves exactly as it did.
 *
 * Both branches feed one `options` array, and everything about the keyboard
 * (arrows, Home, End, Enter, `aria-activedescendant`) reads from that array
 * alone. Adding a second kind of list therefore added no second keyboard path,
 * which is what stops the two from drifting apart later.
 */

const BADGE: Record<Destination, string> = {
  items: "Items",
  greenhouse: "Greenhouse",
  shards: "Shards",
  wiki: "Wiki",
  site: "Site",
};

/** Page rows draw a glyph rather than chasing a wiki image that does not exist. */
const GLYPHS: Record<GlyphKey, React.ComponentType<{ className?: string }>> = {
  dashboard: Gauge,
  planner: Route,
  solver: Sprout,
  designer: Grid3x3,
  items: Package,
  island: Boxes,
  fusion: Calculator,
  recipes: Layers,
  owned: Package,
  lines: ListTree,
  guide: BookOpen,
};

const DEBOUNCE_MS = 110;

/**
 * The hint on the pinned row. A module constant rather than an inline literal
 * because it is a `useMemo` dependency inside `usePinnedTarget`, and a fresh
 * string every render would rebuild the row every render.
 */
const PIN_HINT = "Target";

/** One thing Enter can land on. A row to open, or an action to run in place. */
interface Option {
  key: string;
  /** Present for rows that are things. Recorded in the history when opened. */
  entry?: SearchEntry;
  href?: string;
  external?: boolean;
  /** Present instead of `href` for affordances that do not navigate. */
  action?: () => void;
}

export interface UniversalSearchProps {
  index: SearchEntry[];
  /** True while a source is still arriving. Drives the skeleton and the mark. */
  indexLoading: boolean;
  placeholder: string;
  /** Told whenever the field gains or loses focus, so the mark can perk up. */
  onFocusChange?: (focused: boolean) => void;
  /** Told whenever a search is genuinely in flight, so the mark can think. */
  onBusyChange?: (busy: boolean) => void;
  className?: string;
}

export const UniversalSearch: React.FC<UniversalSearchProps> = ({
  index,
  indexLoading,
  placeholder,
  onFocusChange,
  onBusyChange,
  className = "",
}) => {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [settled, setSettled] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  // ---- debounce ----------------------------------------------------------
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(query), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  const outcome = useMemo(() => searchSite(index, settled, MAX_ROWS), [index, settled]);

  const typing = query.trim().length > 0;
  const catchingUp = query !== settled;

  /*
   * "In flight" is the honest version, not a fake spinner: either the index is
   * still arriving from the network, or the keystroke has not been searched
   * yet. Both resolve on their own, which is what the mark's thinking cadence
   * needs in order to stop.
   */
  const busy = typing && (indexLoading || catchingUp);

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange]);
  useEffect(() => onFocusChange?.(focused), [focused, onFocusChange]);

  // ---- the empty-field suggestions ---------------------------------------

  /*
   * Re-read on focus rather than subscribed. The pin comes from the Planner's
   * own store, which this module reads and never writes, and it only has to be
   * right at the moment the panel opens.
   */
  const pin = usePinnedTarget(index, focused, PIN_HINT);
  const history = useRecentSearches();

  /**
   * The history, minus whatever is already pinned above it.
   *
   * Opening your target from the pin records it like any other row, so without
   * this filter the same thing would be shown twice, once as the goal and once
   * as a memory of looking at the goal.
   */
  const recentRows = useMemo(
    () => history.filter((r) => r.key !== pin?.key).map((r) => toEntry(r)),
    [history, pin]
  );

  const suggesting = !typing && (pin !== null || recentRows.length > 0);

  /** Rows plus, when there is overflow, the "more in Items" affordance. */
  const options = useMemo<Option[]>(() => {
    if (typing) {
      const list: Option[] = outcome.rows.map((r) => ({ key: r.key, entry: r, href: r.href, external: r.external }));
      if (outcome.moreInItems > 0) list.push({ key: "more", href: outcome.moreHref });
      return list;
    }

    const list: Option[] = [];
    if (pin) list.push({ key: pin.key, entry: pin, href: pin.href, external: pin.external });
    for (const row of recentRows) list.push({ key: row.key, entry: row, href: row.href, external: row.external });
    /* Clear is the last option rather than a button in a header, so it is the
       same kind of thing as "more in Items": arrow to it, press Enter. That
       also keeps every focusable element in the panel inside the listbox. */
    if (recentRows.length > 0) list.push({ key: "clear", action: clearRecent });
    return list;
  }, [typing, outcome, pin, recentRows]);

  useEffect(() => setActive(0), [settled]);

  /*
   * Clamped at read rather than corrected by an effect. Clearing the history
   * shortens the list under a highlight that is already past the end, and a
   * render that reads a stale index would name an option that is no longer
   * there in `aria-activedescendant`.
   */
  const activeIndex = options.length === 0 ? 0 : Math.min(active, options.length - 1);

  const open = focused && (typing || suggesting);
  const showSkeleton = open && typing && indexLoading && outcome.rows.length <= 1;

  const go = useCallback(
    (i: number) => {
      const opt = options[i];
      if (!opt) return;

      /* An affordance, not a destination. It runs where it stands and the field
         keeps focus, so clearing the history leaves you still typing. */
      if (opt.action) {
        opt.action();
        return;
      }
      if (!opt.href) return;

      if (opt.entry) pushRecent(opt.entry);
      if (opt.external) window.open(opt.href, "_blank", "noopener,noreferrer");
      else navigate(opt.href);
      inputRef.current?.blur();
    },
    [options, navigate]
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      if (open) inputRef.current?.blur();
      else setQuery("");
      return;
    }
    if (!open || options.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(activeIndex);
    }
  };

  const listId = "ws-search-list";
  const activeId = options[activeIndex] ? `ws-opt-${options[activeIndex].key}` : undefined;

  /** Where the pin sits, and where the history starts, in one shared list. */
  const pinIndex = pin ? 0 : -1;
  const recentStart = pin ? 1 : 0;
  const clearIndex = options.length - 1;

  return (
    <div className={`relative ${className}`}>
      {/* A pill is one of the few genuinely round things in this project, which
          is the standing exception to the rounded-md rule. It is also the shape
          the reference mark sits above, so it is not a free choice. */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open ? activeId : undefined}
          aria-autocomplete="list"
          aria-label="Search items, mutations, shards and pages"
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          className={`ws-search-pill w-full rounded-full border border-white/12 bg-slate-900/55 backdrop-blur-[18px] backdrop-saturate-[1.15] py-3.5 pl-11 pr-4 text-[15px] text-slate-100 placeholder:text-slate-300 hover:border-white/22 focus:border-emerald-500/70 ${FOCUS}`}
        />
      </div>

      {open && (
        <div
          className="ws-panel absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-md border border-white/10 bg-slate-900/95"
          /* Not a scrolling container and not filtered, so it costs one paint
             when it appears and nothing after that. */
        >
          {showSkeleton ? (
            <ul className="p-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex items-center gap-3 rounded-sm px-2.5 py-2">
                  <span className="h-[22px] w-[22px] shrink-0 rounded-sm bg-slate-800" />
                  <span className="h-3 flex-1 rounded-sm bg-slate-800" style={{ maxWidth: `${58 - i * 12}%` }} />
                  <span className="h-3.5 w-16 shrink-0 rounded-sm bg-slate-800/70" />
                </li>
              ))}
            </ul>
          ) : typing ? (
            <>
              {outcome.rows.length === 1 && (
                <p className="border-b border-slate-800 px-3.5 py-2.5 text-[12px] text-slate-400">
                  Nothing on the site matches that. The wiki might.
                </p>
              )}

              <ul id={listId} role="listbox" aria-label="Search results" className="p-1.5">
                {outcome.rows.map((row, i) => (
                  <Row
                    key={row.key}
                    row={row}
                    active={i === activeIndex}
                    onHover={() => setActive(i)}
                    onSelect={() => pushRecent(row)}
                  />
                ))}

                {outcome.moreInItems > 0 && (
                  <li>
                    <Link
                      id="ws-opt-more"
                      role="option"
                      aria-selected={activeIndex === options.length - 1}
                      tabIndex={-1}
                      to={outcome.moreHref}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(options.length - 1)}
                      className={`flex items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-[12px] text-slate-400 ${
                        activeIndex === options.length - 1 ? "bg-slate-800/70 text-slate-200" : ""
                      }`}
                    >
                      <span>{outcome.moreInItems} more in Items</span>
                      {/* The key hint belongs to the highlighted row and to no
                          other, otherwise it is a label rather than an
                          instruction. */}
                      {activeIndex === options.length - 1 && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400">Enter</span>
                      )}
                    </Link>
                  </li>
                )}
              </ul>
            </>
          ) : (
            /*
             * The empty-field panel. Same rows, same keyboard, different
             * question. Group labels are `role="presentation"` list items with
             * no interactive content, so the listbox still owns nothing but
             * options and the labels stay out of the a11y tree rather than
             * being announced as choices you could make.
             */
            <ul id={listId} role="listbox" aria-label="Recent searches" className="p-1.5">
              {pin && (
                <React.Fragment key="pin">
                  <li role="presentation" className={`px-2.5 pt-1 pb-1 ${LABEL}`}>
                    Grind target
                  </li>
                  <Row
                    row={pin}
                    active={activeIndex === pinIndex}
                    onHover={() => setActive(pinIndex)}
                    onSelect={() => pushRecent(pin)}
                  />
                </React.Fragment>
              )}

              {recentRows.length > 0 && (
                <li role="presentation" className={`px-2.5 pt-2 pb-1 ${LABEL}`}>
                  Recent
                </li>
              )}

              {recentRows.map((row, i) => (
                <Row
                  key={row.key}
                  row={row}
                  active={activeIndex === recentStart + i}
                  onHover={() => setActive(recentStart + i)}
                  onSelect={() => pushRecent(row)}
                />
              ))}

              {recentRows.length > 0 && (
                <li>
                  <button
                    id="ws-opt-clear"
                    type="button"
                    role="option"
                    aria-selected={activeIndex === clearIndex}
                    tabIndex={-1}
                    /* Same as every row: the browser's default here is to blur
                       the field, which would close the panel out from under the
                       click that is landing on it. */
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(clearIndex)}
                    onClick={clearRecent}
                    className={`flex w-full cursor-pointer items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-left text-[12px] text-slate-400 ${
                      activeIndex === clearIndex ? "bg-slate-800/70 text-slate-200" : ""
                    }`}
                  >
                    <span>Clear recent</span>
                    {activeIndex === clearIndex && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-slate-400">Enter</span>
                    )}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * One result.
 *
 * The name carries its rarity colour because rarity is game data: the player
 * already knows gold is legendary, and throwing that away to make the list
 * match the site's accent would be discarding information they have. The
 * classes come from a map of complete literal strings, never a template, for
 * the reason set out in `rarity.ts`.
 */
const Row: React.FC<{ row: SearchEntry; active: boolean; onHover: () => void; onSelect?: () => void }> = ({
  row,
  active,
  onHover,
  onSelect,
}) => {
  const Glyph = row.glyph ? GLYPHS[row.glyph] : null;

  const body = (
    <>
      {Glyph ? (
        <span className="ws-glyph flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm bg-slate-800 text-slate-400">
          <Glyph className="h-3.5 w-3.5" />
        </span>
      ) : (
        <ItemIcon name={row.iconName} id={row.iconId} src={row.iconSrc} size={22} fallback="blank" />
      )}

      <span className={`min-w-0 flex-1 truncate text-[13px] font-medium ${rarityClass(row.rarity)}`}>{row.name}</span>

      {row.hint && <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline">{row.hint}</span>}

      <span className="flex shrink-0 items-center gap-1 rounded-sm border border-slate-700 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.13em] text-slate-400">
        {BADGE[row.destination]}
        {row.external && <ExternalLink className="h-2.5 w-2.5" aria-hidden />}
      </span>
    </>
  );

  const cls = `flex items-center gap-3 rounded-sm px-2.5 py-2 ${active ? "bg-slate-800/70" : ""}`;
  const shared = {
    id: `ws-opt-${row.key}`,
    role: "option" as const,
    "aria-selected": active,
    tabIndex: -1,
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onMouseEnter: onHover,
    /*
     * The row is a real link, so a click navigates on its own and never passes
     * through `go`. Recording has to hang off the click for that reason, and
     * off `go` for the keyboard: two paths in, one for each way of choosing,
     * and neither can fire the other's.
     */
    onClick: onSelect,
    className: cls,
  };

  return (
    <li>
      {row.external ? (
        <a {...shared} href={row.href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      ) : (
        <Link {...shared} to={row.href}>
          {body}
        </Link>
      )}
    </li>
  );
};

export default UniversalSearch;
