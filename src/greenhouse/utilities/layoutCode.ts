const EMPTY_LINK_MESSAGE =
  "That link has a layout slot but nothing in it. Copy the whole link again.";

const scrub = (value: string | null | undefined): string => String(value ?? "").replace(/\s+/g, "");

/**
 * Pull the layout code out of whatever the player pasted.
 *
 * Three shapes have to keep working, because all three are already in the wild:
 *
 *   1. our canonical share path, `.../greenhouse/share/<code>` (plus the older
 *      fragment form, `.../greenhouse#designer?layout=<code>`)
 *   2. the legacy `https://api.skyshards.com/share/<code>` link, which is what
 *      every code shared before we cut that dependency looks like. We no longer
 *      produce these and the host is not ours, but a player pasting one should
 *      get their layout rather than an error, so the shape stays understood.
 *   3. a bare code, which is what you get when someone copies the tail of a
 *      link out of a message.
 *
 * A link carrying an empty `layout` is called out rather than falling through.
 * The old code returned the entire URL as if it were a raw code, so the player
 * got a base64 complaint about a string that was visibly a link.
 */
export function extractLayoutCode(input: string | null | undefined): string {
  const clean = scrub(input);
  if (!clean) return "";

  if (/[?#&]layout=/.test(clean)) {
    let param: string | null = null;
    try {
      param = new URL(clean).searchParams.get("layout");
    } catch {
      // Relative links do not have an origin, so parse their query directly.
    }
    if (param === null) {
      const match = clean.match(/[?#&]layout=([^&#]*)/);
      param = match ? match[1] : null;
    }
    if (param) return param;
    throw new Error(EMPTY_LINK_MESSAGE);
  }

  const shareMatch = clean.match(/\/share\/([^/?#]+)/);
  if (shareMatch) return shareMatch[1];

  return clean;
}
