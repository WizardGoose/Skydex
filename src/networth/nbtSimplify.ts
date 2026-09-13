import type { NbtCompound, NbtTag } from "../nbt";
import type { RawItem } from "./types";

/**
 * The tagged NBT tree, flattened into plain JavaScript.
 *
 * `src/nbt` keeps the type beside every value on purpose, so that a document
 * can be written back out byte for byte. The valuation does not need that and
 * cannot use it: forty handlers read forty differently-named fields out of
 * `ExtraAttributes`, and making each of them unwrap a tagged union would be
 * forty places to get the unwrapping subtly wrong.
 *
 * More importantly this is the shape prismarine-nbt's `simplify` produces, key
 * for key, which is what lets `tools/networth-parity.mjs` feed one set of item
 * objects to both the real SkyHelper library and this port. Diverging here
 * would make every parity number meaningless, so the mapping below is a
 * deliberate match rather than a convenience:
 *
 *   byte, short, int, float, double   number
 *   long                              number when it survives the conversion,
 *                                     else the digits as a string
 *   string                            string
 *   list                              array
 *   compound                          object
 *   byteArray                         Uint8Array (prismarine gives a Buffer,
 *                                     which is a Uint8Array, so consumers of
 *                                     both see the same thing)
 *   intArray, longArray               array of numbers
 *
 * Nothing in the valuation reads a long or an array of them. The long rule is
 * still spelled out rather than left to chance, because a timestamp silently
 * losing its low digits is the exact failure `src/nbt` chose bigint to avoid,
 * and quietly reintroducing it here would undo that.
 */

const simplifyTag = (tag: NbtTag): unknown => {
  switch (tag.type) {
    case "byte":
    case "short":
    case "int":
    case "float":
    case "double":
      return tag.value;
    case "long":
      return tag.value >= BigInt(Number.MIN_SAFE_INTEGER) && tag.value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(tag.value)
        : tag.value.toString();
    case "string":
      return tag.value;
    case "byteArray":
      return tag.value;
    case "intArray":
      return Array.from(tag.value);
    case "longArray":
      return Array.from(tag.value, (v) => Number(v));
    case "list":
      return tag.value.map(simplifyTag);
    case "compound":
      return simplifyCompound(tag);
  }
};

export const simplifyCompound = (compound: NbtCompound): Record<string, unknown> => {
  // A null-prototype object, because compound keys are remote data and one of
  // them could be `__proto__`. The Map in `src/nbt` exists for that reason and
  // throwing the protection away on the way out would be pointless.
  const out: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of compound.value) out[key] = simplifyTag(value);
  return out;
};

/**
 * A container document's items, in the shape the valuation takes.
 *
 * Empty slots are dropped rather than kept as empty objects. The aggregator
 * skips them anyway; dropping them here means one definition of "a slot with
 * nothing in it" rather than two.
 *
 * A root with no `i` list yields an empty array rather than throwing, which is
 * the opposite of `readInventoryItems`. That difference is deliberate and the
 * reason is the caller: this one is handed roughly twenty fields at once, some
 * of which are legitimately absent on any given profile, and one missing
 * wardrobe slot must not cost the player their whole networth. The place that
 * needs a structural failure to be loud is the item browser, which keeps using
 * `readInventoryItems`.
 */
export const simplifyItems = (root: NbtCompound): RawItem[] => {
  return simplifyItemSlots(root).filter((item): item is RawItem => item !== null);
};

/**
 * A container document's real slot sequence, including empty compounds.
 *
 * Valuation wants a packed list and uses `simplifyItems` above. Profile
 * inventory views answer a different question: where each stack sits and how
 * much room the container exposes. Keeping that projection separate prevents
 * visual layout metadata from leaking into net-worth categories.
 */
export const simplifyItemSlots = (root: NbtCompound): (RawItem | null)[] => {
  const list = root.value.get("i");
  if (!list || list.type !== "list") return [];

  const out: (RawItem | null)[] = [];
  for (const entry of list.value) {
    if (entry.type !== "compound" || entry.value.size === 0) {
      out.push(null);
      continue;
    }
    out.push(simplifyCompound(entry) as RawItem);
  }
  return out;
};
