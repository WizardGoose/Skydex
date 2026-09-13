import type { PlannerTarget } from "./planner/usePlannerState";

interface IdLookup {
  has(id: string): boolean;
}

/** Resolves one valid, not-yet-saved goal without changing planner state. */
export function resolveLinkedTargetAddition(
  linkedTarget: string | null | undefined,
  savedTargets: readonly Pick<PlannerTarget, "id">[],
  mutations: IdLookup,
  catalogue: IdLookup,
): PlannerTarget | null {
  if (!linkedTarget || savedTargets.some((target) => target.id === linkedTarget)) {
    return null;
  }
  if (mutations.has(linkedTarget)) {
    return { id: linkedTarget, kind: "mutation", qty: 1 };
  }
  if (catalogue.has(linkedTarget)) {
    return { id: linkedTarget, kind: "item", qty: 1 };
  }
  return null;
}
