import React from "react";
import { Ban, CircleHelp, Hammer, Lock } from "lucide-react";
import { FOCUS, NUM, RARITY_EDGE, RARITY_FILL, recombDisplayTier } from "../../ui/kit";
import { ItemTooltip } from "../../ui/ItemTooltip";
import { itemStatsFromRecord, type ItemTooltipMetadata, type ItemTooltipSection } from "../../ui/itemTooltipModel";
import { ItemIcon } from "../../ui/ItemIcon";
import { fetchCraftingRecipe, type CraftingRecipeLookup } from "../../items/wikiCrafting";
import { useHeadSrc } from "../headHashes";
import { blockingLine, openRequirementLines, rarityClass, readinessSummary } from "./display";
import { SourceTag } from "./SourceTag";
import { ACTIONABLE_EDGE, type ActionablePath } from "./sourceMeta";
import type { AccessoryView } from "./types";
import { ACQUISITION_LABEL } from "../acquisition";

/**
 * One accessory, as a game slot rather than a card.
 *
 * The old card grid did not survive contact with 400 accessories; the
 * reference here is SkyCrypt's profile view: a tight field of
 * square tinted item tiles where the density IS the readability, because a
 * page of 400 accessories is something you scan, not something you read. So
 * this is the site's own chest-grid language (`SlotWrap` in
 * src/ui/slotGrid.tsx is the sibling): a square cell on the plot-cell radius,
 * the icon centred, and a low-alpha tint carrying the one fact worth reading
 * at field scale. Tile tinting is the SkyCrypt technique in our materials and
 * not a line of their AGPL CSS.
 *
 * WHAT THE TINT MEANS: OBTAINABLE RIGHT NOW. An accessory the user can get
 * earns its border: craftable, buyable from an NPC shop, or linked to an
 * event currently running. That replaces the earlier source-category borders: a
 * coloured border is now an instruction rather than a taxonomy, and a tile
 * with no live path wears the neutral cell whatever its source. The three
 * path colours borrow their hue from the matching legend chip (craft green,
 * shop blue, event yellow; `ACTIONABLE_TILE`, defined beside the legend's own
 * colours), so the legend still decodes the field. The source category kept
 * its words: the hover card names it on every tile. Rarity stays where it
 * was, in the hover card's name and band.
 *
 * Everything the old card said out loud moved, not vanished:
 *
 *   hover    the full story: name, rarity, source, every requirement with
 *            where you stand, the upgrade line and its folded rungs. Same
 *            pattern as the slot grid's ItemTooltip: pointer-events-none,
 *            above the tile.
 *   click    pins or dismisses the tooltip. Once pinned, its item-name header
 *            is the deliberate wiki action. The first click never throws the
 *            reader out of the collection they were scanning.
 *   corner   only what scanning needs: "+N" when higher rungs of the line
 *            folded behind this tile, and the lock glyph when a measured
 *            requirement blocks it. Nothing else earns a chip.
 */

const mayHaveRecipe = (entry: AccessoryView): boolean =>
  entry.craftable
  || entry.ownedPrerequisite !== null
  || entry.acquisition.category === "collections"
  || entry.acquisition.category === "upgradePaths"
  || entry.acquisition.category === "generalCrafting";

export const AccessoryTile: React.FC<{
  entry: AccessoryView;
  /**
   * Which door is open on this tile right now, or null for none. Computed by
   * the page (it owns the clock and the shop index; see `actionable.ts`) and
   * passed down, so this component stays a pure function of its props.
   */
  actionable?: ActionablePath | null;
  /** True when the player's own copy carries `rarity_upgrades`; the tile then wears the bumped tier. */
  recombed?: boolean;
  /**
   * A Rift-transferable wears a small "both" mark so its inclusion on the
   * normal page is readable at a glance. The full word does not fit a dense
   * slot; the tooltip carries the precise transferability sentence.
   */
  markTransferable?: boolean;
}> = ({ entry, actionable = null, recombed = false, markTransferable = false }) => {
  /*
   * The last rung, for the accessories that are player heads.
   *
   * Keyed on `entry.id`, the Hypixel id, because that is what the item resource
   * the hash came from is keyed by. `entry.itemId` is our wiki slug and is a
   * different thing; it is what `ItemIcon` gets as `id`, for name prettifying.
   * Measured on the 407 entry catalogue: 348 resolve through the wiki and all
   * 59 that do not have a texture hash here. See `headHashes.ts`.
   */
  const headSrc = useHeadSrc(entry.id);
  const [fallbackRecipe, setFallbackRecipe] = React.useState<CraftingRecipeLookup | null | undefined>(undefined);
  const [recipeLoading, setRecipeLoading] = React.useState(false);
  const recipeExpected = mayHaveRecipe(entry);
  const indexedRecipe = entry.recipe?.length ? entry.recipe : null;
  const recipe = indexedRecipe ?? fallbackRecipe?.ingredients ?? null;

  const ensureRecipe = () => {
    if (indexedRecipe || !recipeExpected || recipeLoading || fallbackRecipe !== undefined) return;
    setRecipeLoading(true);
    void fetchCraftingRecipe(entry.name)
      .then((learned) => setFallbackRecipe(learned ?? null))
      .catch(() => setFallbackRecipe(null))
      .finally(() => setRecipeLoading(false));
  };

  /*
   * Dimmed, not hidden, for the rungs the toggle revealed: a covered rung the
   * player upgraded away and a folded rung that is not their next step are
   * both context rather than errands, and the hover card says which in words.
   */
  const dimmed = entry.coveredByFamily || entry.foldedBehind !== null;

  /*
   * TWO FACTS, ONE CELL: the FILL is the rarity -
   * the bumped rarity when the player's copy is recombed, because that is the
   * rarity the item holds in game - and the BORDER stays the
   * "obtainable right now" instruction when a door is open, falling back to
   * the rarity's own edge when none is. The two never fight because they
   * never claim the same stroke; the legend still decodes the borders and the
   * tint now reads as SkyCrypt's field does. `rounded-md` sits on the
   * kit's one radius scale.
   */
  const displayTier = recombDisplayTier(entry.tier, recombed);
  const blocked = blockingLine(entry);
  const open = openRequirementLines(entry);
  const sections: ItemTooltipSection[] = [];
  if (blocked) {
    sections.push({
      title: "Requirement",
      tone: "warning",
      lines: [
        <span key="bar">
          {blocked.label}
          {blocked.have !== null ? <span className="text-slate-400">, you have <span className={NUM}>{blocked.have}</span></span> : null}
        </span>,
        <span key="how" className="text-slate-400">{blocked.how}</span>,
      ],
    });
  } else if (open.length > 0) {
    sections.push({
      title: "Requirements",
      lines: open.flatMap((line) => [
        <span key={`${line.label}-bar`}>{line.label}</span>,
        <span key={`${line.label}-how`} className="text-slate-400">{line.how}</span>,
      ]),
    });
  }
  if (entry.riftTransferable) sections.push({ title: "Transferable", tone: "bonus", lines: ["Works both inside and outside the Rift."] });

  const skyDexSections: ItemTooltipSection[] = [];
  if (entry.acquisition.detail || entry.acquisition.alternatives.length > 0) {
    skyDexSections.push({
      title: "Acquisition",
      lines: [
        ...(entry.acquisition.detail ? [entry.acquisition.detail] : []),
        ...entry.acquisition.alternatives.map((route) => `Alternative: ${route}.`),
      ],
    });
  }
  if (entry.coveredByFamily) skyDexSections.push({ lines: ["A higher tier of this upgrade line already covers it."], tone: "muted" });
  if (entry.foldedBehind !== null) skyDexSections.push({ lines: ["A lower rung of this upgrade line comes first."], tone: "muted" });
  if (entry.foldedHigher.length > 0) skyDexSections.push({
    title: "Next in this line",
    lines: [<span key="rungs">{entry.foldedHigher.map((rung,index)=><React.Fragment key={rung.id}>{index>0?<span className="text-slate-600">, </span>:null}<span className={rarityClass(rung.tier)}>{rung.name}</span></React.Fragment>)}</span>],
    tone: "muted",
  });
  if (entry.equivalentAlternatives && entry.equivalentAlternatives.length > 0) skyDexSections.push({
    title: "Same Accessory Bag slot",
    lines: [<span key="alternatives">{entry.equivalentAlternatives.map((alternative, index) => <React.Fragment key={alternative.id}>{index > 0 ? <span className="text-slate-600">, </span> : null}<span className={rarityClass(alternative.tier)}>{alternative.name}</span></React.Fragment>)}</span>],
    tone: "muted",
  });
  const metadata: ItemTooltipMetadata[] = [
    { label: "Acquisition", value: ACQUISITION_LABEL[entry.acquisition.category] },
    { label: "Status", value: readinessSummary(entry) },
    { label: "Raw source", value: <SourceTag source={entry.source} /> },
  ];
  // The fallbacks are the kit's neutral cell (RARITY_TILE_UNKNOWN) split into
  // its halves, because here the border may belong to a different fact.
  const fill = (displayTier && RARITY_FILL[displayTier]) || "bg-white/5";
  const edge = actionable
    ? ACTIONABLE_EDGE[actionable]
    : (displayTier && RARITY_EDGE[displayTier]) || "border-white/10";

  const className =
    `profile-accessory-tile group relative flex aspect-square cursor-pointer items-center justify-center rounded-md border ` +
    `${edge} ${fill} hover:ring-1 hover:ring-white/25 ${FOCUS}`;
  const readinessMark = entry.readiness.kind === "unavailable"
    ? <Ban className="profile-accessory-tile-signal profile-accessory-tile-signal--unavailable" aria-hidden />
    : entry.readiness.kind === "unknown"
      ? <CircleHelp className="profile-accessory-tile-signal profile-accessory-tile-signal--review" aria-hidden />
      : entry.readiness.kind === "materialsUnknown" || entry.readiness.kind === "nextUpgrade"
        ? <Hammer className="profile-accessory-tile-signal profile-accessory-tile-signal--recipe" aria-hidden />
        : null;

  const body = (
    <>
      <ItemIcon
        name={entry.name}
        id={entry.itemId ?? undefined}
        // The wiki slug above prettifies the name; the pack lookup needs the
        // game's own id, which is what catharsis packs key their textures by.
        hypixelId={entry.id}
        lateSrc={headSrc}
        size={36}
        className={dimmed ? "opacity-50" : ""}
      />

      {readinessMark}

      {(entry.foldedHigher.length > 0 || (entry.equivalentAlternatives?.length ?? 0) > 0) && (
        <span
          className={`profile-item-overlay-text absolute bottom-0.5 right-0.5 text-[9px] leading-[1.3] ${NUM} text-slate-300`}
        >
          +{entry.foldedHigher.length + (entry.equivalentAlternatives?.length ?? 0)}
        </span>
      )}

      {entry.blockedBy && (
        <Lock className="absolute left-0.5 top-0.5 h-2.5 w-2.5 text-slate-400" aria-hidden />
      )}

      {markTransferable && entry.riftTransferable && (
        <span
          className={`profile-item-overlay-text absolute bottom-0.5 left-0.5 text-[9px] leading-[1.3] ${NUM} text-slate-300`}
        >
          both
        </span>
      )}

    </>
  );

  const trigger = (
    <button
      type="button"
      aria-label={`${entry.name}: toggle item details`}
      className={className}
      onPointerEnter={ensureRecipe}
      onPointerDown={ensureRecipe}
      onFocus={ensureRecipe}
    >
      {body}
    </button>
  );

  const tooltipRecipe = indexedRecipe ? {
    ingredients: indexedRecipe,
    yields: entry.recipeYields,
  } : recipe?.length ? {
    ingredients: recipe,
    yields: fallbackRecipe?.yields,
  } : recipeExpected ? {
    ingredients: [],
    pending: recipeLoading || fallbackRecipe === undefined,
    unavailable: fallbackRecipe === null,
  } : null;

  return (
    <ItemTooltip
      id={entry.id}
      name={entry.name}
      tier={entry.tier}
      extra={recombed ? { recomb: true } : undefined}
      icon={<ItemIcon name={entry.name} id={entry.itemId ?? undefined} hypixelId={entry.id} lateSrc={headSrc} size={32} />}
      stats={itemStatsFromRecord(entry.stats)}
      sections={sections}
      recipe={tooltipRecipe}
      metadata={metadata}
      skyDexSections={skyDexSections}
      wrapperClassName="profile-accessory-tile-wrap"
    >
      {trigger}
    </ItemTooltip>
  );
};
