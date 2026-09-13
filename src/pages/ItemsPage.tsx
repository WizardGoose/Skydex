import { isPlayerItem } from "../items/itemAvailability";
import { includeMinionItems } from "../recipes/minionItems";
import { includeLinkedItem, resolveLinkedItem } from "../recipes/linkedItem";
import { LinkedItemAcquisition } from "../recipes/LinkedItemAcquisition";
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronRight, ChevronDown, LockKeyhole, UnlockKeyhole, Hammer, ShoppingCart, HelpCircle, Info, CheckCircle2, ListTree, Plus, Minus, X } from "lucide-react";
import { useRecipes, useBazaar, buildCostTree, formatCoins, type CostNode, type Item } from "../items/useItemData";
import { useProfileType } from "../profile/profileType";
import { useEnsureProfileSources, useParsedProfile } from "../networth/useNetworth";
import { useApiAccess } from "../island/apiKey";
import { useIsland } from "../island/useIsland";
import { requestSkillDefs, useSkillDefs } from "../island/skills";
import { ItemIcon } from "../ui/ItemIcon";
import { ItemTooltip } from "../ui/ItemTooltip";
import { WikiLink } from "../ui/WikiLink";
import { fetchMaterialChains, readChainCache, writeChainCache, type ChainIndex } from "../items/materialChain";
import { useForgeRecipes, mergeForgeItems, formatDuration, type ForgeRecipe } from "../items/wikiForge";
import { useShopStock, describeCosts, type ShopListing } from "../items/wikiShops";
import { norm, slug } from "../items/wikiCrafting";
import { itemResourceVersion, resourceHasId, resourceTierFor, subscribeItemResource } from "../items/itemResource";
import { useAdminItems } from "../items/wikiAdmin";
import { fetchWikiTiers, readTierCache, tierCacheFresh, writeTierCache, type WikiTierCache } from "../items/wikiTiers";
import { useOwned, describeSources, type OwnedIndex } from "../inventory";
import { allocateCostTree, allocateCraftingQueue, type AllocationNode } from "../items/craftingAllocation";
import { alternativeDisplayOptions, alternativeGroupLabel } from "../items/alternativeDisplay";
import { normaliseItemQuantity } from "../utilities/itemQuantity";
import { checkRequirement, readRequirement, type PlayerProgress } from "../accessories/requirements";
import { buildAcquisitionRoutes, type AcquisitionRoute, type MaterialReadiness } from "../recipes/acquisition";
import { AlternativeAcquisitionRoutes } from "../recipes/AcquisitionRoutes";
import { RecipeAccessPanel, RecipeCollection, RecipeMethodPicker } from "../recipes/RecipeBook";
import {
  buildCollectionProgressIndex,
  buildRecipeBook,
  type RecipeMaterialStatus,
  type RecipeMethodKind,
} from "../recipes/progressionModel";
import { useWikiAcquisition } from "../recipes/useWikiAcquisition";
import { buildSkyBlockPlanningIndex } from "../recipes/catalogue";
import { buildRecipePlanInWorker } from "../recipes/recipePlanWorkerService";
import { CraftingTree } from "../recipes/CraftingTree";
import { RecipesMuseumCollection } from "../recipes/RecipesMuseumCollection";
import { includeMuseumGoals } from "../recipes/museumPlanning";
import { holdingLocations } from "../recipes/holdings";
import { buildMuseumPreviewModel } from "../profile/riftMuseumDungeons";
import { addCraftingGoal, craftingGoalKey, readCraftingList, CRAFTING_LIST_KEY } from "../recipes/craftingQueue";
import { itemStatsFromRecord } from "../ui/itemTooltipModel";
import { skyBlockStatPresentation } from "../utilities/utilityFunctions";
import { CharacterStage } from "../profile-view/CharacterStage";
import { ProfileIdentity } from "../profile-view/ProfileIdentity";
import { UtilityInfo, UtilityMetric } from "../profile-view/UtilityMetric";
import { ProfileItemTile } from "../profile-view/profile-sections/ProfileItemTile";
import { profileSkillRows } from "../profile/skillDisplay";
import {
  LABEL,
  NUM,
  FOCUS,
  META,
  BADGE,
  COL,
  ItemQuantityField,
} from "../ui/kit";
import "../profile-view/profile.css";
import "../recipes/recipes-page.css";
import "../recipes/recipe-workspace.css";
import "../profile-view/utility-workspace.css";

/**
 * Crafting trees for every craftable item.
 *
 * Each node answers one question: cheaper to craft this, or buy it? Prices are
 * live from the bazaar. Only about a quarter of items are bazaar tradeable, so
 * an unpriced node reads as "unknown" rather than free, and an unpriced branch
 * can never make a tree look cheaper than it is.
 */

/**
 * Rarity colours are game data, so they live on their own `--color-rarity-*`
 * tokens rather than on the generic Tailwind ramps.
 *
 * The ramps were the wrong home for them. Those steps get retinted whenever
 * the interface palette moves, and a rarity that follows the theme is simply
 * wrong: EPIC was `purple-400`, which turned blue the moment the shard suite's
 * purple was folded into the accent, and DIVINE was `cyan-300`, which sat a
 * few degrees off the accent and so read as something clickable. Pinning them
 * to their own namespace makes them immune to the next palette change.
 */
const TIER: Record<string, string> = {
  COMMON: "text-rarity-common",
  UNCOMMON: "text-rarity-uncommon",
  RARE: "text-rarity-rare",
  EPIC: "text-rarity-epic",
  LEGENDARY: "text-rarity-legendary",
  MYTHIC: "text-rarity-mythic",
  DIVINE: "text-rarity-divine",
  SPECIAL: "text-rarity-special",
  VERY_SPECIAL: "text-rarity-very-special",
  SUPREME: "text-rarity-supreme",
};

/*
 * META, BADGE and COL are the kit's dense-row type ladder,
 * imported above. They were written here first and now live in ui/kit.tsx so
 * the shard pages carry the same ladder rather than three copies of it.
 */

/**
 * A coin figure, or one dash when there is no figure to give.
 *
 * `formatCoins` answers "?" for an absent price, which is fine for a lone
 * number in a tile and wrong in a column: the tree and the gather list sit one
 * above the other with the same items in them, so the same missing price was
 * being written "?" in one table and "-" in the other, two glyphs for one
 * fact. A column needs a single token for "nothing here", and the dash is the
 * one the held counts have always used.
 */
const coins = (n: number | null): string => (n === null || !Number.isFinite(n) ? "-" : formatCoins(n));

/**
 * Item icon, loaded straight from the wiki.
 *
 * The URL is derived from the item name, so no API lookup is needed and no
 * image is copied into this project. The wiki serves its own CC BY-NC-SA
 * content to the visitor's browser, which keeps the share-alike clause off our
 * build entirely.
 *
 * About 5% of items have no wiki image, so a miss falls back to initials
 * rather than a broken-image glyph or a gap that breaks the row rhythm.
 */
/*
 * The local copy of this component moved to `src/ui/ItemIcon.tsx` so the Items,
 * Island and Planner pages all resolve icons the same way. The shared version
 * also tracks failures by URL rather than with a boolean, so a recycled row
 * whose item changed retries instead of staying stuck on the previous miss.
 */

const ACTION = {
  craft: { icon: Hammer, cls: "text-emerald-400", label: "craft" },
  buy: { icon: ShoppingCart, cls: "text-blue-400", label: "buy" },
  unknown: { icon: HelpCircle, cls: "text-slate-500", label: "no price" },
} as const;

/**
 * The tree's lane widths, shared by the header row and by every node row.
 *
 * They live here rather than inline in both places so a lane can never drift
 * out of alignment with its own caption: the header and the rows read the same
 * constants, so widening a lane widens both at once. Right aligned, because
 * every one of them holds a number and a column of numbers is read up its
 * right edge.
 */
const LANE_ROUTE = "w-20 shrink-0 text-right";
const LANE_COIN = "w-28 shrink-0 text-right";
const LANE_COUNT = "w-24 shrink-0 text-right";

/**
 * The floor under the name column, and why the tables scroll sideways.
 *
 * Fixed lanes do not shrink, so on a narrow content column they take what they
 * need and the name is left with the remainder. With `min-w-0` alone that
 * remainder can reach nothing, and the column that says WHICH ITEM the row is
 * about degrades to "Hyp..." and then to an ellipsis, which is the one thing
 * on the row that must never become unreadable.
 *
 * A floor of 8rem stops that. Below the width where everything fits, the row
 * overflows its container and the container scrolls, which keeps every figure
 * under its own caption. A table that is too wide and scrolls is legible; a
 * table that silently eats its first column is not.
 */
const LANE_NAME = "min-w-[8rem] flex-1";

/**
 * One node of the cost tree.
 *
 * The row used to spend its whole width on nothing: name at the left, one coin
 * figure pinned to the far right, and about a thousand pixels of blank between
 * them, so reading a row meant tracking across an empty gap and reading a
 * number with no column to compare it against. The figures the gather list
 * already computes fill that width instead, as real labelled lanes.
 *
 * `owned` is null when no source knows anything at all about what is held, and
 * the two held-derived lanes then disappear rather than printing a column of
 * dashes: an empty column is worse than no column, and it also invites the
 * reader to believe a dash means zero.
 */
const AlternativeItemIcon: React.FC<{ node: CostNode; allocation?: AllocationNode }> = ({ node, allocation }) => {
  const options = useMemo(
    () => alternativeDisplayOptions(
      { id: node.id, name: node.wikiTitle ?? node.name },
      node.alternatives ?? []
    ),
    [node.id, node.name, node.wikiTitle, node.alternatives]
  );
  const selectedId = allocation?.selectedAlternative?.id;
  const [index, setIndex] = useState(() => {
    const selected = selectedId ? options.findIndex((option) => option.id === selectedId) : -1;
    return selected >= 0 ? selected : 0;
  });

  useEffect(() => {
    if (selectedId) {
      const selected = options.findIndex((option) => option.id === selectedId);
      if (selected >= 0) setIndex(selected);
    }
  }, [options, selectedId]);

  useEffect(() => {
    if (options.length < 2 || typeof window === "undefined") return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % options.length), 1800);
    return () => window.clearInterval(timer);
  }, [options.length]);

  const option = options[index % options.length] ?? options[0];
  return <ItemTooltip id={option.id} name={option.name} tier={resourceTierFor(option.id)} wrapperTag="span"><span><ItemIcon id={option.id} name={option.name} /></span></ItemTooltip>;
};
const TreeRow: React.FC<{
  node: CostNode;
  depth?: number;
  defaultOpen?: boolean;
  ironman?: boolean;
  owned: OwnedIndex | null;
  allocation?: AllocationNode;
}> = ({ node, depth = 0, defaultOpen = false, ironman = false, owned, allocation }) => {
  // Only auto-open branches we would actually craft. A "buy" branch is a leaf
  // decision, so expanding it by default is noise. On Ironman nothing is a buy
  // decision, so open the first couple of levels instead.
  const [open, setOpen] = useState(defaultOpen || (ironman ? depth < 2 : depth === 0 && node.action === "craft"));
  const hasChildren = allocation ? allocation.children.length > 0 : node.children.length > 0;
  const meta = ACTION[node.action];
  const Icon = meta.icon;

  /*
   * What you hold against what this node needs. `held` stays undefined rather
   * than 0 when no source has ever mentioned the item, and an undefined held
   * makes the shortfall unknowable too: subtracting from a number nobody
   * stated would print the full quantity and assert you have none of it. Both
   * lanes say "not known" instead, which is the only claim the data supports.
   */
  const required = allocation?.requested ?? node.qty;
  const held = allocation ? (allocation.inventoryKnown ? allocation.allocated : undefined) : owned ? owned.count(node.id) : undefined;
  const missing = allocation
    ? allocation.inventoryKnown
      ? allocation.remaining
      : null
    : held === undefined
    ? null
    : Math.max(0, node.qty - held);

  return (
    <>
      <div
        className="ws-row flex items-center gap-3 border-b border-white/8 px-2 py-1 hover:bg-white/8"
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <button
          onClick={() => hasChildren && setOpen(!open)}
          className={`shrink-0 rounded-sm ${FOCUS} ${hasChildren ? "text-slate-500 hover:text-slate-200 cursor-pointer" : "text-transparent cursor-default"}`}
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>

        {/* The quantity stays HERE, beside the name, rather than moving into a
            lane on the right. It is the one number you read as part of the
            name ("163,840x Enchanted Bread" is a single phrase), so pushing it
            into the column block would recreate, for the most important figure
            on the row, exactly the separation this layout exists to close. The
            header names this lane "need", which is what it is. */}
        <span className={`text-[11px] ${NUM} text-slate-500 shrink-0 w-14 text-right`}>{required.toLocaleString()}x</span>

        {/* The icon resolves from the item's preferred wiki title when it has
            one (the forge pets file their image under "<Name> Pet"); the link
            below keeps the article name, because the article is the article. */}
        <AlternativeItemIcon node={node} allocation={allocation} />

        <WikiLink
          name={node.name}
          title={node.alternatives?.length ? node.alternatives.map((alternative) => alternative.name).concat(node.name).join(" or ") : undefined}
          className={`${LANE_NAME} text-[11px] ${TIER[node.tier ?? ""] ?? "text-slate-300"}`}
          nameClassName="truncate"
        >
          {node.alternatives?.length ? alternativeGroupLabel({ id: node.id, name: node.name }, node.alternatives) : node.name}
        </WikiLink>



        {/*
          Ironman has no bazaar, so the craft-or-buy decision does not exist and
          its lane is not drawn at all. What is left is what an NPC would pay,
          which is the only coin figure the mode still has.

          The icon now carries its own word. It was a bare 12px glyph in the
          middle of the row, which meant the legend underneath had to exist to
          translate it; a glyph with its label beside it explains itself and
          gives the row a lane that lines up with a caption like every other.
        */}
        {!ironman && (
          <span className={`${LANE_ROUTE} ${BADGE} flex items-center justify-end gap-1 ${meta.cls}`} title={`Cheaper to ${meta.label}`}>
            <Icon className="h-3 w-3 shrink-0" />
            {meta.label}
          </span>
        )}

        <span
          className={`${LANE_COIN} ${META} ${
            ironman
              ? node.npcValue === null
                ? "text-slate-500"
                : "text-slate-200"
              : node.cost === null
              ? "text-slate-500"
              : "text-slate-200"
          }`}
          title={
            ironman
              ? node.npcValue === null
                ? "No known NPC price"
                : "What an NPC pays for this quantity"
              : node.cost === null
              ? "No live market price"
              : "Cheapest of buying it or crafting it"
          }
        >
          {ironman ? coins(node.npcValue) : coins(node.cost)}
        </span>

        {/* A valuation, never a purchase option: you cannot buy this back from
            a shop at this figure, which is why it never feeds the decision in
            the lane before it and why it keeps its own caption. */}
        {!ironman && (
          <span
            className={`${LANE_COIN} ${META} ${node.npcValue === null ? "text-slate-500" : "text-slate-400"}`}
            title={node.npcValue === null ? "No known NPC price" : "What an NPC would pay for this quantity"}
          >
            {coins(node.npcValue)}
          </span>
        )}

        {owned && (
          <span
            className={`${LANE_COUNT} ${META} ${held === undefined ? "text-slate-500" : "text-slate-300"}`}
            title={held === undefined ? "No source has mentioned this item" : describeSources(owned.get(node.id)) || `${held.toLocaleString()} held`}
          >
            {held === undefined ? "-" : held.toLocaleString()}
          </span>
        )}

        {owned && (
          <span
            className={`${LANE_COUNT} ${META} font-medium ${
              missing === null ? "text-slate-500" : missing === 0 ? "text-emerald-400" : "text-slate-100"
            }`}
            title={
              missing === null
                ? "Not known, because nothing has said how many you hold"
                : missing === 0
                ? "You already have enough"
                : "Still to obtain"
            }
          >
            {missing === null ? "-" : missing === 0 ? "done" : missing.toLocaleString()}
          </span>
        )}
      </div>

      {open &&
        (allocation ? allocation.children : node.children).map((_, i) => {
          const c = node.children[i];
          if (!c) return null;
          return (
            <TreeRow
              key={`${c.id}-${i}`}
              node={c}
              depth={depth + 1}
              ironman={ironman}
              owned={owned}
              allocation={allocation?.children[i]}
            />
          );
        })}
    </>
  );
};

/**
 * The caption row above the tree, naming every lane once.
 *
 * It replaces the icon legend that used to sit here. The legend existed only
 * to translate three bare glyphs; now that the route lane prints its own word,
 * translating it a second time is a row of chrome that says nothing the row
 * beneath it does not already say. What the legend genuinely carried, the
 * warning that an NPC figure is not a price you can buy at, survives on the
 * lane's own tooltip and in the Ironman note.
 */
const TreeHead: React.FC<{ ironman: boolean; owned: OwnedIndex | null }> = ({ ironman, owned }) => (
  <div className={`flex items-center gap-3 border-b border-white/10 px-2 py-1.5 ${COL}`}>
    <span className="w-3 shrink-0" />
    <span className="w-14 shrink-0 text-right">need</span>
    <span className="w-4 shrink-0" />
    <span className={LANE_NAME}>item</span>
    {!ironman && <span className={LANE_ROUTE}>route</span>}
    <span className={LANE_COIN}>{ironman ? "npc" : "cost"}</span>
    {!ironman && <span className={LANE_COIN}>npc</span>}
    {owned && <span className={LANE_COUNT}>have</span>}
    {owned && <span className={LANE_COUNT}>missing</span>}
  </div>
);

const UsedInSection: React.FC<{
  item: Item;
  items: Record<string, Item>;
  onPick: (id: string) => void;
}> = ({ item, items, onPick }) => {
  const usedIn = item.usedIn ?? [];
  return (
    <section className="recipes-used-in border-b border-white/8 px-3 py-2.5">
      <div className="flex items-start gap-3">
        <h3 className={`${LABEL} mt-1 shrink-0`}>
          Used in{item.usedInTotal ? ` (${item.usedInTotal})` : ""}
        </h3>
        {usedIn.length === 0 ? (
          <p className="mt-0.5 text-[11px] text-slate-500">Not an ingredient in any known recipe.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {usedIn.map((u) => (
              <ItemTooltip key={u} id={u} name={items[u]?.name ?? u} tier={items[u]?.tier} interactive>
              <button
                onClick={() => onPick(u)}
                className={`flex cursor-pointer items-center gap-1 rounded-sm border border-white/12 bg-white/8 px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-emerald-500/40 hover:bg-white/12 hover:text-emerald-200 ${FOCUS}`}
              >
                <ItemIcon id={u} name={items[u]?.wikiTitle ?? items[u]?.name ?? u} size={14} />
                {items[u]?.name ?? u}
              </button>
              </ItemTooltip>
            ))}
            {item.usedInTotal && item.usedInTotal > usedIn.length && (
              <span className="text-[11px] text-slate-500 self-center">and {item.usedInTotal - usedIn.length} more</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

interface DirectIngredientView {
  id: string;
  name: string;
  label: string;
  required: number;
  held: number | undefined;
  foundInTrackedStorage: boolean;
  missing: number | null;
  tier: string | null;
  wikiTitle?: string;
  locations: string;
}

const DirectIngredient: React.FC<{ ingredient: DirectIngredientView; inventoryKnown: boolean }> = ({ ingredient, inventoryKnown }) => (
  <div className="recipes-ingredient">
    <span className="recipes-ingredient-icon">
      <ProfileItemTile id={ingredient.id} name={ingredient.name} iconName={ingredient.wikiTitle ?? ingredient.name} tier={ingredient.tier} count={ingredient.required} iconSize={34} ariaLabel={`${ingredient.name}, ${ingredient.required.toLocaleString()} required`} />
    </span>
    <span className="recipes-ingredient-copy">
      <WikiLink
        name={ingredient.name}
        title={ingredient.label === ingredient.name ? undefined : ingredient.label}
        className={`recipes-ingredient-name ${TIER[ingredient.tier ?? ""] ?? "text-slate-200"}`}
        nameClassName="break-words"
      >
        {ingredient.label}
      </WikiLink>
      <UtilityInfo title={`${ingredient.name} materials`} info={{ rows: [
        { label: "Required", value: ingredient.required.toLocaleString() },
        { label: "Held", value: ingredient.held?.toLocaleString() ?? "Unknown" },
        { label: "Still needed", value: ingredient.missing?.toLocaleString() ?? "Unknown" },
      ], summary: ingredient.held === undefined ? "Holdings are unavailable for this item." : ingredient.foundInTrackedStorage ? "Held items come from the selected profile's enabled Storage sources." : "This item was not found in the captured storage sources." }}>
        <span tabIndex={0} className="recipes-ingredient-counts">
          {ingredient.required === 1 && (!inventoryKnown || ingredient.missing === 0) && <><strong>1</strong> required<i aria-hidden>·</i></>}
          {inventoryKnown && ingredient.held !== undefined ? <>
            <span>{ingredient.foundInTrackedStorage ? `${ingredient.held.toLocaleString()} held` : "Not found in tracked storage"}</span>
            <i aria-hidden>·</i><span className={`recipes-ingredient-state${ingredient.missing === 0 ? " is-covered" : ""}`}>{ingredient.missing === 0 ? "Covered" : `${ingredient.missing?.toLocaleString()} left`}</span>
          </> : <span>Holdings unknown</span>}
        </span>
      </UtilityInfo>
      {ingredient.locations && <small className="recipes-holding-locations">{ingredient.locations}</small>}
    </span>
  </div>
);

interface PlannedMaterialView {
  id: string;
  name: string;
  qty: number;
  held: number | undefined;
  foundInTrackedStorage: boolean;
  missing: number;
  gather: number;
  locations: string;
}

const RecipeActionBoard: React.FC<{
  route: AcquisitionRoute;
  runs: number;
  yieldPerRun: number;
  ingredients: readonly DirectIngredientView[];
}> = ({ route, runs, yieldPerRun, ingredients }) => {
  const forging = route.kind === "forge";
  const runLabel = `${runs.toLocaleString()} ${forging ? "forge" : "craft"}${runs === 1 ? "" : "s"}`;
  const runSummary = [yieldPerRun > 1 ? `${yieldPerRun.toLocaleString()} per run` : null, runLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="recipes-action-board is-compact" aria-labelledby="recipes-action-title">
      <div className="recipes-action-heading">
        <div>
          <span>Exact recipe</span>
          <h2 id="recipes-action-title">{forging ? "Forge inputs" : "Required inputs"}</h2>
        </div>
        <small className={NUM}>{runSummary}</small>
      </div>
      <div className="recipes-action-inputs" aria-label="Inputs">
        {ingredients.length > 0 ? ingredients.map((ingredient) => (
          <DirectIngredient key={`${ingredient.id}:${ingredient.required}`} ingredient={ingredient} inventoryKnown={ingredient.held !== undefined} />
        )) : <p className="recipes-route-empty">The exact inputs are not available in the current recipe data.</p>}
      </div>
    </section>
  );
};

const MaterialWorklist: React.FC<{
  materials: readonly PlannedMaterialView[];
  items: Readonly<Record<string, Item>>;
  inventoryKnown: boolean;
  planPending: boolean;
  planFailed: boolean;
  missingOnly: boolean;
  onMissingOnlyChange: (value: boolean) => void;
}> = ({ materials, items, inventoryKnown, planPending, planFailed, missingOnly, onMissingOnlyChange }) => {
  const outstandingTypes = materials.filter((material) => !inventoryKnown || material.held === undefined || material.missing > 0).length;
  const shown = missingOnly && inventoryKnown
    ? materials.filter((material) => material.held === undefined || material.missing > 0)
    : materials;

  return (
    <section className="recipes-material-worklist" aria-labelledby="recipes-material-title">
      <div className="recipes-support-heading">
        <div>
          <h2 id="recipes-material-title">{inventoryKnown ? "Still needed" : "Required materials"}</h2>
        </div>
        <UtilityInfo title="Material requirements" info={{ summary: inventoryKnown ? "Combined requirements after allocating the selected profile's held materials across every crafting target. A held item is spent only once." : "Required materials are shown without subtracting unavailable holdings.", note: "Counts use the sources managed on Storage. Unknown holdings remain unknown." }}>
          <button type="button" className="profile-metric-hint-button"><Info aria-hidden /></button>
        </UtilityInfo>
        {!planPending && !planFailed && materials.length > 0 && (
          <small className={NUM}>{inventoryKnown ? outstandingTypes : materials.length} {(inventoryKnown ? outstandingTypes : materials.length) === 1 ? "type" : "types"}</small>
        )}
      </div>

      {inventoryKnown && materials.some((material) => material.missing === 0) && (
        <label className="recipes-covered-toggle">
          <input type="checkbox" checked={missingOnly} onChange={(event) => onMissingOnlyChange(event.target.checked)} />
          Hide covered
        </label>
      )}

      {planPending ? (
        <p className="recipes-plan-state" role="status">Building the material route…</p>
      ) : planFailed ? (
        <p className="recipes-plan-state is-error">The material route could not be expanded. The direct recipe remains available.</p>
      ) : shown.length > 0 ? (
        <div className="recipes-material-list">
          {shown.map((material) => {
            const tier = items[material.id]?.tier ?? null;
            const tracked = inventoryKnown && material.held !== undefined;
            const complete = tracked && material.missing === 0;
            return (
              <div key={material.id} className={`recipes-material-row${complete ? " is-covered" : ""}`}>
                <span className="recipes-material-icon"><ProfileItemTile id={material.id} name={material.name} iconName={items[material.id]?.wikiTitle ?? material.name} tier={tier} iconSize={26} /></span>
                <span className="recipes-material-copy">
                  <WikiLink name={material.name} className={TIER[tier ?? ""] ?? "text-slate-200"} nameClassName="line-clamp-2" />
                  <small>
                    {material.foundInTrackedStorage
                      ? `${(material.held ?? 0).toLocaleString()} held · ${material.qty.toLocaleString()} required`
                      : tracked
                        ? `${material.qty.toLocaleString()} required · not found in tracked storage`
                        : `${material.qty.toLocaleString()} required · holdings unknown`}
                  </small>
                  {material.locations && <small className="recipes-holding-locations">{material.locations}</small>}
                </span>
                <strong className={`${NUM}${complete ? " is-covered" : ""}`}>
                  {tracked ? complete ? <CheckCircle2 aria-label="Covered" /> : `${material.missing.toLocaleString()} left` : `${material.gather.toLocaleString()} need`}
                </strong>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="recipes-plan-state is-covered">Everything required for this route is already covered.</p>
      )}
    </section>
  );
};

export const ItemsPage: React.FC = () => {
  useEnsureProfileSources();
  const { items: sourceItems, loading, error } = useRecipes();
  const bazaar = useBazaar();
  const { ironman } = useProfileType();
  const parsedProfile = useParsedProfile();
  const { snapshot: islandSnapshot } = useIsland();
  const { access, setProfileId } = useApiAccess();
  const { defs: skillDefs } = useSkillDefs();

  useEffect(() => requestSkillDefs(), []);

  /**
   * The landing page's search sends people here with `?q=`, so the box starts
   * with whatever they typed rather than empty. Read once on mount as the
   * initial value, not synced: after that the field belongs to the user, and a
   * URL that kept overwriting it would fight anyone who edited their search.
  */
  const [searchParams] = useSearchParams();
  const resourceVersion = useSyncExternalStore(subscribeItemResource, itemResourceVersion, itemResourceVersion);
  const minionItems = useMemo(() => { void resourceVersion; return includeMinionItems(sourceItems); }, [sourceItems, resourceVersion]);
  const items = useMemo(() => includeLinkedItem(minionItems, searchParams), [minionItems, searchParams]);
  const appliedLink = useRef<string | null>(null);
  const scrollToLinkedItem = useRef(false);
  const [craftingList, setCraftingList] = useState(readCraftingList);
  const initialGoal = (searchParams.get("q") || searchParams.get("item")) ? undefined : craftingList[0];
  const [quantity, setQuantity] = useState(() => normaliseItemQuantity(searchParams.get("qty") ?? initialGoal?.quantity));
  const [selected, setSelected] = useState<string | null>(() => initialGoal?.id ?? null);
  const [treeOpen, setTreeOpen] = useState(false);
  const [selectedMethodKind, setSelectedMethodKind] = useState<RecipeMethodKind>(() => initialGoal?.method ?? "craft");
  const calculatorScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    calculatorScrollRef.current?.scrollTo({ top: 0 });
    if (scrollToLinkedItem.current) {
      calculatorScrollRef.current?.closest(".recipes-planner")?.scrollIntoView({ block: "start" });
      scrollToLinkedItem.current = false;
    }
  }, [selected, selectedMethodKind]);
  useEffect(() => {
    try { localStorage.setItem(CRAFTING_LIST_KEY, JSON.stringify(craftingList)); } catch { /* The current list still works without persistence. */ }
  }, [craftingList]);

  /*
   * The sharp channel. The frosted curtain's left edge is `--sd-split`, which
   * is 0 by default, so a page that does not open it is one unbroken sheet of
   * glass and the backdrop photograph underneath is never actually seen.
   *
   * This page opens it, for the same reason the Profile page does: its layout
   * already puts a full-height rail in exactly that column, so the split falls
   * on a seam the design already has rather than cutting across content. The
   * rail is drawn on `.sd-glass` (below) rather than on the kit's tint-only
   * panel, because over the sharp photograph a tint alone is not enough
   * material to set 10px text on; `.sd-glass` is the pane built for that
   * ground and is what the curtainless dashboard uses.
   *
   * The class lives on <html> so the fixed curtain and the masthead, both
   * outside this component, inherit the variable; index.css owns what it
   * means. Removed on the way out so no other route inherits the split.
   */
  useEffect(() => {
    document.documentElement.classList.add("sd-channel");
    return () => document.documentElement.classList.remove("sd-channel");
  }, []);

  /** The wiki's list of admin-only items, by article title. */
  const admin = useAdminItems();

  /**
   * Breakdowns for items the crafting module does not cover, notably every
   * enchanted item. Learned from the wiki on demand and folded into the index
   * so the tree keeps recursing instead of stopping at "Enchanted X".
   */
  const [chains, setChains] = useState<ChainIndex>(() => readChainCache());

  /**
   * Rarities the wiki states for items Hypixel's resource does not tier
   * (the visible symptom: the Accretion line uncoloured). Learned once a day,
   * batched; see `wikiTiers.ts` for why the resource alone is not enough.
   */
  const [wikiTiers, setWikiTiers] = useState<WikiTierCache>(() => readTierCache());

  /** Forge recipes and NPC shop stock, each fetched from the wiki at runtime. */
  const forge = useForgeRecipes();
  const shops = useShopStock();

  /**
   * The index the page actually renders: the crafting index, plus every forge
   * output (which is what puts Divan armor and the drills on this page at
   * all), plus the on-demand chains. Forge first, chains second, and both only
   * ever fill a recipe that is still null, so a grid recipe always wins and
   * the forge components beat the infobox's flattened material list.
   */
  // Re-render when the Hypixel item resource lands, because the tier fill
  // below reads from it and a forge item should gain its colour the moment
  // the resource does, not on the next unrelated state change.
  useSyncExternalStore(subscribeItemResource, itemResourceVersion, itemResourceVersion);

  const enriched = useMemo(() => {
    const withForge = mergeForgeItems(items, forge.index, new Set(Object.keys(bazaar.prices)), resourceHasId);
    let out: Record<string, Item> = withForge;
    const cloned = () => (out === items ? (out = { ...items }) : out);
    if (Object.keys(chains).length) {
      // `mergeForgeItems` returns its input untouched when it has no recipes,
      // so only clone when the chains would otherwise write into `items`.
      cloned();
      for (const [id, recipe] of Object.entries(chains)) {
        if (!recipe || !out[id] || out[id].recipe) continue;
        out[id] = { ...out[id], recipe };
      }
    }
    /*
     * Rarity for the forge-only items (the symptom: Gemstone Chamber lacking
     * colours). They are absent from the crafting module, so their tier
     * comes from Hypixel's item resource, by id when the merge accepted one
     * and by name otherwise; what the resource does not know, the wiki's own
     * tier categories may (the Accretion line, Angler armor - see
     * wikiTiers.ts). `resourceTierFor` answers null for anything it does not
     * know, so an item the crafting index already coloured is never
     * recoloured.
     *
     * The `.toUpperCase()` is a mechanism fix, found live: `resourceTierFor`
     * answers lower case ("epic") while the crafting index and the TIER map
     * both speak Hypixel's upper-snake ("EPIC"), so every tier this fill
     * wrote missed the colour map and Gemstone Chamber rendered plain slate
     * on this page while the Forge page (which lowercases before ITS map)
     * coloured it fine. One casing convention now: upper-snake, the index's.
     */
    for (const [id, item] of Object.entries(out)) {
      if (item.tier) continue;
      const fromResource = resourceTierFor(item.hypixelId) ?? resourceTierFor(item.name);
      const tier = fromResource ? fromResource.toUpperCase() : wikiTiers.tiers[norm(item.name)] ?? null;
      if (tier) cloned()[id] = { ...item, tier };
    }
    return out;
  }, [items, chains, forge.index, bazaar.prices, wikiTiers]);

  /**
   * Vanilla items can still be ingredients with real names, prices, and held
   * counts. Their Minecraft crafting grids do not belong in a SkyBlock plan.
   */
  const planningItems = useMemo(() => buildSkyBlockPlanningIndex(enriched), [enriched]);

  /**
   * Ask the wiki for the tiers the resource could not state, once per day.
   *
   * Only names that are still tierless after the resource fill, and only the
   * non-vanilla ones: vanilla rows are outside this catalogue, and spending
   * more requests colouring Acacia Doors would be paying for nothing. Inside
   * the cache TTL a recorded null is an answer
   * (the article states no single tier) and is not re-asked; past it, nulls
   * become questions again while learned tiers keep serving. The effect
   * converges: once the learned tiers land in `enriched`, nothing is
   * tierless-and-unknown any more and the ask list is empty.
   */
  useEffect(() => {
    if (!Object.keys(enriched).length) return;

    const fresh = tierCacheFresh(wikiTiers);
    const ask = Object.values(enriched)
      .filter((it) => !it.tier && !it.vanilla)
      .map((it) => it.name)
      .filter((name) => {
        const known = wikiTiers.tiers[norm(name)];
        return known === undefined || (known === null && !fresh);
      })
      .slice(0, 500);

    if (!ask.length) return;

    const controller = new AbortController();
    fetchWikiTiers(ask, controller.signal)
      .then((learned) => {
        if (controller.signal.aborted || !Object.keys(learned).length) return;
        setWikiTiers((prev) => {
          const next: WikiTierCache = { fetchedAt: Date.now(), tiers: { ...prev.tiers, ...learned } };
          writeTierCache(next);
          return next;
        });
      })
      .catch(() => {
        // Offline or a wiki hiccup; the affected rows just stay uncoloured.
      });

    return () => controller.abort();
  }, [enriched, wikiTiers]);

  /**
   * Is this one of the items the game itself says you cannot obtain?
   *
   * Admin items come from the wiki's own banner template (matched by exact
   * normalised title, so "Enchanted Clock (Admin)" can never hide the real
   * Enchanted Clock), and testing items from Hypixel's `TEST_` id prefix plus
   * the /test item/i rule the parser has always applied. See wikiAdmin.ts.
   */
  const unobtainable = useMemo(() => {
    const names = admin.names;
    return (it: Item) => !isPlayerItem(it.name, it.hypixelId, names);
  }, [admin.names]);

  // Apply each navigation once, then leave manual selection and quantity alone.
  useEffect(() => {
    const key = searchParams.toString();
    if (appliedLink.current === key && (!selected || enriched[selected])) return;
    const hit = resolveLinkedItem(enriched, searchParams, admin.names);
    if (hit) {
      scrollToLinkedItem.current = true;
      setSelected(hit);
      setQuantity(normaliseItemQuantity(searchParams.get("qty")));
      setSelectedMethodKind("craft");
      appliedLink.current = key;
    } else if (searchParams.get("item") || searchParams.get("q")) {
      setSelected(null);
    }
  }, [admin.names, enriched, searchParams, selected]);

  const chosen: Item | null = selected ? enriched[selected] ?? null : null;
  const forgeRec: ForgeRecipe | null = chosen ? forge.index.byName.get(norm(chosen.name)) ?? null : null;
  const hasGridRecipe = Boolean(selected && items[selected]?.recipe);
  const activeMethodKind: RecipeMethodKind = selectedMethodKind === "forge" && forgeRec
    ? "forge"
    : hasGridRecipe
      ? "craft"
      : "forge";
  const activePlanningItems = useMemo(() => {
    if (activeMethodKind !== "forge" || !selected || !chosen || !forgeRec?.ingredients.length) return planningItems;
    const recipe = forgeRec.ingredients.map((ingredient) => ({ id: slug(ingredient.name), name: ingredient.name, qty: ingredient.qty }));
    return {
      ...planningItems,
      [selected]: { ...(planningItems[selected] ?? chosen), recipe, yields: 1 },
    };
  }, [activeMethodKind, chosen, forgeRec, planningItems, selected]);
  const activeRecipe = selected ? activePlanningItems[selected]?.recipe ?? null : null;
  const planKey = `${selected ?? ""}:${activeMethodKind}:${quantity}:${ironman ? "ironman" : "normal"}`;
  const [plan, setPlan] = useState<{
    key: string;
    status: "idle" | "loading" | "ready" | "error";
    tree: CostNode | null;
  }>({ key: "", status: "idle", tree: null });

  /**
   * The selected recipe paints from its direct recipe immediately. Recursive
   * costing is isolated in a worker so comparing every craft/buy branch cannot
   * hold the search box, the selected identity, or the direct ingredients.
   */
  useEffect(() => {
    let cancelled = false;
    let fallbackHandle: number | null = null;
    const item = selected ? activePlanningItems[selected] : null;

    if (!treeOpen || !selected || !item?.recipe) {
      setPlan({ key: planKey, status: "ready", tree: null });
      return;
    }

    setPlan({ key: planKey, status: "loading", tree: null });

    const finishOnMainThread = () => {
      fallbackHandle = window.setTimeout(() => {
        if (cancelled) return;
        try {
          const tree = buildCostTree(selected, quantity, activePlanningItems, bazaar.prices, ironman);
          if (!cancelled) setPlan({ key: planKey, status: "ready", tree });
        } catch {
          if (!cancelled) setPlan({ key: planKey, status: "error", tree: null });
        }
      }, 0);
    };

    const task = buildRecipePlanInWorker({
      id: selected,
      quantity,
      items: activePlanningItems,
      prices: bazaar.prices,
      ironman,
    });

    if (!task) {
      finishOnMainThread();
    } else {
      task.promise
        .then((tree) => {
          if (!cancelled) setPlan({ key: planKey, status: "ready", tree });
        })
        .catch(() => {
          if (!cancelled) finishOnMainThread();
        });
    }

    return () => {
      cancelled = true;
      task?.cancel();
      if (fallbackHandle !== null) window.clearTimeout(fallbackHandle);
    };
  }, [activePlanningItems, bazaar.prices, ironman, planKey, quantity, selected, treeOpen]);

  useEffect(() => setTreeOpen(false), [selected]);

  const tree = plan.key === planKey && plan.status === "ready" ? plan.tree : null;
  const planPending = treeOpen && Boolean(activeRecipe) && (plan.key !== planKey || plan.status === "loading");
  const planFailed = plan.key === planKey && plan.status === "error";

  /**
   * What the site knows you already hold, across every source it has.
   *
   * This used to read sacks alone. It now goes through the profile inventory,
   * which unions the island feed (sacks, chests, inventory, ender chest,
   * storage), the Hypixel API and the shard tally, and lets a number the player
   * typed override the lot. When nothing at all is known `has` is false and
   * every trace of this disappears from the page, because a column of dashes is
   * worse than no column.
  */
  const holdingsItems = useMemo(() => {
    const index: Record<string, { hypixelId: string | null }> = { ...enriched };
    const existing = new Set(Object.values(enriched).map(item => item.hypixelId));
    for (const [id, item] of Object.entries(parsedProfile.catalogue ?? {})) {
      const hypixelId = item.id || id;
      if (!existing.has(hypixelId)) index[`museum:${hypixelId}`] = { hypixelId };
    }
    return index;
  }, [enriched, parsedProfile.catalogue]);
  const owned = useOwned({ items: holdingsItems });
  const museum = useMemo(() => buildMuseumPreviewModel({ parsed: parsedProfile.parsed, catalogue: parsedProfile.catalogue,
    coverage: parsedProfile.coverage, api: parsedProfile.museumApi, result: null }),
  [parsedProfile.parsed, parsedProfile.catalogue, parsedProfile.coverage, parsedProfile.museumApi]);

  /** Reserve exact held items before any chosen craft branch expands. The
   * CostNode adapter keeps normal Bazaar buy/craft decisions local to each
   * occurrence, while Ironman trees naturally expand only uncovered crafts. */
  const allocation = useMemo(
    () => (tree ? allocateCostTree(tree, activePlanningItems, owned) : null),
    [activePlanningItems, tree, owned]
  );

  const selectedCrafting = useMemo(() => allocateCraftingQueue(
    selected && activeRecipe ? [{ id: selected, quantity }] : [],
    activePlanningItems,
    owned,
    { useRootInventory: false },
  ), [activePlanningItems, activeRecipe, owned, quantity, selected]);

  const listCrafting = useMemo(() => allocateCraftingQueue(
    craftingList.map((goal) => {
      const item = planningItems[goal.id];
      const method = item && goal.method === "forge" ? forge.index.byName.get(norm(item.name)) : null;
      return {
        id: goal.id,
        quantity: goal.quantity,
        ...(item && method ? { item: { ...item, yields: 1, recipe: method.ingredients.map((ingredient) => ({
          id: slug(ingredient.name), name: ingredient.name, qty: ingredient.qty,
        })) } } : {}),
      };
    }),
    planningItems,
    owned,
    { useRootInventory: false },
  ), [craftingList, forge.index.byName, owned, planningItems]);

  // Discover missing intermediate recipes from the crafting branches, not a
  // price plan that can stop at a purchasable parent before reaching them.
  useEffect(() => {
    const unknown = new Map<string, string>();
    const walk = (node: AllocationNode) => {
      if (!node.children.length && node.remaining > 0 && !(node.id in chains)
        && enriched[node.id] && !enriched[node.id].recipe && !enriched[node.id].vanilla) unknown.set(node.id, node.name);
      node.children.forEach(walk);
    };
    [...selectedCrafting.roots, ...listCrafting.roots].forEach(walk);
    if (!unknown.size) return;
    const controller = new AbortController();
    fetchMaterialChains([...unknown.values()], controller.signal).then((learned) => {
      if (controller.signal.aborted || !Object.keys(learned).length) return;
      setChains((previous) => {
        const next = { ...previous, ...learned };
        writeChainCache(next);
        return next;
      });
    }).catch(() => { /* Unavailable recipe data stays an explicit terminal ingredient. */ });
    return () => controller.abort();
  }, [chains, enriched, listCrafting, selectedCrafting]);

  /**
   * Everything you have to obtain, rolled up across the whole tree.
   *
   * Three numbers per row and they mean different things. `qty` is what the
   * tree needs, `held` is what tracked storage located, and `missing` is the
   * only one you act on. A connected inventory can still fail to mention an
   * item; that becomes "not found in tracked storage" rather than the stronger
   * claim that the player owns exactly zero everywhere.
   */
  const rawMaterials = useMemo<PlannedMaterialView[]>(() => {
    return selectedCrafting.remaining
      .map((remainder) => {
        const held = remainder.known ? remainder.allocated : owned.has ? 0 : undefined;
        const gather = remainder.known ? remainder.remaining : remainder.required;
        return {
          id: remainder.id,
          name: remainder.name,
          qty: remainder.required,
          held,
          foundInTrackedStorage: remainder.known,
          missing: gather,
          gather,
          locations: holdingLocations(owned.get(remainder.id)),
        };
      })
      .sort((a, b) => b.gather - a.gather);
  }, [selectedCrafting, owned]);

  const listMaterials = useMemo<PlannedMaterialView[]>(() => listCrafting.remaining.map((entry) => ({
    id: entry.id, name: entry.name, qty: entry.required,
    held: entry.known ? entry.allocated : undefined,
    foundInTrackedStorage: entry.known,
    missing: entry.remaining, gather: entry.remaining,
    locations: holdingLocations(owned.get(entry.id)),
  })).sort((a, b) => b.gather - a.gather), [listCrafting, owned]);

  /** Hide everything you already have, so the list becomes the shopping list. */
  const [missingOnly, setMissingOnly] = useState(true);

  /**
   * Whether the tree on screen is running the forge recipe. True exactly when
   * the forge has one and the crafting module does not: the merge only fills a
   * null recipe, so this is a statement about where `chosen.recipe` came from,
   * not a guess.
   */
  const forgeFed = activeMethodKind === "forge" && forgeRec !== null && forgeRec.ingredients.length > 0;

  /** Every shop listing selling the chosen item. */
  const soldBy: ShopListing[] = useMemo(
    () => (chosen ? shops.index.byItem.get(norm(chosen.name)) ?? [] : []),
    [chosen, shops.index.byItem]
  );

  /** The selected article contributes routes that are not present in recipe, Forge, shop, or market tables. */
  const wikiRoute = useWikiAcquisition(chosen?.wikiTitle ?? chosen?.name ?? null);

  const skillLevels = useMemo<Record<string, number> | null>(() => {
    if (!parsedProfile.facts || !skillDefs) return null;
    const levels = Object.fromEntries(
      profileSkillRows(parsedProfile.facts.skillXp, skillDefs)
        .filter((skill) => skill.level !== null)
        .map((skill) => [skill.resourceKey, skill.level!]),
    );
    return Object.keys(levels).length > 0 ? levels : null;
  }, [parsedProfile.facts, skillDefs]);

  const playerProgress = useMemo<PlayerProgress>(() => ({
    slayerLevels: parsedProfile.apiDetails?.slayers
      ? Object.fromEntries(parsedProfile.apiDetails.slayers.map((slayer) => [slayer.key, slayer.level]))
      : null,
    trophyFish: null,
    skillLevels,
  }), [parsedProfile.apiDetails?.slayers, skillLevels]);

  const checkedRequirements = useMemo(
    () =>
      (chosen?.requirements ?? [])
        .map(readRequirement)
        .filter((requirement): requirement is NonNullable<typeof requirement> => requirement !== null)
        .map((requirement) => checkRequirement(requirement, playerProgress)),
    [chosen?.requirements, playerProgress]
  );

  const collectionTiers = useMemo<Readonly<Record<string, number | null>> | null>(() => {
    const entries = parsedProfile.pbc?.collections.entries;
    if (!entries) return null;
    const tiers: Record<string, number | null> = {};
    for (const entry of entries) {
      tiers[norm(entry.name)] = entry.unlockedTier;
      tiers[norm(entry.id)] = entry.unlockedTier;
    }
    return tiers;
  }, [parsedProfile.pbc?.collections.entries]);

  const collectionProgress = useMemo(
    () => buildCollectionProgressIndex(
      parsedProfile.pbc?.collections.available
        ? parsedProfile.pbc.collections.entries
        : null,
    ),
    [parsedProfile.pbc?.collections.available, parsedProfile.pbc?.collections.entries],
  );

  const recipeBook = useMemo(
    () => buildRecipeBook({
      items: enriched,
      sourceItems: items,
      forgeRecipes: forge.index.recipes,
      collections: collectionProgress,
      owned,
      playerProgress,
      tradingAllowed: !ironman,
      adminNames: admin.names,
    }),
    [admin.names, collectionProgress, enriched, forge.index.recipes, ironman, items, owned, playerProgress],
  );
  const selectedBookEntry = useMemo(
    () => selected ? recipeBook.find((entry) => entry.id === selected) ?? null : null,
    [recipeBook, selected],
  );
  const selectedMethod = selectedBookEntry?.methods.find((method) => method.kind === selectedMethodKind)
    ?? selectedBookEntry?.preferredMethod
    ?? null;

  useEffect(() => {
    if (!selectedBookEntry) return;
    setSelectedMethodKind((current) => selectedBookEntry.methods.some((method) => method.kind === current)
      ? current : selectedBookEntry.preferredMethod.kind);
  }, [selectedBookEntry]);

  useEffect(() => {
    if (selected || searchParams.get("q") || searchParams.get("item") || loading || forge.loading || recipeBook.length === 0) return;
    const defaultRecipe = recipeBook.find((entry) => entry.accessStatus === "unlocked" && entry.materialStatus === "ready")
      ?? recipeBook.find((entry) => entry.accessStatus === "unlocked")
      ?? recipeBook[0];
    if (defaultRecipe) setSelected(defaultRecipe.id);
  }, [forge.loading, loading, recipeBook, searchParams, selected]);

  const materialReadiness = useMemo<MaterialReadiness | null>(() => {
    if (!chosen?.recipe || rawMaterials.length === 0) return null;
    const unknown = rawMaterials.filter((material) => material.held === undefined);
    if (!owned.has || unknown.length > 0) {
      return {
        state: "unknown",
        detail: unknown.length > 0
          ? `${unknown.length} material type${unknown.length === 1 ? " has" : "s have"} no inventory count yet.`
          : "Inventory has not been loaded yet.",
      };
    }
    const missing = rawMaterials.filter((material) => material.missing > 0);
    if (missing.length === 0) return { state: "ready", detail: "Every required material is already held." };
    const count = missing.reduce((total, material) => total + material.missing, 0);
    return {
      state: "missing",
      detail: `${count.toLocaleString()} item${count === 1 ? "" : "s"} across ${missing.length} material type${missing.length === 1 ? "" : "s"} remain.`,
    };
  }, [chosen?.recipe, rawMaterials, owned.has]);

  const acquisitionRoutes = useMemo(
    () =>
      chosen
        ? buildAcquisitionRoutes({
            item: chosen,
            hasGridRecipe: Boolean(selected && items[selected]?.recipe),
            forge: forgeRec,
            forgeFeedsTree: forgeFed,
            shops: soldBy,
            market: !ironman && chosen.hypixelId ? bazaar.prices[chosen.hypixelId] ?? null : null,
            ironman,
            unavailable: unobtainable(chosen),
            requirements: checkedRequirements,
            collectionTiers,
            materials: materialReadiness,
            wiki: wikiRoute.facts,
            formatCoins,
            formatDuration,
            describeShopCosts: (listing) => describeCosts(listing.offer.costs),
          })
        : [],
    [
      chosen,
      selected,
      items,
      forgeRec,
      forgeFed,
      soldBy,
      ironman,
      bazaar.prices,
      unobtainable,
      checkedRequirements,
      collectionTiers,
      materialReadiness,
      wikiRoute.facts,
    ]
  );

  const chosenHeld = selected ? owned.count(selected) : undefined;
  const gridRecipe = selected ? items[selected]?.recipe ?? null : null;
  const directCrafts = gridRecipe && chosen ? Math.ceil(quantity / Math.max(1, chosen.yields)) : 0;
  const directIngredients = useMemo<DirectIngredientView[]>(() => {
    if (!gridRecipe) return [];
    return gridRecipe.map((ingredient) => {
      const candidates = [{ id: ingredient.id, name: ingredient.name }, ...(ingredient.alternatives ?? [])];
      const heldCounts = candidates.map((candidate) => owned.count(candidate.id));
      const foundInTrackedStorage = heldCounts.some((count) => count !== undefined);
      const held = owned.has
        ? heldCounts.reduce<number>((total, count) => total + (count ?? 0), 0)
        : undefined;
      const required = ingredient.qty * directCrafts;
      return {
        id: ingredient.id,
        name: ingredient.name,
        label: ingredient.alternatives?.length
          ? alternativeGroupLabel({ id: ingredient.id, name: ingredient.name }, ingredient.alternatives)
          : ingredient.name,
        locations: candidates.map(candidate => holdingLocations(owned.get(candidate.id))).filter(Boolean).join(" · "),
        required,
        held,
        foundInTrackedStorage,
        missing: held === undefined ? null : Math.max(0, required - held),
        tier: enriched[ingredient.id]?.tier ?? null,
        ...(enriched[ingredient.id]?.wikiTitle ? { wikiTitle: enriched[ingredient.id].wikiTitle } : {}),
      };
    });
  }, [directCrafts, enriched, gridRecipe, owned]);
  const forgeDirectIngredients = useMemo<DirectIngredientView[]>(() => {
    if (!forgeRec) return [];
    return forgeRec.ingredients.map((ingredient) => {
      const id = slug(ingredient.name);
      const trackedCount = owned.count(id);
      const held = owned.has ? trackedCount ?? 0 : undefined;
      const required = ingredient.qty * quantity;
      return {
        id,
        name: ingredient.name,
        label: ingredient.name,
        locations: holdingLocations(owned.get(id)),
        required,
        held,
        foundInTrackedStorage: trackedCount !== undefined,
        missing: held === undefined ? null : Math.max(0, required - held),
        tier: enriched[id]?.tier ?? null,
        ...(enriched[id]?.wikiTitle ? { wikiTitle: enriched[id].wikiTitle } : {}),
      };
    });
  }, [enriched, forgeRec, owned, quantity]);
  const alternativeRoutes = useMemo(
    () => acquisitionRoutes.filter((route) => route.kind !== "craft" && route.kind !== "forge"),
    [acquisitionRoutes],
  );
  const selectedRecipeRoute = selectedMethod
    ? acquisitionRoutes.find((route) => route.kind === selectedMethod.kind) ?? null
    : null;
  const selectedIngredients = selectedMethod?.kind === "forge" ? forgeDirectIngredients : directIngredients;
  const selectedRuns = selectedMethod?.kind === "forge" ? quantity : directCrafts;
  const selectedMaterialStatus: RecipeMaterialStatus = !owned.has
    ? "unknown"
    : selectedIngredients.every((ingredient) => ingredient.missing === 0)
      ? "ready"
      : "missing";
  const recursivePlanMatchesMethod = selectedMethod?.kind === "craft" || forgeFed;
  const itemStats = useMemo(() => itemStatsFromRecord(chosen?.stats), [chosen?.stats]);

  const characterPlayer = useMemo(() => {
    const uuid = parsedProfile.playerUuid || islandSnapshot?.player.uuid || access.uuid;
    if (!uuid) return null;
    return {
      name: parsedProfile.playerName || islandSnapshot?.player.name || access.name || "Player",
      uuid,
      profileName: parsedProfile.profileName || islandSnapshot?.profile.name || "Profile",
      gameMode: parsedProfile.gameMode ?? islandSnapshot?.profile.gameMode ?? "Normal",
      fetchedAt: parsedProfile.fetchedAt ?? islandSnapshot?.exportedAt ?? 0,
    };
  }, [
    access.name,
    access.uuid,
    islandSnapshot,
    parsedProfile.fetchedAt,
    parsedProfile.gameMode,
    parsedProfile.playerName,
    parsedProfile.playerUuid,
    parsedProfile.profileName,
  ]);
  const characterProfiles = useMemo(() => {
    if (parsedProfile.profileOptions.length > 0) return parsedProfile.profileOptions;
    if (!characterPlayer) return [];
    return [{
      id: parsedProfile.profileId ?? access.profileId ?? characterPlayer.profileName,
      name: characterPlayer.profileName,
      gameMode: parsedProfile.gameMode ?? islandSnapshot?.profile.gameMode ?? null,
    }];
  }, [
    access.profileId,
    characterPlayer,
    islandSnapshot?.profile.gameMode,
    parsedProfile.gameMode,
    parsedProfile.profileId,
    parsedProfile.profileOptions,
  ]);
  const selectedCharacterProfile = parsedProfile.profileId ?? access.profileId ?? characterProfiles[0]?.id ?? "profile";

  const identity = (
    <ProfileIdentity
      mobileProfilePicker
      playerName={characterPlayer?.name ?? access.name ?? "Player"}
      playerUuid={characterPlayer?.uuid ?? parsedProfile.playerUuid ?? access.uuid}
      profiles={characterProfiles}
      selectedProfileId={selectedCharacterProfile}
      gameMode={characterPlayer?.gameMode ?? "Normal"}
      onProfileChange={setProfileId}
      fetchedAt={characterPlayer?.fetchedAt ?? parsedProfile.fetchedAt}
      sourceStatus={parsedProfile.profileStatus.label}
      className="recipes-identity"
      trailing={
        <div className="recipes-profile-state">
          {!ironman && (
            <span className={`text-[11px] ${NUM} ${bazaar.error ? "text-amber-400" : "text-slate-500"}`}>
              {bazaar.error
                ? "market unavailable"
                : bazaar.fetchedAt
                ? `${Object.keys(bazaar.prices).length} live prices`
                : "loading prices"}
            </span>
          )}
        </div>
      }
    />
  );

  return (
    <div className={`profile-view-root profile-view-root--frosted recipes-view-root${characterPlayer ? "" : " recipes-view-root--no-character"}`}>
      <div className="profile-shell recipes-shell">
        {characterPlayer ? (
          <CharacterStage
            player={characterPlayer}
            profiles={characterProfiles}
            selectedProfileId={selectedCharacterProfile}
            onProfileChange={setProfileId}
            showProfilePicker={false}
          />
        ) : (
          <aside className="profile-character-stage" aria-label="Character preview" />
        )}

        <div className="profile-workspace recipes-workspace">
          {identity}
          <main className="recipes-detail-workspace">
            {(error || (forge.error && forge.index.recipes.length === 0)) && (
              <div className="recipes-source-note" role="alert">
                {error
                  ? `Crafting recipes could not be refreshed (${error}). Cached recipes remain available when present.`
                  : `Forge recipes could not be loaded (${forge.error}), so the Forge portion of the recipe book is unavailable.`}
              </div>
            )}

            <div className="recipes-workbench utility-workbench profile-glass">
              <aside className="recipes-browser utility-workbench-zone utility-rail-split" aria-label="Recipes and crafting targets">
                <div className="recipes-picker">
                <header className="recipes-workspace-heading"><h2>{craftingList.length > 1 ? "Target Items" : "Target Item"}</h2></header>
                <RecipeCollection
                  key={searchParams.toString()}
                  entries={recipeBook}
                  linkedItem={selectedBookEntry ? null : chosen}
                  initialQuery={searchParams.get("q") ?? ""}
                  selectedId={selected}
                  loading={loading || forge.loading}
                  onSelect={setSelected}
                />
                </div>
                  <section className="recipes-list" aria-label="Crafting list">
                    <header className="recipes-list-heading"><h2>Crafting list</h2><small>{craftingList.length} {craftingList.length === 1 ? "target" : "targets"}</small></header>
                        <div className="recipes-list-goals">
                          {craftingList.map((goal) => {
                            const key = craftingGoalKey(goal);
                            const item = enriched[goal.id];
                            const name = item?.name ?? goal.id;
                            const selectGoal = () => { setSelected(goal.id); setQuantity(goal.quantity); setSelectedMethodKind(goal.method); };
                            const changeQuantity = (value: number | string) => {
                              const next = normaliseItemQuantity(value);
                              setCraftingList(goals => goals.map(entry => craftingGoalKey(entry) === key ? { ...entry, quantity: next } : entry));
                              if (selected === goal.id && selectedMethodKind === goal.method) setQuantity(next);
                            };
                            return <div className={`recipes-list-goal${selected === goal.id && selectedMethodKind === goal.method ? " is-selected" : ""}`} key={key}>
                              <ProfileItemTile id={goal.id} hypixelId={item?.hypixelId} name={name} iconName={item?.wikiTitle ?? name} tier={item?.tier} count={goal.quantity} iconSize={32} onClick={selectGoal} ariaLabel={`Select ${name} recipe`} />
                              <button type="button" className={`recipes-list-name ${FOCUS}`} onClick={selectGoal}><span className={TIER[item?.tier ?? ""] ?? "text-slate-200"}>{name}</span></button>
                              <div className="recipes-list-quantity">
                              <button type="button" className={FOCUS} disabled={goal.quantity <= 1} aria-label={`Decrease ${name} crafting quantity`} onClick={() => changeQuantity(goal.quantity - 1)}><Minus size={12} aria-hidden /></button>
                              <input type="number" min={1} max={1_000_000} inputMode="numeric" aria-label={`${name} crafting quantity`} value={goal.quantity}
                                style={{ width: `${Math.max(2, String(goal.quantity).length)}ch` }}
                                onChange={(event) => changeQuantity(event.target.value)}
                                onWheel={(event) => event.currentTarget.blur()} />
                              <button type="button" className={FOCUS} disabled={goal.quantity >= 1_000_000} aria-label={`Increase ${name} crafting quantity`} onClick={() => changeQuantity(goal.quantity + 1)}><Plus size={12} aria-hidden /></button>
                              </div>
                              <button type="button" className={FOCUS} aria-label={`Remove ${name} from crafting list`} onClick={() => setCraftingList((goals) => goals.filter((entry) => craftingGoalKey(entry) !== key))}><X aria-hidden /></button>
                            </div>;
                          })}
                        </div>
                  </section>
              </aside>

              <section className="recipes-planner utility-workbench-zone" aria-labelledby="recipes-crafting-title" aria-busy={planPending}>
                <header className="recipes-calculator-heading"><h2 id="recipes-crafting-title">Crafting</h2><p>{craftingList.length || 1} {craftingList.length > 1 ? "target items" : "target item"}</p></header>
                <div ref={calculatorScrollRef} className="recipes-calculator-scroll utility-scroll" tabIndex={0} role="region" aria-label="Recipe calculation">
                  {chosen && selectedBookEntry && selectedMethod ? (
                    <>
                    <div className="recipes-item-panel">
                    <header className="recipes-selected-recipe">
                      <span className="recipes-selected-icon">
                        <ProfileItemTile id={selected!} hypixelId={chosen.hypixelId} name={chosen.name} iconName={chosen.wikiTitle ?? chosen.name} tier={chosen.tier} count={quantity} iconSize={54} stats={itemStats} />
                      </span>
                      <div className="recipes-selected-copy">
                        <span>{chosen.category ?? "SkyBlock item"}</span>
                        <h2 id="recipes-planner-title"><WikiLink name={chosen.name} className={TIER[chosen.tier ?? ""] ?? "text-slate-100"} /></h2>
                        <p>
                          {selectedMethod.kind === "forge" ? "Forge recipe" : `Crafting recipe · makes ${selectedMethod.yields.toLocaleString()}`}
                          {chosenHeld !== undefined && <> · {chosenHeld.toLocaleString()} held</>}
                        </p>
                        <dl className="recipes-selected-facts">
                          <div className="utility-metric utility-metric--growth recipes-access-fact">
                            <dt className="profile-metric-head"><span className="profile-metric-label">Recipe</span>
                              {selectedMethod.accessStatus === "unlocked" ? <UnlockKeyhole size={13} aria-label="Unlocked" /> : selectedMethod.accessStatus === "locked" ? <LockKeyhole size={13} aria-label="Locked" /> : <HelpCircle size={13} aria-label="Check in game" />}
                            </dt>
                            <dd>{selectedMethod.accessGates.length ? selectedMethod.accessGates.map(gate => <span key={gate.id}>{gate.label}</span>) : selectedMethod.accessStatus === "unlocked" ? "No unlock required" : "Check in game"}</dd>
                          </div>
                          <div className="utility-metric utility-metric--materials recipes-materials-fact">
                            <dt className="profile-metric-head"><span className="profile-metric-label">Materials</span></dt>
                            <dd className="recipes-material-preview" aria-label={selectedMaterialStatus === "unknown" ? "Required materials, holdings unavailable" : "Required materials"}>
                              {selectedIngredients.map(ingredient => <ProfileItemTile key={ingredient.id} id={ingredient.id} name={ingredient.name} iconName={ingredient.wikiTitle ?? ingredient.name} tier={ingredient.tier} count={ingredient.required} iconSize={26}
                                metadata={[{label:"Required",value:ingredient.required.toLocaleString()}, {label:"Held",value:ingredient.held?.toLocaleString() ?? "Unknown"}]} />)}
                            </dd>
                          </div>
                          {selectedMethod.kind === "forge" && forgeRec && (
                            <>
                              <UtilityMetric label="Base Forge time" tone="time" value={forgeRec.seconds !== null ? formatDuration(forgeRec.seconds) : forgeRec.duration ?? "—"} info={{ summary: "The duration listed by this Forge recipe." }} />
                              <UtilityMetric label="Coin input" tone="materials" value={forgeRec.coins === null ? "—" : formatCoins(forgeRec.coins * quantity)} info={{ summary: "Coins listed separately from the material ingredients. A dash means the recipe data does not specify a coin cost." }} />
                            </>
                          )}
                        </dl>
                        {itemStats.length > 0 && (
                          <dl className="recipes-target-stats" aria-label="Item stats">
                            {itemStats.map((stat) => {
                              const presentation = skyBlockStatPresentation(stat.label);
                              return <div key={stat.label} className={presentation?.colorClass}><dt>{presentation && <span aria-hidden>{presentation.glyph} </span>}{stat.label}</dt><dd>{stat.value}{presentation?.percent ? "%" : ""}</dd></div>;
                            })}
                          </dl>
                        )}
                      </div>
                      <div className="recipes-selected-actions">
                        <ItemQuantityField id="recipes-quantity" value={quantity} onChange={setQuantity} className="recipes-selected-quantity" />
                        <button type="button" className={`recipes-add-to-list ${FOCUS}`} onClick={() => {
                          if (selected) setCraftingList((goals) => addCraftingGoal(goals, { id: selected, quantity, method: selectedMethod.kind }));
                        }}><Plus aria-hidden />Add to crafting list</button>
                      </div>
                    </header>

                    {selectedBookEntry.methods.length > 1 && (
                      <RecipeMethodPicker methods={selectedBookEntry.methods} selected={selectedMethod.kind} onSelect={setSelectedMethodKind} />
                    )}
                    {selectedMethod.accessGates.length > 0 && <details className="recipes-unlock" key={`${selected}:${selectedMethod.kind}:${selectedMethod.accessStatus}`} open={selectedMethod.accessStatus !== "unlocked"}>
                      <summary>{selectedMethod.accessStatus === "unlocked" ? "Unlock requirements met" : selectedMethod.accessStatus === "locked" ? "Unlock requirements" : "Check recipe access"}<ChevronDown size={14} aria-hidden /></summary>
                      <RecipeAccessPanel method={selectedMethod} />
                    </details>}
                    </div>
                      {!craftingList.some(goal => goal.id === selected && goal.method === selectedMethod.kind) && <CraftingTree roots={selectedCrafting.roots} owned={owned} title={craftingList.length ? "Selected recipe" : "Crafting tree"} />}
                      {craftingList.length > 0 && <CraftingTree roots={listCrafting.roots} owned={owned} title="Crafting list" />}
                    </>
                  ) : chosen ? (
                    <LinkedItemAcquisition id={selected!} item={chosen} routes={alternativeRoutes} />
                  ) : (
                    <>
                    <header className="recipes-zone-heading">
                      <span className="profile-eyebrow">Recipe</span>
                      <h2 id="recipes-planner-title">Recipe breakdown</h2>
                      <p>Choose a recipe from your collection</p>
                    </header>
                    <div className="recipes-planner-empty" role={loading ? "status" : undefined}>
                      {loading ? <><span className="recipes-spinner" aria-hidden /><strong>Loading the recipe book</strong></> : <><strong>Choose a recipe</strong><span>Pick one from your collection to see its unlock and material breakdown.</span></>}
                    </div>
                    </>
                  )}
                </div>
              </section>

              <aside className="recipes-requirements utility-workbench-zone utility-rail-split utility-support-rail" aria-label="Recipe requirements">
                {chosen && selectedBookEntry && selectedMethod && (
                  <>
                      {selectedRecipeRoute ? (
                        <RecipeActionBoard
                          route={selectedRecipeRoute}
                          runs={selectedRuns}
                          yieldPerRun={selectedMethod.yields}
                          ingredients={selectedIngredients}
                        />
                      ) : (
                        <section className="recipes-action-board">
                          <div className="recipes-action-heading"><div><span>Exact recipe</span><h2>Recipe inputs</h2></div></div>
                          <div className="recipes-action-inputs">
                            {selectedIngredients.map((ingredient) => <DirectIngredient key={`${ingredient.id}:${ingredient.required}`} ingredient={ingredient} inventoryKnown={owned.has} />)}
                          </div>
                        </section>
                      )}
                      {craftingList.length === 0 && recursivePlanMatchesMethod && activeRecipe && (
                        <MaterialWorklist
                          materials={rawMaterials}
                          items={enriched}
                          inventoryKnown={owned.has}
                          planPending={loading || forge.loading}
                          planFailed={false}
                          missingOnly={missingOnly}
                          onMissingOnlyChange={setMissingOnly}
                        />
                      )}
                    {craftingList.length > 0 && (
                      <MaterialWorklist materials={listMaterials} items={enriched} inventoryKnown={owned.has}
                        planPending={loading || forge.loading} planFailed={false} missingOnly={missingOnly} onMissingOnlyChange={setMissingOnly} />
                    )}
                  </>
                )}
              </aside>
            </div>
            <RecipesMuseumCollection model={museum} recipes={recipeBook} owned={owned} onSelect={id => {
              setSelected(id); setQuantity(1);
              calculatorScrollRef.current?.closest(".recipes-planner")?.scrollIntoView({ block: "start" });
            }} onPlan={goals => {
              if (!goals.length) return;
              setCraftingList(current => includeMuseumGoals(current, goals));
              setSelected(goals[0].id); setQuantity(goals[0].quantity); setSelectedMethodKind(goals[0].method);
              calculatorScrollRef.current?.closest(".recipes-planner")?.scrollIntoView({ block: "start" });
            }} />
            {chosen && selectedBookEntry && selectedMethod && (
              <div className="recipes-reference-area profile-glass">
                    {alternativeRoutes.length > 0 && (
                      <AlternativeAcquisitionRoutes itemKey={selected!} routes={alternativeRoutes} />
                    )}

                    <details className="recipes-reference">
                      <summary className={FOCUS}>
                        <ListTree aria-hidden="true" />
                        <span><strong>Recipe reference</strong><small>Uses and full material tree</small></span>
                        <ChevronDown aria-hidden="true" />
                      </summary>
                      <div className="recipes-reference-body">
                        <UsedInSection item={chosen} items={enriched} onPick={setSelected} />
                        {activeRecipe && (
                          <section className={`recipes-tree${treeOpen ? " is-open" : ""}`}>
                            <button type="button" aria-expanded={treeOpen} aria-controls="recipes-full-tree" onClick={() => setTreeOpen((open) => !open)} className={FOCUS}>
                              <span><small>Full calculation</small><strong>Recursive material tree</strong></span>
                              <span className="recipes-tree-state">
                                {planPending ? "building" : planFailed ? "unavailable" : "craft and buy decisions"}
                                <ChevronDown />
                              </span>
                            </button>
                            {treeOpen && (
                              <div id="recipes-full-tree" className="recipes-tree-body">
                                {planPending ? (
                                  <p className="recipes-plan-state" role="status">Building the full material tree…</p>
                                ) : planFailed || !tree ? (
                                  <p className="recipes-plan-state is-error">The full material tree is unavailable.</p>
                                ) : (
                                  <div className="recipes-tree-table overflow-x-auto">
                                    <TreeHead ironman={ironman} owned={owned.has ? owned : null} />
                                    <TreeRow node={tree} defaultOpen ironman={ironman} owned={owned.has ? owned : null} allocation={allocation?.root} />
                                  </div>
                                )}
                              </div>
                            )}
                          </section>
                        )}
                      </div>
                    </details>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );

};

export default ItemsPage;
