import { describe, expect, it } from "vitest";
import { nbt, writeNbtBlob } from "../../nbt";
import { parseMemberItems, parseMemberItemsWithLayouts, readCoinBalances, API_CATEGORIES } from "../parseItems";
import blobFixture from "./fixtures/blobs.json";

/**
 * Category assembly: which container's items land in which category.
 *
 * This is a different failure surface from valuation and the valuation tests
 * cannot see it. An item counted in the wrong category, or twice, or dropped,
 * moves the total with every handler behaving perfectly. The bug that prompted
 * these tests was exactly that shape: `member.loadout.equipment` holds saved
 * equipment loadouts, and whether those count, and where, is an assembly rule
 * with no valuation component at all.
 *
 * `tools/networth-parity.mjs` proves these rules against the real SkyHelper
 * library on a full member. These pin the same rules in the fast suite, so a
 * regression shows up in `pnpm test` rather than only in the parity gate.
 *
 * The container blobs are verbatim auction `item_bytes`, each holding exactly
 * one item, which is what makes every expected count below exact.
 */

const BLOBS = blobFixture.blobs as { base64: string }[];

/** A profile field as Hypixel shapes it: a type tag and a base64 blob. */
const slot = (index: number) => ({ type: 0, data: BLOBS[index % BLOBS.length].base64 });

/**
 * A toolkit blob, which is NOT a container: the root compound IS the item's
 * ExtraAttributes, with no `i` list and no display name. Written with this
 * project's own writer, which the NBT suite already proves is a true inverse of
 * its reader. The cross-decoder version of this check lives in the parity gate,
 * where prismarine-nbt writes the bytes instead.
 */
const toolkitSlot = async (id: string) => ({
  type: 0,
  data: await writeNbtBlob("", nbt.compound({ id: nbt.string(id) })),
});

const positionalContainer = async () => ({
  type: 0,
  data: await writeNbtBlob("", nbt.compound({
    i: nbt.list("compound", [
      nbt.compound({
        Count: nbt.byte(3),
        tag: nbt.compound({
          ExtraAttributes: nbt.compound({ id: nbt.string("FIRST_ITEM") }),
          display: nbt.compound({ Name: nbt.string("First Item") }),
        }),
      }),
      nbt.compound(),
      nbt.compound({
        Count: nbt.byte(1),
        tag: nbt.compound({
          ExtraAttributes: nbt.compound({ id: nbt.string("THIRD_ITEM") }),
          display: nbt.compound({ Name: nbt.string("Third Item") }),
        }),
      }),
    ]),
  })),
});

describe("category assembly", () => {
  it("emits every category it knows about, even when empty", async () => {
    // A category that is absent and a category that is empty read the same to a
    // consumer, and the aggregator relies on the full set being present.
    const items = await parseMemberItems({ leveling: {} }, null);
    for (const key of API_CATEGORIES) expect(items[key]).toEqual([]);
  });

  it("puts worn equipment AND every loadout equipment slot in one category", async () => {
    /*
     * This is upstream 2.8.0's rule, verified against the library itself in the
     * parity gate. It arrived in 2.8.0 (2026-07-29); 2.7.5 and earlier counted
     * only the worn slots, which is why a tool pinned to an older version
     * reports a smaller Equipment figure for the same profile.
     */
    const items = await parseMemberItems(
      {
        leveling: {},
        inventory: { equipment_contents: slot(0) },
        loadout: {
          equipment: {
            0: { id: 0, EQUIPMENT_SLOT_1: slot(0), EQUIPMENT_SLOT_2: slot(1) },
            1: { id: 1, EQUIPMENT_SLOT_1: slot(0) },
          },
        },
      },
      null
    );

    expect(items.equipment).toHaveLength(4);
  });

  it("puts every loadout armour piece in the wardrobe and nowhere else", async () => {
    const items = await parseMemberItems(
      {
        leveling: {},
        inventory: { inv_armor: slot(0) },
        loadout: {
          armor: {
            0: { id: 0, HELMET: slot(0), CHESTPLATE: slot(1), LEGGINGS: slot(0), BOOTS: slot(1) },
            1: { id: 1, HELMET: slot(0) },
          },
        },
      },
      null
    );

    expect(items.wardrobe).toHaveLength(5);
    // Worn armour is its own category and must not have absorbed the loadouts.
    expect(items.armor).toHaveLength(1);
  });

  it("counts backpack icons alongside backpack contents", async () => {
    // The icon on a backpack is an item somebody paid for, so it counts, and it
    // counts in the same category as the backpack's contents.
    const items = await parseMemberItems(
      {
        leveling: {},
        inventory: {
          backpack_contents: { 0: slot(0), 1: slot(1) },
          backpack_icons: { 0: slot(0), 1: slot(1) },
        },
      },
      null
    );
    expect(items.storage).toHaveLength(4);
  });

  it("keeps empty container slots in the profile layout without changing packed valuation items", async () => {
    const container = await positionalContainer();
    const parsed = await parseMemberItemsWithLayouts(
      {
        leveling: {},
        inventory: {
          inv_contents: container,
          ender_chest_contents: container,
          backpack_contents: { 7: container },
          backpack_icons: { 7: slot(0) },
        },
      },
      null,
    );

    expect(parsed.items.inventory).toHaveLength(2);
    expect(parsed.inventoryLayouts.containers.inventory).toHaveLength(3);
    expect(parsed.inventoryLayouts.containers.inventory?.[1]).toBeNull();
    expect(parsed.inventoryLayouts.containers.enderchest?.[2]?.tag?.ExtraAttributes?.id).toBe("THIRD_ITEM");
    expect(parsed.inventoryLayouts.storage).toHaveLength(1);
    expect(parsed.inventoryLayouts.storage[0]).toMatchObject({ id: "7" });
    expect(parsed.inventoryLayouts.storage[0].slots?.[1]).toBeNull();
    expect(parsed.inventoryLayouts.storage[0].icon).not.toBeNull();
    expect(parsed.items.storage).toHaveLength(3);
  });

  it("routes each bag to its own category", async () => {
    const items = await parseMemberItems(
      {
        leveling: {},
        inventory: {
          bag_contents: {
            talisman_bag: slot(0),
            fishing_bag: slot(1),
            potion_bag: slot(0),
            sacks_bag: slot(1),
            quiver: slot(0),
          },
          personal_vault_contents: slot(1),
        },
        shared_inventory: {
          candy_inventory_contents: slot(0),
          carnival_mask_inventory_contents: slot(1),
        },
      },
      null
    );

    for (const key of [
      "accessories",
      "fishing_bag",
      "potion_bag",
      "sacks_bag",
      "quiver",
      "personal_vault",
      "candy_inventory",
      "carnival_mask_inventory",
    ]) {
      expect(items[key], key).toHaveLength(1);
    }
  });

  it("skips a borrowed museum entry, because it is somebody else's item", async () => {
    const items = await parseMemberItems(
      { leveling: {} },
      {
        items: {
          A: { items: slot(0) },
          B: { borrowing: true, items: slot(1) },
          C: { items: slot(0) },
        },
        special: [{ items: slot(1) }],
      }
    );
    expect(items.museum).toHaveLength(3);
  });

  it("skips a toolkit slot that is in use, because it is already in the inventory", async () => {
    // Counting an equipped tool twice would inflate the total by exactly the
    // tools a player actually uses, which is the worst possible subset.
    const items = await parseMemberItems(
      {
        leveling: {},
        garden_player_data: {
          farming_toolkit: {
            IS_UNLOCKED: true,
            CACTUS: { 0: await toolkitSlot("ADVANCED_GARDENING_HOE") },
            MELON: { 0: await toolkitSlot("ADVANCED_GARDENING_AXE") },
            IN_USE: { CACTUS: { 0: false }, MELON: { 0: true } },
          },
        },
      },
      null
    );

    expect(items.farming_toolkit).toHaveLength(1);
    expect((items.farming_toolkit[0] as { tag?: { ExtraAttributes?: { id?: string } } }).tag?.ExtraAttributes?.id).toBe(
      "ADVANCED_GARDENING_HOE"
    );
  });

  it("reads nothing from a locked toolkit", async () => {
    const items = await parseMemberItems(
      {
        leveling: {},
        garden_player_data: {
          farming_toolkit: { IS_UNLOCKED: false, CACTUS: { 0: await toolkitSlot("ADVANCED_GARDENING_HOE") } },
        },
      },
      null
    );
    expect(items.farming_toolkit).toEqual([]);
  });

  it("prefers the top-level sacks map over the nested one, matching upstream", async () => {
    /*
     * Deliberately the opposite precedence from `src/island/hypixel.ts`, and
     * the reason is written out where the code is. In short: that reader
     * decides what to display and should prefer the current field; this one
     * decides what number to publish beside everybody else's networth, and
     * agreeing with the credited library wins there.
     *
     * No payload has ever been seen carrying both. This test and the parity
     * gate both send one that does, so the rule cannot be re-decided silently.
     */
    const items = await parseMemberItems(
      {
        leveling: {},
        sacks_counts: { WHEAT: 10 },
        inventory: { sacks_counts: { COBBLESTONE: 99 } },
      },
      null
    );
    expect(items.sacks).toEqual([{ id: "WHEAT", amount: 10 }]);
  });

  it("falls back to the nested sacks map when that is the only one", async () => {
    const items = await parseMemberItems({ leveling: {}, inventory: { sacks_counts: { COBBLESTONE: 99 } } }, null);
    expect(items.sacks).toEqual([{ id: "COBBLESTONE", amount: 99 }]);
  });

  it("keeps every valid sack counter, including known-empty entries", async () => {
    const items = await parseMemberItems(
      { leveling: {}, sacks_counts: { WHEAT: 0, COBBLESTONE: 5, MELON: 0 } },
      null
    );
    expect(items.sacks).toEqual([
      { id: "WHEAT", amount: 0 },
      { id: "COBBLESTONE", amount: 5 },
      { id: "MELON", amount: 0 },
    ]);
  });

  it("turns each essence type into its own priced id", async () => {
    const items = await parseMemberItems(
      { leveling: {}, currencies: { essence: { WITHER: { current: 892 }, GOLD: { current: 863 } } } },
      null
    );
    expect(items.essence).toEqual([
      { id: "ESSENCE_WITHER", amount: 892 },
      { id: "ESSENCE_GOLD", amount: 863 },
    ]);
  });

  it("survives a corrupt blob without losing the rest of the profile", async () => {
    // One unreadable field must not cost a player every other category.
    const items = await parseMemberItems(
      {
        leveling: {},
        inventory: { inv_contents: { type: 0, data: "not base64 at all !!!" }, ender_chest_contents: slot(0) },
      },
      null
    );
    expect(items.inventory).toEqual([]);
    expect(items.enderchest).toHaveLength(1);
  });

  it("reads a member that is not an object as no member at all", async () => {
    expect(await parseMemberItems(null, null)).toEqual({});
    expect(await parseMemberItems("nonsense", null)).toEqual({});
  });
});

describe("coin assembly", () => {
  it("takes the purse from the member and the co-op bank from the profile", async () => {
    // The co-op bank is a PROFILE field, not a member one, because bank access
    // is shared by everybody on the profile.
    expect(
      readCoinBalances({ currencies: { coin_purse: 10 }, profile: { bank_account: 20 } }, 30)
    ).toEqual({ purse: 10, bank: 30, personalBank: 20 });
  });
});
