export const inventoryTileCount = (count: number): string => {
  if (count < 1_000) return count.toLocaleString("en-US");
  const magnitude = 10 ** (Math.floor(Math.log10(count) / 3) * 3);
  const scaled = count / magnitude;
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: scaled >= 100 ? 0 : 1,
  }).format(count);
};
