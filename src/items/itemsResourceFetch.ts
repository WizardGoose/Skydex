const ITEMS_URL = "https://api.hypixel.net/v2/resources/skyblock/items";

let pending: Promise<unknown[]> | null = null;

const aborted = (signal: AbortSignal): Promise<never> =>
  new Promise((_, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new DOMException("aborted", "AbortError"));
      return;
    }
    signal.addEventListener("abort", () => reject(signal.reason ?? new DOMException("aborted", "AbortError")), {
      once: true,
    });
  });

/**
 * One in-flight copy of Hypixel's item resource, shared across the parsers
 * that each derive their own cached index from it (the crafting index, the
 * icon resource, the texture-head hashes and the net worth catalogue). Each
 * keeps its own derived cache and TTL; this only stops two cold-start callers
 * from downloading the same multi-megabyte payload in the same second.
 *
 * The slot clears as soon as the request settles, so nothing here decides
 * freshness — every caller's own staleness rules still say when the next
 * fetch happens. A signal always bounds its own caller's wait, but aborting a
 * shared wait leaves the underlying fetch alive for the callers still on it.
 */
export const fetchSkyblockItems = (signal?: AbortSignal): Promise<unknown[]> => {
  pending ??= fetch(ITEMS_URL, { signal })
    .then((response) =>
      response.ok ? response.json() : Promise.reject(new Error(`items resource responded ${response.status}`)),
    )
    .then((body: { items?: unknown[] }) => (Array.isArray(body?.items) ? body.items : []))
    .finally(() => {
      pending = null;
    });
  return signal ? Promise.race([pending, aborted(signal)]) : pending;
};
