import SHARD_DESCRIPTIONS from "../desc.json";
import { currentAccess, writeAccess } from "../island/apiKey";
import { fetchProfileMembers, resolveAccount } from "../island/hypixel";
import type { ApiFailure, HypixelAccount, ProfileMember } from "../island/hypixel";

/**
 * Importing a player's shards and attributes off the Hypixel API.
 *
 * WHY THIS FILE REPLACED A ONE-LINE FETCH
 * ---------------------------------------
 * The import used to be a single call to `api.skyshards.com/skyshards/profile/
 * <username>`, which read the Hypixel API on our behalf using somebody else's
 * key. That worked in `pnpm run dev` and only there: the Vite dev proxy made it
 * same-origin, and a static build has no proxy. api.skyshards.com sends no
 * `Access-Control-Allow-Origin` on either the GET or the preflight, and it sets
 * `Access-Control-Allow-Credentials: true`, so a wildcard could never have
 * applied either. In a deployed build the browser simply discarded the answer.
 *
 * The import now uses the shared request boundary in `island/hypixel.ts`.
 * Production sends the request through Skydex's narrow same-origin Worker;
 * local development can still call Hypixel directly with the developer's own
 * key. Nothing here sees a URL or header. It is handed already-fetched member
 * objects and turns them into shard counts.
 *
 * WHAT IS ON THE WIRE, AND WHAT IS NOT
 * ------------------------------------
 * Every field read here was traced against a real authenticated dump of a
 * live account, recorded in `docs/hypixel-api-cheatsheet.md`:
 *
 *   member.shards.owned[]       array of `{type, amount_owned, captured}`.
 *                               `type` is the bare shard id (`SPHINX`), NOT the
 *                               bazaar-style `SHARD_SPHINX` our dataset stores
 *                               in `internal_id`, which is why both forms are
 *                               normalised before matching.
 *   member.attributes.stacks    flat map of attribute id to int. The attribute
 *                               id is the `id` field each shard carries in
 *                               `src/desc.json` (`decent_karma`), and the value
 *                               is the per-shard fused count.
 *
 *   last_save                   NOT PRESENT. The v2 profiles payload has no
 *                               such field, at profile level or on the member;
 *                               the only `last_save` anywhere in the dump
 *                               belongs to the garden endpoint. The old
 *                               skyshards response carried one and the modal
 *                               sorted by it, so the field is kept in the shape
 *                               and reported as 0, which the modal already
 *                               renders as "Unknown". Ordering falls back to
 *                               Hypixel's own `selected` flag, which is real.
 *
 * Nothing here invents a number. A field we cannot read is reported absent and
 * the caller is expected to say so out loud rather than write a confident zero
 * over something the player typed in by hand.
 */

/* -------------------------------------------------------------------------- */
/* The shape the calculator's modal consumes                                  */
/* -------------------------------------------------------------------------- */

export interface ShardOwned {
  /** Our own shard key, e.g. `C35`. */
  id: string;
  name: string;
  amount: number;
  rarity: string;
}

export interface AttributeOwned {
  /** Our own shard key, e.g. `C35`. Attributes are 1:1 with shards. */
  id: string;
  name: string;
  /** How many of that shard have been fused into the attribute. */
  level: number;
}

export interface ProfileSummary {
  profile_id: string;
  cute_name: string;
  game_mode: string | null;
  /**
   * Always 0. Hypixel's v2 profiles payload does not carry a save timestamp -
   * see the note at the top of this file. Kept so the modal's date column has
   * something to render ("Unknown") rather than being torn out.
   */
  last_save: number;
  selected: boolean;
}

export interface ProfileData {
  profile: ProfileSummary;
  shards: ShardOwned[];
  attributes: AttributeOwned[];
  /**
   * False when Hypixel sent no `attributes.stacks` for this member at all.
   *
   * This is the difference between "you have fused nothing" and "we could not
   * read your fusions", and it decides whether the caller is allowed to
   * overwrite the player's own attribute numbers. An empty list with this flag
   * false must never be written over hand-entered data.
   */
  attributesRead: boolean;
  /** Shard ids Hypixel sent that our dataset does not know. Usually 0. */
  unmappedShards: number;
}

export interface HypixelProfileResponse {
  username: string;
  uuid: string;
  profiles: ProfileData[];
  selected_profile_id: string | null;
}

/* -------------------------------------------------------------------------- */
/* Reading a member, kept pure so it can be tested without a network           */
/* -------------------------------------------------------------------------- */

/** The slice of the shard dataset this module needs. `ShardWithKey` satisfies it. */
export interface ShardCatalogueEntry {
  key: string;
  name: string;
  rarity: string;
  internal_id: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * One spelling for a shard id.
 *
 * Our dataset stores `SHARD_SPHINX` (the bazaar product id); the profile
 * payload sends `SPHINX`. Stripping the prefix off both sides is safe here and
 * checked by a test: all 189 `internal_id`s carry the prefix and all 189 are
 * still unique without it, so the collapse cannot merge two shards.
 */
export const normaliseShardId = (id: string): string => id.trim().toUpperCase().replace(/^SHARD_/, "");

/**
 * Read a count the way `island/hypixel.ts` reads sack counts, and for the same
 * reason: `Number(null)`, `Number("")` and `Number([])` are all 0, so a blanket
 * `Number()` turns a broken field into a confident zero rather than dropping it.
 */
const readCount = (raw: unknown): number | null => {
  let n: number;
  if (typeof raw === "number") n = raw;
  else if (typeof raw === "string" && raw.trim() !== "") n = Number(raw);
  else return null;
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
};

export interface ShardsRead {
  shards: ShardOwned[];
  /** Ids Hypixel sent that the dataset has no entry for. */
  unmapped: number;
}

/**
 * Pull shard counts off a member.
 *
 * A malformed entry is skipped rather than failing the read, on the same
 * principle as `parseProfiles`: one bad row must not cost the player the rest
 * of their inventory.
 */
export function readShardsOwned(member: unknown, catalogue: ShardCatalogueEntry[]): ShardsRead {
  const out: ShardOwned[] = [];
  let unmapped = 0;

  if (!isObject(member)) return { shards: out, unmapped };
  const shards = isObject(member.shards) ? member.shards : null;
  if (!shards || !Array.isArray(shards.owned)) return { shards: out, unmapped };

  const byId = new Map<string, ShardCatalogueEntry>();
  for (const entry of catalogue) {
    if (entry?.internal_id) byId.set(normaliseShardId(entry.internal_id), entry);
  }

  for (const raw of shards.owned) {
    if (!isObject(raw)) continue;
    if (typeof raw.type !== "string" || raw.type.trim() === "") continue;
    const amount = readCount(raw.amount_owned);
    if (amount === null) continue;

    const shard = byId.get(normaliseShardId(raw.type));
    if (!shard) {
      // A shard Hypixel has and we have not - a game update landing before a
      // dataset refresh. Counted rather than swallowed, so the UI can admit it.
      unmapped += 1;
      continue;
    }
    out.push({ id: shard.key, name: shard.name, amount, rarity: shard.rarity });
  }

  return { shards: out, unmapped };
}

/** attribute id (`decent_karma`) to our shard key (`C35`), built once from desc.json. */
const ATTRIBUTE_TO_SHARD_KEY: Record<string, { key: string; title: string }> = (() => {
  const out: Record<string, { key: string; title: string }> = {};
  const table = SHARD_DESCRIPTIONS as unknown as Record<string, { title?: string; id?: string }>;
  for (const [key, desc] of Object.entries(table)) {
    if (desc && typeof desc.id === "string" && desc.id) {
      out[desc.id] = { key, title: typeof desc.title === "string" ? desc.title : key };
    }
  }
  return out;
})();

/**
 * Pull per-shard fused counts off a member.
 *
 * Returns `null`, not `[]`, when `attributes.stacks` is absent. That is the
 * whole point: an empty array means "fused nothing", null means "could not
 * read", and only one of those is safe to write over a player's own numbers.
 *
 * The values are shard counts, not tier levels. Verified against the recorded
 * dump: the sampled entries are 3, 38, 6, 48, 17 and 8, every one of them at or
 * under the rarity cap in `MAX_QUANTITIES` for the shard it belongs to, and
 * `atomized_mithril` sits at exactly 48, the rare cap. Tier levels only run to
 * 10, so these cannot be tiers.
 */
export function readAttributesOwned(member: unknown): AttributeOwned[] | null {
  if (!isObject(member)) return null;
  const attributes = isObject(member.attributes) ? member.attributes : null;
  if (!attributes || !isObject(attributes.stacks)) return null;

  const out: AttributeOwned[] = [];
  for (const [attrId, raw] of Object.entries(attributes.stacks)) {
    const mapped = ATTRIBUTE_TO_SHARD_KEY[attrId];
    if (!mapped) continue;
    const level = readCount(raw);
    if (level === null) continue;
    out.push({ id: mapped.key, name: mapped.title, level });
  }
  return out;
}

/** Turn one fetched member into the shape the modal reads. */
export function toProfileData(entry: ProfileMember, catalogue: ShardCatalogueEntry[]): ProfileData {
  const { shards, unmapped } = readShardsOwned(entry.member, catalogue);
  const attributes = readAttributesOwned(entry.member);

  return {
    profile: {
      profile_id: entry.profileId,
      cute_name: entry.cuteName,
      game_mode: entry.gameMode,
      last_save: 0,
      selected: entry.selected,
    },
    shards,
    attributes: attributes ?? [],
    attributesRead: attributes !== null,
    unmappedShards: unmapped,
  };
}

/* -------------------------------------------------------------------------- */
/* The one orchestrated import                                                */
/* -------------------------------------------------------------------------- */

export type ImportFailure = ApiFailure;

export interface ImportError {
  reason: ImportFailure;
  message: string;
}

export type ImportResult =
  | { ok: true; value: HypixelProfileResponse }
  | { ok: false; error: ImportError };

/**
 * Import one player's shards and attributes.
 *
 * The catalogue is passed in rather than fetched, because the calculator has
 * already loaded it through `useShards` and a second copy would be a second
 * source of truth for what a shard key means.
 */
export async function importPlayerProfile(
  username: string,
  catalogue: ShardCatalogueEntry[],
  signal?: AbortSignal
): Promise<ImportResult> {
  const access = currentAccess();
  const key = access.key.trim();

  const typed = username.trim();
  if (!typed) {
    return { ok: false, error: { reason: "shape", message: "Enter a Minecraft username or UUID." } };
  }

  // The player has already told Settings who they are, so asking a third-party
  // name service the same question again would be a request for nothing.
  let account: HypixelAccount;
  if (access.uuid && access.name && access.name.toLowerCase() === typed.toLowerCase()) {
    account = { uuid: access.uuid, name: access.name };
  } else {
    const resolved = await resolveAccount(typed, signal);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    account = resolved.value;
  }

  const members = await fetchProfileMembers(account, key, signal);
  if (!members.ok) return { ok: false, error: members.error };
  writeAccess({ keyState: "valid", checkedAt: members.fetchedAt ?? Date.now() });

  const profiles = members.value.map((entry) => toProfileData(entry, catalogue));

  return {
    ok: true,
    value: {
      // A pasted uuid resolves with an empty name; fall back to what was typed
      // rather than showing a blank in "imported from".
      username: account.name || typed,
      uuid: account.uuid,
      profiles,
      selected_profile_id: profiles.find((p) => p.profile.selected)?.profile.profile_id ?? null,
    },
  };
}
