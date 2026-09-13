import { petLevel } from "./petValue";
import { titleCase } from "./helpers";
import { recombDisplayTier } from "../ui/kit";
import { hashFromSkinValue } from "../accessories/headHashes";
import type { PetData, RawItem } from "./types";

/**
 * Parsed profile containers, turned into what the profile viewer draws.
 *
 * The Island page's gear and pet sections (the profile page is a profile
 * viewer in the SkyCrypt mould; that is its whole goal) read
 * the DECODED containers rather than the valuation's category lists, because
 * the valuation drops zero-priced rows and a profile viewer must not: a
 * worthless helmet is still a helmet you are wearing.
 *
 * Everything here is a pure mapping so it can be tested without rendering
 * anything. Nothing is invented on the way through:
 *
 *   - names come off the item's own display tag, with the game's colour codes
 *     stripped, falling back to the id in title case. An item with neither is
 *     dropped rather than drawn as a mystery tile claiming to be something.
 *   - slot positions are NOT reconstructed for worn armour. The decoder drops
 *     empty slots before this module ever sees that list (see simplifyItems),
 *     so which of the four pieces is missing is genuinely unknowable there.
 *     Wardrobe sets are different: their numbered set keys and four nullable
 *     piece positions are preserved by parseMemberLoadouts.
 */

/** The slot-grid item shape, restated structurally so ui/ stays import-free of networth/. */
export interface GearItem {
  id: string;
  name: string;
  count: number;
  extra?: { ench?: Record<string, number>; recomb?: boolean; skin?: string };
  /** Verbatim display lore, including Minecraft colour codes and blank lines. */
  lore?: string[];
}

/**
 * Which tier a recombed piece displays at. The ladder itself lives in the kit
 * beside the rarity tile maps it exists for (`recombDisplayTier`); this
 * re-export keeps the gear-shaped name the profile page and its tests use.
 */
export const recombTier = recombDisplayTier;

/** Minecraft's section-sign formatting codes, which raw display names carry. */
const stripCodes = (value: string): string => value.replace(/§[0-9a-fk-or]/gi, "");

const GEAR_RARITY_LINE = /^(?:[^A-Z0-9]+)?(VERY SPECIAL|SPECIAL|DIVINE|MYTHIC|LEGENDARY|EPIC|RARE|UNCOMMON|COMMON|ULTIMATE|SUPREME)\b/i;

const recordValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

/** The texture property on this exact stack, when it is a custom head. */
export const stackTextureHash = (raw: RawItem): string | null => {
  const skull = recordValue(raw.tag?.SkullOwner ?? raw.tag?.skullOwner);
  const properties = recordValue(skull?.Properties ?? skull?.properties);
  const textures = properties?.textures;
  if (!Array.isArray(textures)) return null;
  for (const texture of textures) {
    const entry = recordValue(texture);
    const value = entry?.Value ?? entry?.value;
    if (typeof value !== "string" || !value) continue;
    const hash = hashFromSkinValue(value);
    if (hash) return hash;
  }
  return null;
};

/**
 * Read the displayed rarity from an item's own final lore line.
 *
 * This intentionally lives beside generic gear parsing rather than the
 * accessory-bag parser. Armour, equipment, weapons, and milestone-upgraded
 * items use different type suffixes, but the rarity token itself is stable.
 * The live item is authoritative; catalog rarity is only a fallback.
 */
export const tierFromGearLore = (lore: readonly string[] | null | undefined): string | null => {
  if (!lore?.length) return null;
  for (let index = lore.length - 1; index >= 0; index -= 1) {
    const line = stripCodes(lore[index] ?? "").trim();
    if (!line) continue;
    const match = GEAR_RARITY_LINE.exec(line);
    if (match) return match[1].toUpperCase().replace(/\s+/g, "_");
  }
  return null;
};

/**
 * One decoded stack, as a slot. Null when the entry carries nothing we can
 * honestly draw: no id and no name is not an item, it is decoder residue.
 */
export const rawToGearItem = (raw: RawItem): GearItem | null => {
  const id = typeof raw.tag?.ExtraAttributes?.id === "string" ? raw.tag.ExtraAttributes.id : "";
  const rawName = typeof raw.tag?.display?.Name === "string" ? stripCodes(raw.tag.display.Name).trim() : "";
  const name = rawName || (id ? titleCase(id) : "");
  if (!id && !name) return null;

  const count = typeof raw.Count === "number" && Number.isFinite(raw.Count) && raw.Count > 0 ? raw.Count : 1;

  // Enchantments ride along so the shared tooltip can list them; they are the
  // one structured detail the raw tag states in a shape the tooltip already
  // speaks. Everything else in ExtraAttributes stays where it is.
  const enchantments = raw.tag?.ExtraAttributes?.enchantments;
  const ench =
    enchantments && typeof enchantments === "object" && !Array.isArray(enchantments)
      ? Object.fromEntries(
          Object.entries(enchantments as Record<string, unknown>).filter(
            (pair): pair is [string, number] => typeof pair[1] === "number"
          )
        )
      : undefined;

  // The recomb flag, exactly as the accessories bag reader takes it
  // (`rarity_upgrades`, an int that is only ever 1 in live data): it decides
  // which rarity tile the piece wears, because a recombed piece IS the higher
  // rarity in game.
  const upgrades = raw.tag?.ExtraAttributes?.rarity_upgrades;
  const recomb = typeof upgrades === "number" && upgrades >= 1;
  const skin = stackTextureHash(raw);

  const item: GearItem = { id: id || name.toUpperCase().replace(/\s+/g, "_"), name, count };
  const lore = raw.tag?.display?.Lore;
  if (Array.isArray(lore) && lore.length > 0 && lore.every((line) => typeof line === "string")) {
    item.lore = [...lore];
  }
  if ((ench && Object.keys(ench).length > 0) || recomb || skin) {
    item.extra = {};
    if (ench && Object.keys(ench).length > 0) item.extra.ench = ench;
    if (recomb) item.extra.recomb = true;
    if (skin) item.extra.skin = skin;
  }
  return item;
};

/** A whole decoded container, in the order the blob stated it, empties already gone. */
export const gearItems = (list: unknown[] | undefined): GearItem[] => {
  if (!Array.isArray(list)) return [];
  const out: GearItem[] = [];
  for (const entry of list) {
    const item = rawToGearItem(entry as RawItem);
    if (item) out.push(item);
  }
  return out;
};

/**
 * Armor reads top-down. The blob stores boots first and helmet last, which is
 * Minecraft's order and nobody's mental model; SkyCrypt draws helmet at the
 * top and so do we.
 */
export const armorItems = (list: unknown[] | undefined): GearItem[] => gearItems(list).reverse();

/** The states a visible wardrobe set can honestly occupy. */
export type GearWardrobeState = "occupied" | "unlocked-empty" | "locked" | "private";

/** Presentation-ready wardrobe input, shared by armour and equipment. */
export interface GearSetView {
  /** Hypixel's one-based wardrobe set id. */
  id: number;
  pieces: readonly (GearItem | null)[];
}

export interface GearWardrobeSlot {
  /** Null is the single private/unavailable marker, not a guessed set id. */
  id: number | null;
  state: GearWardrobeState;
  pieces: readonly (GearItem | null)[];
}

export interface GearWardrobeRow {
  slots: readonly GearWardrobeSlot[];
}

const emptyWardrobePieces = (): readonly (GearItem | null)[] => [null, null, null, null];

/**
 * Keep wardrobe columns coherent while retaining the API's state distinctions.
 *
 * The API exposes one-based set keys. A set key with no decoded pieces is an
 * unlocked-empty set; a missing key between 1 and the largest exposed key is a
 * locked slot. A null/private marker is returned only when the caller knows the
 * profile section was not shared. No capacity beyond the largest exposed key
 * is invented.
 */
export const buildWardrobeRows = (
  sets: readonly GearSetView[],
  options: { available?: boolean; capacity?: number | null; columns?: number } = {}
): GearWardrobeRow[] => {
  const columns = Number.isInteger(options.columns) && (options.columns ?? 0) > 0 ? options.columns! : 9;
  if (options.available === false) {
    return [{ slots: [{ id: null, state: "private", pieces: emptyWardrobePieces() }] }];
  }

  const byId = new Map<number, GearSetView>();
  for (const set of sets) {
    if (Number.isInteger(set.id) && set.id >= 1) byId.set(set.id, set);
  }
  const ids = [...byId.keys()].sort((a, b) => a - b);
  const largestExposedId = ids.at(-1) ?? 0;
  const capacity = options.capacity === null
    ? largestExposedId
    : Math.max(largestExposedId, options.capacity ?? largestExposedId);
  if (capacity < 1) return [];

  const slots: GearWardrobeSlot[] = [];
  for (let id = 1; id <= capacity; id++) {
    const set = byId.get(id);
    const pieces = set ? Array.from({ length: 4 }, (_, index) => set.pieces[index] ?? null) : emptyWardrobePieces();
    slots.push({
      id,
      state: set ? (pieces.some((piece) => piece !== null) ? "occupied" : "unlocked-empty") : "locked",
      pieces,
    });
  }

  const rows: GearWardrobeRow[] = [];
  for (let start = 0; start < slots.length; start += columns) {
    rows.push({ slots: slots.slice(start, start + columns) });
  }
  return rows;
};

/** One pet, as the pet grid draws it. */
export interface PetTile {
  /** Stable within one profile: pets carry a uuid, and the fallback includes exp so two identical pets stay apart. */
  key: string;
  /** The real pet uuid when the payload states one; null for the fallback key. */
  uuid: string | null;
  name: string;
  /**
   * The wiki's name for the pet's picture. The wiki files pets under
   * "<Kind> Pet" ("Hedgehog Pet.png"), verified against the live wiki
   * 2026-08-03, while the plain kind is the mob's article. Resolving the icon
   * under the display name drew mobs at best and blanks at worst.
   */
  iconName: string;
  /**
   * The `PET_<TYPE>` id spelling, for the texture pack lookup. This is the
   * key catharsis-format packs state pet textures under (their `items/pets/`
   * sub-identifier folder maps to it in `texturePackParse.ts`), and it is
   * not derivable from `iconName`, whose job is the wiki's "<Kind> Pet"
   * article title. Handed to `SlotIcon` as `hypixelId`, never rendered.
   */
  packId: string;
  level: number;
  /** Lowercased tier for the kit's rarity colour map. */
  tier: string;
  /** The currently summoned pet, which deserves saying but not a new colour. */
  active: boolean;
}

/**
 * Pets, sorted the way a player scans them: the active one first, then by
 * level, then by name so equals do not shuffle between renders.
 */
export const petTiles = (pets: unknown[] | undefined): PetTile[] => {
  if (!Array.isArray(pets)) return [];
  const out: PetTile[] = [];
  for (const entry of pets) {
    const pet = entry as PetData;
    if (!pet || typeof pet.type !== "string" || typeof pet.tier !== "string") continue;
    const { level } = petLevel(pet);
    const name = titleCase(pet.type);
    out.push({
      uuid: typeof pet.uuid === "string" && pet.uuid ? pet.uuid : null,
      key: typeof pet.uuid === "string" && pet.uuid ? pet.uuid : `${pet.tier}_${pet.type}_${pet.exp ?? 0}`,
      name,
      iconName: `${name} Pet`,
      packId: `PET_${pet.type.toUpperCase()}`,
      level,
      tier: pet.tier.toLowerCase(),
      active: pet.active === true,
    });
  }
  return out.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    if (a.level !== b.level) return b.level - a.level;
    return a.name.localeCompare(b.name);
  });
};
