export const profileTabForKey = <TTab extends string>(
  tabs: readonly TTab[],
  current: TTab,
  key: string,
): TTab | null => {
  const currentIndex = tabs.indexOf(current);
  if (currentIndex < 0 || tabs.length === 0) return null;
  if (key === "Home") return tabs[0] ?? null;
  if (key === "End") return tabs[tabs.length - 1] ?? null;
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;

  const offset = key === "ArrowRight" ? 1 : -1;
  return tabs[(currentIndex + offset + tabs.length) % tabs.length] ?? null;
};
