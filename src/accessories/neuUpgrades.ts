import type { IdUpgradeEdge } from "./chains";

/**
 * Accessory upgrade edges from the NotEnoughUpdates repository.
 *
 * WHY A THIRD EDGE SOURCE
 * -----------------------
 * The wiki is the primary source of upgrade chains and stays that way, but it
 * only knows what an editor wrote into an infobox, and the measured gap is real:
 * one upgrade name in the live data resolves to nothing, and chains whose
 * articles simply omit the fields are invisible to it. NEU's mod has to know
 * the same relationships to draw its own accessory overlay, and it publishes
 * them as data: `constants/misc.json` in the NotEnoughUpdates-REPO carries a
 * `talisman_upgrades` map of Hypixel id -> the ids above it, e.g.
 *
 *   "SPEED_TALISMAN": ["SPEED_RING", "SPEED_ARTIFACT", "SPEED_RELIC"]
 *
 * Each array is the full ascent from its key, so consecutive pairs are the
 * edges: base -> a[0], a[0] -> a[1], and so on. The repo states the same chain
 * from every rung (SPEED_RING has its own entry listing the two above it), so
 * the parser dedupes; measured on the live file, 299 entries flatten to 422
 * distinct edges.
 *
 * These edges are already Hypixel ids, which is exactly what the wiki edges are
 * not, so they enter `buildChainIndex` through the id door and never touch name
 * resolution. Wiki edges remain primary; NEU adds what the wiki misses;
 * agreement between the two is harmless because edges land in a set.
 *
 * LICENCE
 * -------
 * NotEnoughUpdates-REPO is MIT (LICENSE at the repo root, verified). The file
 * is fetched at runtime by the visitor's own browser, same as the networth
 * price list; nothing from the repo ships in this project or in a build. The
 * attribution lives in NOTICE.md.
 */

export const NEU_UPGRADES_URL =
  "https://raw.githubusercontent.com/NotEnoughUpdates/NotEnoughUpdates-REPO/master/constants/misc.json";

/** New surface, so a new key. Nothing else in this browser is touched. */
export const NEU_CACHE_KEY = "skydex.accessories.neu.v1";

/** The constant changes with game updates, not with page views. Same as the wiki cache. */
export const NEU_TTL = 24 * 60 * 60 * 1000;

/**
 * Parse the `talisman_upgrades` constant out of misc.json.
 *
 * Pure, and deliberately narrow: ONLY that one key is read, whatever else the
 * file carries (`item_types`, `minions`, a dozen others), because that is the
 * only constant this project has verified and the only one NOTICE.md claims.
 *
 * Forgiving entry by entry, since this reads a file other people maintain: a
 * value that is not an array, or an array member that is not a non-empty
 * string, costs that entry or that member rather than the whole fetch. A step
 * from an id to itself is dropped the same way the wiki parser drops a
 * self-upgrade: a typo, not a cycle worth modelling.
 */
export function parseTalismanUpgrades(json: unknown): IdUpgradeEdge[] {
  if (typeof json !== "object" || json === null) return [];
  const table = (json as Record<string, unknown>).talisman_upgrades;
  if (typeof table !== "object" || table === null || Array.isArray(table)) return [];

  const seen = new Set<string>();
  const edges: IdUpgradeEdge[] = [];

  for (const [base, ascent] of Object.entries(table as Record<string, unknown>)) {
    if (!base || !Array.isArray(ascent)) continue;

    let prev = base;
    for (const step of ascent) {
      if (typeof step !== "string" || !step) continue;
      if (step !== prev) {
        const key = `${prev}\u0000${step}`;
        if (!seen.has(key)) {
          seen.add(key);
          edges.push({ fromId: prev, toId: step });
        }
      }
      prev = step;
    }
  }

  return edges;
}

interface NeuCache {
  fetchedAt: number;
  edges: IdUpgradeEdge[];
}

export const readNeuCache = (): NeuCache | null => {
  try {
    const raw = localStorage.getItem(NEU_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NeuCache;
    return Array.isArray(parsed?.edges) && typeof parsed.fetchedAt === "number" ? parsed : null;
  } catch {
    return null;
  }
};

export const writeNeuCache = (cache: NeuCache): void => {
  try {
    localStorage.setItem(NEU_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // A few kilobytes, and quotas vary. Losing it costs a refetch next visit.
  }
};

/**
 * Fetch and parse the constant. raw.githubusercontent serves
 * `Access-Control-Allow-Origin: *`, which is the same arrangement the networth
 * price list already relies on, so this works from a static build with no
 * proxy. Throws on a failed request or an empty parse; the caller decides what
 * a miss costs, which is nothing, because the wiki edges still stand.
 */
export const fetchNeuUpgrades = async (signal?: AbortSignal): Promise<IdUpgradeEdge[]> => {
  const res = await fetch(NEU_UPGRADES_URL, { signal });
  if (!res.ok) throw new Error(`NEU misc.json responded ${res.status}`);
  const edges = parseTalismanUpgrades(await res.json());
  if (edges.length === 0) throw new Error("NEU misc.json carried no talisman_upgrades");
  return edges;
};
