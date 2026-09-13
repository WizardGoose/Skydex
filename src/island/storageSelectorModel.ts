import type { SectionState } from "./merge";

export const storageSummary = (
  state: SectionState,
  count: number,
  singular: string,
  plural = `${singular}s`
): string => {
  if (state === "hidden") return "Not shared";
  if (state === "absent") return "Not captured";
  if (state === "empty") return "Empty";
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
};

export const storageTabIndexForKey = (key: string, current: number, length: number): number | null => {
  if (length === 0) return null;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
  return null;
};
