import { norm } from "../items/wikiCrafting";
import type { AccessoryCatalogue } from "./catalogue";

/**
 * Accessory upgrade chains, read from the wiki.
 *
 * WHY THIS EXISTS, AND THE BUG THAT CAUSED IT
 * -------------------------------------------
 * The first version of this page derived families from the id naming
 * convention: strip a trailing `_TALISMAN` / `_RING` / `_ARTIFACT` / `_RELIC`
 * and group by the stem. That works for the many chains Hypixel names tidily,
 * and it is wrong the moment a chain renames its rungs.
 *
 * The reported case is the whole argument. Owning the Seal of the Family left
 * Crooked Artifact sitting in Missing, because the chain is
 *
 *   Shady Ring -> Crooked Artifact -> Seal of the Family
 *
 * and no two of those three share a stem. The stem rule could not have linked
 * them, and no amount of tuning it would have: the information simply is not in
 * the id.
 *
 * The wiki states it outright, in the accessory infobox:
 *
 *   |upgrades_from = Shady Ring
 *   |upgrades_to   = Seal of the Family
 *
 * Measured across all 407 accessories: 237 articles state an upgrade link,
 * giving 161 unique directed edges and 78 chains covering 239 accessories,
 * against the stem rule's 51 chains covering 147. **66 of those 161 edges, 41
 * per cent, are invisible to the stem rule.** Exactly one upgrade name in the
 * whole catalogue fails to resolve to an accessory.
 *
 * So the wiki is the primary source and the stem rule is kept only as a
 * supplement for chains the wiki has not documented. Nothing here costs an
 * extra request: `sources.ts` already fetches every accessory article to
 * classify where it comes from, and these fields are read from that same
 * response.
 *
 * DIRECTION MATTERS
 * -----------------
 * The graph is directed, base first. Owning a rung covers everything BELOW it,
 * because the game consumed those to make it, and covers nothing above it.
 * A player holding the Seal of the Family is not missing the Crooked Artifact;
 * a player holding the Shady Ring is still missing both.
 */

/** One documented upgrade step, base first, by display name. */
export interface UpgradeEdge {
  from: string;
  to: string;
}

/**
 * One upgrade step already stated in Hypixel ids, base first.
 *
 * A separate shape from `UpgradeEdge` on purpose. Wiki edges arrive by display
 * name and have to be resolved against the catalogue before they mean anything;
 * NEU's `talisman_upgrades` constant is keyed by the same ids the bag decodes
 * to, so pushing those through name resolution would be a lossy round trip
 * (id -> name -> id) that can only ever drop edges. The two kinds meet in
 * `buildChainIndex`, each entering by its own door.
 */
export interface IdUpgradeEdge {
  fromId: string;
  toId: string;
}

/**
 * Pull the upgrade links out of one article.
 *
 * Three field names are read because editors use all three. `upgrades_to` and
 * `higher_tier` both name the rung above; `upgrades_from` names the rung below,
 * and is flipped so every edge in the list points the same way.
 *
 * Values are cleaned of wiki link brackets and templates, because an editor may
 * write `[[Seal of the Family]]` or wrap it. A value left empty after cleaning
 * is dropped rather than recorded as an edge to nowhere.
 */
export function parseUpgradeEdges(title: string, wikitext: string): UpgradeEdge[] {
  const field = (key: string): string | null => {
    const m = wikitext.match(new RegExp(`\\|\\s*${key}\\s*=\\s*([^\\n|}]+)`, "i"));
    if (!m) return null;
    const value = m[1]
      .replace(/\[\[|\]\]/g, "")
      .replace(/\{\{[^}]*\}\}/g, "")
      .trim();
    return value || null;
  };

  const edges: UpgradeEdge[] = [];

  for (const key of ["upgrades_to", "higher_tier"]) {
    const up = field(key);
    // A chain that claims to upgrade into itself is a wiki typo, not a cycle
    // worth modelling.
    if (up && norm(up) !== norm(title)) edges.push({ from: title, to: up });
  }

  const down = field("upgrades_from");
  if (down && norm(down) !== norm(title)) edges.push({ from: down, to: title });

  return edges;
}

/** id -> the ids it sits above, so owning it covers all of them. */
export type ChainIndex = Record<string, string[]>;

/**
 * Upgrade lines whose relationship is encoded in stable Hypixel ids rather
 * than the talisman/ring/artifact/relic suffix convention.
 *
 * The numeric prefixes are explicit allowlists. A generic trailing-number
 * rule would collapse unrelated variants, while these four lines are actual
 * ordered progressions. The named Shady line is the verified counterexample
 * that originally required an id graph at all.
 */
const NUMERIC_CHAIN_PREFIXES = [
  "MASTER_SKULL_TIER_",
  "CAMPFIRE_TALISMAN_",
  "SOUL_CAMPFIRE_TALISMAN_",
  "CRUX_TALISMAN_",
] as const;

const STABLE_NAMED_CHAINS: readonly (readonly string[])[] = [
  ["SHADY_RING", "CROOKED_ARTIFACT", "SEAL_OF_THE_FAMILY"],
  ["PIGGY_BANK", "CRACKED_PIGGY_BANK", "BROKEN_PIGGY_BANK"],
];

export function stableIdUpgradeEdges(catalogue: AccessoryCatalogue): IdUpgradeEdge[] {
  const edges: IdUpgradeEdge[] = [];

  const connect = (ids: readonly string[]) => {
    for (let i = 1; i < ids.length; i++) {
      if (!catalogue.byId[ids[i - 1]] || !catalogue.byId[ids[i]]) continue;
      edges.push({ fromId: ids[i - 1], toId: ids[i] });
    }
  };

  for (const prefix of NUMERIC_CHAIN_PREFIXES) {
    const ranked = catalogue.entries
      .map((entry) => {
        if (!entry.id.startsWith(prefix)) return null;
        const rank = Number(entry.id.slice(prefix.length));
        return Number.isSafeInteger(rank) && rank > 0 ? { id: entry.id, rank } : null;
      })
      .filter((entry): entry is { id: string; rank: number } => entry !== null)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id));
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i].rank !== ranked[i - 1].rank + 1) continue;
      edges.push({ fromId: ranked[i - 1].id, toId: ranked[i].id });
    }
  }

  for (const chain of STABLE_NAMED_CHAINS) connect(chain);
  return edges;
}

/**
 * Turn edges into "what does owning this cover".
 *
 * Edges arrive by display name because that is how the wiki writes them, and
 * are resolved to Hypixel ids here against the catalogue. A name that resolves
 * to nothing is dropped: one exists in the live data, and silently inventing an
 * id for it would be worse than losing one edge.
 *
 * The walk is transitive and depth-limited. Transitive because a three rung
 * chain has to cover both lower rungs from the top, and depth-limited because a
 * wiki edit could make the graph cyclic, and this runs in a browser on someone
 * else's data. A visited set makes a cycle terminate rather than hang.
 */
export function buildChainIndex(
  edges: readonly UpgradeEdge[],
  catalogue: AccessoryCatalogue,
  /**
   * Edges already in Hypixel ids, from NEU's `talisman_upgrades` constant.
   *
   * The third source, after the wiki and before the stem supplement. These do
   * NOT go through name resolution: they are already the primary key, and
   * resolving them by name would only lose the ones whose display name differs
   * from the wiki's spelling. An id the catalogue has never heard of is dropped
   * for the same reason an unresolvable name is: inventing a chain member that
   * is not an accessory we track would be worse than losing one edge. Where NEU
   * and the wiki agree, the edge lands in the same set twice, which is a no-op.
   */
  idEdges: readonly IdUpgradeEdge[] = []
): ChainIndex {
  const idByName = new Map<string, string>();
  for (const entry of catalogue.entries) {
    const key = norm(entry.name);
    if (key && !idByName.has(key)) idByName.set(key, entry.id);
  }

  /** id -> ids directly below it. */
  const below = new Map<string, Set<string>>();

  const link = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    if (!below.has(toId)) below.set(toId, new Set());
    below.get(toId)!.add(fromId);
  };

  for (const edge of edges) {
    const fromId = idByName.get(norm(edge.from));
    const toId = idByName.get(norm(edge.to));
    if (!fromId || !toId) continue;
    link(fromId, toId);
  }

  for (const edge of idEdges) {
    if (!catalogue.byId[edge.fromId] || !catalogue.byId[edge.toId]) continue;
    link(edge.fromId, edge.toId);
  }

  for (const edge of stableIdUpgradeEdges(catalogue)) link(edge.fromId, edge.toId);

  /*
   * The id-stem ladder, kept as a supplement.
   *
   * The catalogue still derives families from the naming convention and still
   * cross-checks them against rarity, and those it verified are real chains the
   * wiki may simply not have documented. They are added as consecutive edges so
   * a chain the wiki knows nothing about is not lost, and any chain both
   * sources describe simply agrees with itself.
   */
  for (const family of Object.values(catalogue.families)) {
    if (!family.collapsible) continue;
    for (let i = 1; i < family.members.length; i++) {
      link(family.members[i - 1], family.members[i]);
    }
  }

  const index: ChainIndex = {};
  for (const id of below.keys()) {
    const covered = new Set<string>();
    const stack = [...(below.get(id) ?? [])];
    let guard = 0;
    while (stack.length > 0 && guard++ < 64) {
      const next = stack.pop()!;
      if (next === id || covered.has(next)) continue;
      covered.add(next);
      for (const deeper of below.get(next) ?? []) stack.push(deeper);
    }
    if (covered.size > 0) index[id] = [...covered];
  }

  return index;
}

export const EMPTY_CHAINS: ChainIndex = {};
