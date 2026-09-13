import type { GlyphKey, SearchEntry } from "./types";
import { normalise } from "./normalise";

/**
 * The site's own pages, as search results.
 *
 * A universal search that can find 2,000 crafting ingredients but not the
 * Planner is not universal. These are hand written because there are only a few of
 * them and because each one wants aliases a route table could not supply:
 * people look for the Solver by typing "layout", and for Owned by typing
 * "inventory".
 *
 * `destination` is the family the page belongs to, not a category. It is what
 * the row's badge prints, so Planner says Greenhouse and Fusion says Shards.
 * The three that belong to no tool family say Site.
 *
 * Weights put pages above data of the same match quality. A page is a small,
 * fixed set and a person searching a word that is also a page name almost
 * always means the page.
 */
interface RawSection {
  name: string;
  href: string;
  destination: SearchEntry["destination"];
  glyph: GlyphKey;
  aliases: string[];
}

const SECTIONS: RawSection[] = [
  {
    name: "Grind dashboard",
    href: "/dashboard",
    destination: "site",
    glyph: "dashboard",
    aliases: ["dashboard", "home", "progress", "where was i"],
  },
  {
    name: "Greenhouse Planner",
    href: "/greenhouse#planner",
    destination: "greenhouse",
    glyph: "planner",
    aliases: ["plan", "target", "grow order", "plantings", "track"],
  },
  {
    name: "Greenhouse Solver",
    href: "/greenhouse#solver",
    destination: "greenhouse",
    glyph: "solver",
    aliases: ["solve", "layout", "optimal", "plot"],
  },
  {
    name: "Greenhouse Designer",
    href: "/greenhouse#designer",
    destination: "greenhouse",
    glyph: "designer",
    aliases: ["design", "build", "grid", "by hand"],
  },
  {
    name: "Recipes",
    href: "/recipes",
    destination: "items",
    glyph: "items",
    aliases: ["craft", "crafting", "recipe", "bazaar", "cost", "materials", "obtain", "drop", "shop", "forge"],
  },
  {
    name: "Profile",
    href: "/profile",
    destination: "site",
    glyph: "island",
    aliases: ["profile", "stats", "skills", "hypixel"],
  },
  {
    name: "Storage",
    href: "/storage",
    destination: "site",
    glyph: "island",
    aliases: ["inventory", "storage", "sacks", "backpacks", "island chests", "what i own", "mod data"],
  },
  {
    name: "Shards",
    href: "/shards",
    destination: "shards",
    glyph: "fusion",
    aliases: ["fuse", "fusion calculator", "attribute", "cheapest", "shard calculator", "owned shards", "inventory", "have", "collection"],
  },
  {
    name: "Shard recipes",
    href: "/shard-recipes",
    destination: "shards",
    glyph: "recipes",
    aliases: ["recipe list", "fuse list"],
  },
  {
    name: "Fusion lines",
    href: "/fusion-lines",
    destination: "shards",
    glyph: "lines",
    aliases: ["graph", "tree", "chain"],
  },
  {
    name: "Guide",
    href: "/guide",
    destination: "site",
    glyph: "guide",
    aliases: ["help", "how to", "docs", "reading"],
  },
];

export const SECTION_ENTRIES: SearchEntry[] = SECTIONS.map((s) => ({
  key: `site:${s.href}`,
  name: s.name,
  destination: s.destination,
  href: s.href,
  rarity: null,
  iconName: s.name,
  glyph: s.glyph,
  hint: "Page",
  weight: 60,
  needle: normalise(s.name),
  aliases: normalise(s.aliases.join(" ")),
}));
