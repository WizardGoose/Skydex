import { makeGate } from "../island/gate";
import type { Catalogue, CatalogueEntry } from "./types";

/**
 * Hypixel's own item catalogue, trimmed to the parts the valuation reads.
 *
 * WHY THIS EXISTS AT ALL. Six of the modifier handlers cannot answer without
 * it: dungeon stars and Kuudra prestiges need `upgrade_costs`, gemstone slots
 * need `gemstone_slots`, the reforge and recombobulator rules need `category`,
 * and the cosmetic test needs `category` too. A networth without it is not a
 * networth that is slightly off, it is one missing every starred item's stars.
 *
 * `GET /v2/resources/skyblock/items` is keyless and answers with
 * `Access-Control-Allow-Origin: *`, so this costs the visitor no key and us no
 * backend. It is about 5 MB on the wire and about 0.8 MB once the nine fields
 * below are kept, which is the difference between something that can sit in
 * localStorage next to the prices and something that cannot.
 *
 * It changes with game updates rather than with the market, so the cache runs
 * for twelve hours where prices run for twenty minutes.
 */

const ITEMS_URL = "https://api.hypixel.net/v2/resources/skyblock/items";

/** A NEW key. See the note on `PRICES_KEY`; nothing existing is touched. */
export const CATALOGUE_KEY = "skydex.networth.items.v1";

export const CATALOGUE_TTL_MS = 12 * 60 * 60 * 1000;

const CATALOGUE_MIN_GAP_MS = 15_000;

const TIMEOUT_MS = 30_000;

export interface CatalogueSnapshot {
  catalogue: Catalogue;
  fetchedAt: number;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Keep nine fields and drop about sixty.
 *
 * The list is exactly what the handlers read, nothing kept "in case". An entry
 * that would be empty after trimming is still kept under its id, because
 * "Hypixel knows this item and it has no upgrade costs" and "Hypixel has never
 * heard of this item" are different facts and only the first one lets the
 * recombobulator rule answer confidently.
 */
export const trimCatalogue = (payload: unknown): Catalogue | null => {
  if (!isObject(payload) || !Array.isArray(payload.items)) return null;

  const out: Catalogue = {};
  for (const raw of payload.items) {
    if (!isObject(raw) || typeof raw.id !== "string") continue;
    const entry: CatalogueEntry = { id: raw.id };
    if (typeof raw.name === "string") entry.name = raw.name;
    if (typeof raw.category === "string") entry.category = raw.category;
    if (typeof raw.tier === "string") entry.tier = raw.tier;
    if (typeof raw.soulbound === "string") entry.soulbound = raw.soulbound;
    if (typeof raw.museum === "boolean") entry.museum = raw.museum;
    if (Array.isArray(raw.upgrade_costs)) entry.upgrade_costs = raw.upgrade_costs as CatalogueEntry["upgrade_costs"];
    if (Array.isArray(raw.gemstone_slots)) entry.gemstone_slots = raw.gemstone_slots as CatalogueEntry["gemstone_slots"];
    if (isObject(raw.prestige)) entry.prestige = raw.prestige as CatalogueEntry["prestige"];
    out[raw.id] = entry;
  }

  // A catalogue with a handful of entries is a truncated download, not a
  // catalogue. Same guard, same reason, as the price list.
  return Object.keys(out).length > 100 ? out : null;
};

/* -------------------------------------------------------------------------- */

let snapshot: CatalogueSnapshot | null = null;

export const readCachedCatalogue = (): CatalogueSnapshot | null => {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(CATALOGUE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed) || !isObject(parsed.catalogue)) return null;
    const fetchedAt = typeof parsed.fetchedAt === "number" ? parsed.fetchedAt : 0;
    if (!fetchedAt || Object.keys(parsed.catalogue).length <= 100) return null;
    return { catalogue: parsed.catalogue as Catalogue, fetchedAt };
  } catch {
    return null;
  }
};

const writeCachedCatalogue = (value: CatalogueSnapshot): void => {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CATALOGUE_KEY, JSON.stringify(value));
  } catch {
    // Quota, most likely because the prices are already in there. The session
    // still has its in-memory copy, which is what the valuation actually reads.
  }
};

const fetchCatalogue = async (): Promise<CatalogueSnapshot | null> => {
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(ITEMS_URL, { signal: controller.signal });
    if (!response.ok) return null;
    const catalogue = trimCatalogue(await response.json());
    if (!catalogue) return null;
    const fresh: CatalogueSnapshot = { catalogue, fetchedAt: Date.now() };
    writeCachedCatalogue(fresh);
    snapshot = fresh;
    return fresh;
  } catch {
    return null;
  } finally {
    clearTimeout(deadline);
  }
};

const gate = makeGate(fetchCatalogue, CATALOGUE_MIN_GAP_MS);

/**
 * Get the catalogue: memory, then disk, then the network.
 *
 * A failure returns whatever is in hand rather than nothing, including a stale
 * copy. A twelve-hour-old catalogue values a starred Necron's Blade correctly;
 * no catalogue at all silently values it as an unstarred one, which is a far
 * worse answer than an old one.
 */
export const loadCatalogue = async (force = false): Promise<Catalogue> => {
  if (!snapshot) snapshot = readCachedCatalogue();

  const stale = !snapshot || Date.now() - snapshot.fetchedAt >= CATALOGUE_TTL_MS;
  if (!force && !stale) return snapshot!.catalogue;

  const fresh = await gate.run();
  return (fresh ?? snapshot)?.catalogue ?? {};
};

/** True when the valuation would be running without the catalogue's help. */
export const hasCatalogue = (): boolean => snapshot !== null;

export const catalogueFetchedAt = (): number | null => snapshot?.fetchedAt ?? null;

/** Test seam. Sets the in-memory copy without touching the network or disk. */
export const setCatalogueForTesting = (catalogue: Catalogue, fetchedAt = Date.now()): void => {
  snapshot = { catalogue, fetchedAt };
};
