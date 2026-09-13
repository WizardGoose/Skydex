export const SHARD_GRID_BATCH = 24;

/** Advance a progressively mounted result set by one safe, bounded batch. */
export const nextProgressiveCount = (current: number, total: number, batch = SHARD_GRID_BATCH): number => {
  const safeTotal = Math.max(0, Math.floor(total));
  const safeCurrent = Math.max(0, Math.floor(current));
  const safeBatch = Math.max(1, Math.floor(batch));
  return Math.min(safeTotal, safeCurrent + safeBatch);
};
