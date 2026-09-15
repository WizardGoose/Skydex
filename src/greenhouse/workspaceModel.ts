import type { PlannerTarget } from "./planner/usePlannerState";
import { depthOf, type Dataset } from "./planner/solverPlan";

export interface GoalChoiceSummary {
  id: string;
  kind: PlannerTarget["kind"];
  name: string;
}

export type PlotInteractionMode = "locked" | "hybrid";

export interface PlanFieldNode {
  id: string;
  need: number;
  plots?: number;
  covered?: boolean;
}

export interface PlanFieldSelection<T extends PlanFieldNode = PlanFieldNode> {
  cycleIndex: number;
  fieldIndex: number;
  node: T;
}

/**
 * Keep the player's explicit field when it still belongs to this plan.
 * Otherwise select the largest unfinished field in the earliest unfinished
 * phase. That is the field blocking every phase after it, so the greenhouse
 * opens on a useful answer without asking for another click.
 */
export const selectPlanField = <T extends PlanFieldNode>(
  cycles: readonly { index: number; produce: readonly T[] }[],
  progress: Readonly<Record<string, number>>,
  preferredId?: string | null,
): PlanFieldSelection<T> | null => {
  const fields = cycles.flatMap((cycle) => cycle.produce
    .filter((node) => !node.covered && node.need > 0)
    .map((node, fieldIndex) => ({ cycleIndex: cycle.index, fieldIndex, node })));

  const preferred = preferredId
    ? fields.find((field) => field.node.id === preferredId)
    : undefined;
  if (preferred) return preferred;

  for (const cycle of cycles) {
    const unfinished = fields
      .filter((field) => field.cycleIndex === cycle.index)
      .map((field) => ({
        field,
        remaining: Math.max(0, (field.node.plots ?? 0) - (progress[field.node.id] ?? 0)),
      }))
      .filter(({ remaining }) => remaining > 0)
      .sort((left, right) => right.remaining - left.remaining);
    if (unfinished[0]) return unfinished[0].field;
  }

  return fields[0] ?? null;
};

export const normalisePlotInteractionMode = (value: unknown): PlotInteractionMode =>
  value === "hybrid" ? "hybrid" : "locked";

export const goalChoiceKey = (choice: Pick<GoalChoiceSummary, "id" | "kind">): string =>
  choice.kind === "mutation" ? `greenhouse:${choice.id}` : `greenhouse:target:${choice.id}`;

/**
 * The field a freshly chosen target should open on.
 *
 * For a mutation that is its own growing field. For an item target the plan's
 * fields are the mutations its recipe consumes, so the deepest of them - the
 * last growing step before the craft - is the one that answers "show me this
 * target". Without this steer the plot keeps whatever `view.mutation` already
 * named, which left a newly selected target looking ignored whenever the
 * previously shown field still belonged to the plan.
 */
export const targetFieldId = (
  kind: PlannerTarget["kind"],
  id: string,
  ingredients: readonly { mutation: string | null; qty: number }[],
  data: Dataset,
): string | null => {
  if (kind === "mutation") return id;
  const mutations = ingredients.flatMap((ingredient) =>
    ingredient.mutation ? [{ id: ingredient.mutation, qty: ingredient.qty }] : []);
  if (mutations.length === 0) return null;
  const memo = new Map<string, number>();
  mutations.sort((a, b) =>
    depthOf(b.id, data, memo) - depthOf(a.id, data, memo)
    || b.qty - a.qty
    || a.id.localeCompare(b.id));
  return mutations[0].id;
};

const normalise = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The goal shelf is deliberately complete. History changes the order, never
 * which targets exist, so a personalised empty search cannot make a less
 * familiar mutation disappear.
 */
export const rankGoalChoices = <T extends GoalChoiceSummary>(
  choices: readonly T[],
  recentKeys: readonly string[],
  query: string,
): T[] => {
  const needle = normalise(query);
  const recentRank = new Map(recentKeys.map((key, index) => [key, index]));

  return choices
    .filter((choice) => {
      if (!needle) return true;
      return normalise(choice.name).includes(needle) || normalise(choice.id).includes(needle);
    })
    .sort((left, right) => {
      const leftRecent = recentRank.get(goalChoiceKey(left)) ?? Number.MAX_SAFE_INTEGER;
      const rightRecent = recentRank.get(goalChoiceKey(right)) ?? Number.MAX_SAFE_INTEGER;
      if (leftRecent !== rightRecent) return leftRecent - rightRecent;
      if (left.kind !== right.kind) return left.kind === "mutation" ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
};

/**
 * Count one decoded profile container without pretending malformed slots are
 * empty stacks. IDs are case-insensitive at this boundary, matching the
 * island inventory bridge.
 */
export const countProfileContainer = (entries: readonly unknown[] | null | undefined): Map<string, number> => {
  const counts = new Map<string, number>();
  if (!entries) return counts;

  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as {
      Count?: unknown;
      id?: unknown;
      tag?: { ExtraAttributes?: { id?: unknown } };
    };
    const id = typeof raw.tag?.ExtraAttributes?.id === "string" && raw.tag.ExtraAttributes.id
      ? raw.tag.ExtraAttributes.id
      : typeof raw.id === "string" && raw.id
        ? raw.id
        : null;
    const count = typeof raw.Count === "number" && Number.isFinite(raw.Count) && raw.Count > 0
      ? raw.Count
      : null;
    if (!id || count === null) continue;
    const key = id.toUpperCase();
    counts.set(key, (counts.get(key) ?? 0) + count);
  }

  return counts;
};

/** Count only the requested mutation anchors in a maximize solve response. */
export const mutationCapacity = (
  mutationId: string,
  placements: readonly { mutation: string }[],
): number => placements.reduce(
  (count, placement) => count + (placement.mutation === mutationId ? 1 : 0),
  0,
);

export interface UnmetMutationGoal {
  mutation: string;
  requested: number;
  produced: number;
}

/**
 * A finite arrange request is only complete when every requested anchor is in
 * the returned plot. Keep this check outside the solver so a partial heuristic
 * result can never be presented as a successful replacement layout.
 */
export const unmetFiniteMutationGoals = (
  goals: readonly { mutation: string; maximize: boolean; count: number | null }[],
  placements: readonly { mutation: string }[],
): UnmetMutationGoal[] => {
  const requestedByMutation = new Map<string, number>();
  for (const goal of goals) {
    if (goal.maximize || goal.count === null) continue;
    const requested = Math.max(0, Math.trunc(goal.count));
    requestedByMutation.set(
      goal.mutation,
      (requestedByMutation.get(goal.mutation) ?? 0) + requested,
    );
  }

  const producedByMutation = new Map<string, number>();
  for (const placement of placements) {
    producedByMutation.set(
      placement.mutation,
      (producedByMutation.get(placement.mutation) ?? 0) + 1,
    );
  }

  return [...requestedByMutation].flatMap(([mutation, requested]) => {
    const produced = producedByMutation.get(mutation) ?? 0;
    return produced < requested ? [{ mutation, requested, produced }] : [];
  });
};

/** A Max goal is the amount this plot can produce, independent of stock. */
export const goalQuantityForPlotCapacity = (capacity: number): number =>
  Math.max(1, Math.trunc(capacity));

/**
 * A directly selected mutation is new production work. Existing stock is
 * still reported, but only ingredient demand may be paid from it.
 */
export const goalWorkRemaining = (
  requested: number,
  owned: number | undefined,
  growFresh: boolean,
): number => {
  const units = Math.max(0, Math.trunc(requested));
  if (growFresh) return units;
  return Math.max(0, units - Math.max(0, Math.floor(owned ?? 0)));
};
