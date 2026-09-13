/**
 * The island data contract, v1.
 *
 * These types mirror `docs/architecture/island-data-contract.md` exactly, because the other end
 * of this contract is a Fabric mod being written in parallel. Anything not in
 * the spec is not in here, and anything the mod adds later arrives as an
 * unknown field that the validator drops on the floor rather than trusting.
 *
 * The one nuance worth stating twice, because it is the whole reason the
 * optional sections are optional: **omitted is not empty**. A missing
 * `inventory` means the mod has never looked in the player's inventory; an
 * `inventory: []` means it looked and there was genuinely nothing there. The
 * site must never render the first case as "0 items", so both the type and the
 * UI keep `undefined` and `[]` apart all the way down.
 */

/**
 * Structured item detail, for a tooltip that can say something.
 *
 * Compact structured data, never raw lore text: the mod reads the components it
 * already has rather than scraping rendered strings, and the site renders from
 * fields rather than replaying someone else's formatting.
 *
 * Every field is optional and the whole object is omitted when it would be
 * empty, so an old snapshot or a code from before this existed carries none.
 * That is ordinary input, not a degraded state, and nothing may treat a missing
 * `extra` as a warning or invent an empty one to stand in for it.
 */
export interface ItemExtra {
  /** Reforge name only, e.g. "Rapid". Not the prefixed display name. */
  reforge?: string;
  /** Upgrade or dungeon stars. */
  stars?: number;
  /** Enchantment id to level, for gear and for enchanted books alike. */
  ench?: Record<string, number>;
  /** Recombobulated. */
  recomb?: boolean;
  /**
   * Texture hash for a player_head item: the hex after `/texture/` in the
   * profile component's URL.
   *
   * A large slice of SkyBlock is player heads with custom skins, and those have
   * no wiki file to fall back on, so this is the only way to draw a pet or an
   * Abiphone as itself rather than as an empty tile.
   */
  skin?: string;
}

/** One stack as the mod saw it. `id` is a Hypixel id, or an upper-cased vanilla registry id. */
export interface IslandItem {
  id: string;
  name: string;
  count: number;
  /**
   * The 0-based container slot this stack sits in.
   *
   * Present for containers, never for sacks, which are aggregates with no
   * layout at all. When it is present the site can draw the container's true
   * shape, gaps included, which is what makes a chest recognisable as *that*
   * chest. When it is absent the entries are packed and the reader falls back
   * to rendering them in order, so older snapshots keep working untouched.
   */
  slot?: number;
  /** Absent whenever there was nothing worth saying. See `ItemExtra`. */
  extra?: ItemExtra;
}

/** A container on the private island, identified by where it is standing. */
export interface IslandChest {
  /** Block position, `[x, y, z]`. This is the chest's identity, not its label. */
  pos: [number, number, number];
  /** Container screen title with colour codes stripped. Often just "Chest". */
  name: string;
  /** ms epoch of the last time the player opened it. */
  lastSeen: number;
  items: IslandItem[];
}

export interface IslandPlayer {
  uuid: string;
  name: string;
}

/** `gameMode` is null on a normal profile; the mod sends the raw Hypixel string otherwise. */
export interface IslandProfile {
  name: string;
  gameMode: string | null;
}

/**
 * One occupied cell of the observed greenhouse board.
 *
 * Split into two shapes rather than one with two optional fields, because the
 * spec's rule is crop XOR mutation and a single interface with both optional
 * would let a consumer construct the contradiction the validator exists to
 * refuse. Written as a union, "both" and "neither" are unrepresentable, and a
 * check on either field narrows to the other being absent.
 *
 * `x` is the column and `y` the row, 0-based, with (0,0) at the same corner the
 * layout push anchors to, so a pushed layout and an observed board line up.
 */
interface GreenhouseCellBase {
  x: number;
  y: number;
  /**
   * ms epoch the cell's next growth stage is due, when the player has opened
   * Crop Diagnostics for it.
   *
   * Player-triggered and per-crop, so it is present on a minority of cells and
   * absent everywhere else. Absent is the ordinary case, never a degraded one.
   */
  nextStageAt?: number;
}

export interface GreenhouseCropCell extends GreenhouseCellBase {
  /** Hypixel-style crop id, e.g. `PUMPKIN`. */
  crop: string;
  mutation?: undefined;
}

export interface GreenhouseMutationCell extends GreenhouseCellBase {
  /** Hypixel-style mutation id, e.g. `CHOCONUT`. */
  mutation: string;
  crop?: undefined;
}

export type GreenhouseCell = GreenhouseCropCell | GreenhouseMutationCell;

/**
 * The greenhouse board as the mod last saw it.
 *
 * A verified observation and nothing else: only occupied cells are listed, and
 * nothing here is projected forward. `observedAt` is the whole honesty of the
 * section, because a board is a picture of a moment and a picture with no time
 * on it is a claim about now that nobody checked.
 */
export interface GreenhouseBoard {
  /** ms epoch of the scan. */
  observedAt: number;
  /** `[width, height]`. Ten by ten today; carried as data so it can stop being. */
  size: [number, number];
  /** Occupied cells only. An observation with none is not a board, and never renders. */
  cells: GreenhouseCell[];
}

export interface IslandSnapshot {
  /** Always 1 for this shape. A different number is a different contract. */
  schema: 1;
  /** ms epoch, when the mod took the snapshot. */
  exportedAt: number;
  player: IslandPlayer;
  profile: IslandProfile;
  /** Hypixel item id -> total in sacks. */
  sacks: Record<string, number>;
  chests: IslandChest[];

  /**
   * Captured-or-not sections. `undefined` means the mod has not observed this
   * container yet; `[]` means it observed it and found nothing.
   */
  inventory?: IslandItem[];
  enderChest?: IslandItem[];
  /** Backpacks, flattened across pages. */
  storage?: IslandItem[];

  /**
   * The greenhouse board, when the mod has scanned it.
   *
   * Optional on exactly the same terms as the sections above: omitted until the
   * first observation, never sent empty. It replaces wholesale like every other
   * section, so a newer snapshot without it means "not observed this session"
   * and the board simply stops being shown. Nothing carries a previous
   * session's board forward, because a stale board under a fresh timestamp is
   * the one failure a live-tracking feature cannot survive.
   */
  greenhouse?: GreenhouseBoard;
}

/**
 * What we keep in localStorage.
 *
 * The snapshot is stored as received, wrapped with the moment it arrived, so
 * the page can say "snapshot from 20 minutes ago" using our clock rather than
 * trusting `exportedAt` from a machine whose clock we do not control.
 */
export interface StoredIsland {
  receivedAt: number;
  snapshot: IslandSnapshot;
}
