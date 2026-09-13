import React from "react";
import { MAX_ITEM_QUANTITY, normaliseItemQuantity } from "../utilities/itemQuantity";

/**
 * The inventory block lives in components/common because several unrelated
 * tabs reach for it by name, and it is re-exported here so a caller already
 * importing from the kit does not need a second import line for it.
 */
export { InventoryPanel } from "../components/common/InventoryPanel";

/**
 * Skydex design kit.
 *
 * One system for the whole site so the tools read as one product rather than
 * three bolted together. Every rule below exists because breaking it made
 * something concretely worse, not because it sounded tidy.
 *
 * COLOUR CONSISTENCY LOCK
 *
 *   Verdigris (the `emerald` ramp, retinted in index.css) is the accent for
 *   interactive chrome in this design system. Buttons, focus rings, active
 *   nav, progress fills, checked states. If a thing responds to you, it is
 *   verdigris. Nothing else may take that job, which is why `orange` was
 *   folded into the same ramp: a tool this dense cannot carry three accents
 *   and still have "accent" mean anything.
 *
 *   Arcane violet (`--color-arcane-*`, and the `purple` / `violet` /
 *   `fuchsia` / `indigo` ramps) has two honest jobs, and the difference
 *   matters:
 *     - In anything built with this kit it is SURFACE MATERIAL only:
 *       background wash, texture, rules, the ambient glow behind the page.
 *       It is never an interactive or state colour here. Do not reach for it
 *       to say "selected" or "active"; that is verdigris.
 *     - In the inherited shard tools (/fusion, /recipes, /shards,
 *       /fusion-lines) it IS the accent, because those pages were built
 *       around Tailwind purple before this system existed. Retinting the
 *       ramp is what makes them look like they belong here. That is a
 *       deliberate two-family situation, not an oversight, and new work
 *       should not copy it.
 *
 *   Rarity colours are the one true exception to both rules. They encode
 *   game data, not decoration, so they keep their own hues.
 *
 *   Red stays red and means destructive or failed. Nothing else uses it.
 *
 * OTHER RULES
 *
 *   Neutrals   the obsidian ink ramp (`slate`, retinted). Cold, violet
 *              undertone, never a warm grey and never pure black.
 *   Radius     see RADIUS below. One scale. There is no second scale.
 *   Numbers    always mono and tabular so columns line up when you are
 *              scanning them mid grind. Same for ids, codes and micro-labels.
 *   Density    tight. Hairline dividers instead of nested cards.
 *   Focus      every interactive element gets a visible verdigris
 *              focus-visible ring. Keyboard users are not a special case.
 *   Contrast   the smallest type on this site is 10px, so text steps are
 *              held to 4.5:1 on the panel ground, not 3:1. That is why
 *              LABEL sits on ink-400 rather than ink-500.
 *
 * THE SHARDS SCALE
 *
 *   The shards pages (/fusion is the reference) are the
 *   site's ideal: 12px body, 11px floor, buttons and inputs at px-3 with real
 *   vertical padding, and TRANSLUCENT tinted fills (white/5, slate-700/50,
 *   accent /10../30 washes) rather than solid dark slabs. The kit's original
 *   10/11px scale and solid fills read as "industrial", so
 *   the primitives below now carry the shards metrics and every page that
 *   hard-codes the old scale is being folded onto them. The "Density tight"
 *   rule above survives as rhythm - hairlines for scanned data - not as a
 *   licence for 10px chrome.
 *
 *   FILTER PILLS: the site's filter-pill pattern is `px-2.5 py-1 text-[12px]`
 *   on a `rounded-md border` (emerald tint when active, slate when idle), as
 *   the Forge and Items pages both write it literally - that shared literal
 *   set is canon, not an accident to be deduplicated or "fixed" toward BTN's
 *   px-3 py-1.5.
 */

/**
 * The shape rule, written down so nobody has to guess.
 *
 * Panels and controls share one radius so a button sitting inside a panel
 * looks like it was cut from it. Chips are a notch tighter because they are
 * small enough that `rounded-md` reads as a lozenge. Plot cells are almost
 * square because a grid of rounded cells stops reading as a grid.
 *
 * This is documentation of the existing scale, not a second one. The larger
 * Tailwind radii are not part of it: 91 stray uses of the lg, xl and 2xl steps
 * were folded back into this scale, mostly in the inherited modals, and they
 * should not come back.
 *
 * NAMED EXCEPTION: `rounded-full`. The shape lock exists to stop stray large
 * radii, not to square off things that are actually circles. A status dot is
 * a circle; drawn with the panel radius it stops reading as a status dot and
 * starts reading as a tiny button. So `rounded-full` is allowed, and only
 * allowed, on genuinely round elements: the two live-connection dots on the
 * Island page and the route-level loading spinners. It is not a pill factory,
 * and a chip or a badge still takes `rounded-sm`.
 */
export const RADIUS = {
  panel: "rounded-md",
  control: "rounded-md",
  chip: "rounded-sm",
  cell: "rounded-[2px]",
} as const;

/**
 * Shared focus treatment. Offset against the page ground rather than the
 * panel, so the ring stays visible on nested surfaces.
 */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-950";

/**
 * Panel. Not a div with a background: an obsidian surface with a hairline of
 * light caught on its top edge, so it reads as something cut and set into the
 * page. The inset highlight does the work; the drop shadow only separates it
 * from the ambient wash behind it.
 */
/*
 * The glass re-vamp: the page ground is now the frosted curtain (index.css,
 * Glass ground block), so the panel is a glass-language card sitting ON it:
 * hairline of light for a border instead of an ink step that vanishes into
 * the glass, and a translucent fill heavy enough (70%) that the panel's text
 * ground stays within reach of the measured contrast ladder even where the
 * backdrop's moon blooms through the curtain underneath it. `sd-panel`
 * (tint-only, lighter) is the variant for bare lifts off the glass; this one
 * is the workhorse that carries dense text.
 */
/*
 * TINT, not paint. The 70% fill this replaced read as a solid swatch sitting
 * ON the glass instead of glass itself; at 45 -> 30 the blurred backdrop
 * breathes through every panel and the curtain underneath stays the thing
 * doing the legibility work. Panels never blur on curtained pages (the
 * curtain already did), which is why this is a gradient tint alone.
 */
export const PANEL = "ws-panel rounded-md border border-white/10 bg-gradient-to-b from-slate-900/45 to-slate-900/30";

/**
 * Tile. A soft card INSIDE a panel, for summary surfaces.
 *
 * This amends the "hairline dividers instead of nested cards" rule above,
 * starting from the networth tab: flush hairline
 * rows read as industrial, and the site is supposed to feel like the shards
 * pages do - each thing its own rounded card with room around it, cartoony
 * like SkyBlock but still a serious utility. The split that survives both
 * rules:
 *
 *   data you SCAN     (item lists, control rows, ledger tables)
 *                     stay hairline-dense; a hundred rows of tiles is a wall
 *                     of borders and nobody can read it.
 *   things you PICK   (categories, sources, summary figures)
 *                     are tiles with a gap, because there are few of them and
 *                     each is a destination.
 *
 * Same radius as everything else - soft comes from the gap and the raised
 * ground, not from a second radius scale.
 */
export const TILE = "rounded-md border border-white/8 bg-white/5";
export const TILE_HOVER = `${TILE} transition-colors duration-150 hover:border-white/16 hover:bg-white/8`;

/**
 * Micro-label. Mono, because at 10px the letterforms need the extra
 * differentiation, and because it visually brackets the value underneath as
 * data. Tracking is wide enough to be readable and no wider; uppercase mono
 * sprawls fast if you let it.
 */
export const LABEL = "text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400";

/** Numbers. Mono, tabular, and pulled in slightly so long figures do not sprawl. */
export const NUM = "font-mono tabular-nums tracking-[-0.01em]";

/* =========================================================================
   The dense-row type ladder
   -------------------------------------------------------------------------
   A row in an index has room for far more than a name, and a page that sets
   nine tenths of its characters at one size has no way to rank anything
   against anything else. These are the tiers that sit UNDER the LABEL caption,
   and a dense page reads as dense rather than as busy only when each one means
   something distinct:

     11px  the row's subject. Body size, the site's floor for prose.
     META  secondary data ON a row: a count, a coin figure, something that
           qualifies the subject rather than competing with it.
     BADGE a one-word classification. Not a number, so not mono.
     COL   the caption naming a column of the above.

   Kept here rather than per page so three pages cannot drift a pixel apart.
   ========================================================================= */

/**
 * Secondary data on a row. Mono and tabular because every value set in it is a
 * number sitting in a column, and a column of numbers that does not line up is
 * harder to scan than no column at all.
 */
export const META = `text-[10px] ${NUM}`;

/**
 * A one-word classification: "craft", "forge", "raw". Body font and no mono,
 * because it is a word rather than a figure.
 *
 * Letter spacing rather than capitals. At 9px small capitals are the first
 * thing to turn into texture, and the tracking alone is enough to keep it
 * reading as a marker rather than as clipped prose.
 */
export const BADGE = "text-[9px] font-medium tracking-[0.06em]";

/**
 * A column caption. Body font, sentence case, quiet.
 *
 * Deliberately not LABEL: LABEL is mono, uppercase and tracked, and a header
 * row of it above a table of numbers reads as another row of data competing
 * with the one underneath. A caption's whole job is to be legible once and
 * then get out of the way of the column it names.
 */
export const COL = "text-[10px] font-medium text-slate-400";

/**
 * Supporting prose that still needs to survive a zoomed-out dashboard.
 * Profile's readable hierarchy uses a true body size and a lighter colour for
 * hierarchy, not tiny low-contrast type. Keep that rule shared so explanatory
 * copy in every tool stays readable without competing with primary values.
 */
export const HELP = "text-[12px] leading-relaxed text-slate-300";

/**
 * A labelled figure, for a strip of headline counts.
 *
 * Not Stat, which sets both halves in mono: mono at a caption's size reads as
 * machine output, and a strip of eight of them reads as a debug dump rather
 * than as the summary of an index. Body font for both halves, with weight and
 * colour doing the ranking that the typeface was doing.
 *
 * `tabular-nums` without mono is the part worth keeping: the digits still share
 * one advance width, so a figure that ticks upward does not shuffle the cells
 * beside it, and none of the mono texture comes with it.
 */
export const Figure: React.FC<{ label: string; value: React.ReactNode; title?: string }> = ({ label, value, title }) => (
  <div title={title}>
    <div className={COL}>{label}</div>
    <div className="text-[13px] font-semibold tabular-nums text-slate-50">{value}</div>
  </div>
);

/**
 * A count, but only once its source has actually answered.
 *
 * A figure nobody can state yet is a dash, never a zero. A zero would be a
 * claim ("there are none") standing in for the truth ("nothing has answered
 * yet"), which is the one thing a summary strip must not do while a fetch is
 * still in flight.
 */
export const stated = (ready: boolean, n: number): string => (ready ? n.toLocaleString() : "-");

/**
 * Rarity is game data, so it keeps its own colours. These are explicit tokens
 * rather than stock Tailwind steps: on a violet-black ground the defaults
 * collide, with `green-400` drifting into verdigris and `purple-400` sinking
 * into the ambient wash. Each value clears 7:1 on the panel ground because
 * rarity is frequently set at 10px.
 */
export const RARITY: Record<string, string> = {
  common: "text-rarity-common",
  uncommon: "text-rarity-uncommon",
  rare: "text-rarity-rare",
  epic: "text-rarity-epic",
  legendary: "text-rarity-legendary",
  // The top half of the ladder was missing, which cost Divan's Drill its
  // mythic purple on the Forge page: an unknown tier falls through to plain
  // slate, so a map that stops at legendary silently greys out everything
  // above it. Same tokens ItemsPage's own TIER map has always carried.
  mythic: "text-rarity-mythic",
  divine: "text-rarity-divine",
  special: "text-rarity-special",
  very_special: "text-rarity-very-special",
  supreme: "text-rarity-supreme",
};

/**
 * ADDITIVE: the rarity tile - the slot language of the profile surfaces.
 *
 * Modeled on SkyCrypt's wardrobe: an item that has a rarity wears it as its
 * TILE, a
 * rounded translucent tint of the game's rarity colour with a matching
 * border. Same `--color-rarity-*` tokens as the text map above and the
 * ItemTooltip bands, same /40-border-over-/10-fill treatment, `rounded-md`
 * per the shape law - the rounding here is the panel radius, so no
 * new radius scale and no named exception needed.
 *
 * Three maps, all whole literal strings (Tailwind finds classes by scanning
 * source text; a class built as `border-rarity-${tier}` never gets
 * generated): the paired TILE for surfaces that own their whole border, and
 * the EDGE/FILL halves for surfaces where the border carries a different
 * fact - the accessories field's "obtainable right now" border keeps the
 * border while the rarity keeps the fill.
 *
 * An unknown tier gets the neutral cell, never a guessed tint.
 */
/*
 * Glass, not paint: a flat single-opacity fill reads as a coloured rectangle,
 * especially over the solid panel ground. The vertical falloff (stronger at
 * the top, quieter at the bottom) is the same move every glass surface on the
 * site makes, so a rarity tile reads as a lit pane of its colour.
 */
export const RARITY_TILE: Record<string, string> = {
  common: "border-rarity-common/45 bg-gradient-to-b from-rarity-common/22 to-rarity-common/8",
  uncommon: "border-rarity-uncommon/45 bg-gradient-to-b from-rarity-uncommon/22 to-rarity-uncommon/8",
  rare: "border-rarity-rare/45 bg-gradient-to-b from-rarity-rare/22 to-rarity-rare/8",
  epic: "border-rarity-epic/45 bg-gradient-to-b from-rarity-epic/22 to-rarity-epic/8",
  legendary: "border-rarity-legendary/45 bg-gradient-to-b from-rarity-legendary/22 to-rarity-legendary/8",
  mythic: "border-rarity-mythic/45 bg-gradient-to-b from-rarity-mythic/22 to-rarity-mythic/8",
  divine: "border-rarity-divine/45 bg-gradient-to-b from-rarity-divine/22 to-rarity-divine/8",
  special: "border-rarity-special/45 bg-gradient-to-b from-rarity-special/22 to-rarity-special/8",
  "very special": "border-rarity-very-special/45 bg-gradient-to-b from-rarity-very-special/22 to-rarity-very-special/8",
  supreme: "border-rarity-supreme/45 bg-gradient-to-b from-rarity-supreme/22 to-rarity-supreme/8",
};

export const RARITY_EDGE: Record<string, string> = {
  common: "border-rarity-common/40",
  uncommon: "border-rarity-uncommon/40",
  rare: "border-rarity-rare/40",
  epic: "border-rarity-epic/40",
  legendary: "border-rarity-legendary/40",
  mythic: "border-rarity-mythic/40",
  divine: "border-rarity-divine/40",
  special: "border-rarity-special/40",
  "very special": "border-rarity-very-special/40",
  supreme: "border-rarity-supreme/40",
};

export const RARITY_FILL: Record<string, string> = {
  common: "bg-rarity-common/10",
  uncommon: "bg-rarity-uncommon/10",
  rare: "bg-rarity-rare/10",
  epic: "bg-rarity-epic/10",
  legendary: "bg-rarity-legendary/10",
  mythic: "bg-rarity-mythic/10",
  divine: "bg-rarity-divine/10",
  special: "bg-rarity-special/10",
  "very special": "bg-rarity-very-special/10",
  supreme: "bg-rarity-supreme/10",
};

/** The neutral cell an unknown tier keeps. One statement, shared by every consumer. */
export const RARITY_TILE_UNKNOWN = "border-white/10 bg-white/5";

/** Tier in any spelling (`VERY_SPECIAL`, `Very Special`) to the paired tile classes. */
export const rarityTileClass = (tier: string | null | undefined): string => {
  if (!tier) return RARITY_TILE_UNKNOWN;
  const key = tier.trim().toLowerCase().replace(/_/g, " ");
  return RARITY_TILE[key] ?? RARITY_TILE_UNKNOWN;
};

/** Flat rarity ownership for surfaces that must not use the legacy glass falloff. */
export const rarityFlatTileClass = (tier: string | null | undefined): string => {
  if (!tier) return RARITY_TILE_UNKNOWN;
  const key = tier.trim().toLowerCase().replace(/_/g, " ");
  const edge = RARITY_EDGE[key];
  const fill = RARITY_FILL[key];
  return edge && fill ? `${edge} ${fill}` : RARITY_TILE_UNKNOWN;
};

/**
 * Which tier a recombobulated piece DISPLAYS at: one rung up, common through
 * divine, stopping at divine; SPECIAL and VERY SPECIAL sit outside the ladder
 * and never bump. This lives beside the tile maps because it exists for them
 * (a recombed piece wears its upgraded rarity, the
 * way SkyCrypt's pink tiles sit among the orange). The magical-power module
 * keeps its own narrower accessory ladder, which the wiki states stops at
 * mythic FOR MP; this is the general display ladder. Lowercase-space keys
 * out, matching what `rarityTileClass` takes; unknown passes through
 * untouched, because no rarity is ever invented on the way to a bump.
 */
const RECOMB_DISPLAY_BUMP: Record<string, string> = {
  common: "uncommon",
  uncommon: "rare",
  rare: "epic",
  epic: "legendary",
  legendary: "mythic",
  mythic: "divine",
};

export const recombDisplayTier = (tier: string | null | undefined, recombed: boolean): string | null => {
  if (!tier) return null;
  const key = tier.trim().toLowerCase().replace(/_/g, " ");
  if (!recombed) return key;
  return RECOMB_DISPLAY_BUMP[key] ?? key;
};

export const BTN =
  `px-3 py-1.5 rounded-md text-[12px] font-medium border cursor-pointer inline-flex items-center gap-1.5 ` +
  `transition-[background-color,border-color,color,transform] duration-150 ` +
  `active:translate-y-px disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 ${FOCUS}`;

export const BTN_PRIMARY = `${BTN} bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-500/45 hover:border-emerald-400/60`;
/* Translucent, like the fusion page's quiet controls, not a solid slab. */
export const BTN_QUIET = `${BTN} bg-white/8 hover:bg-white/12 text-slate-200 hover:text-slate-50 border-white/14 hover:border-white/22`;

export const INPUT =
  `px-3 py-2 rounded-md bg-black/25 border border-white/12 text-[12px] text-slate-200 placeholder:text-slate-400 ` +
  `transition-colors duration-150 hover:border-white/20 focus:outline-none focus:border-emerald-500/70 ${FOCUS}`;

/**
 * Whole-item quantity used by Crafting and Forge.
 *
 * This deliberately matches the shard calculator's label-above-field shape,
 * but lives in the kit so the two item tools cannot drift into different
 * sizes, wheel behavior or invalid-value rules.
 */
export const ItemQuantityField: React.FC<{
  id: string;
  value: number;
  onChange: (value: number) => void;
  className?: string;
}> = ({ id, value, onChange, className = "" }) => (
  <div className={className}>
    <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-slate-300">
      Quantity
    </label>
    <input
      id={id}
      type="number"
      min={1}
      max={MAX_ITEM_QUANTITY}
      step={1}
      inputMode="numeric"
      value={value}
      onChange={(event) => onChange(normaliseItemQuantity(event.currentTarget.value))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      onWheel={(event) => event.currentTarget.blur()}
      className={`${INPUT} ${NUM} w-full text-[14px]`}
    />
  </div>
);

/**
 * What a two-tone rail is made of.
 *
 * Kept out of the component and pure so the arithmetic can be tested without
 * mounting anything. The percentages are of the rail, not of each other.
 */
export interface BarSegments {
  /** Solid segment. Units you actually harvested. */
  donePct: number;
  /** Pale segment. The part of the fill credited to stock already in hand. */
  ownedPct: number;
  /** The whole fill, `donePct + ownedPct`, and never more than 100. */
  fillPct: number;
  /** True once the rail is full, however it got there. */
  complete: boolean;
}

/** Negative, NaN and Infinity are not quantities of anything. Treat them as none. */
const units = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);

/**
 * The two-tone maths.
 *
 * Owned stock is progress. Showing "0%" against a target while the player is
 * holding 429 of the things is a lie of omission, and it was the single
 * loudest complaint about this interface. So the rail credits what you hold
 * AND keeps it visually separate from what you grew, because those are
 * different claims and collapsing them would just be a nicer looking lie.
 *
 * Two clamps, both load bearing:
 *
 *   `owned` may legitimately exceed `total`. A player can hold more Choconut
 *   than any plan asks for, and the rail must sit at full rather than run off
 *   the end of its track, so the fill is capped at 100 rather than trusted.
 *
 *   `total` of zero is a real state, not a bug: a row whose requirement is
 *   already met elsewhere reaches this with nothing to divide by. It returns
 *   an empty rail rather than NaN, which would render as no width at all and
 *   look identical to a bug that had actually happened.
 *
 * `complete` is unchanged for every existing caller, because they pass no
 * `owned` and `done + 0 >= total` is the rule those bars have always used.
 */
export function barSegments(done: number, owned: number, total: number): BarSegments {
  const cap = units(total);
  if (cap === 0) return { donePct: 0, ownedPct: 0, fillPct: 0, complete: false };

  const harvested = units(done);
  const held = units(owned);
  const donePct = Math.min(100, (harvested / cap) * 100);
  const fillPct = Math.min(100, ((harvested + held) / cap) * 100);

  return { donePct, ownedPct: fillPct - donePct, fillPct, complete: harvested + held >= cap };
}

/**
 * Thin progress rail. No filled track, no pill, no gradient.
 * A finished bar picks up a faint bloom, which is the only celebratory
 * moment in the interface and the one you actually want to see.
 *
 *   <Bar done={harvested} total={wanted} />                     one tone
 *   <Bar done={harvested} owned={ownedUnits} total={wanted} />  two tone
 *
 * The two tones are layered rather than laid side by side. The pale element
 * spans the entire fill and the solid one is drawn over its left hand end, so
 * there is no seam for the slate track to show through between them, which on
 * a three pixel rail a single rounded-off pixel would have done. It also gives
 * the bloom one element to sit on whether the bar was finished by harvesting,
 * by owning, or by both, and that element has the same geometry the old single
 * fill had, so a finished bar looks exactly as it did before.
 *
 * Opacity is carried by the background colour, not by `opacity`, deliberately:
 * `opacity` would dim the box-shadow too and take the bloom down with it.
 */
export const Bar: React.FC<{
  done: number;
  owned?: number;
  total: number;
  className?: string;
  /**
   * ADDITIVE. The fill colour, defaulting to the accent every existing bar
   * has always worn. `gold` exists for exactly one semantic, the game's own
   * (from SkyCrypt's skill bars): a
   * skill AT ITS CAP wears gold, in-progress stays emerald. It is game
   * language, like the rarity colours, not a second interface accent - do
   * not reach for it to mean "important". A gold bar skips the finished
   * bloom, because the blue glow belongs to the accent ramp and gold IS the
   * finished state.
   */
  tone?: "accent" | "gold";
}> = ({ done, owned = 0, total, className = "", tone = "accent" }) => {
  const { donePct, fillPct } = barSegments(done, owned, total);
  /*
   * The glass re-vamp: every bar on the site speaks the same XP-bar
   * language from the design bench. A dark rounded groove for a track;
   * a solid fill whose outline is the fill's OWN colour darkened (shade 0.62,
   * mixed from the fill itself rather than pasted in as a second hex, so a
   * retint of the accent moves the edge with it) so the progress reads as an
   * object sitting in the groove rather than paint in a frame; the edge never
   * touches the empty
   * channel. The owned segment keeps its meaning as a translucent extension
   * of the same colour, and the old completion glow is gone - the bench has
   * no glow, a full groove IS the finished state.
   */
  const fill = tone === "gold" ? "var(--color-stat-gold)" : "var(--color-emerald-400)";
  const edge = `color-mix(in srgb, ${fill} 62%, black)`;
  return (
    <div className={`relative h-[6px] w-full overflow-hidden rounded-full bg-black/55 ${className}`}>
      <div
        className="absolute inset-y-0 left-0 rounded-full opacity-35 transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${fillPct}%`, backgroundColor: fill }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
        style={{ width: `${donePct}%`, backgroundColor: fill, border: `1px solid ${edge}` }}
      />
    </div>
  );
};

/**
 * The signature split, shared by every tool page.
 *
 * Same geometry as the Profile page: the left column is exactly the
 * masthead's logo column (--sd-col), so a page's controls sit under the
 * wordmark and its results start under the section tabs, and moving between
 * pages never moves the furniture. The rail is sticky with its own scroll so
 * long control stacks and long result lists scroll independently.
 *
 * The rail takes its width from --sd-col rather than a number of its own, and
 * that is the whole alignment contract: index.css negotiates that one token
 * against what controls need, what the Profile page's player needs and what
 * the page can spare, and the masthead reads the same token. Sizing the rail
 * here independently would buy a little width and lose the guarantee that the
 * seam lands under the tabs.
 *
 * At 900px the split stacks, rail first, because a narrow viewport has no
 * column to align to and controls-above-results is the readable order. 900 and
 * not the 768px tab breakpoint: nine pages collapse their rail behind a toggle
 * at `min-[900px]`, and index.css closes the channel on the same line, so this
 * is the one width the whole layout changes shape on.
 */
export const SplitPage: React.FC<{ rail: React.ReactNode; children: React.ReactNode; railLabel?: string }> = ({
  rail,
  children,
  railLabel = "Page controls",
}) => (
  /*
   * The stacked padding is bounded to `max-[900px]` rather than left open as
   * plain `sm:`, and that is a correctness fix, not tidying. Tailwind emits
   * arbitrary `min-[900px]:` variants BEFORE the named breakpoint variants, so
   * a bare `sm:px-6` landed later in the sheet at equal specificity and won at
   * every width above 640px. Measured, that silently defeated all four of the
   * columned paddings below: the rail sat at 24px instead of the brand gutter
   * (so its controls did not line up under the wordmark) and the content sat
   * at 24px instead of --sd-inset (so its first line did not start under the
   * tabs), which is the one alignment this layout exists to guarantee.
   * Disjoint media bands make that immune to how the utilities get ordered.
   *
   * 900 and not 899 in the max: Tailwind compiles `max-[Npx]` to `width < N`,
   * so `max-[900px]` is the exact complement of `min-[900px]`'s `width >= 900`
   * and the two bands meet with no gap. `max-[899px]` would leave the single
   * pixel column at exactly 899px matching neither rule, where the padding
   * would fall back to the unprefixed px-3.
   */
  <div className="sd-split-page flex min-h-0 flex-1 flex-col min-[900px]:flex-row min-[900px]:items-start min-[900px]:gap-[var(--sd-tool-gap)]">
    <aside
      aria-label={railLabel}
      className="sd-split-rail w-full space-y-3 px-3 pt-4 sm:max-[900px]:px-6 min-[900px]:sticky min-[900px]:top-[var(--sd-chrome-h)] min-[900px]:h-[calc(100dvh-var(--sd-chrome-h))] min-[900px]:w-[var(--sd-tool-rail)] min-[900px]:shrink-0 min-[900px]:self-start min-[900px]:overflow-y-auto min-[900px]:pb-6 min-[900px]:pl-[var(--sd-gutter)] min-[900px]:pr-5"
    >
      {rail}
    </aside>
    <div className="sd-split-content min-w-0 flex-1 space-y-3 px-3 pb-6 pt-4 sm:max-[900px]:px-6 min-[900px]:pl-[var(--sd-inset)] min-[900px]:pr-[var(--sd-gutter)]">
      {children}
    </div>
  </div>
);

/** A labelled figure. The label is small, the number is the thing you read. */
export const Stat: React.FC<{ label: string; value: React.ReactNode; accent?: boolean; align?: "left" | "right" }> = ({
  label,
  value,
  accent = false,
  align = "right",
}) => (
  <div className={align === "right" ? "text-right" : ""}>
    <div className={LABEL}>{label}</div>
    <div className={`text-sm ${NUM} ${accent ? "text-emerald-300" : "text-slate-200"}`}>{value}</div>
  </div>
);

/**
 * Page header. Every page gets the same one so the site has a spine.
 *
 * The title carries real weight now: the old 13px heading gave the site no
 * hierarchy at all, and everything read as one flat field of 11px. The rule
 * underneath is a gradient rather than a flat hairline, brightest at the
 * left where the title starts, so the eye is told where the page begins
 * without spending a single extra pixel of height on it.
 */
export const PageHeader: React.FC<{
  title: string;
  sub?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  /**
   * ADDITIVE. A custom element in the icon's place, for the one header that is
   * not a tool but a person: the profile page leads with the player's skin
   * render (after SkyCrypt's identity header).
   * When present it replaces `icon` outright rather than stacking beside it,
   * because the slot is a single glyph slot, not a gallery. Every other page
   * keeps passing `icon` and nothing about them changes.
   */
  leading?: React.ReactNode;
}> = ({ title, sub, icon: Icon, actions, leading }) => (
  <header className="mb-3">
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        {leading ??
          (Icon && (
            <span className="ws-glyph mt-px grid h-7 w-7 shrink-0 place-content-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
              <Icon className="h-4 w-4 text-emerald-300" />
            </span>
          ))}
        <div className="min-w-0">
          {/* The chrome face (the glass re-vamp): page titles are display chrome, same
              family as the wordmark and the masthead tabs. Body copy never
              sets in it - that is the rule that keeps it reading as chrome. */}
          <h1
            className="text-[20px] leading-none text-slate-50"
            style={{ fontFamily: "var(--font-chrome)", fontWeight: 800 }}
          >
            {title}
          </h1>
          {sub && <p className="mt-1.5 text-[12px] leading-snug text-slate-300">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </div>
    <div className="h-px bg-gradient-to-r from-emerald-500/50 via-slate-700 to-transparent" />
  </header>
);

/** Section heading inside a page. Hairline, no eyebrow stack. */
export const SectionHead: React.FC<{ title: string; right?: React.ReactNode }> = ({ title, right }) => (
  <div className="flex items-center justify-between gap-3 border-b border-white/10 px-3 py-2">
    <span className="text-[12px] font-semibold tracking-tight text-slate-200">{title}</span>
    {right}
  </div>
);

/**
 * Field wrapper. Labels go above inputs, always.
 *
 * Several pages had grown their own label-beside-input and label-above-input
 * arrangements, which made forms look like they came from different tools.
 * One arrangement, one gap, one place to change it.
 */
export const Field: React.FC<{
  label: string;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, hint, htmlFor, className = "", children }) => (
  <div className={`flex flex-col gap-1 ${className}`}>
    <label htmlFor={htmlFor} className={LABEL}>
      {label}
    </label>
    {children}
    {hint && <p className={HELP}>{hint}</p>}
  </div>
);

/* =========================================================================
   Compact controls
   -------------------------------------------------------------------------
   `Field` puts the label above the input, which is right for a form you are
   filling in and wrong for a settings block you are scanning. A stack of
   label-over-slider rows spends two lines and a gap on every control, so four
   controls became a 300px column in a 260px sidebar, with no way to see the
   numbers next to each other.

   These are the sibling primitives, not a replacement. The rules:

     One row per control. Label left, value right, control between or beside.
     Hairlines, not gaps. A `divide-y` costs one pixel; `space-y-2` costs
     eight, and the hairline organises better because it says these controls
     belong to one another.
     Values are mono and tabular, in a fixed-width slot, so the number can
     change without the control beside it moving.
     No box per control. Density here is hairline organisation, not a card
     for every row. Nesting a bordered box inside a bordered panel adds two
     borders and four paddings to say nothing.

   Hit targets are the constraint. A row can be 24px tall and still be easy
   to hit; it cannot be 24px tall with a 3px slider in it, which is why the
   global skin sizes the range input's box independently of its rail.
   ========================================================================= */

/**
 * Range input for a compact row: the width, and nothing else.
 *
 * Everything about how a slider LOOKS belongs to the global skin in index.css,
 * which paints the rail as a 3px gradient on the element's own background and
 * sizes the element itself to a 20px pointer target. Rail and hit area are
 * therefore independent already, which is the thing a compact row needs: a row
 * can be 24px tall and still be easy to hit, but not with a 3px slider in it.
 *
 * So the kit contributes only what is genuinely per-call-site. Width is that;
 * the slider fills the space its row gives it. Appearance is not, and a kit
 * constant that restated it would be a second author for one control.
 *
 * Restating it is worse than redundant, which is measured rather than argued.
 * A `bg-black/55` rail on `::-webkit-slider-runnable-track` does not replace
 * the painted rail underneath, it composites over it: #2b3340 under black at
 * 55% renders #13171d, near enough invisible against the #07080a ground. An
 * `h-4!` alongside it takes the pointer target back down to 16px, undoing the
 * one thing the skin's height is there to do. The `!` was needed because
 * `input[type="range"]` is unlayered and beats every layered utility whatever
 * its specificity; needing it at all was the signal that the rule belonged in
 * index.css, where it now lives.
 */
export const RANGE = "w-full";

/**
 * Where a value came from.
 *
 * Structurally identical to `StatSource` in src/island/profileStats.ts, which
 * is the API-backed source of these numbers. Declared here rather than
 * imported so the kit does not depend on the island module: the two are
 * assignable in both directions, so `useGreenhouseStats()` output can be
 * handed straight to these components once that module lands.
 *
 *   api      read off the Hypixel profile
 *   manual   the user typed it, and it wins from then on
 *   default  nobody has said anything, so this is the starting value
 */
export type StatSource = "api" | "manual" | "default";

/**
 * Provenance chip. Says a number was filled in for you, so that seeing it
 * change on its own is not alarming.
 *
 * Only ever rendered for `api`. `manual` needs no chip because the user typed
 * it and knows, and `default` needs no chip because an untouched default is
 * not a claim about anything. A stat the API does not expose stays null and
 * gets no chip at all rather than a fabricated zero.
 */
export const SourceChip: React.FC<{ source?: StatSource; className?: string }> = ({ source, className = "" }) => {
  if (source !== "api") return null;
  return (
    <span
      title="Filled in from your Hypixel profile. Type over it and your value wins from then on."
      className={`inline-flex shrink-0 items-center rounded-sm border border-emerald-500/35 bg-emerald-500/10 px-1 py-px font-mono text-[11px] leading-[1.3] tracking-tight text-emerald-200 ${className}`}
    >
      from API
    </span>
  );
};

/**
 * Container for compact rows. A vertical stack whose separators are the
 * hairlines between rows rather than empty space.
 *
 * Children are `ControlRow` / `SliderRow` / `ToggleRow`, or a `ControlPair`
 * holding two of them side by side. Keeping pairs as their own band rather
 * than letting a two column grid wrap is what makes the hairlines correct
 * without counting children: `divide-y` handles first and last on its own,
 * and a full width row can sit between two paired rows without disturbing it.
 */
export const ControlGrid: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = "", children }) => (
  <div className={`divide-y divide-slate-800 ${className}`}>{children}</div>
);

/**
 * Two compact controls on one band, split by a vertical hairline. For short
 * controls only: a slider needs the full width of a 260px sidebar to stay
 * usable, so pairing is for steppers, segmented controls and small numbers.
 */
export const ControlPair: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = "", children }) => (
  <div className={`grid grid-cols-2 divide-x divide-slate-800 ${className}`}>
    {React.Children.map(children, (child, i) => (
      <div className={i === 0 ? "pr-2.5" : "pl-2.5"}>{child}</div>
    ))}
  </div>
);

/**
 * `leading-4` rather than the inherited 1.5, so a row of 11px text is 16px
 * tall and matches the control beside it exactly. Without it the label sets
 * the row height and every band gains two pixels for nothing.
 */
/**
 * The gap is split because `gap-2` sets the row gap as well as the column one,
 * and a row that wraps rather than clip its label should not then pay 8px to
 * separate the label from the control that belongs to it. Every row that fits
 * on one line is unaffected: a row gap only exists between wrapped lines.
 */
const ROW = "flex items-center gap-x-2 gap-y-1 py-1.5 text-[12px] leading-5";

/**
 * Row label. Colour only; the width floor belongs to the row, because the
 * sliders want one shared floor and everything else wants its own text.
 *
 * There is no `truncate` here any more, and no `min-w-0` either, and both
 * removals are the same fix. `min-w-0` exists to let a flex item shrink past
 * its own content, and `truncate` is what makes that shrinking survivable;
 * together they let a control take whatever it wanted and left the label with
 * the remainder. In a 238px sidebar the Plots segmented control wanted 86 of
 * the 108 pixels its half of the band had, so a 27 pixel label was given 14
 * and rendered as "P...", which names nothing and is worse than no label.
 *
 * `min-w-fit` is the floor: never narrower than the words in it. A label that
 * genuinely cannot fit now wraps or pushes its control onto a second line,
 * which costs a row of height and stays readable, rather than ellipsing away
 * the one thing the row was there to say.
 */
const ROW_LABEL = "text-slate-300";
const ROW_LABEL_FIT = `${ROW_LABEL} min-w-fit`;

/**
 * Fixed slot so a changing number never shoves the control beside it, and so
 * every number on the panel right-aligns to the same edge in the same width.
 *
 * One width, 2.5rem, across every row type. `ControlRow` used to hold 2.25rem
 * against `SliderRow`'s 2.5rem, so the stage time sat in a slot four pixels
 * narrower than the slider readouts above it and the mono column had two left
 * edges. Right edges alone do not make a column when the eye is scanning down.
 */
const ROW_VALUE = `shrink-0 text-right text-slate-200 min-w-[2.5rem] ${NUM}`;

/**
 * Label left, control right, one row. For selects, inputs and buttons.
 *
 * `hint` is a tooltip rather than a paragraph under the control. The old
 * Bioanalysis field spent two lines of 10px body text explaining that the
 * tiers upgrade each other, which is worth saying and is not worth a quarter
 * of the panel. Anything that genuinely must be read without hovering is
 * still a paragraph, just not inside the row.
 */
export const ControlRow: React.FC<{
  label: string;
  value?: React.ReactNode;
  hint?: string;
  source?: StatSource;
  htmlFor?: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ label, value, hint, source, htmlFor, className = "", children }) => (
  <div className={`${ROW} flex-wrap ${className}`} title={hint}>
    <label htmlFor={htmlFor} className={`${ROW_LABEL_FIT} ${htmlFor ? "cursor-pointer" : ""}`}>
      {label}
    </label>
    <SourceChip source={source} />
    {/*
     * Control and value travel together in one right-hand group under a
     * single `ml-auto`, which is what guarantees the value lands on the row's
     * right edge in every combination. Giving the value its own `ml-auto`
     * instead would not: two auto margins share the free space between them
     * rather than both pushing right, so a row carrying a control AND a
     * number would have split the gap and put the number in the middle.
     *
     * The empty control span this replaces was not wrong at the right edge,
     * it was wrong about width: rendered even with no children, it still paid
     * a `gap-2`, so eight pixels of every value-only row went to separating
     * nothing from nothing. In a 109px half band that is the margin between
     * a row that fits and a row that wraps.
     *
     * Grouping also decides how a row that cannot fit breaks: label over
     * control, rather than label over control over value on three lines.
     */}
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {children}
      {value !== undefined && <span className={ROW_VALUE}>{value}</span>}
    </span>
  </div>
);

/**
 * Label, slider, value. One row.
 *
 * The value sits after the slider rather than above it because that is where
 * you look when you drag, and it is the reason this collapses to one line at
 * all. `valueWidth` widens the slot for three digit numbers so the track does
 * not shorten as the number grows.
 */
export const SliderRow: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => React.ReactNode;
  hint?: string;
  source?: StatSource;
  id?: string;
  className?: string;
}> = ({ label, value, min, max, step = 1, onChange, format, hint, source, id, className = "" }) => (
  <div className={`${ROW} ${className}`} title={hint}>
    {/*
     * `min-w-` rather than `w-`, and no wrapping on this row. The sliders
     * share one label width so their tracks all start at the same x, which a
     * fixed width gave and also silently clipped anything longer than it. A
     * floor keeps the alignment for every label that fits and shortens the
     * track for one that does not, which is the honest trade. The row itself
     * must not wrap: the range input is `w-full`, so its hypothetical size is
     * the whole row and a wrapping container would break it onto its own line
     * every single time.
     */}
    <label htmlFor={id} className={`${ROW_LABEL} min-w-[5.5rem] shrink-0 cursor-pointer`}>
      {label}
    </label>
    <SourceChip source={source} />
    {/*
     * No FOCUS on the input. Range inputs are skinned globally in index.css and
     * take their focus ring from that same rule, painted in the kit's own
     * values; carrying FOCUS as well draws a second ring around the first,
     * because an unlayered rule and a layered utility both land.
     */}
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className={RANGE}
    />
    <span className={ROW_VALUE}>{format ? format(value) : value}</span>
  </div>
);

/**
 * Label left, checkbox right, whole row clickable. Replaces the
 * `space-y-1.5` checklist, which spent as much height on the gaps as on the
 * options themselves.
 */
export const ToggleRow: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  className?: string;
}> = ({ label, checked, onChange, hint, className = "" }) => (
  <label className={`${ROW} flex-wrap cursor-pointer text-slate-300 hover:text-slate-100 ${className}`} title={hint}>
    <span className={ROW_LABEL_FIT}>{label}</span>
    {/* No FOCUS on the input, for the reason recorded on SliderRow above. */}
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="ml-auto shrink-0 cursor-pointer"
    />
  </label>
);

/**
 * Segmented control. For an enumeration small enough to show every option at
 * once, which is the honest form for something like plot count: three stops
 * on a slider is a worse way to pick one of three things than three buttons
 * that say which one you picked.
 *
 * Not a pill. It takes the control radius like everything else, and the
 * segments share borders so the group reads as one control.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  options: ReadonlyArray<{ value: T; label: React.ReactNode; title?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={`inline-flex overflow-hidden rounded-md border border-white/14 ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            title={opt.title}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={
              `min-w-[1.75rem] cursor-pointer border-l border-white/14 px-1.5 py-1 text-[11px] leading-none transition-colors duration-150 first:border-l-0 ${NUM} ${FOCUS} ` +
              (active ? "bg-emerald-500/20 text-emerald-200" : "bg-black/25 text-slate-300 hover:bg-white/10 hover:text-slate-100")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Tag. An id, a code, a piece of metadata. Mono, because that is what it is,
 * and quiet enough to sit next to a name without competing with it. Not a
 * status indicator: if you need to say something is running or failed, use
 * words and the state colours, not a coloured chip.
 */
export const Tag: React.FC<{ children: React.ReactNode; accent?: boolean; className?: string; title?: string }> = ({
  children,
  accent = false,
  className = "",
  title,
}) => (
  <span
    title={title}
    className={
      `inline-flex items-center gap-1 rounded-sm border px-1.5 py-px font-mono text-[11px] leading-[1.5] tracking-tight ${className} ` +
      (accent ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-200" : "border-white/12 bg-white/8 text-slate-300")
    }
  >
    {children}
  </span>
);

/**
 * Empty state. The site had four hand-rolled versions of this, all slightly
 * different, all saying nothing useful. One primitive: say what is missing,
 * say what to do about it, and stay small. An empty region should not take up
 * more room than a full one.
 */
export const EmptyState: React.FC<{
  title: string;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, hint, icon: Icon, action, className = "" }) => (
  <div className={`flex flex-col items-center gap-2 px-4 py-8 text-center ${className}`}>
    {Icon && (
      <span className="ws-glyph grid h-8 w-8 place-content-center rounded-md border border-slate-700 bg-slate-800/60">
        <Icon className="h-4 w-4 text-slate-500" />
      </span>
    )}
    <p className="text-[12px] font-medium text-slate-300">{title}</p>
    {hint && <p className="max-w-[42ch] text-[11px] leading-snug text-slate-500">{hint}</p>}
    {action && <div className="mt-1">{action}</div>}
  </div>
);
