/**
 * Player-head rendering, via mc-heads.net.
 *
 * A large slice of SkyBlock is player_head items with custom skins: pets,
 * Abiphones, much of the decorative catalogue. None of them have a wiki file,
 * so they are exactly the tiles that come out blank, and the texture hash the
 * mod ships as `extra.skin` is the only thing that can draw them.
 *
 * VERIFIED BEFORE IT WAS BUILT ON, TWICE
 * --------------------------------------
 * Against real texture hashes taken from Hypixel's own
 * `/v2/resources/skyblock/items`, first from a shell and then again with a
 * cross-origin `fetch` from the running app so the CORS claim was tested from
 * the origin that actually makes the request:
 *
 *   - `200` with `Content-Type: image/png` and `Access-Control-Allow-Origin: *`
 *   - two different hashes return two genuinely different images, so this is a
 *     real per-hash render and not one shared default
 *
 * One property worth recording: an unrecognised hash returns `200` with the
 * default Steve head rather than a `404`. This step therefore cannot fail, so a
 * corrupt hash shows Steve instead of falling through to a blank tile. That is
 * the right trade for real data, where the hash comes straight from the item's
 * own component. Mojang's `textures.minecraft.net/texture/<hash>` does 404
 * properly and is the alternative if that ever matters, at the cost of cropping
 * an 8x8 face out of a full 64x64 skin sheet.
 *
 * Attribution is in NOTICE.md and in the site footer. It is not required by the
 * service, which is exactly why it is there.
 */

/** Item-head size requested from the service. Matches the wiki's 64px convention. */
const HEAD_PX = 64;

/**
 * Build the head URL for a texture hash, or null if it is not one.
 *
 * The hash is the only interpolated part of this URL, so the guard is the
 * security boundary: a rejected hash is a request that never happens. The
 * validator screens the same value on the way in, and this re-checks rather
 * than trusting a caller to have done it.
 */
export const headUrl = (hash: string): string | null =>
  /^[0-9a-f]{32,64}$/i.test(hash) ? `https://mc-heads.net/head/${hash.toLowerCase()}/${HEAD_PX}` : null;

/** Width requested for the identity render. The service scales height to match. */
const BODY_PX = 64;

/**
 * A full-body skin render for a player UUID, or null if the string is not one.
 *
 * Same service and same verification story as `headUrl` above, different
 * endpoint: `/body/<uuid>` renders the player's current skin standing. Used by
 * the profile page's identity header (the profile
 * page should read like a profile, name and skin first, the way SkyCrypt
 * leads with the player render). The same guard-at-the-URL rule applies: a
 * rejected uuid is a request that never happens, and dashes are stripped
 * rather than trusted because both spellings are in circulation.
 */
export const bodyUrl = (uuid: string): string | null => {
  const plain = uuid.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(plain) ? `https://mc-heads.net/body/${plain}/${BODY_PX}` : null;
};

/**
 * The raw skin PNG for a player UUID, or null if the string is not one.
 *
 * This is the texture the 3D model is built from, so unlike the pre-rendered
 * endpoints above it MUST be CORS-clean or WebGL refuses the texture outright.
 * Verified 2026-08-03 from a real uuid: `200`, `image/png`,
 * `Access-Control-Allow-Origin: *`. Crafatar's equivalent was considered and
 * was answering `521` the day it was tested, so MCHeads carries this too; the
 * provenance and terms are in NOTICE.md with the other endpoints.
 */
export const skinUrl = (uuid: string): string | null => {
  const plain = uuid.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(plain) ? `https://mc-heads.net/skin/${plain}` : null;
};
