import type { IslandSource, SectionProvenance } from "./merge";
import { legacyItemName } from "../items/legacyIds";

/** Shared display helpers for the island surfaces. Kept out of the page so the panel can use them too. */

/** ENCHANTED_BROWN_MUSHROOM -> Enchanted Brown Mushroom. */
const titleCase = (id: string): string =>
  id
    .toLowerCase()
    .split(/[_\s:]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/**
 * An id, as a player should read it.
 *
 * Title-casing is right for the overwhelming majority of ids, because Hypixel
 * names things in the shape it wants them displayed. It is wrong for the ones
 * still carrying a 1.8 `<id>:<damage>` pair, where the damage value selects the
 * variant and title-casing turns `INK_SACK:4` into "Ink Sack 4" instead of
 * Lapis Lazuli. Those go through the legacy table first.
 *
 * The order matters and the fallback is the old function untouched: an id the
 * table does not know degrades to exactly what it produced before, never
 * worse. This is the only place the correction happens, so every consumer that
 * already reads a name through here gets it, icons included. `wikiImages`
 * derives its URL from this name, so a fixed name is a fixed icon by the same
 * stroke, with no second resolution path to keep in step.
 */
export const prettify = (id: string): string => legacyItemName(id) ?? titleCase(id);

/** Coarse on purpose: nobody needs "3 minutes and 12 seconds ago" for a chest. */
export const ago = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) return "never";
  const delta = Date.now() - ms;
  if (delta < 45_000) return "just now";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ms).toLocaleDateString();
};

export const SOURCE_LABEL: Record<IslandSource, string> = {
  mod: "Skydex mod",
  api: "Hypixel API",
};

/** Short forms, for the blended label where two sources and two ages share one line. */
const SOURCE_SHORT: Record<IslandSource, string> = {
  mod: "mod",
  api: "API",
};

/**
 * One line describing where a section came from, for its heading.
 *
 * The four states each get their own sentence rather than a shared template,
 * because the whole point of keeping them apart is that they mean different
 * things to the player: one is data, one is data that happens to be nothing,
 * one is a privacy setting they can change, and one is a source that has not
 * looked yet.
 */
export const describeSection = (p: SectionProvenance, live: boolean): string => {
  switch (p.state) {
    case "captured":
    case "empty": {
      if (!p.source) return "";

      // A blended section names every source that actually put something in it,
      // each with its own age. Sacks merge per item, so the mod can be seconds
      // old while the API half is minutes old, and collapsing that to one
      // timestamp would date half the numbers wrongly.
      if (p.contributors && p.contributors.length > 1) {
        return p.contributors
          .map((c) => (c.source === "mod" && live ? "live mod" : `${SOURCE_SHORT[c.source]} ${ago(c.at)}`))
          .join(" + ");
      }

      return p.source === "mod" && live
        ? `live from ${SOURCE_LABEL.mod}`
        : `from ${SOURCE_LABEL[p.source]}, ${ago(p.at)}`;
    }
    case "hidden":
      return "not shared via API settings";
    case "absent":
      return "not captured yet";
  }
};
