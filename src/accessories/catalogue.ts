import { isPlayerItem } from "../items/itemAvailability";
import type { CollectionUnlock, ItemIndex, ItemRequirement, RecipeIngredient } from "../items/useItemData";
import { readRequirement, type Requirement } from "./requirements";
import { norm } from "../items/wikiCrafting";
import { stripColourCodes } from "../nbt/items";

/**
 * The accessory catalogue: Hypixel's list of accessories, joined to what the
 * wiki crafting index already knows about each one.
 *
 * WHY THIS IS A JOIN AND NOT A NEW FETCH
 * --------------------------------------
 * Both halves are already on the page. `useRecipes` pulls Hypixel's item
 * resource and the wiki's crafting and collection modules, parses them once and
 * shares the result; re-fetching either here would mean a second copy of a few
 * hundred kilobytes and two answers to "is this craftable" that can drift apart
 * mid-session. So this module takes both as arguments and stays pure, which
 * also means every rule in it can be tested without a network.
 *
 * WHAT HYPIXEL ACTUALLY GIVES US, MEASURED
 * ----------------------------------------
 * Checked live against `/v2/resources/skyblock/items`: 5,549 items, of which
 * 411 carry `category: "ACCESSORY"`. The fields present on an accessory are
 * material, durability, skin, name, salvages, requirements, tier, category, id,
 * npc_sell_price, soulbound, has_uuid, stats, museum, description,
 * can_recombobulate, unstackable, components, dungeon_item, rift_transferrable,
 * gemstone_slots, can_auction, can_trade, glowing, origin, item_specific,
 * motes_sell_price and cannot_reforge.
 *
 * There is no `family`, no `upgrade` and no `tier_upgrade`. Hypixel does not
 * tell anybody that a Bioanalysis Ring is the Bioanalysis Talisman one rung up.
 * That relationship is the whole point of an accessory checklist, so it has to
 * be derived, and the next block is the record of how far that derivation is
 * allowed to go.
 */

/** An accessory, with everything we can honestly say about it. */
export interface AccessoryEntry {
  /** Hypixel id, e.g. "BIOANALYSIS_RING". The primary key everywhere here. */
  id: string;
  name: string;
  /** Rarity, for colouring. Null when Hypixel omitted it, which 38 accessories do. */
  tier: string | null;
  /** Family stem, e.g. "BIOANALYSIS". Null when it has no family we trust. */
  family: string | null;
  /** 1 talisman, 2 ring, 3 artifact, 4 relic. Null exactly when `family` is. */
  familyRank: number | null;
  /** Our slug key into `ItemIndex`, for `/items?q=` cross-links. Null when unmatched. */
  itemId: string | null;
  /** A grid recipe exists in the wiki crafting index. */
  craftable: boolean;
  /** Exact ingredients from the shared wiki recipe index, or null when it has none. */
  recipe: RecipeIngredient[] | null;
  /** Number produced by one recipe execution. */
  recipeYields: number;
  /** Collection tiers that grant this item or its recipe, or null when none do. */
  unlocks: CollectionUnlock[] | null;
  /**
   * Requirements Hypixel states for this accessory, already made renderable.
   *
   * Empty rather than null when there are none, because "no requirement" is a
   * complete answer here: the item resource states requirements for every item
   * that has one, so an absent array means unrestricted rather than unknown.
   */
  requirements: Requirement[];
  /** Hypixel's stat block, used only to work out which activity this belongs to. */
  stats: Record<string, unknown> | null;
  /**
   * True when Hypixel's item resource states `origin: "RIFT"`.
   *
   * This is the signal the Rift split stands on, and it was chosen by
   * measuring the alternatives rather than by taste. On the live resource
   * (2026-08-03): 29 accessories carry `origin: "RIFT"`, and the value agrees
   * with every other rift signal where those signals are right and disagrees
   * exactly where they are wrong. An all-`rift_` stat block looks like the
   * same claim and is not: Scarf's Studies, Thesis and Grimoire are Catacombs
   * Floor II dungeon loot whose modern effect happens to be Rift Time, and the
   * stat shape would have filed dungeon drops under the Rift. Likewise
   * `rift_transferrable` marks anything allowed through the dimension boundary
   * (the Hocus-Pocus Cipher is a Great Spook item), and the Future Calories
   * Talisman is crafted in the overworld from fishing materials despite its
   * rift_time stat. `origin` is Hypixel stating where the item comes from,
   * which is precisely the question the split asks.
   */
  rift: boolean;
  /**
   * True when Hypixel's resource marks the item `rift_transferrable`: it
   * works BOTH inside and outside the Rift. The display rule (a transferable
   * accessory belongs in both areas, inside the Rift and outside it) is
   * why this rides beside `rift` rather than replacing it: `rift` says where
   * the item comes from, this says where it works, and the display grouping
   * needs both to list a transferable in both areas. Measured live
   * (2026-08-03): 20 accessories carry the flag.
   */
  riftTransferable: boolean;
}

/*
 * A note on three fields that are deliberately NOT here.
 *
 * Hypixel's raw item resource carries `museum`, `soulbound` and `dungeon_item`,
 * and an earlier draft of this entry carried them too. They are gone because
 * this catalogue is built from the shared item index rather than from the raw
 * resource, and the index does not keep them. Carrying the fields anyway would
 * have meant writing `false` into all three for every accessory, which is not a
 * missing value, it is a wrong one: it would say "not a museum item" about 15
 * accessories that are. Nothing on the page consumes them, so the honest fix is
 * to not have them rather than to fabricate them.
 */

/**
 * The four rungs of the accessory ladder, in the order the game upgrades them.
 *
 * This is a naming convention, not a field, so it is only usable if the naming
 * actually holds. Measured against the live resource: 194 of the 411
 * accessories end in one of these four words, giving 98 stems, of which 51 have
 * more than one member and 47 are one-offs.
 */
const LADDER = ["TALISMAN", "RING", "ARTIFACT", "RELIC"] as const;

/** Suffix to rung. Exported because `owned.ts` collapses along the same ladder. */
export const familyRankOf = (suffix: string): number => LADDER.indexOf(suffix as (typeof LADDER)[number]) + 1;

/**
 * Hypixel's rarity order, used only to cross-check the ladder.
 *
 * An upgrade never makes an item rarer in the wrong direction, so a family
 * whose rarities run downhill as the suffix runs uphill is evidence that the
 * naming coincidence is not an upgrade chain at all. That is the only job this
 * map has: nothing here sorts or displays by rarity.
 *
 * A tier string that is not in this map counts as unknown rather than as
 * lowest. Treating an unrecognised rarity as rank 0 would manufacture a
 * contradiction out of a rarity Hypixel added after this was written, which is
 * the wrong way round: an unfamiliar value should make us less certain, not
 * more.
 */
const RARITY_ORDER: Record<string, number> = {
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
  MYTHIC: 6,
  DIVINE: 7,
  SPECIAL: 8,
  VERY_SPECIAL: 9,
  SUPREME: 10,
};

/**
 * How much we trust a stem to be a real upgrade chain.
 *
 *   verified    at least two members carry a rarity and those rarities never
 *               run downhill along the ladder. Safe to collapse ownership.
 *   unverified  fewer than two members carry a rarity, so there was nothing to
 *               check against. Still shown as a family, never collapsed.
 *   rejected    the rarities contradict the ladder. Not treated as a family at
 *               all; its members fall back to exact-id.
 */
export type FamilyCheck = "verified" | "unverified" | "rejected";

export interface AccessoryFamily {
  stem: string;
  /** Member ids, lowest rung first. */
  members: string[];
  check: FamilyCheck;
  /** True only for `verified`. `owned.ts` collapses nothing else. */
  collapsible: boolean;
}

export interface CatalogueStats {
  /** Accessories in the catalogue. */
  total: number;
  /** Accessories whose id ends in one of the four ladder words. */
  suffixed: number;
  /** Stems with more than one member that survived the cross-check. */
  familiesFormed: number;
  /** Accessories those families cover. */
  inFamilies: number;
  /** Multi-member stems left uncollapsed because too few members carry a rarity. */
  unverifiedFamilies: number;
  /** Multi-member stems thrown out because their rarities contradict the ladder. */
  rejectedFamilies: number;
  /** Suffixed accessories that are the only member of their stem. */
  singletonStems: number;
  /** Accessories we could not match to an entry in the wiki item index. */
  unmatched: number;
}

export interface AccessoryCatalogue {
  /** Every accessory, sorted by name so the UI does not have to. */
  entries: AccessoryEntry[];
  byId: Record<string, AccessoryEntry>;
  /** Stem to family, for every multi-member stem including rejected ones. */
  families: Record<string, AccessoryFamily>;
  stats: CatalogueStats;
}

/**
 * Rows Hypixel currently labels as accessories even though they are not part
 * of the player-facing accessory catalogue.
 *
 * This list is intentionally tiny and evidence-led. `OLD_BOOT` is a leather
 * boot carrying the ACCESSORY category by mistake,
 * `TEST_BUCKET_PLEASE_IGNORE` is an explicitly named test object, and the
 * admin entries have no player acquisition route. Compass Talisman and Eternal
 * Crystal are historical items; Luck Talisman was removed before release.
 * Keep real seasonal accessories: a closed event window is not removed content.
 */
export const ACCESSORY_EXCLUSIONS: ReadonlySet<string> = new Set([
  "OLD_BOOT",
  "TEST_BUCKET_PLEASE_IGNORE",
  "ARTIFACT_OF_SPACE",
  "GRIZZLY_PAW",
  "TALISMAN_OF_SPACE",
  "RING_OF_SPACE",
  "BINGO_HEIRLOOM",
  "COMPASS_TALISMAN",
  "ETERNAL_CRYSTAL",
  "LUCK_TALISMAN",
  "MASTER_SKULL_TIER_8",
  "MASTER_SKULL_TIER_9",
  "MASTER_SKULL_TIER_10",
]);

/** Whether an item belongs on the normal Accessories page. */
export const isNormalAccessory = (
  entry: Pick<AccessoryEntry, "rift" | "riftTransferable"> & {
    acquisition?: { category: string };
  }
): boolean => (!entry.rift || entry.riftTransferable) && entry.acquisition?.category !== "legacy";

/**
 * One entry of Hypixel's item resource, as far as this module cares.
 *
 * Deliberately a local type rather than the one in `wikiCrafting.ts`: that one
 * describes the three fields the crafting index needs, and widening it would
 * make a shared type grow to suit one caller. Everything here is optional
 * because Hypixel omits fields freely, including `tier` on 38 accessories.
 */
export interface HypixelAccessoryItem {
  id: string;
  unavailable?: boolean;
  name?: string;
  tier?: string;
  category?: string;
  requirements?: ItemRequirement[] | null;
  stats?: Record<string, unknown> | null;
  /** Hypixel's `origin` field. `"RIFT"` is the one value read; see `rift` above. */
  origin?: string | null;
  /** The index's read of Hypixel's `rift_transferrable`; see `riftTransferable` above. */
  riftTransferable?: boolean;
}

/**
 * Turn the shared item index into the accessory list this module consumes.
 *
 * The index is the right source rather than a second fetch of Hypixel's item
 * resource, because `useRecipes` already pulls that resource, parses it and
 * shares the result. It carries every accessory: `ACCESSORY` is one of the
 * categories `wikiCrafting.ts` admits without requiring a recipe, which was
 * added precisely so the 232 uncraftable accessories stop falling out.
 *
 * An index entry with no `hypixelId` is skipped. The id is the primary key for
 * everything downstream, including matching against what is in the player's
 * bag, so an entry without one cannot be checked off and would only ever show
 * as permanently missing.
 */
export const accessoriesFromIndex = (items: ItemIndex): HypixelAccessoryItem[] => {
  /*
   * ONE ENTRY PER HYPIXEL ID, AND THE DEDUPING IS NOT OPTIONAL.
   *
   * The index is keyed by wiki article name, and the wiki writes a rarity
   * variant as its own article: "Beastmaster Crest (Rare)" alongside
   * "Beastmaster Crest". When `buildItemIndex` cannot match a variant name it
   * strips the trailing parenthetical and resolves the base item instead, so
   * all six Beastmaster Crest articles inherit the SAME `hypixelId`.
   *
   * Left alone that put six tiles on the page for one accessory, inflated the
   * catalogue count past the number of accessories that exist, and would have
   * marked five of them missing forever, since the bag can only ever contain
   * the one id. It was visible on the built page, which is the only reason it
   * was caught.
   *
   * The base name wins over a parenthesised variant, and a shorter name wins
   * over a longer one, so the entry that survives is the one a player would
   * search for.
   */
  const best = new Map<string, { item: HypixelAccessoryItem; variant: boolean }>();

  for (const item of Object.values(items)) {
    if (item.category !== "ACCESSORY" || !item.hypixelId) continue;

    const variant = /\([^)]*\)\s*$/.test(item.name);
    const candidate = {
      item: {
        id: item.hypixelId,
        name: item.name,
        tier: item.tier ?? undefined,
        unavailable: item.unavailable === true,
        category: item.category,
        requirements: item.requirements ?? null,
        stats: item.stats ?? null,
        origin: item.origin ?? null,
        riftTransferable: item.riftTransferable === true,
      },
      variant,
    };

    // `name` is optional on the shared type even though this builder always
    // sets it, so the comparison defends itself rather than asserting.
    const lengthOf = (entry: HypixelAccessoryItem) => (entry.name ?? entry.id).length;

    const held = best.get(item.hypixelId);
    if (
      !held ||
      (held.variant && !variant) ||
      (held.variant === variant && lengthOf(candidate.item) < lengthOf(held.item))
    ) {
      best.set(item.hypixelId, candidate);
    }
  }

  return [...best.values()].map((v) => v.item);
};

/** Split an id into stem and rung, or null when it does not end in a ladder word. */
const splitLadder = (id: string): { stem: string; rank: number } | null => {
  for (const suffix of LADDER) {
    if (!id.endsWith(`_${suffix}`)) continue;
    const stem = id.slice(0, id.length - suffix.length - 1);
    // "_TALISMAN" on its own is a suffix with nothing in front of it, which is
    // not a stem. No live id looks like this; the guard is here so a future one
    // cannot produce a family keyed by the empty string.
    if (!stem) return null;
    return { stem, rank: familyRankOf(suffix) };
  }
  return null;
};

/**
 * Group suffixed accessories into families and decide which are trustworthy.
 *
 * Exported so the cross-check can be tested directly, including the case that
 * never fires against live data: a stem whose rarities run backwards. Measured
 * on the live resource there are 51 multi-member stems, 48 verified covering
 * 141 accessories, 3 unverified (HEALING, POTATO and DANTE, each of which has
 * two members and at most one rarity between them) and 0 rejected. Zero
 * rejections is the reassuring number, but the branch still has to exist and
 * still has to be tested, because it is the only thing standing between a
 * naming coincidence and an accessory being marked owned that the player does
 * not have.
 */
export const buildFamilies = (items: HypixelAccessoryItem[]): Record<string, AccessoryFamily> => {
  const grouped = new Map<string, { id: string; rank: number; tier: string | null }[]>();

  for (const item of items) {
    const split = splitLadder(item.id);
    if (!split) continue;
    const list = grouped.get(split.stem) ?? [];
    list.push({ id: item.id, rank: split.rank, tier: item.tier ?? null });
    grouped.set(split.stem, list);
  }

  const families: Record<string, AccessoryFamily> = {};

  for (const [stem, members] of grouped) {
    if (members.length < 2) continue;
    members.sort((a, b) => a.rank - b.rank);

    const ranked = members
      .filter((m) => m.tier !== null && m.tier in RARITY_ORDER)
      .map((m) => RARITY_ORDER[m.tier as string]);

    let check: FamilyCheck;
    if (ranked.length < 2) {
      check = "unverified";
    } else {
      // Non-decreasing, not strictly increasing: two rungs sharing a rarity is
      // ordinary and proves nothing either way.
      let downhill = false;
      for (let i = 1; i < ranked.length; i++) if (ranked[i] < ranked[i - 1]) downhill = true;
      check = downhill ? "rejected" : "verified";
    }

    families[stem] = {
      stem,
      members: members.map((m) => m.id),
      check,
      collapsible: check === "verified",
    };
  }

  return families;
};

/**
 * Build the catalogue.
 *
 * `hypixelItems` is the whole item resource, not a pre-filtered list, because
 * the ACCESSORY filter is part of the rule being tested and belongs in code
 * rather than at the call site. `items` is the shared wiki index.
 */
export const buildAccessoryCatalogue = (
  hypixelItems: HypixelAccessoryItem[],
  items: ItemIndex,
  adminNames?: ReadonlySet<string>,
): AccessoryCatalogue => {
  const accessories = hypixelItems.filter(
    (i) => i.category === "ACCESSORY" && i.id && !ACCESSORY_EXCLUSIONS.has(i.id)
      && i.tier !== "ADMIN" && i.tier !== "UNOBTAINABLE"
      && !i.unavailable
      && isPlayerItem(i.name ?? "", i.id, adminNames)
  );

  /**
   * Two ways into the wiki index, tried in that order.
   *
   * The Hypixel id is the strong join: it is exact, and it is what the island
   * feed and the sacks are keyed by. Name matching is the fallback for the
   * accessories the crafting module names but Hypixel's resource never matched
   * to an id, and it is normalised through `norm` so punctuation and case
   * cannot break an otherwise perfect match ("Anita's Talisman").
   */
  const byHypixelId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const [key, item] of Object.entries(items)) {
    if (item.hypixelId && !byHypixelId.has(item.hypixelId)) byHypixelId.set(item.hypixelId, key);
    const n = norm(item.name);
    if (n && !byName.has(n)) byName.set(n, key);
  }

  const families = buildFamilies(accessories);

  const entries: AccessoryEntry[] = [];
  let suffixed = 0;
  let singletonStems = 0;
  let unmatched = 0;

  const seenStems = new Set<string>();

  for (const raw of accessories) {
    /*
     * Hypixel ships a couple of names with a Minecraft colour code still in
     * them: `WEDDING_RING_0` is literally "§eShiny Yellow Rock". Left
     * alone that prefix does four kinds of damage at once, which is why it is
     * cleaned here at the boundary rather than papered over in the tile:
     *
     *   it renders     the tile reads "§eShiny Yellow Rock"
     *   it breaks the join   `norm` keeps the stray "e", so the name never
     *                        matches the wiki index entry
     *   it breaks the icon   the image URL is derived from the name
     *   it breaks the link   so is the article URL
     *
     * `stripColourCodes` is the NBT module's, not a second copy. The same codes
     * appear in item display names inside the bag, and one definition of what a
     * colour code is beats two that can drift.
     */
    const name = stripColourCodes(raw.name ?? raw.id).trim() || raw.id;
    const split = splitLadder(raw.id);
    if (split) {
      suffixed += 1;
      if (!families[split.stem] && !seenStems.has(split.stem)) {
        seenStems.add(split.stem);
        singletonStems += 1;
      }
    }

    const family = split ? families[split.stem] : undefined;
    // A rejected family is not a family. Its members carry no stem at all, so
    // nothing downstream can collapse them by accident: the only route into
    // `owned.ts`'s collapse is a stem, and these do not have one.
    const usable = family && family.check !== "rejected" ? family : null;

    const itemId = byHypixelId.get(raw.id) ?? byName.get(norm(name)) ?? null;
    if (itemId === null) unmatched += 1;
    const indexed = itemId !== null ? items[itemId] : undefined;

    entries.push({
      id: raw.id,
      name,
      tier: raw.tier ?? null,
      family: usable ? usable.stem : null,
      familyRank: usable && split ? split.rank : null,
      itemId,
      craftable: Boolean(indexed?.recipe && indexed.recipe.length > 0),
      recipe: indexed?.recipe ?? null,
      recipeYields: indexed?.yields ?? 1,
      unlocks: indexed?.unlocks && indexed.unlocks.length > 0 ? indexed.unlocks : null,
      // A requirement shape too broken to describe is dropped rather than
      // rendered as an empty chip; `readRequirement` answers null for those.
      requirements: (raw.requirements ?? [])
        .map((r) => readRequirement(r))
        .filter((r): r is Requirement => r !== null),
      stats: raw.stats ?? null,
      rift: raw.origin === "RIFT",
      riftTransferable: raw.riftTransferable === true,
    });
  }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const byId: Record<string, AccessoryEntry> = {};
  for (const e of entries) byId[e.id] = e;

  const formed = Object.values(families).filter((f) => f.collapsible);

  return {
    entries,
    byId,
    families,
    stats: {
      total: entries.length,
      suffixed,
      familiesFormed: formed.length,
      inFamilies: formed.reduce((n, f) => n + f.members.length, 0),
      unverifiedFamilies: Object.values(families).filter((f) => f.check === "unverified").length,
      rejectedFamilies: Object.values(families).filter((f) => f.check === "rejected").length,
      singletonStems,
      unmatched,
    },
  };
};
