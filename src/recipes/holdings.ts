import { SOURCE_LABEL, type OwnedEntry } from "../inventory";

/** Location counts describe stock, not the amount allocated to one recipe. */
export function holdingLocations(entry: OwnedEntry | undefined): string {
  if (!entry) return "";
  if (entry.overridden) return `Set by you: ${entry.total.toLocaleString()}`;
  return entry.sources.filter(source => source.count > 0)
    .map(source => `${SOURCE_LABEL[source.source]} ${source.count.toLocaleString()}`).join(" · ");
}
