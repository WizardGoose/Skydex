import { describe, it, expect } from "vitest";
import { classifyFromWikitext, eventKeyFromWikitext, obtainRegion, resolveSource } from "../sources";

/**
 * Source classification.
 *
 * These rules are the part of the page most likely to be quietly wrong, because
 * they read prose written by hundreds of different editors and turn it into a
 * one-word claim. So the tests are weighted towards the two failure modes that
 * matter rather than towards coverage of the happy path:
 *
 *   a confident wrong answer   the worst outcome. A player told to farm a mob
 *                              for a quest reward loses an evening.
 *   priority collisions        an item that matches several rules must land on
 *                              the most specific one, every time.
 */

const infobox = (source: string) => `{{Infobox item\n|name = Thing\n|obtain = ${source}\n}}`;

describe("classifyFromWikitext", () => {
  it("recognises each category from the phrasing editors actually use", () => {
    expect(classifyFromWikitext(infobox("Bought at the Dark Auction"))).toBe("darkAuction");
    expect(classifyFromWikitext(infobox("Reward from the Rat quest"))).toBe("quest");
    expect(classifyFromWikitext(infobox("Obtained during the Spooky Festival"))).toBe("event");
    expect(classifyFromWikitext(infobox("Dropped by Zealots"))).toBe("mobDrop");
    expect(classifyFromWikitext(infobox("Sold by the Adventurer"))).toBe("shop");
  });

  it("reads an Obtaining section as well as an infobox field", () => {
    const article = `{{Infobox item\n|name = Thing\n}}\n\n== Obtaining ==\nThis is dropped by Enderman.\n`;
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });

  it("puts the Dark Auction ahead of the generic shop rule", () => {
    // Matches both "auction" and "bought". The venue is the specific claim.
    expect(classifyFromWikitext(infobox("Bought at the Dark Auction for coins"))).toBe("darkAuction");
  });

  it("puts a quest ahead of a shop when an NPC is involved in both", () => {
    expect(classifyFromWikitext(infobox("Given by an NPC at the end of the quest line"))).toBe("quest");
  });

  it("puts an event ahead of the drop and shop rules", () => {
    // Event items are usually also dropped or sold DURING the event, and the
    // event is the thing that actually gates you.
    expect(classifyFromWikitext(infobox("Dropped during the Spooky Festival"))).toBe("event");
    expect(classifyFromWikitext(infobox("Sold by a merchant at the Travelling Zoo"))).toBe("event");
  });

  it("puts an event-exclusive merchant in Events", () => {
    /*
     * Witch's Ring: the event declaration lives in the page lead while the
     * machine-readable merchant field and Obtaining section both name Agnes.
     * The event is the gate, so the merchant must not turn it into an ordinary
     * shop accessory.
    */
    const article =
      `{{Exclusive|Year/Witch}}\n` +
      `{{Infobox/Accessory\n|id = WITCH_RING\n|merchant = Agnes\n}}\n` +
      `A '''Witch's Ring''' is only obtainable during the [[Year of the Witch]].\n\n` +
      `== Obtaining ==\nA Witch's Ring can be purchased from [[Agnes]].\n`;
    expect(classifyFromWikitext(article)).toBe("event");
  });

  it("keeps an Anniversary legacy accessory in Events", () => {
    // Sloth Hat of Celebration: unobtainable now, but its acquisition family
    // is still the anniversary event rather than an unmeasured generic gate.
    const article =
      `{{Legacy Item}}\n` +
      `The '''Sloth Hat of Celebration''' was given out during the 4th ` +
      `[[SkyBlock Anniversary]].\n\n` +
      `== Obtaining ==\nIt was distributed by [[Simon]] during the anniversary.\n`;
    expect(classifyFromWikitext(article)).toBe("event");
  });

  it("refuses to classify when nothing matches", () => {
    // Null, not a guess. The page renders this as See wiki.
    expect(classifyFromWikitext(infobox("A mysterious trinket of unknown origin"))).toBeNull();
    expect(classifyFromWikitext("")).toBeNull();
    expect(classifyFromWikitext("   ")).toBeNull();
  });

  it("does not read a denial as a shop listing", () => {
    // The exact reason the shop pattern is a phrase rather than the word
    // "shop": this sentence says the opposite of what a bare match implies.
    const article = `{{Infobox item\n|name = Thing\n|obtain = Untradeable\n}}\n\n== Obtaining ==\nThis item cannot be sold in any shop and has no recipe.\n`;
    expect(classifyFromWikitext(article)).toBeNull();
  });

  it("ignores prose outside the obtaining region when one exists", () => {
    // A trivia mention of the Dark Auction must not outrank the real source.
    const article =
      `{{Infobox item\n|name = Thing\n|obtain = Dropped by Wolves\n}}\n\n` +
      `== Trivia ==\nIt was once available at the Dark Auction.\n`;
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });
});

describe("regressions worth keeping", () => {
  it("reads an Obtaining section that runs to the end of the article", () => {
    /*
     * The bug this pins: the section extractor used to end its capture with a
     * `\Z` lookahead, which JavaScript does not have as an anchor, so a final
     * section never matched. Nearly every accessory article ends with its
     * source information, so this one mistake left most of the catalogue
     * unclassified while looking like an honest "we do not know".
     */
    const article = `{{Infobox item\n|name = Thing\n}}\n\n== Obtaining ==\nDropped by Zealots.`;
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });

  it("reads a middle section too, not just the last one", () => {
    const article =
      `{{Infobox item\n|name = Thing\n}}\n\n== Obtaining ==\nSold by the Adventurer.\n\n== Trivia ==\nSomething else.\n`;
    expect(classifyFromWikitext(article)).toBe("shop");
  });

  it("reads the obtaining infobox field, not only obtain", () => {
    // Live articles use several spellings of this field.
    expect(classifyFromWikitext(`{{Infobox item\n|obtaining = Dropped by Wolves\n}}`)).toBe("mobDrop");
  });

  it("reads a subsection heading as the answer when the body is only a template", () => {
    /*
     * Wolf Talisman, verbatim in shape. The Obtaining section's own body is
     * empty because a subsection follows it immediately, and that subsection's
     * body is a single template with no prose in it at all. The heading is the
     * only human-readable claim on the page, and it is a perfectly good one.
     */
    const article =
      `{{Infobox/Accessory\n|id = WOLF_TALISMAN\n}}\n\n== Obtaining ==\n=== Mob Drops ===\n{{Drop Sources}}\n\n== Usage ==\n=== Crafting ===\n{{Crafting Usage}}\n`;
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });

  it("matches the plural headings editors actually write", () => {
    // "Mob Drops", not "mob drop". A trailing word boundary after the singular
    // silently fails on the plural, which is how this was wrong before.
    expect(classifyFromWikitext(`== Obtaining ==\n=== Mob Drops ===\n{{Drop Sources}}`)).toBe("mobDrop");
    expect(classifyFromWikitext(`== Obtaining ==\n=== Shop Purchase ===\nFrom an NPC.`)).toBe("shop");
  });

  it("reads a structured merchant field as a shop when no specific gate is present", () => {
    // An editor filling in |merchant = is making a machine-readable claim,
    // but event, Dark Auction and quest evidence still outrank it.
    const article = `{{Infobox/Accessory\n|id = JUNK_TALISMAN\n|merchant = Junker Joel\n|buy = 32 Rusty Coin\n}}\nSome prose.`;
    expect(classifyFromWikitext(article)).toBe("shop");
  });

  it("does not read an empty merchant field as a shop", () => {
    expect(classifyFromWikitext(`{{Infobox/Accessory\n|merchant = none\n}}\nSome prose.`)).toBeNull();
  });

  it("keeps a subsection with its parent rather than treating it as a sibling", () => {
    // The Usage section's Crafting subsection must not leak into Obtaining.
    const article =
      `== Obtaining ==\n=== Mob Drops ===\n{{Drop Sources}}\n\n== Usage ==\n=== Shop Purchase ===\nSold by someone.\n`;
    // Mob drop, from the Obtaining section, not shop from the Usage one.
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });

  it("is not misled by a denial in any category", () => {
    const denials = [
      "This item cannot be sold in any shop.",
      "It is not dropped by any mob.",
      "This is no longer obtainable from the Dark Auction.",
      "It cannot be purchased from a merchant.",
    ];
    for (const line of denials) {
      expect(classifyFromWikitext(`{{Infobox item\n}}\n\n== Obtaining ==\n${line}\n`)).toBeNull();
    }
  });

  it("still classifies a real source sitting beside a denial", () => {
    const article =
      `{{Infobox item\n}}\n\n== Obtaining ==\nDropped by Zealots. It cannot be sold in any shop.\n`;
    // The denial is dropped, the real claim survives.
    expect(classifyFromWikitext(article)).toBe("mobDrop");
  });
});

describe("eventKeyFromWikitext", () => {
  it("names each fixed-window event from the phrasing editors actually use", () => {
    expect(eventKeyFromWikitext(infobox("Obtained during the Spooky Festival"))).toBe("spookyFestival");
    expect(eventKeyFromWikitext(infobox("Traded from the Fear Mongerer"))).toBe("spookyFestival");
    expect(eventKeyFromWikitext(infobox("A reward from the Season of Jerry"))).toBe("seasonOfJerry");
    expect(eventKeyFromWikitext(infobox("Bought at Jerry's Workshop"))).toBe("jerryWorkshop");
    expect(eventKeyFromWikitext(infobox("Found on the Winter Island"))).toBe("jerryWorkshop");
    expect(eventKeyFromWikitext(infobox("Claimed during the New Year Celebration"))).toBe("newYear");
    expect(eventKeyFromWikitext(infobox("Sold by Oringo at the Traveling Zoo"))).toBe("travelingZoo");
  });

  it("puts the Season of Jerry ahead of the workshop that hosts it", () => {
    // "Season of Jerry" also matches nothing about the workshop, but an
    // article can name both; the more specific event wins.
    expect(
      eventKeyFromWikitext(infobox("During the Season of Jerry at Jerry's Workshop"))
    ).toBe("seasonOfJerry");
  });

  it("maps an off-calendar or unnameable event to unknown, never to a window", () => {
    // Hypixel schedules these by announcement, so no instant of the calendar
    // makes them live, and an unknown key never lights a border.
    expect(eventKeyFromWikitext(infobox("Obtained during the Great Spook"))).toBe("unknown");
    expect(eventKeyFromWikitext(infobox("Sold while a Mining Fiesta is active"))).toBe("unknown");
    expect(eventKeyFromWikitext(infobox("An event reward of some kind"))).toBe("unknown");
  });
});

describe("obtainRegion", () => {
  it("narrows to the infobox field when there is one", () => {
    expect(obtainRegion(infobox("Dropped by Wolves"))).toContain("Dropped by Wolves");
    expect(obtainRegion(infobox("Dropped by Wolves"))).not.toContain("Infobox item");
  });

  it("falls back to the whole article when it recognises no region", () => {
    // Better a broad look than none, and a miss still ends at See wiki.
    const text = "Just some prose with no infobox and no headings.";
    expect(obtainRegion(text)).toBe(text);
  });
});

describe("resolveSource", () => {
  it("lets craftable win outright, without consulting the wiki", () => {
    // A recipe in the index is a fact we hold, not a keyword we matched.
    expect(resolveSource(true, "mobDrop")).toBe("craftable");
    expect(resolveSource(true, null)).toBe("craftable");
  });

  it("uses the wiki's answer when there is no recipe", () => {
    expect(resolveSource(false, "quest")).toBe("quest");
  });

  it("falls back to see-wiki rather than inventing a category", () => {
    expect(resolveSource(false, null)).toBe("wiki");
    expect(resolveSource(false, undefined)).toBe("wiki");
  });
});
