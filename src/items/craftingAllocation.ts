import { prettify } from "../island/format";
import type { CostNode, ItemIndex } from "./useItemData";

/** A count reader, such as the inventory module's OwnedIndex. */
export interface AllocationCountSource {
  /** `undefined` means this source has not said anything about the item. */
  count(id: string): number | undefined;
}

/**
 * Inventory accepted by the allocator.
 *
 * Maps and records are closed snapshots: an absent key is known to be zero.
 * A count source can preserve the inventory module's distinction between an
 * observed zero and an item no source has mentioned yet.
 */
export type AllocationInventory =
  | ReadonlyMap<string, number>
  | Readonly<Record<string, number>>
  | AllocationCountSource;

export interface AllocationOptions {
  /** Maximum recipe depth before the remainder is left as a terminal shortage. */
  maxDepth?: number;
  /** A crafting list requests new outputs; existing finished goals are not ingredients. */
  useRootInventory?: boolean;
}

export type AllocationBlockReason = "cycle" | "max-depth";

/** One planned item node. `remaining` is what recipe expansion must cover. */
export interface AllocationNode {
  id: string;
  name: string;
  wikiTitle?: string;
  tier: string | null;
  /** The requested quantity at this node. */
  requested: number;
  /** Exact units reserved from the shared inventory ledger. */
  allocated: number;
  /** Extra output from a prior craft in this plan, not owned inventory. */
  fromCrafting?: number;
  /** `requested - allocated - fromCrafting`; only this quantity is expanded. */
  remaining: number;
  /** Number of recipe executions needed for `remaining`, after inventory use. */
  craftCount: number;
  /** Output of those executions; may exceed `remaining` for batch recipes. */
  craftOutput: number;
  children: AllocationNode[];
  alternatives?: { id: string; name: string }[];
  allocatedByAlternative?: { id: string; name: string; allocated: number }[];
  selectedAlternative?: { id: string; name: string };
  /** Set when a recipe could not be expanded safely. */
  blocked?: AllocationBlockReason;
  /** False when the count source did not know this item's quantity. */
  inventoryKnown: boolean;
}

/** A terminal demand after all possible recipe expansion. */
export interface AllocationRemainder {
  id: string;
  name: string;
  /** Total terminal demand before direct inventory reservations. */
  required: number;
  /** Terminal units reserved from inventory. */
  allocated: number;
  /** The quantity the coordinator should show as still to obtain. */
  remaining: number;
  /** False means `remaining` is conservative because this item is unknown. */
  known: boolean;
}

export interface CraftingAllocation {
  /** The requested root and its reservation-aware recipe tree. */
  root: AllocationNode;
  /** Exact inventory units consumed, shared by every sibling branch. */
  reservations: ReadonlyMap<string, number>;
  /** Terminal shortages. Consume these directly; do not subtract inventory again. */
  remaining: readonly AllocationRemainder[];
}

export interface CraftingGoal {
  id: string;
  quantity: number;
  /** Optional recipe-method override, applied only to this goal's root. */
  item?: ItemIndex[string];
}

export interface CraftingQueueAllocation extends Omit<CraftingAllocation, "root"> {
  roots: AllocationNode[];
}

interface InventoryRead {
  known: boolean;
  value: number;
}

interface AlternativeDemand {
  allocated: number;
  inventoryKnown: boolean;
  allocations: { id: string; name: string; allocated: number }[];
  selected?: { id: string; name: string };
}

type RemainderAccumulator = AllocationRemainder;

const cleanQuantity = (quantity: number): number => (Number.isFinite(quantity) ? Math.max(0, quantity) : 0);

const cleanInventory = (quantity: number | undefined): number =>
  typeof quantity === "number" && Number.isFinite(quantity) ? Math.max(0, quantity) : 0;

const isCountSource = (inventory: AllocationInventory): inventory is AllocationCountSource =>
  typeof inventory === "object" && inventory !== null && typeof (inventory as Partial<AllocationCountSource>).count === "function";

const isMap = (inventory: AllocationInventory): inventory is ReadonlyMap<string, number> =>
  typeof inventory === "object" && inventory !== null && typeof (inventory as ReadonlyMap<string, number>).get === "function";

const readFromInventory = (inventory: AllocationInventory | undefined, id: string): InventoryRead => {
  if (inventory === undefined) return { known: true, value: 0 };

  if (isCountSource(inventory)) {
    const count = inventory.count(id);
    return count === undefined ? { known: false, value: 0 } : { known: true, value: cleanInventory(count) };
  }

  if (isMap(inventory)) {
    return { known: true, value: cleanInventory(inventory.get(id)) };
  }

  const record = inventory as Readonly<Record<string, number>>;
  return {
    known: true,
    value: Object.prototype.hasOwnProperty.call(record, id) ? cleanInventory(record[id]) : 0,
  };
};

const alternativeCandidates = (
  id: string,
  name: string,
  alternatives?: readonly { id: string; name: string }[]
): { id: string; name: string }[] => {
  const seen = new Set<string>();
  return [{ id, name }, ...(alternatives ?? [])].filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
};

const allocateInterchangeable = (
  requestedInput: number,
  candidates: readonly { id: string; name: string }[],
  inventoryFor: (id: string) => InventoryRead,
  reserve: (id: string, quantity: number) => InventoryRead & { allocated: number }
): AlternativeDemand => {
  const requested = cleanQuantity(requestedInput);
  let remaining = requested;
  let allocated = 0;
  let allKnown = true;
  const allocations: { id: string; name: string; allocated: number }[] = [];

  for (const candidate of candidates) {
    const read = inventoryFor(candidate.id);
    allKnown = allKnown && read.known;
    if (remaining === 0) continue;
    const result = reserve(candidate.id, Math.min(remaining, read.value));
    if (result.allocated <= 0) continue;
    allocated += result.allocated;
    remaining -= result.allocated;
    allocations.push({ ...candidate, allocated: result.allocated });
  }

  return {
    allocated,
    inventoryKnown: remaining === 0 || allKnown,
    allocations,
    ...(allocations[0] ? { selected: { id: allocations[0].id, name: allocations[0].name } } : {}),
  };
};

const effectiveYield = (items: ItemIndex, id: string): number => {
  const yields = items[id]?.yields ?? 1;
  return Number.isFinite(yields) && yields > 0 ? yields : 1;
};

const addRemainder = (
  remainders: Map<string, RemainderAccumulator>,
  id: string,
  name: string,
  required: number,
  allocated: number,
  remaining: number,
  known: boolean
) => {
  const previous = remainders.get(id);
  if (previous) {
    previous.required += required;
    previous.allocated += allocated;
    previous.remaining += remaining;
    previous.known = previous.known && known;
    return;
  }

  remainders.set(id, { id, name, required, allocated, remaining, known });
};

const sortedReservations = (reservations: Map<string, number>): ReadonlyMap<string, number> =>
  new Map([...reservations.entries()].sort(([a], [b]) => a.localeCompare(b)));

/**
 * Allocate one recipe tree against a single inventory snapshot.
 *
 * The function is pure: it copies all mutable state into private maps, never
 * mutates `items` or the supplied inventory, and returns stable child and
 * shortage ordering. Recipe children are visited in recipe order; aggregated
 * terminal shortages are sorted by item id.
 */
export const allocateCraftingTree = (
  id: string,
  quantity: number,
  items: ItemIndex,
  inventory: AllocationInventory = {},
  options: AllocationOptions = {}
): CraftingAllocation => {
  const { roots, ...allocation } = allocateCraftingQueue([{ id, quantity }], items, inventory, options);
  return { root: roots[0], ...allocation };
};

/** Multiple goals share both held inventory and surplus ingredient batches. */
export const allocateCraftingQueue = (
  goals: readonly CraftingGoal[],
  items: ItemIndex,
  inventory: AllocationInventory = {},
  options: AllocationOptions = {},
): CraftingQueueAllocation => {
  const maxDepthValue = options.maxDepth;
  const maxDepth = maxDepthValue !== undefined && Number.isFinite(maxDepthValue) ? Math.max(0, Math.floor(maxDepthValue)) : 12;
  const available = new Map<string, number>();
  const known = new Map<string, boolean>();
  const reservations = new Map<string, number>();
  const remainders = new Map<string, RemainderAccumulator>();
  const surplus = new Map<string, number>();

  const inventoryFor = (itemId: string): InventoryRead => {
    const cached = available.get(itemId);
    if (cached !== undefined) return { known: known.get(itemId) ?? true, value: cached };

    const read = readFromInventory(inventory, itemId);
    available.set(itemId, read.value);
    known.set(itemId, read.known);
    return read;
  };

  const reserve = (itemId: string, requested: number): InventoryRead & { allocated: number } => {
    const read = inventoryFor(itemId);
    const allocated = Math.min(requested, read.value);
    available.set(itemId, read.value - allocated);
    if (allocated > 0) reservations.set(itemId, (reservations.get(itemId) ?? 0) + allocated);
    return { ...read, allocated };
  };

  const allocateNode = (
    itemId: string,
    requestedInput: number,
    statedName: string | undefined,
    path: Set<string>,
    depth: number,
    alternatives?: readonly { id: string; name: string }[],
    rootItem?: ItemIndex[string],
  ): AllocationNode => {
    const requested = cleanQuantity(requestedInput);
    const item = rootItem ?? items[itemId];
    const name = item?.name ?? statedName ?? prettify(itemId);
    const useInventory = depth !== 0 || options.useRootInventory !== false;
    const demand = useInventory
      ? allocateInterchangeable(requested, alternativeCandidates(itemId, name, alternatives), inventoryFor, reserve)
      : { allocated: 0, inventoryKnown: true, allocations: [], selected: undefined };
    const fromCrafting = useInventory ? Math.min(requested - demand.allocated, surplus.get(itemId) ?? 0) : 0;
    if (fromCrafting > 0) surplus.set(itemId, (surplus.get(itemId) ?? 0) - fromCrafting);
    const remaining = Math.max(0, requested - demand.allocated - fromCrafting);
    const node: AllocationNode = {
      id: itemId,
      name,
      ...(item?.wikiTitle ? { wikiTitle: item.wikiTitle } : {}),
      tier: item?.tier ?? null,
      requested,
      allocated: demand.allocated,
      ...(fromCrafting > 0 ? { fromCrafting } : {}),
      remaining,
      craftCount: 0,
      craftOutput: 0,
      children: [],
      ...(alternatives?.length ? { alternatives: alternatives.map((alternative) => ({ ...alternative })) } : {}),
      ...(demand.allocations.length ? { allocatedByAlternative: demand.allocations } : {}),
      ...(demand.selected ? { selectedAlternative: demand.selected } : {}),
      inventoryKnown: demand.inventoryKnown,
    };

    const recipe = item?.recipe;
    if (remaining === 0) {
      // Keep fully covered terminal demand in the accumulator so an aggregate
      // line still reports its true required/allocated totals when a sibling
      // branch has a shortage. Recipe nodes do not become terminal material
      // just because their exact output was held.
      if (!recipe || recipe.length === 0) addRemainder(remainders, itemId, name, requested, demand.allocated, 0, demand.inventoryKnown);
      return node;
    }

    if (!recipe || recipe.length === 0) {
      addRemainder(remainders, itemId, name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }

    if (path.has(itemId)) {
      node.blocked = "cycle";
      addRemainder(remainders, itemId, name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }

    if (depth > maxDepth) {
      node.blocked = "max-depth";
      addRemainder(remainders, itemId, name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }

    const yieldPerCraft = rootItem && Number.isFinite(rootItem.yields) && rootItem.yields > 0
      ? rootItem.yields : effectiveYield(items, itemId);
    const crafts = Math.ceil(remaining / yieldPerCraft);
    node.craftCount = crafts;
    node.craftOutput = crafts * yieldPerCraft;

    const nextPath = new Set(path).add(itemId);
    for (const ingredient of recipe) {
      const child = allocateNode(ingredient.id, cleanQuantity(ingredient.qty) * crafts, ingredient.name, nextPath, depth + 1, ingredient.alternatives);
      node.children.push(child);
    }
    const extra = node.craftOutput - remaining;
    if (extra > 0) surplus.set(itemId, (surplus.get(itemId) ?? 0) + extra);

    return node;
  };

  const roots = goals.map((goal) => allocateNode(goal.id, goal.quantity, undefined, new Set(), 0, undefined, goal.item));
  const remaining = [...remainders.values()]
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  return { roots, reservations: sortedReservations(reservations), remaining };
};


/**
 * Allocate an already costed plan against one inventory ledger.
 *
 * `buildCostTree` may choose buy for one occurrence and craft for another
 * occurrence of the same item at a different quantity. Planning from the
 * CostNode tree keeps those route decisions local instead of flattening them
 * into an id-keyed recipe map. Exact held intermediates are still reserved
 * before a chosen craft branch expands, so a partial stockpile only expands
 * the uncovered crafts.
 */
export const allocateCostTree = (
  rootCost: CostNode,
  items: ItemIndex,
  inventory: AllocationInventory = {},
  options: AllocationOptions = {}
): CraftingAllocation => {
  const maxDepthValue = options.maxDepth;
  const maxDepth = maxDepthValue !== undefined && Number.isFinite(maxDepthValue) ? Math.max(0, Math.floor(maxDepthValue)) : 12;
  const available = new Map<string, number>();
  const known = new Map<string, boolean>();
  const reservations = new Map<string, number>();
  const remainders = new Map<string, RemainderAccumulator>();

  const inventoryFor = (itemId: string): InventoryRead => {
    const cached = available.get(itemId);
    if (cached !== undefined) return { known: known.get(itemId) ?? true, value: cached };
    const read = readFromInventory(inventory, itemId);
    available.set(itemId, read.value);
    known.set(itemId, read.known);
    return read;
  };

  const reserve = (itemId: string, requested: number): InventoryRead & { allocated: number } => {
    const read = inventoryFor(itemId);
    const allocated = Math.min(requested, read.value);
    available.set(itemId, read.value - allocated);
    if (allocated > 0) reservations.set(itemId, (reservations.get(itemId) ?? 0) + allocated);
    return { ...read, allocated };
  };

  const allocateNode = (costNode: CostNode, path: Set<string>, depth: number): AllocationNode => {
    const requested = cleanQuantity(costNode.qty);
    const demand = allocateInterchangeable(
      requested,
      alternativeCandidates(costNode.id, costNode.name, costNode.alternatives),
      inventoryFor,
      reserve
    );
    const remaining = Math.max(0, requested - demand.allocated);
    const node: AllocationNode = {
      id: costNode.id,
      name: costNode.name,
      ...(costNode.wikiTitle ? { wikiTitle: costNode.wikiTitle } : {}),
      tier: costNode.tier,
      requested,
      allocated: demand.allocated,
      remaining,
      craftCount: 0,
      craftOutput: 0,
      children: [],
      ...(costNode.alternatives?.length
        ? { alternatives: costNode.alternatives.map((alternative) => ({ ...alternative })) }
        : {}),
      ...(demand.allocations.length ? { allocatedByAlternative: demand.allocations } : {}),
      ...(demand.selected ? { selectedAlternative: demand.selected } : {}),
      inventoryKnown: demand.inventoryKnown,
    };

    const terminal = costNode.children.length === 0 || costNode.action === "buy";
    if (remaining === 0) {
      if (terminal) addRemainder(remainders, costNode.id, costNode.name, requested, demand.allocated, 0, demand.inventoryKnown);
      return node;
    }
    if (terminal) {
      addRemainder(remainders, costNode.id, costNode.name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }
    if (path.has(costNode.id)) {
      node.blocked = "cycle";
      addRemainder(remainders, costNode.id, costNode.name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }
    if (depth > maxDepth) {
      node.blocked = "max-depth";
      addRemainder(remainders, costNode.id, costNode.name, requested, demand.allocated, remaining, demand.inventoryKnown);
      return node;
    }

    const yieldPerCraft = effectiveYield(items, costNode.id);
    const fullCrafts = Math.max(1, Math.ceil(requested / yieldPerCraft));
    const crafts = Math.ceil(remaining / yieldPerCraft);
    node.craftCount = crafts;
    node.craftOutput = crafts * yieldPerCraft;
    const nextPath = new Set(path).add(costNode.id);

    for (const childCost of costNode.children) {
      const perCraft = childCost.qty / fullCrafts;
      const child = allocateNode(
        { ...childCost, qty: cleanQuantity(perCraft * crafts) },
        nextPath,
        depth + 1
      );
      node.children.push(child);
    }
    return node;
  };

  const root = allocateNode(rootCost, new Set(), 0);
  const remaining = [...remainders.values()]
    .filter((entry) => entry.remaining > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  return { root, reservations: sortedReservations(reservations), remaining };
};
