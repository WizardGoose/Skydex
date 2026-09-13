import React, { useState } from "react";
import { ChevronRight } from "lucide-react";
import { NUM, PANEL, SectionHead } from "../../ui/kit";
import { AccessoryTile } from "./AccessoryTile";
import type { ActionablePath } from "./sourceMeta";
import type { AccessoryView } from "./types";

/**
 * The grid itself: the chest-grid language, not a card layout.
 *
 * Same construction as `SlotWrap` in src/ui/slotGrid.tsx (fixed-size square
 * cells, as many columns as the panel is wide), sized a notch up from its
 * 2.75rem because an accessory tile carries a corner chip and a lock glyph
 * that a stock slot does not. No padding cells: a triage section has no
 * capacity, so an empty cell would be an invented fact.
 */
const TileGrid: React.FC<{
  entries: readonly AccessoryView[];
  actionable?: ReadonlyMap<string, ActionablePath>;
  recombed?: ReadonlySet<string>;
  markTransferable?: boolean;
}> = ({ entries, actionable, recombed, markTransferable }) => (
  // 3.25rem cells around the 32px sprite step, the slot-scale halving of the
  // 64px wiki thumbs; between-step sizes put the pixel art through a
  // non-integer resample and it smears.
  <div className="grid grid-cols-[repeat(auto-fill,minmax(3.25rem,1fr))] gap-1 p-2">
    {entries.map((entry) => (
      <AccessoryTile
        key={entry.id}
        entry={entry}
        actionable={actionable?.get(entry.id) ?? null}
        recombed={recombed?.has(entry.id) ?? false}
        markTransferable={markTransferable}
      />
    ))}
  </div>
);

/**
 * One status band.
 *
 * Every section uses the same disclosure. `collapsed` only chooses the initial
 * state, normally closed for Owned because the page exists to show what is
 * still missing. A mixture of fixed panels and collapsible panels made the
 * page's interaction grammar unpredictable.
 *
 * An empty band still renders, with `empty` explaining why it is empty. A
 * section that silently disappears when it has nothing in it makes "you are not
 * missing anything" indistinguishable from "we never checked".
 */
export const AccessorySection: React.FC<{
  title: string;
  entries: readonly AccessoryView[];
  /** Shown in place of the grid when there is nothing here. */
  empty: React.ReactNode;
  /** Sits next to the count in the heading. One short line at most. */
  collapsed?: boolean;
  /**
   * id -> which door is open on that tile right now. Computed once by the
   * page (clock plus shop index) and passed down; a section never computes it
   * because a section has neither.
   */
  actionable?: ReadonlyMap<string, ActionablePath>;
  /** Ids whose owned copy is recombobulated; their tiles wear the bumped tier. */
  recombed?: ReadonlySet<string>;
  /** Rift sections only: mark rift-transferable tiles, which stand in both areas. */
  markTransferable?: boolean;
}> = ({ title, entries, empty, collapsed = false, actionable, recombed, markTransferable }) => {
  const [expanded, setExpanded] = useState(!collapsed);
  const count = (
    <span className="flex items-center gap-2">
      <span className={`text-[11px] ${NUM} text-slate-300`}>{entries.length.toLocaleString()}</span>
    </span>
  );

  const body =
    entries.length === 0 ? (
      empty
    ) : (
      <TileGrid entries={entries} actionable={actionable} recombed={recombed} markTransferable={markTransferable} />
    );

  return (
    <details
      className={`group ${PANEL}`}
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary className="cursor-pointer list-none">
        <SectionHead
          title={title}
          right={
            <span className="flex items-center gap-2">
              {count}
              <ChevronRight
                className="h-3 w-3 text-slate-500 transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none"
                aria-hidden
              />
            </span>
          }
        />
      </summary>
      {body}
    </details>
  );
};
