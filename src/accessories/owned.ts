import { readNbtBlob } from "../nbt/blob";
import { readInventoryItems, stripColourCodes, type NbtItem } from "../nbt/items";
import type { AccessoryCatalogue } from "./catalogue";
import { EMPTY_CHAINS, type ChainIndex } from "./chains";

/**
 * What the player already has, read out of the accessory bag.
 *
 * WHAT THIS COVERS, EXACTLY
 * -------------------------
 * The accessory bag and nothing else. That is `talisman_bag`, whose confirmed
 * shape on a live profile is
 *
 *   member.inventory.bag_contents.talisman_bag = { type: 0, data: "<base64>" }
 *
 * where `data` is base64 of gzipped NBT. Measured on a real profile it
 * is 123,720 base64 characters decoding to 92,788 bytes, so a bag of that size
 * is the ordinary case rather than a stress test.
 *
 * `accessory_bag_storage` is deliberately NOT read, and that is worth writing
 * down because the name makes it sound like a second bag. It is not: it holds
 * `bag_upgrades_purchased`, `highest_magical_power`, `selected_power`,
 * `unlocked_powers` and the per-slot `tuning` allocations. There is not a
 * single item inside it, so decoding it would produce nothing and claiming it
 * as a source of owned items would be a false coverage claim.
 *
 * Accessories worn outside the bag are also not covered. In practice the game
 * pushes accessories into the bag and the bag is what magical power is computed
 * from, so this is a small gap, but it is a real one and the page says so
 * rather than implying the catalogue split is exhaustive.
 *
 * THE DISTINCTION EVERYTHING ELSE HANGS ON
 * ----------------------------------------
 * `null` means the bag could not be read: no key, a profile Hypixel will not
 * share, a member with no bag, or a blob that would not decode. An empty array
 * means the bag was read and is empty. Those are different claims and this
 * module never collapses one into the other, because the page above it renders
 * a completely different thing for each: an unreadable bag shows the catalogue
 * ungrouped with no ownership claim at all, while an empty one honestly says
 * every accessory is missing.
 */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Find the bag blob on a member, wherever this version of the API put it.
 *
 * Hypixel has moved bag contents under `inventory.bag_contents`, and older
 * payloads carry them flat on the member. Both are checked and the nested one
 * wins, which is the same treatment `readSacks` in `src/island/hypixel.ts`
 * gives `sacks_counts` for the same reason: a field that has moved once may
 * have moved for only some accounts.
 *
 * Returns the base64 string, or null when there is nothing to read. A present
 * but empty string counts as nothing.
 */
export function findTalismanBag(member: unknown): string | null {
  if (!isObject(member)) return null;

  const read = (holder: unknown): string | null => {
    if (!isObject(holder)) return null;
    const bag = holder.talisman_bag;
    if (!isObject(bag)) return null;
    const data = bag.data;
    return typeof data === "string" && data.trim() !== "" ? data : null;
  };

  const inventory = isObject(member.inventory) ? member.inventory : null;
  const nested = inventory && isObject(inventory.bag_contents) ? read(inventory.bag_contents) : null;

  return nested ?? read(member);
}

/**
 * What one read of the bag yields: the ids, plus which of them are
 * recombobulated.
 *
 * The recomb flag rides along because Magical Power follows the RAISED rarity:
 * a Recombobulator 3000 permanently lifts an accessory one tier and the wiki's
 * Accessories article states outright that doing so "will increase the MP it
 * grants". The flag is `ExtraAttributes.rarity_upgrades` on the very stacks
 * this module already decodes, so reading it here costs nothing, and reading
 * it anywhere else would mean decoding a 90KB gzip blob a second time.
 */
export interface OwnedBag {
  /** Every SkyBlock id seen in the bag, in slot order, duplicates included. */
  ids: string[];
  /**
   * Ids of which at least one stack in the bag carries `rarity_upgrades` of 1
   * or more. Keyed by id rather than by stack because everything downstream
   * (chains, MP, coverage) is keyed by id, and a duplicate where only one copy
   * is recombed still means the player owns a recombed one, which is the copy
   * the game treats as active.
   */
  recombobulated: Set<string>;
  /**
   * id -> the rarity the item ITSELF states, read off its lore's rarity line
   * ("EPIC ACCESSORY"), in the item resource's spelling (`VERY_SPECIAL`).
   *
   * This exists because the resource omits `tier` on a handful of old
   * accessories (a sampled live bag held eleven of them: Runebook, King
   * Talisman, Night Vision Charm and their generation) and omits a few
   * variant ids outright, while the player's actual item always says what it
   * is. It is also the recomb-inclusive truth: a recombed item's lore states
   * the RAISED rarity, so a value here already has the bump inside it. Where
   * duplicates disagree the higher rarity wins, same reasoning as the recomb
   * set above.
   */
  tiers: Map<string, string>;
  /** The one unambiguous enrichment observed for an id. */
  enrichments: Map<string, string>;
  /** Duplicate ids that carried conflicting enrichments, deliberately omitted from the aggregate. */
  ambiguousEnrichments: Set<string>;
}

/**
 * The rarity words as lore states them, most specific first so "VERY SPECIAL"
 * cannot be read as "SPECIAL". The line also names the category ("ACCESSORY",
 * "DUNGEON ACCESSORY", "HATCESSORY"), which the pattern requires so a rarity
 * word inside descriptive prose ("a RARE drop from...") cannot be mistaken
 * for the rarity line. A recombed line is wrapped in obfuscated glyphs, which
 * survive colour stripping as stray characters, so nothing is anchored.
 */
const LORE_RARITY =
  /\b(VERY SPECIAL|SPECIAL|DIVINE|MYTHIC|LEGENDARY|EPIC|UNCOMMON|RARE|COMMON|ULTIMATE)\s+(?:DUNGEON\s+)?(?:ACCESSORY|HATC+ESSORY)\b/;

/** Ranks only for choosing between duplicate stacks; the values live in `magicalPower.ts`. */
const LORE_RARITY_RANK: Record<string, number> = {
  COMMON: 1, UNCOMMON: 2, RARE: 3, EPIC: 4, LEGENDARY: 5, MYTHIC: 6, DIVINE: 7,
  SPECIAL: 8, VERY_SPECIAL: 9, ULTIMATE: 10,
};

/** The stated rarity of one stack, from the last lore line that states one. */
export function tierFromLore(lore: readonly string[] | null): string | null {
  if (lore === null) return null;
  for (let i = lore.length - 1; i >= 0; i--) {
    const match = lore[i].match(LORE_RARITY);
    if (match) return match[1].replace(/ /g, "_");
  }
  return null;
}

/** The pure half: bag items in, ids, recomb flags and stated tiers out. */
export function bagFromItems(items: readonly NbtItem[]): OwnedBag {
  const ids: string[] = [];
  const recombobulated = new Set<string>();
  const tiers = new Map<string, string>();
  const enrichmentValues = new Map<string, Set<string>>();
  for (const item of items) {
    if (item.id === null) continue;
    ids.push(item.id);
    if (item.rarityUpgrades !== null && item.rarityUpgrades > 0) recombobulated.add(item.id);

    const enrichment = item.enrichment?.trim().toLowerCase();
    if (enrichment) {
      const values = enrichmentValues.get(item.id) ?? new Set<string>();
      values.add(enrichment);
      enrichmentValues.set(item.id, values);
    }

    const tier = tierFromLore(item.lore);
    if (tier !== null) {
      const held = tiers.get(item.id);
      if (held === undefined || (LORE_RARITY_RANK[tier] ?? 0) > (LORE_RARITY_RANK[held] ?? 0)) {
        tiers.set(item.id, tier);
      }
    }
  }
  const enrichments = new Map<string, string>();
  const ambiguousEnrichments = new Set<string>();
  for (const [id, values] of enrichmentValues) {
    if (values.size === 1) enrichments.set(id, [...values][0]);
    else ambiguousEnrichments.add(id);
  }
  return { ids, recombobulated, tiers, enrichments, ambiguousEnrichments };
}

/**
 * Recover the same ownership facts from the shared parsed-profile snapshot.
 *
 * `parseMemberItemsWithLayouts` has already decoded `talisman_bag` into the
 * prismarine-style objects used by networth and the Inventory tab. Re-reading
 * the profile just to decode the same blob again is both wasteful and, when a
 * refresh is temporarily unavailable, exactly how the Accessories page can
 * lose a perfectly good last-known bag while the rest of Profile stays live.
 *
 * An empty input is a known empty bag. Callers decide whether the source was
 * actually shared before invoking this function, so it never turns an absent
 * Inventory API field into an ownership claim.
 */
export function bagFromParsedItems(items: readonly unknown[]): OwnedBag {
  const projected: NbtItem[] = [];

  for (let slot = 0; slot < items.length; slot += 1) {
    const raw = items[slot];
    if (!isObject(raw)) continue;
    const tag = isObject(raw.tag) ? raw.tag : null;
    const extra = tag && isObject(tag.ExtraAttributes) ? tag.ExtraAttributes : null;
    const display = tag && isObject(tag.display) ? tag.display : null;
    const lore = Array.isArray(display?.Lore)
      ? display.Lore.filter((line): line is string => typeof line === "string").map(stripColourCodes)
      : null;
    const rarityUpgrades = extra && typeof extra.rarity_upgrades === "number" && Number.isFinite(extra.rarity_upgrades)
      ? extra.rarity_upgrades
      : null;

    projected.push({
      slot,
      id: extra && typeof extra.id === "string" ? extra.id : null,
      count: 1,
      name: null,
      lore,
      enchantments: null,
      reforge: null,
      rarityUpgrades,
      enrichment: extra && typeof extra.talisman_enrichment === "string" ? extra.talisman_enrichment : null,
      uuid: null,
    });
  }

  return bagFromItems(projected);
}

/**
 * Decode the bag into the ids it holds and their recomb flags.
 *
 * Every failure answers `null` rather than throwing. A page that renders a
 * catalogue is not improved by a stack trace: not having the bag is an ordinary
 * state that most visitors are in, and the caller already has to handle it for
 * the no-key case, so there is exactly one unreadable path instead of two.
 */
export async function readOwnedFromMember(member: unknown, signal?: AbortSignal): Promise<OwnedBag | null> {
  const base64 = findTalismanBag(member);
  if (base64 === null) return null;

  try {
    const doc = await readNbtBlob(base64, signal);
    return bagFromItems(readInventoryItems(doc.value));
  } catch {
    // A blob we cannot decode is indistinguishable, from here, from a blob we
    // were never given. Both mean we do not know what is in the bag.
    return null;
  }
}

/** What ownership looks like once families are taken into account. */
export interface OwnedSets {
  /** Ids actually seen in the bag. */
  held: Set<string>;
  /**
   * Ids the player is not missing: everything held, plus the lower rungs of any
   * family they hold a higher rung of.
   */
  covered: Set<string>;
}

/**
 * Fold family upgrades into ownership.
 *
 * Owning the Bioanalysis Artifact means you are not missing the Bioanalysis
 * Talisman: the game consumed the talisman to make the artifact, so listing it
 * as missing would send somebody off to re-craft a thing they already used. The
 * catalogue works out which stems are real upgrade chains and marks those
 * `collapsible`; nothing else is collapsed here.
 *
 * The restraint matters more than the collapse. A family is only collapsible
 * when at least two of its members carry a rarity and those rarities never run
 * downhill along the ladder, so a pair of unrelated items that happen to share
 * a stem cannot quietly mark each other owned. Marking something owned that the
 * player does not have is the one error this page cannot afford, because it
 * removes the item from the list entirely and there is nothing left on screen
 * to argue with.
 */
export function collapseOwned(
  ownedIds: readonly string[],
  catalogue: AccessoryCatalogue,
  chains: ChainIndex = EMPTY_CHAINS
): OwnedSets {
  const held = new Set<string>();
  for (const id of ownedIds) if (catalogue.byId[id]) held.add(id);

  const covered = new Set<string>(held);

  /*
   * The wiki's upgrade graph is the authority and is walked first.
   *
   * `chains[id]` is already transitive, so owning the top of a three rung chain
   * covers both rungs under it in one step. This is what fixes the reported
   * bug: Seal of the Family covers Crooked Artifact and Shady Ring even though
   * no two of those three ids share a stem.
   */
  for (const id of held) {
    for (const beneath of chains[id] ?? []) {
      if (catalogue.byId[beneath]) covered.add(beneath);
    }
  }

  /*
   * The id-stem ladder still runs, for chains the wiki has not documented.
   *
   * It is a supplement rather than the rule now, and it keeps its own guard:
   * only families the catalogue verified against rarity are collapsed, so a
   * pair of unrelated items that happen to share a stem cannot mark each other
   * owned. Marking something owned that the player does not have is the one
   * error this page cannot afford, because it removes the item from the list
   * entirely and leaves nothing on screen to argue with.
   */
  for (const family of Object.values(catalogue.families)) {
    if (!family.collapsible) continue;

    let highest = -1;
    for (let i = 0; i < family.members.length; i++) {
      if (held.has(family.members[i])) highest = i;
    }
    if (highest < 0) continue;

    for (let i = 0; i < highest; i++) covered.add(family.members[i]);
  }

  return { held, covered };
}

/* -------------------------------------------------------------------------- */
/* Profile fields the Magical Power model needs                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether this member has consumed a Rift Prism, which grants a permanent
 * 11 MP (the Accessory Power article: "the Rift Prism which grants 11 MP when
 * imbued at Erihann"). The field is `member.rift.access.consumed_prism`, the
 * same one SkyCrypt keys its bonus on. The PATH was verified against a
 * live profile whose `member.rift.access` exists and carries
 * `last_free` and `charge_track_timestamp`, and no `consumed_prism`, which is
 * the shape of an account entering the Rift on charges rather than a prism.
 *
 * Absent is therefore `false`, not unknown, and that is a real distinction
 * worth a sentence: consuming a prism is what creates the field, so a member
 * without it has not consumed one. There is no state this misreads.
 */
export function readConsumedPrism(member: unknown): boolean {
  if (!isObject(member)) return false;
  const rift = isObject(member.rift) ? member.rift : null;
  const access = rift && isObject(rift.access) ? rift.access : null;
  return access?.consumed_prism === true;
}

/**
 * How many Abiphone contacts this member has, or null when the profile does
 * not say. The Abicase's MP scales at 1 per 2 contacts (same article
 * sentence), and the count lives at
 * `member.nether_island_player_data.abiphone.active_contacts`, an array of
 * contact names; its length is the number every tool displays.
 *
 * Null here is genuinely unknown, unlike the prism above: a member with no
 * `nether_island_player_data` may simply never have opened the Crimson Isle
 * on this profile, and an Abicase bought off the Auction House would still
 * carry MP we cannot price. The caller keeps the Abicase out of the sum in
 * that case rather than pricing it low.
 */
export function readAbiphoneContacts(member: unknown): number | null {
  if (!isObject(member)) return null;
  const nether = isObject(member.nether_island_player_data) ? member.nether_island_player_data : null;
  const abiphone = nether && isObject(nether.abiphone) ? nether.abiphone : null;
  const contacts = abiphone?.active_contacts;
  return Array.isArray(contacts) ? contacts.length : null;
}

/* -------------------------------------------------------------------------- */
/* Bioanalysis                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The Bioanalysis chain, verified against Hypixel's own item resource.
 *
 * Three accessories, no relic. The ranks are the ones `GreenhouseStats` in
 * `src/island/profileStats.ts` already defines, so the mapping is written here
 * rather than re-invented there.
 */
const BIOANALYSIS: Record<string, number> = {
  BIOANALYSIS_TALISMAN: 1,
  BIOANALYSIS_RING: 2,
  BIOANALYSIS_ARTIFACT: 3,
};

/**
 * Best Bioanalysis accessory held, as a rank: 0 none, 1 talisman, 2 ring,
 * 3 artifact.
 *
 * THIS IS THE ONLY SOURCE THERE IS
 * --------------------------------
 * A full dump of a live profile confirms there is no Bioanalysis field on the
 * API at all: no research level, no donation counter, nothing. The two nearby
 * fields, `garden_player_data.analyzed_greenhouse_crops` and
 * `discovered_greenhouse_crops`, are crop-name lists about a different mechanic
 * with a similar name and say nothing about the accessory. So decoding the bag
 * is not the convenient route to this number, it is the only route, and there
 * is no second field to check the answer against.
 *
 * That absence of a cross-check is exactly why the null case is strict. `null`
 * in means `null` out: a bag we could not read tells us nothing about what the
 * player owns, and answering 0 would state, with no evidence and nothing to
 * contradict it, that they own none of the three.
 */
export function bioanalysisRank(ownedIds: readonly string[] | null): number | null {
  if (ownedIds === null) return null;

  let best = 0;
  for (const id of ownedIds) {
    const rank = BIOANALYSIS[id];
    if (rank !== undefined && rank > best) best = rank;
  }
  return best;
}
