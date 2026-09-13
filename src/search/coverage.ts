import type { SearchEntry } from "./types";

export interface SearchCoverage {
  items: number;
  greenhouse: number;
  shards: number;
}

/** Counts the searchable public records already loaded by Universal Search. */
export const summarizeSearchCoverage = (
  index: readonly Pick<SearchEntry, "destination">[]
): SearchCoverage => {
  const coverage: SearchCoverage = { items: 0, greenhouse: 0, shards: 0 };

  for (const entry of index) {
    if (entry.destination === "items") coverage.items += 1;
    if (entry.destination === "greenhouse") coverage.greenhouse += 1;
    if (entry.destination === "shards") coverage.shards += 1;
  }

  return coverage;
};
