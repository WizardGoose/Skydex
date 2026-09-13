import {
  parseCollectionsResource,
  type CollectionDefinition,
} from "./petsBestiaryCollections";

const COLLECTIONS_URL = "https://api.hypixel.net/v2/resources/skyblock/collections";
const TIMEOUT_MS = 10_000;

let cached: readonly CollectionDefinition[] | null = null;
let inFlight: Promise<readonly CollectionDefinition[]> | null = null;

/**
 * Load Hypixel's keyless collection catalogue once per browser session.
 * Profile snapshots cache the resulting plain projection, so a cached profile
 * never needs this request merely to render its Collections tab.
 */
export const loadCollectionDefinitions = async (): Promise<readonly CollectionDefinition[]> => {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(COLLECTIONS_URL, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!response.ok) return [];
      const definitions = parseCollectionsResource(await response.json()) ?? [];
      if (definitions.length > 0) cached = definitions;
      return definitions;
    } catch {
      return [];
    } finally {
      clearTimeout(deadline);
      inFlight = null;
    }
  })();

  return inFlight;
};

/** Test seam for the small module cache. */
export const clearCollectionDefinitionsForTesting = (): void => {
  cached = null;
  inFlight = null;
};
