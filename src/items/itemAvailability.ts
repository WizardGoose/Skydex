import { norm } from "./wikiCrafting";

/** Confirmed admin content already identified by the accessory catalogue. */
const ADMIN_ITEMS = ["Artifact of Space", "Talisman of Space", "Grizzly Paw", "Bingo Heirloom"];
const ADMIN_NAMES = new Set(ADMIN_ITEMS.map(norm));

export const isPlayerItem = (
  name: string,
  id?: string | null,
  adminNames?: ReadonlySet<string>,
): boolean => !ADMIN_NAMES.has(norm(name))
  && !ADMIN_NAMES.has(norm(id ?? ""))
  && !adminNames?.has(norm(name))
  && !/test item/i.test(name)
  && !/^TEST_/i.test(id ?? "");
