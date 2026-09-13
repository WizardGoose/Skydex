import React from "react";
import { ItemTooltip } from "./ItemTooltip";
import { SlotIcon } from "../island/SlotIcon";
import type { ItemExtra } from "../island/types";
import { FOCUS, NUM, rarityTileClass, recombDisplayTier } from "./kit";

/**
 * The slot grid: items drawn the way the game draws a container.
 *
 * This is the chest-grid language, after
 * SkyCrypt's chest display: square slots, the icon centred, the count in
 * the corner, a hover card with the real numbers. It grew up inline on the
 * Island page; it lives here now so mutations, stock panels and anything else
 * that is a set of items can wear the same grid instead of a new one
 * (the standing rule: reuse before new). Nothing here imitates Mojang's slot
 * texture and no bundled art of theirs is involved - obsidian cells in our
 * own materials, on the plot-cell radius.
 *
 * Two shapes, one cell:
 *
 *   `TrueGrid`  the container as it really is, gaps included, nine wide.
 *               Only possible when slot positions were captured.
 *   `SlotGrid`  packed, nine wide, padded to the container's real capacity.
 *   `SlotWrap`  packed, as many columns as the panel is wide. For item sets
 *               that are not a container - owned mutations, search results -
 *               where nine-wide cells would balloon to the panel width.
 */

export interface SlotItem {
  id: string;
  name: string;
  count: number;
  extra?: ItemExtra;
  /** A preferred icon source, e.g. bundled crop art. Tried before the wiki. */
  src?: string;
  /**
   * The name the ICON should resolve under, when it is not the display name.
   *
   * The icon ladder derives wiki files from names, and the resource-name
   * fallback deliberately forgets names `prettify(id)` can already reach - a
   * sound reduction that breaks for exactly one class of caller: lists whose
   * display name is not the item's name at all. The networth categories are
   * that caller: an enchanted book is displayed as its enchant ("Big Brain")
   * and a pet as its level line, so their tiles exhausted every rung and went
   * blank (a whole wall of missing-texture tiles). The
   * tooltip keeps `name`; only the picture resolves under this.
   */
  iconName?: string;
  /**
   * A unit price the item brings with it, overriding `context.priceOf`.
   *
   * Added for the networth categories, where two stacks can share an id and
   * carry genuinely different per-unit values (two Hyperions with different
   * enchantments), so a lookup by id would put one stack's number on the
   * other's tooltip. `undefined` means "ask the context", which is what every
   * pre-existing caller does; `null` means "this item deliberately has no
   * price", which suppresses the price rows the same way the context's null
   * does.
   */
  unitPrice?: number | null;
}

/** What a slot needs from the page to build a full tooltip. Passed down rather than hooked per slot. */
export interface SlotContext {
  /** Rarity tier for a Hypixel id, when the item index knows it. */
  tierOf: (id: string) => string | null;
  /** Unit bazaar price, or null when unpriced or on Ironman. */
  priceOf: (id: string) => number | null;
  /** Where this section came from, already phrased. */
  provenance: string | null;
  /**
   * What the tooltip calls the unit price. Defaults to the bazaar wording when
   * absent, because that is what every price on this site was until the
   * networth categories started handing slots their own valuation figures,
   * which are a different claim and must not be labelled as bazaar quotes.
   */
  priceLabel?: string;
}

/** A context for surfaces with no rarity, price or provenance to offer. */
export const BARE_CONTEXT: SlotContext = {
  tierOf: () => null,
  priceOf: () => null,
  provenance: null,
};

export const matches = (item: { id: string; name: string }, needle: string): boolean =>
  !needle || item.name.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle);

/**
 * Stack counts, abbreviated to fit a slot corner.
 *
 * The game only ever draws up to 64 here, but these are totals aggregated
 * across every stack of an id in the container, so six figures is routine.
 * "180k" in the corner and the exact number in the hover card is the right
 * split: the grid is for scanning, the tooltip is for reading.
 */
export const shortCount = (n: number): string => {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return `${m < 10 ? m.toFixed(1) : Math.round(m)}M`;
};

/** Nine wide, so a large chest lands as 9x6 exactly like the screen it came from. */
export const SLOT_COLUMNS = 9;

/**
 * One slot size, everywhere. (On the Island page
 * the site had chest cards drawing small cells while the full-width sections
 * drew the same nine-wide grid across the whole panel, which blew each cell up
 * to a hundred-plus pixels of mostly empty tile - a jungle gym of different
 * displays. No grid is allowed to do that any more.)
 *
 * This is the cap that enforces it: nine SlotWrap-sized cells plus the grid's
 * own gaps and gutters. A container grid living in a narrow card is already
 * smaller than this and is unaffected; a grid sitting in a full-width panel
 * stops growing here, so an ender chest and a chest card wear the same cell.
 * Applied by the caller as a wrapper class rather than baked into the grids,
 * because the grids themselves must keep filling whatever box they are given -
 * that is what makes them fit the card boards.
 */
export const SLOT_PANE = "max-w-[28.5rem]";

/**
 * One cell. Shared by every grid shape so a chest, a backpack and a stock
 * panel look identical and only their outline changes.
 *
 * Memoised, because there are thousands of these on a populated island and
 * the live feed re-publishes whenever a capture lands. The props are all
 * stable: `item` comes from a memo, `needle` is a string, and `context` is
 * memoised per section rather than rebuilt inline, which is what makes the
 * comparison actually bite instead of failing on a fresh object.
 */
export const Slot: React.FC<{
  item: SlotItem;
  needle: string;
  context: SlotContext;
  iconSize?: number;
}> = React.memo(
  ({ item, needle, context, iconSize = 22 }) => {
    const hit = needle !== "" && matches(item, needle);
    const missed = needle !== "" && !hit;
    const tier = context.tierOf(item.id);
    const displayTier = recombDisplayTier(tier, item.extra?.recomb ?? false);

    return (
      <ItemTooltip
        id={item.id}
        name={item.name}
        count={item.count}
        extra={item.extra}
        tier={tier}
        provenance={context.provenance}
        unitPrice={item.unitPrice !== undefined ? item.unitPrice : context.priceOf(item.id)}
        priceLabel={context.priceLabel}
        icon={
          <SlotIcon
            name={item.iconName ?? item.name}
            id={item.id}
            skin={item.extra?.skin}
            src={item.src}
            size={Math.max(30, iconSize + 8)}
          />
        }
        ariaLabel={`${item.name}: show item details`}
        wrapperClassName="block aspect-square"
      >
      <button
        type="button"
        className={`group relative flex h-full w-full items-center justify-center rounded-md border ${FOCUS} ${
          hit ? "border-emerald-500/70 bg-emerald-500/15" : rarityTileClass(displayTier)
        } ${missed ? "opacity-30" : ""}`}
        data-profile-item-tier={displayTier ?? "unknown"}
      >
        <SlotIcon
          name={item.iconName ?? item.name}
          id={item.id}
          skin={item.extra?.skin}
          src={item.src}
          size={iconSize}
        />

        {item.count > 1 && (
          <span
            className={`profile-item-overlay-text absolute bottom-0.5 right-0.5 text-[9px] leading-[1.3] ${NUM} text-slate-100`}
          >
            ×{shortCount(item.count)}
          </span>
        )}

      </button>
      </ItemTooltip>
    );
  }
);
Slot.displayName = "Slot";

/** An empty cell, drawn so the container keeps its real shape. */
export const EmptySlot: React.FC = () => (
  <div className="aspect-square rounded-[2px] border border-slate-800/40 bg-slate-900/30" />
);

/**
 * The container as it really is, gaps included.
 *
 * Only reachable when the mod shipped `slot` for this container. The empty
 * cells are not padding: they are the difference between a picture of a chest
 * and a list of what happens to be in one, and they are what lets somebody
 * recognise the chest they are thinking of.
 */
export const TrueGrid: React.FC<{
  cells: (SlotItem | null)[];
  needle: string;
  context: SlotContext;
  iconSize?: number;
}> = ({
  cells,
  needle,
  context,
  iconSize,
}) => (
  <div className="grid grid-cols-9 gap-1 px-3 pb-3 pt-2">
    {/*
      Keyed by position, because in a slot true grid position IS identity: cell
      17 is cell 17 whatever happens to be sitting in it. Keying by the item as
      well would remount the whole cell every time its contents changed, and a
      remounted `ItemIcon` forgets which image URLs it has already tried and
      re-walks its fallback ladder from the top. `ItemIcon` handles a changed
      `name` prop correctly on its own, so there is nothing to gain by that.
    */}
    {cells.map((cell, i) =>
      cell ? <Slot key={i} item={cell} needle={needle} context={context} iconSize={iconSize} /> : <EmptySlot key={i} />
    )}
  </div>
);

/** Packed nine-wide, padded to the container's real capacity. */
export const SlotGrid: React.FC<{
  items: SlotItem[];
  capacity: number;
  needle: string;
  context: SlotContext;
  iconSize?: number;
}> = ({
  items,
  capacity,
  needle,
  context,
  iconSize,
}) => {
  // Always the container's real size. A Large Chest is 9x6 and draws 54 cells
  // whether it holds 54 stacks or two, because the empty cells are the point:
  // this is the island as the player would see it standing in front of it, and
  // a grid that shrinks to its contents is a list wearing a grid's clothes.
  // Only a container holding more than its nominal capacity grows beyond it,
  // rounded to whole rows, because a stack we cannot draw is a stack the
  // player cannot find.
  const rows = Math.max(Math.ceil(capacity / SLOT_COLUMNS), Math.ceil(items.length / SLOT_COLUMNS));
  const pad = Math.max(0, rows * SLOT_COLUMNS - items.length);

  return (
    <div className="grid grid-cols-9 gap-1 px-3 pb-3 pt-2">
      {/*
        Aggregated lists carry an id at most once, so the id is a stable key.
        The index is deliberately not part of it: sorted-by-count lists reorder
        on any count change, and an index key would remount every cell from the
        first mover onward.
      */}
      {items.map((item) => (
        <Slot key={item.id} item={item} needle={needle} context={context} iconSize={iconSize} />
      ))}

      {Array.from({ length: pad }, (_, i) => (
        <EmptySlot key={`pad-${i}`} />
      ))}
    </div>
  );
};

/**
 * A packed grid for item sets that are not a container.
 *
 * Cells hold a fixed size and the column count comes from the panel width,
 * because these lists have no "real shape" to be true to and nine panel-wide
 * columns would blow each cell up to a hundred pixels. 2.75rem is the cell
 * that makes a 22px icon read like a game slot rather than a postage stamp.
 * No padding cells either: a stock list has no capacity, so an empty cell
 * would be an invented fact.
 */
export const SlotWrap: React.FC<{
  items: SlotItem[];
  needle?: string;
  context?: SlotContext;
  className?: string;
  /**
   * Key derivation, defaulting to the id, which is what every aggregated list
   * wants. The networth categories are the caller that cannot use it: their
   * lists deliberately carry one id twice when the stacks differ in value, and
   * duplicate keys would make React fold the two slots into one.
   */
  keyOf?: (item: SlotItem, index: number) => string;
}> = ({ items, needle = "", context = BARE_CONTEXT, className = "", keyOf = (item) => item.id }) => (
  <div className={`grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-1 ${className}`}>
    {items.map((item, index) => (
      <Slot key={keyOf(item, index)} item={item} needle={needle} context={context} />
    ))}
  </div>
);
