export type GardenVisitorTier = "uncommon" | "rare" | "legendary" | "mythic" | "special";

export interface GardenVisitorIdentity {
  name: string;
  /** Exact wiki image title when the NPC name collides with another game entity. */
  iconName: string;
  tier: GardenVisitorTier | null;
}

const fold = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

/**
 * Visitor rarity is game data, not an inferred UI colour. Keep it alongside
 * the API projection so every visitor surface receives the same identity.
 */
const VISITORS_BY_TIER: Readonly<Record<GardenVisitorTier, readonly string[]>> = {
  uncommon: [
    "Alchemist", "An", "Andrew", "Anita", "Arthur", "Banker Broadjaw", "Bednom", "Duke", "Dusk",
    "Chunk", "Combat Merchant", "Emissary Carlton", "Emissary Ceanna", "Emissary Fraiser",
    "Emissary Wilson", "Farm Merchant", "Farmer Jon", "Farmhand", "Fear Mongerer", "Felix",
    "Fisherman Gerald", "Friendly Hiker", "Geonathan Greatforge", "Gimley", "Guy", "Hornum",
    "Jack", "Jacob", "Jacobus", "Jamie", "Jotraeline Greatforge", "Leo", "Liam", "Librarian",
    "Lift Operator", "Lumber Jack", "Lynn", "Mason", "Odawa", "Old Shaman Nyko", "Oringo",
    "Pearl Dealer", "Pest Wrangler", "Plumber Joe", "Resident Neighbor", "Resident Snooty",
    "Rhys", "Ryan", "Ryu", "Sargwyn", "Scout Scardius", "Shaggy", "Stella", "Tarwen", "Terry",
    "Tom", "Trevor", "Vex", "Weaponsmith", "Wizard", "Xalx",
  ],
  rare: [
    "Alchemage", "Archaeologist", "Bartender", "Carpenter", "Chantelle", "Cold Enjoyer",
    "Dalbrek", "Duncan", "Emissary Sisko", "Erihann", "Fann", "Fragilis", "Frozen Alex",
    "Gary", "Gemma", "Gold Forger", "Grandma Wolf", "Gwendolyn", "Hendrik", "Iron Forger",
    "Lazy Miner", "Lumina", "Madame Eleanor Q. Goldsworth III", "Marco", "Marigold",
    "Master Tactician Funk", "Moby", "Old Man Garry", "Ophelia", "Pete", "Puzzler",
    "Queen Mismyla", "Romero", "Royal Resident", "Rusty", "Seymour", "Sherry", "Shifty",
    "Spider Tamer", "St. Jerry", "Tammy", "Tia the Fairy", "Tomioka", "Trinity",
    "Tyashoi Alchemist", "Tyzzo", "Vinyl Collector", "Zog",
  ],
  legendary: [
    "Baker", "Beth", "Carrot King Avatar", "Chief Scorn", "Clerk Seraphine", "Dante Goon", "Dulin",
    "Elle", "Hoppity", "Jerry", "Mayor Aatrox", "Mayor Cole", "Mayor Diana", "Mayor Diaz",
    "Mayor Finnegan", "Mayor Foxy", "Mayor Marina", "Mayor Paul", "Pest Wrangler?", "Queen Nyx",
    "Sirius", "Tal Ker", "Vargul", "Vincent",
  ],
  mythic: ["Bruuh", "Ludleth", "Maeve", "Ravenous Rhino", "Taylor"],
  special: ["Spaceman"],
};

/** Hypixel's Garden response keeps several stable API labels older than the NPC display names. */
const VISITOR_ALIASES: Readonly<Record<string, string>> = {
  adventurer: "Combat Merchant",
  artist: "Marco",
  "bear pete": "Pete",
  "disguised rats": "Pest Wrangler?",
  "dragon ritualist": "Tyzzo",
  "dulin tunnels": "Dulin",
  "end dealer": "Pearl Dealer",
  "fire guy": "Ryan",
  fisherman: "Fisherman Gerald",
  lumberjack: "Lumber Jack",
  "madame eleanor": "Madame Eleanor Q. Goldsworth III",
  "master tactician": "Master Tactician Funk",
  "pet trainer": "Fann",
  "royal resident neighbour": "Resident Neighbor",
  "royal resident peasant": "Royal Resident",
  scardius: "Scout Scardius",
  seraphine: "Clerk Seraphine",
  snowmaker: "Frozen Alex",
  "st jerry": "St. Jerry",
  tia: "Tia the Fairy",
  "vargul garden": "Vargul",
};

const TIER_BY_VISITOR = new Map<string, GardenVisitorTier>(
  (Object.entries(VISITORS_BY_TIER) as [GardenVisitorTier, readonly string[]][])
    .flatMap(([tier, names]) => names.map((name) => [fold(name), tier] as const)),
);

/**
 * Most visitor portraits live at their display-name image. Vex is the one
 * concrete collision: `Vex.png` is Minecraft's flying mob, while the Garden
 * visitor is the Hub NPC rendered by the wiki's NPCSprite template.
 */
const VISITOR_ICON_OVERRIDES: Readonly<Record<string, string>> = {
  vex: "Vex Sprite",
};

export const gardenVisitorIdentityFor = (label: string): GardenVisitorIdentity => {
  const alias = VISITOR_ALIASES[fold(label)];
  const name = alias ?? label;
  return {
    name,
    iconName: VISITOR_ICON_OVERRIDES[fold(name)] ?? name,
    tier: TIER_BY_VISITOR.get(fold(name)) ?? null,
  };
};
