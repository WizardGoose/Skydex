import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, X, Plus, Minus, RotateCcw, Package, TriangleAlert, PencilRuler, Check, Undo2, ChevronRight, Route, Undo, Info, Menu } from "lucide-react";
import { useGreenhouseData, useDesigner } from "../context";
import { CropImage } from "../components/shared/CropImage";
import { usePlannerState } from "../planner/usePlannerState";
import { useTargetCatalogue, type CatalogueTarget } from "../planner/useTargetCatalogue";
import { buildSolverPlan, collectMutations, type SolverPlanNode } from "../planner/solverPlan";
import { useSolverEconomies } from "../planner/useSolverEconomies";
import { DEFAULT_SIZING_MODE, sizingFor } from "../planner/plotSizing";
import type { PlotEconomy } from "../planner/solverPlan";
import { FULL_GRID, useSolvedLayout } from "../planner/useSolvedLayout";
import { SolvedGridView, SolvedSummary } from "../planner/SolvedGridView";
import { cropIconSrc } from "../planner/icons";
import type { CropDefinition, MutationDefinition } from "../types/greenhouse";
import { PANEL, LABEL, NUM, RARITY, Bar, PageHeader, Tag, FOCUS, INPUT, BTN_PRIMARY, BTN_QUIET, SplitPage } from "../../ui/kit";
import { InventoryPanel } from "../../components/common/InventoryPanel";
import { useOwned, describeSources, dominantSource, SOURCE_LABEL, type OwnedSource } from "../../inventory";
import { withMutationIds } from "../planner/mutationBridge";
import { needSplit } from "../planner/needSplit";

/**
 * What colour a source chip is.
 *
 * These are game colours, not interface colours, so they come off the
 * `--color-stat-*` tokens the site already reserves for game data rather than
 * off the slate/emerald interface palette. Every value is a complete literal
 * class string: Tailwind scans source text, so a constructed name like
 * `text-${tone}` never reaches the stylesheet, and this project has been bitten
 * by that before.
 *
 * Two of these matter most in practice: backpacks
 * are the orange-amber of the bag itself, and the ender chest keeps its purple.
 * The rest are picked to stay distinguishable from those two and from each
 * other, so a glance down the column separates them without reading.
 */
const SOURCE_TONE: Record<OwnedSource, string> = {
  "island.sacks": "text-stat-green",
  "island.chests": "text-stat-yellow",
  "island.inventory": "text-stat-white",
  "island.enderChest": "text-stat-dark-purple",
  "island.storage": "text-stat-gold",
  shards: "text-stat-aqua",
  // Never rendered as a chip: a number you typed shows the undo control instead.
  manual: "text-slate-300",
};
import { ItemIcon } from "../../ui/ItemIcon";
import { WikiLink } from "../../ui/WikiLink";
import { formatDuration } from "../planner/time";
import { RouteLine } from "../planner/RouteLine";
import {
  buildPlanEstimates,
  gateStock,
  harvestWindowLabel,
  hasSpread,
  planProgress,
  planUnitMaps,
  fillLabel,
  plantingBreakdownLabel,
  plantingCount,
  plantingTotals,
  progressPctLabel,
  progressRow,
  snapshotRows,
  SUPPORT_RULE_NOTE,
  type PlanProgressRow,
} from "../planner/planEstimates";
import { WikiStatus } from "../data/WikiStatus";
import { GreenhouseSettings, PlannerOptionsList, type GreenhouseGrowth } from "../components/calculator/GreenhouseSettings";
import { setManualGreenhouseStats, useGreenhouseStats } from "../../island/profileStats";
import { currentAccess, hasApiProfileAccess } from "../../island/apiKey";
import { manualGreenhouseLayer, resolveGrowth } from "../planner/growthSource";
import { parseGreenhouseHash } from "../route";

/**
 * A caption that earned a hover instead of a paragraph.
 *
 * The rule this enforces: any explanatory prose longer than two lines becomes
 * a glyph. A 260px sidebar cannot afford a five line note about where owned
 * counts came from sitting permanently under the control it describes, and the
 * page cannot afford orphaned blocks of 10px grey text between its panels
 * either. The text is not deleted, it is one hover away, and the glyph is
 * `title`-driven so it works for keyboard focus and screen readers without a
 * popover implementation of its own.
 *
 * `text-slate-400` rather than `text-slate-500`: this is the smallest control
 * on the page and it still has to clear AA on the panel ground.
 */
const InfoGlyph: React.FC<{ label: string; className?: string }> = ({ label, className = "" }) => (
  <span
    tabIndex={0}
    role="note"
    aria-label={label}
    title={label}
    className={`inline-flex shrink-0 cursor-help items-center text-slate-400 hover:text-emerald-300 ${FOCUS} ${className}`}
  >
    <Info className="h-3 w-3" />
  </span>
);

/**
 * The ledger's column ruler.
 *
 * Every cycle row is its own grid rather than one grid holding every row,
 * because the rows need their own hover, tint and hairline. That only stays
 * aligned if the template is fixed rather than content-derived, which is why
 * these are pixel columns and not `max-content`.
 *
 * The layout answers a specific complaint: `justify-between` stretched the name
 * to one edge and the numbers to the other, so at 2560px roughly nine hundred
 * pixels of nothing sat between a mutation and its own figures and the eye had
 * to travel the whole width to pair them up. Now the name has a fixed 200px
 * lane and the numbers start immediately after it, at the same place on every
 * row and every monitor. The slack that used to live in the middle is pushed
 * into the last column, behind the bar, where it costs nothing.
 *
 * Both strings are written out in full. Tailwind scans source text, so a
 * template literal assembling a column list never reaches the stylesheet.
 */
const ROW_GRID_TIMED = "lg:grid lg:grid-cols-[200px_260px_96px_128px_minmax(0,1fr)] lg:gap-x-3";
const ROW_GRID_PLAIN = "lg:grid lg:grid-cols-[200px_260px_minmax(0,1fr)] lg:gap-x-3";

/**
 * The reading measure for the ledger and the focus card.
 *
 * A table of eleven point numbers does not get more readable by being two
 * thousand pixels wide, it gets harder to track across. Capped and anchored
 * left rather than centred, so it stays in line with the sidebar beside it and
 * with every other panel on the page.
 */
const TABLE_WIDTH = "max-w-[1100px]";

/**
 * The grind tracker.
 *
 * Layout is deliberately flat and predictable rather than decorative: one
 * status strip, one "what to do now" block, one ledger of everything else.
 * Numbers are monospaced so columns line up when you are scanning them mid
 * grind. Radius rule: panels and controls use `rounded-md`, plot cells use
 * `rounded-[2px]`. Accent is emerald everywhere, no second accent.
 *
 * Names go to the wiki. Mutations, targets and their ingredients are all
 * things you end up wanting to read about mid grind, so they are links, with
 * the article derived from the name rather than looked up. The icon beside
 * them tries the bundled crop art first and the wiki image second, which is
 * what stops a missing local asset from leaving a row iconless.
 */

export const PlannerPage: React.FC = () => {
  const { crops, mutations, isLoading } = useGreenhouseData();
  const { targets: catalogue, items: itemIndex, loading: catalogueLoading } = useTargetCatalogue(useMemo(() => mutations.map((m) => m.id), [mutations]));
  const planner = usePlannerState();
  const { state, setView, setGrowth } = planner;

  /**
   * Greenhouse stats the Hypixel API can answer for itself. Only Growth Speed
   * tier is actually exposed; the other three come back null and the settings
   * panel says why rather than pretending it looked. Anything the player edits
   * by hand wins from that point on, same as every other override on the site.
   *
   * This is the RESOLVED view: the store lays the manual layer over the API
   * values before publishing, so what arrives here is already "whoever won".
   */
  const apiStats = useGreenhouseStats();

  /**
   * Hand the store the numbers the player typed.
   *
   * The store owns the API half and resolves precedence; the planner owns the
   * manual half and persists it. Seeding it on mount, and again whenever a typed
   * value changes, is what makes a typed number survive a reload as an override
   * rather than as an anonymous figure the next API answer is free to overwrite.
   * An absent typed value passes `undefined`, which withdraws the override and
   * lets the API value show through again, so "Clear everything" hands the field
   * back rather than pinning the last number forever.
   *
   * Both stats the API can answer go in one call, because the store REPLACES the
   * manual record rather than merging into it. `manualGreenhouseLayer` requires
   * both keys for exactly that reason, so a half layer is a compile error rather
   * than a silent withdrawal of whichever field was left out.
   *
   * Keyed on the two typed numbers rather than on `state.growth`, deliberately.
   * The store republishes to every subscriber on each call, and the growth blob
   * gets a new identity whenever any of its fields move, so keying on the object
   * would re-seed an identical layer and notify the site every time somebody
   * nudged the Crop Growth slider.
   */
  const typedSpeedTier = state.growth.speedTierManual;
  const typedPlots = state.growth.plotsManual;
  useEffect(() => {
    setManualGreenhouseStats(manualGreenhouseLayer({ speedTier: typedSpeedTier, plots: typedPlots }));
  }, [typedSpeedTier, typedPlots]);

  /**
   * The greenhouse settings the whole page runs on.
   *
   * One number, resolved once: the tier the player typed, else the one the API
   * gave, else the last resolved tier out of storage. Both the settings panel
   * and `buildPlanEstimates` read this, which is what stops the "from API" chip
   * from advertising a value the estimates never saw.
   */
  const growth = useMemo(() => resolveGrowth(state.growth, apiStats), [state.growth, apiStats]);

  /**
   * Profile access exists, but no garden pull has ever landed.
   *
   * The pull is gated on a connected account, and connecting is a separate
   * step from enabling the transport. So a player who has not connected an
   * account gets silence: every pull returns nothing and the tier row looks
   * exactly like the three stats that are manual forever by design. That is
   * the state this flag exists to name.
   *
   * `fetchedAt` is stamped by the store rather than the parser, so it reads as
   * "the store has an answer", which is the question being asked here.
   */
  const awaitingProfile = hasApiProfileAccess(currentAccess()) && apiStats.fetchedAt === null;

  /**
   * Mirror the resolved tier into storage.
   *
   * Only the auto-fill path ever moves this: when the player has typed a tier,
   * the resolved value IS their typed value and this is a no-op. So it can
   * never write over an override, and it is what lets a player who has never
   * typed one keep the API's tier through a reload or an offline session.
   */
  useEffect(() => {
    if (growth.speedTier === state.growth.speedTier) return;
    setGrowth("speedTier", growth.speedTier);
  }, [growth.speedTier, state.growth.speedTier, setGrowth]);

  /**
   * The settings panel speaks `GreenhouseGrowth`, which is the planner's
   * `GrowthConfig` minus `uniqueCrops`. That field is derived from the plan
   * rather than set by the user, so the control grid has no business offering
   * it. The key set is a strict subset, so this is only a variance adapter and
   * never widens what the panel is allowed to write.
   *
   * Speed tier and plots are routed rather than written straight through. They
   * are the two stats with an automatic value underneath them, so typing either
   * is an override and has to be recorded as one: the store is told, and the
   * typed number is persisted as the manual layer. The resolved values then come
   * back through `growth` above, so there is still exactly one writer for each
   * number the estimates read.
   *
   * Writing the mirror instead would be the quiet version of this bug. A mirror
   * is the LOWEST of the three precedence steps, so an edit that landed there
   * would be outranked by the API's answer and resolved away on the very next
   * render: the control would look editable and be read only for anybody with a
   * profile connection, which is worse than never auto-filling it at all.
   *
   * Each branch sends ONE layer carrying BOTH typed numbers, the one it just
   * changed and the one it did not. The store replaces the manual record rather
   * than merging into it, so a plots-only call would withdraw the tier override
   * and a tier-only call would withdraw plots.
   */
  const setGrowthField = useCallback(
    <K extends keyof GreenhouseGrowth>(key: K, value: GreenhouseGrowth[K]) => {
      if (key === "speedTier") {
        const tier = value as number;
        setManualGreenhouseStats(manualGreenhouseLayer({ speedTier: tier, plots: typedPlots }));
        setGrowth("speedTierManual", tier);
        return;
      }
      if (key === "plots") {
        const count = value as number;
        setManualGreenhouseStats(manualGreenhouseLayer({ speedTier: typedSpeedTier, plots: count }));
        setGrowth("plotsManual", count);
        return;
      }
      (setGrowth as (k: string, v: unknown) => void)(key, value);
    },
    [setGrowth, typedSpeedTier, typedPlots]
  );

  const [query, setQuery] = useState("");
  const [inventoryQuery, setInventoryQuery] = useState("");
  // Narrow viewports collapse the rail behind one button, same as every split page.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { loadFromSolverResult } = useDesigner();
  const navigate = useNavigate();
  const location = useLocation();

  const dataset = useMemo(
    () => ({
      crops: Object.fromEntries(crops.map((c) => [c.id, c])) as Record<string, CropDefinition>,
      mutations: Object.fromEntries(mutations.map((m) => [m.id, m])) as Record<string, MutationDefinition>,
    }),
    [crops, mutations]
  );

  const catalogueById = useMemo(() => new Map(catalogue.map((t) => [t.id, t])), [catalogue]);

  const linkedTarget = useMemo(() => {
    const { tool, search } = parseGreenhouseHash(location.hash);
    if (tool !== "planner") return null;
    const match = search.match(/[?&]target=([^&]*)/);
    if (!match?.[1]) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }, [location.hash]);

  useEffect(() => {
    if (!linkedTarget || state.targets.some((target) => target.id === linkedTarget)) return;
    if (mutations.some((mutation) => mutation.id === linkedTarget)) {
      planner.addTarget(linkedTarget, "mutation");
    } else if (catalogueById.has(linkedTarget)) {
      planner.addTarget(linkedTarget, "item");
    }
  }, [catalogueById, linkedTarget, mutations, planner, state.targets]);

  /**
   * What you already own, from your island as well as from what you typed.
   *
   * A greenhouse mutation id is the same slug the crafting index uses, so
   * `itemIndex` bridges it to a Hypixel id and the island feed answers in those.
   * `state.inventory` is passed as the manual layer, which means the read API
   * decides precedence rather than this page doing it twice in two places.
   *
   * The rule, stated here because this is where a player would be hurt by
   * getting it wrong: **a number you typed always wins.** A sync never
   * overwrites it, never quietly adds to it, and never puts it back after you
   * clear it. Auto-filling is a convenience for the rows you have not touched.
   */
  const bridgeIndex = useMemo(() => withMutationIds(itemIndex, mutations), [itemIndex, mutations]);
  const owned = useOwned({ items: bridgeIndex, manual: state.inventory });

  /**
   * Whether sacks are part of what we just read.
   *
   * A snapshot taken before the mod could capture sacks carries none, and the
   * copy must not imply otherwise: telling a player their sack contents are
   * included when the snapshot has no sacks in it is how a tool loses trust.
   */
  const sacksSeen = owned.sources.includes("island.sacks");

  /**
   * The stock the plan is actually solved against.
   *
   * Auto-filled counts have to reach the solver or the page contradicts itself:
   * showing "you own 400" beside a plan that still asks you to grow 400 is
   * worse than not showing the number at all. `owned.count` has already applied
   * precedence, so a typed 0 arrives here as 0 rather than as the stale island
   * figure underneath it.
   *
   * Filtered to ids the greenhouse dataset knows, because the island index
   * carries thousands of items the solver has no use for. Typed numbers for
   * anything else are carried through anyway - they are still the player's word.
   */
  const effectiveInventory = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of [...Object.keys(dataset.mutations), ...Object.keys(dataset.crops)]) {
      const n = owned.count(id);
      if (n !== undefined && n > 0) out[id] = n;
    }
    for (const [id, n] of Object.entries(state.inventory)) {
      if (!(id in out) && n > 0) out[id] = n;
    }
    return out;
  }, [owned, dataset, state.inventory]);

  const planTargets = useMemo(() => {
    const acc = new Map<string, number>();
    for (const t of state.targets) {
      if (t.kind === "mutation") {
        acc.set(t.id, (acc.get(t.id) ?? 0) + t.qty);
        continue;
      }
      const item = catalogueById.get(t.id);
      if (!item) continue;
      for (const ing of item.ingredients) {
        if (!ing.mutation) continue;
        acc.set(ing.mutation, (acc.get(ing.mutation) ?? 0) + ing.qty * t.qty);
      }
    }
    return [...acc.entries()].map(([id, qty]) => ({ id, qty }));
  }, [state.targets, catalogueById]);

  const involved = useMemo(
    () => (planTargets.length && mutations.length ? collectMutations(planTargets, dataset) : []),
    [planTargets, dataset, mutations.length]
  );
  /*
   * Two stages, and the second one is the fix for "the recipe needs 2, the plan
   * grows 46".
   *
   * STAGE ONE solves every mutation MAXIMIZED, which is the question it always
   * asked and the one the shipped precompute answers, so the opening burst
   * costs exactly what it did.
   *
   * STAGE TWO reads the plan that came out of stage one, asks `plotSizing` how
   * big each row actually has to be, and re-solves only the rows that are
   * smaller than a full plot. Large plans produce an empty sizing map and never
   * reach the solver a second time.
   *
   * The provisional plan is built from the maximized economies alone, so this is
   * a pipeline rather than a feedback loop: stage two cannot change what stage
   * one asked for, and there is no path here that re-renders itself.
   */
  /*
   * How big each plot actually has to be, asked of the plan itself.
   *
   * Sized against the SAME spawn chance the estimate runs on. Bioanalysis
   * genuinely lowers the spot count needed for the same confidence, and a
   * layout sized on a different chance than the clock is priced on would put
   * the two back out of step, which is the defect being fixed.
   */
  /**
   * The ingredients the player has said to grow rather than spend.
   *
   * A Set so `buildSolverPlan` can ask it directly, memoised on the stored map
   * so the plan is not rebuilt for a new Set of the same ids.
   */
  const growFresh = useMemo(
    () => new Set(Object.keys(state.growFresh).filter((id) => state.growFresh[id])),
    [state.growFresh]
  );

  const refine = useCallback(
    (economies: Record<string, PlotEconomy | null>, fullYields: Record<string, number>) => {
      if (!planTargets.length || !mutations.length) return {};
      const so_far = buildSolverPlan(planTargets, dataset, economies, effectiveInventory, growFresh);
      /*
       * Per row, defaulting to minimal. Handing a lookup rather than one mode
       * is what keeps a row switched to "confident" from resizing the eleven
       * tiers underneath it: those keep answering minimally, against the larger
       * demand the switched row now makes.
       */
      return sizingFor(so_far, dataset.mutations, fullYields, { bioanalysis: growth.bioanalysis }, (id) => state.sizing[id] ?? DEFAULT_SIZING_MODE);
    },
    [planTargets, dataset, effectiveInventory, growth.bioanalysis, mutations.length, growFresh, state.sizing]
  );

  /*
   * Everything except the mutation set that changes what `refine` answers.
   *
   * `useSolverEconomies` holds `refine` in a ref rather than a dependency, so
   * without this the only thing that could re-run the sizing loop was the set
   * of mutations involved. Switching one row to "grow faster" leaves that set
   * identical, so the button would have moved nothing at all. The same silence
   * covered a stock edit and a "grow instead" flip, which change a row's need
   * and therefore its size.
   *
   * A string rather than the values themselves because it is a dependency, and
   * these are all fresh objects on nearly every render.
   */
  const refineKey = useMemo(
    () =>
      JSON.stringify([
        planTargets,
        Object.entries(effectiveInventory).sort(),
        [...growFresh].sort(),
        Object.entries(state.sizing).sort(),
        growth.bioanalysis,
        mutations.length,
      ]),
    [planTargets, effectiveInventory, growFresh, state.sizing, growth.bioanalysis, mutations.length]
  );

  const economy = useSolverEconomies(involved, refine, refineKey);

  const plan = useMemo(
    () =>
      planTargets.length && mutations.length
        ? buildSolverPlan(planTargets, dataset, economy.economies, effectiveInventory, growFresh)
        : null,
    [planTargets, dataset, economy.economies, effectiveInventory, mutations.length, growFresh]
  );

  const doneFor = (n: SolverPlanNode) => Math.min(state.progress[n.id] ?? 0, n.plots ?? 0);

  /** Every schedulable row of the plan, flat. Both rollups walk it. */
  const planNodes = useMemo(() => (plan ? plan.cycles.flatMap((c) => c.produce) : []), [plan]);

  /**
   * The plan reduced to progress rows, THROUGH THE SNAPSHOT SHAPE.
   *
   * This page could read its own solver nodes directly and for a long time it
   * did, while the Dashboard rebuilt equivalent rows from the persisted
   * snapshot. Two constructions for one set of numbers, and the inevitable
   * happened: the two pages printed different percentages for one state.
   *
   * So the plan is folded into the unit maps it is about to persist, and then
   * read back out through `snapshotRows`, which is the same function the
   * Dashboard calls on the same maps. The rows this page renders are literally
   * the rows the Dashboard will render. What is left is only freshness - the
   * Dashboard's copy is as of the last visit here - and freshness has an
   * authoritative answer rather than an arithmetic one.
   *
   * `planUnitMaps` returning null is exactly the condition under which no
   * snapshot is written at all: a row with no solver yield cannot state its
   * units and cannot state its plantings either. On that path the live rows
   * stand, because there is no Dashboard copy of this state to agree with.
   */
  const rowSet = useMemo(() => {
    if (!plan) return null;

    const live = planNodes.map(progressRow);

    /*
     * `plots` first, and a missing one abandons the round trip rather than
     * standing in a zero. A zero planting count is a real answer meaning "your
     * stock covered it", so writing one for a row that simply has no answer yet
     * would be a lie the reader has no way to spot.
     */
    const plots: Record<string, number> = {};
    let complete = true;
    for (const n of planNodes) {
      if (n.plots === undefined) complete = false;
      else plots[n.id] = n.plots;
    }

    const units = complete ? planUnitMaps(live) : null;
    if (units) return { ...snapshotRows({ plots, ...units }), units, plots };

    const byId: Record<string, PlanProgressRow> = {};
    for (const row of live) byId[row.id] = row;
    return { rows: live, byId, unitIds: new Set(live.map((r) => r.id)), units: null, plots: null };
  }, [plan, planNodes]);

  /**
   * The gate, applied here for the same reason the Dashboard applies it: a
   * supplied stock figure outranks a row's own numbers, so it may only reach
   * rows whose demand is counted in items. `owned.count` has already settled
   * precedence - a number the player typed beats an island sync - and progress
   * must not re-decide that.
   */
  const stockOf = useMemo(
    () => (rowSet ? gateStock(rowSet.unitIds, (id: string) => owned.count(id)) : () => undefined),
    [rowSet, owned]
  );

  /** One row, by id, so a bar and its rollup cannot describe different things. */
  const rowFor = (n: SolverPlanNode): PlanProgressRow => rowSet?.byId[n.id] ?? progressRow(n);

  /**
   * Honest wall clock for every row, cycle and the plan as a whole.
   *
   * This is the same function `pnpm check` calls, so the terminal and this
   * page cannot print different totals. A spot is a chance, not a harvest, so
   * these are expected times with a p90 spread rather than the old best case.
   */
  const estimates = useMemo(
    () => (plan ? buildPlanEstimates(plan, dataset, economy.economies, growth, state.progress) : null),
    [plan, dataset, economy.economies, growth, state.progress]
  );

  /**
   * Plantings, counted the way a person counts them.
   *
   * A planting is a thing you do, and stock you already hold is a thing you did
   * not have to do - which the plan already knows, because that stock is
   * precisely what turned Choconut's 37 plantings into 34. So the counter
   * credits those three rather than pretending the row is untouched, and the
   * denominator goes back to what the plan asked for before the discount. That
   * is the same "3 of 37" the ledger row shows, summed.
   *
   * It is still not the headline percentage. That is unit weighted below, and
   * counting only plantings is what made the site read 0% at a player holding
   * 429 mutations.
   */
  const overall = useMemo(
    () => (rowSet ? plantingTotals(rowSet.rows, state.progress) : { credited: 0, ticked: 0, done: 0, raw: 0 }),
    [rowSet, state.progress]
  );

  /**
   * The headline: how much of the plan is actually covered, in units.
   *
   * Unit weighted and clamped per item, in `planEstimates` so the Dashboard
   * reads the same number from the same function over the same rows rather than
   * growing a second opinion.
   */
  const progress = useMemo(
    () => (rowSet ? planProgress(rowSet.rows, stockOf, state.progress) : null),
    [rowSet, stockOf, state.progress]
  );

  /** Unit progress for one row, so a bar and its cycle rollup cannot disagree. */
  const progressOf = (nodes: SolverPlanNode[]) => planProgress(nodes.map(rowFor), stockOf, state.progress);

  /** The planting counter for one row or a group of them. Same rule everywhere. */
  const countOf = (nodes: SolverPlanNode[]) => plantingTotals(nodes.map(rowFor), state.progress);

  /**
   * What to grow right now: earliest unfinished cycle, and within it the
   * mutation with the most plantings left, since that is the real blocker.
   */
  const upNext = useMemo(() => {
    if (!plan) return null;
    for (const cycle of plan.cycles) {
      const remaining = cycle.produce
        .filter((n) => (n.plots ?? 0) > doneFor(n))
        .sort((a, b) => (b.plots ?? 0) - doneFor(b) - ((a.plots ?? 0) - doneFor(a)));
      if (remaining.length) return { cycle, node: remaining[0] };
    }
    return null;
  }, [plan, state.progress]);

  // Which mutation's plot is on screen: whatever you picked, else up-next.
  const focusId = state.view.mutation ?? upNext?.node.id ?? null;
  const focusNode = useMemo(
    () => plan?.cycles.flatMap((c) => c.produce).find((n) => n.id === focusId) ?? null,
    [plan, focusId]
  );
  /*
   * The plot on screen is the plot the row was costed at. Showing a maximized
   * 51 spawn grid beside a bill for 8 is exactly the contradiction being
   * removed, so the preview takes the same size the economics did.
   */
  /*
   * The size the row was actually costed at, read back off the economy the plan
   * used rather than tracked separately. A row that was never right-sized has an
   * economy equal to its maximized one, and passing `undefined` there keeps the
   * preview on the maximize question the shipped precompute answers for free.
   */
  const focusSpots = useMemo(() => {
    if (!focusId) return undefined;
    const used = economy.economies[focusId]?.yield;
    const full = economy.fullYields[focusId];
    return used === undefined || used === full ? undefined : used;
  }, [focusId, economy.economies, economy.fullYields]);

  const solved = useSolvedLayout(focusId ? [focusId] : null, FULL_GRID, focusSpots);

  const openInDesigner = () => {
    if (!solved.result) return;
    loadFromSolverResult(
      solved.result.placements.map((p) => ({ id: p.crop, name: dataset.crops[p.crop]?.name ?? p.crop, position: p.position, size: p.size })),
      solved.result.mutations.map((m) => ({ id: m.mutation, name: dataset.mutations[m.mutation]?.name ?? m.mutation, position: m.position, size: m.size }))
    );
    navigate("/greenhouse#designer");
  };

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(state.targets.map((t) => t.id));
    const items = catalogue.filter((t) => !chosen.has(t.id) && (!q || t.name.toLowerCase().includes(q))).map((t) => ({ kind: "item" as const, id: t.id, name: t.name, target: t }));
    const muts = mutations.filter((m) => !chosen.has(m.id) && (!q || m.name.toLowerCase().includes(q))).map((m) => ({ kind: "mutation" as const, id: m.id, name: m.name, mutation: m }));
    return [...items, ...muts].slice(0, q ? 30 : 10);
  }, [query, catalogue, mutations, state.targets]);

  /**
   * Which mutations the "Already own" panel lists when you are not searching.
   *
   * Anything you have said something about, plus anything your island reports
   * holding. Without the second half a synced count would only ever appear if
   * you happened to search for it, which defeats the point of syncing.
   */
  const inventoryRows = useMemo(() => {
    const q = inventoryQuery.trim().toLowerCase();
    const listed = new Set([...Object.keys(state.inventory), ...Object.keys(effectiveInventory)]);
    return mutations.filter((m) => (!q ? listed.has(m.id) : m.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  }, [mutations, state.inventory, effectiveInventory, inventoryQuery]);

  /**
   * The rows actually held, independent of the search box, because the panel's
   * count chip and summary describe what you own and must not swell to thirty
   * while you are mid-search for something to add.
   */
  const heldRows = useMemo(() => {
    const listed = new Set([...Object.keys(state.inventory), ...Object.keys(effectiveInventory)]);
    return mutations.filter((m) => listed.has(m.id));
  }, [mutations, state.inventory, effectiveInventory]);

  /**
   * The panel's one line summary, stating only what the data actually says.
   *
   * Each held row contributes its units to exactly one bucket, by the same
   * precedence rule the rows themselves render: a typed number replaces the
   * island's answer outright, so an overridden row counts as "set by you" and
   * its underlying source counts are NOT also summed, which would double-tell
   * the story of stock the player has explicitly re-stated. Non-overridden
   * rows split by source so the line reads like the chips do: "245 from
   * backpack, 16 from sacks". Sources with nothing to say get no mention.
   */
  const inventorySummary = useMemo(() => {
    if (heldRows.length === 0) return null;
    const bySource = new Map<OwnedSource, number>();
    let typed = 0;
    for (const m of heldRows) {
      const entry = owned.get(m.id);
      if (!entry) {
        typed += state.inventory[m.id] ?? 0;
        continue;
      }
      if (entry.overridden) {
        typed += entry.manual ?? 0;
        continue;
      }
      for (const s of entry.sources) {
        if (s.count > 0) bySource.set(s.source, (bySource.get(s.source) ?? 0) + s.count);
      }
    }
    const parts = [...bySource.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([source, n]) => `${n.toLocaleString()} from ${SOURCE_LABEL[source]}`);
    if (typed > 0) parts.push(`${typed.toLocaleString()} set by you`);
    return `${heldRows.length} item type${heldRows.length === 1 ? "" : "s"} held${parts.length ? `, ${parts.join(", ")}` : ""}`;
  }, [heldRows, owned, state.inventory]);

  const targetLabel = useMemo(
    () =>
      state.targets.length === 0
        ? null
        : state.targets
            .map((t) => `${t.qty > 1 ? `${t.qty}x ` : ""}${catalogueById.get(t.id)?.name ?? mutations.find((m) => m.id === t.id)?.name ?? t.id}`)
            .join(", "),
    [state.targets, catalogueById, mutations]
  );

  /**
   * Leave the finished plan behind for the Dashboard.
   *
   * Only once every mutation has a solver answer, otherwise the Dashboard
   * would show a half-measured total as if it were final.
   */
  const { setSnapshot } = planner;
  useEffect(() => {
    if (!plan || !targetLabel || economy.loading.length > 0) return;
    const plots: Record<string, number> = {};
    const names: Record<string, string> = {};
    const cycleOf: Record<string, number> = {};
    const harvestWindow: Record<string, number> = {};
    const expectedSecondsOf: Record<string, number> = {};
    const expectedSecondsLeftOf: Record<string, number> = {};
    for (const cycle of plan.cycles) {
      for (const n of cycle.produce) {
        if (n.plots === undefined) return; // still incomplete, do not record
        plots[n.id] = n.plots;
        names[n.id] = n.name;
        cycleOf[n.id] = cycle.index;
        const est = estimates?.byId[n.id];
        if (est) {
          expectedSecondsOf[n.id] = est.expectedSeconds;
          expectedSecondsLeftOf[n.id] = est.expectedSecondsLeft;
          if (!est.mechanicOnly) harvestWindow[n.id] = est.harvestWindow;
        }
      }
    }
    for (const id of Object.keys(effectiveInventory)) {
      names[id] = names[id] ?? dataset.mutations[id]?.name ?? id;
    }

    /*
     * Unit demand for the Dashboard, over exactly the rows `plots` covers so
     * the two are keyed alike.
     *
     * NOT recomputed here. These are the very maps this page's own rows were
     * read back out of, so the Dashboard receives the object that produced
     * every figure on this screen rather than a second one built to match.
     * `planUnitMaps` returns all three or null, and null writes none: a reader
     * missing them weights by plantings and credits no stock, which understates
     * progress honestly, where a partial map would be trusted and be wrong.
     */
    const units = rowSet?.units ?? null;

    setSnapshot({
      plots,
      names,
      cycleOf,
      totalPlantings: plan.totalPlantings,
      cycles: plan.depth,
      targetLabel,
      updatedAt: Date.now(),
      // Additive. A Dashboard reading an older snapshot simply will not find
      // these and shows what it always showed.
      expectedSeconds: estimates?.total.expectedSeconds,
      p90Seconds: estimates?.total.p90Seconds,
      // The LEFT figures ride along so the Dashboard can SHOW the model's own
      // answer instead of re-deriving one (see PlanSnapshot for the history).
      expectedSecondsLeft: estimates?.total.expectedSecondsLeft,
      p90SecondsLeft: estimates?.total.p90SecondsLeft,
      harvestWindow,
      expectedSecondsOf,
      expectedSecondsLeftOf,
      ...(units ?? {}),
    });
  }, [plan, targetLabel, economy.loading.length, setSnapshot, effectiveInventory, dataset, estimates, rowSet]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-5 h-5 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  /*
   * Header plus the grinding-towards strip, leading the results column. The
   * strip is the plan's summary, so it reads with the results under the
   * section tabs while the controls that produced it sit in the rail under
   * the wordmark. A fragment rather than a wrapper div, so each piece takes
   * the results column's own rhythm.
   */
  const summary = (
    <>
      <PageHeader
        title="Planner"
        sub="Pick a target, work the cycles, tick off plantings"
        icon={Route}
        actions={<WikiStatus />}
      />

      {/* ---------- status strip ---------- */}
      <div className={`${PANEL} px-3 py-2.5`}>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className={LABEL}>Grinding towards</div>
            <div className="text-sm text-slate-100 truncate">{targetLabel ?? "Nothing selected"}</div>
          </div>
          {plan && (
            <div className="flex items-baseline gap-4 shrink-0">
              <div className="text-right">
                <div className={LABEL}>Plantings</div>
                {/* Credited for the plantings your stock already removed, so
                    this cannot read "0" beside a bar that is visibly part
                    filled. "to plant" is gone with it: the counter no longer
                    means remaining-only. */}
                <div
                  className={`text-sm text-slate-200 ${NUM}`}
                  title={`${overall.credited.toLocaleString()} of ${overall.raw.toLocaleString()} plantings removed by what you already own, ${overall.ticked.toLocaleString()} ticked off.`}
                >
                  {overall.done.toLocaleString()} / {overall.raw.toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className={LABEL}>Cycles</div>
                <div className={`text-sm text-slate-200 ${NUM}`}>{plan.depth}</div>
              </div>
              {state.options.showTime && estimates && (
                <div className="text-right">
                  <div className={LABEL}>Time left</div>
                  <div className={`text-sm text-slate-200 ${NUM}`}>
                    {estimates.total.expectedSecondsLeft > 0 ? `~${formatDuration(estimates.total.expectedSecondsLeft)}` : "done"}
                  </div>
                  {hasSpread(estimates.total.expectedSecondsLeft, estimates.total.p90SecondsLeft) && (
                    <div
                      className={`text-[11px] text-slate-500 ${NUM}`}
                      title="Joint across every row of the plan: unlucky rows and lucky rows offset, so this sits close to the expected total. It is never below any single row's own 90% figure."
                    >
                      90% within {formatDuration(estimates.total.p90SecondsLeft)}
                    </div>
                  )}
                </div>
              )}
              <div className="text-right">
                <div className={`${LABEL} flex items-center justify-end gap-1`}>
                  Done
                  {state.options.showTime && estimates && <InfoGlyph label={`Assumed. ${SUPPORT_RULE_NOTE}`} />}
                </div>
                <div
                  className={`text-lg text-emerald-400 ${NUM} leading-tight`}
                  title={
                    progress
                      ? `${progress.ownedUnits.toLocaleString()} owned and ${Math.round(progress.harvestedUnits).toLocaleString()} harvested, of ${progress.wantedUnits.toLocaleString()} the plan needs`
                      : undefined
                  }
                >
                  {progressPctLabel(progress?.pct ?? 0)}%
                </div>
              </div>
            </div>
          )}
        </div>
        {plan && progress && <Bar done={progress.harvestedUnits} owned={progress.ownedUnits} total={progress.wantedUnits} className="mt-2" />}
      </div>

      {economy.loading.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-[12px] text-emerald-200">
          <div className="w-3 h-3 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin shrink-0" />
          Measuring plot yields with the solver, {economy.progress.done} of {economy.progress.total} done.
        </div>
      )}

    </>
  );

  return (
    /* The signature split: controls in the rail under the logo, the plan
       under the section tabs. Same furniture positions as every page. */
    <SplitPage
      railLabel="Planner controls"
      rail={
        <>
          {/* Narrow viewports collapse the rail behind one button. */}
          <div className="min-[900px]:hidden">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`${BTN_QUIET} w-full justify-center`}>
              {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              <span>{sidebarOpen ? "Hide" : "Show"} Controls</span>
            </button>
          </div>

          {/* ---------- rail panels ---------- */}
          <div className={`${sidebarOpen ? "block" : "hidden min-[900px]:block"} space-y-2.5`}>
          <section className={`${PANEL} p-2.5 space-y-2`}>
            <div className="flex items-center justify-between">
              {/*
                The fusion page's "Target Shard" header, worn here on
                purpose. Dot plus accent label, same classes as
                the reference, so the two pickers read as one family. What is
                under it stays the greenhouse's own multi-target list; only the
                clothes changed.
              */}
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
                <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                Targets
              </div>
              {state.targets.length > 0 && (
                <button onClick={planner.clearTargets} className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer">
                  clear
                </button>
              )}
            </div>

            {state.targets.map((t) => {
              const item = t.kind === "item" ? catalogueById.get(t.id) : null;
              const mut = t.kind === "mutation" ? mutations.find((m) => m.id === t.id) : null;
              const name = item?.name ?? mut?.name ?? t.id;
              return (
                <div key={t.id} className="flex items-center gap-1.5">
                  <WikiLink
                    name={name}
                    href={item?.wiki}
                    icon
                    iconSize={22}
                    iconSrc={item ? undefined : cropIconSrc(t.id)}
                    className="flex-1 min-w-0 text-[12px] text-slate-200"
                    nameClassName="truncate"
                  />
                  <button onClick={() => planner.setTargetQty(t.id, t.qty - 1)} className="p-0.5 text-slate-500 hover:text-white cursor-pointer" aria-label="Fewer">
                    <Minus className="w-3 h-3" />
                  </button>
                  {/* w-6, not w-5: at the 12px scale a three-digit quantity needs the extra 4px. */}
                  <span className={`w-6 text-center text-[12px] text-slate-200 ${NUM}`}>{t.qty}</span>
                  <button onClick={() => planner.setTargetQty(t.id, t.qty + 1)} className="p-0.5 text-slate-500 hover:text-white cursor-pointer" aria-label="More">
                    <Plus className="w-3 h-3" />
                  </button>
                  <button onClick={() => planner.removeTarget(t.id)} className="p-0.5 text-slate-500 hover:text-red-400 cursor-pointer" aria-label="Remove">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for a target..."
                className={`${INPUT} w-full pl-6`}
              />
            </div>

            <div className="max-h-60 overflow-y-auto scrollbar-dark divide-y divide-slate-800/70">
              {catalogueLoading && <p className="text-[11px] text-slate-500 py-1">Loading catalogue</p>}
              {searchResults.map((r) => (
                <button
                  key={`${r.kind}-${r.id}`}
                  onClick={() => planner.addTarget(r.id, r.kind)}
                  className="w-full flex items-center gap-1.5 py-1 text-left hover:bg-emerald-500/10 cursor-pointer px-1 -mx-1"
                >
                  {/* No wiki link in here: the row is already a button, and an
                      anchor inside one is both invalid and a click you did not
                      ask for. Picking the target gets you the linked name. */}
                  <ItemIcon name={r.name} src={r.kind === "item" ? undefined : cropIconSrc(r.id)} size={20} />
                  <span className="flex-1 text-[12px] text-slate-300 truncate">{r.name}</span>
                  {r.kind === "mutation" && <span className={`text-[11px] ${RARITY[r.mutation.rarity]}`}>{r.mutation.rarity}</span>}
                </button>
              ))}
            </div>
          </section>

          {/*
            The fusion sidebar's Inventory panel, replicated here to keep the
            two pages' gui elements aligned. Same primitive, same header row,
            same count chip
            and summary line; what changed is only the container. The rows,
            the search-to-add input, and every precedence rule underneath
            (typed number beats island sync, undo hands the row back) are
            exactly what they were under the old "Already own" heading. The
            provenance note rides beside the summary now instead of in the
            heading, same hover it always was.
          */}
          <InventoryPanel
            icon={Package}
            count={heldRows.length > 0 ? `${heldRows.length} item${heldRows.length !== 1 ? "s" : ""}` : null}
            summary={
              inventorySummary && (
                <span className="flex items-center gap-1.5">
                  <span>{inventorySummary}</span>
                  {owned.has && (
                    <InfoGlyph
                      label={
                        `Tagged counts were read from your island data, and the tag says where they are sitting` +
                        (sacksSeen
                          ? `, sacks and containers included.`
                          : `. No sack data yet, so this is chests, inventory, ender chest and backpacks.`) +
                        ` Type over one to set your own and it wins from then on, until you undo it. Owned counts are already taken off the plan below.`
                      }
                    />
                  )}
                </span>
              )
            }
            headerExtra={
              Object.keys(state.inventory).length > 0 ? (
                <button onClick={planner.clearInventory} className="text-[11px] text-slate-500 hover:text-slate-300 cursor-pointer">
                  clear
                </button>
              ) : undefined
            }
          >
            <input
              value={inventoryQuery}
              onChange={(e) => setInventoryQuery(e.target.value)}
              placeholder="Search to add"
              className={`${INPUT} w-full`}
            />
            <div className="max-h-64 overflow-y-auto scrollbar-dark space-y-0.5">
              {inventoryRows.map((m) => {
                const entry = owned.get(m.id);
                /*
                 * Three states per row, and the player can always tell which
                 * one they are looking at:
                 *
                 *   synced    the island reported it and you have not typed
                 *             anything, so the box shows the island's number
                 *             and carries the "island" chip.
                 *   yours     you typed something. It wins outright, it is
                 *             marked, and the undo button hands the row back
                 *             to the island number.
                 *   plain     nobody has anything to say yet. No chip, because
                 *             there is nothing to disambiguate.
                 */
                const auto = owned.auto(m.id);
                const overridden = entry?.overridden ?? false;
                const value = entry?.total ?? 0;
                return (
                  <div key={m.id} className="flex items-center gap-1.5">
                    <WikiLink
                      name={m.name}
                      icon
                      iconSize={18}
                      iconSrc={cropIconSrc(m.id)}
                      className="flex-1 min-w-0 text-[12px] text-slate-400"
                      nameClassName="truncate"
                    />
                    {auto !== undefined &&
                      (overridden ? (
                        <button
                          onClick={() => planner.clearInventoryEntry(m.id)}
                          className={`p-0.5 rounded-sm text-slate-500 hover:text-emerald-300 cursor-pointer ${FOCUS}`}
                          title={`Yours. Undo to go back to ${auto.toLocaleString()} from your island data (${describeSources(entry)}${sacksSeen ? "" : ", no sack data yet"})`}
                          aria-label={`Use the island count for ${m.name}`}
                        >
                          <Undo className="w-3 h-3" />
                        </button>
                      ) : (
                        (() => {
                          /*
                           * The chip names where the count actually is. Colour
                           * lives on a child span rather than on the Tag's own
                           * className, because Tag always sets a text colour of
                           * its own and two utilities of equal specificity are
                           * settled by stylesheet order, not by which one was
                           * written last. A descendant always wins.
                           */
                          const top = dominantSource(entry);
                          if (!top) return null;
                          return (
                            <Tag title={`From your island data: ${describeSources(entry)}${sacksSeen ? "" : ". No sack data yet."}`}>
                              <span className={SOURCE_TONE[top.source]}>{SOURCE_LABEL[top.source]}</span>
                            </Tag>
                          );
                        })()
                      ))}
                    <input
                      type="number"
                      min={0}
                      value={value}
                      onChange={(e) => planner.setInventory(m.id, Number(e.target.value))}
                      title={overridden ? "Set by you. This beats your island data." : undefined}
                      /*
                       * Stays bespoke: a w-14 count box in a 260px rail cannot
                       * afford the kit INPUT's px-3, and the border doubles as
                       * the synced/overridden signal. Metrics match the shards
                       * scale anyway: translucent fill, rounded-md, 12px mono.
                       */
                      className={`w-14 px-1.5 py-1 rounded-md bg-slate-800/50 border text-[12px] text-right focus:border-emerald-500 ${NUM} ${FOCUS} ${
                        auto !== undefined && !overridden ? "border-emerald-500/40 text-emerald-200" : "border-slate-600/50 text-slate-200"
                      }`}
                    />
                  </div>
                );
              })}
              {inventoryRows.length === 0 && <p className="text-[11px] text-slate-500">{inventoryQuery ? "No match" : "Search above to add what you have"}</p>}
            </div>
          </InventoryPanel>

          {/*
            Your greenhouse is its own panel now, above Options.

            The rail reads top down in order of how much it moves the numbers:
            what you are grinding for, what you already hold, the greenhouse
            those two are measured against, and only then the display
            preferences. It was previously buried under a divider inside
            Options, which put four stats that rewrite every estimate on the
            page below three checkboxes that hide a column.

            Still behind the same toggle it always was: the stats only feed
            times, so with times off there is nothing here to set.
          */}
          {state.options.showTime && (
            <section className={`${PANEL} p-2.5`}>
              <GreenhouseSettings growth={growth} onChange={setGrowthField} stats={apiStats} awaitingProfile={awaitingProfile} />
            </section>
          )}

          <section className={`${PANEL} p-2.5 space-y-1.5`}>
            <h2 className={`${LABEL} flex items-center gap-1`}>
              Options
              <InfoGlyph label="Counts are measured with the greenhouse solver. One planting is a plot sown once and harvested once." />
            </h2>
            <PlannerOptionsList options={state.options} onChange={planner.setOption} />

            <div className="flex gap-1.5 pt-1">
              <button onClick={planner.clearProgress} className={`${BTN_QUIET} flex-1 justify-center`}>
                Reset progress
              </button>
              <button onClick={planner.resetAll} className={BTN_QUIET} title="Clear everything">
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </section>
          </div>
        </>
      }
    >
      {summary}
          {!plan && (
            <div className={`${PANEL} p-10 text-center`}>
              <p className="text-sm text-slate-400">Pick a target to start.</p>
              <p className="text-[12px] text-slate-500 mt-1">Rose Dragon Pet is a good one. It needs five legendary mutations.</p>
            </div>
          )}

          {plan && plan.unknown.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-[12px] text-amber-200">
              <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" />
              <span>Not in the greenhouse dataset, excluded: {plan.unknown.join(", ")}</span>
            </div>
          )}

          {/* ---- what to do now ---- */}
          {focusNode && (
            <section id="planner-focus" className={`${PANEL} p-3 ${TABLE_WIDTH}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap mb-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CropImage cropId={focusNode.id} cropName={focusNode.name} width={40} height={40} showGround groundType={focusNode.ground} />
                  <div className="min-w-0">
                    <div className={LABEL}>{upNext?.node.id === focusNode.id ? "Grow this next" : "Viewing"}</div>
                    <div className="flex items-baseline gap-2">
                      {/* The icon is already beside this at 40px on its ground
                          tile, so the link carries the name alone. */}
                      <WikiLink name={focusNode.name} className="text-base text-slate-100" />
                      <span className={`text-[11px] ${RARITY[focusNode.rarity ?? "common"]}`}>{focusNode.rarity}</span>
                      <span className="text-[11px] text-slate-500">cycle {focusNode.cycle + 1}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className={LABEL}>Plantings</div>
                    {/* Same rule as the ledger row and the status strip: what
                        your stock removed, plus what you have ticked, over what
                        the plan asked for before the discount. */}
                    {(() => {
                      const c = countOf([focusNode]);
                      return (
                        <div
                          className={`text-sm text-slate-200 ${NUM}`}
                          title={`${c.credited.toLocaleString()} of ${c.raw.toLocaleString()} plantings removed by what you already own, ${c.ticked.toLocaleString()} ticked off, ${(focusNode.plots ?? 0).toLocaleString()} still to sow.`}
                        >
                          {c.done.toLocaleString()} / {c.raw.toLocaleString()}
                        </div>
                      );
                    })()}
                  </div>
                  {state.options.showTime &&
                    (() => {
                      const est = estimates?.byId[focusNode.id];
                      if (!est) return null;
                      return (
                        <>
                          <div className="text-right">
                            <div className={LABEL}>Expected left</div>
                            {/* No spawn roll means no chance to cost, so there is
                                no honest time to quote here. And a covered step
                                is not "done": nothing was grown, it comes out of
                                the sack, and saying done invites the reader to
                                tick off work they never did. */}
                            <div className={`text-sm ${focusNode.covered ? "text-emerald-300" : "text-slate-200"} ${NUM}`}>
                              {focusNode.covered
                                ? "from stock"
                                : est.mechanicOnly
                                  ? "mechanic"
                                  : est.expectedSecondsLeft > 0
                                    ? `~${formatDuration(est.expectedSecondsLeft)}`
                                    : "done"}
                            </div>
                            {!est.mechanicOnly && hasSpread(est.expectedSecondsLeft, est.p90SecondsLeft) && (
                              <div className={`text-[11px] text-slate-500 ${NUM}`}>90% within {formatDuration(est.p90SecondsLeft)}</div>
                            )}
                          </div>
                          {!est.mechanicOnly && (
                            /* The actionable half: rolls land every cycle and
                               the crops are not consumed, so leaving a planting
                               standing fills more of the plot. This is where
                               that stops paying for itself. */
                            <div className="text-right">
                              <div className={LABEL}>Harvest window</div>
                              <div className={`text-sm text-emerald-300 ${NUM}`}>{harvestWindowLabel(est.harvestWindow)}</div>
                              <div className="text-[11px] text-slate-500">
                                {est.windowCappedByDecay ? "capped by decay" : `${Math.round(est.spawnChance * 100)}% per spot each cycle`}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  <button
                    onClick={() => planner.bumpProgress(focusNode.id, -1, focusNode.plots)}
                    disabled={doneFor(focusNode) === 0}
                    className="p-2 rounded-md bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 border border-slate-600/50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Undo one planting"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => planner.bumpProgress(focusNode.id, 1, focusNode.plots)}
                    disabled={doneFor(focusNode) >= (focusNode.plots ?? 0)}
                    className={BTN_PRIMARY}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Planting done
                  </button>
                  <button
                    onClick={openInDesigner}
                    disabled={!solved.result}
                    className={BTN_QUIET}
                  >
                    <PencilRuler className="w-3.5 h-3.5" />
                    Designer
                  </button>
                </div>
              </div>

              {/*
                One planting, taken apart, under the numbers it explains.

                THE DEFECT THIS CLOSES was not a wrong number, it was an
                unreadable one. "2d 14h" for a Soggybud planting is correct and
                eleven of its twenty one stages are the Melon coming up, but
                nothing on the page said so, so the only conclusion available to
                a reader who knew the Melon had to grow was that it had been
                left out. A total nobody can take apart is a total nobody can
                check, and this site's whole habit is the opposite: the
                need/have/left split, the covered steps, the provenance chips.

                One line, and only where there is something to explain. A
                mechanic-only mutation has no clock to break down and a covered
                step has no planting at all.
              */}
              {state.options.showTime &&
                !focusNode.covered &&
                (() => {
                  const est = estimates?.byId[focusNode.id];
                  if (!est || est.mechanicOnly) return null;
                  return (
                    <p className="text-[11px] text-slate-500 mb-2 leading-snug">
                      One planting is{" "}
                      <span className={`text-slate-300 ${NUM}`}>{formatDuration(est.plantingSeconds)}</span>. {plantingBreakdownLabel(est.breakdown, focusNode.name)}
                      {", at "}
                      <span className={NUM}>{formatDuration(est.breakdown.stageSeconds)}</span> a stage on this plot.
                      {/*
                        What the small plot costs, said plainly.

                        Sizing to one spot per unit is the cheapest answer in
                        crops and in placement effort, and the only thing that
                        makes it a good trade rather than a stingy one is that
                        the wait is modest and stated. So it is stated.
                      */}
                      {fillLabel(est.breakdown) && <> {fillLabel(est.breakdown)}.</>}{" "}
                      {/*
                        The tradeoff, handed over.

                        More spots fill sooner and cost more crops and more
                        placements. Neither answer is more correct, and the bug
                        was the site picking one silently, so the control sits
                        exactly where the consequence is being read rather than
                        in a settings panel two scrolls away.
                      */}
                      <button
                        onClick={() =>
                          planner.setSizing(focusNode.id, (state.sizing[focusNode.id] ?? DEFAULT_SIZING_MODE) === "minimal" ? "confident" : "minimal")
                        }
                        className="text-slate-400 hover:text-emerald-300 underline decoration-dotted underline-offset-2 cursor-pointer"
                        title={
                          (state.sizing[focusNode.id] ?? DEFAULT_SIZING_MODE) === "minimal"
                            ? `Size this ${focusNode.name} plot for 90% of the job in one sowing. Fills sooner, costs more crops and more placements.`
                            : `Size this ${focusNode.name} plot to the fewest spots that can hold the job. Cheapest in crops and placements, slower to fill.`
                        }
                      >
                        {(state.sizing[focusNode.id] ?? DEFAULT_SIZING_MODE) === "minimal" ? "grow faster: use more spots" : "use fewest spots"}
                      </button>
                    </p>
                  );
                })()}

              {/* Units, not plantings, and split so the stock you walked in
                  with is visibly not work you did. */}
              {(() => {
                const p = progressOf([focusNode]);
                return <Bar done={p.harvestedUnits} owned={p.ownedUnits} total={p.wantedUnits} className="mb-3" />;
              })()}

              {solved.loading && (
                <div className="flex items-center gap-2 text-[12px] text-slate-500 py-8 justify-center">
                  <div className="w-4 h-4 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                  Searching for the best plot
                </div>
              )}
              {solved.error && (
                <p className="text-[12px] text-amber-300 py-4 text-center">Solver unavailable ({solved.error}). It runs in your browser, so this is not a connection problem.</p>
              )}
              {solved.result && (
                /*
                 * The chips live in the gap, not under it.
                 *
                 * The summary column used to be `minmax(0,1fr)`, so on a wide
                 * monitor it was well over a thousand pixels across and the
                 * chip rows wrapped exactly nowhere: three shallow bands
                 * pinned to the top, a tall empty rectangle beside the plot
                 * preview, and the plot's own height setting the card. Bound
                 * to 300px they wrap into a column that fills that zone
                 * instead, and `w-fit` stops the pair from stretching to the
                 * card's full measure and reopening the same hole to its right.
                 */
                <div className="grid grid-cols-1 items-start gap-4 lg:w-fit lg:grid-cols-[auto_minmax(0,300px)]">
                  <SolvedGridView result={solved.result} data={dataset} cellSize={38} />
                  <div className="space-y-2.5">
                    <SolvedSummary result={solved.result} data={dataset} />
                    {focusNode.special && (
                      <p className="text-[11px] text-amber-300/90 leading-snug border-l-2 border-amber-500/40 pl-2">{focusNode.special.note}</p>
                    )}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* ---- ledger ---- */}
          {plan?.cycles.map((cycle) => {
            /*
             * "Hide finished" hides PLANTINGS you have finished. A covered step
             * is not one.
             *
             * ROOT CAUSE OF A MISSING ROW. A covered row has `plots` of 0, so
             * `doneFor(n) < n.plots` is `0 < 0`, which is false, so the filter
             * swallowed it. When a whole cycle was covered the section fell to
             * `!rows.length` below and the cycle vanished with it, which is how
             * a plan came to open at cycle 2 with no cycle 1 and no mention
             * anywhere of the Gloomgourd its plots are built from.
             *
             * The distinction is not pedantic. A finished planting is work you
             * did; a covered step is an ingredient you still have to carry out
             * and put in the ground. Hiding the second under a control that
             * promises the first is what made the list silently incomplete.
             */
            const rows = state.options.hideCompleted
              ? cycle.produce.filter((n) => n.covered || doneFor(n) < (n.plots ?? 0))
              : cycle.produce;
            if (!rows.length) return null;

            const cycleUnits = progressOf(cycle.produce);
            const cycleCount = countOf(cycle.produce);

            return (
              /*
               * Capped and anchored left. The panel used to run the full width
               * of the main column, which at 2560px is 1730px of table for
               * eleven point rows, and `justify-between` spent all of the
               * surplus in one gap in the middle of every row.
               */
              <section key={cycle.index} className={`${PANEL} overflow-hidden ${TABLE_WIDTH}`}>
                <div className="flex items-baseline justify-between gap-3 px-3 py-1.5 border-b border-slate-800">
                  <span className="text-[12px] font-semibold text-slate-300">Cycle {cycle.index + 1}</span>
                  <span className="flex items-baseline gap-3 text-[11px] text-slate-500">
                    <span
                      className={NUM}
                      title={`${cycleCount.credited.toLocaleString()} of ${cycleCount.raw.toLocaleString()} plantings removed by what you already own, ${cycleCount.ticked.toLocaleString()} ticked off.`}
                    >
                      {cycleCount.done.toLocaleString()} / {cycleCount.raw.toLocaleString()} plantings
                    </span>
                    {state.options.showTime &&
                      (() => {
                        const c = estimates?.cycles.find((x) => x.index === cycle.index);
                        if (!c || c.expectedSecondsLeft <= 0) return null;
                        return (
                          <span className={NUM}>
                            ~{formatDuration(c.expectedSecondsLeft)} left
                            {hasSpread(c.expectedSecondsLeft, c.p90SecondsLeft) && `, 90% within ${formatDuration(c.p90SecondsLeft)}`}
                          </span>
                        );
                      })()}
                  </span>
                </div>
                <Bar done={cycleUnits.harvestedUnits} owned={cycleUnits.ownedUnits} total={cycleUnits.wantedUnits} />

                <div className="divide-y divide-slate-800/70">
                  {rows.map((n, i) => {
                    const done = doneFor(n);
                    const total = n.plots ?? 0;
                    const complete = total > 0 && done >= total;
                    const units = progressOf([n]);
                    /*
                     * The counter, credited for the plantings your stock
                     * removed. `total` above is untouched and still governs the
                     * tick control and completion, because those are about what
                     * is left to sow; this is about what the row is worth.
                     */
                    const count = plantingCount(rowFor(n), state.progress[n.id]);
                    /*
                     * Focus wins, then the zebra. Written as one value rather
                     * than two classes because `even:` carries a pseudo-class
                     * and would outrank the plain focus tint on specificity,
                     * which is a fight worth simply not having.
                     */
                    const tint = focusId === n.id ? "bg-emerald-500/10" : i % 2 === 1 ? "bg-slate-900/20" : "";
                    return (
                      <div
                        key={n.id}
                        /*
                         * The WHOLE row opens the plot, not just the name. The
                         * name button was the only live surface, so a click in
                         * the acres of row to its right did nothing, and a
                         * dead click on a plainly clickable row reads as a
                         * broken page. Clicks that land on a real control inside
                         * the row (tick, undo, grow-fresh) still do their own
                         * job - the guard defers to any interactive ancestor
                         * of the click target instead of racing it.
                         */
                        onClick={(event) => {
                          const hit = event.target as HTMLElement;
                          if (hit.closest("button, a, input, select, textarea, label")) return;
                          setView({ mutation: n.id });
                        }}
                        className={`ws-row flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 hover:bg-slate-800/40 cursor-pointer ${
                          state.options.showTime ? ROW_GRID_TIMED : ROW_GRID_PLAIN
                        } ${tint}`}
                      >
                        <button onClick={() => setView({ mutation: n.id })} className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer" title={`Show the ${n.name} plot`}>
                          <CropImage cropId={n.id} cropName={n.name} width={20} height={20} />
                          <span className={`text-[12px] truncate ${complete ? "text-slate-500 line-through" : "text-slate-200"}`}>{n.name}</span>
                          <span className={`text-[11px] shrink-0 ${RARITY[n.rarity ?? "common"]}`}>{n.rarity}</span>
                          {n.special && <TriangleAlert className="w-2.5 h-2.5 text-amber-400 shrink-0" />}
                          <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
                        </button>

                        {(() => {
                          /*
                           * Show the working when a discount was applied. The
                           * remaining figure carries the weight because it is
                           * the one you act on; the other two are there so the
                           * number can never look like it changed on its own.
                           */
                          const split = needSplit(n);
                          /*
                           * The step your stock already did. It is a step, not
                           * an absence: this row is an ingredient of the tier
                           * above, and the plan used to say nothing whatsoever
                           * about where that ingredient comes from. So it reads
                           * as the good news it is, with the bill it settled in
                           * the hover rather than as another subtraction to
                           * parse.
                           */
                          if (n.covered) {
                            return (
                              <span className="flex items-baseline gap-2 shrink-0">
                                <span
                                  className={`text-[11px] text-emerald-400 ${NUM}`}
                                  title={`The plan needs ${split.raw.toLocaleString()} ${n.name} for the tier above, and you hold ${n.have.toLocaleString()}, so there is nothing to grow`}
                                >
                                  x{split.raw.toLocaleString()} covered by your {n.have.toLocaleString()}
                                </span>
                                {/*
                                  The spend-or-keep decision, handed back.

                                  The plan helps itself to your stock, which is
                                  usually what you want and sometimes badly not:
                                  106 Gloomgourd might be earmarked for something
                                  else entirely. That was a real choice the site
                                  was making silently, so this is where it gets
                                  made out loud.
                                */}
                                <button
                                  onClick={() => planner.setGrowFresh(n.id, true)}
                                  className="text-[11px] text-slate-500 hover:text-emerald-300 underline decoration-dotted underline-offset-2 cursor-pointer"
                                  title={`Keep your ${n.have.toLocaleString()} ${n.name} and grow ${split.raw.toLocaleString()} fresh instead. Adds the cycles that grow them.`}
                                >
                                  grow instead
                                </button>
                              </span>
                            );
                          }
                          if (!split.discounted) {
                            /*
                              The way back out. A choice you cannot reverse in
                              the same place you made it is a trap, and the
                              holding is quoted so the offer is concrete rather
                              than a bare undo.
                            */
                            const keeping = Boolean(state.growFresh[n.id]) && n.have > 0;
                            return (
                              <span className="flex items-baseline gap-2 shrink-0">
                                <span className={`text-[11px] text-slate-500 ${NUM}`}>{split.remaining.toLocaleString()} needed</span>
                                {keeping && (
                                  <button
                                    onClick={() => planner.setGrowFresh(n.id, false)}
                                    className="text-[11px] text-slate-500 hover:text-emerald-300 underline decoration-dotted underline-offset-2 cursor-pointer"
                                    title={`Spend the ${n.have.toLocaleString()} ${n.name} you already hold instead of growing them`}
                                  >
                                    keeping yours, spend instead
                                  </button>
                                )}
                              </span>
                            );
                          }
                          return (
                            <span
                              className={`text-[11px] text-slate-500 ${NUM} shrink-0`}
                              title={`The plan needs ${split.raw.toLocaleString()}, you already own ${split.owned.toLocaleString()}, so ${split.remaining.toLocaleString()} left to grow`}
                            >
                              {split.raw.toLocaleString()} needed <span className="text-emerald-400">- {split.owned.toLocaleString()} owned</span>{" "}
                              <span className={complete ? "text-slate-500" : "text-slate-200"}>= {split.remaining.toLocaleString()} left</span>
                            </span>
                          );
                        })()}
                        {state.options.showTime &&
                          (() => {
                            const est = estimates?.byId[n.id];
                            const dim = complete ? "text-slate-700" : "text-slate-500";
                            return (
                              <>
                                <span
                                  className={`hidden lg:block text-[11px] ${NUM} shrink-0 w-24 text-right ${dim}`}
                                  title={
                                    est && !est.mechanicOnly && !n.covered
                                      ? `Leave each planting ${est.harvestWindow} growth cycle${est.harvestWindow === 1 ? "" : "s"} before harvesting`
                                      : undefined
                                  }
                                >
                                  {/* A row you never sow has no harvest window
                                      to be told about. */}
                                  {est && !est.mechanicOnly && !n.covered ? harvestWindowLabel(est.harvestWindow) : ""}
                                </span>
                                <span
                                  className={`text-[11px] ${NUM} shrink-0 w-32 text-right ${dim}`}
                                  title={
                                    n.covered
                                      ? "Your stock covers this step outright, so it adds nothing to the clock."
                                      : est?.mechanicOnly
                                        ? "This one never rolls a spawn, so there is no chance to cost. See the note on the row."
                                        : /*
                                           * The clock, shown its working.
                                           *
                                           * A planting time that cannot be
                                           * taken apart invites the reader to
                                           * assume the missing piece is the one
                                           * they were looking for, which is
                                           * exactly what happened: 2d 14h with
                                           * no visible Melon in it read as a
                                           * Melon that had not been counted.
                                           * The parts come from the model's own
                                           * spec, so this can only ever add up.
                                           */
                                          est
                                          ? `One planting is ${formatDuration(est.plantingSeconds)}. ${plantingBreakdownLabel(est.breakdown, n.name)}.`
                                          : undefined
                                  }
                                >
                                  {/* A mechanic-only mutation has no spawn roll, so the model has no
                                      honest time for it. Say that rather than print a number that
                                      looks like an estimate. A covered step says "no time" rather
                                      than "instant", because instant is a claim about how fast it
                                      grows and this one is not being grown at all. */}
                                  {n.covered ? "no time" : !est ? "" : est.mechanicOnly ? "mechanic" : complete ? "done" : `~${formatDuration(est.expectedSecondsLeft)}`}
                                  {!n.covered && est && !est.mechanicOnly && !complete && hasSpread(est.expectedSecondsLeft, est.p90SecondsLeft) && (
                                    <span className="text-slate-500"> 90% {formatDuration(est.p90SecondsLeft)}</span>
                                  )}
                                </span>
                              </>
                            );
                          })()}
                        {/*
                          Bar, counter and tick travel together as the last
                          column, pushed right. All of the row's slack lives in
                          here rather than in the middle, so the gap between a
                          name and its own numbers is the same 12px on a laptop
                          and on a 2560px monitor.
                        */}
                        <div className="flex items-center gap-2 lg:justify-end">
                          <div className="w-20 shrink-0">
                            {/* Units. The pale half is stock you already had,
                                the solid half is plantings you have harvested,
                                so pre-owned progress never masquerades as work
                                done and never reads as nothing either. */}
                            <Bar done={units.harvestedUnits} owned={units.ownedUnits} total={units.wantedUnits} />
                          </div>
                          {/*
                            A row your stock did not shrink shows 0 here and
                            that is the truth, so the owned figure rides in the
                            tooltip: 78 Lonelily that removed no planting is a
                            partial story the pale bar and the needSplit line
                            already tell, and the 0 must not read as "you have
                            none".
                          */}
                          <span
                            className={`text-[12px] ${NUM} shrink-0 w-16 text-right ${complete ? "text-emerald-500" : "text-slate-300"}`}
                            title={`${count.credited.toLocaleString()} of ${count.raw.toLocaleString()} plantings removed by the ${Math.round(units.ownedUnits).toLocaleString()} you already own, ${count.ticked.toLocaleString()} ticked off, ${total.toLocaleString()} still to sow. The bar beside this counts units.`}
                          >
                            {count.done}/{count.raw || "?"}
                          </span>
                          <button
                            onClick={() => planner.bumpProgress(n.id, 1, total)}
                            disabled={complete || total === 0}
                            className="ws-tick p-1 rounded-sm text-slate-500 hover:text-emerald-300 hover:bg-slate-600/50 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                            aria-label={`Mark a ${n.name} planting done`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {plan && plan.manual.length > 0 && (
            <section className={`${PANEL} p-3`}>
              <h3 className={`${LABEL} mb-1.5 flex items-center gap-1`}>
                <TriangleAlert className="w-3 h-3 text-amber-400" />
                Get these yourself
              </h3>
              <div className="space-y-1.5">
                {plan.manual.map((n) => {
                  // Same rule as the cycle rows: never let a figure change
                  // meaning without saying so.
                  const split = needSplit(n);
                  return (
                    <div key={n.id} className="flex items-start gap-2">
                      <ItemIcon name={n.name} src={cropIconSrc(n.id)} size={24} />
                      <div className="min-w-0">
                        <WikiLink name={n.name} className="text-[12px] text-slate-200" />
                        {split.covered ? (
                          <span className={`text-[12px] text-emerald-400 ml-2 ${NUM}`}>covered by your {split.raw.toLocaleString()}</span>
                        ) : (
                          <>
                            <span className={`text-[12px] text-amber-300 ml-2 ${NUM}`}>x{split.remaining.toLocaleString()}</span>
                            {split.discounted && (
                              <span className={`text-[11px] text-slate-500 ml-2 ${NUM}`}>
                                of {split.raw.toLocaleString()}, you own {split.owned.toLocaleString()}
                              </span>
                            )}
                          </>
                        )}
                        <p className="text-[11px] text-slate-500 leading-snug">{n.special?.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/*
            The chess-engine view: the plan as a
            principal variation, one board per move with the running clock.
          */}
          {plan && estimates && (
            <RouteLine
              plan={plan}
              data={dataset}
              economies={economy.economies}
              fullYields={economy.fullYields}
              estimates={estimates}
              /*
               * A card is a move; clicking it opens that plot in the SAME
               * focus panel the "what to do now" section already renders -
               * the pop-up is the existing farming view,
               * reused rather than a second grid component.
               */
              onOpen={(id) => {
                setView({ mutation: id });
                document.getElementById("planner-focus")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          )}

          {/*
            What you physically put in the ground.

            THE LIST WAS SILENTLY INCOMPLETE. It named the crops to sow and said
            nothing about the mutations to place, so a Soggybud plot that wants
            five Melon and five Gloomgourd read as five Melon. A player standing
            at their greenhouse has to be able to work from this alone, and a
            list that quietly omits half of what goes in the ground is worse than
            one that is merely long.

            Two groups, because the two have different SOURCES and that is the
            thing worth showing: crops are gathered or farmed, mutations come out
            of your sack or out of an earlier cycle.
          */}
          {plan && state.options.showBaseCrops && plan.placed.length > 0 && (
            <section className={`${PANEL} p-3`}>
              <h3 className={`${LABEL} mb-2`}>Mutations to place, across every planting</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
                {plan.placed.map((m) => (
                  <div key={m.id} className="flex items-baseline gap-1.5">
                    <WikiLink
                      name={m.name}
                      icon
                      iconSize={18}
                      iconSrc={cropIconSrc(m.id)}
                      className="flex-1 min-w-0 text-[12px] text-slate-400"
                      nameClassName="truncate"
                    />
                    <span className={`text-[12px] text-slate-200 ${NUM} shrink-0`}>{m.count.toLocaleString()}</span>
                    {/* Where they come from. A placement you take out of a sack
                        and one you have to grow first are the same action and
                        very different jobs. */}
                    <span className={`text-[11px] shrink-0 ${m.covered ? "text-emerald-400" : "text-slate-500"}`}>
                      {m.covered ? `from your ${m.have.toLocaleString()}` : "grown above"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {plan && state.options.showBaseCrops && plan.baseCrops.length > 0 && (
            <section className={`${PANEL} p-3`}>
              <h3 className={`${LABEL} mb-2 flex items-center gap-1`}>
                Base crops to sow, across every planting
                {/* The bill is for the plantings that are actually left, and
                    then what you already hold comes off that. Two separate
                    subtractions, so say so rather than let the smaller number
                    look like a miscount. One hover, not a paragraph. */}
                {plan.baseCrops.some((c) => needSplit(c).discounted) && (
                  <InfoGlyph label="Counted for the plantings you still have to do, then reduced by what you already hold. Shown as bill - owned = left to gather." />
                )}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1">
                {plan.baseCrops.map((c) => {
                  const split = needSplit(c);
                  return (
                    <div key={c.id} className="flex items-baseline gap-1.5">
                      <WikiLink
                        name={c.name}
                        icon
                        iconSize={18}
                        iconSrc={cropIconSrc(c.id)}
                        className="flex-1 min-w-0 text-[12px] text-slate-400"
                        nameClassName="truncate"
                      />
                      {split.discounted ? (
                        <span
                          className={`text-[11px] text-slate-500 ${NUM} shrink-0`}
                          title={`${split.raw.toLocaleString()} needed for the remaining plantings, you already hold ${split.owned.toLocaleString()}, so ${split.remaining.toLocaleString()} left to gather`}
                        >
                          {split.raw.toLocaleString()} - {split.owned.toLocaleString()} ={" "}
                          <span className={split.covered ? "text-emerald-400" : "text-slate-200"}>{split.remaining.toLocaleString()}</span>
                        </span>
                      ) : (
                        <span className={`text-[12px] text-slate-300 ${NUM} shrink-0`}>{split.remaining.toLocaleString()}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {plan && state.targets.some((t) => t.kind === "item") && (
            <section className={`${PANEL} p-3`}>
              <h3 className={`${LABEL} mb-2`}>Recipe</h3>
              {state.targets
                .filter((t) => t.kind === "item")
                .map((t) => catalogueById.get(t.id))
                .filter((x): x is CatalogueTarget => Boolean(x))
                .map((item) => (
                  <div key={item.id} className="space-y-1">
                    <WikiLink name={item.name} href={item.wiki} icon iconSize={18} className="text-[12px] text-slate-300 hover:text-emerald-300" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">
                      {item.ingredients.map((ing) => (
                        <div key={ing.name} className="flex items-center gap-1.5 text-[11px]">
                          <span className={`${NUM} ${ing.mutation ? "text-emerald-400" : "text-slate-500"}`}>{ing.qty}x</span>
                          <WikiLink
                            name={ing.name}
                            icon
                            iconSize={14}
                            iconSrc={ing.mutation ? cropIconSrc(ing.mutation) : undefined}
                            className={`min-w-0 ${ing.mutation ? "text-slate-300" : "text-slate-500"}`}
                            nameClassName="truncate"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </section>
          )}
    </SplitPage>
  );
};

export default PlannerPage;
