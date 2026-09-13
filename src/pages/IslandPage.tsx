import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SettingsLink } from "../components/layout/SettingsLink";
import { Boxes, ChevronDown, HelpCircle, Info, KeyRound, LockKeyhole, Search, Sparkles } from "lucide-react";
import { ItemIcon } from "../ui/ItemIcon";
import { itemResourceVersion, requestItemResource, resourceTierFor, subscribeItemResource } from "../items/itemResource";
import { WikiLink } from "../ui/WikiLink";
import {
  EmptySlot,
  SLOT_PANE,
  SlotGrid,
  SlotWrap,
  TrueGrid,
  matches,
  shortCount,
  type SlotContext,
  type SlotItem,
} from "../ui/slotGrid";
import { SlotIcon } from "../island/SlotIcon";

import { StorageSelector, type StorageDestination } from "../island/StorageSelector";
import { storageSummary } from "../island/storageSelectorModel";
import { hasApiProfileAccess, useApiAccess } from "../island/apiKey";
import { useIsland } from "../island/useIsland";
import { totalItems, slotLayout } from "../island/aggregate";
import { withoutChrome } from "../island/chrome";
import {
  averageSkillLevel,
  memberSkillKey,
  requestSkillDefs,
  skillProgress,
  useSkillDefs,
  type SkillDefs,
} from "../island/skills";
import { requestSkillIcons, useSkillIcons, type SkillIconMap } from "../island/skillIcons";
import type { ProfileFacts } from "../island/profileFacts";
import { ago, prettify, describeSection, SOURCE_LABEL } from "../island/format";
import { COLUMN_STEPS, columnsFor, distribute } from "../island/columns";
import {
  buildSackIndex,
  groupSacks,
  liveSackEntries,
  useSackDefinitions,
  type SackEntry,
  type SackGroup,
} from "../island/sacks";
import { useRecipes, useBazaar } from "../items/useItemData";
import { useOwned } from "../inventory";
import { useProfile } from "../profile/useProfile";
import type { GreenhouseBoard, GreenhouseCell, IslandChest, IslandItem, ItemExtra } from "../island/types";
import type { SectionProvenance } from "../island/merge";
import { NetworthPanel } from "../networth/NetworthPanel";
import { npcSellSummary } from "../networth/npcSell";
import { useNetworth, useParsedProfile } from "../networth/useNetworth";
import { buildWardrobeRows, armorItems, petTiles, rawToGearItem, recombTier, type GearItem, type GearWardrobeRow, type GearWardrobeSlot, type GearWardrobeState, type PetTile } from "../networth/gear";
import { resolveActiveLoadout } from "../island/activeLoadout";
import type { LoadoutStatement } from "../networth/parseItems";
import { AccessoriesView } from "./AccessoriesPage";
import { sectionTabNavigationIndex } from "./sectionTabs";
const MinionsSection = React.lazy(() =>
  import("../profile/MinionsSection").then((module) => ({ default: module.MinionsSection })),
);
const PlayerModel = React.lazy(() =>
  import("../island/PlayerModel").then((module) => ({ default: module.PlayerModel })),
);
import { useProfileTabs } from "../profile/useProfileTabs";
import type { ProfileTab } from "../profile/profileTabs";
import type { ProfileStatusView } from "../profile/profileStatus";
import { ItemTooltip } from "../ui/ItemTooltip";
import {
  PANEL,
  LABEL,
  NUM,
  PageHeader,
  INPUT,
  BTN_PRIMARY,
  BTN_QUIET,
  FOCUS,
  RARITY,
  SectionHead,
  Tag,
  TILE,
  rarityTileClass,
} from "../ui/kit";
import { coins, exactCoins } from "../networth/format";
import { SITE_NAME } from "../ui/brand";

/**
 * The profile page. Where is my stuff, and what is it worth.
 *
 * THE REBUILD, and the rule that drove it
 * ---------------------------------------
 * This page is a profile viewer in SkyCrypt's mould: that is its goal, and
 * SkyCrypt's functionality is the bar it is measured against. Before the
 * rebuild the page had grown at least five display languages -
 * a bare stat strip, a second tile style inside Networth, card boards, and
 * two different full-width giant-celled grids. What survives is ONE language:
 *
 *   - one band of kit tiles for every summary figure (the Networth panel
 *     draws it, the page hands its storage counts in),
 *   - hairline rows for anything you scan,
 *   - the shared slot grid for anything that is items, at one slot size
 *     everywhere (`SLOT_PANE` is the cap that killed the giant cells),
 *   - TILE cards for the chest and sack boards,
 *   - and compact, occupied-slots-only grids by default, with the container's
 *     true shape one click away. The old always-full-shape rule (spatial
 *     memory, empty cells as information) lost to the reality of a page where
 *     a two-item chest drew 52 cells of dead space; the layout is still there
 *     for the moment you want it, and the count line says "2 / 54 slots" so
 *     nothing is hidden.
 *
 * TABS, NOT STACKED SECTIONS (SkyCrypt as the reference): the sections
 * became real TABS in the nav's own underline language, one section on
 * screen at a
 * time with the active tab in the URL; the networth panel went tidy (values
 * stated, items browsed in their tabs); and the character column arrived -
 * the 3D player model, sticky on wide screens, with the worn armor beside it.
 *
 * TWO STANDING RULES:
 *   - The no-emojis rule is scoped to OUR OWN prose, labels and names. The
 *     game's own stat glyphs (Health's heart, Defense's shield glyph, and so
 *     on, in the game's stat colours) are welcome beside a stat wherever the
 *     game itself writes one. Nothing on this page names such a stat yet -
 *     skills, coins and counts have no canonical glyph - so nothing here uses
 *     one; the first surface that renders Health or Defense should.
 *   - Design north star: study SkyCrypt's design closely. Its choices are
 *     all taste calls, made to fit within the game's feeling.
 *     When a judgment call arises, prefer the reading that feels like the
 *     game, built from this site's own materials.
 *
 * WHAT THE PAGE KNOWS, from whom
 * ------------------------------
 * The Hypixel API cannot see inside island chests, so this page is fed by the
 * companion mod and, optionally, by a keyed API pull that fills in sacks,
 * networth, armor, wardrobe and pets. Two sources means every section says
 * where it came from and - more importantly - keeps four different kinds of
 * nothing apart:
 *
 *   verified empty                we looked, there is nothing there.
 *   not shared via API settings   Hypixel is withholding it, and the player can
 *                                 change that in game.
 *   not captured yet              the mod has not opened it.
 *   no source at all              nothing can see this.
 *
 * Rendering any of those as a zero would be a confident lie in a tool whose one
 * job is telling you where your things are, so none of them ever shows a count.
 *
 * The interaction model is search-first, because the real question is never
 * "show me chest 12" - it is "where did I put the enchanted mushrooms". Search
 * sits directly above the data, chests collapse, and a search auto-opens the
 * chests that match and hides the ones that do not.
 */

/**
 * One item line, for the aggregates that have no layout to draw.
 *
 * Sacks are totals rather than containers - the data contract is explicit that
 * they never carry a slot - so there is no grid to be true to and a row is the
 * honest shape. Search still matches on the raw id, and a matching row says so
 * by lighting up in the same emerald a matching slot does.
 */
const ItemRow: React.FC<{ id: string; name: string; count: number; needle: string }> = ({
  id,
  name,
  count,
  needle,
}) => {
  const hit = needle !== "" && matches({ id, name }, needle);

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 border-b border-white/8 last:border-b-0 ${
        hit ? "bg-emerald-500/10" : "hover:bg-white/5"
      }`}
    >
      <ItemIcon name={name} id={id} size={16} fallback="blank" />
      <WikiLink name={name} className="min-w-0 flex-1 text-[12px] text-slate-300" nameClassName="truncate" />
      <span className={`text-[11px] ${NUM} shrink-0 ${hit ? "text-emerald-300" : "text-slate-200"}`}>
        {count.toLocaleString()}
      </span>
    </div>
  );
};

/** Stable signature for an item's structured detail, for deciding when two stacks are the same thing. */
const extraSignature = (extra: ItemExtra | undefined): string => {
  if (!extra) return "";
  const ench = extra.ench
    ? Object.entries(extra.ench)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join(",")
    : "";
  return `${extra.reforge ?? ""}|${extra.stars ?? 0}|${extra.recomb ? 1 : 0}|${ench}`;
};

/**
 * Aggregate a flat list and sort it the way a player reads it: biggest first.
 *
 * Deliberately does not filter on search. A grid answers "where is it" by
 * highlighting the slot in place; removing the misses would rearrange the very
 * thing being pointed at.
 *
 * The spec aggregates by id, which is right for the bulk of a chest but blunt
 * for gear: three Hyperions with three different reforges collapse into one
 * slot. So `extra` survives only when every stack behind that slot agrees on
 * it. Where they disagree the detail is dropped rather than picking one at
 * random, because a tooltip confidently naming the wrong reforge is worse than
 * one that stays quiet about it.
 */
const rollup = (rawList: IslandItem[]): SlotItem[] => {
  // Container buttons are not possessions. Filtered on the way out only; the
  // stored snapshot keeps them, because the mod owns history and a rule that
  // proves too aggressive must be fixable without a re-export.
  const list = withoutChrome(rawList);
  const detail = new Map<string, { extra?: ItemExtra; signature: string; mixed: boolean }>();
  for (const item of list) {
    const signature = extraSignature(item.extra);
    const seen = detail.get(item.id);
    if (!seen) detail.set(item.id, { extra: item.extra, signature, mixed: false });
    else if (seen.signature !== signature) seen.mixed = true;
  }

  return [...totalItems(list)]
    .map(([id, v]) => {
      const d = detail.get(id);
      const slot: SlotItem = { id, name: v.name || prettify(id), count: v.count };
      if (d && !d.mixed && d.extra) slot.extra = d.extra;
      return slot;
    })
    .sort((a, b) => b.count - a.count);
};

/**
 * The container's true shape, gaps included: slot-true when the mod shipped
 * positions, packed-and-padded when it did not. The choice lives here so every
 * container on the page makes it identically. Capped at `SLOT_PANE` by the
 * caller when it sits in a full-width panel, which is what keeps a full-shape
 * ender chest wearing the same cell as a chest card.
 */
const ShapeGrid: React.FC<{
  items: IslandItem[];
  capacity: number;
  needle: string;
  context: SlotContext;
}> = ({ items, capacity, needle, context }) => {
  const clean = useMemo(() => withoutChrome(items), [items]);
  const cells = useMemo(() => slotLayout(clean, capacity), [clean, capacity]);
  const packed = useMemo(() => rollup(clean), [clean]);

  if (!cells) return <SlotGrid items={packed} capacity={capacity} needle={needle} context={context} />;

  // Slot-true means per-slot entries, so these are NOT aggregated by id: two
  // separate stacks of cobblestone are two cells, exactly as in the chest.
  const trueCells = cells.map((cell) =>
    cell ? { id: cell.id, name: cell.name, count: cell.count, extra: cell.extra } : null
  );
  return <TrueGrid cells={trueCells} needle={needle} context={context} />;
};

/**
 * A container's body: the TRUE layout, empty slots and all, by default.
 *
 * TWO RULES, AND THE SECOND ONE WINS. The first rebuild defaulted every
 * container to an occupied-slots-only view, and that default was reversed
 * almost immediately: it undid the earlier work of keeping every chest with
 * its empty slots. The empty
 * cells are spatial memory - a player recognises their chest by its shape, and
 * SkyCrypt draws every container full-shape for the same reason. So the true
 * layout is the default again, exactly as it was before the rebuild, and the
 * occupied-only view survives only as an opt-in toggle, off by default.
 *
 * What survives from the rebuild is the SIZE rule: the grid is capped at the
 * shared slot scale (`SLOT_PANE`) instead of stretching nine cells across the
 * whole panel, which is what made the old full-width sections read as fields
 * of giant empty tiles. Full shape at chest scale, not full shape at billboard
 * scale.
 */
const ContainerBody: React.FC<{
  items: IslandItem[];
  capacity: number;
  needle: string;
  context: SlotContext;
}> = ({ items, capacity, needle, context }) => {
  const [hideEmpty, setHideEmpty] = useState(false);
  const clean = useMemo(() => withoutChrome(items), [items]);
  const packed = useMemo(() => rollup(clean), [clean]);

  /**
   * "18 / 36 slots" only when the arithmetic is real. The mod flattens the
   * ender chest's pages and every backpack into one list, so those sections
   * routinely hold three times their nominal single-screen capacity, and
   * "242 / 54 slots" would be a confident nonsense. When the count exceeds the
   * capacity the denominator is the wrong fact, so it is dropped rather than
   * shown wrong.
   */
  const countLine = clean.length > capacity ? `${clean.length} stacks` : `${clean.length} / ${capacity} slots`;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 px-3 pt-1.5">
        <span className={`text-[10px] ${NUM} text-slate-500`}>{countLine}</span>
        <button
          type="button"
          onClick={() => setHideEmpty((v) => !v)}
          className="cursor-pointer text-[10px] text-slate-500 hover:text-slate-300"
        >
          {hideEmpty ? "Show empty slots" : "Hide empty slots"}
        </button>
      </div>
      {hideEmpty ? (
        <SlotWrap items={packed} needle={needle} context={context} className="px-3 pb-3 pt-1.5" />
      ) : (
        <div className={SLOT_PANE}>
          <ShapeGrid items={items} capacity={capacity} needle={needle} context={context} />
        </div>
      )}
    </div>
  );
};

/**
 * The provenance chip that sits in every section heading. It wears the site's
 * one tag shape, in the kit Tag's geometry, hand-carried rather than composed
 * from `Tag` because Tag's two colourways cannot state the amber case and a
 * hue passed over a complete triplet would ride on stylesheet order (the same
 * reasoning the accessories' SourceTag records).
 */
const SourceTag: React.FC<{ provenance: SectionProvenance; live: boolean }> = ({ provenance, live }) => {
  const text = describeSection(provenance, live);
  if (!text) return null;
  // "Hidden" is the one state the player can act on, so it is the one that
  // gets a colour: the honesty amber, at the canon border-over-fill weights.
  // Everything else is ordinary metadata in the neutral chip colours.
  const actionable = provenance.state === "hidden";
  return (
    <span
      className={
        "inline-flex items-center rounded-sm border px-1.5 py-px font-mono text-[11px] leading-[1.5] tracking-tight " +
        (actionable ? "border-amber-300/35 bg-amber-300/10 text-amber-300" : "border-white/12 bg-white/8 text-slate-300")
      }
    >
      {text}
    </span>
  );
};

/**
 * The prose a section shows when it has no rows, which depends entirely on
 * *why* it has none. This is the honesty rule made visible.
 */
const EmptyReason: React.FC<{ provenance: SectionProvenance; noun: string }> = ({ provenance, noun }) => {
  if (provenance.state === "hidden") {
    return (
      <p className="px-3 py-2 text-[11px] text-amber-400/90">
        Hypixel is not sharing your {noun}. Turn the matching option on in game under SkyBlock Menu → Settings → API
        Settings, then refresh. This is not the same as it being empty.
      </p>
    );
  }
  if (provenance.state === "absent") {
    return (
      <p className="px-3 py-2 text-[11px] text-slate-500">
        Nothing has captured your {noun} yet. Run the Skydex mod and open it in game. This is not the same as it
        being empty.
      </p>
    );
  }
  return <p className="px-3 py-2 text-[11px] text-slate-500">Checked and empty.</p>;
};

/**
 * A section that may not exist, may be private, or may genuinely be empty.
 *
 * `list` still carries the original distinction - `undefined` means no source
 * has it - and `provenance` explains which of the several reasons applies.
 */
const OptionalSection: React.FC<{
  title: string;
  noun: string;
  list: IslandItem[] | undefined;
  provenance: SectionProvenance;
  live: boolean;
  needle: string;
  context: SlotContext;
  /** Real container size, so a slot-true render draws the right shape. */
  capacity: number;
}> = ({ title, noun, list, provenance, live, needle, context, capacity }) => {
  const rows = useMemo(() => (list ? rollup(list) : []), [list]);
  const hits = useMemo(() => (needle ? rows.filter((r) => matches(r, needle)).length : 0), [rows, needle]);

  return (
    <div className={PANEL}>
      <SectionHead
        title={title}
        right={
          <span className="flex items-center gap-2">
            {needle !== "" && rows.length > 0 && (
              <span className={`text-[10px] ${NUM} ${hits > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                {hits} match{hits === 1 ? "" : "es"}
              </span>
            )}
            <SourceTag provenance={provenance} live={live} />
          </span>
        }
      />
      {!list || list.length === 0 ? (
        <EmptyReason provenance={provenance} noun={noun} />
      ) : (
        <ContainerBody items={list} capacity={capacity} needle={needle} context={context} />
      )}
    </div>
  );
};

/* --- fixed columns, and why the cards never jump ----------------------- */

/**
 * How many card columns this viewport is wide enough for.
 *
 * The steps live in `island/columns.ts` next to the distribution that consumes
 * them, so there is one statement of where the breakpoints are rather than two
 * that can drift apart.
 *
 * WHY BOTH LISTENERS
 * ------------------
 * `matchMedia` is the right primitive: it fires on the two threshold crossings
 * rather than on every pixel of a drag. It is not, however, reliable enough on
 * its own. This was caught in testing, not theorised: a window that really had
 * gone from narrow to 1280 wide reported the new `innerWidth` while no `change`
 * event had been delivered, so the board stayed at one column until a reload.
 *
 * A `resize` listener is the ground truth for `innerWidth`, so it closes that
 * gap. It costs nothing to keep both, because the state setter is handed a
 * number that is usually identical to the one already stored, and React bails
 * out of the re-render when it is. A drag therefore costs one comparison per
 * event and repaints only when the column count genuinely changes.
 */
const useColumnCount = (): number => {
  const [columns, setColumns] = useState(() => (typeof window === "undefined" ? 1 : columnsFor(window.innerWidth)));

  useEffect(() => {
    const read = () => setColumns(columnsFor(window.innerWidth));
    // Once on mount as well: the width can have moved between the first render
    // and this effect, and neither listener reports what it missed.
    read();

    const queries = COLUMN_STEPS.map((step) => window.matchMedia(`(min-width: ${step.minWidth}px)`));
    for (const q of queries) q.addEventListener("change", read);
    window.addEventListener("resize", read);

    return () => {
      for (const q of queries) q.removeEventListener("change", read);
      window.removeEventListener("resize", read);
    };
  }, []);

  return columns;
};

/**
 * A board of cards in fixed columns.
 *
 * Each column is its own flex stack, and that is the whole mechanism:
 * collapsing a card shortens it, so the cards below it *in that column* slide
 * up to take the space and nothing in any other column moves at all. A masonry
 * layout would rebalance the heights instead and shunt a card sideways into a
 * different column, turning one click into a page-wide rearrangement.
 *
 * The column a card lands in comes from its position in the list and never from
 * a measurement, so the same list always produces the same board.
 */
function CardBoard<T>({
  items,
  keyOf,
  render,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
}) {
  const count = useColumnCount();
  const columns = useMemo(() => distribute(items, count), [items, count]);

  return (
    <div className="flex items-start gap-2 p-2">
      {columns.map((column, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col gap-2">
          {column.map((item) => (
            <React.Fragment key={keyOf(item)}>{render(item)}</React.Fragment>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Collapse state for one board.
 *
 * STORED AS A DEFAULT PLUS EXCEPTIONS, NOT AS A LIST OF KEYS
 * ----------------------------------------------------------
 * The two boards want opposite defaults. Chests open, because the whole point
 * is that every chest is already showing its contents and collapsing is what
 * you do to put one away. Sacks closed, because there are two dozen of them and
 * a wall of item rows is not a board, it is a scroll.
 *
 * A plain set of collapsed keys cannot express "closed by default", since the
 * keys do not exist until the data arrives and would have to be back-filled
 * every time a sack appeared. So what is stored is the default and the set of
 * cards that disagree with it. That also makes collapse-all and expand-all
 * exact rather than best-effort: they set the default and clear the
 * exceptions, so a card that arrives later obeys the last instruction given
 * instead of springing open on its own.
 *
 * This hook is called from `IslandPage`, which no snapshot ever unmounts, so a
 * live capture landing cannot silently reopen what the reader closed.
 */
const useCollapsed = (startCollapsed: boolean) => {
  const [collapsedByDefault, setCollapsedByDefault] = useState(startCollapsed);
  const [exceptions, setExceptions] = useState<ReadonlySet<string>>(() => new Set<string>());

  const isCollapsed = useCallback(
    (key: string) => (exceptions.has(key) ? !collapsedByDefault : collapsedByDefault),
    [exceptions, collapsedByDefault]
  );

  const toggle = useCallback((key: string) => {
    setExceptions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setCollapsedByDefault(true);
    setExceptions(new Set<string>());
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedByDefault(false);
    setExceptions(new Set<string>());
  }, []);

  // "Is anything open" without walking the card list: everything is closed only
  // when the default is closed and nothing disagrees with it.
  const anyOpen = !collapsedByDefault || exceptions.size > 0;

  return { isCollapsed, toggle, collapseAll, expandAll, anyOpen };
};

/** The collapse-everything control, one per board. */
const BoardControl: React.FC<{ anyOpen: boolean; onCollapseAll: () => void; onExpandAll: () => void }> = ({
  anyOpen,
  onCollapseAll,
  onExpandAll,
}) => (
  <button
    onClick={anyOpen ? onCollapseAll : onExpandAll}
    className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
  >
    {anyOpen ? "Collapse all" : "Expand all"}
  </button>
);

/**
 * The card every board is made of.
 *
 * One shell for chests and for sacks, because they are the same object to
 * somebody hunting for an item - a named box with things in it - and there is
 * no reason to make them learn two visual languages on one page. It wears the
 * kit's TILE material (the shards-scale soft card), because a card you pick
 * and open is exactly what TILE is for; the counts on the right are the kit's
 * one chip, `Tag`, rather than a private badge. The header is the whole hit
 * area, so there is no small chevron to aim at.
 */
const CollapseCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  open: boolean;
  hit: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ icon, title, meta, right, open, hit, onToggle, children }) => {
  return (
    <div
      className={`rounded-md border ${
        hit ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/8 bg-white/5"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left cursor-pointer hover:bg-white/5"
      >
        <ChevronDown
          className={`w-3 h-3 shrink-0 text-slate-500 transition-transform duration-200 ease-out motion-reduce:transition-none ${
            open ? "" : "-rotate-90"
          }`}
          aria-hidden
        />
        {icon}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-slate-200">{title}</span>
          {meta !== undefined && <span className={`block truncate text-[10px] ${NUM} text-slate-500`}>{meta}</span>}
        </span>
        {right}
      </button>

      {/*
        Height animation with no measuring: a one row grid moving between 0fr
        and 1fr resolves to the content's real height at both ends, so nothing
        has to read `scrollHeight` or hardcode a max. The duration and easing
        are the kit's existing transition idiom, the same one `Bar` uses for its
        fill, and `motion-reduce` pins it to the finished state rather than
        merely shortening it.
      */}
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        {/*
          THE CLIP IS ONLY ON WHILE CLOSED, AND THAT IS A DELIBERATE TRADE
          ----------------------------------------------------------------
          A clipped box is what lets the row animate between 0fr and its real
          height without anything having to measure `scrollHeight`. It is also
          what would eat the item tooltips, which hang above their slot and
          deliberately outside the card.

          The first version kept the clip on until an opening transition
          finished, driven by `transitionend` with a timer behind it. That is
          one state machine too many for what it buys: any path where neither
          signal arrives leaves the clip stranded on and every tooltip in that
          card silently truncated. Reduced motion is one such path, and a
          throttled background tab is another.

          So the clip is a pure function of `open`. Closing still animates
          properly, because the clip goes on in the same commit that starts it.
          Opening shows the contents at full size for the 200ms the box takes to
          grow, which is a small cosmetic imperfection on an animation, against
          a hard requirement that hovering a slot tells the player what is in it.
        */}
        <div className={`min-h-0 ${open ? "" : "overflow-hidden"}`}>{children}</div>
      </div>
    </div>
  );
};

/* --- chests ------------------------------------------------------------ */

/** A Large Chest is 9x6, an ordinary one 9x3. The title is what the mod captured, so it is what we read. */
const isDoubleChest = (name: string): boolean => /large|double/i.test(name);
const chestCapacity = (name: string): number => (isDoubleChest(name) ? 54 : 27);

/**
 * Minecraft's own generic container titles.
 *
 * Anchored and exact, because this test decides whether we keep the player's
 * words or replace them, and a substring match would throw away a chest that
 * somebody deliberately called "Spare Chest".
 */
const GENERIC_CHEST_TITLE = /^(large\s+)?(trapped\s+)?chest$/i;

/**
 * What to call a chest.
 *
 * An unnamed container arrives carrying Minecraft's generic title. Those are
 * normalised to the game's own two names for the thing: a wide chest is a
 * Large Chest and a one block chest is a Chest. A title
 * the player set themselves is kept exactly as typed, because they set it
 * precisely so they could find it again.
 */
const chestLabel = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed || GENERIC_CHEST_TITLE.test(trimmed)) {
    return isDoubleChest(trimmed) ? "Large Chest" : "Chest";
  }
  return trimmed;
};

/**
 * A real large chest render, hotlinked from the Minecraft Wiki.
 *
 * The Hypixel SkyBlock wiki has no double chest under any title, checked by
 * enumerating its File namespace rather than by guessing. The main Minecraft
 * Wiki does, and it is the genuine wide two block block rather than two single
 * chests pushed together, which was the previous stand-in and which never
 * looked right: a double chest is one object in the game, not
 * a pair.
 *
 * LICENCE, WHICH IS NOT THE ONE THE REST OF THE PAGE USES
 * -------------------------------------------------------
 * This file is tagged `{{License Mojang}}` on the wiki: non free, attribution
 * required, guidelines link required. It is NOT covered by the wiki's
 * CC BY-NC-SA text licence, because Weird Gloop's own policy says in writing
 * that media must not be assumed to share the text licence. So it is used under
 * Mojang's Usage Guidelines instead, which permit a fan site to display game
 * assets provided nothing is redistributed and the non affiliation disclaimer
 * is carried. Hotlinking satisfies the redistribution condition outright: no
 * byte of Mojang's ships in this repository or in a build.
 *
 * Full provenance, the licence template's exact flags and the obligations are
 * recorded in NOTICE.md.
 */
const LARGE_CHEST_SRC = "https://minecraft.wiki/images/Large_Chest_%28S%29_JE6.png";

/**
 * The chest, drawn as itself.
 *
 * `src` rather than a fork of the icon ladder: `ItemIcon` tries a caller's
 * preferred source first and falls back to its own rungs if it fails, so a day
 * when the wiki renames that file costs the render and not the header. Both
 * variants sit in a box of one width, so a column of headers stays aligned
 * however the chests are mixed.
 */
const ChestGlyph: React.FC<{ name: string }> = ({ name }) => {
  const trapped = /trapped/i.test(name);
  const double = isDoubleChest(name);

  return (
    <span className="flex w-8 shrink-0 items-center justify-center" aria-hidden>
      <ItemIcon
        name={trapped ? "Trapped Chest" : "Chest"}
        src={double && !trapped ? LARGE_CHEST_SRC : undefined}
        // The slot-scale halving of the 64px wiki thumbs; between-step sizes
        // put the pixel art through a non-integer resample and it smears. The
        // wide double-chest render keeps its shape through object-contain.
        size={32}
        fallback="blank"
      />
    </span>
  );
};

/** What the page has worked out about one chest, computed once per search rather than per render. */
interface ChestView {
  chest: IslandChest;
  key: string;
  hits: number;
  total: number;
  /** Occupied slots, after the chrome filter. The honest half of "2 / 54". */
  occupied: number;
}

const ChestCard: React.FC<{
  view: ChestView;
  needle: string;
  open: boolean;
  onToggle: () => void;
  context: SlotContext;
}> = ({ view, needle, open, onToggle, context }) => {
  const { chest, hits, total, occupied } = view;
  const searching = needle !== "";
  const capacity = chestCapacity(chest.name);

  return (
    <CollapseCard
      icon={<ChestGlyph name={chest.name} />}
      title={chestLabel(chest.name)}
      meta={`${chest.pos[0]} ${chest.pos[1]} ${chest.pos[2]} · ${ago(chest.lastSeen)} · ${shortCount(total)} items`}
      right={
        searching && hits > 0 ? (
          <Tag accent>{hits}</Tag>
        ) : occupied <= capacity ? (
          <Tag title={`${occupied} of ${capacity} slots occupied`}>
            {occupied} / {capacity}
          </Tag>
        ) : (
          // A capture holding more stacks than the container's nominal size
          // (the mod merged screens, or the title lied about the shape) gets a
          // plain stack count rather than a fraction that cannot be true.
          <Tag title={`${occupied} stacks captured`}>{occupied}</Tag>
        )
      }
      open={open}
      hit={searching && hits > 0}
      onToggle={onToggle}
    >
      {chest.items.length === 0 ? (
        <p className="px-3 pb-2 text-[11px] text-slate-500">Empty.</p>
      ) : (
        <ContainerBody items={chest.items} capacity={capacity} needle={needle} context={context} />
      )}
    </CollapseCard>
  );
};

/**
 * The chest board.
 *
 * Every chest is open by default and shows its contents compactly; the true
 * slot layout, gaps included, is one click inside the card (see
 * `ContainerBody` for the rule that decides the default).
 *
 * A search forces a matching chest open however the reader left it, so asking
 * where something is never answers with a closed box.
 */
const ChestBoard: React.FC<{
  views: readonly ChestView[];
  needle: string;
  isCollapsed: (key: string) => boolean;
  onToggle: (key: string) => void;
  context: SlotContext;
}> = ({ views, needle, isCollapsed, onToggle, context }) => (
  <CardBoard
    items={views}
    keyOf={(v) => v.key}
    render={(v) => (
      <ChestCard
        view={v}
        needle={needle}
        open={(needle !== "" && v.hits > 0) || !isCollapsed(v.key)}
        onToggle={() => onToggle(v.key)}
        context={context}
      />
    )}
  />
);

/* --- sacks ------------------------------------------------------------- */

/** One sack group as the board shows it: the group, plus whatever a search left of it. */
interface SackView {
  group: SackGroup;
  rows: SackEntry[];
  hits: number;
}

/**
 * Why an item ended up in the catch-all.
 *
 * Three reasons, kept apart for exactly the purpose the section provenance is
 * kept apart everywhere else on this page: "we have not read the list yet" and
 * "the list does not name this item" are different statements, and rendering
 * the first as the second would blame the player's items for our own pending
 * request.
 */
const UnsortedReason: React.FC<{ loading: boolean; error: string | null }> = ({ loading, error }) => {
  if (loading) {
    return (
      <p className="px-2 py-1.5 text-[10px] text-slate-500">
        Still reading the wiki&rsquo;s sack list. These sort themselves as soon as it lands.
      </p>
    );
  }
  if (error) {
    return (
      <p className="px-2 py-1.5 text-[10px] text-amber-400/90">
        The wiki&rsquo;s sack list could not be read, so nothing could be sorted. {error}
      </p>
    );
  }
  return (
    <p className="px-2 py-1.5 text-[10px] text-slate-500">
      The wiki&rsquo;s sack list does not name these, so they are shown here rather than filed under a guess.
    </p>
  );
};

const SackCard: React.FC<{
  view: SackView;
  needle: string;
  open: boolean;
  onToggle: () => void;
  loading: boolean;
  error: string | null;
}> = ({ view, needle, open, onToggle, loading, error }) => {
  const { group, rows, hits } = view;
  const searching = needle !== "";

  return (
    <CollapseCard
      icon={
        <span className="flex w-8 shrink-0 items-center justify-center" aria-hidden>
          {group.identified ? (
            <ItemIcon name={group.icon ?? group.sack} size={32} fallback="blank" />
          ) : (
            <HelpCircle className="w-4 h-4 text-slate-500" />
          )}
        </span>
      }
      title={group.sack}
      meta={`${group.rows.length} item${group.rows.length === 1 ? "" : "s"}`}
      right={searching ? <Tag accent>{hits}</Tag> : <Tag>{shortCount(group.total)}</Tag>}
      open={open}
      hit={searching && hits > 0}
      onToggle={onToggle}
    >
      <div className="border-t border-white/8">
        {!group.identified && <UnsortedReason loading={loading} error={error} />}
        {rows.map((row) => (
          <ItemRow key={row.id} id={row.id} name={row.name} count={row.count} needle={needle} />
        ))}
      </div>
    </CollapseCard>
  );
};

/**
 * The sack board.
 *
 * Same shell, same columns and same collapse as the chests, because a sack is
 * the same kind of thing to somebody looking for a mushroom. What differs is
 * the body: a sack is an aggregate with no layout at all, so there is no true
 * shape to draw and rows are the honest form.
 */
const SackBoard: React.FC<{
  views: readonly SackView[];
  needle: string;
  isCollapsed: (key: string) => boolean;
  onToggle: (key: string) => void;
  loading: boolean;
  error: string | null;
}> = ({ views, needle, isCollapsed, onToggle, loading, error }) => (
  <CardBoard
    items={views}
    keyOf={(v) => v.group.sack}
    render={(v) => (
      <SackCard
        view={v}
        needle={needle}
        open={(needle !== "" && v.hits > 0) || !isCollapsed(v.group.sack)}
        onToggle={() => onToggle(v.group.sack)}
        loading={loading}
        error={error}
      />
    )}
  />
);

/**
 * The greenhouse board.
 *
 * WHAT THIS CARD IS ALLOWED TO SAY
 * --------------------------------
 * Exactly what the mod saw, when it saw it. Nothing here estimates, projects or
 * fills a gap: an empty square means the mod observed nothing planted there,
 * not "probably nothing", and a cell with no countdown is one the player has
 * not diagnosed rather than one whose timer we quietly guessed. Forward
 * simulation belongs to the route engine and deliberately does not live here.
 *
 * THE TIMESTAMP IS THE POINT
 * --------------------------
 * The stamp reads `observedAt` and nothing else, and in particular it does NOT
 * say "live" while the mod is connected. Those are two different facts and they
 * come apart constantly: the player walks away from the Garden and the mod
 * stays connected for hours while the board underneath it ages. A live badge
 * over an hour-old board is precisely the stale-board-with-a-fresh-timestamp
 * failure this feature has to avoid, so the connection state is left to the
 * page header where it belongs and the card speaks only for the scan.
 *
 * Same materials as the chest grids by design: it is the same kind of object,
 * a container in the game drawn in our own skin, and there is no reason for a
 * player to have to learn a second visual language halfway down the page.
 */

/**
 * How long until a diagnosed stage lands, coarse like `ago` and for the same
 * reason: nobody is timing a pumpkin to the second.
 *
 * "due" once the moment has passed is arithmetic on a verified timestamp, not a
 * claim that the crop advanced. Hypixel decides that, we only report that the
 * time the player was told has arrived.
 */
const untilLabel = (at: number): string => {
  const delta = at - Date.now();
  if (delta <= 0) return "due";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
};

/**
 * One occupied square.
 *
 * A mutation gets a glyph rather than a colour. Emerald already means "matches
 * your search" everywhere else on this page, and teaching it a second meaning
 * in one card would make both weaker; the game's own colours are reserved for
 * rarity and stats. So the difference between a crop and a mutation is stated
 * in a mark and in the hover label, which is quieter and unambiguous.
 */
const GreenhouseTile: React.FC<{ cell: GreenhouseCell }> = ({ cell }) => {
  const id = cell.mutation ?? cell.crop ?? "";
  const name = prettify(id);
  const until = cell.nextStageAt === undefined ? null : untilLabel(cell.nextStageAt);

  return (
    <div
      className="relative aspect-square rounded-[2px] border border-slate-800 bg-slate-900/60 flex items-center justify-center"
      title={until === null ? name : `${name} · next stage ${until}`}
    >
      <ItemIcon name={name} id={id} size={22} fallback="blank" />

      {cell.mutation !== undefined && (
        <Sparkles className="absolute left-0.5 top-0.5 w-2 h-2 text-slate-400" aria-hidden />
      )}

      {/* Quiet on purpose: a countdown is a minority fact about a minority of
          cells, and it must not out-shout the board it sits on. */}
      {until !== null && (
        <span
          className={`absolute bottom-0 right-0 rounded-[2px] bg-slate-950/85 px-0.5 text-[9px] leading-[1.3] ${NUM} text-slate-400`}
        >
          {until}
        </span>
      )}
    </div>
  );
};

/**
 * The board itself, drawn at the size the mod reported.
 *
 * Ten by ten today, but the width comes from the data and reaches the grid as a
 * style rather than a class, because a class built from a variable is a class
 * Tailwind never sees and therefore never emits. Capped at `SLOT_PANE` like
 * every other grid on the page: before the cap this board stretched across the
 * whole panel and was the worst of the giant-celled sparse grids the rebuild
 * set out to kill.
 *
 * Cells are keyed by coordinate with the later entry winning, which is the same
 * overlap rule pushed layouts follow. Overlaps should not occur in an
 * observation at all; if one does, one square renders one thing rather than two
 * squares fighting over it.
 */
const GreenhouseGrid: React.FC<{ board: GreenhouseBoard }> = ({ board }) => {
  const [width, height] = board.size;

  const byCoord = useMemo(() => {
    const map = new Map<string, GreenhouseCell>();
    for (const cell of board.cells) map.set(`${cell.x},${cell.y}`, cell);
    return map;
  }, [board]);

  return (
    <div
      className={`grid gap-1 px-3 pb-3 pt-2 ${SLOT_PANE}`}
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: width * height }, (_, i) => {
        // x is the column and y the row, 0-based from the anchored corner, so a
        // pushed layout and an observed board line up square for square.
        const cell = byCoord.get(`${i % width},${Math.floor(i / width)}`);
        return cell ? <GreenhouseTile key={i} cell={cell} /> : <EmptySlot key={i} />;
      })}
    </div>
  );
};

/** Exported so the board can be rendered on its own, without a stored snapshot. */
export const GreenhouseCard: React.FC<{ board: GreenhouseBoard }> = ({ board }) => (
  <div className={PANEL}>
    <SectionHead
      title="Greenhouse"
      right={<span className="text-[10px] text-slate-500">observed {ago(board.observedAt)}</span>}
    />
    <GreenhouseGrid board={board} />
  </div>
);

/* --- skills, from the keyed API pull ------------------------------------ */

/**
 * One skill's row: name, level, the kit's progress rail, and the XP split a
 * player actually reads ("3.61M / 7M XP" into the current level, the way
 * SkyCrypt writes it). A maxed skill shows its lifetime total instead,
 * because "progress toward level 61" is not a fact.
 *
 * The formatter is the networth panel's coin abbreviator, reused because it is
 * a plain magnitude formatter and skill XP spans the same six orders; the
 * exact figure sits in the title, same split as every abbreviated number here.
 */
/**
 * The circular icon frame beside a skill's name.
 *
 * `rounded-full` here is a NAMED ADDITION to the kit's round-elements
 * exception (which lists status dots and spinners): structural parity with
 * SkyCrypt asks for its circular skill icons verbatim, so a circular
 * skill-icon frame is now a genuinely round element by design. The icon
 * title comes from the wiki's own Skill data module and
 * is never guessed; a skill the module does not name renders no frame at all.
 */
/* --- the medallion skill row (gui-redesign bench) ------------------------- */

/*
 * MAXED-SKILL COLOUR SEMANTICS (matching SkyCrypt's skill bars): a skill AT
 * ITS CAP wears gold - medallion, bar and
 * figure - while in-progress skills keep the accent. The cap is the resource
 * ladder's own top, never hardcoded. Gold is `rarity-legendary`, used here as
 * chrome rather than as game data, which is the one place that ramp gets to
 * cross over, because "maxed" is the same idea legendary encodes.
 */
const SKILL_MAXED = "var(--color-rarity-legendary)";
const SKILL_CLIMBING = "var(--color-emerald-400)";

/*
 * The edge is the fill, darkened - not a neutral grey and not black. A grey
 * outline would read as a separate stroke drawn around the shape; a shade of
 * the shape's own colour reads as the shape having an edge, and the blue rows
 * and gold rows each get their own outline for free from one rule. It goes on
 * the COLOURED parts only - the medallion and the filled length - never the
 * empty channel: outlining the whole track drew a box around a container,
 * outlining the fill gives the progress itself an edge.
 */
const SKILL_EDGE_SHADE = "62%";
/* Mixed from the tone rather than computed off a hex, so the tones can stay on
   their theme variables and a retint of the accent carries the edge with it. */
const skillEdge = (tone: string): string => `color-mix(in srgb, ${tone} ${SKILL_EDGE_SHADE}, black)`;

/*
 * Geometry, measured in the gui-redesign bench. Medallion 38, track 9,
 * BOTTOM ALIGNED (an earlier version's medallion overhung), so a column of
 * rows lines up along the
 * tracks rather than along twelve circle centres; the medallion overhangs
 * UPWARD into the row's own leading. The track runs left, out of its column
 * and under the medallion as far as its centre, which is what joins the two
 * into one shape.
 */
const SK_MEDALLION = 42;
const SK_GLYPH = 32;
const SK_TRACK_H = 9;
const SK_GAP = 8;
const SK_CONNECT = SK_GAP + SK_MEDALLION / 2;
const SK_RADIUS = SK_MEDALLION / 2;
/* The circle's centre, in the track's own coordinates: the track is bottom
   aligned and only SK_TRACK_H tall, so the centre sits above its top edge. */
const SK_HALO_CY = SK_RADIUS - (SK_MEDALLION - SK_TRACK_H);
const SK_HALO_OUT = SK_RADIUS + 9;

/**
 * The XP figure. The total carries the emphasis (it is the number that says
 * what the skill is worth); the current figure is the same colour lighter,
 * because they are one quantity and only one of them is the headline. White
 * while climbing, gold once maxed: the accent-blue version competed with the
 * bar it sits over, white is 15:1 anywhere on the page, and it leaves gold
 * meaning exactly one thing. Weights are real 400/600 (both loaded - a weight
 * the browser does not have is synthesised by smearing glyphs sideways, which
 * reads as "glowy"), at the same 14px as the skill name opposite.
 */
const SkillXpFigure: React.FC<{ current: string | null; total: string; maxed: boolean; titleText: string }> = ({
  current,
  total,
  maxed,
  titleText,
}) => {
  const tone = maxed ? SKILL_MAXED : "#e8edf3";
  if (current === null) {
    return (
      <span className="shrink-0 font-mono text-[14px] font-semibold tabular-nums" style={{ color: tone }} title={titleText}>
        {total} XP
      </span>
    );
  }
  return (
    <span className="shrink-0 font-mono text-[14px] tabular-nums" style={{ color: tone }} title={titleText}>
      <span className="font-normal">{current}</span>
      <span className="px-[3px] font-normal opacity-70">/</span>
      <span className="font-semibold">{total} XP</span>
    </span>
  );
};

/**
 * One skill: medallion, label row, track. Nothing is written ON the fill -
 * every version that wrote the label over the bar put text on a background
 * that changed colour halfway along the string.
 * The level number carries the tone as information, not decoration.
 */
const SkillMedallionRow: React.FC<{
  name: string;
  level: number | null;
  /**
   * Null when no level curve is known for this skill, in which case the row
   * carries no track at all. Zero is a real zero: a skill sitting at the start
   * of a curve we do have.
   */
  pct: number | null;
  maxed: boolean;
  iconTitle: string | undefined;
  figure: { current: string | null; total: string; titleText: string };
}> = ({ name, level, pct, maxed, iconTitle, figure }) => {
  const tone = maxed ? SKILL_MAXED : SKILL_CLIMBING;
  return (
    <div className="flex items-end" style={{ gap: SK_GAP }}>
      <span
        className="relative z-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full"
        style={{
          width: SK_MEDALLION,
          height: SK_MEDALLION,
          backgroundColor: tone,
          border: `1px solid ${skillEdge(tone)}`,
        }}
      >
        {iconTitle && (
          <span className="relative z-10">
            <ItemIcon name={iconTitle} size={SK_GLYPH} fallback="blank" />
          </span>
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[14px] font-semibold text-slate-50">
            {name}{" "}
            {level !== null && (
              <span className="font-mono font-semibold tabular-nums" style={{ color: tone }}>
                {level}
              </span>
            )}
          </span>
          <SkillXpFigure current={figure.current} total={figure.total} maxed={maxed} titleText={figure.titleText} />
        </div>

        {/* No track when there is no level curve. A full-width rail with a
            zero-width fill draws the claim "no progress towards the next
            level", when the state being reported is that there is no level
            table to measure progress against. The level number one line up
            already goes blank rather than printing 0 for the same reason, and
            a bar is as much a number as the number is. */}
        {pct !== null && (
          <div
            className="relative overflow-hidden rounded-full bg-black/55"
            style={{ height: SK_TRACK_H, marginLeft: -SK_CONNECT, width: `calc(100% + ${SK_CONNECT}px)` }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, pct))}%`,
                backgroundColor: tone,
                border: `1px solid ${skillEdge(tone)}`,
              }}
            />
            {/* The crescent the medallion casts onto the bar: a radial gradient
                in the TRACK, centred on the CIRCLE'S centre, opaque out to the
                circle's own radius (all hidden behind it) so the only thing
                that paints is the falloff hugging its outline. That is what a
                raised disc meeting a flat strip actually looks like. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(circle ${SK_HALO_OUT}px at 0px ${SK_HALO_CY}px, rgb(7 8 10 / 0.5) 0px, rgb(7 8 10 / 0.5) ${SK_RADIUS}px, rgb(7 8 10 / 0) ${SK_HALO_OUT}px)`,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

const SkillRow: React.FC<{
  label: string;
  xp: number;
  defs: SkillDefs | null;
  resourceKey: string;
  icons: SkillIconMap | null;
}> = ({ label, xp, defs, resourceKey, icons }) => {
  const def = defs?.[resourceKey];
  const iconTitle = icons?.[resourceKey.toLowerCase().replace(/_/g, " ")];

  // The payload stated this skill but the level tables do not know it (a
  // skill younger than the cached resource, say). XP is a fact we hold, a
  // level is not, so only the fact is shown: no level number, and no track,
  // because a progress bar with nothing to measure against is a claim rather
  // than a reading.
  if (!def) {
    return (
      <SkillMedallionRow
        name={label}
        level={null}
        pct={null}
        maxed={false}
        iconTitle={iconTitle}
        figure={{
          current: null,
          total: coins(xp),
          titleText: `${Math.round(xp).toLocaleString()} XP, no level table for this skill yet`,
        }}
      />
    );
  }

  const p = skillProgress(xp, def);
  return (
    <SkillMedallionRow
      name={def.name}
      level={p.level}
      pct={p.maxed ? 100 : ((p.xpForNext ?? 0) > 0 ? (p.xpInto / (p.xpForNext ?? 1)) * 100 : 0)}
      maxed={p.maxed}
      iconTitle={iconTitle}
      figure={{
        current: p.maxed ? null : coins(p.xpInto),
        total: p.maxed ? coins(xp) : coins(p.xpForNext ?? 0),
        titleText: `${Math.round(xp).toLocaleString()} XP total`,
      }}
    />
  );
};

/**
 * The skills band. Every skill the profile payload states, levelled against
 * Hypixel's own published curves - fetched and cached, never hardcoded, so a
 * cap raise or a new skill costs a cache expiry rather than a wrong number.
 * A skill the payload does not state is absent, not level zero.
 */
const SkillsSection: React.FC<{ facts: ProfileFacts }> = ({ facts }) => {
  const { defs, status, error } = useSkillDefs();
  const { icons } = useSkillIcons();

  // The wiki's icon table, requested here because this is the one surface
  // that draws it. Coalesced and day-cached like every other slow resource.
  useEffect(() => {
    requestSkillIcons();
  }, []);

  /**
   * The SkyBlock level, drawn only when the payload states `leveling`
   * experience. The arithmetic is the game's own and fixed - every level
   * costs 100 XP - so this is division, not a fetched ladder, and a profile
   * without the field simply has no bar rather than a level 0.
   */
  const levelXp = facts.levelXp;

  /**
   * Resource order first, because Hypixel lists the skills the way the game's
   * own menu does; anything the payload states beyond the resource lands at
   * the end rather than being dropped.
   */
  const rows = useMemo(() => {
    const stated = new Map(Object.entries(facts.skillXp).map(([key, xp]) => [memberSkillKey(key), xp] as const));
    const out: Array<{ resourceKey: string; label: string; xp: number }> = [];
    if (defs) {
      for (const key of Object.keys(defs)) {
        const xp = stated.get(key);
        if (xp === undefined) continue;
        out.push({ resourceKey: key, label: defs[key].name, xp });
        stated.delete(key);
      }
    }
    for (const [key, xp] of stated) out.push({ resourceKey: key, label: prettify(key), xp });
    return out;
  }, [facts, defs]);

  if (rows.length === 0) return null;

  /*
   * Bare on the glass, no panel box (bench architecture): the curtain IS the
   * content surface, and boxing the skills would put a card on the one page
   * whose design is "one sheet, content sits on it". The provenance line
   * keeps its place, right-aligned above the band.
   */
  return (
    <div className="space-y-3">
      {!defs && status === "loading" && (
        <p className="text-[11px] text-slate-400">Reading Hypixel&rsquo;s level tables.</p>
      )}
      {!defs && status === "error" && (
        <p className="text-[11px] text-amber-400/90">
          Hypixel&rsquo;s level tables could not be read, so XP is shown without levels. {error}
        </p>
      )}

      {/* The full-width SkyBlock level bar, above the skill columns, where
          SkyCrypt puts it. Present only when the payload stated it. The level
          has no cap, so it never wears gold. */}
      {levelXp !== null && (
        <SkillMedallionRow
          name="SkyBlock Level"
          level={Math.floor(levelXp / 100)}
          pct={levelXp % 100}
          maxed={false}
          /* The game's own icon for SkyBlock leveling; without one the
             medallion is a bare disc and reads as a missing image. */
          iconTitle="Experience Bottle"
          figure={{
            current: String(levelXp % 100),
            total: "100",
            titleText: `${levelXp.toLocaleString()} XP total`,
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-x-8 gap-y-3 lg:grid-cols-2">
        {rows.map((row) => (
          <SkillRow
            key={row.resourceKey}
            label={row.label}
            xp={row.xp}
            defs={defs}
            resourceKey={row.resourceKey}
            icons={icons}
          />
        ))}
      </div>
    </div>
  );
};

/** One stable empty, so the keyless render does not re-run the valuation memo every frame. */
const NO_CHESTS: IslandChest[] = [];

/* --- the summary line ---------------------------------------------------- */

/**
 * One fact of the summary line: label, value, and an info glyph whose hover
 * carries the exact figure or the honest caveat. SkyCrypt renders this as one
 * inline text line rather than tiles, and the standing rule is structural
 * parity (familiarity helps users learn guis better and faster), so ours is
 * the same line in kit type: the micro-label for the name and mono figures
 * for the value, the same pair the Stat tiles wear, so the line and the tiles
 * read as one system. The label carries no colon because uppercase mono
 * already brackets it as a label. Facts the data does not state simply do not
 * appear; nothing here defaults to zero.
 */
const SummaryItem: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <span className="inline-flex items-center gap-1.5">
    <span className={LABEL}>{label}</span>
    <span className={`text-[12px] ${NUM} text-slate-100`}>{value}</span>
    {hint && (
      <span title={hint} className="cursor-help">
        <Info className="h-3 w-3 text-slate-600 hover:text-slate-400" aria-label={hint} />
      </span>
    )}
  </span>
);

const SummaryLine: React.FC<{ items: Array<{ label: string; value: React.ReactNode; hint?: string }> }> = ({
  items,
}) => {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
      {items.map((item) => (
        <SummaryItem key={item.label} label={item.label} value={item.value} hint={item.hint} />
      ))}
    </div>
  );
};

/* --- section navigation -------------------------------------------------- */

/**
 * The section tabs.
 *
 * The sections were once a row of pill anchors over one long page; they
 * are real tabs today. SkyCrypt switches content per tab and
 * so do we now: one section on screen at a time, in the exact underline tab
 * language the site's own Island | Accessories sub-nav already speaks (13px,
 * emerald underline on the active tab), so the page's tabs and the nav's tabs
 * read as one system. Accessories is a real page of its own, so its tab is a
 * link out, drawn in the same row and never marked active here.
 *
 * The active tab lives in the URL (`?tab=`), so a reload, a share or the back
 * button lands where you were. Selection pushes history rather than replacing
 * it, which makes the back button walk your tab trail the way it walks pages.
 */
/**
 * A tab is a section (`id`) or a link out to a page of its own (`to`), so the
 * row can hold Accessories in SkyCrypt's slot - second, between Gear and Pets
 * - rather than exiled to the end. A link tab is never marked active here.
 */
interface TabDef {
  id?: string;
  label: string;
  to?: string;
}

/*
 * The masthead's own tab treatment, one level down (the glass re-vamp's
 * law: underline everywhere, no border around the active tab): chrome
 * face, weight says current (800 on, 700 off), white text over an
 * emerald-400 rule. One language for every tab strip on the site.
 */
const TAB_BASE =
  "flex h-9 shrink-0 cursor-pointer items-center border-b-2 [font-family:var(--font-chrome)] text-[13px] tracking-[0.02em] transition-colors";
const TAB_ACTIVE = "border-emerald-400 font-extrabold text-slate-50";
const TAB_IDLE = "border-transparent font-bold text-slate-300 hover:text-slate-50";

const SectionTabs: React.FC<{ tabs: TabDef[]; active: string; onSelect: (id: string) => void }> = ({
  tabs,
  active,
  onSelect,
}) => {
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());
  const selectableTabs = tabs.filter((tab): tab is TabDef & { id: string } => Boolean(tab.id) && !tab.to);
  const focusableTabId = selectableTabs.find((tab) => tab.id === active)?.id ?? selectableTabs[0]?.id;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, id: string): void => {
    const currentIndex = selectableTabs.findIndex((tab) => tab.id === id);
    const nextIndex = sectionTabNavigationIndex(event.key, currentIndex, selectableTabs.length);
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = selectableTabs[nextIndex];
    if (!nextTab) return;
    onSelect(nextTab.id);
    tabRefs.current.get(nextTab.id)?.focus();
  };

  return (
    <div role="tablist" aria-label="Profile sections" className="flex flex-wrap items-center gap-x-4 border-b border-white/10">
    {tabs.map((tab) =>
      tab.to ? (
        <Link key={tab.label} to={tab.to} className={`-mb-px ${TAB_BASE} ${TAB_IDLE}`}>
          {tab.label}
        </Link>
      ) : (
        <button
          key={tab.id ?? tab.label}
          ref={(element) => {
            if (!tab.id) return;
            if (element) tabRefs.current.set(tab.id, element);
            else tabRefs.current.delete(tab.id);
          }}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          tabIndex={tab.id === focusableTabId ? 0 : -1}
          onKeyDown={(event) => {
            if (tab.id) handleTabKeyDown(event, tab.id);
          }}
          onClick={() => tab.id && onSelect(tab.id)}
          className={`-mb-px ${TAB_BASE} ${tab.id === active ? TAB_ACTIVE : TAB_IDLE}`}
        >
          {tab.label}
        </button>
      )
    )}
    </div>
  );
};

const PROFILE_TAB_DEFS: TabDef[] = [
  { id: "gear", label: "Gear" },
  { id: "accessories", label: "Accessories" },
  { id: "pets", label: "Pets" },
  { id: "minions", label: "Minions" },
  { id: "inventory", label: "Inventory" },
  { id: "networth", label: "Network" },
];

/*
 * There is deliberately NO wearing strip beside the model any more: the sharp
 * channel holds the player and nothing else, which is also the mock's own
 * rule. Worn armor lives where the Gear tab already shows it. The hover
 * preview that used the strip as its surface went with it.
 */

/* --- gear and pets, from the keyed API pull ----------------------------- */

/**
 * One gear piece on its rarity tile.
 *
 * The slot language of the profile, taken from SkyCrypt's wardrobe: a rounded
 * translucent tint of the piece's rarity, from the kit's RARITY_TILE map, at
 * the UPGRADED rarity when the stack is recombed - a recombed legendary IS
 * mythic in game, and SkyCrypt's pink-among-orange tiles are exactly that.
 * Rarity comes from the item index by id and is never guessed; a piece the
 * index does not know keeps the neutral cell.
 */
const RarityCell: React.FC<{ item: GearItem; context: SlotContext }> = ({ item, context }) => {
  const baseTier = context.tierOf(item.id);
  const tier = recombTier(baseTier, item.extra?.recomb ?? false);
  return (
    <ItemTooltip
      id={item.id}
      name={item.name}
      count={item.count}
      extra={item.extra}
      tier={baseTier}
      lore={item.lore}
      provenance={context.provenance}
      unitPrice={context.priceOf(item.id)}
      icon={<SlotIcon name={item.name} id={item.id} size={32} />}
      ariaLabel={`${item.name}: show item details`}
      wrapperClassName="block aspect-square"
    >
    <button type="button" className={`group relative flex h-full w-full items-center justify-center rounded-md border ${FOCUS} ${rarityTileClass(tier)}`}>
      {/* 32 is an exact halving of the 64px wiki thumbs; any other size puts
          the pixel art through a non-integer nearest-neighbour resample and it
          smears. One sprite size for every gear cell is also what keeps the
          worn clusters, the wardrobes and the loadout columns reading as one
          field rather than three. */}
      <SlotIcon name={item.name} id={item.id} size={32} />
    </button>
    </ItemTooltip>
  );
};

/**
 * An empty gear slot, on the same rounded geometry the rarity tiles wear, in
 * the quietest glass: the hairline at the structural weight, the fill a step
 * under the occupied neutral cell so absence stays visibly dimmer than an
 * item whose tier is merely unknown.
 */
const WARDROBE_STATE_LABEL: Record<GearWardrobeState, string> = {
  occupied: "Occupied",
  "unlocked-empty": "Unlocked empty",
  locked: "Locked",
  private: "Private / unavailable",
};

/**
 * An empty gear slot keeps the same frosted square geometry as an item tile.
 * State is explicit for wardrobe slots; ordinary worn-slot gaps use the quiet
 * default label because their positional unlock state is not in the payload.
 */
const EmptyGearCell: React.FC<{
  state?: Exclude<GearWardrobeState, "occupied">;
  label?: string;
}> = ({ state = "unlocked-empty", label }) => {
  const stateLabel = label ?? WARDROBE_STATE_LABEL[state];
  const unavailable = state === "locked" || state === "private";
  return (
    <div
      data-gear-slot-state={state}
      aria-label={stateLabel}
      title={stateLabel}
      className={
        "flex aspect-square items-center justify-center rounded-md border " +
        (unavailable
          ? "border-slate-800/70 bg-black/30 text-slate-600"
          : "border-slate-600/45 bg-slate-950/25")
      }
    >
      {unavailable ? (
        <LockKeyhole size={15} strokeWidth={1.6} aria-hidden />
      ) : (
        <span className="relative block h-5 w-4 opacity-55" aria-hidden>
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-[1px] border-2 border-slate-400/80" />
          <span className="absolute inset-x-0 bottom-0 h-2 rounded-[1px] border-2 border-slate-400/80 border-t-0" />
        </span>
      )}
    </div>
  );
};

/** One in-game-style four-slot vertical group. */
const GearColumn: React.FC<{
  label?: string;
  items: readonly (GearItem | null)[];
  context: SlotContext;
  note?: string;
}> = ({ label, items, context, note }) => (
  <div className="min-w-11" role="group" aria-label={label ?? note ?? "Gear slots"}>
    {label && <div className={LABEL}>{label}</div>}
    <div className={(label ? "mt-1.5 " : "") + "grid w-11 grid-rows-4 gap-1"}>
      {Array.from({ length: 4 }, (_, index) =>
        items[index] ? (
          <RarityCell key={index} item={items[index]!} context={context} />
        ) : (
          <EmptyGearCell key={index} label="Empty slot" />
        )
      )}
    </div>
  </div>
);

/** One display-ready set: the payload's own id plus its mapped pieces. */
interface DisplaySet {
  id: number;
  pieces: readonly (GearItem | null)[];
}

/** A wardrobe set as a coherent vertical column, including explicit gaps. */
const WardrobeColumn: React.FC<{
  sectionLabel: string;
  slot: GearWardrobeSlot;
  context: SlotContext;
}> = ({ sectionLabel, slot, context }) => {
  const stateLabel = WARDROBE_STATE_LABEL[slot.state];
  const groupLabel = sectionLabel + " set " + (slot.id ?? "unknown") + ": " + stateLabel;
  const emptyState = slot.state === "locked" ? "locked" : slot.state === "private" ? "private" : "unlocked-empty";
  return (
    <div
      role="group"
      aria-label={groupLabel}
      data-wardrobe-state={slot.state}
      className="w-11 shrink-0" data-wardrobe-set-id={slot.id ?? "private"} data-wardrobe-slot-size="44"
    >
      <div className="grid w-11 grid-rows-4 gap-1">
        {Array.from({ length: 4 }, (_, index) => {
          const piece = slot.pieces[index] ?? null;
          return piece ? (
            <RarityCell key={index} item={piece} context={context} />
          ) : (
            <EmptyGearCell
              key={index}
              state={emptyState}
              label={groupLabel + ", slot " + (index + 1)}
            />
          );
        })}
      </div>
    </div>
  );
};

/** Render numbered wardrobe columns in API order, nine per structural row. */
const WardrobeGrid: React.FC<{
  title: string;
  rows: readonly GearWardrobeRow[];
  context: SlotContext;
  emptyMessage: string;
}> = ({ title, rows, context, emptyMessage }) => (
  <div>
    <div className={LABEL}>{title}</div>
    {rows.length === 0 ? (
      <p className="mt-1.5 text-[11px] text-slate-500">{emptyMessage}</p>
    ) : (
      <div className="mt-1.5 w-max max-w-full space-y-2" data-wardrobe-grid={title} data-wardrobe-rows={rows.length}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid w-max min-w-0 grid-cols-[repeat(3,max-content)] items-start justify-start justify-items-start gap-x-2 gap-y-1.5 sm:grid-cols-[repeat(6,max-content)] lg:grid-cols-[repeat(9,max-content)]"
            role="group"
            aria-label={title + " row " + (rowIndex + 1)} data-wardrobe-row={rowIndex + 1}
          >
            {row.slots.map((slot) => (
              <WardrobeColumn key={slot.id ?? "private"} sectionLabel={title} slot={slot} context={context} />
            ))}
          </div>
        ))}
      </div>
    )}
  </div>
);

const PrivateWardrobeNotice: React.FC<{ title: string }> = ({ title }) => (
  <div
    data-wardrobe-state="private"
    aria-label={title + ": private / unavailable"}
    className="rounded-md border border-slate-800/70 bg-black/20 px-2.5 py-2"
  >
    <div className={LABEL}>{title}</div>
    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
      <LockKeyhole size={14} strokeWidth={1.6} aria-hidden />
      <span>Private / unavailable</span>
    </div>
  </div>
);
const TUNING_STATS: ReadonlyArray<{ key: string; label: string; glyph: string; color: string }> = [
  { key: "health", label: "Health", glyph: "❤", color: "text-stat-red" },
  { key: "defense", label: "Defense", glyph: "❈", color: "text-stat-green" },
  { key: "walk_speed", label: "Speed", glyph: "✦", color: "text-stat-white" },
  { key: "strength", label: "Strength", glyph: "❁", color: "text-stat-red" },
  { key: "critical_chance", label: "Crit Chance", glyph: "☣", color: "text-stat-blue" },
  { key: "critical_damage", label: "Crit Damage", glyph: "☠", color: "text-stat-blue" },
  { key: "attack_speed", label: "Attack Speed", glyph: "⚔", color: "text-stat-yellow" },
  { key: "intelligence", label: "Intelligence", glyph: "✎", color: "text-stat-aqua" },
];

const TuningTable: React.FC<{ allocation: Record<string, number> }> = ({ allocation }) => {
  const rows = TUNING_STATS.filter((stat) => (allocation[stat.key] ?? 0) > 0);
  if (rows.length === 0) {
    return (
      <div className="min-w-[7rem]">
        <div className={LABEL}>Tuning</div>
        <div className="mt-1 text-[11px] text-slate-400">No points allocated</div>
      </div>
    );
  }
  return (
    <div className="min-w-[7rem]">
      <div className={LABEL}>Tuning</div>
      <div className="mt-1">
        {rows.map((stat) => (
          <div key={stat.key} className="flex items-baseline gap-1.5 py-px text-[11px]">
            <span className={`${stat.color} shrink-0`} aria-hidden>
              {stat.glyph}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-300">{stat.label}</span>
            <span className={`shrink-0 ${NUM} text-slate-100`}>{allocation[stat.key]}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const DetailChip: React.FC<{ label: string; value: string; title?: string }> = ({ label, value, title }) => (
  <span title={title} className="inline-flex min-w-0 items-baseline gap-1.5 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px]">
    <span className={`${LABEL} shrink-0`}>{label}</span>
    <span className="min-w-0 truncate font-semibold text-slate-200">{value}</span>
  </span>
);

const ActiveLoadoutSummary: React.FC<{
  armor: GearItem[];
  wornEquipment: (GearItem | null)[];
  activePet: PetTile | null;
  activeLoadout: LoadoutStatement | null;
  allocation?: Record<string, number>;
  selectedPower: string | null;
  context: SlotContext;
}> = ({ armor, wornEquipment, activePet, activeLoadout, allocation, selectedPower, context }) => {
  const power = activeLoadout?.powerStone ?? selectedPower;
  return (
    <div className="border-b border-white/8 pb-3">
      <div className="grid items-start gap-3 sm:grid-cols-[auto_auto_minmax(12rem,1fr)]">
        <GearColumn label="Armour" items={armor} context={context} note="Current armour" />
        <GearColumn label="Equipment" items={wornEquipment} context={context} note="Current equipment" />
        <div className="min-w-0 space-y-2 border-white/8 sm:border-l sm:pl-3" role="group" aria-label="Active loadout details">
          <div>
            <div className={LABEL}>Loadout</div>
            <div className="mt-1 truncate text-[12px] font-semibold text-slate-200">
              {activeLoadout?.name ?? "Not uniquely identified"}
            </div>
          </div>
          {activePet ? (
            <div
              className="flex min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5"
              aria-label={"Active pet: " + activePet.name + ", level " + activePet.level}
            >
              <SlotIcon name={activePet.iconName} hypixelId={activePet.packId} size={24} />
              <span className="min-w-0 truncate text-[11px] font-semibold">
                <span className={RARITY[activePet.tier] ?? "text-slate-200"}>{activePet.name}</span>
                <span className={`${NUM} ml-1 text-slate-400`}>Lvl {activePet.level}</span>
              </span>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500">No summoned pet</div>
          )}
          {power && <DetailChip label="Power" value={prettify(power)} />}
          {allocation !== undefined && <TuningTable allocation={allocation} />}
        </div>
      </div>
    </div>
  );
};
/**
 * One named loadout, vertical, as the payload states it: the armor set and
 * equipment set it references (columns of four), the pet it summons, the
 * power stone it applies, the tuning slot it switches to. Hypixel's payload
 * genuinely carries all of this (`loadout.loadouts.{n}`); what a loadout does
 * not state simply does not render, and a loadout with only a name says so.
 * SkyCrypt's cards also chip HotM and HotF trees; our payload's loadouts do
 * not state them, so no such chips are drawn.
 */
const LoadoutCard: React.FC<{
  loadout: LoadoutStatement;
  armorSetById: ReadonlyMap<number, DisplaySet>;
  equipmentSetById: ReadonlyMap<number, DisplaySet>;
  petByUuid: ReadonlyMap<string, PetTile>;
  tuning: Record<string, Record<string, number>>;
  context: SlotContext;
  active?: boolean;
}> = ({ loadout, armorSetById, equipmentSetById, petByUuid, tuning, context, active = false }) => {
  const armor = loadout.armorSetId !== null ? armorSetById.get(loadout.armorSetId) : undefined;
  const equipment = loadout.equipmentSetId !== null ? equipmentSetById.get(loadout.equipmentSetId) : undefined;
  const pet = loadout.petUuid !== null ? petByUuid.get(loadout.petUuid) : undefined;
  const allocation = loadout.tuningSlot !== null ? tuning["slot_" + loadout.tuningSlot] : undefined;
  const empty = !armor && !equipment && !pet && !loadout.powerStone && allocation === undefined;

  return (
    <div className={TILE + " p-2.5 " + (active ? "border-cyan-300/50 bg-cyan-300/5" : "")}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[12px] text-slate-200">{loadout.name}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {active && <Tag title="Resolved from the profile's active loadout signals.">active</Tag>}
          {loadout.powerStone && (
            <Tag title="The accessory power this loadout switches to.">{prettify(loadout.powerStone)}</Tag>
          )}
        </span>
      </div>
      {empty ? (
        <p className="mt-1.5 text-[11px] text-slate-500">Nothing assigned to this loadout.</p>
      ) : (
        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-2">
          {armor && <GearColumn label="Armour" items={armor.pieces} context={context} />}
          {equipment && <GearColumn label="Equipment" items={equipment.pieces} context={context} />}
          <div className="min-w-0 flex-1 space-y-2">
            {pet && (
              <div
                className="flex items-center gap-1.5"
                aria-label={"Pet: " + pet.name + ", level " + pet.level}
              >
                <SlotIcon name={pet.iconName} hypixelId={pet.packId} size={16} />
                <span className={"min-w-0 truncate text-[11px] " + (RARITY[pet.tier] ?? "text-slate-200")}>{pet.name}</span>
                <span className={"shrink-0 text-[10px] " + NUM + " text-slate-500"}>Lvl {pet.level}</span>
              </div>
            )}
            {allocation !== undefined && <TuningTable allocation={allocation} />}
          </div>
        </div>
      )}
    </div>
  );
};
/**
 * Armor, equipment, wardrobes and loadouts, read from the Hypixel profile.
 *
 * These exist because a profile viewer that cannot show what you are wearing
 * is not one. They are API sections, so their freshness is the profile pull's
 * and their absence has API reasons: no key, or the Inventory toggle off. Both
 * get their own sentence; neither is rendered as empty.
 *
 * The shape: worn armor and worn equipment on rarity tiles, each wardrobe as
 * nine-set structural rows of four-slot columns (with explicit gaps), and the
 * named loadouts as vertical cards tying the two to a pet, a power stone and a
 * tuning slot.
 */
const GearSection: React.FC<{
  armor: GearItem[];
  wornEquipment: (GearItem | null)[];
  armorSets: DisplaySet[];
  equipmentSets: DisplaySet[];
  loadouts: LoadoutStatement[];
  petByUuid: ReadonlyMap<string, PetTile>;
  tuning: Record<string, Record<string, number>>;
  selectedPower: string | null;
  equippedEquipmentSetId: number | null;
  inventoryShared: boolean;
  context: SlotContext;
}> = ({
  armor,
  wornEquipment,
  armorSets,
  equipmentSets,
  loadouts,
  petByUuid,
  tuning,
  selectedPower,
  equippedEquipmentSetId,
  inventoryShared,
  context,
}) => {
  const armorSetById = new Map(armorSets.map((set) => [set.id, set]));
  const equipmentSetById = new Map(equipmentSets.map((set) => [set.id, set]));
  const activePet = [...petByUuid.values()].find((pet) => pet.active) ?? null;
  const activeLoadout = resolveActiveLoadout(loadouts, {
    activePetUuid: activePet?.uuid ?? null,
    selectedPower,
    equippedEquipmentSetId,
  });
  const activeAllocation =
    activeLoadout && activeLoadout.tuningSlot !== null
      ? tuning["slot_" + activeLoadout.tuningSlot]
      : undefined;
  const armorRows = buildWardrobeRows(armorSets, { columns: 9 });
  const equipmentRows = buildWardrobeRows(equipmentSets, { columns: 9 });

  return (
    <div className={PANEL}>
      <SectionHead title="Active Loadout" />
      {!inventoryShared ? (
        <div className="space-y-3 p-3">
          <p className="text-[11px] text-amber-400/90">
            Hypixel is not sharing your inventory, so your armour, equipment and saved sets are missing rather than empty.
            Turn Inventory on in game under SkyBlock Menu → Settings → API Settings.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <PrivateWardrobeNotice title="Armour Wardrobe" />
            <PrivateWardrobeNotice title="Equipment Wardrobe" />
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-3">
          <ActiveLoadoutSummary
            armor={armor}
            wornEquipment={wornEquipment}
            activePet={activePet}
            activeLoadout={activeLoadout}
            allocation={activeAllocation}
            selectedPower={selectedPower}
            context={context}
          />

          <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2" data-wardrobe-composition>
            <WardrobeGrid
              title="Armour Wardrobe"
              rows={armorRows}
              context={context}
              emptyMessage="No saved armour sets on this profile."
            />
            <WardrobeGrid
              title="Equipment Wardrobe"
              rows={equipmentRows}
              context={context}
              emptyMessage="No stored equipment sets on this profile."
            />
          </div>

          <div>
            <div className={LABEL}>Loadouts</div>
            {loadouts.length === 0 ? (
              <p className="mt-1.5 text-[11px] text-slate-500">No loadouts on this profile.</p>
            ) : (
              <div className="mt-1.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {loadouts.map((loadout) => (
                  <LoadoutCard
                    key={loadout.id}
                    loadout={loadout}
                    armorSetById={armorSetById}
                    equipmentSetById={equipmentSetById}
                    petByUuid={petByUuid}
                    tuning={tuning}
                    context={context}
                    active={activeLoadout?.id === loadout.id}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="text-[10px] leading-snug text-slate-500">
            A recombed piece wears its upgraded rarity. Empty set keys stay visible so locked, unlocked-empty and private states are not conflated.
          </p>
        </div>
      )}
    </div>
  );
};
/**
 * Pets, as a compact grid of rarity-glass tiles: each pet wears its rarity as
 * its tile, the same map the gear cells draw from, with the icon at the slot
 * sprite step and the name in the game's own rarity colour. The summoned pet
 * says so in a word rather than a colour, because emerald means "matches your
 * search" on this page and rarity owns the rest of the palette.
 */
const PetsSection: React.FC<{
  pets: ReturnType<typeof petTiles>;
}> = ({ pets }) => (
  <div className={PANEL}>
    <SectionHead
      title="Pets"
      right={pets.length > 0 ? <span className={`text-[10px] ${NUM} text-slate-500`}>{pets.length}</span> : undefined}
    />
    {pets.length === 0 ? (
      <p className="px-3 py-2 text-[11px] text-slate-500">No pets on this profile.</p>
    ) : (
      <div className="grid grid-cols-2 gap-1.5 p-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {pets.map((pet) => (
          <div key={pet.key} className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${rarityTileClass(pet.tier)}`}>
            <SlotIcon name={pet.iconName} hypixelId={pet.packId} size={32} />
            <span className="min-w-0 flex-1">
              <span className={`block truncate text-[12px] ${RARITY[pet.tier] ?? "text-slate-200"}`}>{pet.name}</span>
              <span className={`block text-[11px] ${NUM} text-slate-400`}>Lvl {pet.level}</span>
            </span>
            {pet.active && <Tag title="Currently summoned.">summoned</Tag>}
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * A short route to the shared connection controls while no profile is linked.
 */
const ProfileDataState: React.FC<{ status: ProfileStatusView }> = ({ status }) => {
  if (status.showSkeleton) {
    return (
      <div className={PANEL} aria-label="Loading profile data" aria-busy="true">
        <div className="space-y-2 p-3 animate-pulse">
          <div className="h-3 w-32 rounded-sm bg-slate-700/60" />
          <div className="h-10 w-full rounded-sm bg-slate-800/60" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 rounded-sm bg-slate-800/60" />
            <div className="h-16 rounded-sm bg-slate-800/60" />
            <div className="h-16 rounded-sm bg-slate-800/60" />
          </div>
        </div>
      </div>
    );
  }

  if (status.showNoKey) {
    return (
      <div className={PANEL} role="status">
        <SectionHead title="Profile data unavailable" />
        <div className="space-y-2 p-3">
          <p className="text-[12px] text-slate-300">Connect your Minecraft profile in Settings to load this profile section. Unavailable data is not an empty profile.</p>
          <Link to="/settings#hypixel" className={BTN_QUIET}>Open Settings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={PANEL} role={status.showError ? "alert" : "status"}>
      <SectionHead title="Profile data unavailable" />
      <div className="space-y-2 p-3">
        <p className="text-[12px] text-slate-300">{status.label ?? "This profile section could not be loaded."} Unavailable is different from zero.</p>
        <Link to="/profile?tab=gear" className={BTN_QUIET}>Try Profile again</Link>
      </div>
    </div>
  );
};
const HypixelConnectionLink: React.FC = () => {
  const { access } = useApiAccess();
  if (hasApiProfileAccess(access)) return null;

  return (
    <div className={PANEL}>
      <SectionHead title="Hypixel API" right={<span className={LABEL}>optional</span>} />
      <div className="p-3 space-y-2.5">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Connect a Minecraft account to load{" "}
          <span className="text-slate-200">sack totals, networth, armour, saved equipment and pets</span> without the mod. It cannot add
          chests, inventory or ender chest. Hypixel does not publish those at any privacy setting, which is why the mod exists.
        </p>
        <SettingsLink section="hypixel" className={BTN_QUIET}>
          <KeyRound className="w-3 h-3" />
          Connect your profile
        </SettingsLink>
      </div>
    </div>
  );
};

export const IslandPage: React.FC = () => {
  const { snapshot, stored, sections, sources, status, modVersion, lastError, applyCode, refreshApi } =
    useIsland();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [loadedNote, setLoadedNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  /*
   * The sharp channel (the glass re-vamp). The glass curtain's left edge is
   * `--sd-split`, 0 by default; this page opens it, but only when a profile
   * is actually loaded, because the channel exists for the player to stand in
   * and an empty sharp strip beside the import pitch is just lost width. The
   * class lives on <html> so the fixed curtain and the masthead (both outside
   * this component) inherit the variable; index.css owns what it means.
   */
  useEffect(() => {
    document.documentElement.classList.toggle("sd-channel", !!snapshot);
    return () => document.documentElement.classList.remove("sd-channel");
  }, [snapshot]);

  const { activeTab: rememberedProfileTab, urlTab, fromSession, selectTab: selectProfileTab } = useProfileTabs();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectTab = useCallback(
    (id: string) => {
      const canonical: ProfileTab = id === "networth" ? "network" : id as ProfileTab;
      selectProfileTab(canonical);
    },
    [selectProfileTab]
  );
  /**
   * The Inventory tab's sub-section, also in the URL (`?tab=inventory&box=`)
   * so a link to a specific storage surface survives a reload. Selecting a
   * box pins the top tab too, because a box outside the Inventory tab is not
   * a state this page has. The `box` param stays put when the top tab moves
   * away, deliberately: coming back to Inventory restores the surface you
   * were on, and nothing else reads the parameter.
   */
  const selectBox = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", "inventory");
      next.set("box", id);
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  /**
   * Everything the tooltips need, resolved once for the page rather than by
   * each of the several hundred slots. Rarity comes from the crafting index and
   * prices from the bazaar, both already cached by their own hooks.
   */
  const { items: itemIndex } = useRecipes();
  const owned = useOwned({ items: itemIndex });
  const { prices } = useBazaar();
  const { ironman } = useProfile();

  /**
   * The parsed Hypixel profile, for the gear, pet and skill sections. Reads
   * the same store the NetworthPanel fills; deliberately does not trigger a
   * second load. See `useParsedProfile`.
   */
  const profile = useParsedProfile();

  /**
   * The valued profile, for the summary line's Purse / Bank / Networth. This
   * is a SECOND instance of the valuation memo (the NetworthPanel runs its
   * own), which earlier versions took care to avoid; the summary line needs
   * the total at page level and the arithmetic re-runs only when a pull or a
   * chest capture lands, so two memoised runs on those rare occasions is the
   * cheapest honest way to get the number here. The store underneath is one,
   * so no request is ever doubled.
   */
  const networthView = useNetworth(snapshot ? snapshot.chests : NO_CHESTS);

  /**
   * The item resource, requested OUTRIGHT rather than left to lazy discovery.
   *
   * This page renders the widest spread of raw ids anywhere on the site, and
   * several of its grids carry names the wiki has no file for (the valuation
   * names an enchanted book by its enchant, a pet by its level line). Those
   * tiles resolve through the resource rungs - Hypixel's own name for the id,
   * and the head render - so waiting for each icon to exhaust its guesses
   * first paints a wall of blanks and then fixes it. ForgePage learned the
   * same lesson for the same reason; the request is a no-op when fresh.
   */
  useSyncExternalStore(subscribeItemResource, itemResourceVersion, itemResourceVersion);
  useEffect(() => {
    requestItemResource();
  }, []);

  /** The skill level tables, same discipline: cached a day, requested once. */
  useEffect(() => {
    requestSkillDefs();
  }, []);

  // The index is keyed by our internal key, while island data speaks Hypixel
  // ids, so this is the same translation `sackLookup` does, built once.
  const tierByHypixelId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of Object.values(itemIndex)) {
      if (item.hypixelId && item.tier) map.set(item.hypixelId, item.tier);
    }
    return map;
  }, [itemIndex]);

  /** The rarity lookup the Networth panel's grids share, one function for the whole page. */
  const tierOf = useCallback((id: string) => tierByHypixelId.get(id) ?? resourceTierFor(id), [tierByHypixelId]);

  /**
   * NPC unit prices by Hypixel id, for the networth panel's NPC sell row.
   * Zero is dropped here rather than downstream because a merchant paying
   * nothing and a merchant not buying are the same fact to a seller.
   */
  const npcByHypixelId = useMemo(() => {
    const map = new Map<string, { unit: number; name: string }>();
    for (const item of Object.values(itemIndex)) {
      if (item.hypixelId && typeof item.npcSell === "number" && item.npcSell > 0) {
        map.set(item.hypixelId, { unit: item.npcSell, name: item.name });
      }
    }
    return map;
  }, [itemIndex]);
  /**
   * Which sack owns which item, read off the wiki at runtime.
   *
   * The membership table is wiki content, so it is fetched rather than bundled,
   * exactly like the crafting index. The index it feeds is composed here
   * because it needs both halves: the article supplies the names, and the item
   * index supplies the Hypixel ids those names correspond to.
   */
  const { defs: sackDefs, loading: sacksLoading, error: sacksError } = useSackDefinitions();
  const sackIndex = useMemo(() => buildSackIndex(sackDefs, itemIndex), [sackDefs, itemIndex]);

  // Chests open, because seeing every chest at once is the point of the board.
  // Sacks closed, because two dozen sacks of item rows is a scroll, not a board.
  const chestCollapse = useCollapsed(false);
  const sackCollapse = useCollapsed(true);

  /**
   * The mod is probed on mount and the first attempt has a 2.5 s deadline, so
   * for a moment we genuinely do not know whether it is there. Saying "no data"
   * during that window would be a guess that flickers.
   */
  const [probed, setProbed] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setProbed(true), 3_000);
    return () => clearTimeout(t);
  }, []);

  /**
   * One unforced API pull on arrival. It is a no-op without a stored key, and a
   * no-op again if the last pull is under five minutes old, so this is at most
   * one request per visit - a request the player asked for by saving a key.
   * Nothing here polls.
   */
  useEffect(() => {
    void refreshApi();
  }, [refreshApi]);

  const needle = query.trim().toLowerCase();
  const live = status === "live";

  /** Every valid sack counter, including the API's known-empty zero rows. */
  const sackEntries = useMemo(() => liveSackEntries(snapshot?.sacks), [snapshot]);

  /**
   * Those entries, filed under the sack that owns them.
   *
   * A search narrows the rows inside each group and drops a group with nothing
   * left, which is the same rule the chest board follows: the question is where
   * an item is, so a sack that cannot answer it should not be occupying a
   * column.
   */
  const sackViews = useMemo<SackView[]>(() => {
    const groups = groupSacks(sackEntries, sackIndex);
    if (!needle) return groups.map((group) => ({ group, rows: group.rows, hits: 0 }));

    const out: SackView[] = [];
    for (const group of groups) {
      const rows = group.rows.filter((r) => matches(r, needle));
      if (rows.length > 0) out.push({ group, rows, hits: rows.length });
    }
    return out;
  }, [sackEntries, sackIndex, needle]);

  /**
   * The NPC sell aggregation for the networth panel: every stack, everywhere,
   * priced at what a merchant pays. Built here because this page is the one
   * place holding both the merged snapshot and the item index. Null without a
   * snapshot, so the row can say "needs your island data" instead of a zero.
   */
  const npcSell = useMemo(() => {
    if (!snapshot) return null;
    const clean = (list?: IslandItem[]) => (list ? withoutChrome(list) : []);
    return npcSellSummary(
      [
        { label: "sacks", items: sackEntries },
        { label: "chests", items: snapshot.chests.flatMap((chest) => withoutChrome(chest.items)) },
        { label: "inventory", items: clean(snapshot.inventory) },
        { label: "ender chest", items: clean(snapshot.enderChest) },
        { label: "backpacks", items: clean(snapshot.storage) },
      ],
      (id) => npcByHypixelId.get(id)?.unit ?? null,
      (id) => npcByHypixelId.get(id)?.name ?? null
    );
  }, [snapshot, sackEntries, npcByHypixelId]);

  /** Only chests with a hit survive a search; without one, every chest is listed. */
  const chestViews = useMemo<ChestView[]>(() => {
    if (!snapshot) return [];

    const out: ChestView[] = [];
    for (const chest of snapshot.chests) {
      const clean = withoutChrome(chest.items);
      const rows = rollup(chest.items);
      const hits = needle ? rows.filter((r) => matches(r, needle)).length : 0;
      if (needle && hits === 0) continue;
      out.push({
        chest,
        key: chest.pos.join(","),
        hits,
        occupied: clean.length,
        total: clean.reduce((sum, i) => sum + i.count, 0),
      });
    }
    return out;
  }, [snapshot, needle]);

  const totalMatches = useMemo(() => {
    if (!snapshot || !needle) return 0;
    const flat = withoutChrome(
      [snapshot.inventory, snapshot.enderChest, snapshot.storage].filter((l): l is IslandItem[] => Array.isArray(l)).flat()
    );
    const sackHits = sackViews.reduce((n, v) => n + v.rows.length, 0);
    return sackHits + chestViews.length + flat.filter((i) => matches(i, needle)).length;
  }, [snapshot, needle, sackViews, chestViews]);

  const onLoad = async () => {
    setBusy(true);
    setPasteError(null);
    setLoadedNote(null);
    try {
      const next = await applyCode(code);
      const items = next.chests.reduce((n, c) => n + c.items.length, 0);
      setLoadedNote(
        `${next.player.name || "Unknown player"} · ${next.profile.name || "profile"} · ` +
          `${Object.keys(next.sacks).length} sack entries, ${next.chests.length} chests, ${items} chest items · ` +
          `exported ${ago(next.exportedAt)}`
      );
      setCode("");
    } catch (e) {
      setPasteError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The tooltip context for each section, built once.
   *
   * `provenance` differs per section, so there is one of these per section
   * rather than one for the page. Prices are nulled out wholesale on Ironman:
   * there is no bazaar there, so a coin figure would be a number the player
   * cannot act on, and the tooltip drops the row entirely rather than showing
   * an unusable one.
   *
   * Memoised because this is a prop on every one of the page's thousand-odd
   * slots. Built inline it minted a new object on every render, which silently
   * defeated `Slot`'s own memo: the object was never equal to the last one, so
   * every cell re-rendered regardless.
   */
  const contexts = useMemo(() => {
    const priceOf = (id: string) => (ironman ? null : prices[id]?.buy ?? null);
    const make = (provenance: SectionProvenance): SlotContext => ({
      tierOf,
      priceOf,
      provenance: describeSection(provenance, live) || null,
    });

    return {
      chests: make(sections.chests),
      inventory: make(sections.inventory),
      enderChest: make(sections.enderChest),
      storage: make(sections.storage),
      // The API-side gear sections have no SectionProvenance; their origin is
      // the profile pull, phrased the same way the section headings phrase it.
      gear: {
        tierOf,
        priceOf,
        provenance:
          profile.fetchedAt !== null ? `from ${SOURCE_LABEL.api}, ${ago(profile.fetchedAt)}` : `from ${SOURCE_LABEL.api}`,
      } satisfies SlotContext,
    };
  }, [tierOf, prices, ironman, live, sections, profile.fetchedAt]);

  /** The gear and pet lists, mapped once per profile pull rather than per render. */
  const armor = useMemo(() => armorItems(profile.parsed?.armor), [profile.parsed]);
  const pets = useMemo(() => petTiles(profile.parsed?.pets), [profile.parsed]);

  /**
   * The stored sets and loadouts, mapped to drawable pieces once per pull.
   * Ids are the payload's own set numbers, because the loadouts reference
   * sets by id and a positional label would point at the wrong set the
   * moment one is missing from the sequence.
   */
  const gearLoadouts = profile.gearLoadouts;
  const armorSets = useMemo(
    () =>
      gearLoadouts.armorSets.map((set) => ({
        id: set.id,
        pieces: set.pieces.map((piece) => (piece ? rawToGearItem(piece) : null)),
      })),
    [gearLoadouts]
  );
  const equipmentSets = useMemo(
    () =>
      gearLoadouts.equipmentSets.map((set) => ({
        id: set.id,
        pieces: set.pieces.map((piece) => (piece ? rawToGearItem(piece) : null)),
      })),
    [gearLoadouts]
  );
  const wornEquipment = useMemo(
    () => gearLoadouts.wornEquipment.map((piece) => (piece ? rawToGearItem(piece) : null)),
    [gearLoadouts]
  );

  /** Pets by uuid, for the loadout cards' pet references. Uuid IS the tile key when the payload states one. */
  const petByUuid = useMemo(() => new Map(pets.map((pet) => [pet.key, pet])), [pets]);

  /** The skill defs, for the band's average; the section reads its own copy. */
  const { defs: skillDefs } = useSkillDefs();

  /* --- header right-hand connection and freshness ------------------------- */

  /**
   * Freshness lives in the header because it is a fact about the whole page:
   * the mod's connection state, then the age of whatever the API added. This
   * is the one honesty line that must never scroll away with a section.
   */
  /* The pulse encodes a real, changing fact: data is arriving right now.
     Gated on motion-safe so it simply stops for anyone who asked it to. */
  const liveBadge = live ? (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
      <span className="relative flex w-2 h-2">
        <span className="motion-safe:animate-ping absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
      </span>
      {modVersion ? `Live, mod ${modVersion}` : "Live"}
    </span>
  ) : undefined;

  /* The import pitch's status, where the mod probe is the only signal there
     is. The loaded page does not repeat it: freshness lives in the masthead. */
  const connection = (
    <span className="flex flex-col items-end gap-0.5">
      {live ? (
        liveBadge
      ) : stored ? (
        <span className="text-[11px] text-slate-500">snapshot from {ago(stored.receivedAt)}</span>
      ) : !probed ? (
        <span className="text-[11px] text-slate-500">looking for the mod…</span>
      ) : (
        <span className="text-[11px] text-slate-500">no mod detected</span>
      )}
    </span>
  );

  const profileFreshness = (
    <span className="flex min-w-[9rem] flex-col items-end gap-0.5 text-right text-[10px] text-slate-500" data-profile-freshness aria-label="Profile data freshness">
      <span>{profile.fetchedAt !== null ? `API ${ago(profile.fetchedAt)}` : sources.api !== null ? `API ${ago(sources.api)}` : "API unavailable"}</span>
      <span>{live ? (modVersion ? `Mod live ${modVersion}` : "Mod live") : sources.mod !== null ? `Mod ${ago(sources.mod)}` : "Mod unavailable"}</span>
    </span>
  );

  /* --- the paste box, which is present in every state -------------------- */

  const pasteBox = (
    <div className={PANEL}>
      <SectionHead title="Paste an island code" right={<span className={LABEL}>/skydex copy</span>} />
      <div className="p-3 space-y-2">
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={3}
          spellCheck={false}
          placeholder="SKYDEX-…"
          className={`${INPUT} w-full resize-y font-mono leading-snug`}
        />
        <div className="flex items-center gap-2 flex-wrap">
          <button className={BTN_PRIMARY} onClick={onLoad} disabled={busy || code.trim() === ""}>
            {busy ? "Loading…" : "Load"}
          </button>

        </div>

        {pasteError && (
          <p className="text-[11px] text-red-400 border-l-2 border-red-500/50 pl-2" role="alert">
            {pasteError}
          </p>
        )}
        {loadedNote && <p className="text-[11px] text-emerald-300">Loaded {loadedNote}</p>}
      </div>
    </div>
  );

  /* --- empty state ------------------------------------------------------- */

  if (!snapshot) {
    // A bare /island route still belongs to island-code onboarding. A URL tab
    // or an unexpired session tab is an explicit request for Profile instead.
    const requestedProfileTab = urlTab !== null || fromSession ? rememberedProfileTab : null;

    /*
     * The accessories catalogue needs no snapshot and no key, and the old
     * `/accessories` address redirects to `?tab=accessories`, so that deep
     * link must land on accessories content even before any island data
     * exists. Without this branch a redirected bookmark would land on the
     * onboarding pitch instead of the page it named.
     */
    if (requestedProfileTab === "minions") {
      return (
        <div className="mx-auto w-full max-w-[120rem] p-4 space-y-3">
          <PageHeader
            title="Minions"
            sub="Every current minion family, selected profile tiers, and one honest upgrade plan."
            icon={Sparkles}
            actions={connection}
          />
          <React.Suspense
            fallback={
              <p className="rounded border border-white/10 bg-slate-950/30 p-3 text-[11px] text-slate-400" role="status">
                Loading minion catalogue...
              </p>
            }
          >
            <MinionsSection
              profile={profile.minions}
              profileStatus={profile.status}
              items={itemIndex}
              owned={owned}
              parsed={profile.parsed}
              inventoryShared={profile.coverage?.inventoryShared ?? false}
              ironman={ironman}
            />
          </React.Suspense>
        </div>
      );
    }
    if (requestedProfileTab === "accessories") {
      return (
        <div className="mx-auto w-full max-w-[120rem] p-4 space-y-3">
          <PageHeader
            title="Accessories"
            sub="Every accessory, with where it comes from. Works without a profile."
            actions={connection}
          />
          <AccessoriesView />
        </div>
      );
    }

    if (requestedProfileTab !== null) {
      const activeProfileTab = requestedProfileTab === "network" ? "networth" : requestedProfileTab;
      return (
        <div className="mx-auto w-full max-w-[120rem] p-4 space-y-3">
          <PageHeader
            title="Profile"
            sub="Gear, pets, inventory and networth from your Hypixel profile."
            actions={connection}
          />
          <SectionTabs tabs={PROFILE_TAB_DEFS} active={activeProfileTab} onSelect={selectTab} />
          <ProfileDataState status={profile.profileStatus} />
          <HypixelConnectionLink />
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-[120rem] p-4 space-y-3">
        <PageHeader
          title="Island Storage"
          sub="Storage, networth, gear and pets."
          icon={Boxes}
          actions={connection}
        />

        <div className={`${PANEL} p-4 space-y-2`}>
          <p className="text-[12px] text-slate-300 leading-relaxed">
            The Hypixel API cannot see inside your island chests, and never has. Chest contents are not part of the
            profile data Hypixel publishes, and even sack visibility depends on your in-game API settings. So no
            website can show you this on its own.
          </p>
          <p className="text-[12px] text-slate-400 leading-relaxed">
            The {SITE_NAME} mod reads what your own client already draws when you open a container, and
            hands it here. It is passive: it reads screens you opened yourself and sends nothing on your behalf, the same
            category of mod as SkyOcean or NEU.
          </p>
          <p className="text-[12px] text-slate-300 leading-relaxed pt-1">
            Run <span className={`${NUM} text-slate-100`}>/skydex</span> in game to open the mod&rsquo;s settings,
            then pick a mode:
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="border-l-2 border-emerald-500/40 pl-2.5">
              <div className={LABEL}>Locally hosted</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                The mod runs a small server on your own machine. This page connects to it and updates the moment you
                open a chest. Nothing to paste.
              </p>
            </div>
            <div className="border-l-2 border-slate-700 pl-2.5">
              <div className={LABEL}>GitHub Pages</div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                No server. Run <span className={`${NUM} text-slate-300`}>/skydex copy</span> to put a code on your
                clipboard, then paste it below. Works anywhere.
              </p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 pt-1">
            No mod at all? A Hypixel profile connection fills in your sacks, networth, gear and pets - everything except chests.
          </p>
        </div>

        {pasteBox}
        {/* Rendered here too. A visitor with a key but no mod still has a
            networth worth reading, and one with neither gets the section's own
            account of what is missing rather than nothing at all. */}
        <NetworthPanel chests={[]} chestProvenance={sections.chests} />
        {/* The API-only sections render whenever a key has filled them in,
            because a keyed visitor with no mod is still a profile. */}
        {profile.facts && <SkillsSection facts={profile.facts} />}
        {profile.parsed && (
          <>
            <GearSection
              armor={armor}
              wornEquipment={wornEquipment}
              armorSets={armorSets}
              equipmentSets={equipmentSets}
              loadouts={gearLoadouts.loadouts}
              petByUuid={petByUuid}
              tuning={profile.facts?.tuning ?? {}}
              selectedPower={profile.facts?.selectedPower ?? null}
              equippedEquipmentSetId={gearLoadouts.equippedEquipmentSetId}
              inventoryShared={profile.coverage?.inventoryShared ?? false}
              context={contexts.gear}
            />
            <PetsSection pets={pets} />
          </>
        )}
        <HypixelConnectionLink />

        {lastError && lastError !== pasteError && <p className="text-[11px] text-red-400">{lastError}</p>}
      </div>
    );
  }

  /* --- populated --------------------------------------------------------- */

  const chestItemCount = snapshot.chests.reduce((n, c) => n + c.items.length, 0);
  const noMatches = needle !== "" && totalMatches === 0;
  const sacksReal = sections.sacks.state === "captured" || sections.sacks.state === "empty";
  const chestsReal = sections.chests.state === "captured" || sections.chests.state === "empty";

  /**
   * The summary LINE (SkyCrypt renders these inline, "Joined: ... |
   * Purse: ...", and structural parity is the rule, so the tiles this
   * used to be are now one line of label:value text with info glyphs). Every
   * item is present only when its data is: a keyless visitor sees a shorter
   * line, never a zero. The fairy-soul glyph claims no percentage because no
   * source in hand states the game's total.
   *
   * The storage counts moved out of this line and into the Chests and Sacks
   * section headings (judgment call: they are facts about those surfaces, and
   * SkyCrypt's line stays six items for a reason - a line that wraps twice
   * stops reading as a line).
   */
  const facts = profile.facts;
  const skillAverage = facts && skillDefs ? averageSkillLevel(facts.skillXp, skillDefs) : null;
  const networthResult = networthView.result;
  const bankShared = networthView.coverage?.bankShared ?? false;
  const summaryItems: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    ...(facts?.firstJoin
      ? [
          {
            label: "Joined",
            value: ago(facts.firstJoin),
            hint: `Joined on ${new Date(facts.firstJoin).toLocaleString()}`,
          },
        ]
      : []),
    ...(networthResult
      ? [{ label: "Purse", value: coins(networthResult.purse), hint: exactCoins(networthResult.purse) }]
      : []),
    ...(networthResult && bankShared
      ? [
          {
            label: "Bank",
            value: coins(networthResult.bank),
            hint: `${exactCoins(networthResult.bank)} in the co-op bank. The personal bank sits on the Networth tab.`,
          },
        ]
      : []),
    ...(skillAverage !== null
      ? [
          {
            label: "Average Skill Level",
            value: skillAverage.toFixed(2),
            hint: "Average of the levelling skills; Runecrafting and Social are excluded, matching the game's own average.",
          },
        ]
      : []),
    ...(facts?.fairySouls !== null && facts?.fairySouls !== undefined
      ? [
          {
            label: "Fairy Souls",
            value: facts.fairySouls.toLocaleString(),
            hint: "Collected fairy souls. No source in hand states the game's total, so no percentage is claimed.",
          },
        ]
      : []),
    ...(networthResult
      ? [
          {
            label: "Networth",
            value: coins(networthResult.networth),
            hint: `${exactCoins(networthResult.networth)}. The full breakdown is on the Networth tab.`,
          },
        ]
      : []),
  ];

  /**
   * The top tabs, in SkyCrypt's grouping and order: Gear,
   * Accessories, Pets, Inventory, Networth. Accessories is REAL CONTENT,
   * a tab that lives inside the profile - the same
   * component the old `/accessories` page rendered, which now redirects here.
   * It needs no snapshot and no key (the catalogue is wiki-fed), so its tab
   * is always offered. The storage surfaces live INSIDE Inventory as a
   * sub-rail, the way SkyCrypt nests Inventory / Backpack / Ender Chest.
   * Skills has no tab on purpose: the band above the tabs IS the skills
   * surface, and a tab showing the same thing twice would be noise.
   */
  const tabs = PROFILE_TAB_DEFS;

  const BOXES: StorageDestination[] = [
    {
      id: "inventory",
      label: "Inventory",
      summary: storageSummary(sections.inventory.state, withoutChrome(snapshot.inventory ?? []).length, "stack"),
      state: sections.inventory.state,
      icon: { name: "SkyBlock Menu", id: "NETHER_STAR" },
    },
    {
      id: "chests",
      label: "Chests",
      summary: storageSummary(sections.chests.state, snapshot.chests.length, "chest"),
      state: sections.chests.state,
      icon: { name: "Chest", id: "CHEST" },
    },
    {
      id: "ender-chest",
      label: "Ender Chest",
      summary: storageSummary(sections.enderChest.state, withoutChrome(snapshot.enderChest ?? []).length, "stack"),
      state: sections.enderChest.state,
      icon: { name: "Ender Chest", id: "ENDER_CHEST" },
    },
    {
      id: "storage",
      label: "Storage",
      summary: storageSummary(sections.storage.state, withoutChrome(snapshot.storage ?? []).length, "stack"),
      state: sections.storage.state,
      icon: { name: "Jumbo Backpack", id: "JUMBO_BACKPACK" },
    },
    {
      id: "sacks",
      label: "Sacks",
      summary: storageSummary(sections.sacks.state, sackEntries.length, "type", "types"),
      state: sections.sacks.state,
      icon: { name: "Large Mining Sack", id: "LARGE_MINING_SACK" },
    },
  ];

  /**
   * Earlier builds handed out `?tab=chests` style links; those surfaces now live
   * under the Inventory tab, so an old link is read as the box it meant
   * rather than falling back to the first tab. Interpretation only - the URL
   * is not rewritten under the reader.
   */
  const requested = searchParams.get("tab");
  const legacyBox = requested !== null && requested !== "inventory" && BOXES.some((b) => b.id === requested) ? requested : null;
  const normalizedProfileTab = rememberedProfileTab === "network" ? "networth" : rememberedProfileTab;
  const activeTab =
    legacyBox === null && tabs.some((t) => t.id === normalizedProfileTab)
      ? normalizedProfileTab
      : legacyBox !== null
      ? "inventory"
      : tabs.find((t) => t.id)!.id!;
  const requestedBox = searchParams.get("box") ?? legacyBox;
  const activeBox = requestedBox !== null && BOXES.some((b) => b.id === requestedBox) ? requestedBox : "inventory";

  /**
   * The search box, rendered inside every tab it filters (Chests, Inventory,
   * Ender Chest, Storage, Sacks) rather than floating above tabs it does not.
   * One shared query, so switching tabs keeps the filter and each section
   * still answers with its own match counts. The no-matches notice states the
   * whole island's answer, which stays true wherever it is read from.
   */
  const searchBox = (
    <>
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search every chest, sack and bag by item name or id…"
          className={`${INPUT} w-full pl-8`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
      {noMatches && (
        <p className={`${PANEL} px-3 py-4 text-[12px] text-slate-400 text-center`}>
          Nothing on your island matches <span className="text-slate-200">{query.trim()}</span>. Try part of the name,
          or the internal id.
        </p>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 items-start">
      {/*
        The sharp channel (the glass re-vamp): the player stands on the raw
        render, in the strip of backdrop the curtain leaves sharp, and the
        channel holds the player and NOTHING else, which is also the mock's
        own rule.
        Sticky, full viewport height under the bar, centred by the flex box in
        both axes so "is it centred" is a property of the layout.

        Hidden below 900px, where index.css collapses the split: the mobile
        panel below stands in for it there.
      */}
      <aside
        className="sticky top-[var(--sd-bar-h)] hidden h-[calc(100vh-var(--sd-bar-h))] shrink-0 flex-col items-center justify-center self-start min-[900px]:flex"
        style={{ width: "var(--sd-split)" }}
      >
        <React.Suspense fallback={<div aria-hidden className="aspect-[360/612] h-[68vh]" />}>
          <PlayerModel uuid={snapshot.player.uuid} className="aspect-[360/612] h-[68vh]" />
        </React.Suspense>
      </aside>

      {/* Everything else sits on the curtain. */}
      <div className="min-w-0 flex-1 space-y-3 px-3 pt-4 pb-10 sm:px-6 min-[900px]:px-8">
        {/* The identity heading, SkyCrypt's shape: the player and the profile
            ARE the title ("Stats for X on Y" over there, "X on Y" here), in
            the kit's own heading type. Game mode stays in the sub, freshness
            stays on the right: both are honesty lines and neither moved. */}
        <PageHeader
          title={`${snapshot.player.name || "Unknown"} on ${snapshot.profile.name || "profile"}`}
          sub="island profile"
          actions={profileFreshness}
        />

        {/* Suppressed when it is the paste error, which the paste box already
            shows in place; two copies of one message reads as two problems. */}
        {lastError && lastError !== pasteError && (
          <p className="text-[11px] text-red-400 border-l-2 border-red-500/50 pl-2" role="alert">
            {lastError}
          </p>
        )}

        {/* The narrow-viewport stand-in for the channel: the model alone, in
            the flow above the tabs. */}
        <div className="min-[900px]:hidden">
          <React.Suspense fallback={<div aria-hidden className="mx-auto aspect-[360/612] h-[300px]" />}>
            <PlayerModel uuid={snapshot.player.uuid} className="mx-auto aspect-[360/612] h-[300px] pt-2" />
          </React.Suspense>
        </div>

        <div className="min-w-0 space-y-3">
          {/* SkyCrypt's vertical order, verbatim: skills directly under the
              identity, before anything else; then the summary line; then the
              tabs. The skills band has no tab of its own because it never
              leaves the screen. */}
          {facts && Object.keys(facts.skillXp).length > 0 && (
            <SkillsSection facts={facts} />
          )}

          <SummaryLine items={summaryItems} />

          <SectionTabs tabs={tabs} active={activeTab} onSelect={selectTab} />

          {activeTab === "networth" && (
            <NetworthPanel chests={snapshot.chests} chestProvenance={sections.chests} npcSell={npcSell} />
          )}

          {activeTab === "accessories" && <AccessoriesView />}

          {activeTab === "minions" && (
            <React.Suspense
              fallback={
                <p className="rounded border border-white/10 bg-slate-950/30 p-3 text-[11px] text-slate-400" role="status">
                  Loading minion catalogue...
                </p>
              }
            >
              <MinionsSection
                profile={profile.minions}
                profileStatus={profile.status}
                items={itemIndex}
                owned={owned}
                parsed={profile.parsed}
                inventoryShared={profile.coverage?.inventoryShared ?? false}
                ironman={ironman}
              />
            </React.Suspense>
          )}

          {activeTab === "inventory" && (
            <div className="grid min-w-0 items-start gap-3 md:grid-cols-[11rem_minmax(0,1fr)]">
              <StorageSelector items={BOXES} active={activeBox} onSelect={selectBox} panelId="inventory-storage-panel" />
              <div
                id="inventory-storage-panel"
                role="tabpanel"
                aria-labelledby={`storage-tab-${activeBox}`}
                tabIndex={0}
                className="min-w-0 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/90"
              >
                {searchBox}

          {activeBox === "sacks" && (
            <>
              <div className={PANEL}>
        <SectionHead
          title="Sacks"
          right={
            <span className="flex items-center gap-2">
              {/* The entry count lives here now rather than in the summary
                  line: it is a fact about this surface. */}
              {sacksReal && (
                <span className={`text-[10px] ${NUM} text-slate-500`}>
                  {Object.keys(snapshot.sacks).length.toLocaleString()} entries
                </span>
              )}
              {sackViews.length > 0 && (
                <BoardControl
                  anyOpen={sackCollapse.anyOpen}
                  onCollapseAll={sackCollapse.collapseAll}
                  onExpandAll={sackCollapse.expandAll}
                />
              )}
              <SourceTag provenance={sections.sacks} live={live} />
            </span>
          }
        />
        {/* Four different nothings, and only one of them is "empty". A section
            no source reached is not the same fact as an explicitly empty map. */}
        {!sacksReal ? (
          <EmptyReason provenance={sections.sacks} noun="sacks" />
        ) : sackEntries.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-slate-500">
            Every sack is empty. Checked {Object.keys(snapshot.sacks).length.toLocaleString()} entries and none of them
            holds anything.
          </p>
        ) : sackViews.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-slate-500">No sack holds anything matching your search.</p>
        ) : (
          <SackBoard
            views={sackViews}
            needle={needle}
            isCollapsed={sackCollapse.isCollapsed}
            onToggle={sackCollapse.toggle}
            loading={sacksLoading}
            error={sacksError}
          />
        )}
              </div>
            </>
          )}

          {activeBox === "chests" && (
            <>
              <div className={PANEL}>
        <SectionHead
          title="Chests"
          right={
            <span className="flex items-center gap-2">
              {/* Searching narrows the count to "matching of total"; at rest
                  it states the whole surface, the counts the summary tiles
                  used to carry (facts about this surface belong on this
                  surface). */}
              {needle && chestsReal && snapshot.chests.length > 0 ? (
                <span className={`text-[10px] ${NUM} text-slate-500`}>
                  {chestViews.length} of {snapshot.chests.length}
                </span>
              ) : chestsReal ? (
                <span className={`text-[10px] ${NUM} text-slate-500`}>
                  {snapshot.chests.length.toLocaleString()} chests · {chestItemCount.toLocaleString()} items
                </span>
              ) : null}
              {chestViews.length > 0 && (
                <BoardControl
                  anyOpen={chestCollapse.anyOpen}
                  onCollapseAll={chestCollapse.collapseAll}
                  onExpandAll={chestCollapse.expandAll}
                />
              )}
              <SourceTag provenance={sections.chests} live={live} />
            </span>
          }
        />
        {!chestsReal || snapshot.chests.length === 0 ? (
          <EmptyReason provenance={sections.chests} noun="chests" />
        ) : chestViews.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-slate-500">No chest holds anything matching your search.</p>
        ) : (
          <ChestBoard
            views={chestViews}
            needle={needle}
            isCollapsed={chestCollapse.isCollapsed}
            onToggle={chestCollapse.toggle}
            context={contexts.chests}
          />
        )}
              </div>

              {/* No board, no card, and that includes a board with nothing on
                  it. An empty greenhouse grid would state that the greenhouse
                  is empty on the strength of a section the mod may simply not
                  have reached, so absent and empty land in the same place:
                  nothing at all. It lives on the Chests tab because it is the
                  same kind of thing - a container on the island the mod saw. */}
              {snapshot.greenhouse && snapshot.greenhouse.cells.length > 0 && (
                <GreenhouseCard board={snapshot.greenhouse} />
              )}
            </>
          )}

          {activeBox === "inventory" && (
            <OptionalSection
              title="Inventory"
              noun="inventory"
              list={snapshot.inventory}
              provenance={sections.inventory}
              live={live}
              needle={needle}
              context={contexts.inventory}
              capacity={36}
            />
          )}

          {activeBox === "ender-chest" && (
            <OptionalSection
              title="Ender Chest"
              noun="ender chest"
              list={snapshot.enderChest}
              provenance={sections.enderChest}
              live={live}
              needle={needle}
              context={contexts.enderChest}
              capacity={54}
            />
          )}

          {activeBox === "storage" && (
            <OptionalSection
              title="Storage / Backpacks"
              noun="backpacks"
              list={snapshot.storage}
              provenance={sections.storage}
              live={live}
              needle={needle}
              context={contexts.storage}
              capacity={54}
            />
          )}

              </div>
            </div>
          )}

          {/* The API half of the profile: what you wear, what follows you
              around. These tabs only exist once a keyed pull has filled them
              in (see the tab list above), so no keyless explanation is needed
              here; the Networth tab and the Hypixel API panel carry it. */}
          {activeTab === "gear" && (
            profile.parsed ? (
              <>
                {profile.profileStatus.isStale && profile.profileStatus.label && (
                  <p className="border-l-2 border-amber-400/60 bg-amber-400/5 px-2.5 py-2 text-[11px] text-amber-200" role="status">{profile.profileStatus.label}</p>
                )}
                <GearSection
                  armor={armor}
                  wornEquipment={wornEquipment}
                  armorSets={armorSets}
                  equipmentSets={equipmentSets}
                  loadouts={gearLoadouts.loadouts}
                  petByUuid={petByUuid}
                  tuning={facts?.tuning ?? {}}
                  selectedPower={facts?.selectedPower ?? null}
                  equippedEquipmentSetId={gearLoadouts.equippedEquipmentSetId}
                  inventoryShared={profile.coverage?.inventoryShared ?? false}
                  context={contexts.gear}
                />
              </>
            ) : (
              <ProfileDataState status={profile.profileStatus} />
            )
          )}

          {activeTab === "pets" && (
            profile.parsed ? (
              <>
                {profile.profileStatus.isStale && profile.profileStatus.label && (
                  <p className="border-l-2 border-amber-400/60 bg-amber-400/5 px-2.5 py-2 text-[11px] text-amber-200" role="status">{profile.profileStatus.label}</p>
                )}
                <PetsSection pets={pets} />
              </>
            ) : (
              <ProfileDataState status={profile.profileStatus} />
            )
          )}
        </div>

        <HypixelConnectionLink />


      </div>
    </div>
  );
};

export default IslandPage;
