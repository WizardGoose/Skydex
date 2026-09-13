import type { AccessoryCatalogue } from "./catalogue";
import type { ChainIndex } from "./chains";

/**
 * Magical Power, computed the way the game computes it.
 *
 * THE BASE RULE, FROM THE WIKI'S OWN SENTENCE
 * -------------------------------------------
 * The Accessory Power article (formerly titled Magical Power): "Each Accessory
 * the player has in their Accessory Bag gives an amount of MP based on its
 * Rarity." Within an upgrade line only the highest rung held pays out, and a
 * duplicate never counts twice. The per-rarity values are game data, stated in
 * that article's table and stable:
 *
 *   common 3, uncommon 5, rare 8, epic 12, legendary 16, mythic 22,
 *   special 3, very special 5
 *
 * (The table also lists divine 28 and ultimate 1 "for completeness"; the same
 * article states no such accessory is obtainable, and none is in the
 * catalogue, so an id claiming one lands in `unknownTier` rather than being
 * priced off a tier the game does not hand out.)
 *
 * EVERY MODIFIER THE GAME APPLIES, EACH DETECTED FROM THE PROFILE
 * ---------------------------------------------------------------
 * The article's trivia section enumerates the exceptions in one sentence:
 * "The only Accessories that give more MP than normal are the Hegemony
 * Artifact, which gives double MP, the Rift Prism which grants 11 MP when
 * imbued at Erihann, and the Abicases, which grant 1 MP for every 2 contacts
 * the player has." That sentence, plus the Recombobulator rule below, is the
 * complete modifier list, and each one is detected from the player's own
 * data rather than typed in:
 *
 *   recombs    the Accessories article: a Recombobulator 3000 "permanently
 *              increase[s] the rarity of an Accessory by +1" and doing so
 *              "will increase the MP it grants". The bag NBT states the fact
 *              per stack (`rarity_upgrades`), read in `owned.ts`. The bump
 *              follows the recomb ladder common -> uncommon -> rare -> epic
 *              -> legendary -> mythic and stops: nothing above mythic bumps,
 *              and SPECIAL / VERY SPECIAL sit outside the ladder entirely.
 *   Hegemony   doubled, AFTER the recomb bump. Its own article works the
 *              order out with numbers: legendary 16 counts as 32, and "when
 *              recombobulated to Mythic, it grants 44 Accessory Power
 *              instead of 22". Detected by its id in the active set.
 *   Rift Prism a consumed prism is a flat, permanent 11. Detected from
 *              `member.rift.access.consumed_prism` (read in `owned.ts`; the
 *              same field SkyCrypt keys the bonus on). A prism still sitting
 *              in the bag also counts 11 rather than its listed rare 8,
 *              which is the figure the wiki states for it and the value the
 *              reference tools display on the item; the two cannot double
 *              count because consuming it removes it from the bag.
 *   Abicase    its rarity MP plus 1 per 2 Abiphone contacts, floored, with
 *              the contact count read from
 *              `member.nether_island_player_data.abiphone.active_contacts`.
 *              When the profile does not state contacts the Abicase is
 *              SKIPPED and counted in `skipped`, because pricing it at bare
 *              rarity would understate a number we know is higher: never a
 *              guess, and the page's note says exactly what was left out.
 *
 * One situational rule is knowingly NOT modelled: dungeon accessories pay
 * double "while inside Dungeons" (the article's Notes section). The figure
 * this page shows is overworld MP, which is also what the in-game bag screen
 * shows, so that doubling is out of scope rather than missing.
 *
 * WHAT AN EARLIER VERSION SKIPPED, AND WHY IT NO LONGER DOES
 * ----------------------------------------------------------
 * This module used to leave out any active accessory whose whole stat block
 * was `rift_` stats, reasoning that a rift accessory pays out nothing outside
 * the Rift. Measured against the live item resource, that stat shape is not
 * the claim it looks like: Scarf's Studies, Thesis and Grimoire are Catacombs
 * dungeon loot whose modern effect happens to be Rift Time, they sit in
 * overworld accessory bags, and the game pays MP for them like anything else.
 * The wiki's mechanic sentence has no rift exception for bag contents, and
 * neither reference implementation (SkyCrypt, SkyHanni) carves one out. So
 * the skip is gone: whatever is in the bag counts. True Rift-only accessories
 * live in the Rift's own inventory, never in `talisman_bag`, so they stay out
 * of this sum by not being in it, which is the game's own arithmetic.
 *
 * The reference implementations were read as a checklist of WHICH rules
 * exist; every rule above is encoded from the wiki's statement of it, not
 * from their code.
 */

export const MP_BY_RARITY: Record<string, number> = {
  COMMON: 3,
  UNCOMMON: 5,
  RARE: 8,
  EPIC: 12,
  LEGENDARY: 16,
  MYTHIC: 22,
  SPECIAL: 3,
  VERY_SPECIAL: 5,
};

/**
 * The recomb ladder, one rung up per tier. MYTHIC has no entry because
 * nothing above mythic bumps here, and SPECIAL / VERY_SPECIAL have none
 * because they are not on the game's recomb ladder at all.
 */
const RECOMB_BUMP: Record<string, string> = {
  COMMON: "UNCOMMON",
  UNCOMMON: "RARE",
  RARE: "EPIC",
  EPIC: "LEGENDARY",
  LEGENDARY: "MYTHIC",
};

/** The wiki's stated figure for an imbued (or held) Rift Prism. */
const RIFT_PRISM_MP = 11;

/**
 * Everything the profile said that changes the sum, beyond the bag ids.
 * Assembled by the store from the same profile pull that read the bag; every
 * field is detected, none is typed in.
 */
export interface MagicalPowerInputs {
  /** Bag ids whose stack carries `rarity_upgrades`. */
  recombobulated: ReadonlySet<string>;
  /** `member.rift.access.consumed_prism`, or false when the profile lacks it. */
  consumedPrism: boolean;
  /** Abiphone contacts, or null when the profile does not state them. */
  abiphoneContacts: number | null;
  /**
   * id -> the rarity the bag item ITSELF states in its lore, recomb already
   * inside it. Preferred over the catalogue tier wherever present, because
   * the item in hand outranks a resource that omits `tier` on eleven
   * accessories in one sampled bag. See `OwnedBag.tiers` in `owned.ts`.
   */
  bagTiers: ReadonlyMap<string, string>;
  /**
   * Bag ids the catalogue has never heard of, deduplicated. The game still
   * pays for them (a real bag proves it: `BEASTMASTER_CREST_EPIC` is a
   * variant id the wiki-joined catalogue collapses away, and a seasonal
   * balloon hat is missing from the join entirely), so they are counted at
   * their bag-stated rarity. No chain data exists for them, which is the
   * honest position: each stands alone.
   */
  uncatalogued: ReadonlySet<string>;
}

export const NO_MP_INPUTS: MagicalPowerInputs = {
  recombobulated: new Set<string>(),
  consumedPrism: false,
  abiphoneContacts: null,
  bagTiers: new Map<string, string>(),
  uncatalogued: new Set<string>(),
};

export interface MagicalPowerFigure {
  /** MP over the active accessories with every detected modifier applied. */
  total: number;
  /** Active accessories that contributed to the total. */
  counted: number;
  /** Active accessories left out because a needed input was missing (an Abicase with unknown contacts). */
  skipped: number;
  /** Active accessories whose rarity Hypixel omitted, contributing nothing. */
  unknownTier: number;
  /** Active accessories whose recomb actually raised their tier here. */
  recombobulated: number;
  /** MP added by those raises, already inside `total`. */
  recombBonus: number;
  /** The extra copy of the Hegemony Artifact's MP, already inside `total`. */
  hegemonyBonus: number;
  /** The consumed Rift Prism's 11, already inside `total`. 0 when not consumed. */
  riftPrism: number;
  /** The Abicase's contact bonus, already inside `total`. 0 when no Abicase counted. */
  abicaseBonus: number;
  /** Bag ids priced despite being absent from the catalogue, inside `counted`. */
  uncatalogued: number;
  /** Base MP grouped by the effective rarity that paid it; special bonuses remain separate. */
  breakdown: MagicalPowerBreakdownRow[];
}

export interface MagicalPowerBreakdownRow {
  tier: string;
  count: number;
  mpEach: number;
  subtotal: number;
}

/**
 * The active set: held ids with nothing held above them in their own chain.
 *
 * `held` is already a set, so a duplicate stack in the bag cannot count twice,
 * and `chains` is transitive, so holding the top and the bottom of a three rung
 * line leaves exactly the top active. With no chain data every held accessory
 * is treated as active, which is the honest fallback: we cannot see the lines,
 * so we do not collapse them.
 */
export function activeAccessories(held: ReadonlySet<string>, chains: ChainIndex): Set<string> {
  const active = new Set<string>(held);
  for (const id of held) {
    for (const beneath of chains[id] ?? []) {
      if (beneath !== id) active.delete(beneath);
    }
  }
  return active;
}

export function computeMagicalPower(
  held: ReadonlySet<string>,
  catalogue: AccessoryCatalogue,
  chains: ChainIndex,
  inputs: MagicalPowerInputs = NO_MP_INPUTS
): MagicalPowerFigure {
  const figure: MagicalPowerFigure = {
    total: 0,
    counted: 0,
    skipped: 0,
    unknownTier: 0,
    recombobulated: 0,
    recombBonus: 0,
    hegemonyBonus: 0,
    riftPrism: 0,
    abicaseBonus: 0,
    uncatalogued: 0,
    breakdown: [],
  };
  const breakdownCounts = new Map<string, number>();

  /*
   * The uncatalogued ids ride along after the chain collapse: no chain data
   * exists for them, so each is its own line, exactly as `activeAccessories`
   * treats everything when it has no chains.
   */
  const active = activeAccessories(held, chains);
  for (const id of inputs.uncatalogued) active.add(id);

  for (const id of active) {
    const entry = catalogue.byId[id];
    const uncatalogued = entry === undefined;
    if (uncatalogued && !inputs.uncatalogued.has(id)) continue;

    // A prism in the bag is the wiki's flat 11, not its listed rare 8.
    if (id === "RIFT_PRISM") {
      figure.total += RIFT_PRISM_MP;
      figure.riftPrism = RIFT_PRISM_MP;
      figure.counted += 1;
      continue;
    }

    // An Abicase without a known contact count cannot be priced honestly:
    // its real value is rarity plus a bonus we cannot see, so a bare-rarity
    // figure would be a knowingly-low number dressed as the answer.
    const isAbicase = id.startsWith("ABICASE");
    if (isAbicase && inputs.abiphoneContacts === null) {
      figure.skipped += 1;
      continue;
    }

    /*
     * The tier, from the strongest evidence available:
     *
     *   1. what the bag item itself states in its lore. Recomb already
     *      inside it, and it exists for old accessories whose resource entry
     *      omits `tier` (eleven in one sampled bag) and for ids the
     *      catalogue lacks outright.
     *   2. the catalogue tier, bumped one rung when the stack carries
     *      `rarity_upgrades`.
     *
     * The recomb delta is reported against the catalogue's base tier
     * whichever source won, so the acceptance check can state what the
     * recombs are worth as one number.
     */
    const baseTier = entry?.tier ? entry.tier.toUpperCase() : null;
    const baseValue = baseTier !== null ? MP_BY_RARITY[baseTier] : undefined;

    const statedTier = inputs.bagTiers.get(id);
    const statedValue = statedTier !== undefined ? MP_BY_RARITY[statedTier] : undefined;

    let value: number;
    let effectiveTier: string;
    if (statedValue !== undefined) {
      value = statedValue;
      effectiveTier = statedTier as string;
    } else if (baseTier !== null && baseValue !== undefined) {
      const raised = inputs.recombobulated.has(id) ? RECOMB_BUMP[baseTier] : undefined;
      value = raised !== undefined ? MP_BY_RARITY[raised] : baseValue;
      effectiveTier = raised ?? baseTier;
    } else {
      // Neither the item nor the resource states a rarity. Nothing honest to
      // price it at, so it contributes nothing and is counted saying so.
      figure.unknownTier += 1;
      continue;
    }

    breakdownCounts.set(effectiveTier, (breakdownCounts.get(effectiveTier) ?? 0) + 1);

    if (inputs.recombobulated.has(id) && baseValue !== undefined && value > baseValue) {
      figure.recombobulated += 1;
      figure.recombBonus += value - baseValue;
    }

    // Hegemony doubles AFTER the bump: recombed to mythic it grants 44, which
    // is the wiki's own worked example.
    if (id === "HEGEMONY_ARTIFACT") {
      figure.hegemonyBonus += value;
      value *= 2;
    }

    if (isAbicase && inputs.abiphoneContacts !== null) {
      const bonus = Math.floor(inputs.abiphoneContacts / 2);
      figure.abicaseBonus += bonus;
      value += bonus;
    }

    if (uncatalogued) figure.uncatalogued += 1;
    figure.total += value;
    figure.counted += 1;
  }

  // The consumed prism is not in the bag (consuming it is how it stops being
  // an item), so its permanent 11 rides on the profile flag alone.
  if (inputs.consumedPrism && figure.riftPrism === 0) {
    figure.riftPrism = RIFT_PRISM_MP;
    figure.total += RIFT_PRISM_MP;
  }

  figure.breakdown = Object.keys(MP_BY_RARITY).flatMap((tier) => {
    const count = breakdownCounts.get(tier) ?? 0;
    return count === 0 ? [] : [{ tier, count, mpEach: MP_BY_RARITY[tier], subtotal: MP_BY_RARITY[tier] * count }];
  });

  return figure;
}
