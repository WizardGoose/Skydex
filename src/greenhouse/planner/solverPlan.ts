import type { CropDefinition, MutationDefinition } from "../types/greenhouse";
import { effectiveRequirements, isUnplannable, specialFor, type SpecialRule } from "./specials";

/**
 * Solver-derived production plan.
 *
 * Demand is *measured*, not assumed. The old model multiplied every
 * requirement down the tree on the assumption that a crop feeds one mutation.
 * The greenhouse solver disproves that - one optimal plot yields 72 Choconut
 * from 26 cocoa beans, each crop feeding several spawn spots at once.
 *
 * So the unit of cost here is a **planting**: one plot, sown once, harvested
 * once. For each mutation we ask the solver what a single optimal plot yields
 * and what it costs to sow, then walk the tree from the targets downwards:
 *
 *   plantings    = ceil(still needed / yield per plot)
 *   input demand = plantings x crops sown per plot
 *
 * Those inputs are the tier below, so the same step repeats until we reach
 * base crops.
 */

export interface PlotEconomy {
  /** Mutations produced by one optimal plot. */
  yield: number;
  /**
   * Everything sown on that plot: id -> planted UNITS, one per placement. A
   * 3x3 snoozling support is one unit (one snoozling spent from stock), not
   * nine - the same rule that keeps plantings honest (the size-squared bug
   * once inflated a 428-planting plan to 1,052).
   */
  crops: Record<string, number>;
}

export interface SolverPlanNode {
  id: string;
  name: string;
  kind: "mutation" | "crop";
  /** Units still to obtain, after anything you already own has been taken off. */
  need: number;
  have: number;
  /**
   * What this row asked for before your stock was applied, set only when a
   * discount actually happened.
   *
   * Carried explicitly rather than reconstructed as `need + have`, because that
   * identity quietly breaks in exactly the case worth showing: when you own
   * more than the bill, `need` is 0 and `have` overshoots. Recording the figure
   * at the point of subtraction means the display never has to guess.
   */
  rawNeed?: number;
  /**
   * Your stock covers this row outright, so it costs no plantings and no time.
   *
   * Recorded at the point of subtraction rather than inferred later, for the
   * same reason `rawNeed` is: the identity that would reconstruct it
   * (`need === 0`) is also what an unmeasured row looks like, and the two must
   * not be able to be confused. A covered row STAYS IN THE PLAN - see the
   * filter at the bottom of `buildSolverPlan` for why that matters.
   */
  covered?: boolean;
  cycle: number;
  /** Yield of one optimal plot (mutations only). */
  perPlot?: number;
  /** Plantings required to cover `need`. */
  plots?: number;
  rarity?: string;
  ground?: string;
  size?: number;
  special?: SpecialRule;
}

/**
 * A mutation you physically carry to the plot and put in the ground.
 *
 * THE GAP THIS CLOSES. A plan that lists only base crops does not answer the
 * one question a player standing at their greenhouse is asking, which is what
 * goes in the ground. Soggybud's plot sows Melon AND places Gloomgourd, and
 * Gloomgourd was invisible everywhere except the plot preview, so the gather
 * list was silently incomplete. Silently incomplete is worse than verbose.
 *
 * `count` is the physical act, summed straight off the same traversal that
 * builds the crop bill: cells of it per plot, times plantings. It is NOT the
 * same quantity as the row's `need`, and conflating them would be wrong in both
 * directions. A mutation that is also a target has demand this never sees; a
 * mutation your stock covers has a `need` of 0 and still has to be carried out
 * to the plot and placed.
 */
export interface PlacedMutation {
  id: string;
  name: string;
  /** How many get put in the ground, across every planting in the plan. */
  count: number;
  /** Your stock covers its whole demand, so these come out of the sack. */
  covered: boolean;
  /** What you hold, for saying where they come from. */
  have: number;
}

export interface SolverPlan {
  cycles: { index: number; produce: SolverPlanNode[] }[];
  baseCrops: SolverPlanNode[];
  /** Mutations that get placed into plots. See `PlacedMutation`. */
  placed: PlacedMutation[];
  manual: SolverPlanNode[];
  unknown: string[];
  /** Mutations still waiting on a solver answer. */
  pending: string[];
  totalPlantings: number;
  depth: number;
}

/** Unmeasured or unplaceable fields leave an incomplete bill, not a zero bill. */
export const hasUnresolvedPlanFields = (plan: SolverPlan): boolean =>
  plan.pending.length > 0 || plan.unknown.length > 0 || plan.cycles.some((cycle) =>
    cycle.produce.some((node) => node.need > 0 && node.plots === undefined)
  );

export interface Dataset {
  crops: Record<string, CropDefinition>;
  mutations: Record<string, MutationDefinition>;
}

/** How many mutation stages must happen before this can exist. */
export const depthOf = (id: string, data: Dataset, memo = new Map<string, number>(), seen = new Set<string>()): number => {
  const cached = memo.get(id);
  if (cached !== undefined) return cached;

  const mutation = data.mutations[id];
  if (!mutation) return -1;
  if (seen.has(id)) return 0;

  seen.add(id);
  let deepest = -1;
  for (const req of effectiveRequirements(mutation)) deepest = Math.max(deepest, depthOf(req.crop, data, memo, seen));
  seen.delete(id);

  memo.set(id, deepest + 1);
  return deepest + 1;
};

/**
 * Every mutation that could appear in the plan.
 *
 * Walked structurally, ignoring quantities - this is the set the caller needs
 * solver economies for before real numbers can be produced.
 */
export const collectMutations = (targets: { id: string }[], data: Dataset): string[] => {
  const found = new Set<string>();

  const visit = (id: string) => {
    const mutation = data.mutations[id];
    if (!mutation || found.has(id)) return;
    found.add(id);
    if (isUnplannable(id)) return;
    for (const req of effectiveRequirements(mutation)) visit(req.crop);
  };

  for (const t of targets) visit(t.id);
  return [...found];
};

export const buildSolverPlan = (
  targets: { id: string; qty: number }[],
  data: Dataset,
  economies: Record<string, PlotEconomy | null>,
  have: Record<string, number> = {},
  /**
   * Mutations the player has chosen to GROW rather than spend from stock.
   *
   * Applied at the single point of subtraction below, by declining to spend
   * rather than by unwinding a spend that already happened. That matters: the
   * sequential mutation-then-crop composition is untouched, because there is
   * still exactly one subtraction per row and it still happens in tier order.
   * A second pass that gave stock back after the fact would be the parallel
   * discount this file spends its longest comment warning against.
   */
  growFresh: ReadonlySet<string> = new Set()
): SolverPlan => {
  const memo = new Map<string, number>();
  const unknown: string[] = [];
  const pending = new Set<string>();
  const manualIds = new Set<string>();

  const demand = new Map<string, number>();
  for (const t of targets) {
    if (!data.mutations[t.id] && !data.crops[t.id]) {
      unknown.push(t.id);
      continue;
    }
    demand.set(t.id, (demand.get(t.id) ?? 0) + t.qty);
  }

  const stock = new Map(Object.entries(have));
  const rows = new Map<string, SolverPlanNode>();
  const baseCropTotals = new Map<string, number>();
  /** Mutation inputs, counted as physical placements. See `PlacedMutation`. */
  const placedTotals = new Map<string, number>();

  const involved = collectMutations(targets, data);
  const maxDepth = involved.reduce((m, id) => Math.max(m, depthOf(id, data, memo)), 0);

  // Work from the deepest tier down: a tier's demand is fully known only once
  // every tier above it has been converted into plantings.
  for (let d = maxDepth; d >= 0; d--) {
    const tier = [...demand.entries()].filter(([id]) => data.mutations[id] && depthOf(id, data, memo) === d);

    for (const [id, wanted] of tier) {
      const mutation = data.mutations[id];
      /*
       * "Keep mine, grow these instead." The stock is left in the pool rather
       * than spent, which is the whole point: a player saving 106 Gloomgourd
       * for something else has said so, and the plan has to stop helping itself
       * to them.
       */
      const keeping = growFresh.has(id);
      const owned = keeping ? 0 : stock.get(id) ?? 0;
      const fromStock = Math.min(owned, wanted);
      if (!keeping) stock.set(id, owned - fromStock);

      const need = wanted - fromStock;

      const node: SolverPlanNode = {
        id,
        name: mutation.name,
        kind: "mutation",
        need,
        have: have[id] ?? 0,
        // Discount one: owning the mutation itself removes plantings.
        //
        // `rawNeed` is also stated when the player is KEEPING their stock, even
        // though no discount happened. Without it `needSplit` reconstructs the
        // pre-discount figure as `need + have` and would print "111 needed, 106
        // owned" at a row that genuinely asks for 5, which is the row's own
        // number changing meaning behind the player's back.
        ...(fromStock > 0 || keeping ? { rawNeed: wanted } : {}),
        ...(wanted > 0 && need === 0 ? { covered: true } : {}),
        cycle: d,
        rarity: mutation.rarity,
        ground: mutation.ground,
        size: mutation.size,
        special: specialFor(id),
      };

      if (isUnplannable(id)) {
        manualIds.add(id);
        rows.set(id, node);
        continue;
      }

      /*
       * Covered by your stock: a step that still happens, priced at nothing.
       *
       * THE BUG THIS BRANCH EXISTS TO END. A mutation is an ingredient of the
       * tier above it, and a plan that says "plant Melon and Gloomgourd" while
       * never mentioning where Gloomgourd comes from is only readable by
       * somebody who already knows. It read that way because a row your stock
       * covered was dropped from the plan entirely, so the one case where the
       * answer is good news - you already have them - was the case that said
       * nothing at all.
       *
       * So the row survives, with `plots` of 0 and `need` of 0, and every
       * rollup that walks the plan prices it at exactly what it costs: no
       * plantings, no base crops, no seconds. Its `cycle` is intact, which is
       * what keeps the dependency visible - the plan can say "this was cycle 1,
       * and you have it" rather than opening at cycle 2 with no cycle 1.
       *
       * NO SECOND DISCOUNT IS COMPUTED HERE. `need` above is the one and only
       * subtraction, taken from the same `stock` map every other tier spends
       * from, so a covered row cannot credit a holding that a higher tier
       * already spent. Re-deriving what your stock covers - anywhere, in any
       * form - is what put two different percentages on two pages once already.
       * `__tests__/coveredCascade.test.ts` pins the composed figure against the
       * naively double-discounted one, and pins its direction.
       *
       * The inputs are deliberately NOT expanded. Nothing has to be grown to
       * produce something you already hold, so the tier below it inherits no
       * demand and the base crop bill stays honest.
       */
      if (need === 0) {
        /*
         * `perPlot` still comes from the solver, and a row that cannot get one
         * stays hidden exactly as it did before. That is not tidiness either:
         * `planUnitMaps` states all three unit figures or none at all, so one
         * row unable to name its yield would drag every OTHER row onto the
         * planting-weighted fallback and cost the Dashboard its unit-weighted
         * progress. A covered row is good news, and good news must not be able
         * to make the rest of the page worse. See the filter below.
         */
        const economy = economies[id];
        if (economy && economy.yield > 0) {
          node.perPlot = economy.yield;
          node.plots = 0;
        }
        rows.set(id, node);
        continue;
      }

      const special = specialFor(id);
      if (special && special.requires.length > 0) {
        // The solver reads the same empty `requirements` we do and would claim
        // these are free, so their cost comes from specials.ts instead.
        node.perPlot = 1;
        node.plots = need;
        rows.set(id, node);
        for (const req of special.requires) {
          if (data.mutations[req.crop]) {
            demand.set(req.crop, (demand.get(req.crop) ?? 0) + req.count * need);
            /*
             * The same omission the normal branch guards against in its own
             * comment two blocks below: "the same number, recorded a second
             * time for a different question". A mechanic requirement is still
             * something carried to the plot and placed - Shellfruit's 2x
             * Blastberry is physically walked over and spent exactly like
             * Startlevine's 4x is - so it owes `placedTotals` the same entry
             * the demand map gets. Skipping it is what let Turtlellini vanish
             * from "Mutations to place" entirely (its only consumer is this
             * branch) and undercounted Blastberry by exactly Shellfruit's
             * share, 12 of the 27 a real plan asked for.
             */
            placedTotals.set(req.crop, (placedTotals.get(req.crop) ?? 0) + req.count * need);
          } else baseCropTotals.set(req.crop, (baseCropTotals.get(req.crop) ?? 0) + req.count * need);
        }
        continue;
      }

      const economy = economies[id];
      if (economy === undefined) {
        pending.add(id);
        rows.set(id, node);
        continue;
      }
      if (economy === null || economy.yield === 0) {
        rows.set(id, node); // solver could not place it; leave plots unknown
        continue;
      }

      const plots = Math.ceil(need / economy.yield);
      node.perPlot = economy.yield;
      node.plots = plots;
      rows.set(id, node);

      // Each planting is sown fresh, so multiply the plot's crop bill by it.
      for (const [crop, count] of Object.entries(economy.crops)) {
        const total = count * plots;
        if (data.mutations[crop]) {
          demand.set(crop, (demand.get(crop) ?? 0) + total);
          // The same number, recorded a second time for a different question:
          // that one is "how many must exist", this one is "how many do I carry
          // out and put in the ground". Same traversal, so they cannot drift.
          placedTotals.set(crop, (placedTotals.get(crop) ?? 0) + total);
        } else baseCropTotals.set(crop, (baseCropTotals.get(crop) ?? 0) + total);
      }
    }
  }

  /*
   * A row earns its place by still being work, or by being work your stock has
   * already done. The second clause is the one that was missing: dropping a
   * covered row is how the acquisition step for an ingredient you own
   * disappeared from the plan.
   */
  const all = [...rows.values()].filter(
    (n) => n.need > 0 || (n.covered === true && n.plots !== undefined) || manualIds.has(n.id)
  );
  const manual = all.filter((n) => manualIds.has(n.id));
  const schedulable = all.filter((n) => !manualIds.has(n.id));

  const depth = schedulable.reduce((max, n) => Math.max(max, n.cycle), -1);

  const cycles: { index: number; produce: SolverPlanNode[] }[] = [];
  for (let i = 0; i <= depth; i++) {
    const produce = schedulable
      .filter((n) => n.cycle === i)
      .sort((a, b) => (b.plots ?? 0) - (a.plots ?? 0) || b.need - a.need || a.name.localeCompare(b.name));
    if (produce.length) cycles.push({ index: i, produce });
  }

  /*
   * Discount two: owning the base crops reduces the gather bill.
   *
   * These are two INDEPENDENT discounts and the distinction is the whole reason
   * this is written down. Owning 245 Choconut removes plantings - the job gets
   * smaller. Owning 900 Cocoa Beans removes no plantings at all; the same
   * plantings still have to happen, you simply already hold some of the seed
   * stock they consume.
   *
   * So they compose SEQUENTIALLY, never in parallel. `baseCropTotals` was
   * accumulated inside the tier loop above from `plots`, which was itself
   * derived from the already-mutation-discounted `need`. That ordering is not
   * incidental, it is the correctness condition: the bill this subtracts from
   * is the bill for the plantings that actually remain.
   *
   * Applying the crop discount against the pre-mutation-discount bill instead
   * would count a player's stock twice and quote a total below what they
   * actually have to gather. A plan that overstates the work is survivable; one
   * that understates it fails at the point of running short, which is the worst
   * possible moment to find out. `__tests__/baseCropDiscount.test.ts` pins the
   * composed figure against the naive double-discounted one so a refactor that
   * parallelises these fails loudly.
   *
   * `stock` rather than `have` is deliberate: it is what is left after the
   * mutation tiers took their share, so a single pool can never be spent twice.
   */
  const baseCrops: SolverPlanNode[] = [...baseCropTotals.entries()]
    .map(([id, wanted]) => {
      const owned = stock.get(id) ?? 0;
      const fromStock = Math.min(owned, wanted);
      stock.set(id, owned - fromStock);

      return {
        id,
        name: data.crops[id]?.name ?? id,
        kind: "crop" as const,
        need: wanted - fromStock,
        have: have[id] ?? 0,
        cycle: -1,
        ...(fromStock > 0 ? { rawNeed: wanted } : {}),
        ground: data.crops[id]?.ground,
        size: data.crops[id]?.size,
      };
    })
    // Most still to gather first. A crop your stock already covers sorts to the
    // bottom rather than vanishing, because "you have enough of this" is an
    // answer worth reading.
    .sort((a, b) => b.need - a.need || a.name.localeCompare(b.name));

  const totalPlantings = schedulable.reduce((s, n) => s + (n.plots ?? 0), 0);

  /*
   * The other half of "what do I physically place".
   *
   * `covered` is READ OFF THE ROW rather than worked out again here. That row's
   * `need` is the single subtraction this file makes, so asking it is the only
   * way to be sure the placement list and the cycle list agree about where a
   * mutation comes from.
   */
  const placed: PlacedMutation[] = [...placedTotals.entries()]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({
      id,
      name: data.mutations[id]?.name ?? id,
      count,
      covered: rows.get(id)?.covered === true,
      have: have[id] ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    cycles,
    baseCrops,
    placed,
    manual,
    unknown: [...new Set(unknown)],
    pending: [...pending],
    totalPlantings,
    depth: depth + 1,
  };
};
