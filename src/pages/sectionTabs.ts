/** Return the next roving-tab-stop index for a horizontal section tab strip. */
export const sectionTabNavigationIndex = (
  key: string,
  currentIndex: number,
  tabCount: number
): number | null => {
  if (tabCount <= 0) return null;
  const index = Math.min(Math.max(currentIndex, 0), tabCount - 1);
  switch (key) {
    case "ArrowRight":
      return (index + 1) % tabCount;
    case "ArrowLeft":
      return (index - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return null;
  }
};
