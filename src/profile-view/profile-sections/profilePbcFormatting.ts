export const compactProfileNumber = (value: number): string => new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
}).format(value);

export const profilePercent = (value: number): string => `${Math.round(value)}%`;

/** Toggle one independently expandable profile card without closing its siblings. */
export const toggleProfileExpansionKey = (
  current: ReadonlySet<string>,
  key: string,
): Set<string> => {
  const next = new Set(current);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};

export const groupProfileEntries = <T,>(
  entries: readonly T[],
  categoryFor: (entry: T) => string | null,
): ReadonlyMap<string, readonly T[]> => {
  const grouped = new Map<string, T[]>();
  for (const entry of entries) {
    const category = categoryFor(entry)?.trim() || "Uncategorised";
    const current = grouped.get(category) ?? [];
    current.push(entry);
    grouped.set(category, current);
  }
  return new Map([...grouped.entries()].sort(([a], [b]) => {
    if (a === "Uncategorised") return 1;
    if (b === "Uncategorised") return -1;
    return a.localeCompare(b);
  }));
};
