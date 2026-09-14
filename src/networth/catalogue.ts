import { makeGate } from "../island/gate";
import { fetchItemResourceItems } from "../items/itemResourceFetch";
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
 * backend. It is about 5 MB on the wire and remains small once the fields
 * below are kept, which is the difference between something that can sit in
 * localStorage next to the prices and something that cannot.
 *
 * It changes with game updates rather than with the market, so the cache runs
 * for twelve hours where prices run for twenty minutes.
 */

/** A NEW key. See the note on `PRICES_KEY`; nothing existing is touched. */
export const CATALOGUE_KEY = "skydex.networth.items.v3";

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
 * Keep ten fields and drop about sixty.
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
    if (isObject(raw.stats)) {
      const stats = Object.fromEntries(Object.entries(raw.stats).filter((value): value is [string, number] => (
        typeof value[1] === "number" && Number.isFinite(value[1])
      )));
      if (Object.keys(stats).length > 0) entry.stats = stats;
    }
    if (isObject(raw.museum_data)) {
      const museumData: NonNullable<CatalogueEntry["museum_data"]> = {};
      const donationXp = raw.museum_data.donation_xp;
      if (typeof donationXp === "number" && Number.isFinite(donationXp) && donationXp >= 0) {
        museumData.donation_xp = donationXp;
      }
      if (typeof raw.museum_data.category === "string") museumData.category = raw.museum_data.category;
      if (typeof raw.museum_data.game_stage === "string") museumData.game_stage = raw.museum_data.game_stage;
      if (isObject(raw.museum_data.armor_set_donation_xp)) {
        const setXp = Object.fromEntries(Object.entries(raw.museum_data.armor_set_donation_xp)
          .filter((entry): entry is [string, number] => (
            typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] >= 0
          )));
        if (Object.keys(setXp).length > 0) museumData.armor_set_donation_xp = setXp;
      }
      if (Array.isArray(raw.museum_data.mapped_item_ids)) {
        const mappedIds = raw.museum_data.mapped_item_ids
          .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
        if (mappedIds.length > 0) museumData.mapped_item_ids = mappedIds;
      }
      if (Object.keys(museumData).length > 0) entry.museum_data = museumData;
    }
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
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      deadline = setTimeout(() => reject(new Error("items resource request timed out")), TIMEOUT_MS);
    });
    const items = await Promise.race([fetchItemResourceItems(), timeout]);
    const catalogue = trimCatalogue({ items });
    if (!catalogue) return null;
    const fresh: CatalogueSnapshot = { catalogue, fetchedAt: Date.now() };
    writeCachedCatalogue(fresh);
    snapshot = fresh;
    return fresh;
  } catch {
    return null;
  } finally {
    if (deadline) clearTimeout(deadline);
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

/**
 * The last catalogue already available to this browser session or on disk.
 *
 * Unlike `loadCatalogue`, this never starts a network request. Profile cache
 * hydration uses it so a page refresh can paint the last good profile before
 * independently refreshing this much larger, keyless resource.
 */
export const cachedCatalogue = (): CatalogueSnapshot | null => {
  if (!snapshot) snapshot = readCachedCatalogue();
  return snapshot;
};

/** Test seam. Sets the in-memory copy without touching the network or disk. */
export const setCatalogueForTesting = (catalogue: Catalogue, fetchedAt = Date.now()): void => {
  snapshot = { catalogue, fetchedAt };
};
