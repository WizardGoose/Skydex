import type { NbtCompound, NbtTag } from "./tags";

/**
 * The SkyBlock projection: an NBT tree in, a list of items out.
 *
 * This is the only file in the module that knows anything about SkyBlock. The
 * reader, writer and transport implement a Mojang file format and would work
 * just as well on a level.dat; everything below is a set of claims about where
 * Hypixel puts things, and claims need evidence.
 *
 * ## What was verified, against what, and what was not
 *
 * The evidence is roughly 6000 real item documents, pulled while this was
 * written from `GET /v2/skyblock/auctions` (pages 0 to 5) and
 * `/v2/skyblock/auctions_ended`. Both are keyless, and both carry `item_bytes`,
 * which is byte for byte the same container and the same document shape as the
 * profile fields this module exists to read. Field by field:
 *
 *   root key `i`                    VERIFIED. The only key on the root compound
 *                                   of all 1000 blobs on auctions page 0, and a
 *                                   TAG_List of TAG_Compound in every one.
 *
 *   an empty slot is an empty       VERIFIED, and from a player-held container
 *   TAG_Compound                    rather than from an auction listing: a live
 *                                   Builder's Ruler carries its contents as a
 *                                   nested gzip NBT blob in
 *                                   `ExtraAttributes["builder's_ruler_data"]`,
 *                                   and that document's `i` list held 54
 *                                   compounds of which all 54 were empty. So
 *                                   the hole in an inventory really is `{}` and
 *                                   really does keep its slot.
 *
 *   `Count`                         VERIFIED as a TAG_Byte, present on every
 *                                   item. See `stackCount` below for the part
 *                                   that is reasoned rather than observed.
 *
 *   `tag.ExtraAttributes.id`        VERIFIED as a TAG_String on every item, and
 *                                   this is the SkyBlock id ("FIG_CHESTPLATE",
 *                                   "ADVANCED_GARDENING_HOE").
 *
 *   `tag.display.Name`              VERIFIED as a TAG_String on every item,
 *                                   carrying section-sign colour codes
 *                                   ("§5Groovy Figmail").
 *
 *   `tag.ExtraAttributes.modifier`  VERIFIED as a TAG_String. Real values seen:
 *                                   "groovy", "spiritual".
 *
 *   `.enchantments`                 VERIFIED as a TAG_Compound whose values are
 *                                   TAG_Int, keyed by lower case enchantment
 *                                   name: `{ forest_pledge: 5 }`.
 *
 *   `.rarity_upgrades`              VERIFIED as a TAG_Int. Only the value 1 was
 *                                   ever seen, which is consistent with it
 *                                   being a recombobulator count, but a larger
 *                                   value has not been observed and nothing
 *                                   here assumes it cannot happen.
 *
 *   `.uuid`                         VERIFIED as a TAG_String in dashed form,
 *                                   present on 79 of 90 items in one sample
 *                                   (it is absent on unstacked commodity items).
 *
 * Two things are NOT verified and are called out rather than glossed:
 *
 *   The profile fields themselves. `inv_contents`, `talisman_bag` and friends
 *   need an API key and a player who has enabled inventory sharing, and no such
 *   key was used here. What was verified is the container and the document
 *   shape, on both an auction listing and a player-held container blob. If
 *   Hypixel ever wrapped a profile field differently, this module would find
 *   out at the `i` lookup and say so plainly instead of returning nothing.
 *
 *   A stack count above 127. See `stackCount`.
 *
 * ## The trap in the item compound
 *
 * An item compound has a key called `id`, and it is not the SkyBlock id. It is
 * a TAG_Short holding the legacy numeric Minecraft block id (299 for a leather
 * chestplate), and reading it would produce a confident, useless number. The
 * SkyBlock id lives at `tag.ExtraAttributes.id` and nowhere else. This is
 * exactly the kind of near miss that makes a parser wrong in a way tests
 * written from the same misunderstanding will not catch, so it is written down
 * here next to the code that avoids it.
 *
 * ## Absent is null, never zero and never empty string
 *
 * The same rule `profileStats.ts` runs on, for the same reason. An item with no
 * reforge and an item whose reforge we failed to read must not look identical,
 * and `""` reads as a real, empty answer. Every optional field is `null` when
 * Hypixel did not say.
 */

export interface NbtItem {
  /** Slot index within the list, preserved so a caller can lay out a grid. */
  slot: number;
  /** tag.ExtraAttributes.id, e.g. "BIOANALYSIS_TALISMAN". Null when absent. */
  id: string | null;
  count: number;
  /** tag.display.Name, with the legacy section-sign colour codes stripped. Null when absent. */
  name: string | null;
  /**
   * tag.display.Lore, one entry per line, colour codes stripped. Null when
   * absent. This is where an item states its own rarity ("EPIC ACCESSORY" as
   * the final line), which matters because Hypixel's item resource omits
   * `tier` on a handful of old accessories and the lore is the only place the
   * player's actual item says what it is.
   */
  lore: string[] | null;
  /** tag.ExtraAttributes.enchantments, e.g. { sharpness: 5 }. Null when absent. */
  enchantments: Record<string, number> | null;
  /** tag.ExtraAttributes.modifier, the reforge, e.g. "spicy". Null when absent. */
  reforge: string | null;
  /** tag.ExtraAttributes.rarity_upgrades, the recomb flag as a count. Null when absent. */
  rarityUpgrades: number | null;
  /** tag.ExtraAttributes.talisman_enrichment, e.g. "magic_find". Null when absent. */
  enrichment: string | null;
  /** tag.ExtraAttributes.uuid, when present. Null otherwise. */
  uuid: string | null;
}

const childOf = (compound: NbtCompound, key: string): NbtTag | undefined => compound.value.get(key);

/** A nested compound, or null if the key is absent or holds something else. */
const compoundAt = (compound: NbtCompound | null, key: string): NbtCompound | null => {
  if (compound === null) return null;
  const tag = childOf(compound, key);
  return tag !== undefined && tag.type === "compound" ? tag : null;
};

const stringAt = (compound: NbtCompound | null, key: string): string | null => {
  if (compound === null) return null;
  const tag = childOf(compound, key);
  return tag !== undefined && tag.type === "string" ? tag.value : null;
};

/**
 * A whole number from any of the integer tags.
 *
 * Deliberately not `Number(tag.value)` on anything: a float rounds, and a
 * `bigint` past 2^53 loses digits on the way into a double. A TAG_Long that
 * cannot survive the conversion is refused rather than approximated, because a
 * number that is quietly wrong in the low digits is worse than no number.
 * Nothing this file reads is stored as a long today; the branch is here so that
 * if Hypixel ever moves one, it fails loudly rather than drifting.
 */
const integerAt = (compound: NbtCompound | null, key: string): number | null => {
  if (compound === null) return null;
  const tag = childOf(compound, key);
  if (tag === undefined) return null;
  switch (tag.type) {
    case "byte":
    case "short":
    case "int":
      return tag.value;
    case "long":
      return tag.value >= BigInt(Number.MIN_SAFE_INTEGER) && tag.value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(tag.value)
        : null;
    default:
      return null;
  }
};

/**
 * Minecraft's legacy colour codes: a section sign followed by exactly one
 * character, which selects a colour or a style. `[\s\S]` rather than `.`
 * because `.` does not match a newline and a display name is remote data that
 * may contain anything.
 *
 * Only the codes are removed. The result is not trimmed, because trimming is a
 * second transformation nobody asked for: a name that really does start with a
 * space is a name that really does start with a space, and the caller can see
 * that for themselves.
 */
const COLOUR_CODE = /§[\s\S]/g;

export const stripColourCodes = (text: string): string => text.replace(COLOUR_CODE, "");

/**
 * The stack size, from a signed byte.
 *
 * `Count` is a TAG_Byte in vanilla Minecraft and Hypixel keeps it that way
 * (verified on every one of roughly 6000 live items). A byte is signed, so a
 * stack of 200 would arrive as -56. Every count actually observed was between
 * 1 and 64, so the wrap has never been seen in the wild and this reinterpretation
 * is reasoning from the format rather than from data: a negative number of items
 * is meaningless, and 200 is a far more plausible reading of -56 than "minus
 * fifty six swords". Stated as a guess because it is one.
 *
 * A missing `Count` becomes 1, not 0. An item occupying a slot is at least one
 * item, and 0 would erase something visibly there from every tally this site
 * builds, which is the single worst answer available.
 */
const stackCount = (item: NbtCompound): number => {
  const raw = integerAt(item, "Count");
  if (raw === null) return 1;
  return raw < 0 ? raw + 256 : raw;
};

/**
 * Enchantment levels.
 *
 * Values are TAG_Int in live data. Anything that is not an integer tag is
 * dropped rather than coerced, on the reasoning that an enchantment whose level
 * we cannot read is better missing than present with a made up number.
 */
const readEnchantments = (extra: NbtCompound | null): Record<string, number> | null => {
  const compound = compoundAt(extra, "enchantments");
  if (compound === null) return null;
  const out: Record<string, number> = {};
  for (const key of compound.value.keys()) {
    const level = integerAt(compound, key);
    if (level !== null) out[key] = level;
  }
  // A present but empty compound stays `{}`. It means "this item has an
  // enchantments block and nothing in it", which is a different statement from
  // "this item has no enchantments block", and collapsing the two would throw
  // away the only thing that distinguishes them.
  return out;
};

/**
 * Project one slot's compound.
 *
 * Returns null for an empty slot. That is the whole reason this is a separate
 * function: "skip the holes" has to be one decision made in one place, because
 * an empty compound reported as an item is a phantom in every count downstream.
 */
const readItem = (item: NbtCompound, slot: number): NbtItem | null => {
  if (item.value.size === 0) return null;

  const tag = compoundAt(item, "tag");
  const extra = compoundAt(tag, "ExtraAttributes");
  const display = compoundAt(tag, "display");
  const rawName = stringAt(display, "Name");

  /*
   * Lore is a TAG_List of TAG_String in vanilla and in every live blob
   * sampled. Anything else shaped is treated as no lore rather than half a
   * lore: a list whose entries are not strings is not the field this reader
   * understands, and per-entry salvage would hand back lines with holes in
   * positions that matter (the rarity line is positional).
   */
  let lore: string[] | null = null;
  const loreTag = display?.value.get("Lore");
  if (loreTag !== undefined && loreTag.type === "list" && loreTag.value.every((t) => t.type === "string")) {
    lore = loreTag.value.map((t) => stripColourCodes((t as { value: string }).value));
  }

  return {
    slot,
    // `tag.ExtraAttributes.id`, never the item compound's own `id`: see the
    // note about the legacy numeric id at the top of this file.
    id: stringAt(extra, "id"),
    count: stackCount(item),
    name: rawName === null ? null : stripColourCodes(rawName),
    lore,
    enchantments: readEnchantments(extra),
    reforge: stringAt(extra, "modifier"),
    rarityUpgrades: integerAt(extra, "rarity_upgrades"),
    enrichment: stringAt(extra, "talisman_enrichment"),
    uuid: stringAt(extra, "uuid"),
  };
};

/**
 * Read an inventory document's items.
 *
 * Takes the root compound, not the document, because a caller who has one has
 * the other and this way the function has nothing to say about names.
 *
 * A structurally wrong root throws rather than returning an empty array, and
 * that is the considered choice. An empty array means "this container is
 * empty", which is a real and useful answer, and handing it back for "this is
 * not a container" would tell somebody their talisman bag is empty when in fact
 * we were looking at the wrong blob entirely. The whole point of this site is
 * telling people what they own; a confident, wrong "nothing" is the one answer
 * it must never give.
 */
export function readInventoryItems(root: NbtCompound): NbtItem[] {
  const list = childOf(root, "i");

  if (list === undefined) {
    throw new Error(
      "That item data has no `i` list, so it is not an inventory. Every SkyBlock container blob stores its " +
        "slots under `i`, so this is either a different kind of document or it was read from the wrong field."
    );
  }
  if (list.type !== "list") {
    throw new Error(
      `That item data has an \`i\` that is not a list, so its slots cannot be read. An inventory stores its ` +
        `slots as a TAG_List of TAG_Compound.`
    );
  }

  // An empty container is legitimately typed TAG_End rather than TAG_Compound,
  // because that is how the format writes an empty list and how Hypixel writes
  // one in practice. Checking the length before the element type is what keeps
  // an empty inventory from being mistaken for a malformed one.
  if (list.value.length === 0) return [];

  if (list.elementType !== "compound") {
    throw new Error(
      `That item data has an \`i\` list holding ${list.elementType} entries rather than compounds, so its ` +
        `slots cannot be read. Every slot of an inventory, filled or empty, is a TAG_Compound.`
    );
  }

  const items: NbtItem[] = [];
  for (let slot = 0; slot < list.value.length; slot++) {
    const entry = list.value[slot];
    // The element type says compound, and the reader enforces that, so this is
    // a type narrowing rather than a real branch.
    if (entry.type !== "compound") continue;
    const item = readItem(entry, slot);
    if (item !== null) items.push(item);
  }
  return items;
}

/**
 * Just the SkyBlock ids.
 *
 * The accessory reader needs nothing else: to answer "does this player own a
 * Bioanalysis Ring" it wants a set of ids and no more. Kept as its own export
 * so that consumer never has to know the projection has other fields, and so
 * the "drop the nulls" step happens once rather than at every call site.
 */
export function readItemIds(root: NbtCompound): string[] {
  const out: string[] = [];
  for (const item of readInventoryItems(root)) {
    if (item.id !== null) out.push(item.id);
  }
  return out;
}
