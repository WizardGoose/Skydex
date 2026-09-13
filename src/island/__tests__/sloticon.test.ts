import { describe, expect, it } from "vitest";
import { headUrl } from "../heads";
import { chooseIconSource, derivedCandidates } from "../../items/wikiImages";

/**
 * The player-head fallback URL.
 *
 * The endpoint itself was verified empirically against real texture hashes from
 * Hypixel's own item resource before any of this was written, and again from
 * inside the running app so the CORS claim was tested from our real origin
 * rather than from a shell: 200, `image/png`, and two hashes producing two
 * genuinely different images. What is left for a unit test is the part that can
 * silently rot, which is how the URL gets built.
 *
 * The hash is interpolated into a URL, so the guard matters as much as the
 * format. It is enforced in the validator and again here, because a component
 * should not depend on its caller's diligence for that.
 */
describe("headUrl", () => {
  const REAL = "94a02e1a4dcf7a61558c79cdabb4f78ed37ae82f965541b612af088cfcff2b1b";

  it("builds the verified endpoint form", () => {
    expect(headUrl(REAL)).toBe(`https://mc-heads.net/head/${REAL}/64`);
  });

  it("lower-cases the hash so one texture is one URL", () => {
    expect(headUrl(REAL.toUpperCase())).toBe(`https://mc-heads.net/head/${REAL}/64`);
  });

  it("accepts the shorter hashes some textures use", () => {
    const short = "a".repeat(32);
    expect(headUrl(short)).toBe(`https://mc-heads.net/head/${short}/64`);
  });

  it("refuses anything that is not a plain hex hash", () => {
    for (const bad of [
      "",
      "abc",
      "../../../etc/passwd",
      `${REAL}/../../evil`,
      `${REAL}?x=1`,
      `${REAL}#f`,
      "http://evil.example/skin.png",
      "z".repeat(64),
      `${REAL} `,
    ]) {
      expect(headUrl(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("cannot be talked into leaving the host", () => {
    // The only interpolation point is the hash, so a rejected hash is a
    // request that never happens.
    const url = headUrl(REAL);
    expect(url?.startsWith("https://mc-heads.net/head/")).toBe(true);
    expect(headUrl("evil.example/x")).toBeNull();
  });
});

/**
 * What `SlotIcon` is now: `ItemIcon` plus two island decisions.
 *
 * The component used to hand-roll its own two-rung chain because `ItemIcon` had
 * no way to say "try this source LAST". It now delegates, which is what buys
 * island slots the whole ladder. The one thing that delegation must not lose is
 * the ordering the old file existed to protect, so that is what is pinned here,
 * against the shared primitive `ItemIcon` actually resolves with.
 *
 * The stakes are asymmetric and worth stating. mc-heads answers an unknown hash
 * with 200 and a Steve face rather than a 404, so the head rung cannot fail and
 * cannot be recovered from. Reaching it early would mean a licensed, correct
 * wiki icon being replaced by a generic head that no later rung can undo.
 */
describe("island slots keep the head last", () => {
  const REAL = "94a02e1a4dcf7a61558c79cdabb4f78ed37ae82f965541b612af088cfcff2b1b";
  const head = headUrl(REAL) as string;
  const display = "Enchanted Brown Mushroom";
  const wikiRungs = derivedCandidates(display);

  it("has wiki rungs to try before the head", () => {
    expect(wikiRungs.length).toBeGreaterThan(0);
    expect(head).toContain("mc-heads.net");
  });

  it("draws the wiki icon, not the head, while any wiki rung is untried", () => {
    const { current } = chooseIconSource({ display, failed: [], lateSrc: head });
    expect(current).toBe(wikiRungs[0]);
    expect(current).not.toBe(head);
  });

  it("waits rather than showing a head while the wiki lookup is still out", () => {
    // Every cheap rung has failed but the batched lookup has not answered yet.
    // Jumping to a head here would be irreversible, so nothing is drawn.
    const { current, exhausted } = chooseIconSource({
      display,
      failed: [...wikiRungs],
      lateSrc: head,
    });
    expect(exhausted).toBe(true);
    expect(current).toBeNull();
  });

  it("falls to the head only once the wiki has genuinely given up", () => {
    const { current } = chooseIconSource({
      display,
      failed: [],
      lateSrc: head,
      known: () => null,
    });
    expect(current).toBe(head);
  });

  it("prefers a file the wiki found under another name over the head", () => {
    const elsewhere = "https://hypixelskyblock.minecraft.wiki/images/thumb/Golden_Boots.png/64px-Golden_Boots.png";
    const { current } = chooseIconSource({
      display,
      failed: [...wikiRungs],
      lateSrc: head,
      known: () => elsewhere,
    });
    expect(current).toBe(elsewhere);
  });

  it("has no late source at all when the hash is not a hash", () => {
    // `SlotIcon` passes `headUrl(skin) ?? undefined`, so a rejected hash is not
    // a bad request, it is no request.
    const lateSrc = (headUrl("../../evil") ?? undefined) as string | undefined;
    expect(lateSrc).toBeUndefined();

    const { current } = chooseIconSource({ display, failed: [], lateSrc, known: () => null });
    expect(current).toBeNull();
  });
});
