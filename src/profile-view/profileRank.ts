/**
 * The small, verified projection used by the Profile-family identity header.
 *
 * The site does not currently receive a Hypixel player payload from its
 * allowlisted hosted transport, so callers should pass `null` until one is
 * available.  Keeping the parser pure means a future player endpoint can be
 * wired in without teaching four page shells how to guess at rank data.
 */

export type HypixelNetworkRankKey =
  | "VIP"
  | "VIP_PLUS"
  | "MVP"
  | "MVP_PLUS"
  | "SUPERSTAR"
  | "YOUTUBE"
  | "GAME_MASTER"
  | "PIG"
  | "MOJANG"
  | "HELPER"
  | "MODERATOR"
  | "ADMIN"
  | "BUILD_TEAM"
  | "EVENT"
  | "OWNER";

export interface HypixelNetworkRank {
  key: HypixelNetworkRankKey;
  label: string;
  color: string;
  plusColor: string | null;
}

type RankPayload = Record<string, unknown>;

const RANK_LABELS: Readonly<Record<HypixelNetworkRankKey, string>> = {
  VIP: "VIP",
  VIP_PLUS: "VIP+",
  MVP: "MVP",
  MVP_PLUS: "MVP+",
  SUPERSTAR: "MVP++",
  YOUTUBE: "YouTube",
  GAME_MASTER: "GM",
  PIG: "PIG++",
  MOJANG: "Mojang",
  HELPER: "HELPER",
  MODERATOR: "MOD",
  ADMIN: "ADMIN",
  BUILD_TEAM: "BUILD TEAM",
  EVENT: "EVENT",
  OWNER: "OWNER",
};

/* Minecraft's rank colours, kept as fixed game values rather than theme tokens. */
const RANK_COLORS: Readonly<Record<HypixelNetworkRankKey, string>> = {
  VIP: "#55ff55",
  VIP_PLUS: "#55ff55",
  MVP: "#55ffff",
  MVP_PLUS: "#55ffff",
  SUPERSTAR: "#ffaa00",
  YOUTUBE: "#ff5555",
  GAME_MASTER: "#00aa00",
  PIG: "#ff55ff",
  MOJANG: "#aa0000",
  HELPER: "#55ffff",
  MODERATOR: "#00aa00",
  ADMIN: "#ff5555",
  BUILD_TEAM: "#ffaa00",
  EVENT: "#55ffff",
  OWNER: "#ff5555",
};

const MINECRAFT_COLORS: Readonly<Record<string, string>> = {
  BLACK: "#000000",
  DARK_BLUE: "#0000aa",
  DARK_GREEN: "#00aa00",
  DARK_AQUA: "#00aaaa",
  DARK_RED: "#aa0000",
  DARK_PURPLE: "#aa00aa",
  GOLD: "#ffaa00",
  GRAY: "#aaaaaa",
  DARK_GRAY: "#555555",
  BLUE: "#5555ff",
  GREEN: "#55ff55",
  AQUA: "#55ffff",
  RED: "#ff5555",
  LIGHT_PURPLE: "#ff55ff",
  YELLOW: "#ffff55",
  WHITE: "#ffffff",
};

/* Hypixel has used both the player-payload spelling and display spelling for
   a few ranks over time. Keep aliases explicit so arbitrary labels never
   reach the identity surface. */
const RANK_ALIASES: Readonly<Record<string, HypixelNetworkRankKey>> = {
  YOUTUBER: "YOUTUBE",
  BUILDER: "BUILD_TEAM",
  BUILDTEAM: "BUILD_TEAM",
};

const isRecord = (value: unknown): value is RankPayload => (
  typeof value === "object" && value !== null && !Array.isArray(value)
);

const asKnownRank = (value: unknown): HypixelNetworkRankKey | null => {
  if (typeof value !== "string") return null;
  const key = value.trim().toUpperCase().replace(/[ -]/g, "_");
  if (key === "NORMAL" || key === "NONE" || key === "NO_RANK" || key === "") return null;
  const canonical = RANK_ALIASES[key] ?? key;
  return Object.prototype.hasOwnProperty.call(RANK_LABELS, canonical)
    ? canonical as HypixelNetworkRankKey
    : null;
};

const colorFromPayload = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  return MINECRAFT_COLORS[value.trim().toUpperCase().replace(/[ -]/g, "_")] ?? null;
};

/**
 * Read a rank only when the payload states a recognised Hypixel rank.
 *
 * Staff `rank` wins when present.  Otherwise the temporary MVP++ package wins
 * over the normal package fields, then `newPackageRank`, then the legacy
 * `packageRank`.  Unknown values are skipped rather than being displayed as a
 * fabricated label or allowing an untrusted colour to reach CSS.
 */
export const readHypixelNetworkRank = (payload: unknown): HypixelNetworkRank | null => {
  if (!isRecord(payload)) return null;

  const rank = asKnownRank(payload.rank);
  const monthly = asKnownRank(payload.monthlyPackageRank);
  const next = asKnownRank(payload.newPackageRank);
  const legacy = asKnownRank(payload.packageRank);
  const key = rank ?? (monthly === "SUPERSTAR" ? monthly : null) ?? next ?? legacy;
  if (!key) return null;

  const monthlyColor = colorFromPayload(payload.monthlyRankColor);
  const plusColor = key === "SUPERSTAR"
    ? colorFromPayload(payload.rankPlusColor) ?? RANK_COLORS[key]
    : (key === "VIP_PLUS" || key === "MVP_PLUS")
      ? colorFromPayload(payload.rankPlusColor)
      : null;

  return {
    key,
    label: RANK_LABELS[key],
    color: key === "SUPERSTAR" ? monthlyColor ?? RANK_COLORS[key] : RANK_COLORS[key],
    plusColor,
  };
};
