import { readNbtBlob } from "../nbt";
import { simplifyCompound, simplifyItems, simplifyItemSlots } from "./nbtSimplify";
import { isRecord, titleCase } from "./helpers";
import type { BasicItem, Catalogue, ExtraAttributes, PetData, RawItem } from "./types";
import type { ParsedItems } from "./profileNetworth";

/**
 * A Hypixel profile member, turned into the category arrays the aggregator
 * takes. Ported from SkyHelper-Networth 2.8.0's `helper/parseItems.js` and
 * `helper/toolkits.js` (MIT, see NOTICE.md), rewritten onto `src/nbt` because
 * upstream's decoder is Node-only (zlib, Buffer, prismarine-nbt).
 *
 * Field locations are pinned by the parser fixtures and upstream compatibility
 * tests. The one that catches people out: the wardrobe is at
 * `member.loadout.armor`, NOT at
 * `inventory.wardrobe_contents`. Older documentation still says the latter and
 * current payloads do not have it.
 *
 * EVERY BLOB IS OPTIONAL AND A FAILURE IS PER BLOB. A player with the Inventory
 * API toggle off has no `inv_contents` at all, and a single corrupt backpack
 * must not cost them the other eight. So each decode is caught on its own and
 * contributes an empty array, and the aggregator's `noInventory` flag is what
 * carries the difference between "empty" and "not shared" up to the UI.
 */

const asRecord = (value: unknown): Record<string, unknown> | null => (isRecord(value) ? value : null);

const blobOf = (value: unknown): string => {
  const record = asRecord(value);
  return typeof record?.data === "string" ? record.data : "";
};

interface DecodedContainer {
  items: RawItem[];
  /** Null means the blob was absent or unreadable; an empty array was decoded. */
  slots: (RawItem | null)[] | null;
}

/** One container blob to items and real positions. Never throws. */
const decodeContainerLayout = async (base64: string, signal?: AbortSignal): Promise<DecodedContainer> => {
  if (!base64) return { items: [], slots: null };
  try {
    const document = await readNbtBlob(base64, signal);
    const slots = simplifyItemSlots(document.value);
    return {
      items: slots.filter((item): item is RawItem => item !== null),
      slots,
    };
  } catch {
    return { items: [], slots: null };
  }
};

/** One container blob to packed valuation items. */
const decodeContainer = async (base64: string, signal?: AbortSignal): Promise<RawItem[]> =>
  (await decodeContainerLayout(base64, signal)).items;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
};

/**
 * Farming and hunting toolkits.
 *
 * Their blobs are not containers: the root compound IS the item's
 * ExtraAttributes, with no `i` list and no display name, so a whole item has to
 * be built around it. A tool currently IN_USE is skipped, because an equipped
 * tool is already sitting in the inventory blob and counting it twice would
 * inflate the total by exactly the tools somebody actually uses.
 */
const parseToolkit = async (toolkit: unknown, catalogue: Catalogue, signal?: AbortSignal): Promise<RawItem[]> => {
  const record = asRecord(toolkit);
  if (!record || !record.IS_UNLOCKED) return [];

  const inUse = asRecord(record.IN_USE) ?? {};
  const metadata = new Set(["IN_USE", "IS_UNLOCKED"]);
  const categories = [...new Set([...Object.keys(record), ...Object.keys(inUse)])].filter((c) => !metadata.has(c));

  const out: RawItem[] = [];
  for (const category of categories) {
    const entries = record[category];
    if (!isRecord(entries) && !Array.isArray(entries)) continue;
    const slots = asRecord(inUse[category]) ?? {};

    for (const [index, entry] of Object.entries(entries as Record<string, unknown>)) {
      if (slots[index] === true) continue;
      const base64 = typeof asRecord(entry)?.data === "string" ? (asRecord(entry)!.data as string) : "";
      if (!base64) continue;

      try {
        const document = await readNbtBlob(base64, signal);
        const extraAttributes = simplifyCompound(document.value);
        const id = extraAttributes.id;
        if (typeof id !== "string" || !id) continue;
        const item: RawItem = {
          Count: 1,
          tag: {
            ExtraAttributes: extraAttributes as ExtraAttributes,
            display: { Name: catalogue[id]?.name ?? titleCase(id), Lore: [] },
          },
        };
        out.push(item);
      } catch {
        // One unreadable tool, not the whole toolkit.
      }
    }
  }
  return out;
};

/**
 * New Year Cake Bags carry their cakes as a nested gzip NBT blob inside the
 * bag item's own attributes. The handler reads `new_year_cake_bag_years`, which
 * exists nowhere on the wire and is filled in here.
 */
const fillCakeBags = async (items: ParsedItems, signal?: AbortSignal): Promise<void> => {
  for (const entries of Object.values(items)) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      const extra = (entry as RawItem)?.tag?.ExtraAttributes;
      if (!extra) continue;
      const data = extra.new_year_cake_bag_data;
      if (!(data instanceof Uint8Array) || data.length === 0) continue;
      try {
        const document = await readNbtBlob(toBase64(data), signal);
        const cakes = simplifyItems(document.value);
        extra.new_year_cake_bag_years = cakes
          .map((cake) => cake.tag?.ExtraAttributes?.new_years_cake)
          .filter((year): year is number => typeof year === "number");
      } catch {
        // A bag we cannot open contributes its own price and nothing more.
      }
    }
  }
};

/**
 * Sacks. TOP LEVEL FIRST, then nested, which is upstream's order and NOT the
 * order `src/island/hypixel.ts` uses.
 *
 * That divergence inside one codebase is deliberate and worth the words. The
 * two readers answer different questions. `readSacks` in the island layer
 * decides what to DISPLAY, and for that the current field (nested) is the
 * better answer if Hypixel ever sent both. This one decides what NUMBER to
 * publish next to everybody else's networth, and for that agreeing with the
 * credited library matters more than being right on our own: a total that
 * disagrees with SkyCrypt because we quietly preferred a different field is
 * worse than one that is stale in a case nobody has ever observed.
 *
 * Nobody has observed both being present. Current payloads carry only the
 * nested one (covered by parser fixtures), so in practice the
 * two orders pick the same object; `tools/networth-parity.mjs` sends a member
 * carrying BOTH, with different contents, so the day that changes the assembly
 * gate fails rather than the number drifting silently.
 */
const readSacks = (member: Record<string, unknown>): BasicItem[] => {
  const inventory = asRecord(member.inventory);
  const counts = asRecord(member.sacks_counts) ?? asRecord(inventory?.sacks_counts);
  if (!counts) return [];
  return Object.entries(counts)
    // Hypixel reports the complete sack counter surface, including entries at
    // zero. Keep those rows: zero means "checked and empty", while omitting the
    // row would make downstream planners report the item as unknown.
    .filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount) && amount >= 0)
    .map(([id, amount]) => ({ id, amount: amount as number }));
};

const readEssence = (member: Record<string, unknown>): BasicItem[] => {
  const essence = asRecord(asRecord(member.currencies)?.essence);
  if (!essence) return [];
  return Object.entries(essence).map(([type, data]) => ({
    id: `ESSENCE_${type.toUpperCase()}`,
    amount: typeof asRecord(data)?.current === "number" ? (asRecord(data)!.current as number) : 0,
  }));
};

const readPets = (member: Record<string, unknown>): PetData[] => {
  const pets = asRecord(member.pets_data)?.pets;
  return Array.isArray(pets) ? (pets.filter(isRecord) as unknown as PetData[]) : [];
};

/**
 * The museum profile selected from either endpoint response envelope.
 *
 * A borrowed item is somebody else's, so it is skipped. `special` holds the
 * one-off donations that are not keyed by item id.
 */
export const parseMuseumItems = async (museum: unknown, signal?: AbortSignal): Promise<RawItem[]> => {
  const record = asRecord(museum);
  if (!record) return [];

  const out: RawItem[] = [];

  const items = asRecord(record.items);
  if (items) {
    for (const entry of Object.values(items)) {
      const slot = asRecord(entry);
      if (!slot || slot.borrowing === true) continue;
      out.push(...(await decodeContainer(blobOf(slot.items), signal)));
    }
  }

  if (Array.isArray(record.special)) {
    for (const special of record.special) {
      const slot = asRecord(special);
      if (!slot) continue;
      out.push(...(await decodeContainer(blobOf(slot.items), signal)));
    }
  }

  return out;
};

export interface ParseOptions {
  /** Needed only to name toolkit items. Everything else works without it. */
  catalogue?: Catalogue;
  signal?: AbortSignal;
}

export const INVENTORY_LAYOUT_CATEGORIES = [
  "inventory",
  "enderchest",
  "personal_vault",
  "fishing_bag",
  "potion_bag",
  "sacks_bag",
  "quiver",
  "candy_inventory",
  "carnival_mask_inventory",
] as const;

export type InventoryLayoutCategory = (typeof INVENTORY_LAYOUT_CATEGORIES)[number];
export type InventoryLayoutSlot = RawItem | null;

export interface StoragePageLayout {
  /** The profile map key, which is the page identity used by Hypixel. */
  id: string;
  slots: InventoryLayoutSlot[] | null;
  /** The backpack icon is metadata for the page, not one of its content slots. */
  icon: RawItem | null;
}

/** Positional inventory data kept beside, never inside, valuation categories. */
export interface MemberInventoryLayouts {
  containers: Record<InventoryLayoutCategory, InventoryLayoutSlot[] | null>;
  storage: StoragePageLayout[];
}

export const emptyMemberInventoryLayouts = (): MemberInventoryLayouts => ({
  containers: Object.fromEntries(
    INVENTORY_LAYOUT_CATEGORIES.map((category) => [category, null]),
  ) as Record<InventoryLayoutCategory, null>,
  storage: [],
});

/** The four wardrobe slots, in the order a body is read: helmet first. */
export const WARDROBE_SLOTS = ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"] as const;

/** The four equipment slots, in the game's own slot order. */
export const EQUIPMENT_SLOTS = ["EQUIPMENT_SLOT_1", "EQUIPMENT_SLOT_2", "EQUIPMENT_SLOT_3", "EQUIPMENT_SLOT_4"] as const;

/**
 * One stored set - armor or equipment - slots kept apart and positional.
 * `null` is a slot the set does not fill, which the flattened valuation
 * categories cannot say: they drop empties before anyone can see which piece
 * was missing. `id` is the payload's own set number, because loadouts
 * reference sets BY ID and a positional index would point at the wrong set
 * the moment one is missing from the sequence.
 */
export interface GearSet {
  id: number;
  pieces: [RawItem | null, RawItem | null, RawItem | null, RawItem | null];
}

/**
 * One loadout, exactly as `loadout.loadouts.{n}` states it (verified against
 * the schema investigation captured 2026-08-03): a name always, and then only
 * whatever the player assigned. Absent stays null - a loadout with no pet has
 * no pet, and nothing here fills a gap.
 */
export interface LoadoutStatement {
  id: number;
  name: string;
  /** References into `armorSets` / `equipmentSets` by their `id`. */
  armorSetId: number | null;
  equipmentSetId: number | null;
  /** The pet's uuid, matching `pets_data.pets[].uuid`. */
  petUuid: string | null;
  /** Power stone name in the payload's own casing, e.g. `forceful`. */
  powerStone: string | null;
  /** Which `accessory_bag_storage.tuning.slot_N` this loadout uses. */
  tuningSlot: number | null;
  /** One-based Heart of the Mountain preset selected by this loadout. */
  miningTreeSlot?: number | null;
  /** One-based Heart of the Forest preset selected by this loadout. */
  foragingTreeSlot?: number | null;
}

export interface MemberLoadouts {
  /** Stored armor sets (the wardrobe), sorted by id. */
  armorSets: GearSet[];
  /** Active armour set id from `loadout.armor.equipped_set`, with the legacy inventory slot as fallback. */
  equippedArmorSetId: number | null;
  /** Stored equipment sets (the equipment wardrobe), sorted by id. */
  equipmentSets: GearSet[];
  /** The worn equipment, positional, from `inventory.equipment_contents`. */
  wornEquipment: [RawItem | null, RawItem | null, RawItem | null, RawItem | null];
  /** `loadout.equipment.equipped_set`, or null when the payload omits it. */
  equippedEquipmentSetId: number | null;
  /** The named loadouts, sorted by id. Empty when the payload states none. */
  loadouts: LoadoutStatement[];
  /** Confirmed usable loadout count, or null when profile-level entitlement data was absent. */
  unlockedSlotCount?: number | null;
}

const numericSort = (a: string, b: string): number => {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
};

const presetSlot = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;

/** One set map (`loadout.armor` or `loadout.equipment`) into positional GearSets. */
const parseSetMap = async (
  value: unknown,
  slots: readonly string[],
  signal?: AbortSignal
): Promise<GearSet[]> => {
  const map = asRecord(value);
  if (!map) return [];

  const out: GearSet[] = [];
  for (const key of Object.keys(map).sort(numericSort)) {
    const set = asRecord(map[key]);
    if (!set) continue;
    const pieces: GearSet["pieces"] = [null, null, null, null];
    for (let i = 0; i < slots.length; i++) {
      const items = await decodeContainer(blobOf(set[slots[i]]), signal);
      pieces[i] = items[0] ?? null;
    }
    // The numbered map key is the exposed-slot signal. Keep an all-null set:
    // it is an unlocked-empty wardrobe slot, not absence from the payload.
    // The payload carries the set's own `id`; the map key is its string twin.
    // Prefer the stated id, fall back to the key, and drop a set with neither
    // rather than inventing an identity a loadout could then reference.
    const id = typeof set.id === "number" && Number.isInteger(set.id) ? set.id : Number(key);
    if (!Number.isInteger(id)) continue;
    out.push({ id, pieces });
  }
  return out;
};

/**
 * Everything `member.loadout` states, plus the worn equipment beside it.
 *
 * This is the profile viewer's read (the valuation has its own flattened one,
 * see `parseMemberItems`): the wardrobe as numbered armor sets, the equipment
 * wardrobe as numbered equipment sets - Hypixel genuinely stores equipment in
 * loadout structure, "Equipment is a wardrobe. Just like armour!" is in the
 * data - and the named loadouts that tie a set of each to a pet, a power
 * stone, a tuning slot, and progression-tree presets. Only what is stated
 * survives: a numbered all-empty set remains an unlocked-empty slot, an
 * unassigned reference is null, and a member with no `loadout` object at all
 * yields empty lists.
 */
export const parseMemberLoadouts = async (member: unknown, signal?: AbortSignal): Promise<MemberLoadouts> => {
  const record = asRecord(member);
  const loadout = asRecord(record?.loadout);
  const inventory = asRecord(record?.inventory);

  const [armorSets, equipmentSets, worn] = await Promise.all([
    parseSetMap(loadout?.armor, WARDROBE_SLOTS, signal),
    parseSetMap(loadout?.equipment, EQUIPMENT_SLOTS, signal),
    decodeContainer(blobOf(inventory?.equipment_contents), signal),
  ]);

  // The worn blob is a 4-slot container whose empties the decoder drops, so
  // position is by list order of what survives; with all four worn (the
  // common case) the positions are exact.
  const wornEquipment: MemberLoadouts["wornEquipment"] = [worn[0] ?? null, worn[1] ?? null, worn[2] ?? null, worn[3] ?? null];
  const armorMap = asRecord(loadout?.armor);
  const modernArmorSet = armorMap?.equipped_set;
  const legacyArmorSlot = inventory?.wardrobe_equipped_slot;
  const equippedArmorSetId =
    typeof modernArmorSet === "number" && Number.isInteger(modernArmorSet) && modernArmorSet > 0
      ? modernArmorSet
      : typeof legacyArmorSlot === "number" && Number.isInteger(legacyArmorSlot) && legacyArmorSlot >= 0
        ? legacyArmorSlot + 1
        : null;
  const equipmentMap = asRecord(loadout?.equipment);
  const equippedEquipmentSetId =
    equipmentMap && typeof equipmentMap.equipped_set === "number" && Number.isInteger(equipmentMap.equipped_set)
      ? equipmentMap.equipped_set
      : null;

  const loadouts: LoadoutStatement[] = [];
  const stated = asRecord(loadout?.loadouts);
  if (stated) {
    for (const key of Object.keys(stated).sort(numericSort)) {
      const entry = asRecord(stated[key]);
      if (!entry) continue;
      const id = typeof entry.id === "number" && Number.isInteger(entry.id) ? entry.id : Number(key);
      if (!Number.isInteger(id)) continue;
      loadouts.push({
        id,
        name: typeof entry.name === "string" && entry.name ? entry.name : `Loadout ${id}`,
        armorSetId: typeof entry.armor_set_id === "number" ? entry.armor_set_id : null,
        equipmentSetId: typeof entry.equipment_set_id === "number" ? entry.equipment_set_id : null,
        petUuid: typeof entry.pet === "string" && entry.pet ? entry.pet : null,
        powerStone: typeof entry.power_stone === "string" && entry.power_stone ? entry.power_stone : null,
        tuningSlot: typeof entry.tuning_points_slot === "number" ? entry.tuning_points_slot : null,
        miningTreeSlot: presetSlot(entry.mining_core_selected_slot),
        foragingTreeSlot: presetSlot(entry.foraging_core_selected_slot),
      });
    }
  }

  return { armorSets, equippedArmorSetId, equipmentSets, wornEquipment, equippedEquipmentSetId, loadouts };
};

/** Every category the API can fill, in the order the UI lists them. */
export const API_CATEGORIES = [
  "inventory",
  "armor",
  "equipment",
  "wardrobe",
  "accessories",
  "enderchest",
  "storage",
  "personal_vault",
  "fishing_bag",
  "potion_bag",
  "sacks_bag",
  "quiver",
  "candy_inventory",
  "carnival_mask_inventory",
  "farming_toolkit",
  "hunting_toolkit",
  "museum",
  "pets",
  "sacks",
  "essence",
] as const;

export interface ParsedMemberItems {
  items: ParsedItems;
  inventoryLayouts: MemberInventoryLayouts;
}

export const parseMemberItemsWithLayouts = async (
  member: unknown,
  museum: unknown,
  options: ParseOptions = {}
): Promise<ParsedMemberItems> => {
  const { catalogue = {}, signal } = options;
  const record = asRecord(member);
  if (!record) return { items: {}, inventoryLayouts: emptyMemberInventoryLayouts() };

  const inventory = asRecord(record.inventory) ?? {};
  const bags = asRecord(inventory.bag_contents) ?? {};
  const shared = asRecord(record.shared_inventory) ?? {};
  const loadout = asRecord(record.loadout) ?? {};

  const single = async (value: unknown): Promise<RawItem[]> => decodeContainer(blobOf(value), signal);
  const container = async (value: unknown): Promise<DecodedContainer> => decodeContainerLayout(blobOf(value), signal);

  /** Every blob under a map of blobs, flattened into one category. */
  const flatten = async (value: unknown, keys?: string[]): Promise<RawItem[]> => {
    const map = asRecord(value);
    if (!map) return [];
    const out: RawItem[] = [];
    for (const slot of Object.values(map)) {
      if (keys) {
        const layout = asRecord(slot);
        if (!layout) continue;
        for (const key of keys) out.push(...(await single(layout[key])));
      } else {
        out.push(...(await single(slot)));
      }
    }
    return out;
  };

  const storagePages = async (): Promise<{
    layouts: StoragePageLayout[];
    contents: RawItem[];
    icons: RawItem[];
  }> => {
    const contentsMap = asRecord(inventory.backpack_contents) ?? {};
    const iconsMap = asRecord(inventory.backpack_icons) ?? {};
    const keys = [...new Set([...Object.keys(contentsMap), ...Object.keys(iconsMap)])].sort(numericSort);
    const decoded = await Promise.all(keys.map(async (id) => {
      const [contents, icon] = await Promise.all([
        container(contentsMap[id]),
        container(iconsMap[id]),
      ]);
      return {
        layout: { id, slots: contents.slots, icon: icon.items[0] ?? null } satisfies StoragePageLayout,
        contents: contents.items,
        icons: icon.items,
      };
    }));
    return {
      layouts: decoded.map((page) => page.layout),
      contents: decoded.flatMap((page) => page.contents),
      icons: decoded.flatMap((page) => page.icons),
    };
  };

  const [
    armor,
    equipmentWorn,
    equipmentLoadout,
    inventoryContainer,
    enderchestContainer,
    accessories,
    personalVaultContainer,
    fishingBagContainer,
    potionBagContainer,
    sacksBagContainer,
    quiverContainer,
    candyContainer,
    carnivalMaskContainer,
    storage,
    wardrobe,
    museumItems,
    farmingToolkit,
    huntingToolkit,
  ] = await Promise.all([
    single(inventory.inv_armor),
    single(inventory.equipment_contents),
    flatten(loadout.equipment, ["EQUIPMENT_SLOT_1", "EQUIPMENT_SLOT_2", "EQUIPMENT_SLOT_3", "EQUIPMENT_SLOT_4"]),
    container(inventory.inv_contents),
    container(inventory.ender_chest_contents),
    single(bags.talisman_bag),
    container(inventory.personal_vault_contents),
    container(bags.fishing_bag),
    container(bags.potion_bag),
    container(bags.sacks_bag),
    container(bags.quiver),
    container(shared.candy_inventory_contents),
    container(shared.carnival_mask_inventory_contents),
    storagePages(),
    flatten(loadout.armor, ["HELMET", "CHESTPLATE", "LEGGINGS", "BOOTS"]),
    parseMuseumItems(museum, signal),
    parseToolkit(asRecord(record.garden_player_data)?.farming_toolkit, catalogue, signal),
    parseToolkit(asRecord(record.foraging)?.hunting_toolkit, catalogue, signal),
  ]);

  const items: ParsedItems = {
    inventory: inventoryContainer.items,
    armor,
    equipment: [...equipmentWorn, ...equipmentLoadout],
    wardrobe,
    accessories,
    enderchest: enderchestContainer.items,
    // The icon on a backpack is itself an item somebody paid for.
    storage: [...storage.contents, ...storage.icons],
    personal_vault: personalVaultContainer.items,
    fishing_bag: fishingBagContainer.items,
    potion_bag: potionBagContainer.items,
    sacks_bag: sacksBagContainer.items,
    quiver: quiverContainer.items,
    candy_inventory: candyContainer.items,
    carnival_mask_inventory: carnivalMaskContainer.items,
    farming_toolkit: farmingToolkit,
    hunting_toolkit: huntingToolkit,
    museum: museumItems,
    pets: readPets(record),
    sacks: readSacks(record),
    essence: readEssence(record),
  };

  await fillCakeBags(items, signal);
  return {
    items,
    inventoryLayouts: {
      containers: {
        inventory: inventoryContainer.slots,
        enderchest: enderchestContainer.slots,
        personal_vault: personalVaultContainer.slots,
        fishing_bag: fishingBagContainer.slots,
        potion_bag: potionBagContainer.slots,
        sacks_bag: sacksBagContainer.slots,
        quiver: quiverContainer.slots,
        candy_inventory: candyContainer.slots,
        carnival_mask_inventory: carnivalMaskContainer.slots,
      },
      storage: storage.layouts,
    },
  };
};

/** Packed compatibility surface used by valuation and its parity gates. */
export const parseMemberItems = async (
  member: unknown,
  museum: unknown,
  options: ParseOptions = {},
): Promise<ParsedItems> => (await parseMemberItemsWithLayouts(member, museum, options)).items;

/** Purse, co-op bank and personal bank, from the two places they live. */
export const readCoinBalances = (member: unknown, bankBalance: unknown) => {
  const record = asRecord(member);
  const purse = asRecord(record?.currencies)?.coin_purse;
  const personal = asRecord(record?.profile)?.bank_account;
  return {
    purse: typeof purse === "number" ? purse : 0,
    // Zero, not null, when the Banking API toggle hides it. The UI is told
    // separately whether the field was there, because "no bank" and "bank not
    // shared" are different sentences and only one of them is our claim.
    bank: typeof bankBalance === "number" ? bankBalance : 0,
    personalBank: typeof personal === "number" ? personal : 0,
  };
};
