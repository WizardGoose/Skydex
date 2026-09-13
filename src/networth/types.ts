/**
 * The shapes the valuation works on.
 *
 * `RawItem` is deliberately the shape a decoded Hypixel container blob already
 * has, key for key, rather than a tidier projection of it. Two reasons, and the
 * second is the load bearing one:
 *
 *   The modifiers live all over `ExtraAttributes` and there are about forty of
 *   them. A projection would have to enumerate every one, and the day Hypixel
 *   adds the forty first the projection silently drops it while the handler
 *   that reads it still compiles.
 *
 *   Parity. `tools/networth-parity.mjs` feeds the SAME objects to the real
 *   SkyHelper library and to this port. That is only possible because this is
 *   the same shape prismarine-nbt's `simplify` produces, so nothing is
 *   translated on the way into either side and a delta can only come from the
 *   valuation rules, which is the thing being checked.
 *
 * `src/nbt` produces this shape through `simplifyItems`, so the browser path
 * and the parity path agree by construction rather than by discipline.
 */

/**
 * `unknown` on the index signatures, deliberately.
 *
 * A decoded NBT compound can hold any tag type and the forty handlers each read
 * a different key out of one. Typing the index as a union of everything NBT can
 * hold looks more precise and is not: it forces every nested shape to be
 * declared in that union too, and the first field Hypixel adds that does not fit
 * makes the whole type a lie. `unknown` states the truth, which is that nothing
 * is known about a field until the handler that owns it checks.
 */
export interface ExtraAttributes {
  id?: string;
  [key: string]: unknown;
}

export interface RawItemTag {
  display?: { Name?: string; Lore?: string[] };
  ExtraAttributes?: ExtraAttributes;
  [key: string]: unknown;
}

export interface RawItem {
  Count?: number;
  tag?: RawItemTag;
  [key: string]: unknown;
}

/**
 * A pet as `member.pets_data.pets[]` sends it, and as
 * `tag.ExtraAttributes.petInfo` holds it once parsed. Same shape both ways,
 * which is why a pet found in a chest values identically to one in the pet menu.
 */
export interface PetData {
  type: string;
  tier: string;
  exp: number;
  heldItem?: string | null;
  candyUsed?: number;
  skin?: string | null;
  uuid?: string | null;
  active?: boolean;
  [key: string]: unknown;
}

/** An id with a count. Sacks, essence and island chest rollups all reduce to this. */
export interface BasicItem {
  id: string;
  amount: number;
}

/** `{ ITEM_ID: coins }`, straight off the SkyHelper prices file. */
export type PriceMap = Record<string, number>;

/**
 * The slice of Hypixel's item catalogue the valuation actually reads.
 *
 * Trimmed rather than kept whole because the full resource is about 5 MB and
 * this is 0.8 MB, which is the difference between something that fits in
 * localStorage beside the prices and something that does not.
 */
export interface CatalogueEntry {
  id?: string;
  name?: string;
  category?: string;
  tier?: string;
  soulbound?: string;
  museum?: boolean;
  /** Base item stats, retained so catalogue-only Museum entries still have truthful tooltips. */
  stats?: Record<string, number>;
  /** Hypixel's canonical Museum unit metadata, trimmed to collection semantics. */
  museum_data?: CatalogueMuseumData;
  upgrade_costs?: UpgradeCost[][] | UpgradeCost[];
  gemstone_slots?: GemstoneSlot[];
  prestige?: { item_id?: string; costs?: UpgradeCost[] };
}

export interface CatalogueMuseumData {
  donation_xp?: number;
  category?: string;
  armor_set_donation_xp?: Record<string, number>;
  mapped_item_ids?: string[];
  game_stage?: string;
}

export interface UpgradeCost {
  type?: string;
  essence_type?: string;
  item_id?: string;
  amount?: number;
  coins?: number;
}

export interface GemstoneSlot {
  slot_type: string;
  costs?: UpgradeCost[];
}

export type Catalogue = Record<string, CatalogueEntry>;

/**
 * One line of the reason a number is what it is.
 *
 * This is the whole point of showing a breakdown rather than a total: a player
 * looking at 470 million coins deserves to see which 40 million of it is the
 * recombobulator and which 200 million is five master stars.
 */
export interface CalculationEntry {
  id: string;
  type: string;
  price: number;
  count: number;
  /** Only set by the rod-part handler, which is the one modifier that can be soulbound on its own. */
  soulbound?: boolean;
  /** Only set by essence star costs, naming which star this cost belongs to. */
  star?: number;
}

/** A valued item, as a category's `items` array holds it. */
export interface ValuedItem {
  name: string;
  /** The raw Hypixel id, before normalisation. What the player would search for. */
  id: string;
  /** The id the price was actually looked up under, after normalisation. */
  customId: string;
  price: number;
  basePrice: number;
  count: number;
  soulbound: boolean;
  cosmetic: boolean;
  /**
   * The part of `price` that is soulbound even though the item is not.
   * A museum-donated rod part on a tradeable rod is the case this exists for.
   */
  soulboundPortion: number;
  calculation: CalculationEntry[];
  /** True for pets, so the stacker leaves them alone. */
  isPet?: boolean;
  petData?: PetData;
}

export interface CategoryResult {
  total: number;
  unsoulboundTotal: number;
  items: ValuedItem[];
}

export interface NetworthResult {
  networth: number;
  unsoulboundNetworth: number;
  /** True when the Inventory API toggle is off, so "empty inventory" is not a claim we are making. */
  noInventory: boolean;
  purse: number;
  bank: number;
  personalBank: number;
  types: Record<string, CategoryResult>;
}

/** Everything the aggregator needs that is not an item. */
export interface CoinBalances {
  purse: number;
  /** Profile-level co-op bank. Null when the player's Banking API toggle hides it. */
  bank: number;
  personalBank: number;
}

export interface NetworthOptions {
  prices: PriceMap;
  catalogue: Catalogue;
  /** Drop cosmetic value (skins, dyes, runes) from every total. */
  nonCosmetic?: boolean;
  /** Collapse identical stacks into one row. On by default, matching upstream. */
  stackItems?: boolean;
  /** Sort each category's items by price, descending. On by default. */
  sortItems?: boolean;
}
