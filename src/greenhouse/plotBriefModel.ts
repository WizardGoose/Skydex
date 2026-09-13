import type { DesignerPlacement } from "./context";

export interface PlacementSummary {
  id: string;
  name: string;
  count: number;
}

/**
 * A crop that occupies several cells is still one planted crop. The plot brief
 * therefore counts placement records rather than covered cells, matching the
 * quantities the player actually carries to the greenhouse.
 */
export const summarizePlacements = (placements: DesignerPlacement[]): PlacementSummary[] => {
  const totals = new Map<string, PlacementSummary>();

  for (const placement of placements) {
    const current = totals.get(placement.cropId);
    if (current) {
      current.count += 1;
      continue;
    }

    totals.set(placement.cropId, {
      id: placement.cropId,
      name: placement.cropName,
      count: 1,
    });
  }

  return [...totals.values()].sort((left, right) =>
    right.count - left.count || left.name.localeCompare(right.name),
  );
};
