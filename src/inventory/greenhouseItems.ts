/**
 * Bridge the greenhouse dataset ids into the shared owned-count reader.
 *
 * The island feed and greenhouse dataset use the same Hypixel item ids, but
 * the greenhouse pages do not need the full crafting Item shape. Keeping this
 * tiny adapter here lets all three greenhouse pages use the same aggregation
 * path without inventing a second inventory reader.
 */
export const greenhouseHoldingsItems = (
  crops: readonly { id: string; name: string }[],
  mutations: readonly { id: string; name: string }[]
): Record<string, { hypixelId: string }> =>
  Object.fromEntries(
    [...crops, ...mutations].map((entry) => [entry.id, { hypixelId: entry.id }])
  );
