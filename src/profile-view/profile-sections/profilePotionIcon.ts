const POTION_COLOURS: Readonly<Record<string, string>> = Object.freeze({
  SPEED: "#5555ff",
  JUMP_BOOST: "#55ffff",
  WATER_BREATHING: "#5555ff",
  REGENERATION: "#aa0000",
  STRENGTH: "#aa0000",
  ADRENALINE: "#ff5555",
  WOUNDED: "#aa0000",
  NIGHT_VISION: "#aa00aa",
  INVISIBILITY: "#555555",
  POISON: "#00aa00",
  HEALING: "#ff5555",
  FIRE_RESISTANCE: "#ff5555",
  EXPERIENCE: "#5555ff",
  WEAKNESS: "#aaaaaa",
  BLINDNESS: "#ffffff",
  SLOWNESS: "#aaaaaa",
  DAMAGE: "#aa0000",
  HASTE: "#ffff55",
  BURNING: "#ffaa00",
  KNOCKBACK: "#aa0000",
  STUN: "#555555",
  ARCHERY: "#55ffff",
  ABSORPTION: "#ffaa00",
  DODGE: "#5555ff",
  RESISTANCE: "#55ff55",
  MANA: "#5555ff",
  AGILITY: "#aa00aa",
  RABBIT: "#55ff55",
  CRITICAL: "#aa0000",
  TRUE_RESISTANCE: "#ffffff",
  SPELUNKER: "#55ffff",
  SPIRIT: "#55ffff",
  MAGIC_FIND: "#55ffff",
  STAMINA: "#55ff55",
  VENOMOUS: "#aa00aa",
  PET_LUCK: "#55ffff",
  FARMING_XP_BOOST: "#55ff55",
  MINING_XP_BOOST: "#55ff55",
  COMBAT_XP_BOOST: "#55ff55",
  FORAGING_XP_BOOST: "#55ff55",
  FISHING_XP_BOOST: "#55ff55",
  ENCHANTING_XP_BOOST: "#55ff55",
  ALCHEMY_XP_BOOST: "#55ff55",
  DUNGEON: "#ffaa00",
  WISP_ICE: "#5555ff",
  MUSHED_GLOWY_TONIC: "#55ff55",
  HARVEST_HARBINGER: "#ffaa00",
  COLD_RESISTANCE: "#55ff55",
  STINKY_CHEESE: "#ffaa00",
  SECRETS: "#aa00aa",
});

const normalisePotionKey = (value: string): string => value
  .trim()
  .replace(/^POTION[_\s-]*/i, "")
  .replace(/[^a-z0-9]+/gi, "_")
  .replace(/^_+|_+$/g, "")
  .toUpperCase();

const potionKeyFromName = (name: string): string | null => {
  const match = name.trim().match(/^(.+?)(?:\s+[IVXLCDM]+)?\s+Potion\b/i);
  return match ? normalisePotionKey(match[1]) : null;
};

export const potionEffectKey = (name: string, rawEffect?: string | null): string | null => {
  const candidates = [rawEffect, potionKeyFromName(name)].filter((value): value is string => Boolean(value));
  return candidates.map(normalisePotionKey).find((key) => key in POTION_COLOURS) ?? null;
};

const potionIconCache = new Map<string, string>();

/** A Minecraft-shaped bottle whose liquid uses the effect colour SkyBlock declares. */
export const potionIconDataUri = (effectKey: string | null): string | null => {
  if (!effectKey) return null;
  const colour = POTION_COLOURS[normalisePotionKey(effectKey)];
  if (!colour) return null;
  const cached = potionIconCache.get(colour);
  if (cached) return cached;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><path fill="#1a2028" d="M6 1h4v1h1v3h1v1h1v7h-1v1H4v-1H3V6h1V5h1V2h1z"/><path fill="#dbe7ee" d="M7 2h2v1H7zm-1 2h4v2H6z"/><path fill="#71808d" d="M5 5h2v1H5zm5 0h1v1h-1zM4 7h1v5h1v1H5v-1H4z"/><path fill="${colour}" d="M5 8h6v4h-1v1H6v-1H5z"/><path fill="#ffffff" fill-opacity=".42" d="M5 7h2v1H5zm1 2h1v2H6z"/><path fill="#000000" fill-opacity=".28" d="M10 9h1v3h-1zm-3 3h3v1H7z"/><path fill="#c8d4dc" d="M6 6h4v1H6z"/></svg>`;
  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  potionIconCache.set(colour, uri);
  return uri;
};
